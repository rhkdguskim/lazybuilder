import React from 'react';
import { Box, Text } from 'ink';

interface ShortcutOverlayProps {
  activeTab: string;
}

const TAB_HINTS: Record<string, string[]> = {
  overview: ['1-8: switch tab', '[ / ]: previous/next tab', 'q: quit'],
  environment: ['j/k or arrows: move', 'g/G: top/bottom', 'q: quit'],
  projects: ['j/k or arrows: move', 'Enter: open Build', '1-8: switch tab'],
  build: ['j/k: move focus', 'h/l: change value', 'Space/Enter: toggle or build'],
  diagnostics: ['h/l: filter', 'j/k: move', 'g/G: top/bottom'],
  logs: ['h/l: filter', 'j/k: scroll', 'f: follow, Ctrl+L: clear'],
  history: ['j/k or arrows: move', 'g/G: top/bottom', 'q: quit'],
  settings: ['j/k or arrows: move', 'Enter: execute', 'q: quit'],
};

export const ShortcutOverlay: React.FC<ShortcutOverlayProps> = ({ activeTab }) => {
  const hints = TAB_HINTS[activeTab] ?? TAB_HINTS.overview;

  return (
    <Box flexDirection="column" padding={1} margin={1} borderStyle="round" borderColor="cyan" flexGrow={1} flexShrink={1} overflowY="hidden">
      <Text bold color="cyan">Keyboard Help</Text>
      <Box height={1} />
      <Text>Global</Text>
      <Text color="gray" wrap="truncate">  ? : help toggle</Text>
      <Text color="gray" wrap="truncate">  1-8 : direct tab switch</Text>
      <Text color="gray" wrap="truncate">  [ / ] : prev/next tab</Text>
      <Text color="gray" wrap="truncate">  q : quit</Text>
      <Box height={1} />
      <Text>{activeTab} tab</Text>
      {hints.map(hint => (
        <Text key={hint} color="gray" wrap="truncate">  {hint}</Text>
      ))}
    </Box>
  );
};
