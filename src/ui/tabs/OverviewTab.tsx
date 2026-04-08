import React from 'react';
import { Box, Text } from 'ink';
import { useAppStore } from '../store/useAppStore.js';
import { StatusBadge } from '../components/StatusBadge.js';
import { KeyValueTable } from '../components/KeyValueTable.js';
import { ProgressPanel } from '../components/ProgressPanel.js';
import type { Severity } from '../../domain/enums.js';

export const OverviewTab: React.FC = () => {
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
    { key: 'CWD', value: snapshot.cwd },
    { key: 'Git Branch', value: snapshot.gitBranch ?? 'N/A', color: snapshot.gitBranch ? 'cyan' : 'gray' },
  ];

  return (
    <Box flexDirection="column" padding={1} flexGrow={1} overflowY="hidden">
      <Box flexDirection="row" marginBottom={1}>
        <MetricCard label="Projects" value={String(projects.length)} color="cyan" />
        <MetricCard label="Diagnostics" value={`${errorCount}E ${warnCount}W`} color={errorCount > 0 ? 'red' : warnCount > 0 ? 'yellow' : 'green'} />
        <MetricCard label="Status" value={readiness.label} color={readiness.color} />
      </Box>

      <Box flexDirection="row">
        {/* Left: Status */}
        <Box flexDirection="column" width="55%" paddingRight={2}>
          <Text bold color="cyan">{'─── Build Environment Status ───'}</Text>
          <Box height={1} />

          <StatusBadge severity={dotnetSeverity} label=".NET SDK" detail={dotnetDetail} />
          <StatusBadge severity={msbuildSeverity} label="MSBuild" detail={msbuildDetail} />
          <StatusBadge severity={cppSeverity} label="C++ Toolchain" detail={cppDetail} />
          <StatusBadge severity={cmakeSeverity} label="CMake" detail={cmakeDetail} />

          <Box height={1} />
          <Text bold color="cyan">{'─── Additional Tools ───'}</Text>
          <Box height={1} />

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
        </Box>

        {/* Right: System Info + Summary */}
        <Box flexDirection="column" flexGrow={1}>
          <Text bold color="cyan">{'─── Next Step ───'}</Text>
          <Box height={1} />
          <Box flexDirection="column" borderStyle="round" borderColor={readiness.color} paddingX={1}>
            <Text bold color={readiness.color}>{nextStep.title}</Text>
            <Text color="gray">{nextStep.detail}</Text>
            <Text color="cyan">Press {nextStep.command} to continue</Text>
          </Box>

          <Box height={1} />
          <Text bold color="cyan">{'─── System Info ───'}</Text>
          <Box height={1} />
          <KeyValueTable rows={systemInfo} keyWidth={14} />

          <Box height={1} />
          <Text bold color="cyan">{'─── Summary ───'}</Text>
          <Box height={1} />
          <Text>Readiness: <Text bold color={readiness.color}>{readiness.label}</Text></Text>
          <Text color="gray">{readiness.detail}</Text>
          <Text>Projects: <Text bold>{projects.length}</Text></Text>
          <Text>VS Installations: <Text bold>{snapshot.visualStudio.installations.length}</Text></Text>
          <Text>
            Diagnostics:{' '}
            {errorCount > 0 && <Text color="red">{errorCount} error(s) </Text>}
            {warnCount > 0 && <Text color="yellow">{warnCount} warning(s)</Text>}
            {errorCount === 0 && warnCount === 0 && <Text color="green">All clear</Text>}
          </Text>
        </Box>
      </Box>
    </Box>
  );
};

const MetricCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
  <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} marginRight={1} width={22}>
    <Text color="gray">{label}</Text>
    <Text bold color={color as any}>{value}</Text>
  </Box>
);
