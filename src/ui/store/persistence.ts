import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BuildDiagnostic } from '../../domain/models/BuildResult.js';
import type { BuildStatus } from '../../domain/enums.js';
import type { BuildTargetFilter } from './useAppStore.js';

/**
 * Disk-persisted UI state. Lives in ~/.lazybuilder/state.json (per-user, not
 * per-project) — this is the right scope because the same machine often
 * builds multiple projects and per-project state should be re-derived on
 * scan, not pre-loaded.
 *
 * What persists (sticky across launches):
 *  - last-used build profile (config / platform / verbosity / parallel / dev)
 *  - last selected target path (so cursor returns to where you were)
 *  - target filter
 *  - solution-group expansion map
 *  - last N build runs (so History tab doesn't go empty after relaunch)
 *  - favourite target paths
 *
 * Anything else (live build status, log entries, scan results, notifications)
 * intentionally does NOT persist — they're either ephemeral or must be
 * re-derived from the current environment.
 */

export const STATE_VERSION = 1;
export const HISTORY_MAX_PERSIST = 50;

export interface PersistedState {
  version: number;
  lastTargetPath: string | null;
  buildTargetFilter: BuildTargetFilter;
  buildConfigName: string | null;
  buildPlatformName: string | null;
  buildVerbosityIdx: number;
  buildParallel: boolean;
  buildDevShell: boolean;
  expandedSolutions: Record<string, boolean>;
  favouriteTargets: string[];
  /** Per-target last-used { configuration, platform } so switching targets
   *  restores the user's last choice for THAT target instead of resetting. */
  configByTarget: Record<string, { configuration: string; platform: string }>;
  /** Subset of build history persisted across launches. */
  buildHistorySerialized: SerializedBuildResult[];
}

export interface SerializedBuildResult {
  profileId: string;
  startTime: string;            // ISO
  endTime: string | null;       // ISO; null if process aborted before completion
  durationMs: number;
  exitCode: number | null;
  status: BuildStatus;
  errorCount: number;
  warningCount: number;
  errors: BuildDiagnostic[];
  warnings: BuildDiagnostic[];
}

const DEFAULT_STATE: PersistedState = {
  version: STATE_VERSION,
  lastTargetPath: null,
  buildTargetFilter: 'all',
  buildConfigName: null,
  buildPlatformName: null,
  buildVerbosityIdx: 1,
  buildParallel: true,
  buildDevShell: false,
  expandedSolutions: {},
  favouriteTargets: [],
  configByTarget: {},
  buildHistorySerialized: [],
};

export function statePath(): string {
  const override = process.env['LAZYBUILDER_STATE_PATH'];
  if (override) return override;
  return join(homedir(), '.lazybuilder', 'state.json');
}

export function loadPersistedState(): PersistedState {
  try {
    const raw = readFileSync(statePath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_STATE;
    if (parsed.version !== STATE_VERSION) {
      // Future: run migrations. For now, drop forward-incompatible state.
      return DEFAULT_STATE;
    }
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

export function savePersistedState(state: PersistedState): void {
  try {
    const path = statePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Best-effort: persistence failure must never break the UI loop.
  }
}

/** Coalesce many rapid saves into one — store updates fire constantly. */
export function makeDebouncedSaver(delayMs = 250): (state: PersistedState) => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: PersistedState | null = null;
  return (state: PersistedState) => {
    pending = state;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      const snapshot = pending;
      pending = null;
      if (snapshot) savePersistedState(snapshot);
    }, delayMs);
  };
}
