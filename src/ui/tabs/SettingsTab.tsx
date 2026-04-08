import React from 'react';
import { Box, Text } from 'ink';

export const SettingsTab: React.FC = () => {
  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
      <Text bold color="cyan">{'─── Settings ───'}</Text>
      <Box height={1} />
      <Text color="gray">Settings will be available in Phase 6.</Text>
      <Text color="gray">Configure workspace path, default build options, and scan depth.</Text>
    </Box>
  );
};
