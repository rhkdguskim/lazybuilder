import React, { useState, useMemo, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { useBuild } from '../hooks/useBuild.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import type { ProjectInfo, BuildConfiguration, SolutionInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { BuildSystem } from '../../domain/enums.js';

type FocusArea = 'targets' | 'settings' | 'action';
type SettingField = 'configuration' | 'platform' | 'verbosity' | 'parallel' | 'devshell';

const FOCUS_AREAS: FocusArea[] = ['targets', 'settings', 'action'];
const SETTING_FIELDS: SettingField[] = ['configuration', 'platform', 'verbosity', 'parallel', 'devshell'];
const VERBOSITIES = ['quiet', 'minimal', 'normal', 'detailed', 'diagnostic'] as const;

export const BuildTab: React.FC = () => {
  const projects = useAppStore(s => s.projects);
  const solutions = useAppStore(s => s.solutions);
  const snapshot = useAppStore(s => s.snapshot);
  const logEntries = useAppStore(s => s.logEntries);
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
    // Auto-detect if dev shell needed
    if (currentTarget?.buildSystem === 'msbuild' && currentTarget.project?.projectType === 'cpp-msbuild') {
      setUseDevShell(!snapshot?.cpp.vcEnvironmentActive && !!snapshot?.cpp.vcvarsPath);
    } else {
      setUseDevShell(false);
    }
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
    }, 100);
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
        if (activeSetting === 'devshell') {
          setFocusArea('action');
          return;
        }
        adjustSetting(1);
        return;
      }
      if (input === ' ') {
        if (activeSetting === 'devshell') {
          setUseDevShell(!useDevShell);
        } else {
          setFocusArea('action');
        }
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
      if (key.downArrow || input === 'j' || input === 'G') {
        return;
      }
      if (key.upArrow || input === 'k') {
        setFocusArea('settings');
        setActiveSetting('devshell');
        return;
      }
      if (key.leftArrow || input === 'h') {
        setFocusArea('settings');
        setActiveSetting('devshell');
        return;
      }
      if (key.escape) {
        setFocusArea('settings');
        setActiveSetting('devshell');
        return;
      }
      if (key.return || input === ' ') {
        runBuild();
        return;
      }
    }

    if (input === '\x1b[15~' || input === 'b' || (key.ctrl && input === 'b')) {
      runBuild();
    }
  }, { isActive: !!process.stdin.isTTY });

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
      {/* Top bar: action + status */}
      <Box flexDirection="row" justifyContent="space-between" flexShrink={0}>
        <Box>
          <Text inverse={focusArea === 'action'} color={status === 'running' ? 'red' : 'green'} bold>
            {status === 'running' ? ' ■ Cancel (Esc) ' : ' ▶ Build (Enter) '}
          </Text>
          {status === 'running' && <Text color="yellow"> {formatDuration(elapsedMs)}</Text>}
          {result && status !== 'running' && status !== 'idle' && (
            <Text color={result.status === 'success' ? 'green' : 'red'}>
              {' '}{result.status === 'success' ? '✔' : '✘'} {formatDuration(result.durationMs)} {result.errorCount}E {result.warningCount}W
            </Text>
          )}
        </Box>
        <Text color="gray" wrap="truncate">{commandPreview ? `$ ${commandPreview}` : ''}</Text>
      </Box>

      {/* Main: left config + right output */}
      <Box flexDirection="row" flexGrow={1} overflowY="hidden" marginTop={1}>
        {/* Left: Targets + Settings */}
        <Box flexDirection="column" width="35%" paddingRight={1} overflowY="hidden">
          <Text bold color={focusArea === 'targets' ? 'cyan' : 'gray'}>Targets</Text>
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

          <Box marginTop={1} />
          <Text bold color={focusArea === 'settings' ? 'cyan' : 'gray'}>Settings</Text>
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
          />
          <FieldRow
            label="DevShell"
            value={useDevShell ? 'ON' : 'OFF'}
            active={focusArea === 'settings' && activeSetting === 'devshell'}
          />
        </Box>

        {/* Right: Live output */}
        <Box flexDirection="column" flexGrow={1} borderStyle="single" borderColor="gray" paddingX={1} overflowY="hidden">
          <Box flexDirection="row" justifyContent="space-between" flexShrink={0}>
            <Text bold color="cyan">Output</Text>
            <Text color="gray">{logEntries.length} lines</Text>
          </Box>

          <Box flexDirection="column" flexGrow={1} overflowY="hidden">
            {status === 'idle' && logEntries.length === 0 && (
              <Text color="gray">Build output will appear here</Text>
            )}
            {logEntries.slice(-25).map((entry) => (
              <Text key={entry.index} color={
                entry.level === 'error' ? 'red' :
                entry.level === 'warning' ? 'yellow' :
                entry.source === 'stderr' ? 'red' : undefined
              } wrap="truncate">
                {entry.text}
              </Text>
            ))}
          </Box>
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

const FieldRow: React.FC<FieldRowProps> = ({ label, value, active, hint, options, selectedIdx }) => {
  const hasMultiple = options && options.length > 1;
  const idx = selectedIdx ?? 0;
  const total = options?.length ?? 0;

  return (
    <Box flexDirection="row" marginBottom={0}>
      <Box width={16} flexShrink={0}>
        <Text color={active ? 'cyan' : 'gray'} bold={active}>
          {active ? '▶ ' : '  '}{label}
        </Text>
      </Box>
      <Box flexShrink={0}>
        {hasMultiple ? (
          <Text>
            <Text color={active ? 'white' : 'gray'}>◄ </Text>
            <Text bold inverse={active} color={active ? 'white' : undefined}> {value} </Text>
            <Text color={active ? 'white' : 'gray'}> ► </Text>
            <Text color="gray">({idx + 1}/{total})</Text>
          </Text>
        ) : (
          <Text bold={active}>{value}</Text>
        )}
        {hint && <Text color="gray"> {hint}</Text>}
      </Box>
    </Box>
  );
};

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
