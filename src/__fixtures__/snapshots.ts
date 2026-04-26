import type { EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import { createEmptySnapshot } from '../domain/models/EnvironmentSnapshot.js';
import type { SdkInfo } from '../domain/models/SdkInfo.js';

export function makeSdk(version: string, path = `~/.dotnet/sdk/${version}`): SdkInfo {
  return {
    sdkType: 'dotnet-sdk',
    version,
    installedPath: path,
    isSelected: false,
    isRequired: false,
    status: 'ok',
  };
}

export function makeSnapshot(overrides: Partial<EnvironmentSnapshot> = {}): EnvironmentSnapshot {
  const base = createEmptySnapshot();
  base.dotnet.tool = {
    name: 'dotnet',
    path: '/usr/local/bin/dotnet',
    version: '8.0.405',
    detected: true,
    source: 'PATH',
    architecture: 'x64',
    notes: [],
  };
  return { ...base, ...overrides };
}

export function snapshotWithSdks(versions: string[]): EnvironmentSnapshot {
  const snap = makeSnapshot();
  snap.dotnet.sdks = versions.map(v => makeSdk(v));
  return snap;
}

export function snapshotWithGlobalJson(
  version: string,
  versions: string[] = [],
): EnvironmentSnapshot {
  const snap = snapshotWithSdks(versions);
  snap.dotnet.globalJsonPath = '/proj/global.json';
  snap.dotnet.globalJsonSdkVersion = version;
  return snap;
}
