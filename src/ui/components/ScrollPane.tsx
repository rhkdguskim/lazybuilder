import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';
import { Scrollbar } from './Scrollbar.js';

interface ScrollPaneProps {
  items: React.ReactNode[];
  scrollOffset: number;
  visibleHeight: number;
  showScrollbar?: boolean;
  /** When true, shows a "more above/below" hint above and below the window. */
  showOverflowHints?: boolean;
}

/**
 * Vertical scroll viewport with a lazygit-style scrollbar column.
 *
 * - Shows `items[scrollOffset .. scrollOffset+visibleHeight]`.
 * - When `items.length > visibleHeight`, renders a 1-column track on the
 *   right (via Scrollbar) plus optional textual ▲/▼ overflow hints.
 * - Caller owns scrollOffset state and key handling.
 */
export const ScrollPane: React.FC<ScrollPaneProps> = ({
  items,
  scrollOffset,
  visibleHeight,
  showScrollbar = true,
  showOverflowHints = true,
}) => {
  const total = items.length;
  const overflow = total > visibleHeight;
  const safeHeight = Math.max(1, visibleHeight);
  const maxOffset = Math.max(0, total - safeHeight);
  const offset = Math.max(0, Math.min(scrollOffset, maxOffset));
  const visible = items.slice(offset, offset + safeHeight);

  const aboveCount = offset;
  const belowCount = Math.max(0, total - offset - safeHeight);

  return (
    <Box flexDirection="column" overflow="hidden">
      {showOverflowHints && overflow && aboveCount > 0 ? (
        <Text color={theme.color.text.muted as any} dimColor>
          {'  '}▲ {aboveCount} more
        </Text>
      ) : null}
      <Box flexDirection="row" overflow="hidden">
        <Box flexDirection="column" flexGrow={1} overflow="hidden">
          {visible.map((node, i) => (
            <React.Fragment key={i}>{node}</React.Fragment>
          ))}
        </Box>
        {showScrollbar && overflow ? (
          <Scrollbar total={total} offset={offset} height={safeHeight} />
        ) : null}
      </Box>
      {showOverflowHints && overflow && belowCount > 0 ? (
        <Text color={theme.color.text.muted as any} dimColor>
          {'  '}▼ {belowCount} more
        </Text>
      ) : null}
    </Box>
  );
};
