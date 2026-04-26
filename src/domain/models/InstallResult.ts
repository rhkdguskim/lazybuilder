import type { InstallPlan } from './InstallPlan.js';
import type { InstallProgress } from './InstallProgress.js';
import type { ToolchainRequirement } from './ToolchainRequirement.js';

export interface InstallResult {
  plan: InstallPlan;
  progress: InstallProgress;
  durationMs: number;
  postScanSucceeded: boolean;
  pathUpdated: boolean;
  globalJsonUpdated: boolean;
  unresolvedRequirements: ToolchainRequirement[];
}
