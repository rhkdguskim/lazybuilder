import React from 'react';
import { Box, Text } from 'ink';
import { DiagnosticPreview } from './DiagnosticPreview.js';
import { formatDuration } from '../../utils/duration.js';
import { theme } from '../../themes/theme.js';
import type { BuildResult } from '../../../domain/models/BuildResult.js';
import type { BuildStatus } from '../../../domain/enums.js';

interface Props {
  commandPreview: string;
  result: BuildResult | null;
  status: BuildStatus;
}

export const BuildPreviewPanel: React.FC<Props> = ({ commandPreview, result, status }) => {
  const resultColor =
    result?.status === 'success' ? theme.color.status.ok
    : result?.status === 'failure' ? theme.color.status.danger
    : status === 'running' ? theme.color.status.warning
    : theme.color.text.muted;
  const resultLabel = result ? result.status : status === 'running' ? 'building' : 'ready';
  const muted = theme.color.text.muted;

  return (
    <Box flexDirection="column" flexShrink={0} marginBottom={1} overflow="hidden">
      <Text color={muted as any} wrap="truncate">
        Cmd: {commandPreview || 'Select a target to preview the command.'}
      </Text>
      <Text wrap="truncate">
        <Text color={muted as any}>Result: </Text>
        <Text color={resultColor as any}>{resultLabel}</Text>
        <Text color={muted as any}> · </Text>
        <Text color={muted as any}>{result ? formatDuration(result.durationMs) : '—'}</Text>
        <Text color={muted as any}> · </Text>
        <Text color={(result && result.errorCount > 0 ? theme.color.status.danger : muted) as any}>
          {result?.errorCount ?? 0}E
        </Text>
        <Text color={muted as any}> </Text>
        <Text color={(result && result.warningCount > 0 ? theme.color.status.warning : muted) as any}>
          {result?.warningCount ?? 0}W
        </Text>
      </Text>
      {result && <DiagnosticPreview result={result} />}
    </Box>
  );
};
