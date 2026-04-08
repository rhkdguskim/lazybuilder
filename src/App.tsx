import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { TabBar } from './ui/components/TabBar.js';
import { HelpBar } from './ui/components/HelpBar.js';
import { GlobalStatusBar } from './ui/components/GlobalStatusBar.js';
import { ShortcutOverlay } from './ui/components/ShortcutOverlay.js';
import { useTabNavigation } from './ui/hooks/useTabNavigation.js';
import { useEnvironmentScan } from './ui/hooks/useEnvironmentScan.js';
import { useProjectScan } from './ui/hooks/useProjectScan.js';
import { useAppStore } from './ui/store/useAppStore.js';
import { DiagnosticsService } from './application/DiagnosticsService.js';
import { UpdateChecker, type UpdateCheckResult } from './infrastructure/updater/UpdateChecker.js';

import { OverviewTab } from './ui/tabs/OverviewTab.js';
import { EnvironmentTab } from './ui/tabs/EnvironmentTab.js';
import { ProjectsTab } from './ui/tabs/ProjectsTab.js';
import { BuildTab } from './ui/tabs/BuildTab.js';
import { DiagnosticsTab } from './ui/tabs/DiagnosticsTab.js';
import { LogsTab } from './ui/tabs/LogsTab.js';
import { HistoryTab } from './ui/tabs/HistoryTab.js';
import { SettingsTab } from './ui/tabs/SettingsTab.js';

const diagnosticsService = new DiagnosticsService();

type UpdateState = 'checking' | 'available' | 'updating' | 'done' | 'skipped' | 'error';

const App: React.FC = () => {
  const { exit } = useApp();
  const { activeTab, tabs } = useTabNavigation();
  const { snapshot, status: envStatus } = useEnvironmentScan();
  const { projects, status: projStatus } = useProjectScan();
  const setDiagnostics = useAppStore(s => s.setDiagnostics);

  // Update check state
  const [updateState, setUpdateState] = useState<UpdateState>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateMessage, setUpdateMessage] = useState('');
  const [showHelp, setShowHelp] = useState(false);

  // Check for updates on startup
  useEffect(() => {
    const checker = new UpdateChecker();
    checker.check().then(result => {
      if (result && result.updateAvailable) {
        setUpdateInfo(result);
        setUpdateState('available');
      } else {
        setUpdateState('skipped');
      }
    }).catch(() => {
      setUpdateState('skipped');
    });
  }, []);

  // Handle update prompt input
  useInput((input, key) => {
    if (updateState === 'available') {
      if (input === 'y' || input === 'Y') {
        setUpdateState('updating');
        setUpdateMessage('Updating... please wait');
        const checker = new UpdateChecker();
        checker.performUpdate().then(success => {
          if (success) {
            setUpdateMessage('Update complete! Please restart buildercli.');
            setUpdateState('done');
            setTimeout(() => exit(), 2000);
          } else {
            setUpdateMessage('Update failed. Run "git pull && npm install && npm run build" manually.');
            setUpdateState('error');
            setTimeout(() => setUpdateState('skipped'), 3000);
          }
        }).catch(() => {
          setUpdateMessage('Update failed.');
          setUpdateState('error');
          setTimeout(() => setUpdateState('skipped'), 3000);
        });
        return;
      }
      if (input === 'n' || input === 'N' || key.escape) {
        setUpdateState('skipped');
        return;
      }
      return;
    }

    // Normal global keybindings (only when not in update prompt)
    if (updateState === 'skipped') {
      if (input === '?') {
        setShowHelp(v => !v);
        return;
      }
      if (input === 'q' && !key.ctrl) {
        exit();
      }
    }
  }, { isActive: !!process.stdin.isTTY });

  // Run diagnostics when both scans complete
  useEffect(() => {
    if (envStatus === 'done' && snapshot && projStatus === 'done') {
      const items = diagnosticsService.analyze(snapshot, projects);
      setDiagnostics(items);
    }
  }, [envStatus, snapshot, projStatus, projects]);

  // Show update prompt
  if (updateState === 'checking') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">LazyBuild</Text>
        <Text color="gray">Checking for updates...</Text>
      </Box>
    );
  }

  if (updateState === 'available' && updateInfo) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">LazyBuild</Text>
        <Box height={1} />
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={2} paddingY={1}>
          <Text bold color="yellow">Update Available!</Text>
          <Box height={1} />
          <Text>Current version: <Text color="gray">{updateInfo.currentCommit}</Text></Text>
          <Text>Latest version:  <Text color="green">{updateInfo.remoteCommit}</Text></Text>
          <Text>You are <Text bold color="yellow">{updateInfo.behindCount}</Text> commit(s) behind.</Text>
          <Box height={1} />
          <Text bold>Would you like to update now? <Text color="cyan">(Y/n)</Text></Text>
        </Box>
      </Box>
    );
  }

  if (updateState === 'updating' || updateState === 'done' || updateState === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="cyan">LazyBuild</Text>
        <Box height={1} />
        <Text color={updateState === 'done' ? 'green' : updateState === 'error' ? 'red' : 'yellow'}>
          {updateMessage}
        </Text>
      </Box>
    );
  }

  // Normal app UI
  const helpItems = [
    { key: '1-8', label: 'Tab' },
    { key: '[ ]', label: 'Prev/Next' },
    { key: '?', label: 'Keys' },
    { key: 'q', label: 'Quit' },
  ];

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header */}
      <Box paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">LazyBuild</Text>
        <Text color="gray">{process.cwd()}</Text>
      </Box>

      <GlobalStatusBar />

      {/* Tab Bar */}
      <TabBar tabs={tabs} activeTab={activeTab} />

      {/* Main Content */}
      <Box flexGrow={1} flexDirection="column">
        {showHelp ? (
          <ShortcutOverlay activeTab={activeTab} />
        ) : (
          <>
            {activeTab === 'overview' && <OverviewTab />}
            {activeTab === 'environment' && <EnvironmentTab />}
            {activeTab === 'projects' && <ProjectsTab />}
            {activeTab === 'build' && <BuildTab />}
            {activeTab === 'diagnostics' && <DiagnosticsTab />}
            {activeTab === 'logs' && <LogsTab />}
            {activeTab === 'history' && <HistoryTab />}
            {activeTab === 'settings' && <SettingsTab />}
          </>
        )}
      </Box>

      {/* Help Bar */}
      <HelpBar items={helpItems} />
    </Box>
  );
};

export default App;
