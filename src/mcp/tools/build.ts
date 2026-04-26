import { randomUUID } from 'node:crypto';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { BuildService } from '../../application/BuildService.js';
import { EnvironmentService } from '../../application/EnvironmentService.js';
import { ProjectScanService } from '../../application/ProjectScanService.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { LogEntry } from '../../domain/models/LogEntry.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildSystem, Verbosity } from '../../domain/enums.js';
import type { McpTool } from '../types.js';
import { errorResult, jsonResult } from '../types.js';

const VALID_VERBOSITY: ReadonlySet<Verbosity> = new Set([
  'quiet',
  'minimal',
  'normal',
  'detailed',
  'diagnostic',
]);

function inferBuildSystem(filePath: string): BuildSystem {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.sln') || lower.endsWith('.vcxproj')) return 'msbuild';
  if (lower.endsWith('cmakelists.txt') || lower.endsWith('.cmake'))
    return 'cmake';
  return 'dotnet';
}

const buildTool: McpTool = {
  name: 'build',
  description:
    'Execute a build for a given project or solution path. Auto-detects buildSystem from the project on disk; defaults configuration=Debug, platform=x64. Returns BuildResult including diagnostics and any captured log lines.',
  inputSchema: {
    type: 'object',
    properties: {
      projectPath: {
        type: 'string',
        description:
          'Absolute or relative path to a .sln/.csproj/.vcxproj/.fsproj/.vbproj/CMakeLists.txt.',
      },
      configuration: {
        type: 'string',
        description: 'Build configuration. Defaults to "Debug".',
      },
      platform: {
        type: 'string',
        description: 'Target platform (e.g. x64, Win32, AnyCPU). Defaults to "x64".',
      },
      verbosity: {
        type: 'string',
        enum: ['quiet', 'minimal', 'normal', 'detailed', 'diagnostic'],
        description: 'Verbosity for the underlying build tool.',
      },
      useDevShell: {
        type: 'boolean',
        description:
          'Force enabling the Visual Studio Developer Shell. Auto-detected when omitted.',
      },
      extraArguments: {
        type: 'array',
        items: { type: 'string' },
        description: 'Extra arguments appended to the build command.',
      },
      cwd: {
        type: 'string',
        description:
          'Working directory used to resolve relative projectPath and to scan for ProjectInfo. Defaults to cwd.',
      },
    },
    required: ['projectPath'],
    additionalProperties: false,
  },
  handler: async (args) => {
    try {
      const rawProjectPath = args['projectPath'];
      if (typeof rawProjectPath !== 'string' || rawProjectPath.length === 0) {
        return errorResult('projectPath is required.');
      }
      const cwd =
        typeof args['cwd'] === 'string' && args['cwd'].length > 0
          ? (args['cwd'] as string)
          : process.cwd();
      const projectPath = isAbsolute(rawProjectPath)
        ? rawProjectPath
        : resolvePath(cwd, rawProjectPath);

      const configuration =
        typeof args['configuration'] === 'string'
          ? (args['configuration'] as string)
          : 'Debug';
      const platform =
        typeof args['platform'] === 'string'
          ? (args['platform'] as string)
          : 'x64';

      const rawVerbosity = args['verbosity'];
      const verbosity: Verbosity =
        typeof rawVerbosity === 'string' && VALID_VERBOSITY.has(rawVerbosity as Verbosity)
          ? (rawVerbosity as Verbosity)
          : 'minimal';

      const useDevShellArg = args['useDevShell'];
      const extraArguments = Array.isArray(args['extraArguments'])
        ? (args['extraArguments'] as unknown[]).filter(
            (s): s is string => typeof s === 'string',
          )
        : [];

      // Resolve a ProjectInfo: prefer scan results, fall back to a minimal stub
      // so the user can build a path that lives outside the scan root.
      const scanRoot = dirname(projectPath);
      const scan = await new ProjectScanService().scan(scanRoot);
      let project: ProjectInfo | undefined = scan.projects.find(
        (p) => p.filePath === projectPath,
      );
      if (!project) {
        const buildSystem = inferBuildSystem(projectPath);
        project = {
          name: projectPath,
          filePath: projectPath,
          projectType:
            buildSystem === 'cmake'
              ? 'cmake'
              : buildSystem === 'dotnet'
                ? 'dotnet-sdk'
                : 'cpp-msbuild',
          language: 'unknown',
          buildSystem,
          targetFrameworks: [],
          platformTargets: [],
          configurations: [],
          platformToolset: null,
          windowsSdkVersion: null,
          recommendedCommand: buildSystem === 'dotnet' ? 'dotnet' : 'msbuild',
          dependencies: [],
          riskFlags: [],
          solutionPath: null,
        };
      }

      const profile: BuildProfile = {
        id: randomUUID(),
        name: 'mcp-build',
        targetPath: projectPath,
        buildSystem: project.buildSystem,
        configuration,
        platform,
        extraArguments,
        useDeveloperShell:
          typeof useDevShellArg === 'boolean'
            ? useDevShellArg
            : project.buildSystem === 'msbuild',
        enableBinaryLog: false,
        verbosity,
        parallel: true,
      };

      const snapshot = await new EnvironmentService().scan();
      const buildService = new BuildService(snapshot);

      const logLines: Array<{
        index: number;
        timestamp: number;
        level: string;
        text: string;
        source: 'stdout' | 'stderr';
      }> = [];

      const onLogEntry = (entry: LogEntry): void => {
        logLines.push({
          index: entry.index,
          timestamp: entry.timestamp,
          level: entry.level,
          text: entry.text,
          source: entry.source,
        });
        // Mirror to stderr so the host can tail logs while the RPC runs.
        // stdout is reserved for the MCP transport.
        process.stderr.write(`[build] ${entry.text}\n`);
      };

      const result = await buildService.execute(
        project,
        profile,
        snapshot,
        onLogEntry,
      );

      return jsonResult('BuildResult', {
        ok: result.status === 'success',
        result,
        logLines,
      });
    } catch (err) {
      return errorResult(
        err instanceof Error ? err.message : String(err),
      );
    }
  },
};

export const buildTools: McpTool[] = [buildTool];
