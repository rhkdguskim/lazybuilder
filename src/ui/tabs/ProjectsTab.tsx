import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { PageHeader, Panel, EmptyState, LoadingState, KeyHints, TabFrame } from '../components/index.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import { theme } from '../themes/theme.js';
import { symbols } from '../themes/colors.js';
import type { ProjectInfo, SolutionInfo } from '../../domain/models/ProjectInfo.js';

const typeIcons: Record<string, string> = {
  'dotnet-sdk': 'C#',
  'dotnet-legacy': 'C#*',
  'cpp-msbuild': 'C++',
  cmake: 'CM',
  mixed: 'MIX',
};

const typeColors: Record<string, string> = {
  'dotnet-sdk': 'green',
  'dotnet-legacy': 'yellow',
  'cpp-msbuild': 'blue',
  cmake: 'magenta',
  mixed: 'cyan',
};

type Row =
  | {
      kind: 'solution';
      key: string;
      data: SolutionInfo;
      expanded: boolean;
      childCount: number;
    }
  | {
      kind: 'project';
      key: string;
      data: ProjectInfo;
      depth: 0 | 1; // 1 == nested under a solution
      parentSolutionPath?: string;
    };

export const ProjectsTab: React.FC = () => {
  const isActiveTab = useAppStore(s => s.activeTab) === 'projects';
  const projects = useAppStore(s => s.projects);
  const solutions = useAppStore(s => s.solutions);
  const projectScanStatus = useAppStore(s => s.projectScanStatus);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const expandedSolutions = useAppStore(s => s.expandedSolutions);
  const toggleSolutionExpanded = useAppStore(s => s.toggleSolutionExpanded);
  const setSolutionExpanded = useAppStore(s => s.setSolutionExpanded);
  const expandAllSolutions = useAppStore(s => s.expandAllSolutions);
  const collapseAllSolutions = useAppStore(s => s.collapseAllSolutions);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [focus, setFocus] = useState<'list' | 'detail'>('list');

  const rows = useMemo<Row[]>(() => {
    const list: Row[] = [];
    for (const sln of solutions) {
      const expanded = !!expandedSolutions[sln.filePath];
      list.push({
        kind: 'solution',
        key: `sln:${sln.filePath}`,
        data: sln,
        expanded,
        childCount: sln.projects.length,
      });
      if (expanded) {
        for (const proj of sln.projects) {
          list.push({
            kind: 'project',
            key: `prj:${sln.filePath}:${proj.filePath}`,
            data: proj,
            depth: 1,
            parentSolutionPath: sln.filePath,
          });
        }
      }
    }
    // Standalone projects (those not associated with any solution).
    for (const proj of projects) {
      if (proj.solutionPath) continue;
      list.push({
        kind: 'project',
        key: `prj:${proj.filePath}`,
        data: proj,
        depth: 0,
      });
    }
    return list;
  }, [projects, solutions, expandedSolutions]);

  // Clamp selection if the visible list shrinks (e.g., a solution was just collapsed).
  useEffect(() => {
    if (selectedIdx >= rows.length) {
      setSelectedIdx(Math.max(0, rows.length - 1));
    }
  }, [rows.length, selectedIdx]);

  const selected = rows[selectedIdx];

  useInput((input, key) => {
    if (key.tab) {
      setFocus(f => f === 'list' ? 'detail' : 'list');
      return;
    }

    if (focus === 'detail') {
      // Detail pane is read-only metadata for now; Esc/h returns to the list.
      if (key.escape || key.leftArrow || input === 'h') setFocus('list');
      return;
    }

    if (input === 'g') {
      setSelectedIdx(i => reduceListSelection(i, rows.length, 'top'));
      return;
    }
    if (input === 'G') {
      setSelectedIdx(i => reduceListSelection(i, rows.length, 'bottom'));
      return;
    }
    if (key.upArrow || input === 'k') {
      setSelectedIdx(i => reduceListSelection(i, rows.length, 'up'));
      return;
    }
    if (key.downArrow || input === 'j') {
      setSelectedIdx(i => reduceListSelection(i, rows.length, 'down'));
      return;
    }

    // Expand/collapse keys (lazygit-style).
    if (input === ' ') {
      if (selected?.kind === 'solution') {
        toggleSolutionExpanded(selected.data.filePath);
      }
      return;
    }
    if (key.rightArrow || input === 'l') {
      if (selected?.kind === 'solution' && !selected.expanded) {
        setSolutionExpanded(selected.data.filePath, true);
      }
      return;
    }
    if (key.leftArrow || input === 'h') {
      if (selected?.kind === 'solution' && selected.expanded) {
        setSolutionExpanded(selected.data.filePath, false);
        return;
      }
      // Standing on a child project — collapse and jump back to its parent.
      if (selected?.kind === 'project' && selected.depth === 1 && selected.parentSolutionPath) {
        setSolutionExpanded(selected.parentSolutionPath, false);
        const parentIdx = rows.findIndex(
          r => r.kind === 'solution' && r.data.filePath === selected.parentSolutionPath,
        );
        if (parentIdx >= 0) setSelectedIdx(parentIdx);
      }
      return;
    }

    // Bulk toggles.
    if (input === 'E') {
      expandAllSolutions(solutions.map(s => s.filePath));
      return;
    }
    if (input === 'C') {
      collapseAllSolutions();
      return;
    }

    if (key.return) {
      if (selected?.kind === 'solution') {
        toggleSolutionExpanded(selected.data.filePath);
        return;
      }
      if (selected?.kind === 'project') {
        setActiveTab('build');
      }
    }
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  if (projectScanStatus === 'scanning' || projectScanStatus === 'idle') {
    return (
      <TabFrame>
        <PageHeader title="Projects" subtitle="Browse detected solutions and buildable projects." />
        <LoadingState label="Scanning projects" hint="Looking for .sln, .csproj, .vcxproj, CMakeLists.txt under the current directory." />
      </TabFrame>
    );
  }

  if (projects.length === 0 && solutions.length === 0) {
    return (
      <TabFrame>
        <PageHeader title="Projects" subtitle="Browse detected solutions and buildable projects." />
        <EmptyState
          title="No projects or solutions found"
          hint="Move to a directory containing .sln, .csproj, .vcxproj, or CMakeLists.txt — or rescan from Settings."
          actions={[
            { key: '8', label: 'Open Settings' },
            { key: '4', label: 'Skip to Build' },
          ]}
        />
      </TabFrame>
    );
  }

  const detailTitle = selected?.kind === 'solution' ? 'Solution' : 'Project';
  const expandedCount = solutions.filter(s => expandedSolutions[s.filePath]).length;
  const panelSubtitle = solutions.length > 0
    ? `j/k move · Space toggle · h/l collapse/expand · E/C all · Enter open Build`
    : `j/k move · g/G jump · Enter open Build`;

  return (
    <TabFrame>
      <PageHeader
        title="Projects"
        subtitle="Browse detected solutions and buildable projects."
      />

      <Box flexDirection="row" flexGrow={1} overflowY="hidden">
        {/* Left: project list */}
        <Box flexDirection="column" width="45%" paddingRight={2} overflowY="hidden">
          <Panel
            title={`Targets ${rows.length}`}
            focused={focus === 'list'}
            subtitle={focus === 'list' ? panelSubtitle : 'Tab to focus'}
            rightHint={solutions.length > 0 ? `${expandedCount}/${solutions.length} open` : undefined}
          >
            <ScrollableList
              selectedIdx={selectedIdx}
              maxVisible={18}
              scrollbar
              onSelect={setSelectedIdx}
              items={rows.map((row, i) => (
                <ProjectsRowView key={row.key} row={row} selected={i === selectedIdx} />
              ))}
            />
          </Panel>
        </Box>

        {/* Right: detail panel */}
        <Box flexDirection="column" flexGrow={1} overflowY="hidden">
          <Panel
            title={`${detailTitle} Details`}
            focused={focus === 'detail'}
            subtitle={focus === 'detail' ? 'Esc/h → list · Tab to switch' : 'Tab to focus'}
          >
            <>
              {selected ? (
                selected.kind === 'solution' ? (
                  <SolutionDetail solution={selected.data} />
                ) : (
                  <ProjectDetail project={selected.data} />
                )
              ) : (
                <Text color={theme.color.text.muted as any}>Select a project to view details</Text>
              )}

              <Box marginTop={1}>
                <Text color={theme.color.text.muted as any} dimColor>
                  {selected?.kind === 'project'
                    ? 'Enter opens Build with this target selected.'
                    : 'Space/Enter expands or collapses this solution.'}
                </Text>
              </Box>
            </>
          </Panel>
        </Box>
      </Box>

      <Box flexShrink={0}>
        <KeyHints
          context={`Projects › ${focus === 'list' ? 'Targets' : detailTitle}`}
          hints={focus === 'list'
            ? [
                { key: 'j/k', label: 'Move' },
                { key: 'Space', label: 'Toggle' },
                { key: 'h/l', label: 'Collapse/Expand' },
                { key: 'E/C', label: 'All open/close' },
                { key: 'Enter', label: 'Build', primary: true },
                { key: 'Tab', label: 'Detail' },
              ]
            : [
                { key: 'Tab', label: 'Targets', primary: true },
                { key: 'Esc/h', label: 'Targets' },
              ]}
        />
      </Box>
    </TabFrame>
  );
};

const ProjectsRowView: React.FC<{ row: Row; selected: boolean }> = ({ row, selected }) => {
  const cursor = selected ? `${theme.glyphs.focus} ` : '  ';
  if (row.kind === 'solution') {
    const sln = row.data;
    const marker = row.expanded ? theme.glyphs.treeExpanded : theme.glyphs.treeCollapsed;
    return (
      <Text inverse={selected} wrap="truncate">
        {cursor}
        <Text color={theme.color.accent.primary as any}>{marker}</Text>
        {' '}
        <Text color={theme.color.accent.primary as any}>[SLN]</Text>
        {' '}{sln.name}.sln
        <Text color={theme.color.text.muted as any}> ({sln.solutionType}, {sln.projects.length} proj)</Text>
      </Text>
    );
  }
  const proj = row.data;
  const icon = typeIcons[proj.projectType] ?? '?';
  const color = typeColors[proj.projectType] ?? theme.color.text.muted!;
  const indent = row.depth === 1 ? `   ${theme.glyphs.treeBranch} ` : '';
  return (
    <Text inverse={selected} wrap="truncate">
      {cursor}
      {indent && <Text color={theme.color.text.muted as any}>{indent}</Text>}
      <Text color={color}>[{icon}]</Text>
      {' '}{proj.name}
      {proj.riskFlags.length > 0 && <Text color={theme.color.status.warning as any}> !</Text>}
    </Text>
  );
};

const SolutionDetail: React.FC<{ solution: SolutionInfo }> = ({ solution }) => (
  <Box flexDirection="column">
    <Text bold>{solution.name}.sln</Text>
    <Box height={1} />
    <Row label="Path" value={solution.filePath} />
    <Row label="Type" value={solution.solutionType} color={typeColors[solution.solutionType] ?? theme.color.text.muted} />
    <Row label="Projects" value={String(solution.projects.length)} />
    <Row label="Configs" value={solution.configurations.map(config => `${config.configuration}·${config.platform}`).join(', ') || 'N/A'} />
    <Box height={1} />
    <Text bold>Contained Projects</Text>
    {solution.projects.map(project => (
      <Text key={project.filePath} color={theme.color.text.muted as any}>  {project.name}</Text>
    ))}
  </Box>
);

const ProjectDetail: React.FC<{ project: ProjectInfo }> = ({ project }) => (
  <Box flexDirection="column">
    <Text bold>{project.name}</Text>
    <Box height={1} />

    <Box flexDirection="column">
      <Row label="Path" value={project.filePath} />
      <Row label="Type" value={project.projectType} color={typeColors[project.projectType]} />
      <Row label="Language" value={project.language} />
      <Row label="Build System" value={project.buildSystem} />
      <Row label="Recommended" value={project.recommendedCommand} color={theme.color.accent.primary} />

      {project.targetFrameworks.length > 0 && (
        <Row label="Target FW" value={project.targetFrameworks.join(', ')} />
      )}
      {project.platformTargets.length > 0 && (
        <Row label="Platforms" value={project.platformTargets.join(', ')} />
      )}
      {project.platformToolset && (
        <Row label="Toolset" value={project.platformToolset} />
      )}
      {project.windowsSdkVersion && (
        <Row label="Windows SDK" value={project.windowsSdkVersion} />
      )}
      {project.solutionPath && (
        <Row label="Solution" value={project.solutionPath} color={theme.color.text.muted} />
      )}
    </Box>

    {project.dependencies.length > 0 && (
      <>
        <Box height={1} />
        <Text bold>Dependencies ({project.dependencies.length})</Text>
        {project.dependencies.slice(0, 10).map(dep => (
          <Text key={dep} color={theme.color.text.muted as any}>  {dep}</Text>
        ))}
        {project.dependencies.length > 10 && (
          <Text color={theme.color.text.muted as any} dimColor>  …and {project.dependencies.length - 10} more</Text>
        )}
      </>
    )}

    {project.riskFlags.length > 0 && (
      <>
        <Box height={1} />
        <Text bold color={theme.color.status.warning as any}>Risk flags</Text>
        {project.riskFlags.map(flag => (
          <Text key={flag} color={theme.color.status.warning as any} wrap="truncate">  {symbols.warning} {flag}</Text>
        ))}
      </>
    )}
  </Box>
);

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Box flexDirection="row">
    <Box width={16}>
      <Text color={theme.color.text.muted as any}>{label}</Text>
    </Box>
    <Text color={color as any}>{value}</Text>
  </Box>
);
