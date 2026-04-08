import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { PageHeader, Panel } from '../components/index.js';
import { EnvironmentService } from '../../application/EnvironmentService.js';
import { ProjectScanService } from '../../application/ProjectScanService.js';
import { DiagnosticsService } from '../../application/DiagnosticsService.js';

type SettingsAction = 'reload-env' | 'rescan-projects' | 'reload-all';
const ACTIONS: Array<{ id: SettingsAction; label: string; description: string }> = [
  { id: 'reload-env', label: 'Reload Environment', description: 'Re-detect .NET, MSBuild, C++ toolchain, CMake, Windows SDK' },
  { id: 'rescan-projects', label: 'Rescan Projects', description: 'Re-scan current directory for .sln, .csproj, .vcxproj, CMakeLists.txt' },
  { id: 'reload-all', label: 'Reload All', description: 'Full reload: environment + projects + diagnostics' },
];

const envService = new EnvironmentService();
const projService = new ProjectScanService();
const diagService = new DiagnosticsService();

export const SettingsTab: React.FC = () => {
  const isActiveTab = useAppStore(s => s.activeTab) === 'settings';
  const setSnapshot = useAppStore(s => s.setSnapshot);
  const setEnvScanStatus = useAppStore(s => s.setEnvScanStatus);
  const setProjects = useAppStore(s => s.setProjects);
  const setProjectScanStatus = useAppStore(s => s.setProjectScanStatus);
  const setDiagnostics = useAppStore(s => s.setDiagnostics);
  const snapshot = useAppStore(s => s.snapshot);
  const projects = useAppStore(s => s.projects);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [running, setRunning] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const runAction = async (action: SettingsAction) => {
    setRunning(action);
    setLastResult(null);

    try {
      if (action === 'reload-env' || action === 'reload-all') {
        setEnvScanStatus('scanning');
        const newSnapshot = await envService.scan();
        setSnapshot(newSnapshot);
        setEnvScanStatus('done');

        if (action === 'reload-all') {
          setProjectScanStatus('scanning');
          const result = await projService.scan(process.cwd());
          setProjects(result.projects, result.solutions);
          setProjectScanStatus('done');

          const diags = diagService.analyze(newSnapshot, result.projects);
          setDiagnostics(diags);
        } else {
          // Re-run diagnostics with existing projects
          const currentProjects = useAppStore.getState().projects;
          const diags = diagService.analyze(newSnapshot, currentProjects);
          setDiagnostics(diags);
        }
      }

      if (action === 'rescan-projects') {
        setProjectScanStatus('scanning');
        const result = await projService.scan(process.cwd());
        setProjects(result.projects, result.solutions);
        setProjectScanStatus('done');

        const currentSnapshot = useAppStore.getState().snapshot;
        if (currentSnapshot) {
          const diags = diagService.analyze(currentSnapshot, result.projects);
          setDiagnostics(diags);
        }
      }

      setLastResult('Done');
    } catch (err) {
      setLastResult(`Error: ${err}`);
    } finally {
      setRunning(null);
    }
  };

  useInput((input, key) => {
    if (running) return;
    if (key.upArrow || input === 'k') setSelectedIdx(i => Math.max(0, i - 1));
    if (key.downArrow || input === 'j') setSelectedIdx(i => Math.min(ACTIONS.length - 1, i + 1));
    if (key.return) {
      runAction(ACTIONS[selectedIdx]!.id);
    }
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
      <PageHeader
        title="Settings"
        subtitle="Manage environment scanning and application preferences."
        rightHint="j/k move | Enter execute"
      />

      <Panel title="Actions" focused={true} subtitle="Select an action and press Enter to run.">
        <>
          {ACTIONS.map((action, i) => {
            const isSelected = i === selectedIdx;
            const isRunning = running === action.id;
            return (
              <Box key={action.id} flexDirection="row">
                <Text inverse={isSelected} color={isSelected ? 'cyan' : undefined}>
                  {isSelected ? ' ▶ ' : '   '}
                  {isRunning ? '⟳ ' : ''}{action.label}
                </Text>
                <Text color="gray"> — {action.description}</Text>
              </Box>
            );
          })}
        </>
      </Panel>

      <Box marginTop={1}>
        <Text color={running ? 'yellow' : lastResult ? (lastResult.startsWith('Error') ? 'red' : 'green') : 'gray'}>
          {running ? `Running: ${running}...` : lastResult ? (lastResult === 'Done' ? '✔ Completed' : lastResult) : 'Ready'}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Panel title="Info">
          <>
            <Text color="gray">Working directory: {process.cwd()}</Text>
            <Text color="gray">Environment scanned: {snapshot ? '✔' : '✘'}</Text>
            <Text color="gray">Projects found: {projects.length}</Text>
          </>
        </Panel>
      </Box>
    </Box>
  );
};
