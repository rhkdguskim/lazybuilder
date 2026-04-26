import React, { useMemo, useCallback, useRef } from 'react';
import { Box, Text } from 'ink';
import { useMouseScroll } from '../hooks/useMouseScroll.js';
import { theme } from '../themes/theme.js';
import { Scrollbar } from './Scrollbar.js';

interface ScrollableListProps {
  items: React.ReactNode[];
  selectedIdx: number;
  maxVisible?: number;
  /** Show ▲/▼ "more" hints above/below the visible window. */
  showOverflowHints?: boolean;
  /** Render a 1-column lazygit-style scrollbar on the right. */
  scrollbar?: boolean;
  /** @deprecated alias of showOverflowHints — kept for back-compat. */
  showScrollbar?: boolean;
  onSelect?: (idx: number) => void;
  mouseScroll?: boolean;
}

/**
 * Selection-aware scrolling list. The window stays centered on `selectedIdx`.
 *
 * Two visual modes:
 * - default: textual ▲/▼ hints above/below
 * - `scrollbar`: lazygit-style 1-column track on the right
 *
 * Both can be enabled together if desired.
 */
export const ScrollableList: React.FC<ScrollableListProps> = ({
  items,
  selectedIdx,
  maxVisible = 15,
  showOverflowHints,
  scrollbar = false,
  showScrollbar,
  onSelect,
  mouseScroll = true,
}) => {
  const total = items.length;
  // back-compat: when neither prop is given, default to overflow hints (legacy behavior).
  const hintsEnabled = showOverflowHints ?? showScrollbar ?? !scrollbar;

  const { windowStart, windowEnd } = useMemo(() => {
    if (total <= maxVisible) {
      return { windowStart: 0, windowEnd: total };
    }
    let start = selectedIdx - Math.floor(maxVisible / 2);
    start = Math.max(0, Math.min(start, total - maxVisible));
    return { windowStart: start, windowEnd: start + maxVisible };
  }, [total, selectedIdx, maxVisible]);

  // Use refs to avoid recreating the callback on every render
  const selectedRef = useRef(selectedIdx);
  selectedRef.current = selectedIdx;
  const itemsLenRef = useRef(total);
  itemsLenRef.current = total;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  const handleScroll = useCallback((direction: 1 | -1) => {
    if (!onSelectRef.current) return;
    const next = selectedRef.current + direction;
    if (next >= 0 && next < itemsLenRef.current) {
      onSelectRef.current(next);
    }
  }, []);

  useMouseScroll(handleScroll, mouseScroll && !!onSelect && !!process.stdin.isTTY);

  const visible = items.slice(windowStart, windowEnd);
  const canScrollUp = windowStart > 0;
  const canScrollDown = windowEnd < total;
  const overflow = total > maxVisible;

  return (
    <Box flexDirection="column">
      {hintsEnabled && canScrollUp && (
        <Text color={theme.color.text.muted as any} dimColor>{`  ▲ ${windowStart} more`}</Text>
      )}
      <Box flexDirection="row" overflow="hidden">
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {visible}
        </Box>
        {scrollbar && overflow ? (
          <Scrollbar total={total} offset={windowStart} height={Math.min(maxVisible, total)} />
        ) : null}
      </Box>
      {hintsEnabled && canScrollDown && (
        <Text color={theme.color.text.muted as any} dimColor>{`  ▼ ${total - windowEnd} more`}</Text>
      )}
    </Box>
  );
};
