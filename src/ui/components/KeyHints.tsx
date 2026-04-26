import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';

export interface KeyHint {
  key: string;
  label: string;
  /** When true, render with accent color to indicate primary action. */
  primary?: boolean;
}

interface KeyHintsProps {
  hints: KeyHint[];
  /** Optional left-aligned context label, e.g., "Build › Settings". */
  context?: string;
  /** When true, indents and pads as a tab footer. */
  asFooter?: boolean;
}

/**
 * Contextual key hints, lazygit/k9s style.
 *
 * Rendered as: `Build › Settings    [Tab] Section  [Enter] Build  [/] Search`
 * Each hint shows the key in cyan and the label dimmed. The active context
 * (e.g., focused panel) is shown left-aligned to ground the user.
 */
export const KeyHints: React.FC<KeyHintsProps> = ({ hints, context, asFooter = false }) => (
  <Box
    flexDirection="row"
    paddingX={asFooter ? 1 : 0}
    flexShrink={0}
    overflow="hidden"
  >
    {context ? (
      <Box marginRight={2} flexShrink={0}>
        <Text color={theme.color.text.muted as any} dimColor wrap="truncate">
          {context}
        </Text>
      </Box>
    ) : null}
    <Box flexDirection="row" flexGrow={1} overflow="hidden">
      {hints.map((hint, i) => (
        <Box key={`${hint.key}-${i}`} marginRight={2} flexShrink={0}>
          <Text wrap="truncate">
            <Text
              color={(hint.primary ? theme.color.accent.primary : theme.color.accent.key) as any}
              bold
            >
              {hint.key}
            </Text>
            <Text color={theme.color.text.muted as any}> {hint.label}</Text>
          </Text>
        </Box>
      ))}
    </Box>
  </Box>
);
