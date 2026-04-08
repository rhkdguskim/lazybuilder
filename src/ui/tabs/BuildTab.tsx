import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { useBuild } from '../hooks/useBuild.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { PageHeader, Panel } from '../components/index.js';
import type { ProjectInfo, BuildConfiguration, SolutionInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { BuildSystem } from '../../domain/enums.js';

type FocusArea = 'targets' | 'settings' | 'action' | 'output';
type SettingField = 'configuration' | 'platform' | 'verbosity' | 'parallel' | 'devshell';

const FOCUS_AREAS: FocusArea[] = ['targets', 'settings', 'action', 'output'];
const SETTING_FIELDS: SettingField[] = ['configuration', 'platform', 'verbosity', 'parallel', 'devshell'];
const VERBOSITIES = ['quiet', 'minimal', 'normal', 'detailed', 'diagnostic'] as const;

const isTTY = !!process.stdin.isTTY;

export const BuildTab: React.FC = () => {
  const isActiveTab = useAppStore(s => s.activeTab) === 'build';
  const projects = useAppStore(s => s.projects);
  const solutions = useAppStore(s => s.solutions);
  const snapshot = useAppStore(s => s.snapshot);
  const { status, result, start, cancel, resolveCommand } = useBuild();

  // Build targets: solutions + standalone projects
  const targets = useMemo(() => {
    const list: Array<{ label: string; project: ProjectInfo | null; solution: SolutionInfo | null; path: string; buildSystem: BuildSystem }> = [];

    for (const sln of solutions) {
      list.push({
        label: `${sln.name}.sln (${sln.solutionType}, ${sln.projects.length} proj)`,
        project: null,
        solution: sln,
        path: sln.filePath,
        buildSystem: sln.solutionType === 'csharp' ? 'dotnet' : 'msbuild',
      });
    }
    for (const proj of projects.filter(p => !p.solutionPath)) {
      list.push({
        label: `${proj.name} [${proj.projectType}]`,
        project: proj,
        solution: null,
        path: proj.filePath,
        buildSystem: proj.buildSystem,
      });
    }
    return list;
  }, [projects, solutions]);

  // Build settings from store (persisted across tab switches)
  const targetIdx = useAppStore(s => s.buildTargetIdx);
  const setTargetIdx = useAppStore(s => s.setBuildTargetIdx);
  const configIdx = useAppStore(s => s.buildConfigIdx);
  const setConfigIdx = useAppStore(s => s.setBuildConfigIdx);
  const platformIdx = useAppStore(s => s.buildPlatformIdx);
  const setPlatformIdx = useAppStore(s => s.setBuildPlatformIdx);
  const verbosityIdx = useAppStore(s => s.buildVerbosityIdx);
  const setVerbosityIdx = useAppStore(s => s.setBuildVerbosityIdx);
  const parallelBuild = useAppStore(s => s.buildParallel);
  const setParallelBuild = useAppStore(s => s.setBuildParallel);
  const useDevShell = useAppStore(s => s.buildDevShell);
  const setUseDevShell = useAppStore(s => s.setBuildDevShell);
  const buildStartTime = useAppStore(s => s.buildStartTime);

  // Local-only UI state (OK to reset on tab switch)
  const [focusArea, setFocusArea] = useState<FocusArea>('targets');
  const [activeSetting, setActiveSetting] = useState<SettingField>('configuration');
  const [elapsedMs, setElapsedMs] = useState(0);

  // Current target's configurations
  const currentTarget = targets[targetIdx];
  const availableConfigs = useMemo(() => {
    if (!currentTarget) return [{ configuration: 'Debug', platform: 'Any CPU' }];

    if (currentTarget.solution) {
      return currentTarget.solution.configurations.length > 0
        ? currentTarget.solution.configurations
        : [{ configuration: 'Debug', platform: 'Any CPU' }, { configuration: 'Release', platform: 'Any CPU' }];
    }
    if (currentTarget.project) {
      return currentTarget.project.configurations.length > 0
        ? currentTarget.project.configurations
        : [{ configuration: 'Debug', platform: 'Any CPU' }, { configuration: 'Release', platform: 'Any CPU' }];
    }
    return [{ configuration: 'Debug', platform: 'Any CPU' }];
  }, [currentTarget]);

  // Extract unique configurations and platforms
  const uniqueConfigs = useMemo(() => [...new Set(availableConfigs.map(c => c.configuration))], [availableConfigs]);
  const uniquePlatforms = useMemo(() => [...new Set(availableConfigs.map(c => c.platform))], [availableConfigs]);

  // Reset indices when target changes
  useEffect(() => {
    setConfigIdx(0);
    setPlatformIdx(0);
  }, [targetIdx]);

  useEffect(() => {
    if (targetIdx >= targets.length) {
      setTargetIdx(Math.max(0, targets.length - 1));
    }
  }, [targetIdx, targets.length]);

  useEffect(() => {
    if (configIdx >= uniqueConfigs.length) {
      setConfigIdx(Math.max(0, uniqueConfigs.length - 1));
    }
  }, [configIdx, uniqueConfigs.length]);

  useEffect(() => {
    if (platformIdx >= uniquePlatforms.length) {
      setPlatformIdx(Math.max(0, uniquePlatforms.length - 1));
    }
  }, [platformIdx, uniquePlatforms.length]);

  // Build the profile
  const profile: BuildProfile | null = useMemo(() => {
    if (!currentTarget) return null;
    return {
      id: crypto.randomUUID(),
      name: 'Quick Build',
      targetPath: currentTarget.path,
      buildSystem: currentTarget.buildSystem,
      configuration: uniqueConfigs[configIdx] ?? 'Debug',
      platform: uniquePlatforms[platformIdx] ?? 'Any CPU',
      extraArguments: parallelBuild ? ['/m'] : [],
      useDeveloperShell: useDevShell,
      enableBinaryLog: false,
      verbosity: VERBOSITIES[verbosityIdx]!,
    };
  }, [currentTarget, configIdx, platformIdx, verbosityIdx, parallelBuild, useDevShell]);

  // Resolve command preview
  const commandPreview = useMemo(() => {
    if (!profile || !currentTarget) return '';
    const proj = currentTarget.project ?? currentTarget.solution?.projects[0];
    if (!proj) return '';
    return resolveCommand(proj, profile)?.displayString ?? '';
  }, [profile, currentTarget, resolveCommand]);

  const runBuild = () => {
    if (!currentTarget || !profile) return;
    const proj = currentTarget.project ?? currentTarget.solution?.projects[0];
    if (proj) {
      setElapsedMs(0);
      start(proj, profile);
    }
  };

  // Elapsed time tracker during build
  useEffect(() => {
    if (status !== 'running' || !buildStartTime) return;
    const timer = setInterval(() => {
      setElapsedMs(Date.now() - buildStartTime);
    }, 1000);
    return () => clearInterval(timer);
  }, [status, buildStartTime]);

  const moveToTargetBoundary = (direction: 'top' | 'bottom') => {
    setTargetIdx(direction === 'top' ? 0 : Math.max(0, targets.length - 1));
  };

  const adjustSetting = (dir: 1 | -1) => {
    switch (activeSetting) {
      case 'configuration':
        setConfigIdx(Math.max(0, Math.min(uniqueConfigs.length - 1, configIdx + dir)));
        break;
      case 'platform':
        setPlatformIdx(Math.max(0, Math.min(uniquePlatforms.length - 1, platformIdx + dir)));
        break;
      case 'verbosity':
        setVerbosityIdx(Math.max(0, Math.min(VERBOSITIES.length - 1, verbosityIdx + dir)));
        break;
      case 'parallel':
        setParallelBuild(!parallelBuild);
        break;
      case 'devshell':
        setUseDevShell(!useDevShell);
        break;
    }
  };

  const cycleFocusArea = (dir: 1 | -1) => {
    const idx = FOCUS_AREAS.indexOf(focusArea);
    const next = (idx + dir + FOCUS_AREAS.length) % FOCUS_AREAS.length;
    setFocusArea(FOCUS_AREAS[next]!);
  };

  // Keyboard navigation
  useInput((input, key) => {
    if (status === 'running') {
      if (key.escape || input === 'c') {
        cancel();
      }
      return;
    }

    if (key.tab) {
      cycleFocusArea(key.shift ? -1 : 1);
      return;
    }

    if (focusArea === 'targets') {
      if (input === 'g') {
        moveToTargetBoundary('top');
        return;
      }
      if (input === 'G') {
        moveToTargetBoundary('bottom');
        return;
      }
      if (key.upArrow || input === 'k') {
        setTargetIdx(Math.max(0, targetIdx - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setTargetIdx(Math.min(targets.length - 1, targetIdx + 1));
        return;
      }
      if (key.rightArrow || input === 'l' || key.return) {
        setFocusArea('settings');
        return;
      }
    }

    if (focusArea === 'settings') {
      if (input === 'g') {
        setActiveSetting('configuration');
        return;
      }
      if (input === 'G') {
        setActiveSetting('devshell');
        return;
      }
      if (key.upArrow || input === 'k') {
        const idx = SETTING_FIELDS.indexOf(activeSetting);
        if (idx > 0) {
          setActiveSetting(SETTING_FIELDS[idx - 1]!);
        } else {
          setFocusArea('targets');
        }
        return;
      }
      if (key.downArrow || input === 'j') {
        const idx = SETTING_FIELDS.indexOf(activeSetting);
        if (idx < SETTING_FIELDS.length - 1) setActiveSetting(SETTING_FIELDS[idx + 1]!);
        return;
      }
      if (key.leftArrow || input === 'h') {
        if (activeSetting === 'configuration') {
          setFocusArea('targets');
          return;
        }
        adjustSetting(-1);
        return;
      }
      if (key.rightArrow || input === 'l') {
        if (activeSetting === 'parallel') {
          setFocusArea('action');
          return;
        }
        adjustSetting(1);
        return;
      }
      if (input === ' ') {
        setFocusArea('action');
        return;
      }
      if (key.return) {
        setFocusArea('action');
        return;
      }
      if (key.escape) {
        setFocusArea('targets');
        return;
      }
    }

    if (focusArea === 'action') {
      if (key.downArrow || input === 'j') {
        setFocusArea('output');
        return;
      }
      if (key.upArrow || input === 'k') {
        setFocusArea('settings');
        setActiveSetting('devshell');
        return;
      }
      if (key.escape) {
        setFocusArea('targets');
        return;
      }
      if (key.return || input === ' ') {
        runBuild();
        return;
      }
    }

    if (focusArea === 'output') {
      // j/k/g/G/f are handled by BuildOutputPanel's own useInput — don't intercept
      if (key.tab) {
        setFocusArea('targets');
        return;
      }
      if (key.escape) {
        setFocusArea('action');
        return;
      }
      // All other keys pass through to BuildOutputPanel
      return;
    }

    if (input === '\x1b[15~' || input === 'b' || (key.ctrl && input === 'b')) {
      runBuild();
    }
  }, { isActive: isTTY && isActiveTab });

  if (targets.length === 0) {
    return (
      <Box padding={1}>
        <Text color="yellow">No build targets found. Scan a directory with projects first.</Text>
      </Box>
    );
  }

  // Status line for build state
  const statusLine = status === 'running'
    ? `Building... ${formatDuration(elapsedMs)}`
    : result && status !== 'idle'
      ? `${result.status === 'success' ? 'OK' : 'FAIL'} ${formatDuration(result.durationMs)} | ${result.errorCount}E ${result.warningCount}W`
      : '';

  return (
    <Box flexDirection="column" flexGrow={1} overflowY="hidden" padding={1}>
      <PageHeader
        title="Build"
        subtitle="Choose a target, adjust options, and run the build."
        rightHint="Tab section | j/k move | h/l change | Enter build"
      />

      <Box flexDirection="row" flexShrink={0} marginBottom={1}>
        <Box marginRight={1}>
          <Text inverse={focusArea === 'action'} color={status === 'running' ? 'red' : 'green'} bold>
            {status === 'running' ? ' ■ Cancel (Esc) ' : ' ▶ Build (Enter) '}
          </Text>
        </Box>
        {statusLine ? (
          <Text color={status === 'running' ? 'yellow' : result?.status === 'success' ? 'green' : 'red'}>
            {statusLine}
          </Text>
        ) : (
          <Text color="gray">Ready</Text>
        )}
      </Box>

      {/* Main: left config + right output */}
      <Box flexDirection="row" flexGrow={1} overflowY="hidden" marginTop={1}>
        {/* Left: Targets + Settings */}
        <Box flexDirection="column" width="40%" paddingRight={1} overflowY="hidden">
          <Panel
            title="Targets"
            focused={focusArea === 'targets'}
            subtitle={focusArea === 'targets' ? 'j/k or g/G to move' : ''}
          >
            <ScrollableList
              selectedIdx={targetIdx}
              maxVisible={8}
              onSelect={setTargetIdx}
              items={targets.map((target, i) => (
                <Text key={target.path} inverse={i === targetIdx} wrap="truncate">
                  {i === targetIdx ? '▶ ' : '  '}{target.label}
                </Text>
              ))}
            />
          </Panel>

          <Box marginTop={1} />
          <Panel
            title="Settings"
            focused={focusArea === 'settings'}
            subtitle={focusArea === 'settings' ? 'h/l changes values' : ''}
          >
            <>
              <FieldRow
                label="Config"
                value={uniqueConfigs[configIdx] ?? 'Debug'}
                active={focusArea === 'settings' && activeSetting === 'configuration'}
                options={uniqueConfigs}
                selectedIdx={configIdx}
              />
              <FieldRow
                label="Platform"
                value={uniquePlatforms[platformIdx] ?? 'Any CPU'}
                active={focusArea === 'settings' && activeSetting === 'platform'}
                options={uniquePlatforms}
                selectedIdx={platformIdx}
              />
              <FieldRow
                label="Verbose"
                value={VERBOSITIES[verbosityIdx]!}
                active={focusArea === 'settings' && activeSetting === 'verbosity'}
                options={[...VERBOSITIES]}
                selectedIdx={verbosityIdx}
              />
              <FieldRow
                label="Parallel"
                value={parallelBuild ? 'ON' : 'OFF'}
                active={focusArea === 'settings' && activeSetting === 'parallel'}
                hint={parallelBuild ? '/m enabled' : 'single process'}
              />
              <FieldRow
                label="DevShell"
                value={useDevShell ? 'ON' : 'OFF'}
                active={focusArea === 'settings' && activeSetting === 'devshell'}
                hint={useDevShell ? 'VsDevCmd enabled' : 'direct execution'}
              />
            </>
          </Panel>
        </Box>

        {/* Right: Live output (isolated to prevent logEntries re-renders from cascading) */}
        <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingLeft={1}>
          <Panel title="Command Preview">
            <Text color="gray" wrap="wrap">{commandPreview ? `$ ${commandPreview}` : 'Select a target to preview the command.'}</Text>
          </Panel>

          <Box marginTop={1} />
          <Panel title="Result">
            <ResultRow label="Status" value={result ? result.status : status === 'running' ? 'building' : '-'} color={result?.status === 'success' ? 'green' : result?.status === 'failure' ? 'red' : 'gray'} />
            <ResultRow label="Duration" value={result ? formatDuration(result.durationMs) : '-'} />
            <ResultRow label="Errors" value={result ? String(result.errorCount) : '-'} color={result && result.errorCount > 0 ? 'red' : 'gray'} />
            <ResultRow label="Warnings" value={result ? String(result.warningCount) : '-'} color={result && result.warningCount > 0 ? 'yellow' : 'gray'} />
          </Panel>

          <Box marginTop={1} />
          <BuildOutputPanel focused={focusArea === 'output'} />
        </Box>
      </Box>

      {/* Bottom hints */}
      <Box flexShrink={0}>
        <Text color="gray">Tab: section | j/k ↑↓: move | h/l ←→: change | Enter/b: build | Esc: cancel</Text>
      </Box>
    </Box>
  );
};

interface FieldRowProps {
  label: string;
  value: string;
  active: boolean;
  hint?: string;
  options?: string[];
  selectedIdx?: number;
}

/** Isolated component with scroll — only re-renders when logEntries or buildStatus changes */
const BuildOutputPanel: React.FC<{ focused?: boolean }> = React.memo(({ focused = false }) => {
  const logEntries = useAppStore(s => s.logEntries);
  const status = useAppStore(s => s.buildStatus);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [following, setFollowing] = useState(true);

  const maxVisible = 15;
  const maxOffset = Math.max(0, logEntries.length - maxVisible);
  const effectiveOffset = following ? maxOffset : Math.min(scrollOffset, maxOffset);
  const visible = logEntries.slice(effectiveOffset, effectiveOffset + maxVisible);

  // Auto-follow new entries
  useEffect(() => {
    if (following) setScrollOffset(maxOffset);
  }, [logEntries.length, following, maxOffset]);

  // Scroll input when focused
  useInput((input, key) => {
    if (key.upArrow || input === 'k') {
      setFollowing(false);
      setScrollOffset(o => Math.max(0, o - 1));
    }
    if (key.downArrow || input === 'j') {
      const next = Math.min(maxOffset, scrollOffset + 1);
      setScrollOffset(next);
      if (next >= maxOffset) setFollowing(true);
    }
    if (input === 'g') { setFollowing(false); setScrollOffset(0); }
    if (input === 'G') { setFollowing(true); setScrollOffset(maxOffset); }
    if (input === 'f') setFollowing(f => !f);
  }, { isActive: isTTY && focused });

  return (
    <Panel title="Output" focused={focused} subtitle={
      focused
        ? `${logEntries.length} lines | ${following ? '⬇ follow' : '⏸ scroll'} | j/k g/G f`
        : `${logEntries.length} lines`
    }>
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        {status === 'idle' && logEntries.length === 0 && (
          <Text color="gray">Build output will appear here</Text>
        )}
        {status === 'running' && logEntries.length === 0 && (
          <ProgressPanel label="Waiting for output..." status="scanning" />
        )}
        {visible.map((entry) => (
          <Text key={entry.index} color={
            entry.level === 'error' ? 'red' :
            entry.level === 'warning' ? 'yellow' :
            entry.source === 'stderr' ? 'red' : undefined
          } wrap="truncate">
            {entry.text}
          </Text>
        ))}
        {logEntries.length > maxVisible && !focused && (
          <Text color="gray">Focus output (Tab) to scroll</Text>
        )}
      </Box>
    </Panel>
  );
});

const FieldRow: React.FC<FieldRowProps> = ({ label, value, active, hint, options, selectedIdx }) => {
  const hasMultiple = options && options.length > 1;
  const idx = selectedIdx ?? 0;
  const total = options?.length ?? 0;

  return (
    <Box flexDirection="row" marginBottom={0}>
      <Box width={12} flexShrink={0}>
        <Text color={active ? 'cyan' : 'gray'} bold={active}>
          {active ? '▶ ' : '  '}{label}
        </Text>
      </Box>
      <Box flexGrow={1}>
        {hasMultiple ? (
          <Text wrap="wrap">
            <Text color={active ? 'white' : 'gray'}>◄ </Text>
            <Text bold inverse={active} color={active ? 'white' : undefined}> {value} </Text>
            <Text color={active ? 'white' : 'gray'}> ► </Text>
            <Text color="gray">({idx + 1}/{total})</Text>
          </Text>
        ) : (
          <Text bold={active} wrap="wrap">{value}</Text>
        )}
        {hint && <Text color="gray"> {hint}</Text>}
      </Box>
    </Box>
  );
};

const ResultRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Box flexDirection="row">
    <Box width={12}>
      <Text color="gray">{label}</Text>
    </Box>
    <Text color={color as any}>{value}</Text>
  </Box>
);

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
}
