import React from 'react';
import { Box, Text } from 'ink';

interface HelpBarProps {
  items: Array<{ key: string; label: string }>;
}

export const HelpBar: React.FC<HelpBarProps> = ({ items }) => {
  return (
    <Box flexDirection="row" paddingX={1} flexShrink={0}>
      {items.map((item, i) => (
        <Box key={item.key} marginRight={2}>
          <Text color="cyan" bold>{item.key}</Text>
          <Text color="gray"> {item.label}</Text>
        </Box>
      ))}
    </Box>
  );
};
