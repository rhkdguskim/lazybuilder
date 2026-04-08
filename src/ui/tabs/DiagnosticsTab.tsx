import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import type { Severity } from '../../domain/enums.js';
import { severityColors, symbols } from '../themes/colors.js';

const FILTERS: Array<{ label: string; value: Severity | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Errors', value: 'error' },
  { label: 'Warnings', value: 'warning' },
  { label: 'OK', value: 'ok' },
];

export const DiagnosticsTab: React.FC = () => {
  const diagnostics = useAppStore(s => s.diagnostics);
  const [filterIdx, setFilterIdx] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);

  const filter = FILTERS[filterIdx]!.value;
  const filtered = filter === 'all' ? diagnostics : diagnostics.filter(d => d.severity === filter);

  useEffect(() => {
    if (selectedIdx >= filtered.length) {
      setSelectedIdx(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIdx]);

  useInput((input, key) => {
    if (key.tab || input === 'l') setFilterIdx(i => (i + 1) % FILTERS.length);
    if (input === 'h') setFilterIdx(i => (i - 1 + FILTERS.length) % FILTERS.length);
    if (input === 'g') setSelectedIdx(i => reduceListSelection(i, filtered.length, 'top'));
    if (input === 'G') setSelectedIdx(i => reduceListSelection(i, filtered.length, 'bottom'));
    if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, filtered.length, 'up'));
    if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, filtered.length, 'down'));
  }, { isActive: !!process.stdin.isTTY });

  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
      <Box flexDirection="row" marginBottom={1}>
        <Text bold color="cyan">Diagnostics </Text>
        {FILTERS.map((f, i) => (
          <Box key={f.label} marginRight={1}>
            <Text inverse={i === filterIdx} color={i === filterIdx ? 'blue' : 'gray'}>
              {' '}{f.label}{' '}
            </Text>
          </Box>
        ))}
        <Text color="gray"> (h/l filter, j/k move, g/G jump)</Text>
      </Box>

      {filtered.length === 0 ? (
        <Text color="green">No issues found.</Text>
      ) : (
        <ScrollableList
          selectedIdx={selectedIdx}
          maxVisible={15}
          onSelect={setSelectedIdx}
          items={filtered.map((item, i) => {
            const color = severityColors[item.severity] ?? 'gray';
            const symbol = symbols[item.severity] ?? '?';
            const isSelected = i === selectedIdx;
            return (
              <Box key={item.id} flexDirection="column" marginBottom={isSelected ? 1 : 0}>
                <Text inverse={isSelected}>
                  <Text color={color}> {symbol} </Text>
                  <Text bold>{item.code}</Text>
                  <Text> {item.title}</Text>
                </Text>
                {isSelected && (
                  <Box flexDirection="column" paddingLeft={4}>
                    <Text color="gray">{item.description}</Text>
                    <Text color="cyan">→ {item.suggestedAction}</Text>
                    {item.relatedPaths.length > 0 && (
                      <Text color="gray">  Files: {item.relatedPaths.join(', ')}</Text>
                    )}
                  </Box>
                )}
              </Box>
            );
          })}
        />
      )}
    </Box>
  );
};
