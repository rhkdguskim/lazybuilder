import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useAppStore } from '../store/useAppStore.js';

const statusText = (status: string, compact: boolean): string => {
  if (!compact) return status;
  if (status === 'done') return 'ok';
  if (status === 'scanning') return 'scan';
  if (status === 'error') return 'err';
  return status;
};

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

  return (
    <Box paddingX={1} flexShrink={0} overflow="hidden">
      <Text wrap="truncate">
        <Text color="gray">{compact ? 'scan ' : 'Scan '}</Text>
        <Text color={envScanStatus === 'done' ? 'green' : envScanStatus === 'error' ? 'red' : 'yellow'}>
          env:{statusText(envScanStatus, compact)}
        </Text>
        <Text color="gray"> | </Text>
        <Text color={projectScanStatus === 'done' ? 'green' : projectScanStatus === 'error' ? 'red' : 'yellow'}>
          proj:{statusText(projectScanStatus, compact)}
        </Text>
        <Text color="gray"> | </Text>
        <Text>{compact ? 'targets' : 'targets:'}</Text>
        <Text bold color="cyan"> {projects.length}</Text>
        <Text color="gray"> | </Text>
        <Text>{compact ? 'diag' : 'diag:'}</Text>
        <Text color={errors > 0 ? 'red' : 'green'}> {errors}E</Text>
        <Text color="yellow"> {warnings}W</Text>
        <Text color="gray"> | </Text>
        <Text>{compact ? 'logs' : 'logs:'}</Text>
        <Text bold> {logCount}</Text>
        <Text color="gray"> | </Text>
        <Text>{compact ? 'build' : 'last build:'}</Text>
        <Text color={
          buildResult?.status === 'success' ? 'green' :
          buildResult?.status === 'failure' ? 'red' :
          buildResult?.status === 'cancelled' ? 'yellow' : 'gray'
        }>
          {' '}{buildResult?.status ?? 'none'}
        </Text>
      </Text>
    </Box>
  );
};
