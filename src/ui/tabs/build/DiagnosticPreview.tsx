import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../themes/theme.js';
import type { BuildDiagnostic, BuildResult } from '../../../domain/models/BuildResult.js';

export const DiagnosticPreview: React.FC<{ result: BuildResult }> = ({ result }) => {
  const diagnostics: Array<BuildDiagnostic & { severity: 'error' | 'warning' }> = [
    ...result.errors.slice(0, 2).map((item) => ({ ...item, severity: 'error' as const })),
    ...result.warnings
      .slice(0, Math.max(0, 3 - Math.min(2, result.errors.length)))
      .map((item) => ({ ...item, severity: 'warning' as const })),
  ];

  if (diagnostics.length === 0) {
    return (
      <Text color={theme.color.text.muted as any} wrap="truncate">
        Diagnostics: none
      </Text>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1} overflow="hidden">
      {diagnostics.map((item, index) => (
        <Text
          key={`${item.file ?? 'diagnostic'}-${item.line ?? 0}-${item.code}-${index}`}
          color={(item.severity === 'error' ? theme.color.status.danger : theme.color.status.warning) as any}
          wrap="truncate"
        >
          {item.code}: {item.message}
        </Text>
      ))}
    </Box>
  );
};
