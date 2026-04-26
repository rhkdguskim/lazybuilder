import React from 'react';
import { Box, Text } from 'ink';
import { theme, statusColor } from '../themes/theme.js';

type PanelStatus = 'ok' | 'warning' | 'danger' | 'info' | 'neutral';

interface PanelProps {
  title: string;
  /** Left subtitle line under the title. */
  subtitle?: string;
  /** Right-aligned hint inside the title row (e.g., counts, scroll position). */
  rightHint?: string;
  /** When true, renders strong focus chrome (cyan border + bold title + edge marker). */
  focused?: boolean;
  /** Semantic status overrides border color (still dim if not focused). */
  status?: PanelStatus;
  /** Manual borderColor override; status/focused win unless this is set explicitly. */
  borderColor?: string;
  children: React.ReactNode;
  height?: number | string;
  minHeight?: number | string;
  width?: number | string;
  flexGrow?: number;
  flexShrink?: number;
  marginTop?: number;
  marginBottom?: number;
}

/**
 * Lazygit-style panel chrome.
 *
 * Focus is the single most-important visual:
 *  - focused: cyan border, bold title, ▎ left edge marker, full-color subtitle
 *  - unfocused: gray border, dim title, no edge marker, dimmed subtitle
 *
 * Status overrides border color (e.g., a danger-status unfocused panel still
 * shows red, so users see "this pane has a problem" without focusing it).
 */
export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  rightHint,
  focused = false,
  status,
  borderColor,
  children,
  height,
  minHeight = 3,
  width,
  flexGrow,
  flexShrink = 1,
  marginTop,
  marginBottom,
}) => {
  const resolvedBorder = borderColor
    ?? (status ? statusColor(status) : focused ? theme.color.border.focused : theme.color.border.default);
  const titleColor = focused ? theme.color.focus.title : theme.color.focus.titleDim;
  const focusEdge = focused ? `${theme.glyphs.focus} ` : '  ';

  return (
    <Box
      flexDirection="column"
      borderStyle={theme.border.style}
      borderColor={resolvedBorder as any}
      paddingX={theme.spacing.paneX}
      paddingY={theme.spacing.paneY}
      height={height}
      minHeight={minHeight}
      width={width}
      flexGrow={flexGrow}
      flexShrink={flexShrink}
      marginTop={marginTop}
      marginBottom={marginBottom}
      overflowY="hidden"
    >
      <Box flexDirection="row" justifyContent="space-between" overflow="hidden">
        <Text bold={focused} color={titleColor as any} wrap="truncate">
          {focusEdge}{title}
        </Text>
        {rightHint ? (
          <Text color={theme.color.text.muted as any} wrap="truncate">{rightHint}</Text>
        ) : null}
      </Box>
      {subtitle ? (
        <Text
          color={theme.color.text.muted as any}
          dimColor={!focused}
          wrap="truncate"
        >
          {subtitle}
        </Text>
      ) : null}
      {children}
    </Box>
  );
};
