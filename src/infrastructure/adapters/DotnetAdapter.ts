import type { BuildAdapter, ResolvedCommand } from './BuildAdapter.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildSystem } from '../../domain/enums.js';
import type { HardwareInfo } from '../../domain/models/HardwareInfo.js';
import { recommendedJobs } from '../../domain/buildOptimizer.js';
import { dotnetParallelFlag, hasMsBuildParallelFlag } from './parallelArgs.js';

export class DotnetAdapter implements BuildAdapter {
  readonly buildSystem: BuildSystem = 'dotnet';

  constructor(private hardware?: HardwareInfo) {}

  canHandle(project: ProjectInfo): boolean {
    return project.buildSystem === 'dotnet';
  }

  resolveCommand(project: ProjectInfo, profile: BuildProfile): ResolvedCommand {
    const args: string[] = ['build'];

    args.push(`"${profile.targetPath}"`);
    args.push('-c', profile.configuration);

    if (profile.platform && profile.platform !== 'Any CPU' && profile.platform !== 'AnyCPU') {
      args.push(`/p:Platform="${profile.platform}"`);
    }

    args.push('-v', profile.verbosity);

    if (profile.parallel && !hasMsBuildParallelFlag(profile.extraArguments)) {
      const jobs = profile.parallelJobs ?? (this.hardware
        ? recommendedJobs({ buildSystem: 'dotnet', projectType: project.projectType, hardware: this.hardware })
        : undefined);
      args.push(dotnetParallelFlag(jobs));
    }

    args.push(...profile.extraArguments);

    if (profile.enableBinaryLog) {
      args.push('-bl');
    }

    const displayString = `dotnet ${args.join(' ')}`;

    return {
      command: 'dotnet',
      args,
      requiresDevShell: false,
      displayString,
    };
  }
}
