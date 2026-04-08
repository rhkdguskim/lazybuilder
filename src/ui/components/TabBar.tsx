import React from 'react';
import { Box, Text } from 'ink';

export interface TabDef {
  id: string;
  label: string;
  shortcut: string;
}

interface TabBarProps {
  tabs: TabDef[];
  activeTab: string;
}

export const TabBar: React.FC<TabBarProps> = ({ tabs, activeTab }) => {
  return (
    <Box flexDirection="row" borderStyle="single" borderBottom borderLeft={false} borderRight={false} borderTop={false} paddingX={1}>
      {tabs.map((tab, i) => {
        const isActive = tab.id === activeTab;
        return (
          <Box key={tab.id} marginRight={1}>
            <Text bold={isActive} color={isActive ? 'cyan' : 'gray'} inverse={isActive}>
              {' '}{tab.shortcut}{' '}
            </Text>
            <Text bold={isActive} color={isActive ? 'white' : 'gray'}>
              {' '}{tab.label}{' '}
            </Text>
          </Box>
        );
      })}
    </Box>
  );
};
