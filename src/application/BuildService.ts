import type { BuildProfile } from '../domain/models/BuildProfile.js';
import type { BuildResult } from '../domain/models/BuildResult.js';
import type { ProjectInfo } from '../domain/models/ProjectInfo.js';
import type { EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import type { HardwareInfo } from '../domain/models/HardwareInfo.js';
import type { BuildMetric, BuildMetricStatus } from '../domain/models/BuildMetric.js';
import type { BuildAdapter, ResolvedCommand } from '../infrastructure/adapters/BuildAdapter.js';
import { DotnetAdapter } from '../infrastructure/adapters/DotnetAdapter.js';
import { MsBuildAdapter } from '../infrastructure/adapters/MsBuildAdapter.js';
import { CppMsBuildAdapter } from '../infrastructure/adapters/CppMsBuildAdapter.js';
import { CMakeAdapter } from '../infrastructure/adapters/CMakeAdapter.js';
import { ProcessRunner, runCommand } from '../infrastructure/process/ProcessRunner.js';
import { DevShellRunner, findDevShellPath, findBestInstallation } from '../infrastructure/process/DevShellRunner.js';
import { MsBuildOutputParser } from '../infrastructure/parsers/MsBuildOutputParser.js';
import { DotnetOutputParser } from '../infrastructure/parsers/DotnetOutputParser.js';
import { CMakeOutputParser } from '../infrastructure/parsers/CMakeOutputParser.js';
import { detectHardware } from '../infrastructure/system/HardwareDetector.js';
import type { LogEntry } from '../domain/models/LogEntry.js';
import { BuildIntelligenceService } from './BuildIntelligenceService.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';

const buildLog = logger.child({ component: 'BuildService' });

export class BuildService {
  private adapters: BuildAdapter[];
  private currentRunner: ProcessRunner | null = null;
  private logIndex = 0;
  readonly hardware: HardwareInfo;

  constructor(snapshot?: EnvironmentSnapshot, hardware?: HardwareInfo) {
    const msbuildPath = snapshot?.msbuild.selectedPath ?? undefined;
    this.hardware = hardware ?? detectHardware();
    this.adapters = [
      new CppMsBuildAdapter(msbuildPath, this.hardware),  // Check C++ first (more specific)
      new DotnetAdapter(this.hardware),
      new MsBuildAdapter(msbuildPath, this.hardware),
      new CMakeAdapter(this.hardware),
    ];
  }

  getAdapter(project: ProjectInfo): BuildAdapter | null {
    return this.adapters.find(a => a.canHandle(project)) ?? null;
  }

  resolveCommand(project: ProjectInfo, profile: BuildProfile): ResolvedCommand | null {
    const adapter = this.getAdapter(project);
    return adapter?.resolveCommand(project, profile) ?? null;
  }

  async execute(
    project: ProjectInfo,
    profile: BuildProfile,
    snapshot: EnvironmentSnapshot,
    onLogEntry: (entry: LogEntry) => void,
  ): Promise<BuildResult> {
    const adapter = this.getAdapter(project);
    if (!adapter) {
      throw new Error(`No adapter found for project type: ${project.projectType}`);
    }

    const resolved = adapter.resolveCommand(project, profile);
    const startTime = new Date();
    this.logIndex = 0;

    // Use the directory of the target file as working directory
    const { dirname } = await import('node:path');
    const workingDir = dirname(profile.targetPath);

    // Select parser
    const parser = project.buildSystem === 'cmake'
      ? new CMakeOutputParser()
      : project.buildSystem === 'dotnet'
        ? new DotnetOutputParser()
        : new MsBuildOutputParser();

    // Log the full build command
    onLogEntry({
      index: this.logIndex++,
      timestamp: Date.now(),
      level: 'info',
      text: `> ${resolved.displayString}`,
      source: 'stdout',
    });
    onLogEntry({
      index: this.logIndex++,
      timestamp: Date.now(),
      level: 'info',
      text: `  Working directory: ${workingDir}`,
      source: 'stdout',
    });

    // Determine if Developer Shell is needed
    // C++ projects (vcxproj) always need DevShell for INCLUDE/LIB paths
    const needsDevShell = resolved.requiresDevShell
      || project.projectType === 'cpp-msbuild'
      || project.buildSystem === 'msbuild';

    // Create runner
    let runner: ProcessRunner;
    if (needsDevShell && snapshot.visualStudio.installations.length > 0) {
      // Find the best VS installation for this project's toolset
      const bestVs = findBestInstallation(
        snapshot.visualStudio.installations,
        project.platformToolset,
      );

      const devShell = bestVs ? findDevShellPath(bestVs) : null;
      const archArg = profile.platform === 'x86' || profile.platform === 'Win32' ? 'x86' : 'x64';

      if (devShell) {
        const devRunner = new DevShellRunner(devShell.path, archArg, devShell.isVsDevCmd);
        devRunner.startWithDevShell(resolved.command, resolved.args, workingDir);
        runner = devRunner;
      } else if (snapshot.cpp.vcvarsPath) {
        // Fallback to detected vcvarsall
        const devRunner = new DevShellRunner(snapshot.cpp.vcvarsPath, archArg, false);
        devRunner.startWithDevShell(resolved.command, resolved.args, workingDir);
        runner = devRunner;
      } else {
        // No dev shell available, try anyway
        runner = new ProcessRunner();
        runner.start({ command: resolved.command, args: resolved.args, cwd: workingDir });
      }
    } else {
      runner = new ProcessRunner();
      runner.start({
        command: resolved.command,
        args: resolved.args,
        cwd: workingDir,
      });
    }

    this.currentRunner = runner;

    return new Promise<BuildResult>((resolve) => {
      const createEntry = (text: string, source: 'stdout' | 'stderr'): LogEntry => ({
        index: this.logIndex++,
        timestamp: Date.now(),
        level: source === 'stderr' ? 'stderr' : 'stdout',
        text,
        source,
      });

      const finish = (result: BuildResult): void => {
        this.currentRunner = null;
        resolve(result);
        // Fire-and-forget: never block build success on metrics failure.
        try {
          recordBuildMetric(project, profile, snapshot, result).catch(err => {
            buildLog.warn('build intelligence record failed', errToLog(err));
          });
        } catch (err) {
          buildLog.warn('build intelligence schedule failed', errToLog(err));
        }
      };

      runner.on('stdout', (line: string) => {
        const diag = parser.feedLine(line);
        const entry = createEntry(line, 'stdout');
        if (diag) {
          entry.level = diag.severity === 'error' ? 'error' : 'warning';
        }
        onLogEntry(entry);
      });

      runner.on('stderr', (line: string) => {
        parser.feedLine(line);
        onLogEntry(createEntry(line, 'stderr'));
      });

      runner.on('error', (err: Error) => {
        onLogEntry(createEntry(`Build process error: ${err.message}`, 'stderr'));
        const endTime = new Date();
        const summary = parser.getSummary();
        finish({
          profileId: profile.id,
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          exitCode: -1,
          status: 'failure',
          errorCount: summary.errors.length + 1,
          warningCount: summary.warnings.length,
          errors: summary.errors,
          warnings: summary.warnings,
        });
      });

      runner.on('exit', (code: number) => {
        const endTime = new Date();
        const summary = parser.getSummary();
        finish({
          profileId: profile.id,
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          exitCode: code,
          status: code === 0 ? 'success' : 'failure',
          errorCount: summary.errors.length,
          warningCount: summary.warnings.length,
          errors: summary.errors,
          warnings: summary.warnings,
        });
      });
    });
  }

  async cancel(): Promise<void> {
    if (this.currentRunner) {
      await this.currentRunner.cancel();
      this.currentRunner = null;
    }
  }
}

/**
 * Build a {@link BuildMetric} from a completed run and persist it via
 * {@link BuildIntelligenceService}. Resolves the git commit out-of-band; never
 * throws — caller invokes via `.catch()`.
 */
async function recordBuildMetric(
  project: ProjectInfo,
  profile: BuildProfile,
  snapshot: EnvironmentSnapshot,
  result: BuildResult,
): Promise<void> {
  const projectId = sha1Hex(project.filePath).slice(0, 12);
  const toolchainHash = sha1Hex(
    JSON.stringify([
      snapshot.dotnet.sdks.map(s => s.version).sort(),
      snapshot.msbuild.selectedPath,
      snapshot.cpp.toolsets.map(t => t.version).sort(),
    ]),
  ).slice(0, 12);

  const env = process.env;
  const pathShort = env['PATH']?.split(process.platform === 'win32' ? ';' : ':').slice(0, 3).join(';') ?? null;
  const envHash = sha1Hex(
    JSON.stringify({
      INCLUDE: env['INCLUDE'] ?? null,
      LIB: env['LIB'] ?? null,
      PATH_short: pathShort,
    }),
  ).slice(0, 12);

  const gitCommit = await safeGitCommit();

  const metric: BuildMetric = {
    schema: 'lazybuilder/metrics/v1',
    ts: (result.endTime ?? new Date()).toISOString(),
    kind: 'build',
    projectId,
    projectName: project.name,
    configuration: profile.configuration,
    platform: profile.platform,
    exitCode: result.exitCode ?? -1,
    status: toMetricStatus(result.status),
    durationMs: result.durationMs,
    errorCount: result.errorCount,
    warningCount: result.warningCount,
    gitCommit,
    toolchainHash,
    envHash,
    hostname: hostname(),
  };

  await new BuildIntelligenceService().record(metric);
}

function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

function toMetricStatus(status: BuildResult['status']): BuildMetricStatus {
  if (status === 'success' || status === 'failure' || status === 'cancelled') return status;
  // 'idle' / 'running' should never reach a finalized BuildResult, but be defensive.
  return 'failure';
}

async function safeGitCommit(): Promise<string | null> {
  try {
    const result = await runCommand('git', ['rev-parse', 'HEAD'], { timeout: 1000 });
    if (result.exitCode === 0) {
      const trimmed = result.stdout.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
  } catch {
    // best-effort
  }
  return null;
}
