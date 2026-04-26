import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';
import { TabBar } from './ui/components/TabBar.js';
import { KeyHints } from './ui/components/KeyHints.js';
import { GlobalStatusBar } from './ui/components/GlobalStatusBar.js';
import { ShortcutOverlay } from './ui/components/ShortcutOverlay.js';
import { Toast } from './ui/components/Toast.js';
import { LoadingState } from './ui/components/LoadingState.js';
import { useTabNavigation } from './ui/hooks/useTabNavigation.js';
import { useEnvironmentScan } from './ui/hooks/useEnvironmentScan.js';
import { useProjectScan } from './ui/hooks/useProjectScan.js';
import { useAppStore } from './ui/store/useAppStore.js';
import { compactPath } from './ui/utils/text.js';
import { theme } from './ui/themes/theme.js';
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
import { ToolchainModal } from './ui/components/ToolchainModal.js';
import { useToolchain } from './ui/hooks/useToolchain.js';

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
  const pushNotification = useAppStore(s => s.pushNotification);
  const dismissNotification = useAppStore(s => s.dismissNotification);

  // Update notification (background, non-blocking)
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [updateNotificationId, setUpdateNotificationId] = useState<string | null>(null);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'updating' | 'done' | 'error'>('idle');
  const [updateManualCmd, setUpdateManualCmd] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [scanFrame, setScanFrame] = useState(0);
  const toolchain = useToolchain();
  const toolchainActive = toolchain.phase !== 'idle';

  // Background update check — does NOT block the main UI
  useEffect(() => {
    if (process.env['LAZYBUILDER_NO_UPDATE_CHECK'] === '1') return;
    const checker = new UpdateChecker();
    checker.check().then(result => {
      if (result && result.updateAvailable) {
        setUpdateInfo(result);
        const versionLine = result.mode === 'git-clone'
          ? `${result.behindCount ?? 0} commit(s) behind`
          : `${result.currentVersion} → ${result.latestVersion}`;
        const id = pushNotification({
          severity: 'info',
          title: 'Update available',
          detail: versionLine,
          action: { key: 'U', label: 'Update · X dismiss' },
        });
        setUpdateNotificationId(id);
      }
    }).catch(() => {
      // Silently ignore update check failures
    });
  }, [pushNotification]);

  // Handle update action
  const performUpdate = () => {
    setUpdateStatus('updating');
    if (updateNotificationId) dismissNotification(updateNotificationId);
    const updatingId = pushNotification({
      severity: 'info',
      title: 'Updating…',
      detail: updateInfo?.packageName ?? 'lazybuilder',
    });
    const checker = new UpdateChecker();
    checker.performUpdate().then(outcome => {
      dismissNotification(updatingId);
      if (outcome.success) {
        setUpdateStatus('done');
        pushNotification({
          severity: 'ok',
          title: 'Update complete',
          detail: 'Restarting…',
          ttlMs: 2000,
        });
        setTimeout(() => exit(), 2000);
      } else {
        setUpdateManualCmd(outcome.manualCommand ?? null);
        setUpdateStatus('error');
        pushNotification({
          severity: 'danger',
          title: 'Update failed',
          detail: `Run manually: ${outcome.manualCommand ?? `npm install -g ${updateInfo?.packageName ?? 'lazybuilder'}@latest`}`,
          ttlMs: 10000,
        });
      }
    }).catch(() => {
      dismissNotification(updatingId);
      setUpdateStatus('error');
      pushNotification({
        severity: 'danger',
        title: 'Update failed',
        detail: updateManualCmd ?? 'See terminal for details',
        ttlMs: 10000,
      });
    });
  };

  // Global keybindings
  useInput((input, key) => {
    // Toolchain modal owns input while open
    if (toolchainActive) return;

    // Update banner interaction
    if (updateNotificationId && updateStatus === 'idle') {
      if (input === 'u' || input === 'U') {
        performUpdate();
        return;
      }
      if (input === 'x' || input === 'X') {
        dismissNotification(updateNotificationId);
        setUpdateNotificationId(null);
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
    if (input === 'i' && activeTab === 'diagnostics') {
      toolchain.open();
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
            <Text bold color={theme.color.accent.primary as any}>LazyBuilder</Text>
          </Box>
          <Box flexGrow={1} overflow="hidden">
            <Text color={theme.color.text.muted as any} wrap="truncate">{cwdLabel}</Text>
          </Box>
        </Box>
        <Box height={1} />
        <Box
          flexDirection="column"
          borderStyle={theme.border.style}
          borderColor={theme.color.border.focused as any}
          paddingX={2}
          paddingY={1}
          overflow="hidden"
        >
          <LoadingState
            label="Scanning environment"
            hint="Build tools and project inventory are being collected. Tabs unlock when this finishes."
          />
          <Box height={1} />
          <Text color={theme.color.accent.primary as any}>{scanBar}{scanDots}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%" height={termHeight} overflowY="hidden">
      {/* Header */}
      <Box paddingX={1} flexDirection="row" flexShrink={0} overflow="hidden">
        <Box width={12} flexShrink={0}>
          <Text bold color={theme.color.accent.primary as any}>LazyBuilder</Text>
        </Box>
        <Box flexGrow={1} overflow="hidden">
          <Text color={theme.color.text.muted as any} wrap="truncate">{cwdLabel}</Text>
        </Box>
        <Box flexShrink={0}>
          <Toast width={Math.max(40, Math.min(72, termWidth - 14))} />
        </Box>
      </Box>

      {/* Tab Bar */}
      <TabBar tabs={tabs} activeTab={activeTab} />

      {/* Main Content — all tabs always mounted, only active one visible */}
      <Box flexGrow={1} flexShrink={1} flexDirection="column" overflowY="hidden">
        {toolchainActive && toolchain.plan && (
          <ToolchainModal
            plan={toolchain.plan}
            progress={toolchain.progress}
            phase={toolchain.phase === 'idle' ? 'propose' : toolchain.phase}
            onConfirm={toolchain.confirm}
            onCancel={toolchain.cancel}
            onClose={toolchain.close}
          />
        )}
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

      {/* Help Bar — global keys only, contextual hints live inside each tab */}
      <KeyHints hints={helpItems} asFooter />
    </Box>
  );
};

export default App;
