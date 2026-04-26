import { create } from 'zustand';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';
import type { ProjectInfo, SolutionInfo } from '../../domain/models/ProjectInfo.js';
import type { DiagnosticItem } from '../../domain/models/DiagnosticItem.js';
import type { BuildResult } from '../../domain/models/BuildResult.js';
import type { LogEntry } from '../../domain/models/LogEntry.js';
import type { BuildStatus } from '../../domain/enums.js';

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
}

const MAX_LOG_ENTRIES = 50000;

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

  // Diagnostics
  diagnostics: [],
  setDiagnostics: (items) => set({ diagnostics: items }),

  // Build
  buildStatus: 'idle',
  buildStartTime: null,
  buildResult: null,
  buildHistory: [],
  setBuildStatus: (status) => set({ buildStatus: status }),
  setBuildStartTime: (time) => set({ buildStartTime: time }),
  setBuildResult: (result) => set({ buildResult: result }),
  addBuildHistory: (result) => set((state) => ({
    buildHistory: [...state.buildHistory, result].slice(-100),
  })),

  // Build settings
  buildTargetIdx: 0,
  buildTargetQuery: '',
  buildTargetFilter: 'all',
  buildSearchActive: false,
  buildConfigIdx: 0,
  buildPlatformIdx: 0,
  buildVerbosityIdx: 1,
  buildParallel: true,
  buildDevShell: false,
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
}));
