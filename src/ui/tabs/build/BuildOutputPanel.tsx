import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useAppStore } from '../../store/useAppStore.js';
import { Panel, LoadingState, ScrollPane } from '../../components/index.js';
import { useMouseInput } from '../../hooks/useMouseInput.js';
import { theme } from '../../themes/theme.js';

const isTTY = !!process.stdin.isTTY;
const MAX_VISIBLE = 15;

/**
 * Isolated component with its own scroll state.
 * Memoized so it only re-renders when log entries or build status change.
 */
export const BuildOutputPanel: React.FC<{ focused?: boolean; minColumn: number }> = React.memo(
  ({ focused = false, minColumn }) => {
    const logEntries = useAppStore((s) => s.logEntries);
    const status = useAppStore((s) => s.buildStatus);
    const [scrollOffset, setScrollOffset] = useState(0);
    const [following, setFollowing] = useState(true);

    const maxOffset = Math.max(0, logEntries.length - MAX_VISIBLE);
    const effectiveOffset = following ? maxOffset : Math.min(scrollOffset, maxOffset);

    useEffect(() => {
      if (following) setScrollOffset(maxOffset);
    }, [logEntries.length, following, maxOffset]);

    useInput(
      (input, key) => {
        if (key.upArrow || input === 'k') {
          setFollowing(false);
          setScrollOffset((o) => Math.max(0, o - 1));
        }
        if (key.downArrow || input === 'j') {
          const next = Math.min(maxOffset, scrollOffset + 1);
          setScrollOffset(next);
          if (next >= maxOffset) setFollowing(true);
        }
        if (input === 'g') {
          setFollowing(false);
          setScrollOffset(0);
        }
        if (input === 'G') {
          setFollowing(true);
          setScrollOffset(maxOffset);
        }
        if (input === 'f') setFollowing((f) => !f);
      },
      { isActive: isTTY && focused },
    );

    useMouseInput((event) => {
      if (event.type !== 'scroll' || event.x < minColumn) return;

      if (event.direction === -1) {
        setFollowing(false);
        setScrollOffset((o) => Math.max(0, o - 1));
        return;
      }

      setScrollOffset((o) => {
        const next = Math.min(maxOffset, o + 1);
        if (next >= maxOffset) setFollowing(true);
        return next;
      });
    }, isTTY && focused);

    const subtitle = focused
      ? `${logEntries.length} lines · ${following ? theme.glyphs.follow : 'Scroll'} · j/k g/G f`
      : `${logEntries.length} lines`;

    const items = useMemo<React.ReactNode[]>(() => logEntries.map((entry) => {
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
    }), [logEntries]);

    return (
      <Panel title="Output" focused={focused} subtitle={subtitle}>
        <Box flexDirection="column" flexGrow={1} overflowY="hidden">
          {status === 'idle' && logEntries.length === 0 && (
            <Text color={theme.color.text.muted as any}>Build output will appear here</Text>
          )}
          {status === 'running' && logEntries.length === 0 && (
            <LoadingState variant="inline" label="Waiting for output…" />
          )}
          {logEntries.length > 0 && (
            <ScrollPane
              items={items}
              scrollOffset={effectiveOffset}
              visibleHeight={MAX_VISIBLE}
              showOverflowHints={false}
            />
          )}
          {logEntries.length > MAX_VISIBLE && !focused && (
            <Text color={theme.color.text.muted as any} dimColor>Focus output (Tab) to scroll</Text>
          )}
        </Box>
      </Panel>
    );
  },
);
BuildOutputPanel.displayName = 'BuildOutputPanel';
