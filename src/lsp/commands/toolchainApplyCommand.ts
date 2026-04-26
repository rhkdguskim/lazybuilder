/**
 * `lazybuilder.toolchain.apply` executeCommand handler.
 *
 * Builds a fresh InstallPlan from the cached workspace context, narrows it to
 * the requested step IDs, then drives ToolchainService.apply while translating
 * its InstallProgress callbacks into LSP `$/progress` messages.
 *
 * This module is transport-agnostic — the caller (server.ts) wires the LSP
 * progress reporter and the diagnostic refresh.
 */
import { ToolchainService } from '../../application/ToolchainService.js';
import type { InstallProgress } from '../../domain/models/InstallProgress.js';
import type { WorkspaceContext } from '../workspace.js';

export interface ToolchainApplyArgs {
  stepIds: string[];
  scope?: 'user' | 'machine';
  sourceUri?: string;
}

export interface ToolchainApplyResult {
  ok: boolean;
  message?: string;
}

/**
 * LSP `$/progress` report payload (the `value` field of the progress
 * notification). We always emit `kind: 'report'` here — `begin`/`end` are
 * delivered by the WorkDoneProgress reporter on the server side.
 */
export interface LspProgressReport {
  kind: 'report';
  message: string;
  percentage: number;
}

export type SendProgressFn = (report: LspProgressReport) => void;
export type RefreshDiagnosticsFn = () => void | Promise<void>;

const SERVICE = new ToolchainService();

/**
 * Validate args, build a filtered InstallPlan, and execute it. Translates each
 * `InstallProgress` callback into a single `$/progress` report.
 *
 * Returns `{ ok: false, message }` for argument errors and for installs whose
 * overall status is not `done`. The caller should still call
 * `refreshDiagnostics` so the editor sees the new state regardless of outcome.
 */
export async function executeToolchainApply(
  args: ToolchainApplyArgs,
  ctx: WorkspaceContext,
  sendProgress: SendProgressFn,
  refreshDiagnostics: RefreshDiagnosticsFn,
): Promise<ToolchainApplyResult> {
  if (!args || !Array.isArray(args.stepIds) || args.stepIds.length === 0) {
    return { ok: false, message: 'No step IDs provided' };
  }

  const requested = new Set(args.stepIds);
  const scope = args.scope ?? 'user';

  const basePlan = SERVICE.plan(ctx.snapshot, ctx.projects, { scope });

  // Narrow the plan to only the requested steps. Steps that are not selected
  // here are still kept in `plan.steps` so ToolchainService.apply's progress
  // bookkeeping stays consistent, but they're flagged not-selected so they
  // won't run.
  const filteredSteps = basePlan.steps.map((step) => ({
    ...step,
    selected: requested.has(step.id),
  }));
  const matchedCount = filteredSteps.filter((s) => s.selected).length;
  if (matchedCount === 0) {
    return { ok: false, message: 'No matching install steps' };
  }

  const filteredPlan = { ...basePlan, steps: filteredSteps };

  let lastProgressKey = '';
  const result = await SERVICE.apply(filteredPlan, {
    onProgress: (progress) => {
      const report = toLspReport(progress, matchedCount);
      // Avoid spamming the same payload repeatedly when nothing material
      // changed (status + currentStep are the only meaningful axes here).
      const key = `${report.percentage}|${report.message}`;
      if (key === lastProgressKey) return;
      lastProgressKey = key;
      sendProgress(report);
    },
  });

  // Always refresh after apply finishes — even on failure the snapshot may
  // have changed (e.g. partial step success).
  try {
    await refreshDiagnostics();
  } catch {
    // refreshDiagnostics is a fire-and-forget side effect from this module's
    // perspective; failures are logged by the caller.
  }

  if (result.progress.overallStatus === 'done') {
    return { ok: true };
  }

  const failed = result.progress.steps.find((s) => s.status === 'failed');
  return {
    ok: false,
    message: failed?.errorMessage ?? `Install ended with status: ${result.progress.overallStatus}`,
  };
}

/**
 * Convert an InstallProgress snapshot into a single `$/progress` report.
 *
 * Percentage is computed against `selectedTotal` so unselected steps don't
 * dilute the bar. We count any non-pending status (done/failed/cancelled/
 * skipped) toward "completed" so the bar always advances.
 */
function toLspReport(progress: InstallProgress, selectedTotal: number): LspProgressReport {
  const completed = progress.steps.filter(
    (s) =>
      s.status === 'done' ||
      s.status === 'failed' ||
      s.status === 'cancelled' ||
      // 'skipped' steps were never selected — exclude them from the denominator
      // implicitly by using selectedTotal below; we still don't count them as
      // completed work toward the user's selection.
      false,
  ).length;
  const denom = Math.max(1, selectedTotal);
  const percentage = Math.min(100, Math.round((completed / denom) * 100));

  let message: string;
  if (progress.overallStatus === 'done') {
    message = 'Toolchain install complete';
  } else if (progress.overallStatus === 'failed') {
    message = 'Toolchain install failed';
  } else if (progress.overallStatus === 'cancelled') {
    message = 'Toolchain install cancelled';
  } else if (progress.currentStepId) {
    const cur = progress.steps.find((s) => s.stepId === progress.currentStepId);
    const idx = progress.steps.findIndex((s) => s.stepId === progress.currentStepId) + 1;
    message = `Installing ${progress.currentStepId} (${idx}/${selectedTotal})${
      cur?.bytesTotal ? ` — ${formatBytes(cur.bytesDownloaded)} / ${formatBytes(cur.bytesTotal)}` : ''
    }`;
  } else {
    message = 'Preparing install';
  }

  return { kind: 'report', message, percentage };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
