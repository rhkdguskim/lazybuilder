import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { KeyValueTable } from '../components/KeyValueTable.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import { PageHeader, Panel } from '../components/index.js';
import { compactPath } from '../utils/text.js';
import type { Severity } from '../../domain/enums.js';

export const OverviewTab: React.FC = () => {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isVeryNarrow = columns < 72;
  const snapshot = useAppStore(s => s.snapshot);
  const envStatus = useAppStore(s => s.envScanStatus);
  const diagnostics = useAppStore(s => s.diagnostics);
  const projects = useAppStore(s => s.projects);

  if (envStatus === 'scanning' || envStatus === 'idle') {
    return (
      <Box flexDirection="column" padding={1}>
        <ProgressPanel label="Scanning environment..." status="scanning" />
      </Box>
    );
  }

  if (!snapshot) {
    return (
      <Box padding={1}>
        <Text color="red">Failed to scan environment</Text>
      </Box>
    );
  }

  const dotnetSeverity: Severity = snapshot.dotnet.tool.detected ? 'ok' : 'error';
  const dotnetDetail = snapshot.dotnet.tool.detected
    ? `${snapshot.dotnet.sdks.length} SDK(s), v${snapshot.dotnet.tool.version}`
    : 'not found';

  const msbuildSeverity: Severity = snapshot.msbuild.instances.length > 0 ? 'ok' : 'warning';
  const msbuildDetail = snapshot.msbuild.instances.length > 0
    ? `${snapshot.msbuild.instances.length} instance(s), v${snapshot.msbuild.instances[0]?.version ?? '?'}`
    : 'not found';

  const cppSeverity: Severity = snapshot.cpp.clExe?.detected ? 'ok' : 'warning';
  const cppDetail = snapshot.cpp.clExe?.detected
    ? `${snapshot.cpp.toolsets.length} toolset(s)`
    : 'not available';

  const cmakeSeverity: Severity = snapshot.cmake?.detected ? 'ok' : 'unknown';
  const cmakeDetail = snapshot.cmake?.detected
    ? `v${snapshot.cmake.version}`
    : 'not found';

  const errorCount = diagnostics.filter(d => d.severity === 'error').length;
  const warnCount = diagnostics.filter(d => d.severity === 'warning').length;
  const hasBuildableTargets = projects.length > 0;

  const readiness = errorCount > 0
    ? { label: 'Blocked', color: 'red' as const, detail: 'Open Diagnostics and resolve blocking issues first.' }
    : warnCount > 0
      ? { label: 'Needs Review', color: 'yellow' as const, detail: 'Build may work, but warnings should be reviewed.' }
      : hasBuildableTargets
        ? { label: 'Ready', color: 'green' as const, detail: 'Environment looks usable. Open Build and run a target.' }
        : { label: 'No Targets', color: 'yellow' as const, detail: 'No standalone targets detected yet.' };

  const nextStep = !hasBuildableTargets
    ? { title: 'Check Projects', command: '3', detail: 'Open Projects to inspect detected solutions and project files.' }
    : errorCount > 0
      ? { title: 'Resolve Diagnostics', command: '5', detail: 'Blocking diagnostics exist. Review errors before building.' }
      : { title: 'Run Build', command: '4', detail: 'Open Build, confirm configuration, then press Enter to build.' };

  const systemInfo = [
    { key: 'OS', value: `${snapshot.os.name} (${snapshot.os.arch})` },
    { key: 'Host', value: `${snapshot.username}@${snapshot.hostname}` },
    { key: 'Shell', value: snapshot.shell },
    { key: 'CWD', value: compactPath(snapshot.cwd, Math.max(24, Math.floor(columns / 2))) },
    { key: 'Git Branch', value: snapshot.gitBranch ?? 'N/A', color: snapshot.gitBranch ? 'cyan' : 'gray' },
  ];

  return (
    <Box flexDirection="column" paddingX={1} paddingTop={1} flexGrow={1} overflowY="hidden">
      <PageHeader
        title="Overview"
        subtitle="Build environment readiness and the next safe action."
      />

      <Box flexDirection="row" flexShrink={0} overflow="hidden">
        <Text wrap="truncate">
          <Text bold color={readiness.color}>{readiness.label}</Text>
          <Text color="gray"> | projects </Text><Text bold color="cyan">{projects.length}</Text>
          <Text color="gray"> | diagnostics </Text>
          <Text color={errorCount > 0 ? 'red' : 'green'}>{errorCount}E</Text>
          <Text color={warnCount > 0 ? 'yellow' : 'gray'}> {warnCount}W</Text>
          <Text color="gray"> | next </Text><Text color="cyan">{nextStep.title}</Text>
        </Text>
      </Box>

      <Box flexDirection={isVeryNarrow ? 'column' : 'row'} flexGrow={1} overflowY="hidden">
        <Box
          flexDirection="column"
          width={isVeryNarrow ? '100%' : '50%'}
          paddingRight={isVeryNarrow ? 0 : 1}
          overflowY="hidden"
        >
          <Panel title="Toolchain" minHeight={10} flexGrow={1}>
            <StatusBadge severity={dotnetSeverity} label=".NET SDK" detail={dotnetDetail} />
            <StatusBadge severity={msbuildSeverity} label="MSBuild" detail={msbuildDetail} />
            <StatusBadge severity={cppSeverity} label="C++ Toolchain" detail={cppDetail} />
            <StatusBadge severity={cmakeSeverity} label="CMake" detail={cmakeDetail} />
            <StatusBadge
              severity={snapshot.git?.detected ? 'ok' : 'warning'}
              label="Git"
              detail={snapshot.git?.version ?? 'not found'}
            />
            <StatusBadge
              severity={snapshot.ninja?.detected ? 'ok' : 'unknown'}
              label="Ninja"
              detail={snapshot.ninja?.version ?? 'not found'}
            />
            <StatusBadge
              severity={snapshot.powershell?.detected ? 'ok' : 'unknown'}
              label="PowerShell"
              detail={snapshot.powershell?.version ?? 'not found'}
            />
          </Panel>
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          overflowY="hidden"
          marginTop={isVeryNarrow ? 1 : 0}
        >
          <Panel title="Next Step & System" borderColor={readiness.color} minHeight={10} flexGrow={1}>
            <Text bold color={readiness.color} wrap="truncate">{nextStep.title}</Text>
            <Text color="gray" wrap="truncate">{nextStep.detail}</Text>
            <Text color="cyan" wrap="truncate">Press {nextStep.command} to continue</Text>
            <Box height={1} />
            <KeyValueTable rows={systemInfo} keyWidth={14} />
            <Text color="gray" wrap="truncate">VS installations: {snapshot.visualStudio.installations.length}</Text>
          </Panel>
        </Box>
      </Box>
    </Box>
  );
};
