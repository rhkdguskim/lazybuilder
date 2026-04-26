import type { EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import type { ProjectInfo } from '../domain/models/ProjectInfo.js';
import type {
  ToolchainRequirement,
  ToolchainKind,
} from '../domain/models/ToolchainRequirement.js';
import type {
  InstallPlan,
  InstallScope,
  InstallStep,
} from '../domain/models/InstallPlan.js';
import type {
  InstallProgress,
  InstallStepProgress,
  InstallStepStatus,
} from '../domain/models/InstallProgress.js';
import type { InstallResult } from '../domain/models/InstallResult.js';
import { dirname } from 'node:path';
import { resolveToolchainRequirements } from '../domain/rules/toolchainRules.js';
import {
  DotnetInstaller,
  VsBuildToolsInstaller,
  WingetInstaller,
  ensureUserPathContains,
  updateGlobalJsonSdkVersion,
} from '../infrastructure/installer/index.js';
import { EnvironmentService } from './EnvironmentService.js';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';

const log = logger.child({ component: 'ToolchainService' });

export interface PlanOptions {
  scope?: InstallScope;
  updateGlobalJson?: boolean;
  globalJsonPath?: string | null;
  cwd?: string;
}

export interface ApplyOptions {
  signal?: AbortSignal;
  continueOnError?: boolean;
  onProgress?: (progress: InstallProgress) => void;
}

const SDK_SIZE_HINT_BYTES = 280 * 1024 * 1024;
const RUNTIME_SIZE_HINT_BYTES = 80 * 1024 * 1024;
const WORKLOAD_SIZE_HINT_BYTES = 120 * 1024 * 1024;
const MSVC_TOOLSET_SIZE_HINT_BYTES = 1700 * 1024 * 1024; // ~1.7 GB
const WINDOWS_SDK_SIZE_HINT_BYTES = 340 * 1024 * 1024;
const CMAKE_SIZE_HINT_BYTES = 32 * 1024 * 1024;
const NINJA_SIZE_HINT_BYTES = 1 * 1024 * 1024;
const STEP_TIME_HINT_SECONDS = 60;

interface InstallerLike {
  buildPreviewArgs(step: InstallStep): { executable: string; args: string[] };
  run(options: { step: InstallStep; signal?: AbortSignal }): Promise<{ exitCode: number; logTail: string[] }>;
}

export class ToolchainService {
  private installer = new DotnetInstaller();
  private vsBuildToolsInstaller = new VsBuildToolsInstaller();
  private wingetInstaller = new WingetInstaller();

  private getInstallerForStep(step: InstallStep): InstallerLike {
    switch (step.kind) {
      case 'dotnet-sdk':
      case 'dotnet-runtime':
      case 'dotnet-workload':
        return this.installer;
      case 'msvc-toolset':
        return this.vsBuildToolsInstaller;
      case 'windows-sdk':
      case 'cmake':
      case 'ninja':
        return this.wingetInstaller;
      default: {
        const exhaustive: never = step.kind;
        throw new Error(`No installer registered for kind ${exhaustive as string}`);
      }
    }
  }

  /**
   * Compute requirements + plan from a current snapshot and project list.
   */
  plan(
    snapshot: EnvironmentSnapshot,
    projects: ProjectInfo[],
    options: PlanOptions = {},
  ): InstallPlan {
    const scope: InstallScope = options.scope ?? 'user';
    const requirements = resolveToolchainRequirements(snapshot, projects);
    const missing = requirements.filter(r => !r.currentlyInstalled);

    const steps = missing.map(req => this.toStep(req, scope));
    const totalSize = steps.reduce((acc, s) => acc + (s.sizeBytes ?? 0), 0);
    const totalSeconds = steps.reduce(
      (acc, s) => acc + (s.estimatedSeconds ?? 0),
      0,
    );

    return {
      steps,
      totalSizeBytes: totalSize,
      estimatedSeconds: totalSeconds,
      needsAdmin: steps.some(s => s.needsAdmin),
      updateGlobalJson: options.updateGlobalJson ?? false,
      globalJsonPath:
        options.globalJsonPath ?? snapshot.dotnet.globalJsonPath ?? null,
    };
  }

  /**
   * Execute the selected steps of a plan. Streams progress via `onProgress`.
   * Returns the final InstallResult after re-scanning the environment.
   */
  async apply(
    plan: InstallPlan,
    options: ApplyOptions = {},
  ): Promise<InstallResult> {
    const start = Date.now();
    const selected = plan.steps.filter(s => s.selected);
    const progress: InstallProgress = {
      overallStatus: selected.length > 0 ? 'running' : 'idle',
      currentStepId: null,
      steps: plan.steps.map(s => initialStepProgress(s.id, s.selected)),
    };

    const emit = () => {
      options.onProgress?.(cloneProgress(progress));
    };

    if (selected.length === 0) {
      progress.overallStatus = 'done';
      emit();
      return this.finalize(plan, progress, start, []);
    }

    emit();

    let cancelled = false;
    options.signal?.addEventListener(
      'abort',
      () => {
        cancelled = true;
      },
      { once: true },
    );

    for (const step of selected) {
      if (cancelled) {
        markStep(progress, step.id, 'cancelled');
        emit();
        continue;
      }

      progress.currentStepId = step.id;
      markStep(progress, step.id, 'running', { startedAt: Date.now() });
      emit();

      try {
        const installer = this.getInstallerForStep(step);
        const result = await installer.run({
          step,
          signal: options.signal,
        });
        const status: InstallStepStatus = result.exitCode === 0 ? 'done' : 'failed';
        markStep(progress, step.id, status, {
          finishedAt: Date.now(),
          exitCode: result.exitCode,
          logTail: result.logTail,
        });
        emit();

        if (status === 'failed' && !options.continueOnError) {
          for (const remaining of selected) {
            const cur = findStep(progress, remaining.id);
            if (cur && cur.status === 'pending') {
              markStep(progress, remaining.id, 'skipped');
            }
          }
          progress.overallStatus = 'failed';
          progress.currentStepId = null;
          emit();
          return this.finalize(plan, progress, start, this.unresolvedFromProgress(plan, progress));
        }
      } catch (err) {
        log.warn('install step threw', {
          stepId: step.id,
          ...errToLog(err),
        });
        markStep(progress, step.id, 'failed', {
          finishedAt: Date.now(),
          errorMessage: err instanceof Error ? err.message : String(err),
        });
        progress.overallStatus = 'failed';
        progress.currentStepId = null;
        emit();
        if (!options.continueOnError) {
          return this.finalize(plan, progress, start, this.unresolvedFromProgress(plan, progress));
        }
      }
    }

    progress.currentStepId = null;
    progress.overallStatus = cancelled
      ? 'cancelled'
      : progress.steps.every(
            s => s.status === 'done' || s.status === 'skipped',
          )
        ? 'done'
        : 'failed';
    emit();

    return this.finalize(plan, progress, start, this.unresolvedFromProgress(plan, progress));
  }

  /**
   * Convenience helper: scan + plan + apply with default options.
   * Used by `lazybuilder --toolchain-sync`.
   */
  async sync(projects: ProjectInfo[], options: ApplyOptions & PlanOptions = {}): Promise<InstallResult> {
    const env = await new EnvironmentService().scan();
    const plan = this.plan(env, projects, options);
    return this.apply(plan, options);
  }

  private async finalize(
    plan: InstallPlan,
    progress: InstallProgress,
    startMs: number,
    unresolved: ToolchainRequirement[],
  ): Promise<InstallResult> {
    const durationMs = Date.now() - startMs;

    let pathUpdated = false;
    const userScopeUsed = plan.steps.some(
      s => s.scope === 'user' && findStep(progress, s.id)?.status === 'done',
    );
    if (userScopeUsed && process.platform === 'win32') {
      try {
        pathUpdated = await ensureUserPathContains(
          this.installer.resolveInstallDir('user'),
        );
      } catch (err) {
        log.warn('ensureUserPathContains failed', errToLog(err));
      }
    }

    let globalJsonUpdated = false;
    if (plan.updateGlobalJson && progress.overallStatus === 'done') {
      const sdkStep = plan.steps.find(
        s =>
          s.kind === 'dotnet-sdk' &&
          findStep(progress, s.id)?.status === 'done',
      );
      const targetDir = plan.globalJsonPath
        ? dirname(plan.globalJsonPath)
        : process.cwd();
      if (sdkStep) {
        try {
          globalJsonUpdated = updateGlobalJsonSdkVersion(
            targetDir,
            sdkStep.version,
          );
        } catch (err) {
          log.warn('updateGlobalJsonSdkVersion failed', errToLog(err));
        }
      }
    }

    let postScanSucceeded = false;
    try {
      const rescan = await new EnvironmentService().scan();
      const rescanRequirements = resolveToolchainRequirements(rescan, []);
      postScanSucceeded = rescanRequirements.every(r => r.currentlyInstalled);
    } catch (err) {
      log.warn('post-install rescan failed', errToLog(err));
    }

    return {
      plan,
      progress,
      durationMs,
      postScanSucceeded,
      pathUpdated,
      globalJsonUpdated,
      unresolvedRequirements: unresolved,
    };
  }

  private toStep(req: ToolchainRequirement, scope: InstallScope): InstallStep {
    const version = req.resolvedVersion ?? req.versionSpec;
    const sizeBytes = sizeHintForKind(req.kind);
    const effectiveScope = effectiveScopeForKind(req.kind, scope);
    const needsAdmin = effectiveScope === 'machine';

    const skeleton: InstallStep = {
      id: req.id,
      displayName: '',
      kind: req.kind,
      version,
      scope: effectiveScope,
      needsAdmin,
      sizeBytes: null,
      estimatedSeconds: null,
      source: { url: '', signer: '', channel: '' },
      command: { executable: '', args: [] },
      dependsOn: [],
      selected: false,
      reason: req.reason,
    };
    const installer = this.getInstallerForStep(skeleton);
    const preview = installer.buildPreviewArgs(skeleton);

    return {
      id: req.id,
      displayName: displayNameFor(req.kind, version),
      kind: req.kind,
      version,
      scope: effectiveScope,
      needsAdmin,
      sizeBytes,
      estimatedSeconds: STEP_TIME_HINT_SECONDS,
      source: sourceFor(req.kind),
      command: preview,
      dependsOn: [],
      selected: true,
      reason: req.reason,
    };
  }

  private unresolvedFromProgress(
    plan: InstallPlan,
    progress: InstallProgress,
  ): ToolchainRequirement[] {
    return plan.steps
      .filter(s => {
        const cur = findStep(progress, s.id);
        return cur ? cur.status !== 'done' : false;
      })
      .map(s => ({
        id: s.id,
        kind: s.kind,
        versionSpec: s.version,
        resolvedVersion: s.version,
        reason: s.reason,
        currentlyInstalled: false,
        severity: 'required' as const,
      }));
  }
}

function initialStepProgress(stepId: string, selected: boolean): InstallStepProgress {
  return {
    stepId,
    status: selected ? 'pending' : 'skipped',
    bytesDownloaded: 0,
    bytesTotal: null,
    startedAt: null,
    finishedAt: null,
    exitCode: null,
    errorMessage: null,
    logTail: [],
  };
}

function findStep(progress: InstallProgress, stepId: string): InstallStepProgress | undefined {
  return progress.steps.find(s => s.stepId === stepId);
}

function markStep(
  progress: InstallProgress,
  stepId: string,
  status: InstallStepStatus,
  patch: Partial<InstallStepProgress> = {},
): void {
  const cur = findStep(progress, stepId);
  if (!cur) return;
  cur.status = status;
  Object.assign(cur, patch);
}

function cloneProgress(progress: InstallProgress): InstallProgress {
  return {
    overallStatus: progress.overallStatus,
    currentStepId: progress.currentStepId,
    steps: progress.steps.map(s => ({ ...s, logTail: [...s.logTail] })),
  };
}

function sizeHintForKind(kind: ToolchainKind): number {
  switch (kind) {
    case 'dotnet-sdk': return SDK_SIZE_HINT_BYTES;
    case 'dotnet-runtime': return RUNTIME_SIZE_HINT_BYTES;
    case 'dotnet-workload': return WORKLOAD_SIZE_HINT_BYTES;
    case 'msvc-toolset': return MSVC_TOOLSET_SIZE_HINT_BYTES;
    case 'windows-sdk': return WINDOWS_SDK_SIZE_HINT_BYTES;
    case 'cmake': return CMAKE_SIZE_HINT_BYTES;
    case 'ninja': return NINJA_SIZE_HINT_BYTES;
    default: {
      const exhaustive: never = kind;
      return (void exhaustive, WORKLOAD_SIZE_HINT_BYTES);
    }
  }
}

function displayNameFor(kind: ToolchainKind, version: string): string {
  switch (kind) {
    case 'dotnet-sdk': return `.NET SDK ${version}`;
    case 'dotnet-runtime': return `.NET Runtime ${version}`;
    case 'dotnet-workload': return `Workload: ${version}`;
    case 'msvc-toolset': return `VS Build Tools ${version}`;
    case 'windows-sdk': return `Windows SDK ${version}`;
    case 'cmake': return `CMake ${version}`;
    case 'ninja': return `Ninja ${version}`;
    default: {
      const exhaustive: never = kind;
      return (void exhaustive, `Toolchain ${version}`);
    }
  }
}

function sourceFor(kind: ToolchainKind): { url: string; signer: string; channel: string } {
  if (kind === 'dotnet-workload') {
    return {
      url: 'dotnet workload',
      signer: 'Microsoft',
      channel: 'workload',
    };
  }
  if (kind === 'msvc-toolset') {
    return {
      url: 'https://aka.ms/vs/17/release/vs_BuildTools.exe',
      signer: 'Microsoft',
      channel: 'BuildTools',
    };
  }
  if (kind === 'windows-sdk') {
    return {
      url: 'winget://Microsoft.WindowsSDK',
      signer: 'Microsoft',
      channel: 'winget',
    };
  }
  if (kind === 'cmake') {
    return {
      url: 'winget://Kitware.CMake',
      signer: 'Kitware',
      channel: 'winget',
    };
  }
  if (kind === 'ninja') {
    return {
      url: 'winget://Ninja-build.Ninja',
      signer: 'Ninja project',
      channel: 'winget',
    };
  }
  // Source URL must reflect the actual platform-specific script we'll fetch.
  // Keeps headless plan output honest (and verifiable via curl).
  const url = process.platform === 'win32'
    ? 'https://dot.net/v1/dotnet-install.ps1'
    : 'https://dot.net/v1/dotnet-install.sh';
  return { url, signer: 'Microsoft', channel: 'official' };
}

/**
 * VS Build Tools and Windows SDK only support machine-scope installs, so we
 * upgrade the scope automatically when those kinds are requested. CMake /
 * Ninja stay at user scope by default (winget user-scope works for both).
 */
function effectiveScopeForKind(kind: ToolchainKind, requested: InstallScope): InstallScope {
  if (kind === 'msvc-toolset' || kind === 'windows-sdk') return 'machine';
  return requested;
}
