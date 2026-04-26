import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';
import { legacyWindowsConsole } from '../themes/colors.js';

interface ScrollbarProps {
  /** Total number of rows in the underlying list. */
  total: number;
  /** Top index of the visible window. */
  offset: number;
  /** Height in rows of the rendered viewport (i.e. visible item count). */
  height: number;
}

const TRACK_CHAR = legacyWindowsConsole ? '|' : '│';
const THUMB_CHAR = legacyWindowsConsole ? '#' : '█';

/**
 * Lazygit-style 1-column vertical scrollbar.
 *
 * Renders nothing when the list fits in the viewport. Otherwise renders a
 * track of `height` rows with a thumb sized proportionally to visible/total
 * and positioned according to `offset`.
 *
 * Pure presentational — caller owns scroll state.
 */
export const Scrollbar: React.FC<ScrollbarProps> = ({ total, offset, height }) => {
  const safeHeight = Math.max(1, height);
  if (total <= safeHeight) return null;

  const maxOffset = Math.max(1, total - safeHeight);
  const clampedOffset = Math.max(0, Math.min(offset, maxOffset));
  const thumbHeight = Math.max(1, Math.round((safeHeight * safeHeight) / total));
  const thumbStart = Math.round((clampedOffset / maxOffset) * (safeHeight - thumbHeight));

  const lines: string[] = [];
  for (let i = 0; i < safeHeight; i += 1) {
    lines.push(i >= thumbStart && i < thumbStart + thumbHeight ? THUMB_CHAR : TRACK_CHAR);
  }

  return (
    <Box flexDirection="column" flexShrink={0} marginLeft={1}>
      {lines.map((char, i) => (
        <Text
          key={i}
          color={(char === THUMB_CHAR ? theme.color.accent.primary : theme.color.text.muted) as any}
          dimColor={char !== THUMB_CHAR}
        >
          {char}
        </Text>
      ))}
    </Box>
  );
};
