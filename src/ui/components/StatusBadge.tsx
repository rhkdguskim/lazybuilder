import React from 'react';
import { Text } from 'ink';
import type { Severity } from '../../domain/enums.js';
import { severityColors, symbols } from '../themes/colors.js';

interface StatusBadgeProps {
  severity: Severity;
  label: string;
  detail?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ severity, label, detail }) => {
  const color = severityColors[severity] ?? 'gray';
  const symbol = symbols[severity] ?? '?';

  return (
    <Text wrap="truncate">
      <Text color={color}>{symbol}</Text>
      <Text> {label}</Text>
      {detail && <Text color="gray"> ({detail})</Text>}
    </Text>
  );
};
