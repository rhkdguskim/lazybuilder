import { randomUUID } from 'node:crypto';
import type { BuildSystem, Verbosity } from '../enums.js';

export interface BuildProfile {
  id: string;
  name: string;
  targetPath: string;
  buildSystem: BuildSystem;
  configuration: string;
  platform: string;
  extraArguments: string[];
  useDeveloperShell: boolean;
  enableBinaryLog: boolean;
  verbosity: Verbosity;
  /** Run build steps in parallel. Default true. Adapter emits the right flag (/m, -m, --parallel). */
  parallel: boolean;
  /** Explicit job count override. undefined = auto-detect from hardware. */
  parallelJobs?: number;
}

export function createDefaultProfile(targetPath: string, buildSystem: BuildSystem): BuildProfile {
  return {
    id: randomUUID(),
    name: 'Default',
    targetPath,
    buildSystem,
    configuration: 'Debug',
    platform: 'x64',
    extraArguments: [],
    useDeveloperShell: buildSystem === 'msbuild',
    enableBinaryLog: false,
    verbosity: 'minimal',
    parallel: true,
  };
}
