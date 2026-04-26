import type { ToolchainKind, RequirementReason } from './ToolchainRequirement.js';

export type InstallScope = 'user' | 'machine';

export interface InstallSource {
  url: string;
  signer: string;
  channel: string;
}

export interface InstallCommandPreview {
  executable: string;
  args: string[];
}

export interface InstallStep {
  id: string;
  displayName: string;
  kind: ToolchainKind;
  version: string;
  scope: InstallScope;
  needsAdmin: boolean;
  sizeBytes: number | null;
  estimatedSeconds: number | null;
  source: InstallSource;
  command: InstallCommandPreview;
  dependsOn: string[];
  selected: boolean;
  reason: RequirementReason;
}

export interface InstallPlan {
  steps: InstallStep[];
  totalSizeBytes: number;
  estimatedSeconds: number;
  needsAdmin: boolean;
  updateGlobalJson: boolean;
  globalJsonPath: string | null;
}
