import type { ProjectInfo, SolutionInfo } from '../../../domain/models/ProjectInfo.js';
import type { BuildSystem } from '../../../domain/enums.js';
import type { BuildTargetFilter } from '../../store/useAppStore.js';

export type FocusArea = 'targets' | 'settings' | 'action' | 'output';
export type SettingField = 'configuration' | 'platform' | 'verbosity' | 'parallel' | 'devshell';

export const FOCUS_AREAS: FocusArea[] = ['targets', 'settings', 'action', 'output'];
export const SETTING_FIELDS: SettingField[] = ['configuration', 'platform', 'verbosity', 'parallel', 'devshell'];
export const VERBOSITIES = ['quiet', 'minimal', 'normal', 'detailed', 'diagnostic'] as const;

export const TARGET_FILTERS: Array<{ value: BuildTargetFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'solutions', label: 'Solutions' },
  { value: 'projects', label: 'Projects' },
  { value: 'dotnet', label: '.NET' },
  { value: 'msbuild', label: 'MSBuild' },
  { value: 'cmake', label: 'CMake' },
  { value: 'cpp', label: 'C++' },
];

export interface BuildTarget {
  kind: 'solution' | 'project';
  label: string;
  project: ProjectInfo | null;
  solution: SolutionInfo | null;
  path: string;
  buildSystem: BuildSystem;
  projectType?: ProjectInfo['projectType'];
  solutionType?: SolutionInfo['solutionType'];
  searchable: string;
  /** 0 = top-level (solution or standalone project); 1 = child project nested under a solution. */
  depth: 0 | 1;
  /** True for solution rows that contain at least one child project. */
  expandable?: boolean;
  /** Mirrors the store's expansion state for solution rows. */
  expanded?: boolean;
  /** Number of child projects for solution rows. */
  childCount?: number;
  /** For depth-1 child rows: solution.filePath of the parent. */
  parentSolutionPath?: string;
  /** True if the user has pinned this target via the `!` key. */
  isFavourite?: boolean;
  /** True if this target was the most recent build. */
  isLastBuilt?: boolean;
}
