import React from 'react';
import { Box, Text } from 'ink';

interface PanelProps {
  title: string;
  subtitle?: string;
  focused?: boolean;
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

export const Panel: React.FC<PanelProps> = ({
  title,
  subtitle,
  focused = false,
  borderColor,
  children,
  height,
  minHeight = 3,
  width,
  flexGrow,
  flexShrink = 1,
  marginTop,
  marginBottom,
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={(borderColor ?? (focused ? 'cyan' : 'gray')) as any}
    paddingX={1}
    paddingY={0}
    height={height}
    minHeight={minHeight}
    width={width}
    flexGrow={flexGrow}
    flexShrink={flexShrink}
    marginTop={marginTop}
    marginBottom={marginBottom}
    overflowY="hidden"
  >
    <Text bold color={focused ? 'cyan' : 'gray'} wrap="truncate">{focused ? '● ' : '  '}{title}</Text>
    {subtitle ? <Text color="gray" dimColor={!focused} wrap="truncate">{subtitle}</Text> : null}
    {children}
  </Box>
);
