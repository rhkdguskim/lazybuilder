import type { EnvironmentSnapshot } from '../models/EnvironmentSnapshot.js';
import type { ProjectInfo } from '../models/ProjectInfo.js';
import type {
  ToolchainRequirement,
  RequirementReason,
  ToolchainKind,
} from '../models/ToolchainRequirement.js';

const TFM_SUFFIX_TO_WORKLOAD: Record<string, string> = {
  android: 'android',
  ios: 'ios',
  maccatalyst: 'maccatalyst',
  tvos: 'tvos',
  macos: 'macos',
  'browser-wasm': 'wasm-tools',
  browser: 'wasm-tools',
};

interface RequirementDraft {
  kind: ToolchainKind;
  versionSpec: string;
  reasons: RequirementReason[];
}

export function resolveToolchainRequirements(
  snapshot: EnvironmentSnapshot,
  projects: ProjectInfo[],
): ToolchainRequirement[] {
  const drafts = new Map<string, RequirementDraft>();
  const dotnetProjects = projects.filter(
    p => p.projectType === 'dotnet-sdk' || p.projectType === 'dotnet-legacy',
  );

  if (dotnetProjects.length === 0 && !snapshot.dotnet.globalJsonPath) {
    return [];
  }

  if (
    snapshot.dotnet.globalJsonPath &&
    snapshot.dotnet.globalJsonSdkVersion
  ) {
    const version = snapshot.dotnet.globalJsonSdkVersion;
    addDraft(drafts, 'dotnet-sdk', version, {
      source: 'global.json',
      filePath: snapshot.dotnet.globalJsonPath,
      detail: `sdk.version=${version}`,
      affectedProjects: dotnetProjects.map(p => p.name),
    });
  }

  for (const project of dotnetProjects) {
    for (const tfm of project.targetFrameworks) {
      const sdkSpec = tfmToSdkSpec(tfm);
      if (sdkSpec) {
        addDraft(drafts, 'dotnet-sdk', sdkSpec, {
          source: 'csproj',
          filePath: project.filePath,
          detail: `TargetFramework=${tfm}`,
          affectedProjects: [project.name],
        });
      }

      const workload = tfmToWorkload(tfm);
      if (workload) {
        addDraft(drafts, 'dotnet-workload', workload, {
          source: 'inferred',
          filePath: project.filePath,
          detail: `TFM suffix → workload`,
          affectedProjects: [project.name],
        });
      }
    }
  }

  return [...drafts.values()].map(draft => buildRequirement(draft, snapshot));
}

function addDraft(
  drafts: Map<string, RequirementDraft>,
  kind: ToolchainKind,
  versionSpec: string,
  reason: RequirementReason,
): void {
  const key = `${kind}::${versionSpec}`;
  const existing = drafts.get(key);
  if (existing) {
    existing.reasons.push(reason);
    return;
  }
  drafts.set(key, { kind, versionSpec, reasons: [reason] });
}

function buildRequirement(
  draft: RequirementDraft,
  snapshot: EnvironmentSnapshot,
): ToolchainRequirement {
  const id = `${draft.kind}-${draft.versionSpec}`;
  const merged = mergeReasons(draft.reasons);
  const installed = isCurrentlyInstalled(draft.kind, draft.versionSpec, snapshot);

  return {
    id,
    kind: draft.kind,
    versionSpec: draft.versionSpec,
    resolvedVersion: resolveExactVersion(draft.kind, draft.versionSpec, snapshot),
    reason: merged,
    currentlyInstalled: installed,
    severity: 'required',
  };
}

function mergeReasons(reasons: RequirementReason[]): RequirementReason {
  if (reasons.length === 1) return reasons[0]!;

  const projects = new Set<string>();
  for (const r of reasons) {
    for (const p of r.affectedProjects) projects.add(p);
  }

  const primary = reasons.find(r => r.source === 'global.json') ?? reasons[0]!;
  return {
    source: primary.source,
    filePath: primary.filePath,
    detail: primary.detail,
    affectedProjects: [...projects],
  };
}

function tfmToSdkSpec(tfm: string): string | null {
  const modern = tfm.match(/^net(\d+)\.(\d+)(?:-[a-z0-9.]+)?$/i);
  if (modern) {
    return `${modern[1]}.${modern[2]}.x`;
  }
  if (tfm.startsWith('netstandard')) {
    return null;
  }
  return null;
}

function tfmToWorkload(tfm: string): string | null {
  const match = tfm.match(/^net\d+\.\d+-([a-z0-9.]+)$/i);
  if (!match) return null;
  const suffix = match[1]!.toLowerCase();
  return TFM_SUFFIX_TO_WORKLOAD[suffix] ?? null;
}

function isCurrentlyInstalled(
  kind: ToolchainKind,
  versionSpec: string,
  snapshot: EnvironmentSnapshot,
): boolean {
  if (kind === 'dotnet-sdk') {
    return snapshot.dotnet.sdks.some(s => versionSatisfies(s.version, versionSpec));
  }
  if (kind === 'dotnet-runtime') {
    return snapshot.dotnet.runtimes.some(r => versionSatisfies(r.version, versionSpec));
  }
  if (kind === 'dotnet-workload') {
    return snapshot.dotnet.workloads.includes(versionSpec);
  }
  return false;
}

function resolveExactVersion(
  kind: ToolchainKind,
  versionSpec: string,
  snapshot: EnvironmentSnapshot,
): string | null {
  if (kind !== 'dotnet-sdk') return null;
  if (!versionSpec.endsWith('.x')) return versionSpec;

  const prefix = versionSpec.slice(0, -1);
  const matches = snapshot.dotnet.sdks
    .filter(s => s.version.startsWith(prefix))
    .map(s => s.version)
    .sort(comparePatchVersions)
    .reverse();
  return matches[0] ?? null;
}

function versionSatisfies(installed: string, spec: string): boolean {
  if (spec.endsWith('.x')) {
    return installed.startsWith(spec.slice(0, -1));
  }
  return installed === spec;
}

function comparePatchVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}
