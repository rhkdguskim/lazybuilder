import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { PageHeader, Panel, LoadingState, ErrorState, KeyHints, ScrollPane, TabFrame } from '../components/index.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import { compactPath, truncateEnd } from '../utils/text.js';
import { theme } from '../themes/theme.js';
import { symbols } from '../themes/colors.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';

type Category = 'dotnet' | 'msbuild' | 'vs' | 'cpp' | 'winsdk' | 'cmake' | 'packages';
type Focus = 'categories' | 'detail';

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
  const { stdout } = useStdout();
  const rows = stdout?.rows ?? 30;

  const isActiveTab = useAppStore(s => s.activeTab) === 'environment';
  const snapshot = useAppStore(s => s.snapshot);
  const envStatus = useAppStore(s => s.envScanStatus);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [detailScroll, setDetailScroll] = useState(0);
  const [focus, setFocus] = useState<Focus>('categories');

  const selectedCategory = CATEGORIES[selectedIdx]!;

  // Reset scroll when category changes
  useEffect(() => { setDetailScroll(0); }, [selectedCategory.id]);

  const detailItems = useMemo<React.ReactNode[]>(
    () => snapshot ? renderCategoryDetail(snapshot, selectedCategory.id) : [],
    [snapshot, selectedCategory.id],
  );

  // Reserve rows for: page header (3), category panel chrome (3), tab bar/footer (≈6).
  // The detail panel gets whatever's left.
  const visibleHeight = Math.max(6, rows - 14);

  useInput((input, key) => {
    if (key.tab) {
      setFocus(f => f === 'categories' ? 'detail' : 'categories');
      return;
    }

    if (focus === 'categories') {
      if (input === 'g') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'top'));
      if (input === 'G') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'bottom'));
      if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'up'));
      if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, CATEGORIES.length, 'down'));
      if (key.rightArrow || input === 'l' || key.return) setFocus('detail');
      return;
    }

    // detail focus — scroll vertically
    const max = Math.max(0, detailItems.length - visibleHeight);
    if (input === 'g') setDetailScroll(0);
    if (input === 'G') setDetailScroll(max);
    if (key.upArrow || input === 'k') setDetailScroll(o => Math.max(0, o - 1));
    if (key.downArrow || input === 'j') setDetailScroll(o => Math.min(max, o + 1));
    if (key.pageUp || (key.ctrl && input === 'b')) setDetailScroll(o => Math.max(0, o - visibleHeight));
    if (key.pageDown || (key.ctrl && input === 'f')) setDetailScroll(o => Math.min(max, o + visibleHeight));
    if (key.leftArrow || input === 'h' || key.escape) setFocus('categories');
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  if (envStatus !== 'done' || !snapshot) {
    return (
      <TabFrame>
        <PageHeader title="Environment" subtitle="Installed tools, SDKs, and build prerequisites." />
        {envStatus === 'error' ? (
          <ErrorState
            title="Environment scan failed"
            hint="Try a reload from Settings — most failures are transient (PATH, permissions)."
            actions={[{ key: '8', label: 'Open Settings' }]}
          />
        ) : (
          <LoadingState label="Scanning environment" hint="Detecting .NET, MSBuild, C++ toolchain, CMake, Windows SDK." />
        )}
      </TabFrame>
    );
  }

  const detailRightHint = detailItems.length > visibleHeight
    ? `${detailScroll + 1}–${Math.min(detailItems.length, detailScroll + visibleHeight)} / ${detailItems.length}`
    : `${detailItems.length} item${detailItems.length === 1 ? '' : 's'}`;

  return (
    <TabFrame>
      <PageHeader title="Environment" subtitle="Installed tools, SDKs, and build prerequisites." />

      <Box flexDirection="row" flexGrow={1} overflowY="hidden">
        <Box flexDirection="column" width={28} paddingRight={1} overflowY="hidden">
          <Panel
            title="Categories"
            focused={focus === 'categories'}
            minHeight={10}
            flexGrow={1}
            subtitle={focus === 'categories' ? 'j/k move · Tab → detail' : 'Tab to focus'}
          >
            {CATEGORIES.map((cat, i) => {
              const isSelected = i === selectedIdx;
              return (
                <Text
                  key={cat.id}
                  inverse={isSelected && focus === 'categories'}
                  color={(isSelected ? theme.color.accent.primary : undefined) as any}
                  bold={isSelected}
                  wrap="truncate"
                >
                  {isSelected ? `${theme.glyphs.focus} ` : '  '}{cat.label}
                </Text>
              );
            })}
          </Panel>
        </Box>

        <Box flexDirection="column" flexGrow={1} overflowY="hidden">
          <Panel
            title={selectedCategory.label}
            focused={focus === 'detail'}
            minHeight={10}
            flexGrow={1}
            rightHint={detailRightHint}
            subtitle={focus === 'detail' ? 'j/k scroll · g/G top/bottom · Tab → categories' : 'Tab to focus'}
          >
            <ScrollPane items={detailItems} scrollOffset={detailScroll} visibleHeight={visibleHeight} />
          </Panel>
        </Box>
      </Box>

      <Box flexShrink={0}>
        <KeyHints
          context={`Environment › ${focus === 'categories' ? 'Categories' : selectedCategory.label}`}
          hints={focus === 'categories'
            ? [
                { key: 'j/k', label: 'Category' },
                { key: 'g/G', label: 'Top/Bottom' },
                { key: 'Tab', label: 'Detail', primary: true },
              ]
            : [
                { key: 'j/k', label: 'Scroll' },
                { key: '⌃F/⌃B', label: 'Page' },
                { key: 'g/G', label: 'Top/Bottom' },
                { key: 'Tab', label: 'Categories' },
              ]}
        />
      </Box>
    </TabFrame>
  );
};

const PathLine: React.FC<{ label?: string; value: string }> = ({ label = 'Path', value }) => (
  <Text color={theme.color.text.muted as any} wrap="truncate">  {label}: {compactPath(value, 56)}</Text>
);

function renderCategoryDetail(snapshot: EnvironmentSnapshot, category: Category): React.ReactNode[] {
  switch (category) {
    case 'dotnet': {
      const { dotnet } = snapshot;
      const out: React.ReactNode[] = [];
      out.push(
        <StatusBadge
          key="dotnet-cli"
          severity={dotnet.tool.detected ? 'ok' : 'error'}
          label="dotnet CLI"
          detail={dotnet.tool.version ?? 'not found'}
        />,
      );
      if (dotnet.tool.path) out.push(<PathLine key="dotnet-path" value={dotnet.tool.path} />);
      out.push(<Text key="sdk-h" bold>Installed SDKs ({dotnet.sdks.length})</Text>);
      if (dotnet.sdks.length === 0) {
        out.push(<Text key="sdk-empty" color={theme.color.text.muted as any}>  None</Text>);
      } else {
        dotnet.sdks.forEach((sdk, i) => {
          out.push(
            <Text key={`sdk-${i}`} wrap="truncate">
              {'  '}{sdk.version} <Text color={theme.color.text.muted as any}>[{compactPath(sdk.installedPath, 40)}]</Text>
            </Text>,
          );
        });
      }
      out.push(<Text key="rt-h" bold>Runtimes ({dotnet.runtimes.length})</Text>);
      if (dotnet.runtimes.length === 0) {
        out.push(<Text key="rt-empty" color={theme.color.text.muted as any}>  None</Text>);
      } else {
        dotnet.runtimes.forEach((rt, i) => {
          out.push(<Text key={`rt-${i}`} wrap="truncate">  {rt.version}</Text>);
        });
      }
      out.push(<Text key="wl-h" bold>Workloads ({dotnet.workloads.length})</Text>);
      if (dotnet.workloads.length === 0) {
        out.push(<Text key="wl-empty" color={theme.color.text.muted as any}>  None</Text>);
      } else {
        dotnet.workloads.forEach((w, i) => {
          out.push(<Text key={`wl-${i}`} wrap="truncate">  {truncateEnd(w, 52)}</Text>);
        });
      }
      return out;
    }
    case 'msbuild': {
      const { msbuild } = snapshot;
      if (msbuild.instances.length === 0) {
        return [<Text key="empty" color={theme.color.status.warning as any}>No MSBuild instances found</Text>];
      }
      const out: React.ReactNode[] = [];
      msbuild.instances.forEach((inst, i) => {
        out.push(
          <StatusBadge key={`m-${i}`} severity="ok" label={`MSBuild ${inst.architecture ?? ''}`} detail={inst.version ?? ''} />,
        );
        out.push(<PathLine key={`m-${i}-p`} value={inst.path ?? 'unknown'} />);
        out.push(<Text key={`m-${i}-s`} color={theme.color.text.muted as any} wrap="truncate">  Source: {inst.source}</Text>);
        if (i < msbuild.instances.length - 1) out.push(<Text key={`m-${i}-sep`}> </Text>);
      });
      return out;
    }
    case 'vs': {
      const { visualStudio } = snapshot;
      if (visualStudio.installations.length === 0) {
        return [<Text key="empty" color={theme.color.status.warning as any}>No Visual Studio installations found</Text>];
      }
      const out: React.ReactNode[] = [];
      visualStudio.installations.forEach((vs) => {
        out.push(
          <Text key={`${vs.instanceId}-h`} bold wrap="truncate">
            {vs.displayName} <Text color={theme.color.text.muted as any}>({vs.edition})</Text>
          </Text>,
        );
        out.push(<Text key={`${vs.instanceId}-v`} wrap="truncate">  Version: {vs.version}</Text>);
        out.push(<PathLine key={`${vs.instanceId}-p`} value={vs.installPath} />);
        out.push(<StatusBadge key={`${vs.instanceId}-msb`} severity={vs.hasMsBuild ? 'ok' : 'warning'} label="  MSBuild" />);
        out.push(<StatusBadge key={`${vs.instanceId}-vc`} severity={vs.hasVcTools ? 'ok' : 'warning'} label="  VC++ Tools" />);
        out.push(<StatusBadge key={`${vs.instanceId}-sdk`} severity={vs.hasWindowsSdk ? 'ok' : 'warning'} label="  Windows SDK" />);
        out.push(<Text key={`${vs.instanceId}-sep`}> </Text>);
      });
      return out;
    }
    case 'cpp': {
      const { cpp } = snapshot;
      const out: React.ReactNode[] = [];
      out.push(<StatusBadge key="cl" severity={cpp.clExe?.detected ? 'ok' : 'error'} label="cl.exe" detail={cpp.clExe?.version ?? 'not found'} />);
      if (cpp.clExe?.path) out.push(<PathLine key="cl-p" value={cpp.clExe.path} />);
      out.push(<StatusBadge key="link" severity={cpp.linkExe?.detected ? 'ok' : 'warning'} label="link.exe" />);
      out.push(<StatusBadge key="lib" severity={cpp.libExe?.detected ? 'ok' : 'warning'} label="lib.exe" />);
      out.push(<StatusBadge key="dump" severity={cpp.dumpbinExe?.detected ? 'ok' : 'unknown'} label="dumpbin.exe" />);
      out.push(
        <Text key="vc-env">
          VC Environment Active:{' '}
          {cpp.vcEnvironmentActive
            ? <Text color={theme.color.status.ok as any}>Yes</Text>
            : <Text color={theme.color.status.warning as any}>No</Text>}
        </Text>,
      );
      if (cpp.vcvarsPath) out.push(<PathLine key="vc-p" label="vcvarsall.bat" value={cpp.vcvarsPath} />);
      out.push(<Text key="ts-h" bold>MSVC Toolsets ({cpp.toolsets.length})</Text>);
      if (cpp.toolsets.length === 0) {
        out.push(<Text key="ts-empty" color={theme.color.text.muted as any}>  None</Text>);
      } else {
        cpp.toolsets.forEach((t, i) => {
          out.push(
            <Text key={`ts-${i}`} wrap="truncate">
              {'  '}v{t.version} <Text color={theme.color.text.muted as any}>[{compactPath(t.installedPath, 40)}]</Text>
            </Text>,
          );
        });
      }
      return out;
    }
    case 'winsdk': {
      const { windowsSdk } = snapshot;
      if (windowsSdk.versions.length === 0) {
        return [<Text key="empty" color={theme.color.status.warning as any}>No Windows SDK found</Text>];
      }
      const win10 = windowsSdk.versions.filter(v => /^\d+\.\d+\.\d+\.\d+$/.test(v.version));
      const win81 = windowsSdk.versions.filter(v => v.version === '8.1' || v.version.startsWith('v8.1'));
      const win80 = windowsSdk.versions.filter(v => v.version === '8.0' || v.version.startsWith('v8.0'));
      const win7 = windowsSdk.versions.filter(v => v.version.startsWith('v7.') || v.version.startsWith('v6.'));
      const other = windowsSdk.versions.filter(v =>
        !win10.includes(v) && !win81.includes(v) && !win80.includes(v) && !win7.includes(v),
      );

      const out: React.ReactNode[] = [];
      const groups: Array<[string, typeof windowsSdk.versions]> = [
        ['Windows 10/11 SDK', win10],
        ['Windows 8.1 SDK', win81],
        ['Windows 8.0 SDK', win80],
        ['Windows 7 / Legacy SDK', win7],
        ['Other SDK', other],
      ];
      for (const [label, group] of groups) {
        if (group.length === 0) continue;
        out.push(<Text key={`g-${label}`} bold>{label}</Text>);
        group.forEach(v => {
          out.push(
            <Text key={`${label}-${v.version}-${v.installedPath}`} wrap="truncate">
              {'  '}<Text color={theme.color.status.ok as any}>{symbols.ok}</Text>{' '}
              {v.version} <Text color={theme.color.text.muted as any}>[{compactPath(v.installedPath, 38)}]</Text>
            </Text>,
          );
        });
      }
      out.push(<Text key="total" color={theme.color.text.muted as any}>Total: {windowsSdk.versions.length} SDK version(s) detected</Text>);
      return out;
    }
    case 'cmake': {
      const out: React.ReactNode[] = [];
      out.push(<StatusBadge key="cm" severity={snapshot.cmake?.detected ? 'ok' : 'unknown'} label="CMake" detail={snapshot.cmake?.version ?? 'not found'} />);
      if (snapshot.cmake?.path) out.push(<PathLine key="cm-p" value={snapshot.cmake.path} />);
      out.push(<StatusBadge key="nj" severity={snapshot.ninja?.detected ? 'ok' : 'unknown'} label="Ninja" detail={snapshot.ninja?.version ?? 'not found'} />);
      return out;
    }
    case 'packages': {
      const { packageManagers } = snapshot;
      return [
        <StatusBadge key="nuget" severity={packageManagers.nuget?.detected ? 'ok' : 'unknown'} label="NuGet" detail={packageManagers.nuget?.version ?? 'not found'} />,
        <StatusBadge key="vcpkg" severity={packageManagers.vcpkg?.detected ? 'ok' : 'unknown'} label="vcpkg" detail={packageManagers.vcpkg?.version ?? 'not found'} />,
        <StatusBadge key="conan" severity={packageManagers.conan?.detected ? 'ok' : 'unknown'} label="Conan" detail={packageManagers.conan?.version ?? 'not found'} />,
        <StatusBadge key="git" severity={snapshot.git?.detected ? 'ok' : 'warning'} label="Git" detail={snapshot.git?.version ?? 'not found'} />,
        <StatusBadge key="ps" severity={snapshot.powershell?.detected ? 'ok' : 'unknown'} label="PowerShell" detail={snapshot.powershell?.version ?? 'not found'} />,
      ];
    }
  }
}
