import { EnvironmentService } from '../../application/EnvironmentService.js';
import { ProjectScanService } from '../../application/ProjectScanService.js';
import type { McpTool } from '../types.js';
import { errorResult, jsonResult } from '../types.js';

const scanEnvironment: McpTool = {
  name: 'scan_environment',
  description:
    'Scan the current host for installed build tools (.NET SDKs, MSBuild, Visual Studio, C++ toolchain, Windows SDK, CMake, package managers). Returns an EnvironmentSnapshot.',
  inputSchema: {
    type: 'object',
    properties: {},
    additionalProperties: false,
  },
  handler: async () => {
    try {
      const result = await new EnvironmentService().scanWithDiagnostics();
      return jsonResult('EnvironmentSnapshot', {
        ok: true,
        snapshot: result.snapshot,
        failures: result.failures,
      });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

const scanProjects: McpTool = {
  name: 'scan_projects',
  description:
    'Scan a directory for solutions (.sln) and projects (.csproj/.fsproj/.vbproj/.vcxproj/CMakeLists.txt). Returns parsed ProjectInfo and SolutionInfo arrays.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: {
        type: 'string',
        description: 'Directory to scan. Defaults to process.cwd().',
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
      const scan = await new ProjectScanService().scan(cwd);
      return jsonResult('ProjectScanResult', {
        ok: true,
        cwd,
        projects: scan.projects,
        solutions: scan.solutions,
      });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

export const scanTools: McpTool[] = [scanEnvironment, scanProjects];
