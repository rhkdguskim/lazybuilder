import { useInput } from 'ink';
import { useAppStore, type TabId } from '../store/useAppStore.js';
import type { TabDef } from '../components/TabBar.js';

export const TAB_DEFS: TabDef[] = [
  { id: 'overview', label: 'Overview', shortcut: '1' },
  { id: 'environment', label: 'Environment', shortcut: '2' },
  { id: 'projects', label: 'Projects', shortcut: '3' },
  { id: 'build', label: 'Build', shortcut: '4' },
  { id: 'diagnostics', label: 'Diagnostics', shortcut: '5' },
  { id: 'logs', label: 'Logs', shortcut: '6' },
  { id: 'history', label: 'History', shortcut: '7' },
  { id: 'settings', label: 'Settings', shortcut: '8' },
];

const TAB_IDS: TabId[] = TAB_DEFS.map(t => t.id as TabId);

export function useTabNavigation() {
  const activeTab = useAppStore(s => s.activeTab);
  const setActiveTab = useAppStore(s => s.setActiveTab);

  const isInteractive = !!process.stdin.isTTY;

  useInput((input, key) => {
    // Direct 1 through 8, or Ctrl+1 through Ctrl+8
    if (input >= '1' && input <= '8') {
      const idx = parseInt(input) - 1;
      if (idx < TAB_IDS.length) {
        setActiveTab(TAB_IDS[idx]!);
      }
      return;
    }

    // Left/Right arrow for tab cycling
    if ((key.leftArrow && key.ctrl) || input === '[') {
      const idx = TAB_IDS.indexOf(activeTab);
      const prev = (idx - 1 + TAB_IDS.length) % TAB_IDS.length;
      setActiveTab(TAB_IDS[prev]!);
      return;
    }
    if ((key.rightArrow && key.ctrl) || input === ']') {
      const idx = TAB_IDS.indexOf(activeTab);
      const next = (idx + 1) % TAB_IDS.length;
      setActiveTab(TAB_IDS[next]!);
      return;
    }
  }, { isActive: isInteractive });

  return { activeTab, setActiveTab, tabs: TAB_DEFS };
}
