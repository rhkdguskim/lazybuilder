import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { theme } from '../themes/theme.js';
import type { InstallPlan, InstallStep, InstallScope } from '../../domain/models/InstallPlan.js';
import type { InstallProgress, InstallStepStatus } from '../../domain/models/InstallProgress.js';

type Phase = 'propose' | 'running' | 'done';

interface ToolchainModalProps {
  plan: InstallPlan;
  progress: InstallProgress | null;
  phase: Phase;
  onConfirm: (plan: InstallPlan) => void;
  onCancel: () => void;
  onClose: () => void;
}

const SYMBOL: Record<InstallStepStatus, string> = {
  pending: '○',
  running: '▶',
  done: '✔',
  failed: '✘',
  cancelled: '⊘',
  skipped: '–',
};

const STATUS_COLOR: Record<InstallStepStatus, string> = {
  pending: 'gray',
  running: 'cyan',
  done: 'green',
  failed: 'red',
  cancelled: 'yellow',
  skipped: 'gray',
};

export const ToolchainModal: React.FC<ToolchainModalProps> = ({
  plan,
  progress,
  phase,
  onConfirm,
  onCancel,
  onClose,
}) => {
  const [steps, setSteps] = useState<InstallStep[]>(plan.steps);
  const [scope, setScope] = useState<InstallScope>(
    plan.steps[0]?.scope ?? 'user',
  );
  const [updateGlobalJson, setUpdateGlobalJson] = useState<boolean>(plan.updateGlobalJson);
  const [cursor, setCursor] = useState(0);

  useEffect(() => {
    setSteps(plan.steps);
    setScope(plan.steps[0]?.scope ?? 'user');
    setUpdateGlobalJson(plan.updateGlobalJson);
  }, [plan]);

  useInput((input, key) => {
    if (phase === 'propose') {
      if (key.upArrow || input === 'k') {
        setCursor(c => Math.max(0, c - 1));
        return;
      }
      if (key.downArrow || input === 'j') {
        setCursor(c => Math.min(steps.length - 1, c + 1));
        return;
      }
      if (input === ' ') {
        setSteps(prev =>
          prev.map((s, i) => (i === cursor ? { ...s, selected: !s.selected } : s)),
        );
        return;
      }
      if (input === 's') {
        const next: InstallScope = scope === 'user' ? 'machine' : 'user';
        setScope(next);
        setSteps(prev =>
          prev.map(s => ({ ...s, scope: next, needsAdmin: next === 'machine' })),
        );
        return;
      }
      if (input === 'g') {
        setUpdateGlobalJson(v => !v);
        return;
      }
      if (key.return) {
        onConfirm({
          ...plan,
          steps,
          updateGlobalJson,
          needsAdmin: steps.some(s => s.selected && s.needsAdmin),
        });
        return;
      }
      if (key.escape) {
        onCancel();
        return;
      }
    } else if (phase === 'running') {
      if (key.escape) {
        onCancel();
        return;
      }
    } else if (phase === 'done') {
      if (key.return || key.escape) {
        onClose();
        return;
      }
    }
  }, { isActive: !!process.stdin.isTTY });

  const totalMb = (steps
    .filter(s => s.selected)
    .reduce((acc, s) => acc + (s.sizeBytes ?? 0), 0) /
    (1024 * 1024)).toFixed(0);
  const totalSecs = steps
    .filter(s => s.selected)
    .reduce((acc, s) => acc + (s.estimatedSeconds ?? 0), 0);
  const needsAdmin = steps.some(s => s.selected && s.needsAdmin);
  const summary = `${steps.filter(s => s.selected).length} items · ${totalMb} MB · ~${totalSecs}s · ${needsAdmin ? 'requires admin' : 'no admin'}`;

  return (
    <Box
      flexDirection="column"
      padding={1}
      borderStyle={theme.border.style}
      borderColor={theme.color.border.focused as any}
      flexGrow={1}
      overflowY="hidden"
    >
      <Text bold color={theme.color.accent.primary as any}>
        .NET Toolchain Setup
      </Text>
      <Text color={theme.color.text.muted as any}>{summary}</Text>
      <Box height={1} />

      {phase === 'propose' && (
        <Box flexDirection="column">
          {steps.length === 0 ? (
            <Text color={theme.color.status.ok as any}>
              All required toolchain components are already installed.
            </Text>
          ) : (
            steps.map((step, i) => {
              const isSelected = i === cursor;
              const check = step.selected ? '✓' : ' ';
              const sizeMb = step.sizeBytes
                ? `${(step.sizeBytes / (1024 * 1024)).toFixed(0)} MB`
                : '';
              const reasonStr = step.reason.detail
                + (step.reason.affectedProjects.length > 0
                  ? ` (${step.reason.affectedProjects.slice(0, 3).join(', ')})`
                  : '');
              return (
                <Box key={step.id} flexDirection="column" marginBottom={0}>
                  <Text inverse={isSelected} wrap="truncate">
                    <Text color={step.selected ? 'green' : 'gray'}>[{check}] </Text>
                    <Text bold>{step.displayName}</Text>
                    <Text color={theme.color.text.muted as any}>  {sizeMb}  {step.scope}{step.needsAdmin ? ' · admin' : ''}</Text>
                  </Text>
                  {isSelected && (
                    <Box flexDirection="column" paddingLeft={4}>
                      <Text color={theme.color.text.muted as any} wrap="truncate">
                        reason: {reasonStr}
                      </Text>
                      <Text color={theme.color.text.muted as any} wrap="truncate">
                        source: {step.source.url} · {step.source.signer}
                      </Text>
                    </Box>
                  )}
                </Box>
              );
            })
          )}
          <Box height={1} />
          <Text color={theme.color.text.muted as any}>
            update global.json after install: [{updateGlobalJson ? '✓' : ' '}]
          </Text>
          <Box height={1} />
          <Text color={theme.color.accent.primary as any}>
            [Enter] Install   [Space] Toggle   [s] Scope   [g] global.json   [Esc] Cancel
          </Text>
        </Box>
      )}

      {phase === 'running' && progress && (
        <Box flexDirection="column">
          <Text color={theme.color.text.muted as any}>
            Status: {progress.overallStatus}
          </Text>
          {progress.steps.map(sp => {
            const step = steps.find(s => s.id === sp.stepId);
            if (!step) return null;
            const sym = SYMBOL[sp.status] ?? '?';
            const color = STATUS_COLOR[sp.status] ?? 'gray';
            const tail = sp.logTail.slice(-1)[0] ?? '';
            return (
              <Box key={sp.stepId} flexDirection="column">
                <Text wrap="truncate">
                  <Text color={color}>{sym} </Text>
                  <Text bold>{step.displayName}</Text>
                  <Text color={theme.color.text.muted as any}>  {sp.status}</Text>
                </Text>
                {sp.status === 'running' && tail && (
                  <Text color={theme.color.text.muted as any} wrap="truncate">    {tail}</Text>
                )}
              </Box>
            );
          })}
          <Box height={1} />
          <Text color={theme.color.accent.primary as any}>[Esc] Cancel</Text>
        </Box>
      )}

      {phase === 'done' && progress && (
        <Box flexDirection="column">
          <Text color={
            progress.overallStatus === 'done'
              ? (theme.color.status.ok as any)
              : (theme.color.status.danger as any)
          }>
            Result: {progress.overallStatus}
          </Text>
          <Box height={1} />
          {progress.steps.map(sp => {
            const step = steps.find(s => s.id === sp.stepId);
            if (!step) return null;
            const sym = SYMBOL[sp.status] ?? '?';
            const color = STATUS_COLOR[sp.status] ?? 'gray';
            return (
              <Text key={sp.stepId} wrap="truncate">
                <Text color={color}>{sym} </Text>
                <Text>{step.displayName}</Text>
                <Text color={theme.color.text.muted as any}>  {sp.status}</Text>
              </Text>
            );
          })}
          <Box height={1} />
          <Text color={theme.color.accent.primary as any}>[Enter / Esc] Close</Text>
        </Box>
      )}
    </Box>
  );
};
