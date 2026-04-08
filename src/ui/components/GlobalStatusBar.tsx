import React from 'react';
import { Box, Text } from 'ink';
import { useAppStore } from '../store/useAppStore.js';

export const GlobalStatusBar: React.FC = () => {
  const envScanStatus = useAppStore(s => s.envScanStatus);
  const projectScanStatus = useAppStore(s => s.projectScanStatus);
  const projects = useAppStore(s => s.projects);
  const diagnostics = useAppStore(s => s.diagnostics);
  const buildResult = useAppStore(s => s.buildResult);
  const logEntries = useAppStore(s => s.logEntries);

  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;

  return (
    <Box paddingX={1} paddingY={1} borderStyle="round" borderColor="gray" justifyContent="space-between" flexShrink={0}>
      <Box>
        <Text color="gray">Scan </Text>
        <Text color={envScanStatus === 'done' ? 'green' : envScanStatus === 'error' ? 'red' : 'yellow'}>
          env:{envScanStatus}
        </Text>
        <Text color="gray"> | </Text>
        <Text color={projectScanStatus === 'done' ? 'green' : projectScanStatus === 'error' ? 'red' : 'yellow'}>
          projects:{projectScanStatus}
        </Text>
        <Text color="gray"> | </Text>
        <Text>targets:</Text>
        <Text bold color="cyan"> {projects.length}</Text>
      </Box>

      <Box>
        <Text>diag:</Text>
        <Text color={errors > 0 ? 'red' : 'green'}> {errors}E</Text>
        <Text color="yellow"> {warnings}W</Text>
        <Text color="gray"> | </Text>
        <Text>logs:</Text>
        <Text bold> {logEntries.length}</Text>
        <Text color="gray"> | </Text>
        <Text>last build:</Text>
        <Text color={
          buildResult?.status === 'success' ? 'green' :
          buildResult?.status === 'failure' ? 'red' :
          buildResult?.status === 'cancelled' ? 'yellow' : 'gray'
        }>
          {' '}{buildResult?.status ?? 'none'}
        </Text>
      </Box>
    </Box>
  );
};
