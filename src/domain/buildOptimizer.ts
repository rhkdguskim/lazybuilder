import type { BuildSystem, ProjectType } from './enums.js';
import type { HardwareInfo } from './models/HardwareInfo.js';

export interface OptimizationContext {
  buildSystem: BuildSystem;
  projectType?: ProjectType;
  hardware: HardwareInfo;
}

/**
 * Recommended parallel job count.
 * C/C++ link is RAM-heavy (~2GB per linker), so cap by memory.
 * Pure C# is memory-light, so use full core count.
 */
export function recommendedJobs(ctx: OptimizationContext): number {
  const { buildSystem, projectType, hardware } = ctx;
  const cores = Math.max(1, hardware.cpuCores);

  const isHeavyNative =
    buildSystem === 'cmake'
    || projectType === 'cpp-msbuild'
    || projectType === 'mixed';

  if (!isHeavyNative) {
    return cores;
  }

  // Reserve ~2GB per parallel native build job; keep at least 1.
  const memoryCap = Math.max(1, Math.floor(hardware.totalMemoryGB / 2));
  return Math.max(1, Math.min(cores, memoryCap));
}
