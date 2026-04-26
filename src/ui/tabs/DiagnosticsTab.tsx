import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { PageHeader, Panel, EmptyState, KeyHints, TabFrame } from '../components/index.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import type { Severity } from '../../domain/enums.js';
import { theme } from '../themes/theme.js';
import { severityColors, symbols } from '../themes/colors.js';

const FILTERS: Array<{ label: string; value: Severity | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Errors', value: 'error' },
  { label: 'Warnings', value: 'warning' },
  { label: 'OK', value: 'ok' },
];

export const DiagnosticsTab: React.FC = () => {
  const isActiveTab = useAppStore(s => s.activeTab) === 'diagnostics';
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
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  const errorCount = diagnostics.filter(d => d.severity === 'error').length;
  const warnCount = diagnostics.filter(d => d.severity === 'warning').length;

  return (
    <TabFrame>
      <PageHeader
        title="Diagnostics"
        subtitle="Review detected issues and recommended actions."
      />
      <Box flexDirection="row" marginBottom={1} flexShrink={0}>
        {FILTERS.map((f, i) => (
          <Box key={f.label} marginRight={1}>
            <Text
              inverse={i === filterIdx}
              color={(i === filterIdx ? theme.color.accent.primary : theme.color.text.muted) as any}
              bold={i === filterIdx}
            >
              {' '}{f.label}{' '}
            </Text>
          </Box>
        ))}
      </Box>

      <Panel
        title="Results"
        focused
        subtitle={`${filtered.length} item${filtered.length === 1 ? '' : 's'}`}
        rightHint={`${errorCount}E · ${warnCount}W`}
      >
        <ScrollableList
          selectedIdx={selectedIdx}
          maxVisible={15}
          scrollbar
          onSelect={setSelectedIdx}
          items={filtered.length === 0
            ? [
                <EmptyState
                  key="empty"
                  symbol={theme.symbols.ok}
                  title={filter === 'all' ? 'No issues found' : `No ${filter} items`}
                  hint={filter === 'all' ? 'Environment looks healthy.' : 'Switch filter with h/l to see other severities.'}
                />,
              ]
            : filtered.map((item, i) => {
                const color = severityColors[item.severity] ?? 'gray';
                const symbol = symbols[item.severity] ?? '?';
                const isSelected = i === selectedIdx;
                const cursor = isSelected ? `${theme.glyphs.focus} ` : '  ';
                return (
                  <Box key={item.id} flexDirection="column">
                    <Text inverse={isSelected} wrap="truncate">
                      {cursor}
                      <Text color={color}>{symbol} </Text>
                      <Text bold>{item.code}</Text>
                      <Text> {item.title}</Text>
                    </Text>
                    {isSelected && (
                      <Box flexDirection="column" paddingLeft={4}>
                        <Text color={theme.color.text.muted as any} wrap="truncate">{item.description}</Text>
                        <Text color={theme.color.accent.primary as any} wrap="truncate">
                          {theme.glyphs.action} {item.suggestedAction}
                        </Text>
                      </Box>
                    )}
                  </Box>
                );
              })
          }
        />
      </Panel>

      <Box flexShrink={0} marginTop={1}>
        <KeyHints
          context="Diagnostics"
          hints={[
            { key: 'h/l', label: 'Filter' },
            { key: 'j/k', label: 'Move' },
            { key: 'g/G', label: 'Top/Bottom' },
            { key: 'i', label: 'Install toolchain' },
          ]}
        />
      </Box>
    </TabFrame>
  );
};
