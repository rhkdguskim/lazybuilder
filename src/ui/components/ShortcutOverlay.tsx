import React from 'react';
import { Box, Text } from 'ink';
import { theme } from '../themes/theme.js';

interface ShortcutOverlayProps {
  activeTab: string;
}

interface KeyEntry {
  key: string;
  label: string;
}

const GLOBAL_KEYS: KeyEntry[] = [
  { key: '?', label: 'Toggle this help' },
  { key: '1–8', label: 'Jump to tab' },
  { key: '[ / ]', label: 'Prev / Next tab' },
  { key: 'q', label: 'Quit' },
];

const TAB_KEYS: Record<string, KeyEntry[]> = {
  overview: [],
  environment: [
    { key: 'Tab', label: 'Switch panel focus' },
    { key: 'j/k', label: 'Move / scroll' },
    { key: 'g/G', label: 'Top / Bottom' },
    { key: '⌃F/⌃B', label: 'Page down / up (detail)' },
  ],
  projects: [
    { key: 'j/k', label: 'Move' },
    { key: 'Space', label: 'Toggle solution group' },
    { key: 'h/l', label: 'Collapse / expand' },
    { key: 'E / C', label: 'Expand all / Collapse all' },
    { key: 'Enter', label: 'Open Build (project)' },
  ],
  build: [
    { key: 'Tab', label: 'Cycle focus area' },
    { key: '/', label: 'Search targets' },
    { key: 'f / F', label: 'Cycle filter' },
    { key: 'x', label: 'Clear search & filter' },
    { key: 'j/k h/l', label: 'Move / change value' },
    { key: 'Enter / b', label: 'Run build' },
    { key: 'a', label: 'Quick check' },
    { key: 'Esc / c', label: 'Cancel running build' },
  ],
  diagnostics: [
    { key: 'h / l', label: 'Cycle severity filter' },
    { key: 'j/k', label: 'Move' },
    { key: 'g/G', label: 'Top / Bottom' },
    { key: 'i', label: 'Install toolchain helper' },
  ],
  logs: [
    { key: 'h / l', label: 'Cycle filter' },
    { key: 'j/k', label: 'Scroll' },
    { key: 'g/G', label: 'Top / Bottom' },
    { key: 'f', label: 'Toggle follow' },
    { key: '⌃L', label: 'Clear logs' },
  ],
  history: [
    { key: 'j/k', label: 'Move' },
    { key: 'g/G', label: 'Top / Bottom' },
  ],
  settings: [
    { key: 'j/k', label: 'Move' },
    { key: 'Enter', label: 'Execute action' },
  ],
};

const SectionTitle: React.FC<{ label: string }> = ({ label }) => (
  <Text color={theme.color.accent.primary as any} bold>{label}</Text>
);

const KeyRow: React.FC<{ entry: KeyEntry }> = ({ entry }) => (
  <Box flexDirection="row">
    <Box width={12} flexShrink={0}>
      <Text color={theme.color.accent.key as any} bold>{entry.key}</Text>
    </Box>
    <Box flexGrow={1}>
      <Text color={theme.color.text.muted as any} wrap="truncate">{entry.label}</Text>
    </Box>
  </Box>
);

export const ShortcutOverlay: React.FC<ShortcutOverlayProps> = ({ activeTab }) => {
  const tabKeys = TAB_KEYS[activeTab] ?? [];
  const tabLabel = `${activeTab[0]!.toUpperCase()}${activeTab.slice(1)} tab`;

  return (
    <Box
      flexDirection="column"
      padding={1}
      margin={1}
      borderStyle={theme.border.style}
      borderColor={theme.color.border.focused as any}
      flexGrow={1}
      flexShrink={1}
      overflowY="hidden"
    >
      <Text bold color={theme.color.accent.primary as any}>Keyboard Help</Text>
      <Text color={theme.color.text.muted as any} dimColor>
        Press <Text color={theme.color.accent.key as any} bold>?</Text> to dismiss.
      </Text>
      <Box height={1} />

      <SectionTitle label="Global" />
      {GLOBAL_KEYS.map(entry => <KeyRow key={entry.key} entry={entry} />)}

      <Box height={1} />
      <SectionTitle label={tabLabel} />
      {tabKeys.length > 0
        ? tabKeys.map(entry => <KeyRow key={entry.key} entry={entry} />)
        : <Text color={theme.color.text.muted as any} dimColor>  No tab-specific keys.</Text>}
    </Box>
  );
};
