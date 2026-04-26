import React from 'react';
import { Box, Text } from 'ink';

interface KeyValueTableProps {
  rows: Array<{ key: string; value: string; color?: string }>;
  keyWidth?: number;
}

export const KeyValueTable: React.FC<KeyValueTableProps> = ({ rows, keyWidth = 20 }) => {
  return (
    <Box flexDirection="column" overflow="hidden">
      {rows.map((row, i) => (
        <Box key={i} flexDirection="row" overflow="hidden">
          <Box width={keyWidth} flexShrink={0}>
            <Text color="gray" wrap="truncate">{row.key}</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text color={row.color as any} wrap="truncate">{row.value}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  );
};
