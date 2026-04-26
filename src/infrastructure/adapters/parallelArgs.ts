/**
 * Helpers for emitting parallel-build flags per build system, and detecting
 * whether the user has already provided one in extraArguments.
 */

const MSBUILD_PARALLEL_RE = /^[/-](m|maxcpucount)(:|$)/i;
const CMAKE_PARALLEL_RE = /^(--parallel|-j)$/i;

export function hasMsBuildParallelFlag(args: readonly string[]): boolean {
  return args.some(arg => MSBUILD_PARALLEL_RE.test(arg));
}

export function hasCMakeParallelFlag(args: readonly string[]): boolean {
  return args.some(arg => CMAKE_PARALLEL_RE.test(arg));
}

export function msbuildParallelFlag(jobs: number | undefined): string {
  return jobs && jobs > 0 ? `/m:${jobs}` : '/m';
}

export function dotnetParallelFlag(jobs: number | undefined): string {
  return jobs && jobs > 0 ? `-m:${jobs}` : '-m';
}
