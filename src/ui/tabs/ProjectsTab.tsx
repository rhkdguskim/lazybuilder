import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { PageHeader, Panel } from '../components/index.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import { glyphs, symbols } from '../themes/colors.js';
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

export const ProjectsTab: React.FC = () => {
  const isActiveTab = useAppStore(s => s.activeTab) === 'projects';
  const projects = useAppStore(s => s.projects);
  const solutions = useAppStore(s => s.solutions);
  const projectScanStatus = useAppStore(s => s.projectScanStatus);
  const setActiveTab = useAppStore(s => s.setActiveTab);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const items = useMemo(() => ([
    ...solutions.map(solution => ({ kind: 'solution' as const, key: solution.filePath, label: `${solution.name}.sln`, data: solution })),
    ...projects.map(project => ({ kind: 'project' as const, key: project.filePath, label: project.name, data: project })),
  ]), [projects, solutions]);

  useEffect(() => {
    if (selectedIdx >= items.length) {
      setSelectedIdx(Math.max(0, items.length - 1));
    }
  }, [items.length, selectedIdx]);

  useInput((input, key) => {
    if (input === 'g') setSelectedIdx(i => reduceListSelection(i, items.length, 'top'));
    if (input === 'G') setSelectedIdx(i => reduceListSelection(i, items.length, 'bottom'));
    if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, items.length, 'up'));
    if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, items.length, 'down'));
    if (key.return && items[selectedIdx]?.kind === 'project') setActiveTab('build');
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  if (projectScanStatus === 'scanning' || projectScanStatus === 'idle') {
    return (
      <Box padding={1}>
        <ProgressPanel label="Scanning projects..." status="scanning" />
      </Box>
    );
  }

  if (projects.length === 0 && solutions.length === 0) {
    return (
      <Box padding={1} flexDirection="column">
        <Text color="yellow">No projects or solutions found in current directory.</Text>
        <Text color="gray">Navigate to a directory containing .sln, .csproj, .vcxproj, or CMakeLists.txt files.</Text>
      </Box>
    );
  }

  const selected = items[selectedIdx];

  return (
    <Box flexDirection="row" padding={1} flexGrow={1} overflowY="hidden">
      {/* Left: project list */}
      <Box flexDirection="column" width="45%" paddingRight={2} overflowY="hidden">
        <PageHeader title="Projects" subtitle="Browse detected solutions and buildable projects." rightHint="j/k move | g/G jump | Enter build" />
        <Panel title={`Targets (${items.length})`}>
          <ScrollableList
            selectedIdx={selectedIdx}
            maxVisible={18}
            onSelect={setSelectedIdx}
            items={items.map((item, i) => {
              const isSelected = i === selectedIdx;
              if (item.kind === 'solution') {
                const solution = item.data;
                return (
                  <Text key={item.key} inverse={isSelected}>
                    {isSelected ? ` ${glyphs.play} ` : '   '}
                    <Text color="cyan">[SLN]</Text>
                    {' '}{solution.name}.sln
                    <Text color="gray"> ({solution.solutionType}, {solution.projects.length} proj)</Text>
                  </Text>
                );
              }
              const proj = item.data;
              const icon = typeIcons[proj.projectType] ?? '?';
              const color = typeColors[proj.projectType] ?? 'gray';
              return (
                <Text key={item.key} inverse={isSelected}>
                  {isSelected ? ` ${glyphs.play} ` : '   '}
                  <Text color={color}>[{icon}]</Text>
                  {' '}{proj.name}
                  {proj.riskFlags.length > 0 && <Text color="yellow"> !</Text>}
                </Text>
              );
            })}
          />
        </Panel>
      </Box>

      {/* Right: detail panel */}
      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        <PageHeader title={selected?.kind === 'solution' ? 'Solution Details' : 'Project Details'} subtitle="Inspect metadata before switching to Build." />
        <Panel title="Details">
          <>
            {selected ? (
              selected.kind === 'solution' ? (
                <SolutionDetail solution={selected.data} />
              ) : (
                <ProjectDetail project={selected.data} />
              )
            ) : (
              <Text color="gray">Select a project to view details</Text>
            )}

            <Box marginTop={1}>
              <Text color="gray">
                {selected?.kind === 'project'
                  ? 'Enter opens Build with this target selected.'
                  : 'Solutions are for inspection here. Open Build to choose a concrete target.'}
              </Text>
            </Box>
          </>
        </Panel>
      </Box>
    </Box>
  );
};

const SolutionDetail: React.FC<{ solution: SolutionInfo }> = ({ solution }) => (
  <Box flexDirection="column">
    <Text bold color="cyan">{'─── '}{solution.name}.sln{' ───'}</Text>
    <Box height={1} />
    <Row label="Path" value={solution.filePath} />
    <Row label="Type" value={solution.solutionType} color={typeColors[solution.solutionType] ?? 'gray'} />
    <Row label="Projects" value={String(solution.projects.length)} />
    <Row label="Configs" value={solution.configurations.map(config => `${config.configuration}|${config.platform}`).join(', ') || 'N/A'} />
    <Box height={1} />
    <Text bold>Contained Projects</Text>
    {solution.projects.map(project => (
      <Text key={project.filePath} color="gray">  {project.name}</Text>
    ))}
  </Box>
);

const ProjectDetail: React.FC<{ project: ProjectInfo }> = ({ project }) => {
  return (
    <Box flexDirection="column">
      <Text bold color="cyan">{'─── '}{project.name}{' ───'}</Text>
      <Box height={1} />

      <Box flexDirection="column">
        <Row label="Path" value={project.filePath} />
        <Row label="Type" value={project.projectType} color={typeColors[project.projectType]} />
        <Row label="Language" value={project.language} />
        <Row label="Build System" value={project.buildSystem} />
        <Row label="Recommended" value={project.recommendedCommand} color="cyan" />

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
          <Row label="Solution" value={project.solutionPath} color="gray" />
        )}
      </Box>

      {project.dependencies.length > 0 && (
        <>
          <Box height={1} />
          <Text bold>Dependencies ({project.dependencies.length}):</Text>
          {project.dependencies.slice(0, 10).map(dep => (
            <Text key={dep} color="gray">  {dep}</Text>
          ))}
          {project.dependencies.length > 10 && (
            <Text color="gray">  ... and {project.dependencies.length - 10} more</Text>
          )}
        </>
      )}

      {project.riskFlags.length > 0 && (
        <>
          <Box height={1} />
          <Text bold color="yellow">Risk Flags:</Text>
          {project.riskFlags.map(flag => (
            <Text key={flag} color="yellow" wrap="truncate">  {symbols.warning} {flag}</Text>
          ))}
        </>
      )}
    </Box>
  );
};

const Row: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Box flexDirection="row">
    <Box width={16}>
      <Text color="gray">{label}</Text>
    </Box>
    <Text color={color as any}>{value}</Text>
  </Box>
);
