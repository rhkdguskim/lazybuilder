import type { BuildAdapter, ResolvedCommand } from './BuildAdapter.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildSystem } from '../../domain/enums.js';

export class MsBuildAdapter implements BuildAdapter {
  readonly buildSystem: BuildSystem = 'msbuild';

  constructor(private msbuildPath?: string) {}

  canHandle(project: ProjectInfo): boolean {
    return project.buildSystem === 'msbuild';
  }

  resolveCommand(project: ProjectInfo, profile: BuildProfile): ResolvedCommand {
    const msbuild = this.msbuildPath ?? 'msbuild';
    const args: string[] = [];

    // Target file — quote only the path
    args.push(`"${profile.targetPath}"`);

    // Configuration — no quotes around value
    args.push(`/p:Configuration=${profile.configuration}`);

    // Platform — no quotes around value (MSBuild doesn't want them)
    if (profile.platform) {
      args.push(`/p:Platform=${profile.platform}`);
    }

    // Verbosity mapping
    const verbosityMap: Record<string, string> = {
      quiet: 'q', minimal: 'm', normal: 'n', detailed: 'd', diagnostic: 'diag',
    };
    args.push(`/verbosity:${verbosityMap[profile.verbosity] ?? 'n'}`);

    // Binary log
    if (profile.enableBinaryLog) {
      args.push('/bl');
    }

    // Extra arguments
    args.push(...profile.extraArguments);

    const displayString = `${msbuild} ${args.join(' ')}`;

    return {
      command: msbuild,
      args,
      requiresDevShell: profile.useDeveloperShell,
      displayString,
    };
  }
}
