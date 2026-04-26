import { describe, it, expect, beforeEach, vi } from 'vitest';
import { snapshotWithGlobalJson } from '../../__fixtures__/snapshots.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import type { ProjectScanResult } from '../../application/ProjectScanService.js';
import type { InstallPlan } from '../../domain/models/InstallPlan.js';
import type { InstallResult } from '../../domain/models/InstallResult.js';

const envScanMock = vi.fn<() => Promise<EnvironmentSnapshot>>();
const projectScanMock = vi.fn<(cwd: string) => Promise<ProjectScanResult>>();
const planMock = vi.fn<
  (snapshot: EnvironmentSnapshot, projects: unknown[], opts: unknown) => InstallPlan
>();
const applyMock = vi.fn<
  (plan: InstallPlan, opts?: unknown) => Promise<InstallResult>
>();

vi.mock('../../application/EnvironmentService.js', () => ({
  EnvironmentService: class {
    scan() {
      return envScanMock();
    }
  },
}));

vi.mock('../../application/ProjectScanService.js', () => ({
  ProjectScanService: class {
    scan(cwd: string) {
      return projectScanMock(cwd);
    }
  },
}));

vi.mock('../../application/ToolchainService.js', () => ({
  ToolchainService: class {
    plan(snapshot: EnvironmentSnapshot, projects: unknown[], opts: unknown) {
      return planMock(snapshot, projects, opts);
    }
    apply(plan: InstallPlan, opts?: unknown) {
      return applyMock(plan, opts);
    }
  },
}));

const { toolchainTools } = await import('./toolchain.js');
const toolchainPlan = toolchainTools.find(t => t.name === 'toolchain_plan')!;
const toolchainApply = toolchainTools.find(t => t.name === 'toolchain_apply')!;

interface Envelope<K extends string, D> {
  schema: 'lazybuilder/v1';
  kind: K;
  data: D;
}
function parseEnvelope<K extends string = string, D = unknown>(text: string) {
  return JSON.parse(text) as Envelope<K, D>;
}

const PLAN_FIXTURE: InstallPlan = {
  steps: [
    {
      id: 'sdk-8.0.x',
      displayName: '.NET SDK 8.0.x',
      kind: 'dotnet-sdk',
      version: '8.0.x',
      scope: 'user',
      needsAdmin: false,
      sizeBytes: 280 * 1024 * 1024,
      estimatedSeconds: 60,
      source: { url: 'https://x', signer: 'Microsoft', channel: 'official' },
      command: { executable: 'pwsh', args: [] },
      dependsOn: [],
      selected: true,
      reason: {
        source: 'global.json',
        filePath: '/proj/global.json',
        detail: 'sdk.version=8.0.x',
        affectedProjects: [],
      },
    },
  ],
  totalSizeBytes: 280 * 1024 * 1024,
  estimatedSeconds: 60,
  needsAdmin: false,
  updateGlobalJson: false,
  globalJsonPath: '/proj/global.json',
};

beforeEach(() => {
  vi.clearAllMocks();
  envScanMock.mockResolvedValue(snapshotWithGlobalJson('8.0.x', []));
  projectScanMock.mockResolvedValue({ projects: [], solutions: [] });
  planMock.mockReturnValue(PLAN_FIXTURE);
  applyMock.mockResolvedValue({
    plan: PLAN_FIXTURE,
    progress: {
      overallStatus: 'done',
      currentStepId: null,
      steps: [
        {
          stepId: 'sdk-8.0.x',
          status: 'done',
          bytesDownloaded: 0,
          bytesTotal: null,
          startedAt: 1,
          finishedAt: 2,
          exitCode: 0,
          errorMessage: null,
          logTail: [],
        },
      ],
    },
    durationMs: 1,
    postScanSucceeded: true,
    pathUpdated: false,
    globalJsonUpdated: false,
    unresolvedRequirements: [],
  });
});

describe('toolchain_plan tool', () => {
  it('declares expected metadata', () => {
    expect(toolchainPlan.name).toBe('toolchain_plan');
    expect(toolchainPlan.inputSchema.type).toBe('object');
  });

  it('returns InstallPlan envelope with the planned steps', async () => {
    const result = await toolchainPlan.handler({});
    const env = parseEnvelope<'InstallPlan', { ok: boolean; plan: InstallPlan }>(
      result.content[0]!.text,
    );
    expect(env.kind).toBe('InstallPlan');
    expect(env.data.ok).toBe(true);
    expect(env.data.plan.steps).toHaveLength(1);
  });

  it('forwards scope/updateGlobalJson/cwd through to ToolchainService.plan', async () => {
    await toolchainPlan.handler({
      scope: 'machine',
      updateGlobalJson: true,
      cwd: '/proj',
    });
    expect(planMock).toHaveBeenCalledTimes(1);
    const opts = planMock.mock.calls[0]![2] as {
      scope: string;
      updateGlobalJson: boolean;
      cwd: string;
    };
    expect(opts.scope).toBe('machine');
    expect(opts.updateGlobalJson).toBe(true);
    expect(opts.cwd).toBe('/proj');
  });

  it('defaults scope to "user" when not provided', async () => {
    await toolchainPlan.handler({});
    const opts = planMock.mock.calls[0]![2] as { scope: string };
    expect(opts.scope).toBe('user');
  });

  it('returns error envelope when planning throws', async () => {
    planMock.mockImplementation(() => {
      throw new Error('plan-error');
    });
    const result = await toolchainPlan.handler({});
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { ok: boolean; error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('plan-error');
  });
});

describe('toolchain_apply tool', () => {
  it('declares confirmedSteps as required input', () => {
    expect(toolchainApply.inputSchema.required).toContain('confirmedSteps');
  });

  it('returns isError when confirmedSteps is missing', async () => {
    const result = await toolchainApply.handler({});
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('confirmedSteps');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('returns isError when confirmedSteps is an empty array', async () => {
    const result = await toolchainApply.handler({ confirmedSteps: [] });
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('at least one');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('returns isError when no confirmed step matches the plan', async () => {
    const result = await toolchainApply.handler({
      confirmedSteps: ['nonexistent-id'],
    });
    expect(result.isError).toBe(true);
    const env = parseEnvelope<
      'Error',
      { error: string; details?: { unknownIds: string[] } }
    >(result.content[0]!.text);
    expect(env.data.error).toContain('No confirmed steps matched');
    expect(env.data.details?.unknownIds).toContain('nonexistent-id');
    expect(applyMock).not.toHaveBeenCalled();
  });

  it('calls ToolchainService.apply with a filtered plan when confirmed step matches', async () => {
    const result = await toolchainApply.handler({
      confirmedSteps: ['sdk-8.0.x'],
    });
    expect(applyMock).toHaveBeenCalledTimes(1);
    const filteredPlan = applyMock.mock.calls[0]![0];
    expect(filteredPlan.steps[0]!.selected).toBe(true);

    const env = parseEnvelope<
      'InstallResult',
      { ok: boolean; result: InstallResult; unknownConfirmedIds: string[] }
    >(result.content[0]!.text);
    expect(env.kind).toBe('InstallResult');
    expect(env.data.ok).toBe(true);
    expect(env.data.unknownConfirmedIds).toEqual([]);
  });

  it('marks ok=false when InstallResult overallStatus is not "done"', async () => {
    applyMock.mockResolvedValueOnce({
      plan: PLAN_FIXTURE,
      progress: {
        overallStatus: 'failed',
        currentStepId: null,
        steps: [],
      },
      durationMs: 5,
      postScanSucceeded: false,
      pathUpdated: false,
      globalJsonUpdated: false,
      unresolvedRequirements: [],
    });
    const result = await toolchainApply.handler({
      confirmedSteps: ['sdk-8.0.x'],
    });
    const env = parseEnvelope<'InstallResult', { ok: boolean }>(
      result.content[0]!.text,
    );
    expect(env.data.ok).toBe(false);
  });

  it('returns error envelope when apply throws', async () => {
    applyMock.mockRejectedValueOnce(new Error('apply-boom'));
    const result = await toolchainApply.handler({
      confirmedSteps: ['sdk-8.0.x'],
    });
    expect(result.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(
      result.content[0]!.text,
    );
    expect(env.data.error).toContain('apply-boom');
  });

  it('filters non-string confirmedSteps and returns isError if nothing remains', async () => {
    const result = await toolchainApply.handler({
      confirmedSteps: [123, null, ''] as unknown as string[],
    });
    expect(result.isError).toBe(true);
    expect(applyMock).not.toHaveBeenCalled();
  });
});
