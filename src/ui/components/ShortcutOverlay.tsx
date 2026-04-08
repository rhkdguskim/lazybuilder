import React from 'react';
import { Box, Text } from 'ink';

interface ShortcutOverlayProps {
  activeTab: string;
}

const TAB_HINTS: Record<string, string[]> = {
  overview: ['숫자 1-8: 탭 이동', '[ / ]: 이전/다음 탭', 'q: 종료'],
  environment: ['숫자 1-8: 탭 이동', '[ / ]: 이전/다음 탭', 'q: 종료'],
  projects: ['↑↓ 또는 j/k: 항목 이동', 'Enter: Build 탭으로 이동', '숫자 1-8: 탭 이동'],
  build: ['↑↓ 또는 j/k: 필드/타겟 이동', '←→ 또는 h/l: 값 변경', 'Space/Enter: 토글 또는 빌드'],
  diagnostics: ['숫자 1-8: 탭 이동', '[ / ]: 이전/다음 탭', 'q: 종료'],
  logs: ['Tab: 필터 변경', '↑↓ 또는 j/k: 스크롤', 'f: follow 전환, Ctrl+L: clear'],
  history: ['숫자 1-8: 탭 이동', '[ / ]: 이전/다음 탭', 'q: 종료'],
  settings: ['숫자 1-8: 탭 이동', '[ / ]: 이전/다음 탭', 'q: 종료'],
};

export const ShortcutOverlay: React.FC<ShortcutOverlayProps> = ({ activeTab }) => {
  const hints = TAB_HINTS[activeTab] ?? TAB_HINTS.overview;

  return (
    <Box flexDirection="column" padding={1} margin={1} borderStyle="round" borderColor="cyan">
      <Text bold color="cyan">Keyboard Help</Text>
      <Box height={1} />
      <Text>Global</Text>
      <Text color="gray">  ? : help toggle</Text>
      <Text color="gray">  1-8 : direct tab switch</Text>
      <Text color="gray">  [ / ] : prev/next tab</Text>
      <Text color="gray">  q : quit</Text>
      <Box height={1} />
      <Text>{activeTab} tab</Text>
      {hints.map(hint => (
        <Text key={hint} color="gray">  {hint}</Text>
      ))}
    </Box>
  );
};
