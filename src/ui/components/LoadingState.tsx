import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';
import { legacyWindowsConsole } from '../themes/colors.js';

interface LoadingStateProps {
  label: string;
  hint?: string;
  variant?: 'inline' | 'block';
}

const SPINNER_FRAMES = legacyWindowsConsole
  ? ['|', '/', '-', '\\']
  : ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * Standardized loading indicator with a Braille spinner.
 * Use instead of bespoke `<Text>scanning...</Text>` blocks.
 */
export const LoadingState: React.FC<LoadingStateProps> = ({ label, hint, variant = 'block' }) => {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setFrame(f => (f + 1) % SPINNER_FRAMES.length), 120);
    return () => clearInterval(t);
  }, []);

  if (variant === 'inline') {
    return (
      <Text>
        <Text color={theme.color.accent.primary as any}>{SPINNER_FRAMES[frame]} </Text>
        <Text>{label}</Text>
        {hint ? <Text color={theme.color.text.muted as any}> {hint}</Text> : null}
      </Text>
    );
  }

  return (
    <Box flexDirection="column" paddingY={1}>
      <Text>
        <Text color={theme.color.accent.primary as any}>{SPINNER_FRAMES[frame]} </Text>
        <Text bold>{label}</Text>
      </Text>
      {hint ? (
        <Text color={theme.color.text.muted as any} dimColor wrap="truncate">  {hint}</Text>
      ) : null}
    </Box>
  );
};
