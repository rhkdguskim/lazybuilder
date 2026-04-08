import React from 'react';
import { Box, Text } from 'ink';
import { useAppStore } from '../store/useAppStore.js';

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}.${Math.floor((ms % 1000) / 100)}s`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export const HistoryTab: React.FC = () => {
  const history = useAppStore(s => s.buildHistory);

  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
      <Text bold color="cyan">{'─── Build History ───'}</Text>
      <Box height={1} />

      {history.length === 0 ? (
        <Text color="gray">No build history yet. Run a build to see results here.</Text>
      ) : (
        <>
          {/* Header */}
          <Box flexDirection="row">
            <Box width={6}><Text bold color="gray"> #</Text></Box>
            <Box width={10}><Text bold color="gray">Time</Text></Box>
            <Box width={12}><Text bold color="gray">Duration</Text></Box>
            <Box width={10}><Text bold color="gray">Status</Text></Box>
            <Box width={8}><Text bold color="gray">Errors</Text></Box>
            <Box width={8}><Text bold color="gray">Warns</Text></Box>
          </Box>

          {/* Rows (newest first) */}
          {[...history].reverse().map((r, i) => {
            const statusColor = r.status === 'success' ? 'green' : r.status === 'failure' ? 'red' : 'yellow';
            return (
              <Box key={i} flexDirection="row">
                <Box width={6}><Text color="gray"> {history.length - i}</Text></Box>
                <Box width={10}><Text>{formatTime(r.startTime)}</Text></Box>
                <Box width={12}><Text bold>{formatDuration(r.durationMs)}</Text></Box>
                <Box width={10}><Text color={statusColor}>{r.status}</Text></Box>
                <Box width={8}><Text color={r.errorCount > 0 ? 'red' : undefined}>{r.errorCount}</Text></Box>
                <Box width={8}><Text color={r.warningCount > 0 ? 'yellow' : undefined}>{r.warningCount}</Text></Box>
              </Box>
            );
          })}
        </>
      )}
    </Box>
  );
};
