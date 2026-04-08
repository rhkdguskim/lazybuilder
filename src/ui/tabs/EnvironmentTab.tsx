import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import type { Severity } from '../../domain/enums.js';

type Category = 'dotnet' | 'msbuild' | 'vs' | 'cpp' | 'winsdk' | 'cmake' | 'packages';

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'dotnet', label: '.NET SDK / Runtime' },
  { id: 'msbuild', label: 'MSBuild' },
  { id: 'vs', label: 'Visual Studio' },
  { id: 'cpp', label: 'C++ Toolchain' },
  { id: 'winsdk', label: 'Windows SDK' },
  { id: 'cmake', label: 'CMake / Ninja' },
  { id: 'packages', label: 'Package Managers' },
];

export const EnvironmentTab: React.FC = () => {
  const snapshot = useAppStore(s => s.snapshot);
  const envStatus = useAppStore(s => s.envScanStatus);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useInput((input, key) => {
    if (input === 'g') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'top'));
    if (input === 'G') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'bottom'));
    if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'up'));
    if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'down'));
  }, { isActive: !!process.stdin.isTTY });

  if (envStatus !== 'done' || !snapshot) {
    return (
      <Box padding={1}>
        <ProgressPanel label="Scanning environment..." status={envStatus === 'error' ? 'error' : 'scanning'} />
      </Box>
    );
  }

  const selectedCategory = CATEGORIES[selectedIdx]!;

  return (
    <Box flexDirection="row" padding={1} flexGrow={1} overflowY="hidden">
      {/* Left: Category list */}
      <Box flexDirection="column" width={28} borderStyle="single" paddingX={1}>
        <Text bold color="cyan">Categories</Text>
        <Text color="gray">j/k or ↑↓ move, g/G jump</Text>
        {CATEGORIES.map((cat, i) => (
          <Text key={cat.id} inverse={i === selectedIdx} color={i === selectedIdx ? 'blue' : undefined}>
            {i === selectedIdx ? ' ▶ ' : '   '}{cat.label}
          </Text>
        ))}
      </Box>

      {/* Right: Details */}
      <Box flexDirection="column" flexGrow={1} paddingLeft={2} overflowY="hidden">
        <Text bold color="cyan">{'─── '}{selectedCategory.label}{' ───'}</Text>
        <Box height={1} />
        {renderCategoryDetail(snapshot, selectedCategory.id)}
      </Box>
    </Box>
  );
};

function renderCategoryDetail(snapshot: NonNullable<ReturnType<typeof useAppStore.getState>['snapshot']>, category: Category): React.ReactNode {
  switch (category) {
    case 'dotnet': {
      const { dotnet } = snapshot;
      return (
        <Box flexDirection="column">
          <StatusBadge severity={dotnet.tool.detected ? 'ok' : 'error'} label="dotnet CLI" detail={dotnet.tool.version ?? 'not found'} />
          {dotnet.tool.path && <Text color="gray">  Path: {dotnet.tool.path}</Text>}
          <Box height={1} />
          <Text bold>Installed SDKs:</Text>
          {dotnet.sdks.length === 0 && <Text color="gray">  None</Text>}
          {dotnet.sdks.map(sdk => (
            <Text key={sdk.version}>  {sdk.version} <Text color="gray">[{sdk.installedPath}]</Text></Text>
          ))}
          <Box height={1} />
          <Text bold>Runtimes:</Text>
          {dotnet.runtimes.length === 0 && <Text color="gray">  None</Text>}
          {dotnet.runtimes.map((rt, i) => (
            <Text key={i}>  {rt.version}</Text>
          ))}
          <Box height={1} />
          <Text bold>Workloads:</Text>
          {dotnet.workloads.length === 0 && <Text color="gray">  None</Text>}
          {dotnet.workloads.map(w => <Text key={w}>  {w}</Text>)}
          <Box height={1} />
          {dotnet.globalJsonPath ? (
            <Text>global.json: <Text color="cyan">{dotnet.globalJsonSdkVersion ?? 'no version'}</Text> <Text color="gray">[{dotnet.globalJsonPath}]</Text></Text>
          ) : (
            <Text color="gray">global.json: not found</Text>
          )}
        </Box>
      );
    }
    case 'msbuild': {
      const { msbuild } = snapshot;
      return (
        <Box flexDirection="column">
          {msbuild.instances.length === 0 && <Text color="yellow">No MSBuild instances found</Text>}
          {msbuild.instances.map((inst, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <StatusBadge severity="ok" label={`MSBuild ${inst.architecture ?? ''}`} detail={inst.version ?? ''} />
              <Text color="gray">  Path: {inst.path}</Text>
              <Text color="gray">  Source: {inst.source}</Text>
            </Box>
          ))}
        </Box>
      );
    }
    case 'vs': {
      const { visualStudio } = snapshot;
      return (
        <Box flexDirection="column">
          {visualStudio.installations.length === 0 && <Text color="yellow">No Visual Studio installations found</Text>}
          {visualStudio.installations.map(vs => (
            <Box key={vs.instanceId} flexDirection="column" marginBottom={1}>
              <Text bold>{vs.displayName} <Text color="gray">({vs.edition})</Text></Text>
              <Text>  Version: {vs.version}</Text>
              <Text>  Path: <Text color="gray">{vs.installPath}</Text></Text>
              <StatusBadge severity={vs.hasMsBuild ? 'ok' : 'warning'} label="  MSBuild" />
              <StatusBadge severity={vs.hasVcTools ? 'ok' : 'warning'} label="  VC++ Tools" />
              <StatusBadge severity={vs.hasWindowsSdk ? 'ok' : 'warning'} label="  Windows SDK" />
            </Box>
          ))}
        </Box>
      );
    }
    case 'cpp': {
      const { cpp } = snapshot;
      return (
        <Box flexDirection="column">
          <StatusBadge severity={cpp.clExe?.detected ? 'ok' : 'error'} label="cl.exe" detail={cpp.clExe?.version ?? 'not found'} />
          {cpp.clExe?.path && <Text color="gray">  Path: {cpp.clExe.path}</Text>}
          <StatusBadge severity={cpp.linkExe?.detected ? 'ok' : 'warning'} label="link.exe" />
          <StatusBadge severity={cpp.libExe?.detected ? 'ok' : 'warning'} label="lib.exe" />
          <StatusBadge severity={cpp.dumpbinExe?.detected ? 'ok' : 'unknown'} label="dumpbin.exe" />
          <Box height={1} />
          <Text>VC Environment Active: {cpp.vcEnvironmentActive ? <Text color="green">Yes</Text> : <Text color="yellow">No</Text>}</Text>
          {cpp.vcvarsPath && <Text color="gray">vcvarsall.bat: {cpp.vcvarsPath}</Text>}
          <Box height={1} />
          <Text bold>MSVC Toolsets:</Text>
          {cpp.toolsets.length === 0 && <Text color="gray">  None</Text>}
          {cpp.toolsets.map(t => (
            <Text key={t.version}>  v{t.version} <Text color="gray">[{t.installedPath}]</Text></Text>
          ))}
        </Box>
      );
    }
    case 'winsdk': {
      const { windowsSdk } = snapshot;
      // Group by SDK family
      const win10 = windowsSdk.versions.filter(v => /^\d+\.\d+\.\d+\.\d+$/.test(v.version));
      const win81 = windowsSdk.versions.filter(v => v.version === '8.1' || v.version.startsWith('v8.1'));
      const win80 = windowsSdk.versions.filter(v => v.version === '8.0' || v.version.startsWith('v8.0'));
      const win7 = windowsSdk.versions.filter(v => v.version.startsWith('v7.') || v.version.startsWith('v6.'));
      const other = windowsSdk.versions.filter(v =>
        !win10.includes(v) && !win81.includes(v) && !win80.includes(v) && !win7.includes(v),
      );

      return (
        <Box flexDirection="column">
          {windowsSdk.versions.length === 0 && <Text color="yellow">No Windows SDK found</Text>}

          {win10.length > 0 && (
            <>
              <Text bold>Windows 10/11 SDK:</Text>
              {win10.map(v => (
                <Text key={v.version + v.installedPath}>  <Text color="green">✔</Text> {v.version} <Text color="gray">[{v.installedPath}]</Text></Text>
              ))}
              <Box height={1} />
            </>
          )}

          {win81.length > 0 && (
            <>
              <Text bold>Windows 8.1 SDK:</Text>
              {win81.map(v => (
                <Text key={v.version + v.installedPath}>  <Text color="green">✔</Text> {v.version} <Text color="gray">[{v.installedPath}]</Text></Text>
              ))}
              <Box height={1} />
            </>
          )}

          {win80.length > 0 && (
            <>
              <Text bold>Windows 8.0 SDK:</Text>
              {win80.map(v => (
                <Text key={v.version + v.installedPath}>  <Text color="green">✔</Text> {v.version} <Text color="gray">[{v.installedPath}]</Text></Text>
              ))}
              <Box height={1} />
            </>
          )}

          {win7.length > 0 && (
            <>
              <Text bold>Windows 7 / Legacy SDK:</Text>
              {win7.map(v => (
                <Text key={v.version + v.installedPath}>  <Text color="green">✔</Text> {v.version} <Text color="gray">[{v.installedPath}]</Text></Text>
              ))}
              <Box height={1} />
            </>
          )}

          {other.length > 0 && (
            <>
              <Text bold>Other SDK:</Text>
              {other.map(v => (
                <Text key={v.version + v.installedPath}>  <Text color="green">✔</Text> {v.version} <Text color="gray">[{v.installedPath}]</Text></Text>
              ))}
            </>
          )}

          <Text color="gray">Total: {windowsSdk.versions.length} SDK version(s) detected</Text>
        </Box>
      );
    }
    case 'cmake': {
      return (
        <Box flexDirection="column">
          <StatusBadge severity={snapshot.cmake?.detected ? 'ok' : 'unknown'} label="CMake" detail={snapshot.cmake?.version ?? 'not found'} />
          {snapshot.cmake?.path && <Text color="gray">  Path: {snapshot.cmake.path}</Text>}
          <Box height={1} />
          <StatusBadge severity={snapshot.ninja?.detected ? 'ok' : 'unknown'} label="Ninja" detail={snapshot.ninja?.version ?? 'not found'} />
        </Box>
      );
    }
    case 'packages': {
      const { packageManagers } = snapshot;
      return (
        <Box flexDirection="column">
          <StatusBadge severity={packageManagers.nuget?.detected ? 'ok' : 'unknown'} label="NuGet" detail={packageManagers.nuget?.version ?? 'not found'} />
          <StatusBadge severity={packageManagers.vcpkg?.detected ? 'ok' : 'unknown'} label="vcpkg" detail={packageManagers.vcpkg?.version ?? 'not found'} />
          <StatusBadge severity={packageManagers.conan?.detected ? 'ok' : 'unknown'} label="Conan" detail={packageManagers.conan?.version ?? 'not found'} />
          <Box height={1} />
          <StatusBadge severity={snapshot.git?.detected ? 'ok' : 'warning'} label="Git" detail={snapshot.git?.version ?? 'not found'} />
          <StatusBadge severity={snapshot.powershell?.detected ? 'ok' : 'unknown'} label="PowerShell" detail={snapshot.powershell?.version ?? 'not found'} />
        </Box>
      );
    }
  }
}
