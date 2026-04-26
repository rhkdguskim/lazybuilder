import { createEmptySnapshot, type EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import { DotnetDetector } from '../infrastructure/detectors/DotnetDetector.js';
import { VisualStudioDetector } from '../infrastructure/detectors/VisualStudioDetector.js';
import { MsBuildDetector } from '../infrastructure/detectors/MsBuildDetector.js';
import { CppToolchainDetector } from '../infrastructure/detectors/CppToolchainDetector.js';
import { WindowsSdkDetector } from '../infrastructure/detectors/WindowsSdkDetector.js';
import { CMakeDetector } from '../infrastructure/detectors/CMakeDetector.js';
import { PackageManagerDetector } from '../infrastructure/detectors/PackageManagerDetector.js';
import { runCommand } from '../infrastructure/process/ProcessRunner.js';
import { TIMEOUTS } from '../config/timeouts.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';
import { hostname, userInfo } from 'node:os';

const log = logger.child({ component: 'EnvironmentService' });

/** Failure surfaced when a detector throws or exceeds its budget. */
export interface DetectorFailure {
  detector: string;
  reason: 'timeout' | 'error';
  message: string;
  durationMs: number;
}

class DetectorTimeoutError extends Error {
  constructor(detector: string, ms: number) {
    super(`${detector} exceeded ${ms}ms budget`);
    this.name = 'DetectorTimeoutError';
  }
}

/**
 * Run a detector with a hard time budget.
 * Resolves to either the detector's value, or a structured failure (never throws).
 */
async function runDetector<T>(
  name: string,
  fn: () => Promise<T>,
  budgetMs: number = TIMEOUTS.DETECTOR_BUDGET,
): Promise<{ ok: true; value: T } | { ok: false; failure: DetectorFailure }> {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    const value = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new DetectorTimeoutError(name, budgetMs)), budgetMs);
      }),
    ]);
    return { ok: true, value };
  } catch (err) {
    const durationMs = Date.now() - start;
    const isTimeout = err instanceof DetectorTimeoutError;
    log.warn('detector failed', {
      detector: name,
      reason: isTimeout ? 'timeout' : 'error',
      durationMs,
      ...errToLog(err),
    });
    return {
      ok: false,
      failure: {
        detector: name,
        reason: isTimeout ? 'timeout' : 'error',
        message: err instanceof Error ? err.message : String(err),
        durationMs,
      },
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface EnvironmentScanResult {
  snapshot: EnvironmentSnapshot;
  failures: DetectorFailure[];
}

export class EnvironmentService {
  /**
   * Backwards-compatible shape: returns just the snapshot.
   * Use `scanWithDiagnostics()` to also receive per-detector failures.
   */
  async scan(): Promise<EnvironmentSnapshot> {
    const { snapshot } = await this.scanWithDiagnostics();
    return snapshot;
  }

  async scanWithDiagnostics(): Promise<EnvironmentScanResult> {
    const snapshot = createEmptySnapshot();
    const failures: DetectorFailure[] = [];

    // System info (synchronous)
    snapshot.os = {
      name: process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux',
      version: process.version,
      arch: process.arch,
    };
    snapshot.shell = process.env['SHELL'] ?? process.env['ComSpec'] ?? 'unknown';
    snapshot.cwd = process.cwd();
    snapshot.hostname = hostname();
    snapshot.username = userInfo().username;

    // Git branch — best-effort, never blocks boot
    const gitResult = await runCommand('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { timeout: TIMEOUTS.QUICK_PROBE });
    snapshot.gitBranch = gitResult.exitCode === 0 ? gitResult.stdout.trim() : null;

    // Phase 1: VS detection (others depend on its installations list)
    const vsOutcome = await runDetector('VisualStudio', () => new VisualStudioDetector().detect());
    if (vsOutcome.ok) {
      Object.assign(snapshot.visualStudio, vsOutcome.value.visualStudio);
    } else {
      failures.push(vsOutcome.failure);
    }
    const vsInstallations = snapshot.visualStudio.installations;

    // Phase 2: All other detectors in parallel, each individually budgeted
    const [dotnetR, msbuildR, cppR, winSdkR, cmakeR, pkgR] = await Promise.all([
      runDetector('Dotnet', () => new DotnetDetector().detect()),
      runDetector('MsBuild', () => new MsBuildDetector().detect(vsInstallations)),
      runDetector('CppToolchain', () => new CppToolchainDetector().detect(vsInstallations)),
      runDetector('WindowsSdk', () => new WindowsSdkDetector().detect()),
      runDetector('CMake', () => new CMakeDetector().detect()),
      runDetector('PackageManager', () => new PackageManagerDetector().detect()),
    ]);

    if (dotnetR.ok && dotnetR.value.dotnet) snapshot.dotnet = dotnetR.value.dotnet;
    else if (!dotnetR.ok) failures.push(dotnetR.failure);

    if (msbuildR.ok && msbuildR.value.msbuild) snapshot.msbuild = msbuildR.value.msbuild;
    else if (!msbuildR.ok) failures.push(msbuildR.failure);

    if (cppR.ok && cppR.value.cpp) snapshot.cpp = cppR.value.cpp;
    else if (!cppR.ok) failures.push(cppR.failure);

    if (winSdkR.ok && winSdkR.value.windowsSdk) snapshot.windowsSdk = winSdkR.value.windowsSdk;
    else if (!winSdkR.ok) failures.push(winSdkR.failure);

    if (cmakeR.ok) {
      snapshot.cmake = cmakeR.value.cmake ?? null;
      snapshot.ninja = cmakeR.value.ninja ?? null;
    } else {
      failures.push(cmakeR.failure);
    }

    if (pkgR.ok) {
      snapshot.packageManagers = pkgR.value.packageManagers ?? snapshot.packageManagers;
      snapshot.git = pkgR.value.git ?? null;
      snapshot.powershell = pkgR.value.powershell ?? null;
    } else {
      failures.push(pkgR.failure);
    }

    if (failures.length > 0) {
      log.info('scan completed with failures', { failureCount: failures.length });
    } else {
      log.debug('scan completed cleanly');
    }

    return { snapshot, failures };
  }
}
