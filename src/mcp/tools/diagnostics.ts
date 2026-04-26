import { DiagnosticsService } from '../../application/DiagnosticsService.js';
import { EnvironmentService } from '../../application/EnvironmentService.js';
import { ProjectScanService } from '../../application/ProjectScanService.js';
import type { McpTool } from '../types.js';
import { errorResult, jsonResult } from '../types.js';

const runDiagnostics: McpTool = {
  name: 'run_diagnostics',
  description:
    'Run all diagnostic rules against the current environment + project scan. Internally invokes scan_environment and scan_projects, then DiagnosticsService.analyze. Returns DiagnosticItem[] sorted by severity.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description:
          'Directory to scan for projects. Defaults to process.cwd().',
      },
    },
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const cwd =
        typeof args['cwd'] === 'string' && args['cwd'].length > 0
          ? (args['cwd'] as string)
          : process.cwd();
      const [snapshot, scan] = await Promise.all([
        new EnvironmentService().scan(),
        new ProjectScanService().scan(cwd),
      ]);
      const diagnostics = new DiagnosticsService().analyze(
        snapshot,
        scan.projects,
      );
      return jsonResult('DiagnosticReport', {
        ok: true,
        cwd,
        diagnostics,
      });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

export const diagnosticsTools: McpTool[] = [runDiagnostics];
