import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { reduceLogNavigation } from '../navigation/logNavigation.js';

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
  const visible = filtered.slice(effectiveOffset, effectiveOffset + windowSize);

  const errorCount = logEntries.filter(e => e.level === 'error').length;
  const warnCount = logEntries.filter(e => e.level === 'warning').length;

  useInput((input, key) => {
    if (key.tab || input === 'l') setFilterIdx(i => (i + 1) % FILTERS.length);
    if (input === 'h') setFilterIdx(i => (i - 1 + FILTERS.length) % FILTERS.length);
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
    }
    if (key.ctrl && input === 'l') clearLogs();
  }, { isActive: !!process.stdin.isTTY && isActiveTab });

  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
      {/* Header */}
      <Box flexDirection="row" justifyContent="space-between">
        <Box>
          <Text bold color="cyan">Logs </Text>
          {FILTERS.map((f, i) => (
            <Box key={f.label} marginRight={1}>
              <Text inverse={i === filterIdx} color={i === filterIdx ? 'blue' : 'gray'}>
                {' '}{f.label}{' '}
              </Text>
            </Box>
          ))}
        </Box>
        <Box>
          <Text color={following ? 'green' : 'gray'}>
            {following ? '⬇ Follow' : '⏸ Paused'}
          </Text>
          <Text color="gray"> | {filtered.length}/{logEntries.length} lines</Text>
          <Text color={errorCount > 0 ? 'red' : 'gray'}> {errorCount}E</Text>
          <Text color={warnCount > 0 ? 'yellow' : 'gray'}> {warnCount}W</Text>
        </Box>
      </Box>

      {/* Log view — always renders same structure */}
      <Box flexDirection="column" flexGrow={1} marginTop={1} borderStyle="single" paddingX={1} overflowY="hidden">
        {visible.length > 0 ? (
          visible.map((entry) => (
            <Text key={entry.index} color={
              entry.level === 'error' ? 'red' :
              entry.level === 'warning' ? 'yellow' :
              entry.source === 'stderr' ? 'red' : undefined
            } wrap="truncate">
              {entry.text}
            </Text>
          ))
        ) : (
          <Text color="gray">
            {logEntries.length === 0 ? 'No build logs yet.' : 'No entries match filter.'}
          </Text>
        )}
      </Box>

      {/* Footer */}
      <Box marginTop={1}>
        <Text color="gray">h/l: filter | j/k: scroll | g/G: top/bottom | f: follow | Ctrl+L: clear</Text>
      </Box>
    </Box>
  );
};
