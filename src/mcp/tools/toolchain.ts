import { EnvironmentService } from '../../application/EnvironmentService.js';
import { ProjectScanService } from '../../application/ProjectScanService.js';
import { ToolchainService } from '../../application/ToolchainService.js';
import type { InstallScope } from '../../domain/models/InstallPlan.js';
import type { McpTool } from '../types.js';
import { errorResult, jsonResult } from '../types.js';

function readScope(value: unknown): InstallScope {
  return value === 'machine' ? 'machine' : 'user';
}

function readBool(value: unknown): boolean {
  return value === true;
}

function readCwd(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : process.cwd();
}

const toolchainPlan: McpTool = {
  name: 'toolchain_plan',
  description:
    'Resolve missing .NET SDKs/runtimes/workloads for the current project context and return a detailed InstallPlan. Does NOT install anything. Pure side-effect-free planning.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['user', 'machine'],
        description: 'Install scope. Defaults to "user".',
      },
      updateGlobalJson: {
        type: 'boolean',
        description:
          'If true, the plan is annotated to update global.json on apply.',
      },
      cwd: {
        type: 'string',
        description: 'Directory used for project scan. Defaults to cwd.',
      },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const scope = readScope(args['scope']);
      const updateGlobalJson = readBool(args['updateGlobalJson']);
      const cwd = readCwd(args['cwd']);

      const [snapshot, scan] = await Promise.all([
        new EnvironmentService().scan(),
        new ProjectScanService().scan(cwd),
      ]);

      const plan = new ToolchainService().plan(snapshot, scan.projects, {
        scope,
        updateGlobalJson,
        cwd,
      });

      return jsonResult('InstallPlan', { ok: true, plan });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

const toolchainApply: McpTool = {
  name: 'toolchain_apply',
  description:
    'Install missing toolchain components. REQUIRES `confirmedSteps` — only steps whose IDs appear in that array will be applied. Agents must call toolchain_plan first, surface the plan to the user, and pass back the approved IDs only.',
  inputSchema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['user', 'machine'],
        description: 'Install scope. Defaults to "user".',
      },
      continueOnError: {
        type: 'boolean',
        description:
          'If true, continue running remaining steps after a failure.',
      },
      updateGlobalJson: {
        type: 'boolean',
        description:
          'If true, update global.json sdk version after a successful SDK install.',
      },
      cwd: {
        type: 'string',
        description: 'Directory used for project scan. Defaults to cwd.',
      },
      confirmedSteps: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Step IDs the user has explicitly approved. Required and must be non-empty.',
      },
    },
    required: ['confirmedSteps'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const rawConfirmed = args['confirmedSteps'];
      if (!Array.isArray(rawConfirmed)) {
        return errorResult(
          'confirmedSteps is required and must be an array of step IDs.',
        );
      }
      const confirmed: string[] = rawConfirmed.filter(
        (s): s is string => typeof s === 'string' && s.length > 0,
      );
      if (confirmed.length === 0) {
        return errorResult(
          'confirmedSteps must contain at least one approved step ID.',
        );
      }

      const scope = readScope(args['scope']);
      const updateGlobalJson = readBool(args['updateGlobalJson']);
      const continueOnError = readBool(args['continueOnError']);
      const cwd = readCwd(args['cwd']);

      const [snapshot, scan] = await Promise.all([
        new EnvironmentService().scan(),
        new ProjectScanService().scan(cwd),
      ]);

      const service = new ToolchainService();
      const plan = service.plan(snapshot, scan.projects, {
        scope,
        updateGlobalJson,
        cwd,
      });

      const confirmedSet = new Set(confirmed);
      const filteredPlan = {
        ...plan,
        steps: plan.steps.map((step) => ({
          ...step,
          selected: step.selected && confirmedSet.has(step.id),
        })),
      };

      const unknownIds = confirmed.filter(
        (id) => !plan.steps.some((s) => s.id === id),
      );
      if (filteredPlan.steps.every((s) => !s.selected)) {
        return errorResult(
          'No confirmed steps matched the current install plan.',
          { confirmedSteps: confirmed, unknownIds, planStepIds: plan.steps.map((s) => s.id) },
        );
      }

      const result = await service.apply(filteredPlan, { continueOnError });

      return jsonResult('InstallResult', {
        ok: result.progress.overallStatus === 'done',
        result,
        unknownConfirmedIds: unknownIds,
      });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

export const toolchainTools: McpTool[] = [toolchainPlan, toolchainApply];
