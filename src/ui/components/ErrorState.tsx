import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';

interface ActionHint {
  key: string;
  label: string;
}

interface ErrorStateProps {
  title: string;
  detail?: string;
  hint?: string;
  actions?: ActionHint[];
}

/**
 * Standardized error state. Use instead of raw `<Text color="red">`.
 */
export const ErrorState: React.FC<ErrorStateProps> = ({ title, detail, hint, actions }) => (
  <Box flexDirection="column" paddingY={1}>
    <Text color={theme.color.status.danger as any}>
      <Text>{theme.symbols.error} </Text>
      <Text bold>{title}</Text>
    </Text>
    {detail ? (
      <Text color={theme.color.text.muted as any} wrap="truncate">  {detail}</Text>
    ) : null}
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
