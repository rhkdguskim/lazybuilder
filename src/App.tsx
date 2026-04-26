import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { TabBar } from './ui/components/TabBar.js';
import { HelpBar } from './ui/components/HelpBar.js';
import { GlobalStatusBar } from './ui/components/GlobalStatusBar.js';
import { ShortcutOverlay } from './ui/components/ShortcutOverlay.js';
import { useTabNavigation } from './ui/hooks/useTabNavigation.js';
import { useEnvironmentScan } from './ui/hooks/useEnvironmentScan.js';
import { useProjectScan } from './ui/hooks/useProjectScan.js';
import { useAppStore } from './ui/store/useAppStore.js';
import { compactPath } from './ui/utils/text.js';
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

const App: React.FC = () => {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const termHeight = stdout?.rows ?? 30;
  const termWidth = stdout?.columns ?? 80;
  const { activeTab, tabs } = useTabNavigation();
  const { snapshot, status: envStatus } = useEnvironmentScan();
  const { projects, status: projStatus } = useProjectScan();
  const setDiagnostics = useAppStore(s => s.setDiagnostics);
  const buildSearchActive = useAppStore(s => s.buildSearchActive);

  // Update notification (background, non-blocking)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateBannerVisible, setUpdateBannerVisible] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'done' | 'error'>('idle');
  const [updateManualCmd, setUpdateManualCmd] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [scanFrame, setScanFrame] = useState(0);

  // Background update check — does NOT block the main UI
  useEffect(() => {
    if (process.env['LAZYBUILDER_NO_UPDATE_CHECK'] === '1') return;
    const checker = new UpdateChecker();
    checker.check().then(result => {
      if (result && result.updateAvailable) {
        setUpdateInfo(result);
        setUpdateBannerVisible(true);
      }
    }).catch(() => {
      // Silently ignore update check failures
    });
  }, []);

  // Handle update action
  const performUpdate = () => {
    setUpdateStatus('updating');
    const checker = new UpdateChecker();
    checker.performUpdate().then(outcome => {
      if (outcome.success) {
        setUpdateStatus('done');
        setTimeout(() => exit(), 2000);
      } else {
        setUpdateManualCmd(outcome.manualCommand ?? null);
        setUpdateStatus('error');
        setTimeout(() => setUpdateBannerVisible(false), 8000);
      }
    }).catch(() => {
      setUpdateStatus('error');
      setTimeout(() => setUpdateBannerVisible(false), 8000);
    });
  };

  // Global keybindings
  useInput((input, key) => {
    // Update banner interaction
    if (updateBannerVisible && updateStatus === 'idle') {
      if (input === 'u' || input === 'U') {
        performUpdate();
        return;
      }
      if (input === 'x' || input === 'X') {
        setUpdateBannerVisible(false);
        return;
      }
    }

    if (activeTab === 'build' && buildSearchActive) {
      return;
    }

    if (input === '?') {
      setShowHelp(v => !v);
      return;
    }
    if (input === 'q' && !key.ctrl) {
      // Cancel any running build before exit
      const cancelFn = useAppStore.getState().buildCancelFn;
      if (cancelFn) {
        cancelFn().finally(() => exit());
      } else {
        exit();
      }
    }
  }, { isActive: !!process.stdin.isTTY });

  // Run diagnostics when both scans complete + mark boot done
  useEffect(() => {
    if (envStatus === 'done' && snapshot && projStatus === 'done') {
      const items = diagnosticsService.analyze(snapshot, projects);
      setDiagnostics(items);
      if (!bootCompleted) setBootCompleted();
    }
  }, [envStatus, snapshot, projStatus, projects]);

  useEffect(() => {
    if (envStatus !== 'idle' && envStatus !== 'scanning') {
      setScanFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setScanFrame(frame => (frame + 1) % 4);
    }, 500);

    return () => clearInterval(timer);
  }, [envStatus]);

  const helpItems = [
    { key: '1-8', label: 'Tab' },
    { key: '[ ]', label: 'Prev/Next' },
    { key: '?', label: 'Keys' },
    { key: 'q', label: 'Quit' },
  ];


  const bootCompleted = useAppStore(s => s.bootCompleted);
  const setBootCompleted = useAppStore(s => s.setBootCompleted);
  const isInitialScanning = !bootCompleted && (envStatus === 'idle' || envStatus === 'scanning');
  const scanDots = '.'.repeat((scanFrame % 4) + 1).padEnd(4, ' ');
  const scanBar = ['[=   ]', '[==  ]', '[=== ]', '[ ===]', '[  ==]', '[   =]'][scanFrame % 6];
  const cwdLabel = compactPath(process.cwd(), Math.max(18, termWidth - 16));

  if (isInitialScanning) {
    return (
      <Box flexDirection="column" width="100%" height={termHeight} padding={1}>
        <Box flexDirection="row" flexShrink={0} overflow="hidden">
          <Box width={12} flexShrink={0}>
            <Text bold color="cyan">LazyBuilder</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text color="gray" wrap="truncate">{cwdLabel}</Text>
          </Box>
        </Box>
        <Box height={1} />
        <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1} overflow="hidden">
          <Text bold color="cyan" wrap="truncate">Scanning Environment{scanDots}</Text>
          <Box height={1} />
          <Text color="cyan">{scanBar}</Text>
          <Box height={1} />
          <Text color="gray" wrap="truncate">Build environment and project inventory are being collected.</Text>
          <Text color="gray" wrap="truncate">Tabs will appear after the initial scan completes.</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height={termHeight} overflowY="hidden">
      {/* Header */}
      <Box paddingX={1} flexDirection="row" flexShrink={0} overflow="hidden">
        <Box width={12} flexShrink={0}>
          <Text bold color="cyan">LazyBuilder</Text>
        </Box>
        <Box flexGrow={1} overflow="hidden">
          <Text color="gray" wrap="truncate">{cwdLabel}</Text>
        </Box>
      </Box>

      {/* Update notification banner (non-blocking) */}
      {updateBannerVisible && updateInfo && (
        <Box paddingX={1} borderStyle="round" borderColor="yellow" marginX={1} flexShrink={0} overflow="hidden">
          {updateStatus === 'idle' && (
            <Text wrap="truncate">
              <Text color="yellow" bold> Update available </Text>
              <Text color="gray">
                {updateInfo.mode === 'git-clone'
                  ? `(${updateInfo.behindCount ?? 0} commit(s) behind) `
                  : `(${updateInfo.currentVersion} → ${updateInfo.latestVersion}) `}
              </Text>
              <Text color="cyan" bold>[U]</Text><Text> Update </Text>
              <Text color="gray" bold>[X]</Text><Text> Dismiss</Text>
            </Text>
          )}
          {updateStatus === 'updating' && <Text color="yellow" wrap="truncate">Updating... please wait</Text>}
          {updateStatus === 'done' && <Text color="green" wrap="truncate">Update complete. Restarting...</Text>}
          {updateStatus === 'error' && (
            <Text color="red" wrap="truncate">
              Update failed. Run manually: <Text bold>{updateManualCmd ?? `npm install -g ${updateInfo.packageName}@latest`}</Text>
            </Text>
          )}
        </Box>
      )}

      {/* Tab Bar */}
      <TabBar tabs={tabs} activeTab={activeTab} />

      {/* Main Content — all tabs always mounted, only active one visible */}
      <Box flexGrow={1} flexShrink={1} flexDirection="column" overflowY="hidden">
        {showHelp && <ShortcutOverlay activeTab={activeTab} />}
        <Box display={!showHelp && activeTab === 'overview' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><OverviewTab /></Box>
        <Box display={!showHelp && activeTab === 'environment' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><EnvironmentTab /></Box>
        <Box display={!showHelp && activeTab === 'projects' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><ProjectsTab /></Box>
        <Box display={!showHelp && activeTab === 'build' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><BuildTab /></Box>
        <Box display={!showHelp && activeTab === 'diagnostics' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><DiagnosticsTab /></Box>
        <Box display={!showHelp && activeTab === 'logs' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><LogsTab /></Box>
        <Box display={!showHelp && activeTab === 'history' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><HistoryTab /></Box>
        <Box display={!showHelp && activeTab === 'settings' ? 'flex' : 'none'} flexGrow={1} overflowY="hidden"><SettingsTab /></Box>
      </Box>

      <GlobalStatusBar />

      {/* Help Bar */}
      <HelpBar items={helpItems} />
    </Box>
  );
};

export default App;
