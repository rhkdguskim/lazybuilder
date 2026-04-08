import React from 'react';
import { Box, Text } from 'ink';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  rightHint?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, rightHint }) => (
  <Box flexDirection="column" flexShrink={0} marginBottom={1}>
    <Box justifyContent="space-between">
      <Text bold color="cyan">{title}</Text>
      {rightHint ? <Text color="gray">{rightHint}</Text> : <Text />}
    </Box>
    {subtitle ? <Text color="gray">{subtitle}</Text> : null}
  </Box>
);
