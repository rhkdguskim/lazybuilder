import React, { useState, useMemo, useEffect } from 'react';
import { randomUUID } from 'node:crypto';
import { Box, Text, useInput, useStdout } from 'ink';
import { useAppStore, type BuildTargetFilter } from '../store/useAppStore.js';
import { useBuild } from '../hooks/useBuild.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { PageHeader, Panel } from '../components/index.js';
import { useMouseInput } from '../hooks/useMouseInput.js';
import { glyphs, legacyWindowsConsole } from '../themes/colors.js';
import { compactPath } from '../utils/text.js';
import type { ProjectInfo, SolutionInfo } from '../../domain/models/ProjectInfo.js';
import type { BuildProfile } from '../../domain/models/BuildProfile.js';
import type { BuildDiagnostic, BuildResult } from '../../domain/models/BuildResult.js';
import type { BuildSystem } from '../../domain/enums.js';
import { detectHardware } from '../../infrastructure/system/HardwareDetector.js';
import { recommendedJobs } from '../../domain/buildOptimizer.js';

const HARDWARE = detectHardware();

type FocusArea = 'targets' | 'settings' | 'action' | 'output';
type SettingField = 'configuration' | 'platform' | 'verbosity' | 'parallel' | 'devshell';

const FOCUS_AREAS: FocusArea[] = ['targets', 'settings', 'action', 'output'];
const SETTING_FIELDS: SettingField[] = ['configuration', 'platform', 'verbosity', 'parallel', 'devshell'];
const VERBOSITIES = ['quiet', 'minimal', 'normal', 'detailed', 'diagnostic'] as const;
const TARGET_FILTERS: Array<{ value: BuildTargetFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'solutions', label: 'Solutions' },
  { value: 'projects', label: 'Projects' },
  { value: 'dotnet', label: '.NET' },
  { value: 'msbuild', label: 'MSBuild' },
  { value: 'cmake', label: 'CMake' },
  { value: 'cpp', label: 'C++' },
];

type BuildTarget = {
  kind: 'solution' | 'project';
  label: string;
  project: ProjectInfo | null;
  solution: SolutionInfo | null;
  path: string;
  buildSystem: BuildSystem;
  projectType?: ProjectInfo['projectType'];
  solutionType?: SolutionInfo['solutionType'];
  searchable: string;
};

const isTTY = !!process.stdin.isTTY;

export const BuildTab: React.FC = () => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isActiveTab = useAppStore(s => s.activeTab) === 'build';
  const projects = useAppStore(s => s.projects);
  const solutions = useAppStore(s => s.solutions);
  const snapshot = useAppStore(s => s.snapshot);
  const { status, result, start, cancel, resolveCommand } = useBuild();

  // Build targets: solutions + standalone projects
  const targets = useMemo(() => {
    const list: BuildTarget[] = [];

    for (const sln of solutions) {
      list.push({
        kind: 'solution',
        label: `${sln.name}.sln (${sln.solutionType}, ${sln.projects.length} proj)`,
        project: null,
        solution: sln,
        path: sln.filePath,
        buildSystem: sln.solutionType === 'csharp' ? 'dotnet' : 'msbuild',
        solutionType: sln.solutionType,
        searchable: [
          sln.name,
          sln.filePath,
          sln.solutionType,
          ...sln.projects.map(project => `${project.name} ${project.language} ${project.projectType}`),
        ].join(' ').toLowerCase(),
      });
    }
    for (const proj of projects.filter(p => !p.solutionPath)) {
      list.push({
        kind: 'project',
        label: `${proj.name} [${proj.projectType}]`,
        project: proj,
        solution: null,
        path: proj.filePath,
        buildSystem: proj.buildSystem,
        projectType: proj.projectType,
        searchable: [
          proj.name,
          proj.filePath,
          proj.language,
          proj.projectType,
          proj.buildSystem,
          ...proj.targetFrameworks,
          ...proj.platformTargets,
        ].join(' ').toLowerCase(),
      });
    }
    return list;
  }, [projects, solutions]);

  // Build settings from store (persisted across tab switches)
  const targetIdx = useAppStore(s => s.buildTargetIdx);
  const setTargetIdx = useAppStore(s => s.setBuildTargetIdx);
  const targetQuery = useAppStore(s => s.buildTargetQuery);
  const setTargetQuery = useAppStore(s => s.setBuildTargetQuery);
  const targetFilter = useAppStore(s => s.buildTargetFilter);
  const setTargetFilter = useAppStore(s => s.setBuildTargetFilter);
  const buildSearchActive = useAppStore(s => s.buildSearchActive);
  const setBuildSearchActive = useAppStore(s => s.setBuildSearchActive);
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

  const filteredTargets = useMemo(() => {
    const query = targetQuery.trim().toLowerCase();
    return targets.filter(target => {
      const matchesFilter =
        targetFilter === 'all'
        || (targetFilter === 'solutions' && target.kind === 'solution')
        || (targetFilter === 'projects' && target.kind === 'project')
        || (targetFilter === 'dotnet' && target.buildSystem === 'dotnet')
        || (targetFilter === 'msbuild' && target.buildSystem === 'msbuild')
        || (targetFilter === 'cmake' && target.buildSystem === 'cmake')
        || (targetFilter === 'cpp' && (
          target.project?.language === 'cpp'
          || target.projectType === 'cpp-msbuild'
          || target.solutionType === 'cpp'
          || target.solutionType === 'mixed'
        ));
      const matchesQuery = query.length === 0 || target.searchable.includes(query);
      return matchesFilter && matchesQuery;
    });
  }, [targets, targetFilter, targetQuery]);

  // Current target's configurations
  const currentTarget = filteredTargets[targetIdx];
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
  }, [currentTarget?.path]);

  useEffect(() => {
    if (filteredTargets.length === 0) {
      if (targetIdx !== 0) setTargetIdx(0);
      return;
    }
    if (targetIdx >= filteredTargets.length) {
      setTargetIdx(filteredTargets.length - 1);
    }
  }, [targetIdx, filteredTargets.length]);

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
      id: randomUUID(),
      name: 'Quick Build',
      targetPath: currentTarget.path,
      buildSystem: currentTarget.buildSystem,
      configuration: uniqueConfigs[configIdx] ?? 'Debug',
      platform: uniquePlatforms[platformIdx] ?? 'Any CPU',
      extraArguments: [],
      useDeveloperShell: useDevShell,
      enableBinaryLog: false,
      parallel: parallelBuild,
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

  const runQuickCheck = () => {
    if (!currentTarget || !profile) return;
    const proj = currentTarget.project ?? currentTarget.solution?.projects[0];
    if (!proj) return;

    const analyzerArgs = currentTarget.buildSystem === 'dotnet'
      ? ['--no-restore', '/p:RunAnalyzers=true', '/p:RunAnalyzersDuringBuild=true']
      : currentTarget.buildSystem === 'msbuild'
        ? ['/p:RunAnalyzers=true', '/p:RunAnalyzersDuringBuild=true']
        : [];

    const checkProfile: BuildProfile = {
      ...profile,
      id: randomUUID(),
      name: 'Quick Check',
      verbosity: 'minimal',
      extraArguments: [...new Set([...profile.extraArguments, ...analyzerArgs])],
    };

    setElapsedMs(0);
    start(proj, checkProfile);
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
    setTargetIdx(direction === 'top' ? 0 : Math.max(0, filteredTargets.length - 1));
  };

  const updateTargetQuery = (query: string) => {
    setTargetQuery(query);
    setTargetIdx(0);
  };

  const cycleTargetFilter = (dir: 1 | -1) => {
    const idx = TARGET_FILTERS.findIndex(filter => filter.value === targetFilter);
    const next = TARGET_FILTERS[(idx + dir + TARGET_FILTERS.length) % TARGET_FILTERS.length]!;
    setTargetFilter(next.value);
    setTargetIdx(0);
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

    if (buildSearchActive) {
      if (key.escape || key.return) {
        setBuildSearchActive(false);
        return;
      }
      if (key.backspace || key.delete) {
        updateTargetQuery(targetQuery.slice(0, -1));
        return;
      }
      if (key.ctrl && input === 'u') {
        updateTargetQuery('');
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        updateTargetQuery(`${targetQuery}${input}`);
      }
      return;
    }

    if (input === '/') {
      setFocusArea('targets');
      setBuildSearchActive(true);
      return;
    }

    if (input === 'f' && focusArea !== 'output') {
      cycleTargetFilter(1);
      setFocusArea('targets');
      return;
    }

    if (input === 'F' && focusArea !== 'output') {
      cycleTargetFilter(-1);
      setFocusArea('targets');
      return;
    }

    if (input === 'x' && focusArea === 'targets') {
      updateTargetQuery('');
      setTargetFilter('all');
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
        setTargetIdx(Math.max(0, Math.min(filteredTargets.length - 1, targetIdx + 1)));
        return;
      }
      if ((key.rightArrow || input === 'l' || key.return) && currentTarget) {
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
      if (input === 'a' || input === 'A') {
        runQuickCheck();
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

    if (input === 'a' || input === 'A') {
      runQuickCheck();
      return;
    }

    if (input === '\x1b[15~' || input === 'b' || (key.ctrl && input === 'b')) {
      runBuild();
    }
  }, { isActive: isTTY && isActiveTab });

  const splitColumn = Math.max(28, Math.floor(columns * 0.45));

  useMouseInput((event) => {
    if (status === 'running') return;

    if (event.type === 'click') {
      if (event.x <= splitColumn) {
        setFocusArea(event.y >= 18 ? 'settings' : 'targets');
        return;
      }

      setFocusArea(event.y <= 10 ? 'action' : 'output');
      return;
    }

    if (event.x <= splitColumn) {
      setFocusArea('targets');
      setTargetIdx(Math.max(0, Math.min(filteredTargets.length - 1, targetIdx + event.direction)));
    }
  }, isTTY && isActiveTab && !buildSearchActive);

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
  const activeFilterLabel = TARGET_FILTERS.find(filter => filter.value === targetFilter)?.label ?? 'All';
  const targetPanelSubtitle = buildSearchActive
    ? 'Search: type text, Enter/Esc finish, Ctrl+U clear'
    : '/ search | f/F filter | x clear | j/k move';
  const canBuild = !!currentTarget && !!profile;
  const targetMaxVisible = focusArea === 'settings' ? 4 : 8;
  const autoJobs = currentTarget
    ? recommendedJobs({
        buildSystem: currentTarget.buildSystem,
        projectType: currentTarget.project?.projectType,
        hardware: HARDWARE,
      })
    : HARDWARE.cpuCores;
  const parallelLabel = parallelBuild ? `auto x${autoJobs}` : 'off';
  const settingsSummary = `${uniqueConfigs[configIdx] ?? 'Debug'} | ${uniquePlatforms[platformIdx] ?? 'Any CPU'} | ${VERBOSITIES[verbosityIdx]} | jobs ${parallelLabel} | dev ${useDevShell ? 'on' : 'off'}`;

  return (
    <Box flexDirection="column" flexGrow={1} overflowY="hidden" padding={1}>
      <PageHeader
        title="Build"
        subtitle="Search/filter targets, configure, build, or run analyzer check."
      />

      <Box flexDirection="row" flexShrink={0}>
        <Box marginRight={1}>
          <Text inverse={focusArea === 'action'} color={status === 'running' ? 'red' : canBuild ? 'green' : 'gray'} bold>
            {status === 'running'
              ? ` ${glyphs.stop} Cancel (Esc) `
              : canBuild
                ? ` ${glyphs.play} Build Enter | Check a `
                : ' No target '}
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
      <Box flexDirection="row" flexGrow={1} overflowY="hidden">
        {/* Left: Targets + Settings */}
        <Box flexDirection="column" width="45%" paddingRight={1} overflowY="hidden">
          <Panel
            title={`Targets ${filteredTargets.length}/${targets.length}`}
            focused={focusArea === 'targets'}
            subtitle={focusArea === 'targets' ? targetPanelSubtitle : `${activeFilterLabel}${targetQuery ? ` | ${targetQuery}` : ''}`}
          >
            <Box flexDirection="column" flexShrink={0} marginBottom={1} overflow="hidden">
              <Text wrap="truncate">
                <Text color="gray">Filter </Text>
                <Text inverse color="cyan"> {activeFilterLabel} </Text>
                <Text color="gray">  Search </Text>
                <Text color={buildSearchActive ? 'cyan' : targetQuery ? 'white' : 'gray'} inverse={buildSearchActive} wrap="truncate">
                  {buildSearchActive ? ` ${targetQuery || 'type...'} ` : ` ${targetQuery || 'none'} `}
                </Text>
              </Text>
            </Box>
            <ScrollableList
              selectedIdx={targetIdx}
              maxVisible={targetMaxVisible}
              onSelect={setTargetIdx}
              mouseScroll={false}
              items={filteredTargets.length === 0
                ? [
                    <Text key="empty" color="yellow" wrap="truncate">
                      No targets match. Press / to search or x to clear.
                    </Text>,
                  ]
                : filteredTargets.map((target, i) => (
                    <Text key={target.path} inverse={i === targetIdx} wrap="truncate">
                      {i === targetIdx ? `${glyphs.play} ` : '  '}
                      <Text color={target.kind === 'solution' ? 'cyan' : 'green'}>
                        [{target.kind === 'solution' ? 'SLN' : 'PRJ'}]
                      </Text>
                      {' '}{target.label}
                      <Text color="gray"> {compactPath(target.path, 28)}</Text>
                    </Text>
                  ))
              }
            />
          </Panel>

          {focusArea === 'settings' ? (
            <Panel
              title="Settings"
              focused
              subtitle="h/l changes values"
              marginTop={1}
              flexShrink={0}
            >
              <FieldRow
                label="Config"
                value={uniqueConfigs[configIdx] ?? 'Debug'}
                active={activeSetting === 'configuration'}
                options={uniqueConfigs}
                selectedIdx={configIdx}
              />
              <FieldRow
                label="Platform"
                value={uniquePlatforms[platformIdx] ?? 'Any CPU'}
                active={activeSetting === 'platform'}
                options={uniquePlatforms}
                selectedIdx={platformIdx}
              />
              <FieldRow
                label="Verbose"
                value={VERBOSITIES[verbosityIdx]!}
                active={activeSetting === 'verbosity'}
                options={[...VERBOSITIES]}
                selectedIdx={verbosityIdx}
              />
              <FieldRow
                label="Parallel"
                value={parallelBuild ? `AUTO x${autoJobs}` : 'OFF'}
                active={activeSetting === 'parallel'}
                hint={parallelBuild
                  ? `${HARDWARE.cpuCores} cores, ${HARDWARE.totalMemoryGB}GB RAM`
                  : 'single process'}
              />
              <FieldRow
                label="DevShell"
                value={useDevShell ? 'ON' : 'OFF'}
                active={activeSetting === 'devshell'}
                hint={useDevShell ? 'VsDevCmd enabled' : 'direct execution'}
              />
            </Panel>
          ) : (
            <Box flexShrink={0} marginTop={1} overflow="hidden">
              <Text color="gray" wrap="truncate">Settings: {settingsSummary}</Text>
            </Box>
          )}
        </Box>

        {/* Right: Live output (isolated to prevent logEntries re-renders from cascading) */}
        <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingLeft={1}>
          <Box flexDirection="column" flexShrink={0} marginBottom={1} overflow="hidden">
            <Text color="gray" wrap="truncate">Cmd: {commandPreview || 'Select a target to preview the command.'}</Text>
            <Text wrap="truncate">
              <Text color="gray">Result: </Text>
              <Text color={result?.status === 'success' ? 'green' : result?.status === 'failure' ? 'red' : status === 'running' ? 'yellow' : 'gray'}>
                {result ? result.status : status === 'running' ? 'building' : 'ready'}
              </Text>
              <Text color="gray"> | </Text>
              <Text color="gray">{result ? formatDuration(result.durationMs) : '-'}</Text>
              <Text color="gray"> | </Text>
              <Text color={result && result.errorCount > 0 ? 'red' : 'gray'}>{result?.errorCount ?? 0}E</Text>
              <Text color="gray"> </Text>
              <Text color={result && result.warningCount > 0 ? 'yellow' : 'gray'}>{result?.warningCount ?? 0}W</Text>
            </Text>
            {result && <DiagnosticPreview result={result} />}
          </Box>

          <BuildOutputPanel focused={focusArea === 'output'} minColumn={splitColumn + 1} />
        </Box>
      </Box>

      {/* Bottom hints */}
      <Box flexShrink={0}>
        <Text color="gray" wrap="truncate">Tab: section | / search | f filter | a quick check | Enter/b build | Esc cancel</Text>
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
const BuildOutputPanel: React.FC<{ focused?: boolean; minColumn: number }> = React.memo(({ focused = false, minColumn }) => {
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

  useMouseInput((event) => {
    if (event.type !== 'scroll' || event.x < minColumn) return;

    if (event.direction === -1) {
      setFollowing(false);
      setScrollOffset(o => Math.max(0, o - 1));
      return;
    }

    setScrollOffset(o => {
      const next = Math.min(maxOffset, o + 1);
      if (next >= maxOffset) setFollowing(true);
      return next;
    });
  }, isTTY && focused);

  return (
    <Panel title="Output" focused={focused} subtitle={
      focused
        ? `${logEntries.length} lines | ${following ? glyphs.follow : 'Scroll'} | j/k g/G f`
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
          {active ? `${glyphs.play} ` : '  '}{label}
        </Text>
      </Box>
      <Box flexGrow={1}>
        {hasMultiple ? (
          <Text wrap="wrap">
            <Text color={active ? 'white' : 'gray'}>{legacyWindowsConsole ? '< ' : '◄ '}</Text>
            <Text bold inverse={active} color={active ? 'white' : undefined}> {value} </Text>
            <Text color={active ? 'white' : 'gray'}>{legacyWindowsConsole ? ' > ' : ' ► '}</Text>
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

const DiagnosticPreview: React.FC<{ result: BuildResult }> = ({ result }) => {
  const diagnostics: Array<BuildDiagnostic & { severity: 'error' | 'warning' }> = [
    ...result.errors.slice(0, 2).map(item => ({ ...item, severity: 'error' as const })),
    ...result.warnings.slice(0, Math.max(0, 3 - Math.min(2, result.errors.length))).map(item => ({ ...item, severity: 'warning' as const })),
  ];

  if (diagnostics.length === 0) {
    return <Text color="gray" wrap="truncate">Diagnostics: none</Text>;
  }

  return (
    <Box flexDirection="column" marginTop={1} overflow="hidden">
      {diagnostics.map((item, index) => (
        <Text
          key={`${item.file ?? 'diagnostic'}-${item.line ?? 0}-${item.code}-${index}`}
          color={item.severity === 'error' ? 'red' : 'yellow'}
          wrap="truncate"
        >
          {item.code}: {item.message}
        </Text>
      ))}
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
