import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { PageHeader, Panel } from '../components/index.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import { compactPath, truncateEnd } from '../utils/text.js';
import { glyphs, symbols } from '../themes/colors.js';

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
  const isActiveTab = useAppStore(s => s.activeTab) === 'environment';
  const snapshot = useAppStore(s => s.snapshot);
  const envStatus = useAppStore(s => s.envScanStatus);
  const [selectedIdx, setSelectedIdx] = useState(0);

  useInput((input, key) => {
    if (input === 'g') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'top'));
    if (input === 'G') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'bottom'));
    if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'up'));
    if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'down'));
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  if (envStatus !== 'done' || !snapshot) {
    return (
      <Box padding={1}>
        <ProgressPanel label="Scanning environment..." status={envStatus === 'error' ? 'error' : 'scanning'} />
      </Box>
    );
  }

  const selectedCategory = CATEGORIES[selectedIdx]!;

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} flexGrow={1} overflowY="hidden">
      <PageHeader
        title="Environment"
        subtitle="Installed tools, SDKs, and build prerequisites."
        rightHint="j/k move | g/G jump"
      />

      <Box flexDirection="row" flexGrow={1} overflowY="hidden">
        <Box flexDirection="column" width={28} paddingRight={1} overflowY="hidden">
          <Panel title="Categories" minHeight={10} flexGrow={1}>
            {CATEGORIES.map((cat, i) => (
              <Text key={cat.id} inverse={i === selectedIdx} color={i === selectedIdx ? 'blue' : undefined} wrap="truncate">
                {i === selectedIdx ? ` ${glyphs.play} ` : '   '}{cat.label}
              </Text>
            ))}
          </Panel>
        </Box>

        <Box flexDirection="column" flexGrow={1} overflowY="hidden">
          <Panel title={selectedCategory.label} minHeight={10} flexGrow={1}>
            {renderCategoryDetail(snapshot, selectedCategory.id)}
          </Panel>
        </Box>
      </Box>
    </Box>
  );
};

const MoreLine: React.FC<{ hidden: number }> = ({ hidden }) => (
  hidden > 0 ? <Text color="gray" wrap="truncate">  ... {hidden} more</Text> : null
);

const PathLine: React.FC<{ label?: string; value: string }> = ({ label = 'Path', value }) => (
  <Text color="gray" wrap="truncate">  {label}: {compactPath(value, 56)}</Text>
);

function renderCategoryDetail(snapshot: NonNullable<ReturnType<typeof useAppStore.getState>['snapshot']>, category: Category): React.ReactNode {
  switch (category) {
    case 'dotnet': {
      const { dotnet } = snapshot;
      return (
        <Box flexDirection="column">
          <StatusBadge severity={dotnet.tool.detected ? 'ok' : 'error'} label="dotnet CLI" detail={dotnet.tool.version ?? 'not found'} />
          {dotnet.tool.path && <PathLine value={dotnet.tool.path} />}
          <Text bold>Installed SDKs:</Text>
          {dotnet.sdks.length === 0 && <Text color="gray">  None</Text>}
          {dotnet.sdks.slice(0, 4).map(sdk => (
            <Text key={sdk.version} wrap="truncate">  {sdk.version} <Text color="gray">[{compactPath(sdk.installedPath, 40)}]</Text></Text>
          ))}
          <MoreLine hidden={Math.max(0, dotnet.sdks.length - 4)} />
          <Text bold>Runtimes:</Text>
          {dotnet.runtimes.length === 0 && <Text color="gray">  None</Text>}
          {dotnet.runtimes.slice(0, 4).map((rt, i) => (
            <Text key={i} wrap="truncate">  {rt.version}</Text>
          ))}
          <MoreLine hidden={Math.max(0, dotnet.runtimes.length - 4)} />
          <Text bold>Workloads:</Text>
          {dotnet.workloads.length === 0 && <Text color="gray">  None</Text>}
          {dotnet.workloads.slice(0, 3).map(w => <Text key={w} wrap="truncate">  {truncateEnd(w, 52)}</Text>)}
          <MoreLine hidden={Math.max(0, dotnet.workloads.length - 3)} />
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
              <PathLine value={inst.path ?? 'unknown'} />
              <Text color="gray" wrap="truncate">  Source: {inst.source}</Text>
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
              <Text bold wrap="truncate">{vs.displayName} <Text color="gray">({vs.edition})</Text></Text>
              <Text wrap="truncate">  Version: {vs.version}</Text>
              <PathLine value={vs.installPath} />
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
          {cpp.clExe?.path && <PathLine value={cpp.clExe.path} />}
          <StatusBadge severity={cpp.linkExe?.detected ? 'ok' : 'warning'} label="link.exe" />
          <StatusBadge severity={cpp.libExe?.detected ? 'ok' : 'warning'} label="lib.exe" />
          <StatusBadge severity={cpp.dumpbinExe?.detected ? 'ok' : 'unknown'} label="dumpbin.exe" />
          <Text>VC Environment Active: {cpp.vcEnvironmentActive ? <Text color="green">Yes</Text> : <Text color="yellow">No</Text>}</Text>
          {cpp.vcvarsPath && <PathLine label="vcvarsall.bat" value={cpp.vcvarsPath} />}
          <Text bold>MSVC Toolsets:</Text>
          {cpp.toolsets.length === 0 && <Text color="gray">  None</Text>}
          {cpp.toolsets.slice(0, 5).map(t => (
            <Text key={t.version} wrap="truncate">  v{t.version} <Text color="gray">[{compactPath(t.installedPath, 40)}]</Text></Text>
          ))}
          <MoreLine hidden={Math.max(0, cpp.toolsets.length - 5)} />
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
              {win10.slice(0, 5).map(v => (
                <Text key={v.version + v.installedPath} wrap="truncate">  <Text color="green">{symbols.ok}</Text> {v.version} <Text color="gray">[{compactPath(v.installedPath, 38)}]</Text></Text>
              ))}
              <MoreLine hidden={Math.max(0, win10.length - 5)} />
            </>
          )}

          {win81.length > 0 && (
            <>
              <Text bold>Windows 8.1 SDK:</Text>
              {win81.map(v => (
                <Text key={v.version + v.installedPath} wrap="truncate">  <Text color="green">{symbols.ok}</Text> {v.version} <Text color="gray">[{compactPath(v.installedPath, 38)}]</Text></Text>
              ))}
            </>
          )}

          {win80.length > 0 && (
            <>
              <Text bold>Windows 8.0 SDK:</Text>
              {win80.map(v => (
                <Text key={v.version + v.installedPath} wrap="truncate">  <Text color="green">{symbols.ok}</Text> {v.version} <Text color="gray">[{compactPath(v.installedPath, 38)}]</Text></Text>
              ))}
            </>
          )}

          {win7.length > 0 && (
            <>
              <Text bold>Windows 7 / Legacy SDK:</Text>
              {win7.map(v => (
                <Text key={v.version + v.installedPath} wrap="truncate">  <Text color="green">{symbols.ok}</Text> {v.version} <Text color="gray">[{compactPath(v.installedPath, 38)}]</Text></Text>
              ))}
            </>
          )}

          {other.length > 0 && (
            <>
              <Text bold>Other SDK:</Text>
              {other.map(v => (
                <Text key={v.version + v.installedPath} wrap="truncate">  <Text color="green">{symbols.ok}</Text> {v.version} <Text color="gray">[{compactPath(v.installedPath, 38)}]</Text></Text>
              ))}
            </>
          )}

          <Text color="gray" wrap="truncate">Total: {windowsSdk.versions.length} SDK version(s) detected</Text>
        </Box>
      );
    }
    case 'cmake': {
      return (
        <Box flexDirection="column">
          <StatusBadge severity={snapshot.cmake?.detected ? 'ok' : 'unknown'} label="CMake" detail={snapshot.cmake?.version ?? 'not found'} />
          {snapshot.cmake?.path && <PathLine value={snapshot.cmake.path} />}
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
          <StatusBadge severity={snapshot.git?.detected ? 'ok' : 'warning'} label="Git" detail={snapshot.git?.version ?? 'not found'} />
          <StatusBadge severity={snapshot.powershell?.detected ? 'ok' : 'unknown'} label="PowerShell" detail={snapshot.powershell?.version ?? 'not found'} />
        </Box>
      );
    }
  }
}
