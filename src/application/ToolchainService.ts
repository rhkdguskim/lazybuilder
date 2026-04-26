import type { EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import type { ProjectInfo } from '../domain/models/ProjectInfo.js';
import type {
  ToolchainRequirement,
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
const STEP_TIME_HINT_SECONDS = 60;

export class ToolchainService {
  private installer = new DotnetInstaller();

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
        const result = await this.installer.run({
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
    const needsAdmin = scope === 'machine';
    const preview = this.installer.buildPreviewArgs({
      id: req.id,
      displayName: '',
      kind: req.kind,
      version,
      scope,
      needsAdmin,
      sizeBytes: null,
      estimatedSeconds: null,
      source: { url: '', signer: '', channel: '' },
      command: { executable: '', args: [] },
      dependsOn: [],
      selected: false,
      reason: req.reason,
    });

    return {
      id: req.id,
      displayName: displayNameFor(req.kind, version),
      kind: req.kind,
      version,
      scope,
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

function sizeHintForKind(kind: ToolchainRequirement['kind']): number {
  if (kind === 'dotnet-sdk') return SDK_SIZE_HINT_BYTES;
  if (kind === 'dotnet-runtime') return RUNTIME_SIZE_HINT_BYTES;
  return WORKLOAD_SIZE_HINT_BYTES;
}

function displayNameFor(kind: ToolchainRequirement['kind'], version: string): string {
  if (kind === 'dotnet-sdk') return `.NET SDK ${version}`;
  if (kind === 'dotnet-runtime') return `.NET Runtime ${version}`;
  return `Workload: ${version}`;
}

function sourceFor(kind: ToolchainRequirement['kind']): { url: string; signer: string; channel: string } {
  if (kind === 'dotnet-workload') {
    return {
      url: 'dotnet workload',
      signer: 'Microsoft',
      channel: 'workload',
    };
  }
  return {
    url: 'https://dot.net/v1/dotnet-install.ps1',
    signer: 'Microsoft',
    channel: 'official',
  };
}
