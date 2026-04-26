import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { theme } from '../themes/theme.js';

export interface TabDef {
  id: string;
  label: string;
  shortcut: string;
}

interface TabBarProps {
  tabs: TabDef[];
  activeTab: string;
}

const SHORT_LABELS: Record<string, string> = {
  overview: 'Ovr',
  environment: 'Env',
  projects: 'Proj',
  build: 'Build',
  diagnostics: 'Diag',
  logs: 'Log',
  history: 'Hist',
  settings: 'Set',
};

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab }) => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const mode = columns < 56 ? 'numeric' : columns < 112 ? 'compact' : 'full';

  return (
    <Box
      flexDirection="row"
      flexWrap="nowrap"
      borderStyle="single"
      borderBottom
      borderLeft={false}
      borderRight={false}
      borderTop={false}
      borderColor={theme.color.border.subtle as any}
      paddingX={1}
      flexShrink={0}
      overflow="hidden"
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTab;
        const label = mode === 'full' || (mode === 'compact' && isActive)
          ? tab.label
          : SHORT_LABELS[tab.id] ?? tab.label;
        const content = mode === 'numeric'
          ? ` ${tab.shortcut} `
          : ` ${tab.shortcut} ${label} `;

        return (
          <Box key={tab.id} marginRight={1}>
            <Text
              bold={isActive}
              color={(isActive ? theme.color.accent.primary : theme.color.text.muted) as any}
              inverse={isActive}
              wrap="truncate"
            >
              {content}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
