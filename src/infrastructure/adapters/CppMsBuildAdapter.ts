import type { BuildAdapter, ResolvedCommand } from './BuildAdapter.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildSystem } from '../../domain/enums.js';
import type { HardwareInfo } from '../../domain/models/HardwareInfo.js';
import { recommendedJobs } from '../../domain/buildOptimizer.js';
import { hasMsBuildParallelFlag, msbuildParallelFlag } from './parallelArgs.js';

export class CppMsBuildAdapter implements BuildAdapter {
  readonly buildSystem: BuildSystem = 'msbuild';

  constructor(private msbuildPath?: string, private hardware?: HardwareInfo) {}

  canHandle(project: ProjectInfo): boolean {
    return project.projectType === 'cpp-msbuild';
  }

  resolveCommand(project: ProjectInfo, profile: BuildProfile): ResolvedCommand {
    const msbuild = this.msbuildPath ?? 'msbuild';
    const args: string[] = [];

    args.push(`"${profile.targetPath}"`);
    args.push(`/p:Configuration=${profile.configuration}`);

    // C++ uses Win32 instead of x86
    const platform = profile.platform === 'x86' ? 'Win32' : profile.platform;
    args.push(`/p:Platform=${platform}`);

    const verbosityMap: Record<string, string> = {
      quiet: 'q', minimal: 'm', normal: 'n', detailed: 'd', diagnostic: 'diag',
    };
    args.push(`/verbosity:${verbosityMap[profile.verbosity] ?? 'n'}`);

    if (profile.enableBinaryLog) {
      args.push('/bl');
    }

    if (profile.parallel && !hasMsBuildParallelFlag(profile.extraArguments)) {
      const jobs = profile.parallelJobs ?? (this.hardware
        ? recommendedJobs({ buildSystem: 'msbuild', projectType: project.projectType, hardware: this.hardware })
        : undefined);
      args.push(msbuildParallelFlag(jobs));
    }

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
