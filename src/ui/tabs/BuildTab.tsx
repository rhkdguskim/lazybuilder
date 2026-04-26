import React, { useState, useMemo } from 'react';
import { Box, useInput, useStdout } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { useMouseInput } from '../hooks/useMouseInput.js';
import { PageHeader, EmptyState, KeyHints, TabFrame, type KeyHint } from '../components/index.js';
import { useBuildTargets } from './build/useBuildTargets.js';
import { useBuildController } from './build/useBuildController.js';
import { BuildTargetList } from './build/BuildTargetList.js';
import { BuildSettingsPanel } from './build/BuildSettingsPanel.js';
import { BuildActionBar } from './build/BuildActionBar.js';
import { BuildPreviewPanel } from './build/BuildPreviewPanel.js';
import { BuildOutputPanel } from './build/BuildOutputPanel.js';
import {
  FOCUS_AREAS,
  SETTING_FIELDS,
  TARGET_FILTERS,
  VERBOSITIES,
  type FocusArea,
  type SettingField,
} from './build/types.js';

const isTTY = !!process.stdin.isTTY;

export const BuildTab: React.FC = () => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;

  const isActiveTab = useAppStore((s) => s.activeTab) === 'build';

  // Persistent target/search state in store
  const targetIdx = useAppStore((s) => s.buildTargetIdx);
  const setTargetIdx = useAppStore((s) => s.setBuildTargetIdx);
  const targetQuery = useAppStore((s) => s.buildTargetQuery);
  const setTargetQuery = useAppStore((s) => s.setBuildTargetQuery);
  const targetFilter = useAppStore((s) => s.buildTargetFilter);
  const setTargetFilter = useAppStore((s) => s.setBuildTargetFilter);
  const buildSearchActive = useAppStore((s) => s.buildSearchActive);
  const setBuildSearchActive = useAppStore((s) => s.setBuildSearchActive);
  const toggleSolutionExpanded = useAppStore((s) => s.toggleSolutionExpanded);
  const setSolutionExpanded = useAppStore((s) => s.setSolutionExpanded);
  const expandAllSolutions = useAppStore((s) => s.expandAllSolutions);
  const collapseAllSolutions = useAppStore((s) => s.collapseAllSolutions);
  const solutions = useAppStore((s) => s.solutions);

  const { targets, filteredTargets } = useBuildTargets();
  const currentTarget = filteredTargets[targetIdx];
  const ctrl = useBuildController(currentTarget);

  // Local-only UI state
  const [focusArea, setFocusArea] = useState<FocusArea>('targets');
  const [activeSetting, setActiveSetting] = useState<SettingField>('configuration');

  // Clamp targetIdx when filtered list shrinks
  React.useEffect(() => {
    if (filteredTargets.length === 0) {
      if (targetIdx !== 0) setTargetIdx(0);
      return;
    }
    if (targetIdx >= filteredTargets.length) {
      setTargetIdx(filteredTargets.length - 1);
    }
  }, [targetIdx, filteredTargets.length, setTargetIdx]);

  const moveToTargetBoundary = (direction: 'top' | 'bottom') => {
    setTargetIdx(direction === 'top' ? 0 : Math.max(0, filteredTargets.length - 1));
  };

  const updateTargetQuery = (query: string) => {
    setTargetQuery(query);
    setTargetIdx(0);
  };

  const cycleTargetFilter = (dir: 1 | -1) => {
    const idx = TARGET_FILTERS.findIndex((f) => f.value === targetFilter);
    const next = TARGET_FILTERS[(idx + dir + TARGET_FILTERS.length) % TARGET_FILTERS.length]!;
    setTargetFilter(next.value);
    setTargetIdx(0);
  };

  const adjustSetting = (dir: 1 | -1) => {
    switch (activeSetting) {
      case 'configuration':
        ctrl.setConfigIdx(Math.max(0, Math.min(ctrl.uniqueConfigs.length - 1, ctrl.configIdx + dir)));
        break;
      case 'platform':
        ctrl.setPlatformIdx(Math.max(0, Math.min(ctrl.uniquePlatforms.length - 1, ctrl.platformIdx + dir)));
        break;
      case 'verbosity':
        ctrl.setVerbosityIdx(Math.max(0, Math.min(VERBOSITIES.length - 1, ctrl.verbosityIdx + dir)));
        break;
      case 'parallel':
        ctrl.setParallelBuild(!ctrl.parallelBuild);
        break;
      case 'devshell':
        ctrl.setUseDevShell(!ctrl.useDevShell);
        break;
    }
  };

  const cycleFocusArea = (dir: 1 | -1) => {
    const idx = FOCUS_AREAS.indexOf(focusArea);
    const next = (idx + dir + FOCUS_AREAS.length) % FOCUS_AREAS.length;
    setFocusArea(FOCUS_AREAS[next]!);
  };

  useInput(
    (input, key) => {
      if (ctrl.status === 'running') {
        if (key.escape || input === 'c') {
          ctrl.cancel();
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
        // Space toggles expand/collapse on a solution row.
        if (input === ' ' && currentTarget?.kind === 'solution' && currentTarget.expandable) {
          toggleSolutionExpanded(currentTarget.path);
          return;
        }
        // E/C bulk toggles.
        if (input === 'E') {
          expandAllSolutions(solutions.map((s) => s.filePath));
          return;
        }
        if (input === 'C') {
          collapseAllSolutions();
          return;
        }
        // Right/l: on collapsed solution, expand instead of moving to settings.
        if (key.rightArrow || input === 'l') {
          if (currentTarget?.kind === 'solution' && currentTarget.expandable && !currentTarget.expanded) {
            setSolutionExpanded(currentTarget.path, true);
            return;
          }
          if (currentTarget) {
            setFocusArea('settings');
            return;
          }
        }
        // Left/h: collapse current solution, or jump back to parent of a child row.
        if (key.leftArrow || input === 'h') {
          if (currentTarget?.kind === 'solution' && currentTarget.expanded) {
            setSolutionExpanded(currentTarget.path, false);
            return;
          }
          if (currentTarget?.kind === 'project' && currentTarget.parentSolutionPath) {
            const parentPath = currentTarget.parentSolutionPath;
            setSolutionExpanded(parentPath, false);
            const parentIdx = filteredTargets.findIndex(
              (t) => t.kind === 'solution' && t.path === parentPath,
            );
            if (parentIdx >= 0) setTargetIdx(parentIdx);
            return;
          }
        }
        if (key.return && currentTarget) {
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
        if (input === ' ' || key.return) {
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
          ctrl.runBuild();
          return;
        }
        if (input === 'a' || input === 'A') {
          ctrl.runQuickCheck();
          return;
        }
      }

      if (focusArea === 'output') {
        // j/k/g/G/f are handled by BuildOutputPanel's own useInput
        if (key.tab) {
          setFocusArea('targets');
          return;
        }
        if (key.escape) {
          setFocusArea('action');
          return;
        }
        return;
      }

      if (input === 'a' || input === 'A') {
        ctrl.runQuickCheck();
        return;
      }

      if (input === '\x1b[15~' || input === 'b' || (key.ctrl && input === 'b')) {
        ctrl.runBuild();
      }
    },
    { isActive: isTTY && isActiveTab },
  );

  const splitColumn = Math.max(28, Math.floor(columns * 0.45));

  useMouseInput(
    (event) => {
      if (ctrl.status === 'running') return;

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
    },
    isTTY && isActiveTab && !buildSearchActive,
  );

  const contextualHints = useMemo<KeyHint[]>(() => {
    if (ctrl.status === 'running') {
      return [
        { key: 'Esc', label: 'Cancel' },
        { key: 'c', label: 'Cancel' },
      ];
    }
    if (buildSearchActive) {
      return [
        { key: 'Enter', label: 'Done' },
        { key: 'Esc', label: 'Cancel' },
        { key: '⌃U', label: 'Clear' },
      ];
    }
    switch (focusArea) {
      case 'targets':
        return [
          { key: 'j/k', label: 'Move' },
          { key: 'Space', label: 'Toggle' },
          { key: 'h/l', label: 'Fold' },
          { key: '/', label: 'Search' },
          { key: 'f/F', label: 'Filter' },
          { key: 'Enter', label: 'Settings', primary: true },
        ];
      case 'settings':
        return [
          { key: 'j/k', label: 'Field' },
          { key: 'h/l', label: 'Value' },
          { key: 'Enter', label: 'Action', primary: true },
          { key: 'Esc', label: 'Targets' },
        ];
      case 'action':
        return [
          { key: 'Enter', label: 'Build', primary: true },
          { key: 'a', label: 'Quick check' },
          { key: 'Esc', label: 'Targets' },
        ];
      case 'output':
        return [
          { key: 'j/k', label: 'Scroll' },
          { key: 'g/G', label: 'Top/Bottom' },
          { key: 'f', label: 'Follow' },
          { key: 'Tab', label: 'Targets' },
        ];
      default:
        return [];
    }
  }, [focusArea, buildSearchActive, ctrl.status]);

  const focusContext = `Build › ${focusArea[0]!.toUpperCase()}${focusArea.slice(1)}`;

  if (targets.length === 0) {
    return (
      <TabFrame>
        <PageHeader title="Build" subtitle="Search/filter targets, configure, build, or run analyzer check." />
        <EmptyState
          title="No build targets found"
          hint="Move to a directory with .sln, .csproj, .vcxproj, or CMakeLists.txt — or rescan from Settings."
          actions={[
            { key: '8', label: 'Open Settings' },
            { key: '3', label: 'Open Projects' },
          ]}
        />
      </TabFrame>
    );
  }

  const canBuild = !!currentTarget && !!ctrl.profile;
  const targetMaxVisible = focusArea === 'settings' ? 4 : 8;
  const settingsSummary =
    `${ctrl.uniqueConfigs[ctrl.configIdx] ?? 'Debug'} · ${ctrl.uniquePlatforms[ctrl.platformIdx] ?? 'Any CPU'} · ` +
    `${VERBOSITIES[ctrl.verbosityIdx]} · jobs ${ctrl.parallelBuild ? `auto×${ctrl.autoJobs}` : 'off'} · ` +
    `dev ${ctrl.useDevShell ? 'on' : 'off'}`;

  return (
    <TabFrame>
      <PageHeader title="Build" subtitle="Search/filter targets, configure, build, or run analyzer check." />

      <BuildActionBar
        status={ctrl.status}
        result={ctrl.result}
        canBuild={canBuild}
        actionFocused={focusArea === 'action'}
        elapsedMs={ctrl.elapsedMs}
      />

      <Box flexDirection="row" flexGrow={1} overflowY="hidden">
        {/* Left: Targets + Settings */}
        <Box flexDirection="column" width="45%" paddingRight={1} overflowY="hidden">
          <BuildTargetList
            totalCount={targets.length}
            filteredTargets={filteredTargets}
            targetIdx={targetIdx}
            onSelectTarget={setTargetIdx}
            focused={focusArea === 'targets'}
            searchActive={buildSearchActive}
            targetQuery={targetQuery}
            targetFilter={targetFilter}
            maxVisible={targetMaxVisible}
          />

          {focusArea === 'settings' ? (
            <BuildSettingsPanel
              activeSetting={activeSetting}
              uniqueConfigs={ctrl.uniqueConfigs}
              configIdx={ctrl.configIdx}
              uniquePlatforms={ctrl.uniquePlatforms}
              platformIdx={ctrl.platformIdx}
              verbosityIdx={ctrl.verbosityIdx}
              parallelBuild={ctrl.parallelBuild}
              useDevShell={ctrl.useDevShell}
              autoJobs={ctrl.autoJobs}
              hardware={ctrl.hardware}
            />
          ) : null}
        </Box>

        {/* Right: command preview + result + isolated output panel */}
        <Box flexDirection="column" flexGrow={1} overflowY="hidden" paddingLeft={1}>
          <BuildPreviewPanel
            commandPreview={ctrl.commandPreview}
            result={ctrl.result}
            status={ctrl.status}
            profileSummary={settingsSummary}
          />
          <BuildOutputPanel focused={focusArea === 'output'} minColumn={splitColumn + 1} />
        </Box>
      </Box>

      <Box flexShrink={0}>
        <KeyHints hints={contextualHints} context={focusContext} />
      </Box>
    </TabFrame>
  );
};
