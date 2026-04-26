import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';

interface ActionHint {
  key: string;
  label: string;
}

interface EmptyStateProps {
  title: string;
  hint?: string;
  actions?: ActionHint[];
  /** Optional symbol prefix (defaults to neutral bullet). */
  symbol?: string;
}

/**
 * Standardized empty state. Use instead of raw `<Text color="yellow">`.
 * Looks like:
 *
 *   • No projects found
 *     Navigate to a directory containing .sln, .csproj, ...
 *     [r] Rescan   [3] Open Projects
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  hint,
  actions,
  symbol = theme.glyphs.bullet,
}) => (
  <Box flexDirection="column" paddingY={1}>
    <Text color={theme.color.status.neutral as any}>
      <Text>{symbol} </Text>
      <Text bold color={theme.color.text.muted as any}>{title}</Text>
    </Text>
    {hint ? (
      <Text color={theme.color.text.muted as any} dimColor wrap="truncate">  {hint}</Text>
    ) : null}
    {actions && actions.length > 0 ? (
      <Box flexDirection="row" marginTop={1}>
        <Text>  </Text>
        {actions.map((action, i) => (
          <Text key={action.key} wrap="truncate">
            {i > 0 ? <Text color={theme.color.text.muted as any}>   </Text> : null}
            <Text color={theme.color.accent.key as any} bold>[{action.key}]</Text>
            <Text color={theme.color.text.muted as any}> {action.label}</Text>
          </Text>
        ))}
      </Box>
    ) : null}
  </Box>
);
