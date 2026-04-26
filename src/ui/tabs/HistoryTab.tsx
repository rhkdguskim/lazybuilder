import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import { glyphs } from '../themes/colors.js';

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
  const isActiveTab = useAppStore(s => s.activeTab) === 'history';
  const history = useAppStore(s => s.buildHistory);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const ordered = useMemo(() => [...history].reverse(), [history]);

  useEffect(() => {
    if (selectedIdx >= ordered.length) {
      setSelectedIdx(Math.max(0, ordered.length - 1));
    }
  }, [ordered.length, selectedIdx]);

  useInput((input, key) => {
    if (input === 'g') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'top'));
    if (input === 'G') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'bottom'));
    if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'up'));
    if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'down'));
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  const selected = ordered[selectedIdx];

  return (
    <Box flexDirection="row" padding={1} flexGrow={1} overflowY="hidden">
      <Box flexDirection="column" width="48%" paddingRight={2} overflowY="hidden">
        <Text bold color="cyan">{'─── Build History ───'}</Text>
        <Text color="gray">j/k or ↑↓ move, g/G jump</Text>
        <Box height={1} />

        {ordered.length === 0 ? (
          <Text color="gray">No build history yet. Run a build to see results here.</Text>
        ) : (
          <ScrollableList
            selectedIdx={selectedIdx}
            maxVisible={18}
            onSelect={setSelectedIdx}
            items={ordered.map((r, i) => {
              const statusColor = r.status === 'success' ? 'green' : r.status === 'failure' ? 'red' : 'yellow';
              return (
                <Box key={i} flexDirection="row">
                  <Text inverse={i === selectedIdx} color={statusColor as any}>
                    {i === selectedIdx ? `${glyphs.play} ` : '  '}{formatTime(r.startTime)} {r.status.toUpperCase()}
                  </Text>
                  <Text color="gray"> {formatDuration(r.durationMs)} {r.errorCount}E/{r.warningCount}W</Text>
                </Box>
              );
            })}
          />
        )}
      </Box>

      <Box flexDirection="column" flexGrow={1} overflowY="hidden">
        <Text bold color="cyan">{'─── Selected Run ───'}</Text>
        <Box height={1} />

        <DetailRow label="Started" value={selected ? selected.startTime.toISOString() : '-'} />
        <DetailRow label="Status" value={selected?.status ?? '-'} color={selected?.status === 'success' ? 'green' : selected?.status === 'failure' ? 'red' : 'gray'} />
        <DetailRow label="Duration" value={selected ? formatDuration(selected.durationMs) : '-'} />
        <DetailRow label="Exit Code" value={selected ? (selected.exitCode === null ? 'N/A' : String(selected.exitCode)) : '-'} />
        <DetailRow label="Errors" value={selected ? String(selected.errorCount) : '-'} color={selected && selected.errorCount > 0 ? 'red' : 'gray'} />
        <DetailRow label="Warnings" value={selected ? String(selected.warningCount) : '-'} color={selected && selected.warningCount > 0 ? 'yellow' : 'gray'} />
        <Box height={1} />
        <Text bold>Diagnostics</Text>
        <ScrollableList
          selectedIdx={0}
          maxVisible={8}
          items={selected && (selected.errors.length > 0 || selected.warnings.length > 0)
            ? [
                ...selected.errors.slice(0, 10).map((item, i) => (
                  <Text key={`e-${i}`} color="red" wrap="truncate">{item.code}: {item.message}</Text>
                )),
                ...selected.warnings.slice(0, 10).map((item, i) => (
                  <Text key={`w-${i}`} color="yellow" wrap="truncate">{item.code}: {item.message}</Text>
                )),
              ]
            : [<Text key="none" color="gray">No diagnostics</Text>]
          }
        />
      </Box>
    </Box>
  );
};

const DetailRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Box flexDirection="row">
    <Box width={12}>
      <Text color="gray">{label}</Text>
    </Box>
    <Text color={color as any}>{value}</Text>
  </Box>
);
