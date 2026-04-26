import React from 'react';
import { Box } from 'ink';

interface TabFrameProps {
  children: React.ReactNode;
  /** Override default padding (default: paddingX=1, paddingTop=1, paddingBottom=0). */
  padding?: { x?: number; y?: number; top?: number; bottom?: number };
}

/**
 * Standard outer wrapper for all tab content. Owns the column layout, flex,
 * padding, and overflow behavior so tabs don't drift.
 *
 * Default padding: x=1, y=1 — matches the historical `padding={1}`. Override
 * via `padding` prop for tabs that want a tighter or looser layout.
 *
 * Use this as the top-level element of every tab.
 */
export const TabFrame: React.FC<TabFrameProps> = ({ children, padding }) => {
  const px = padding?.x ?? 1;
  const top = padding?.top ?? padding?.y ?? 1;
  const bottom = padding?.bottom ?? padding?.y ?? 1;
  return (
    <Box
      flexDirection="column"
      flexGrow={1}
      paddingX={px}
      paddingTop={top}
      paddingBottom={bottom}
      overflowY="hidden"
    >
      {children}
    </Box>
  );
};
