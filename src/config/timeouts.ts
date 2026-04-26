/**
 * Centralized timeout constants (milliseconds).
 *
 * Override at runtime via env vars (LAZYBUILDER_TIMEOUT_<NAME>).
 * Use these instead of hard-coding numbers in detectors / adapters / updater.
 */

const envInt = (key: string, fallback: number): number => {
  const raw = process.env[`LAZYBUILDER_TIMEOUT_${key}`];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const TIMEOUTS = {
  /** Quick `--version` / `where` / `which` style probes */
  QUICK_PROBE: envInt('QUICK_PROBE', 5_000),
  /** Slightly heavier `--version` calls (e.g. dotnet) */
  TOOL_VERSION: envInt('TOOL_VERSION', 10_000),
  /** Long-running listing commands (e.g. `dotnet workload list`, `vswhere`) */
  TOOL_LIST: envInt('TOOL_LIST', 15_000),
  /** Registry / network reads (npm view, git fetch) */
  NETWORK_READ: envInt('NETWORK_READ', 15_000),
  /** Devshell / vcvars warm-up */
  DEVSHELL_INIT: envInt('DEVSHELL_INIT', 30_000),
  /** Git pull (single repo, network bound) */
  GIT_PULL: envInt('GIT_PULL', 60_000),
  /** Long-running install/build steps (npm install, npm run build) */
  HEAVY_INSTALL: envInt('HEAVY_INSTALL', 180_000),
  /** Per-detector budget in EnvironmentService.scan() */
  DETECTOR_BUDGET: envInt('DETECTOR_BUDGET', 20_000),
  /** Registry-only sub-probe (faster than QUICK_PROBE for in-process reads) */
  REGISTRY_PROBE: envInt('REGISTRY_PROBE', 3_000),
} as const;

export type TimeoutKey = keyof typeof TIMEOUTS;
