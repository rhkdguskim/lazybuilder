import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { PageHeader, Panel, KeyHints, TabFrame } from '../components/index.js';
import { theme } from '../themes/theme.js';
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
    <TabFrame>
      <PageHeader
        title="Settings"
        subtitle="Manage environment scanning and application preferences."
      />

      <Panel title="Actions" focused subtitle="Select an action and press Enter to run.">
        <>
          {ACTIONS.map((action, i) => {
            const isSelected = i === selectedIdx;
            const isRunning = running === action.id;
            return (
              <Box key={action.id} flexDirection="row">
                <Text
                  inverse={isSelected}
                  color={(isSelected ? theme.color.accent.primary : undefined) as any}
                  bold={isSelected}
                >
                  {isSelected ? `${theme.glyphs.focus} ` : '  '}
                  {isRunning ? `${theme.glyphs.running} ` : ''}{action.label}
                </Text>
                <Text color={theme.color.text.muted as any} wrap="truncate"> · {action.description}</Text>
              </Box>
            );
          })}
        </>
      </Panel>

      <Box marginTop={1}>
        <Text
          color={(running
            ? theme.color.status.warning
            : lastResult
              ? (lastResult.startsWith('Error') ? theme.color.status.danger : theme.color.status.ok)
              : theme.color.text.muted) as any}
        >
          {running
            ? `Running: ${running}…`
            : lastResult
              ? (lastResult === 'Done' ? `${theme.symbols.ok} Completed` : lastResult)
              : 'Ready'}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Panel title="Info">
          <>
            <Text color={theme.color.text.muted as any}>Working directory: {process.cwd()}</Text>
            <Text color={theme.color.text.muted as any}>
              Environment scanned: {snapshot ? theme.symbols.ok : theme.symbols.error}
            </Text>
            <Text color={theme.color.text.muted as any}>Projects found: {projects.length}</Text>
          </>
        </Panel>
      </Box>

      <Box flexShrink={0} marginTop={1}>
        <KeyHints
          context="Settings"
          hints={[
            { key: 'j/k', label: 'Move' },
            { key: 'Enter', label: 'Execute', primary: true },
          ]}
        />
      </Box>
    </TabFrame>
  );
};
