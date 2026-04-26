import { create } from 'zustand';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import type { ProjectInfo, SolutionInfo } from '../../domain/models/ProjectInfo.js';
import type { DiagnosticItem } from '../../domain/models/DiagnosticItem.js';
import type { BuildResult } from '../../domain/models/BuildResult.js';
import type { LogEntry } from '../../domain/models/LogEntry.js';
import type { BuildStatus } from '../../domain/enums.js';
import {
  nextNotificationId,
  type Notification,
  type PushNotificationInput,
} from './notifications.js';
import {
  HISTORY_MAX_PERSIST,
  STATE_VERSION,
  loadPersistedState,
  makeDebouncedSaver,
  type PersistedState,
  type SerializedBuildResult,
} from './persistence.js';

export type TabId = 'overview' | 'environment' | 'projects' | 'build' | 'diagnostics' | 'logs' | 'history' | 'settings';
export type ScanStatus = 'idle' | 'scanning' | 'done' | 'error';
export type BuildTargetFilter = 'all' | 'solutions' | 'projects' | 'dotnet' | 'msbuild' | 'cmake' | 'cpp';

interface AppState {
  // Tab navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Boot
  bootCompleted: boolean;
  setBootCompleted: () => void;

  // Environment scan
  snapshot: EnvironmentSnapshot | null;
  envScanStatus: ScanStatus;
  setSnapshot: (snapshot: EnvironmentSnapshot) => void;
  setEnvScanStatus: (status: ScanStatus) => void;

  // Project scan
  projects: ProjectInfo[];
  solutions: SolutionInfo[];
  projectScanStatus: ScanStatus;
  setProjects: (projects: ProjectInfo[], solutions: SolutionInfo[]) => void;
  setProjectScanStatus: (status: ScanStatus) => void;

  // Solution-group expansion (shared by Projects + Build tabs; persists across tab switches)
  expandedSolutions: Record<string, boolean>;
  toggleSolutionExpanded: (filePath: string) => void;
  setSolutionExpanded: (filePath: string, expanded: boolean) => void;
  expandAllSolutions: (filePaths: string[]) => void;
  collapseAllSolutions: () => void;

  // Diagnostics
  diagnostics: DiagnosticItem[];
  setDiagnostics: (items: DiagnosticItem[]) => void;

  // Build
  buildStatus: BuildStatus;
  buildStartTime: number | null;
  buildResult: BuildResult | null;
  buildHistory: BuildResult[];
  setBuildStatus: (status: BuildStatus) => void;
  setBuildStartTime: (time: number | null) => void;
  setBuildResult: (result: BuildResult | null) => void;
  addBuildHistory: (result: BuildResult) => void;

  // Build settings (persisted across tab switches)
  buildTargetIdx: number;
  buildTargetQuery: string;
  buildTargetFilter: BuildTargetFilter;
  buildSearchActive: boolean;
  buildConfigIdx: number;
  buildPlatformIdx: number;
  buildVerbosityIdx: number;
  buildParallel: boolean;
  buildDevShell: boolean;
  setBuildTargetIdx: (idx: number) => void;
  setBuildTargetQuery: (query: string) => void;
  setBuildTargetFilter: (filter: BuildTargetFilter) => void;
  setBuildSearchActive: (active: boolean) => void;
  setBuildConfigIdx: (idx: number) => void;
  setBuildPlatformIdx: (idx: number) => void;
  setBuildVerbosityIdx: (idx: number) => void;
  setBuildParallel: (v: boolean) => void;
  setBuildDevShell: (v: boolean) => void;

  // Build cancel (for quit cleanup)
  buildCancelFn: (() => Promise<void>) | null;
  setBuildCancelFn: (fn: (() => Promise<void>) | null) => void;

  // Logs
  logEntries: LogEntry[];
  appendLogEntries: (entries: LogEntry[]) => void;
  clearLogs: () => void;

  // Notifications / toast layer
  notifications: Notification[];
  pushNotification: (input: PushNotificationInput) => string;
  dismissNotification: (id: string) => void;
  clearNotifications: () => void;

  // Focused area within the active tab — drives contextual key hints + visual focus rings.
  focusArea: string | null;
  setFocusArea: (area: string | null) => void;

  // Cross-launch persistence
  /** Path of the last target the user actually built (sticky across launches). */
  lastBuiltTargetPath: string | null;
  setLastBuiltTargetPath: (path: string | null) => void;
  /** Set of favourite target paths (pinned to top of build target list). */
  favouriteTargets: Set<string>;
  toggleFavouriteTarget: (path: string) => void;
  /** Last profile the user actually built — replays via "." rebuild-last. */
  lastBuildProfileSnapshot: {
    targetPath: string;
    config: string;
    platform: string;
  } | null;
  setLastBuildProfileSnapshot: (snap: AppState['lastBuildProfileSnapshot']) => void;
  /** Per-target last-used config + platform — restored when the target is re-selected. */
  configByTarget: Record<string, { configuration: string; platform: string }>;
  setConfigForTarget: (path: string, configuration: string, platform: string) => void;
  /** Set the build cursor to the row with this path. UI uses path-based addressing
   *  so navigation survives list re-sorts. */
  pendingTargetPath: string | null;
  selectBuildTargetByPath: (path: string | null) => void;
  /** One-shot trigger consumed by BuildTab to execute a build right after the
   *  pending target is selected. Used by global `.` rebuild-last. */
  pendingRebuildToken: number;
  triggerRebuildLast: () => boolean;
}

const MAX_LOG_ENTRIES = 50000;

const persisted = loadPersistedState();

function deserializeBuildHistory(items: SerializedBuildResult[]): BuildResult[] {
  return items.map(item => ({
    profileId: item.profileId,
    startTime: new Date(item.startTime),
    endTime: item.endTime ? new Date(item.endTime) : null,
    durationMs: item.durationMs,
    exitCode: item.exitCode,
    status: item.status,
    errorCount: item.errorCount,
    warningCount: item.warningCount,
    errors: item.errors,
    warnings: item.warnings,
  }));
}

function serializeBuildHistory(items: BuildResult[]): SerializedBuildResult[] {
  return items.slice(-HISTORY_MAX_PERSIST).map(item => ({
    profileId: item.profileId,
    startTime: item.startTime.toISOString(),
    endTime: item.endTime ? item.endTime.toISOString() : null,
    durationMs: item.durationMs,
    exitCode: item.exitCode,
    status: item.status,
    errorCount: item.errorCount,
    warningCount: item.warningCount,
    errors: item.errors,
    warnings: item.warnings,
  }));
}

export const useAppStore = create<AppState>((set) => ({
  // Tab
  activeTab: 'overview',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Boot
  bootCompleted: false,
  setBootCompleted: () => set({ bootCompleted: true }),

  // Environment
  snapshot: null,
  envScanStatus: 'idle',
  setSnapshot: (snapshot) => set({ snapshot }),
  setEnvScanStatus: (status) => set({ envScanStatus: status }),

  // Projects
  projects: [],
  solutions: [],
  projectScanStatus: 'idle',
  setProjects: (projects, solutions) => set({ projects, solutions }),
  setProjectScanStatus: (status) => set({ projectScanStatus: status }),

  // Solution expansion — restored from disk if present.
  expandedSolutions: persisted.expandedSolutions,
  toggleSolutionExpanded: (filePath) => set((state) => ({
    expandedSolutions: {
      ...state.expandedSolutions,
      [filePath]: !state.expandedSolutions[filePath],
    },
  })),
  setSolutionExpanded: (filePath, expanded) => set((state) => ({
    expandedSolutions: { ...state.expandedSolutions, [filePath]: expanded },
  })),
  expandAllSolutions: (filePaths) => set(() => ({
    expandedSolutions: Object.fromEntries(filePaths.map((p) => [p, true])),
  })),
  collapseAllSolutions: () => set({ expandedSolutions: {} }),

  // Diagnostics
  diagnostics: [],
  setDiagnostics: (items) => set({ diagnostics: items }),

  // Build
  buildStatus: 'idle',
  buildStartTime: null,
  buildResult: null,
  buildHistory: deserializeBuildHistory(persisted.buildHistorySerialized),
  setBuildStatus: (status) => set({ buildStatus: status }),
  setBuildStartTime: (time) => set({ buildStartTime: time }),
  setBuildResult: (result) => set({ buildResult: result }),
  addBuildHistory: (result) => set((state) => ({
    buildHistory: [...state.buildHistory, result].slice(-100),
  })),

  // Build settings — sticky across launches.
  buildTargetIdx: 0,
  buildTargetQuery: '',
  buildTargetFilter: persisted.buildTargetFilter,
  buildSearchActive: false,
  buildConfigIdx: 0,
  buildPlatformIdx: 0,
  buildVerbosityIdx: persisted.buildVerbosityIdx,
  buildParallel: persisted.buildParallel,
  buildDevShell: persisted.buildDevShell,
  setBuildTargetIdx: (idx) => set({ buildTargetIdx: idx }),
  setBuildTargetQuery: (query) => set({ buildTargetQuery: query }),
  setBuildTargetFilter: (filter) => set({ buildTargetFilter: filter }),
  setBuildSearchActive: (active) => set({ buildSearchActive: active }),
  setBuildConfigIdx: (idx) => set({ buildConfigIdx: idx }),
  setBuildPlatformIdx: (idx) => set({ buildPlatformIdx: idx }),
  setBuildVerbosityIdx: (idx) => set({ buildVerbosityIdx: idx }),
  setBuildParallel: (v) => set({ buildParallel: v }),
  setBuildDevShell: (v) => set({ buildDevShell: v }),

  // Build cancel
  buildCancelFn: null,
  setBuildCancelFn: (fn) => set({ buildCancelFn: fn }),

  // Logs
  logEntries: [],
  appendLogEntries: (entries) => set((state) => {
    const combined = [...state.logEntries, ...entries];
    return { logEntries: combined.length > MAX_LOG_ENTRIES ? combined.slice(-MAX_LOG_ENTRIES) : combined };
  }),
  clearLogs: () => set({ logEntries: [] }),

  // Notifications
  notifications: [],
  pushNotification: (input) => {
    const id = nextNotificationId();
    set((state) => ({
      notifications: [{ id, ...input }, ...state.notifications].slice(0, 8),
    }));
    return id;
  },
  dismissNotification: (id) => set((state) => ({
    notifications: state.notifications.filter(n => n.id !== id),
  })),
  clearNotifications: () => set({ notifications: [] }),

  // Focus
  focusArea: null,
  setFocusArea: (area) => set({ focusArea: area }),

  // Cross-launch persistence
  lastBuiltTargetPath: persisted.lastTargetPath,
  setLastBuiltTargetPath: (path) => set({ lastBuiltTargetPath: path }),
  favouriteTargets: new Set(persisted.favouriteTargets),
  toggleFavouriteTarget: (path) => set((state) => {
    const next = new Set(state.favouriteTargets);
    if (next.has(path)) next.delete(path); else next.add(path);
    return { favouriteTargets: next };
  }),
  lastBuildProfileSnapshot: persisted.lastTargetPath && persisted.buildConfigName
    ? {
        targetPath: persisted.lastTargetPath,
        config: persisted.buildConfigName,
        platform: persisted.buildPlatformName ?? 'Any CPU',
      }
    : null,
  setLastBuildProfileSnapshot: (snap) => set({ lastBuildProfileSnapshot: snap }),
  configByTarget: persisted.configByTarget,
  setConfigForTarget: (path, configuration, platform) => set((state) => ({
    configByTarget: {
      ...state.configByTarget,
      [path]: { configuration, platform },
    },
  })),
  pendingTargetPath: null,
  selectBuildTargetByPath: (path) => set({ pendingTargetPath: path }),
  pendingRebuildToken: 0,
  triggerRebuildLast: () => {
    const snap = useAppStore.getState().lastBuildProfileSnapshot;
    if (!snap) return false;
    set((state) => ({
      activeTab: 'build',
      pendingTargetPath: snap.targetPath,
      pendingRebuildToken: state.pendingRebuildToken + 1,
    }));
    return true;
  },
}));

// ── Disk persistence ──────────────────────────────────────────────
//
// Subscribe to relevant store slices and debounce-write a JSON file under
// ~/.lazybuilder/state.json. Tests can disable persistence by setting
// LAZYBUILDER_NO_PERSIST=1.

const debouncedSave = makeDebouncedSaver(250);

function snapshotForDisk(state: AppState): PersistedState {
  return {
    version: STATE_VERSION,
    lastTargetPath: state.lastBuiltTargetPath,
    buildTargetFilter: state.buildTargetFilter,
    buildConfigName: state.lastBuildProfileSnapshot?.config ?? null,
    buildPlatformName: state.lastBuildProfileSnapshot?.platform ?? null,
    buildVerbosityIdx: state.buildVerbosityIdx,
    buildParallel: state.buildParallel,
    buildDevShell: state.buildDevShell,
    expandedSolutions: state.expandedSolutions,
    favouriteTargets: [...state.favouriteTargets],
    configByTarget: state.configByTarget,
    buildHistorySerialized: serializeBuildHistory(state.buildHistory),
  };
}

if (process.env['LAZYBUILDER_NO_PERSIST'] !== '1') {
  useAppStore.subscribe((state, prev) => {
    // Only save when a persisted slice actually changed — avoid disk thrash on
    // ephemeral events like log appends or notification ticks.
    if (
      state.lastBuiltTargetPath === prev.lastBuiltTargetPath
      && state.buildTargetFilter === prev.buildTargetFilter
      && state.buildVerbosityIdx === prev.buildVerbosityIdx
      && state.buildParallel === prev.buildParallel
      && state.buildDevShell === prev.buildDevShell
      && state.expandedSolutions === prev.expandedSolutions
      && state.favouriteTargets === prev.favouriteTargets
      && state.lastBuildProfileSnapshot === prev.lastBuildProfileSnapshot
      && state.configByTarget === prev.configByTarget
      && state.buildHistory === prev.buildHistory
    ) {
      return;
    }
    debouncedSave(snapshotForDisk(state));
  });
}
