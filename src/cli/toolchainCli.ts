import { EnvironmentService } from '../application/EnvironmentService.js';
import { ProjectScanService } from '../application/ProjectScanService.js';
import { ToolchainService } from '../application/ToolchainService.js';
import type { InstallScope } from '../domain/models/InstallPlan.js';

const SCHEMA = 'lazybuilder/v1';

export interface ToolchainCliOptions {
  cwd: string;
  yes: boolean;
  scope: InstallScope;
  continueOnError: boolean;
  updateGlobalJson: boolean;
  dryRun: boolean;
}

function envelope(kind: string, data: unknown): string {
  const payload = { schema: SCHEMA, kind, data };
  return process.env['LAZYBUILDER_PRETTY'] === '1'
    ? JSON.stringify(payload, null, 2)
    : JSON.stringify(payload);
}

function parseFlags(argv: string[]): ToolchainCliOptions {
  const opts: ToolchainCliOptions = {
    cwd: process.cwd(),
    yes: false,
    scope: 'user',
    continueOnError: false,
    updateGlobalJson: false,
    dryRun: false,
  };
  for (const arg of argv) {
    if (arg === '--yes') opts.yes = true;
    else if (arg.startsWith('--scope=')) {
      const v = arg.slice('--scope='.length);
      if (v === 'user' || v === 'machine') opts.scope = v;
    }
    else if (arg === '--continue-on-error') opts.continueOnError = true;
    else if (arg === '--update-global-json') opts.updateGlobalJson = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg.startsWith('--cwd=')) opts.cwd = arg.slice('--cwd='.length);
  }
  return opts;
}

async function loadContext(cwd: string) {
  const [snapshot, scan] = await Promise.all([
    new EnvironmentService().scan(),
    new ProjectScanService().scan(cwd),
  ]);
  return { snapshot, projects: scan.projects };
}

export async function runToolchainPlan(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const { snapshot, projects } = await loadContext(opts.cwd);
  const plan = new ToolchainService().plan(snapshot, projects, {
    scope: opts.scope,
    updateGlobalJson: opts.updateGlobalJson,
    cwd: opts.cwd,
  });
  process.stdout.write(envelope('ToolchainPlan', { ok: true, plan }) + '\n');
  return 0;
}

export async function runToolchainApply(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const { snapshot, projects } = await loadContext(opts.cwd);
  const service = new ToolchainService();
  const plan = service.plan(snapshot, projects, {
    scope: opts.scope,
    updateGlobalJson: opts.updateGlobalJson,
    cwd: opts.cwd,
  });

  if (opts.dryRun) {
    process.stdout.write(envelope('ToolchainPlan', { ok: true, plan, dryRun: true }) + '\n');
    return 0;
  }

  if (!opts.yes && plan.steps.some(s => s.selected)) {
    process.stderr.write('[lazybuilder] --yes required for non-interactive apply\n');
    process.stdout.write(envelope('ToolchainPlan', { ok: false, plan, reason: 'confirmation-required' }) + '\n');
    return 2;
  }

  const result = await service.apply(plan, {
    continueOnError: opts.continueOnError,
  });
  process.stdout.write(envelope('ToolchainResult', { ok: result.progress.overallStatus === 'done', result }) + '\n');
  return result.progress.overallStatus === 'done' ? 0 : 1;
}

export async function runToolchainSync(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const { projects } = await loadContext(opts.cwd);
  const service = new ToolchainService();
  const result = await service.sync(projects, {
    scope: opts.scope,
    updateGlobalJson: opts.updateGlobalJson,
    continueOnError: opts.continueOnError,
    cwd: opts.cwd,
  });
  process.stdout.write(envelope('ToolchainResult', { ok: result.progress.overallStatus === 'done', result }) + '\n');
  return result.progress.overallStatus === 'done' ? 0 : 1;
}

export async function runToolchainDoctor(argv: string[]): Promise<number> {
  const opts = parseFlags(argv);
  const { snapshot, projects } = await loadContext(opts.cwd);
  const plan = new ToolchainService().plan(snapshot, projects, {
    scope: opts.scope,
    cwd: opts.cwd,
  });
  const issues = plan.steps.map(s => ({
    id: s.id,
    title: `${s.displayName} not installed`,
    severity: 'error' as const,
    suggestedAction: `lazybuilder --toolchain-apply --yes --scope=${s.scope}`,
    reason: s.reason,
  }));
  process.stdout.write(
    envelope('ToolchainDoctor', { ok: issues.length === 0, issues }) + '\n',
  );
  return issues.length === 0 ? 0 : 1;
}
