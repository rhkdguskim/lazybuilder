import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { reduceLogNavigation } from '../navigation/logNavigation.js';
import { EmptyState, KeyHints, Panel, PageHeader, TabFrame, ScrollPane } from '../components/index.js';
import { theme } from '../themes/theme.js';

type LogFilter = 'all' | 'error' | 'warning' | 'stderr';
const FILTERS: Array<{ label: string; value: LogFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Errors', value: 'error' },
  { label: 'Warnings', value: 'warning' },
  { label: 'Stderr', value: 'stderr' },
];

export const LogsTab: React.FC = () => {
  const isActiveTab = useAppStore(s => s.activeTab) === 'logs';
  const logEntries = useAppStore(s => s.logEntries);
  const clearLogs = useAppStore(s => s.clearLogs);
  const [filterIdx, setFilterIdx] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [following, setFollowing] = useState(true);

  const filter = FILTERS[filterIdx]!.value;

  const filtered = useMemo(() => {
    if (filter === 'all') return logEntries;
    if (filter === 'stderr') return logEntries.filter(e => e.source === 'stderr');
    return logEntries.filter(e => e.level === filter);
  }, [logEntries, filter]);

  const windowSize = 25;
  const maxOffset = Math.max(0, filtered.length - windowSize);

  useEffect(() => {
    if (!following && scrollOffset > maxOffset) {
      setScrollOffset(maxOffset);
    }
  }, [following, maxOffset, scrollOffset]);

  useEffect(() => {
    if (following) {
      setScrollOffset(maxOffset);
    }
  }, [following, maxOffset]);

  // Auto-follow
  const effectiveOffset = following ? maxOffset : Math.min(scrollOffset, maxOffset);
  const renderedItems = useMemo<React.ReactNode[]>(() => filtered.map((entry) => {
    const marker =
      entry.level === 'error' ? 'E '
      : entry.level === 'warning' ? 'W '
      : entry.source === 'stderr' ? 'S '
      : '  ';
    const color =
      entry.level === 'error' ? theme.color.status.danger
      : entry.level === 'warning' ? theme.color.status.warning
      : entry.source === 'stderr' ? theme.color.status.danger
      : undefined;
    return (
      <Text key={entry.index} color={color as any} wrap="truncate">
        <Text bold>{marker}</Text>{entry.text}
      </Text>
    );
  }), [filtered]);

  const errorCount = logEntries.filter(e => e.level === 'error').length;
  const warnCount = logEntries.filter(e => e.level === 'warning').length;

  useInput((input, key) => {
    // Ctrl+L must be checked before bare 'l' because the chord delivers
    // input==='l' AND key.ctrl together.
    if (key.ctrl && input === 'l') {
      clearLogs();
      return;
    }
    if (key.tab || input === 'l') {
      setFilterIdx(i => (i + 1) % FILTERS.length);
      return;
    }
    if (input === 'h') {
      setFilterIdx(i => (i - 1 + FILTERS.length) % FILTERS.length);
      return;
    }
    if (input === 'g') {
      const next = reduceLogNavigation({ following, scrollOffset, maxOffset }, 'top');
      setFollowing(next.following);
      setScrollOffset(next.scrollOffset);
      return;
    }
    if (input === 'G') {
      const next = reduceLogNavigation({ following, scrollOffset, maxOffset }, 'bottom');
      setFollowing(next.following);
      setScrollOffset(next.scrollOffset);
      return;
    }
    if (key.upArrow || input === 'k') {
      const next = reduceLogNavigation({ following, scrollOffset, maxOffset }, 'up');
      setFollowing(next.following);
      setScrollOffset(next.scrollOffset);
      return;
    }
    if (key.downArrow || input === 'j') {
      const next = reduceLogNavigation({ following, scrollOffset, maxOffset }, 'down');
      setFollowing(next.following);
      setScrollOffset(next.scrollOffset);
      return;
    }
    if (input === 'f') {
      const next = reduceLogNavigation({ following, scrollOffset, maxOffset }, 'toggle-follow');
      setFollowing(next.following);
      setScrollOffset(next.scrollOffset);
      return;
    }
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  const headerRightHint =
    `${following ? theme.glyphs.follow : theme.glyphs.paused} · ${filtered.length}/${logEntries.length} lines`;
  return (
    <TabFrame>
      <PageHeader
        title="Logs"
        subtitle="Live build output, filtered."
        rightHint={headerRightHint}
      />

      {/* Filter pills + counts */}
      <Box flexDirection="row" justifyContent="space-between" flexShrink={0} marginBottom={1}>
        <Box flexDirection="row">
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
        <Box>
          <Text color={(errorCount > 0 ? theme.color.status.danger : theme.color.text.muted) as any}>{errorCount}E</Text>
          <Text color={(warnCount > 0 ? theme.color.status.warning : theme.color.text.muted) as any}> {warnCount}W</Text>
        </Box>
      </Box>

      {/* Log view */}
      <Panel title="Output" focused subtitle={following ? 'live · auto-follow' : 'paused — j/k to scroll, f to resume'} flexGrow={1}>
        {filtered.length > 0 ? (
          <ScrollPane
            items={renderedItems}
            scrollOffset={effectiveOffset}
            visibleHeight={windowSize}
            showOverflowHints={false}
          />
        ) : (
          <EmptyState
            title={logEntries.length === 0 ? 'No build logs yet' : 'No entries match filter'}
            hint={logEntries.length === 0 ? 'Run a build to populate this view.' : 'Press h/l to switch filters.'}
            actions={logEntries.length === 0
              ? [{ key: '4', label: 'Open Build' }]
              : [{ key: 'h/l', label: 'Change filter' }]}
          />
        )}
      </Panel>

      {/* Footer */}
      <Box flexShrink={0}>
        <KeyHints
          context="Logs"
          hints={[
            { key: 'h/l', label: 'Filter' },
            { key: 'j/k', label: 'Scroll' },
            { key: 'g/G', label: 'Top/Bottom' },
            { key: 'f', label: 'Follow' },
            { key: '⌃L', label: 'Clear' },
          ]}
        />
      </Box>
    </TabFrame>
  );
};
