export type ToolchainKind =
  | 'dotnet-sdk'
  | 'dotnet-runtime'
  | 'dotnet-workload'
  | 'msvc-toolset'
  | 'windows-sdk'
  | 'cmake'
  | 'ninja';

export type ToolchainSeverity = 'required' | 'recommended';

export interface RequirementReason {
  source: 'global.json' | 'csproj' | 'directory.build.props' | 'inferred';
  filePath: string | null;
  detail: string;
  affectedProjects: string[];
}

export interface ToolchainRequirement {
  id: string;
  kind: ToolchainKind;
  versionSpec: string;
  resolvedVersion: string | null;
  reason: RequirementReason;
  currentlyInstalled: boolean;
  severity: ToolchainSeverity;
}
