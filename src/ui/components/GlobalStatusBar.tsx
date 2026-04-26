import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { theme } from '../themes/theme.js';

const statusText = (status: string, compact: boolean): string => {
  if (!compact) return status;
  if (status === 'done') return 'ok';
  if (status === 'scanning') return 'scan';
  if (status === 'error') return 'err';
  return status;
};

const scanColor = (status: string) =>
  status === 'done' ? theme.color.status.ok
  : status === 'error' ? theme.color.status.danger
  : theme.color.status.warning;

const buildColor = (status: string | undefined) =>
  status === 'success' ? theme.color.status.ok
  : status === 'failure' ? theme.color.status.danger
  : status === 'cancelled' ? theme.color.status.warning
  : theme.color.text.muted;

export const GlobalStatusBar: React.FC = () => {
  const { stdout } = useStdout();
  const compact = (stdout?.columns ?? 80) < 100;
  const envScanStatus = useAppStore(s => s.envScanStatus);
  const projectScanStatus = useAppStore(s => s.projectScanStatus);
  const projects = useAppStore(s => s.projects);
  const diagnostics = useAppStore(s => s.diagnostics);
  const buildResult = useAppStore(s => s.buildResult);
  const logCount = useAppStore(s => s.logEntries.length);

  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;
  const muted = theme.color.text.muted;

  return (
    <Box paddingX={1} flexShrink={0} overflow="hidden">
      <Text wrap="truncate">
        <Text color={muted as any}>{compact ? 'scan ' : 'Scan '}</Text>
        <Text color={scanColor(envScanStatus) as any}>env:{statusText(envScanStatus, compact)}</Text>
        <Text color={muted as any}> · </Text>
        <Text color={scanColor(projectScanStatus) as any}>proj:{statusText(projectScanStatus, compact)}</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'targets' : 'targets:'}</Text>
        <Text bold color={theme.color.accent.primary as any}> {projects.length}</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'diag' : 'diag:'}</Text>
        <Text color={(errors > 0 ? theme.color.status.danger : theme.color.status.ok) as any}> {errors}E</Text>
        <Text color={(warnings > 0 ? theme.color.status.warning : muted) as any}> {warnings}W</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'logs' : 'logs:'}</Text>
        <Text bold> {logCount}</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'build' : 'last build:'}</Text>
        <Text color={buildColor(buildResult?.status) as any}>
          {' '}{buildResult?.status ?? 'none'}
        </Text>
      </Text>
    </Box>
  );
};
