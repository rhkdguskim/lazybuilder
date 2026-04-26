import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { ScrollableList } from '../components/ScrollableList.js';
import { reduceListSelection } from '../navigation/listNavigation.js';
import { PageHeader, Panel, EmptyState, KeyHints, TabFrame } from '../components/index.js';
import { theme, statusColor } from '../themes/theme.js';

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
  const [focus, setFocus] = useState<'list' | 'detail'>('list');

  const ordered = useMemo(() => [...history].reverse(), [history]);

  useEffect(() => {
    if (selectedIdx >= ordered.length) {
      setSelectedIdx(Math.max(0, ordered.length - 1));
    }
  }, [ordered.length, selectedIdx]);

  useInput((input, key) => {
    if (key.tab) {
      setFocus(f => f === 'list' ? 'detail' : 'list');
      return;
    }
    if (focus === 'detail') {
      if (key.escape || key.leftArrow || input === 'h') setFocus('list');
      return;
    }
    if (input === 'g') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'top'));
    if (input === 'G') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'bottom'));
    if (key.upArrow || input === 'k') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'up'));
    if (key.downArrow || input === 'j') setSelectedIdx(i => reduceListSelection(i, ordered.length, 'down'));
    if (key.rightArrow || input === 'l') setFocus('detail');
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  const selected = ordered[selectedIdx];

  const selectedSeverity =
    selected?.status === 'success' ? 'ok' :
    selected?.status === 'failure' ? 'danger' :
    selected?.status === 'cancelled' ? 'warning' : 'neutral';

  return (
    <TabFrame>
      <PageHeader title="History" subtitle="Recent builds and their diagnostics." />

      <Box flexDirection="row" flexGrow={1} overflowY="hidden">
        <Box flexDirection="column" width="48%" paddingRight={2} overflowY="hidden">
          <Panel
            title={`Runs ${ordered.length}`}
            focused={focus === 'list'}
            subtitle={focus === 'list' ? 'j/k move · g/G jump · Tab → detail' : 'Tab to focus'}
          >
            {ordered.length === 0 ? (
              <EmptyState
                title="No build history yet"
                hint="Run a build to populate this view."
                actions={[{ key: '4', label: 'Open Build' }]}
              />
            ) : (
              <ScrollableList
                selectedIdx={selectedIdx}
                maxVisible={18}
                onSelect={setSelectedIdx}
                items={ordered.map((r, i) => {
                  const severity =
                    r.status === 'success' ? 'ok' :
                    r.status === 'failure' ? 'danger' :
                    r.status === 'cancelled' ? 'warning' : 'neutral';
                  const isSelected = i === selectedIdx;
                  return (
                    <Box key={i} flexDirection="row">
                      <Text inverse={isSelected} color={statusColor(severity) as any}>
                        {isSelected ? `${theme.glyphs.focus} ` : '  '}{formatTime(r.startTime)} {r.status.toUpperCase()}
                      </Text>
                      <Text color={theme.color.text.muted as any}> {formatDuration(r.durationMs)} · {r.errorCount}E/{r.warningCount}W</Text>
                    </Box>
                  );
                })}
              />
            )}
          </Panel>
        </Box>

        <Box flexDirection="column" flexGrow={1} overflowY="hidden">
          <Panel
            title="Selected Run"
            focused={focus === 'detail'}
            status={selected ? selectedSeverity : 'neutral'}
            subtitle={selected ? selected.startTime.toISOString() : focus === 'detail' ? 'Esc/h → list · Tab to switch' : 'Pick a run from the left.'}
          >
            <DetailRow label="Status" value={selected?.status ?? '—'} color={statusColor(selectedSeverity)} />
            <DetailRow label="Duration" value={selected ? formatDuration(selected.durationMs) : '—'} />
            <DetailRow label="Exit code" value={selected ? (selected.exitCode === null ? 'N/A' : String(selected.exitCode)) : '—'} />
            <DetailRow
              label="Errors"
              value={selected ? String(selected.errorCount) : '—'}
              color={selected && selected.errorCount > 0 ? theme.color.status.danger : theme.color.text.muted}
            />
            <DetailRow
              label="Warnings"
              value={selected ? String(selected.warningCount) : '—'}
              color={selected && selected.warningCount > 0 ? theme.color.status.warning : theme.color.text.muted}
            />
            <Box height={1} />
            <Text bold>Diagnostics</Text>
            <ScrollableList
              selectedIdx={0}
              maxVisible={8}
              items={selected && (selected.errors.length > 0 || selected.warnings.length > 0)
                ? [
                    ...selected.errors.slice(0, 10).map((item, i) => (
                      <Text key={`e-${i}`} color={theme.color.status.danger as any} wrap="truncate">{item.code}: {item.message}</Text>
                    )),
                    ...selected.warnings.slice(0, 10).map((item, i) => (
                      <Text key={`w-${i}`} color={theme.color.status.warning as any} wrap="truncate">{item.code}: {item.message}</Text>
                    )),
                  ]
                : [<Text key="none" color={theme.color.text.muted as any}>No diagnostics</Text>]
              }
            />
          </Panel>
        </Box>
      </Box>

      <Box flexShrink={0}>
        <KeyHints
          context={`History › ${focus === 'list' ? 'Runs' : 'Selected Run'}`}
          hints={focus === 'list'
            ? [
                { key: 'j/k', label: 'Move' },
                { key: 'g/G', label: 'Top/Bottom' },
                { key: 'Tab', label: 'Detail' },
              ]
            : [
                { key: 'Tab', label: 'Runs', primary: true },
                { key: 'Esc/h', label: 'Runs' },
              ]}
        />
      </Box>
    </TabFrame>
  );
};

const DetailRow: React.FC<{ label: string; value: string; color?: string }> = ({ label, value, color }) => (
  <Box flexDirection="row">
    <Box width={12}>
      <Text color={theme.color.text.muted as any}>{label}</Text>
    </Box>
    <Text color={color as any}>{value}</Text>
  </Box>
);
