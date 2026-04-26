import React from 'react';
import { Box, Text, useStdout } from 'ink';

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
        <Text bold color="cyan" wrap="truncate">{title}</Text>
        {rightHint && !compact ? <Text color="gray" wrap="truncate">{rightHint}</Text> : null}
      </Box>
      {subtitle ? <Text color="gray" wrap="truncate">{subtitle}</Text> : null}
      {rightHint && compact ? <Text color="gray" wrap="truncate">{rightHint}</Text> : null}
    </Box>
  );
};
