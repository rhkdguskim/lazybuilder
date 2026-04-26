import type { BuildAdapter, ResolvedCommand } from './BuildAdapter.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { ProjectInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildSystem } from '../../domain/enums.js';
import type { HardwareInfo } from '../../domain/models/HardwareInfo.js';
import { recommendedJobs } from '../../domain/buildOptimizer.js';
import { hasCMakeParallelFlag } from './parallelArgs.js';
import { dirname } from 'node:path';

export class CMakeAdapter implements BuildAdapter {
  readonly buildSystem: BuildSystem = 'cmake';

  constructor(private hardware?: HardwareInfo) {}

  canHandle(project: ProjectInfo): boolean {
    return project.buildSystem === 'cmake';
  }

  resolveCommand(project: ProjectInfo, profile: BuildProfile): ResolvedCommand {
    const sourceDir = dirname(profile.targetPath);
    const buildDir = `${sourceDir}/build`;
    const args: string[] = [];

    args.push('--build', `"${buildDir}"`);
    args.push('--config', profile.configuration);

    if (profile.parallel && !hasCMakeParallelFlag(profile.extraArguments)) {
      const jobs = profile.parallelJobs ?? (this.hardware
        ? recommendedJobs({ buildSystem: 'cmake', projectType: project.projectType, hardware: this.hardware })
        : undefined);
      if (jobs && jobs > 0) {
        args.push('--parallel', String(jobs));
      } else {
        args.push('--parallel');
      }
    }

    if (profile.extraArguments.length > 0) {
      args.push('--', ...profile.extraArguments);
    }

    const displayString = `cmake ${args.join(' ')}`;

    return {
      command: 'cmake',
      args,
      requiresDevShell: false,
      displayString,
    };
  }
}
