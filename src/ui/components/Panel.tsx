import React from 'react';
import { Box, Text } from 'ink';

interface PanelProps {
  title: string;
  subtitle?: string;
  focused?: boolean;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ title, subtitle, focused = false, children }) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={focused ? 'cyan' : 'gray'}
    paddingX={1}
    paddingY={0}
    overflowY="hidden"
  >
    <Text bold color={focused ? 'cyan' : 'gray'}>{focused ? '● ' : '  '}{title}</Text>
    {subtitle ? <Text color="gray" dimColor={!focused}>{subtitle}</Text> : null}
    {children}
  </Box>
);
