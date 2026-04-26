import React from 'react';
import { Box, Text } from 'ink';
import { Panel } from '../../components/index.js';
import { ScrollableList } from '../../components/ScrollableList.js';
import { theme } from '../../themes/theme.js';
import { compactPath } from '../../utils/text.js';
import { TARGET_FILTERS, type BuildTarget } from './types.js';
import type { BuildTargetFilter } from '../../store/useAppStore.js';

interface Props {
  totalCount: number;
  filteredTargets: BuildTarget[];
  targetIdx: number;
  onSelectTarget: (idx: number) => void;
  focused: boolean;
  searchActive: boolean;
  targetQuery: string;
  targetFilter: BuildTargetFilter;
  maxVisible: number;
}

export const BuildTargetList: React.FC<Props> = ({
  totalCount,
  filteredTargets,
  targetIdx,
  onSelectTarget,
  focused,
  searchActive,
  targetQuery,
  targetFilter,
  maxVisible,
}) => {
  const activeFilterLabel = TARGET_FILTERS.find((f) => f.value === targetFilter)?.label ?? 'All';
  const subtitle = focused
    ? searchActive
      ? 'Search: type text, Enter/Esc finish, Ctrl+U clear'
      : '/ search · f/F filter · Space toggle · h/l fold · E/C all'
    : `${activeFilterLabel}${targetQuery ? ` | ${targetQuery}` : ''}`;

  return (
    <Panel
      title={`Targets ${filteredTargets.length}/${totalCount}`}
      focused={focused}
      subtitle={subtitle}
      rightHint={focused ? `${activeFilterLabel}${targetQuery ? ` · ${targetQuery}` : ''}` : undefined}
    >
      <Box flexDirection="column" flexShrink={0} marginBottom={1} overflow="hidden">
        <Text wrap="truncate">
          <Text color={theme.color.text.muted as any}>Filter </Text>
          <Text inverse color={theme.color.accent.primary as any}>
            {' '}
            {activeFilterLabel}{' '}
          </Text>
          <Text color={theme.color.text.muted as any}> Search </Text>
          <Text
            color={(searchActive ? theme.color.accent.primary : targetQuery ? 'white' : theme.color.text.muted) as any}
            inverse={searchActive}
            wrap="truncate"
          >
            {searchActive ? ` ${targetQuery || 'type...'} ` : ` ${targetQuery || 'none'} `}
          </Text>
        </Text>
      </Box>

      <ScrollableList
        selectedIdx={targetIdx}
        maxVisible={maxVisible}
        scrollbar
        onSelect={onSelectTarget}
        mouseScroll={false}
        items={
          filteredTargets.length === 0
            ? [
                <Text key="empty" color={theme.color.text.muted as any} dimColor wrap="truncate">
                  {theme.glyphs.bullet} No targets match — press / to search or x to clear.
                </Text>,
              ]
            : filteredTargets.map((target, i) => {
                const isSelected = i === targetIdx;
                const cursor = isSelected ? `${theme.glyphs.focus} ` : '  ';
                const tagColor = target.kind === 'solution' ? theme.color.accent.primary : theme.color.status.ok;
                const isChild = target.depth === 1;

                if (target.kind === 'solution') {
                  const marker = target.expandable
                    ? target.expanded
                      ? theme.glyphs.treeExpanded
                      : theme.glyphs.treeCollapsed
                    : ' ';
                  return (
                    <Text key={target.path} inverse={isSelected} wrap="truncate">
                      {cursor}
                      <Text color={theme.color.accent.primary as any}>{marker}</Text>
                      {' '}
                      <Text color={tagColor as any}>[SLN]</Text>{' '}
                      {target.label}
                      <Text color={theme.color.text.muted as any}> {compactPath(target.path, 24)}</Text>
                    </Text>
                  );
                }

                const indent = isChild
                  ? <Text color={theme.color.text.muted as any}>{`   ${theme.glyphs.treeBranch} `}</Text>
                  : null;

                return (
                  <Text key={target.path} inverse={isSelected} wrap="truncate">
                    {cursor}
                    {indent}
                    <Text color={tagColor as any}>[PRJ]</Text>{' '}
                    {target.label}
                    <Text color={theme.color.text.muted as any}> {compactPath(target.path, isChild ? 22 : 28)}</Text>
                  </Text>
                );
              })
        }
      />
    </Panel>
  );
};
