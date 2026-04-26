import type { McpTool } from '../types.js';
import { errorResult, jsonResult } from '../types.js';

interface BuildIntelligenceServiceLike {
  report: (opts: {
    days?: number;
    projectId?: string;
  }) => Promise<unknown> | unknown;
}

interface BuildIntelligenceModule {
  BuildIntelligenceService?: new () => BuildIntelligenceServiceLike;
}

const getMetrics: McpTool = {
  name: 'get_metrics',
  description:
    'Return build metrics, regressions, and flaky-build summary from local intelligence storage. Backed by BuildIntelligenceService when available; returns a graceful "service-not-available" envelope when not.',
  inputSchema: {
    type: 'object',
    properties: {
      days: {
        type: 'number',
        description: 'Lookback window in days. Defaults to 7.',
      },
      projectId: {
        type: 'string',
        description: 'Restrict report to a single project identifier.',
      },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    const days =
      typeof args['days'] === 'number' && Number.isFinite(args['days'])
        ? (args['days'] as number)
        : 7;
    const projectId =
      typeof args['projectId'] === 'string' && args['projectId'].length > 0
        ? (args['projectId'] as string)
        : undefined;

    try {
      // Dynamic import guards against the parallel agent not having shipped
      // BuildIntelligenceService yet. Compile-time references to the module
      // path are intentionally avoided.
      const modulePath =
        '../../application/BuildIntelligenceService.js';
      let mod: BuildIntelligenceModule;
      try {
        mod = (await import(modulePath)) as BuildIntelligenceModule;
      } catch {
        return jsonResult('BuildIntelligenceReport', {
          ok: false,
          reason: 'service-not-available',
        });
      }

      const Ctor = mod.BuildIntelligenceService;
      if (!Ctor) {
        return jsonResult('BuildIntelligenceReport', {
          ok: false,
          reason: 'service-not-available',
        });
      }

      const service = new Ctor();
      const opts: { days?: number; projectId?: string } = { days };
      if (projectId !== undefined) opts.projectId = projectId;
      const report = await Promise.resolve(service.report(opts));

      return jsonResult('BuildIntelligenceReport', {
        ok: true,
        days,
        projectId: projectId ?? null,
        report,
      });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

export const metricsTools: McpTool[] = [getMetrics];
