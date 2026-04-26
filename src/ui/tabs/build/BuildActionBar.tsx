import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../themes/theme.js';
import type { BuildResult } from '../../../domain/models/BuildResult.js';
import type { BuildStatus } from '../../../domain/enums.js';
import { formatDuration } from '../../utils/duration.js';

interface Props {
  status: BuildStatus;
  result: BuildResult | null;
  canBuild: boolean;
  actionFocused: boolean;
  elapsedMs: number;
}

export const BuildActionBar: React.FC<Props> = ({ status, result, canBuild, actionFocused, elapsedMs }) => {
  const statusLine =
    status === 'running'
      ? `Building… ${formatDuration(elapsedMs)}`
      : result && status !== 'idle'
        ? `${result.status === 'success' ? 'OK' : 'FAIL'} ${formatDuration(result.durationMs)} · ${result.errorCount}E ${result.warningCount}W`
        : '';

  const actionColor =
    status === 'running' ? theme.color.status.danger
    : canBuild ? theme.color.status.ok
    : theme.color.text.muted;

  const statusColorCode =
    status === 'running' ? theme.color.status.warning
    : result?.status === 'success' ? theme.color.status.ok
    : theme.color.status.danger;

  return (
    <Box flexDirection="row" flexShrink={0}>
      <Box marginRight={1}>
        <Text inverse={actionFocused} color={actionColor as any} bold>
          {status === 'running'
            ? ` ${theme.glyphs.stop} Cancel (Esc) `
            : canBuild
              ? ` ${theme.glyphs.play} Build Enter · Check a `
              : ' No target '}
        </Text>
      </Box>
      {statusLine ? (
        <Text color={statusColorCode as any}>{statusLine}</Text>
      ) : (
        <Text color={theme.color.text.muted as any}>Ready</Text>
      )}
    </Box>
  );
};
