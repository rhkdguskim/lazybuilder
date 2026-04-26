import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { theme } from '../themes/theme.js';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightHint?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, rightHint }) => {
  const { stdout } = useStdout();
  const compact = (stdout?.columns ?? 80) < 100;

  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1} overflow="hidden">
      <Box flexDirection="row" justifyContent="space-between" overflow="hidden">
        <Text bold color={theme.color.accent.primary as any} wrap="truncate">{title}</Text>
        {rightHint && !compact ? (
          <Text color={theme.color.text.muted as any} wrap="truncate">{rightHint}</Text>
        ) : null}
      </Box>
      {subtitle ? (
        <Text color={theme.color.text.muted as any} dimColor wrap="truncate">{subtitle}</Text>
      ) : null}
      {rightHint && compact ? (
        <Text color={theme.color.text.muted as any} wrap="truncate">{rightHint}</Text>
      ) : null}
    </Box>
  );
};
