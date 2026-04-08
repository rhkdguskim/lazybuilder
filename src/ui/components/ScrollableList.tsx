import React, { useMemo, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useMouseScroll } from '../hooks/useMouseScroll.js';

interface ScrollableListProps {
  items: React.ReactNode[];
  selectedIdx: number;
  maxVisible?: number;
  showScrollbar?: boolean;
  /** Called when mouse scroll should change selectedIdx */
  onSelect?: (idx: number) => void;
  /** Enable mouse scroll (default true) */
  mouseScroll?: boolean;
}

export const ScrollableList: React.FC<ScrollableListProps> = ({
  items,
  selectedIdx,
  maxVisible = 15,
  showScrollbar = true,
  onSelect,
  mouseScroll = true,
}) => {
  const { windowStart, windowEnd } = useMemo(() => {
    const total = items.length;
    if (total <= maxVisible) {
      return { windowStart: 0, windowEnd: total };
    }
    let start = selectedIdx - Math.floor(maxVisible / 2);
    start = Math.max(0, Math.min(start, total - maxVisible));
    return { windowStart: start, windowEnd: start + maxVisible };
  }, [items.length, selectedIdx, maxVisible]);

  const handleScroll = useCallback((direction: 1 | -1) => {
    if (!onSelect) return;
    const next = selectedIdx + direction;
    if (next >= 0 && next < items.length) {
      onSelect(next);
    }
  }, [onSelect, selectedIdx, items.length]);

  useMouseScroll(handleScroll, mouseScroll && !!onSelect && !!process.stdin.isTTY);

  const visible = items.slice(windowStart, windowEnd);
  const canScrollUp = windowStart > 0;
  const canScrollDown = windowEnd < items.length;

  return (
    <Box flexDirection="column">
      {showScrollbar && canScrollUp && (
        <Text color="gray">{`  ▲ ${windowStart} more`}</Text>
      )}
      {visible}
      {showScrollbar && canScrollDown && (
        <Text color="gray">{`  ▼ ${items.length - windowEnd} more`}</Text>
      )}
    </Box>
  );
};
