import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../../themes/theme.js';
import { legacyWindowsConsole } from '../../themes/colors.js';

export interface FieldRowProps {
  label: string;
  value: string;
  active: boolean;
  hint?: string;
  options?: string[];
  selectedIdx?: number;
}

export const FieldRow: React.FC<FieldRowProps> = ({ label, value, active, hint, options, selectedIdx }) => {
  const hasMultiple = options && options.length > 1;
  const idx = selectedIdx ?? 0;
  const total = options?.length ?? 0;
  const muted = theme.color.text.muted;
  const accent = theme.color.accent.primary;

  return (
    <Box flexDirection="row" marginBottom={0}>
      <Box width={12} flexShrink={0}>
        <Text color={(active ? accent : muted) as any} bold={active}>
          {active ? `${theme.glyphs.focus} ` : '  '}
          {label}
        </Text>
      </Box>
      <Box flexGrow={1}>
        {hasMultiple ? (
          <Text wrap="wrap">
            <Text color={(active ? 'white' : muted) as any}>{legacyWindowsConsole ? '< ' : `${theme.glyphs.chevronLeft} `}</Text>
            <Text bold inverse={active} color={active ? 'white' : undefined}>
              {' '}
              {value}{' '}
            </Text>
            <Text color={(active ? 'white' : muted) as any}>{legacyWindowsConsole ? ' > ' : ` ${theme.glyphs.chevronRight} `}</Text>
            <Text color={muted as any}>
              ({idx + 1}/{total})
            </Text>
          </Text>
        ) : (
          <Text bold={active} wrap="wrap">
            {value}
          </Text>
        )}
        {hint && <Text color={muted as any}> {hint}</Text>}
      </Box>
    </Box>
  );
};
