import React, { useEffect, useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { theme } from '../themes/theme.js';
import { basename } from 'node:path';

const statusText = (status: string, compact: boolean): string => {
  if (!compact) return status;
  if (status === 'done') return 'ok';
  if (status === 'scanning') return 'scan';
  if (status === 'error') return 'err';
  return status;
};

const scanColor = (status: string) =>
  status === 'done' ? theme.color.status.ok
  : status === 'error' ? theme.color.status.danger
  : theme.color.status.warning;

const buildColor = (status: string | undefined) =>
  status === 'success' ? theme.color.status.ok
  : status === 'failure' ? theme.color.status.danger
  : status === 'cancelled' ? theme.color.status.warning
  : theme.color.text.muted;

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
}

export const GlobalStatusBar: React.FC = () => {
  const { stdout } = useStdout();
  const compact = (stdout?.columns ?? 80) < 100;
  const envScanStatus = useAppStore(s => s.envScanStatus);
  const projectScanStatus = useAppStore(s => s.projectScanStatus);
  const projects = useAppStore(s => s.projects);
  const diagnostics = useAppStore(s => s.diagnostics);
  const buildResult = useAppStore(s => s.buildResult);
  const buildStatus = useAppStore(s => s.buildStatus);
  const buildStartTime = useAppStore(s => s.buildStartTime);
  const lastTarget = useAppStore(s => s.lastBuildProfileSnapshot);
  const logCount = useAppStore(s => s.logEntries.length);

  const errors = diagnostics.filter(item => item.severity === 'error').length;
  const warnings = diagnostics.filter(item => item.severity === 'warning').length;
  const muted = theme.color.text.muted;

  // Tick every second while a build runs so the elapsed time updates even
  // when the user is on a non-Build tab.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (buildStatus !== 'running' || !buildStartTime) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [buildStatus, buildStartTime]);
  void tick;

  // When a build is actively running, replace the last-build segment with a
  // live "running" strip showing target name + elapsed time + cancel hint.
  // This keeps users oriented when they switch tabs during long builds.
  const isRunning = buildStatus === 'running' && buildStartTime != null;
  const elapsed = isRunning && buildStartTime ? Date.now() - buildStartTime : 0;
  const runningTargetLabel = lastTarget
    ? basename(lastTarget.targetPath).replace(/\.(sln|csproj|vcxproj)$/i, '')
    : '?';

  return (
    <Box paddingX={1} flexShrink={0} overflow="hidden">
      <Text wrap="truncate">
        <Text color={muted as any}>{compact ? 'scan ' : 'Scan '}</Text>
        <Text color={scanColor(envScanStatus) as any}>env:{statusText(envScanStatus, compact)}</Text>
        <Text color={muted as any}> · </Text>
        <Text color={scanColor(projectScanStatus) as any}>proj:{statusText(projectScanStatus, compact)}</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'targets' : 'targets:'}</Text>
        <Text bold color={theme.color.accent.primary as any}> {projects.length}</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'diag' : 'diag:'}</Text>
        <Text color={(errors > 0 ? theme.color.status.danger : theme.color.status.ok) as any}> {errors}E</Text>
        <Text color={(warnings > 0 ? theme.color.status.warning : muted) as any}> {warnings}W</Text>
        <Text color={muted as any}> · </Text>
        <Text>{compact ? 'logs' : 'logs:'}</Text>
        <Text bold> {logCount}</Text>
        <Text color={muted as any}> · </Text>
        {isRunning ? (
          <>
            <Text color={theme.color.status.warning as any} bold>
              {theme.glyphs.running} building
            </Text>
            <Text color={muted as any}> </Text>
            <Text color={theme.color.accent.primary as any}>{runningTargetLabel}</Text>
            <Text color={muted as any}> {formatDuration(elapsed)} · 4 to view · Esc/c cancel</Text>
          </>
        ) : (
          <>
            <Text>{compact ? 'build' : 'last build:'}</Text>
            <Text color={buildColor(buildResult?.status) as any}>
              {' '}{buildResult?.status ?? 'none'}
            </Text>
          </>
        )}
      </Text>
    </Box>
  );
};
