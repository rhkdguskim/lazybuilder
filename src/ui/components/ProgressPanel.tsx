import React from 'react';
import { Box, Text } from 'ink';

interface ProgressPanelProps {
  label: string;
  status: 'scanning' | 'done' | 'error' | 'idle';
}

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export const ProgressPanel: React.FC<ProgressPanelProps> = ({ label, status }) => {
  const [frame, setFrame] = React.useState(0);

  React.useEffect(() => {
    if (status !== 'scanning') return;
    const timer = setInterval(() => setFrame(f => (f + 1) % spinnerFrames.length), 200);
    return () => clearInterval(timer);
  }, [status]);

  return (
    <Box>
      {status === 'scanning' && <Text color="cyan">{spinnerFrames[frame]} </Text>}
      {status === 'done' && <Text color="green">✔ </Text>}
      {status === 'error' && <Text color="red">✘ </Text>}
      {status === 'idle' && <Text color="gray">○ </Text>}
      <Text>{label}</Text>
    </Box>
  );
};
