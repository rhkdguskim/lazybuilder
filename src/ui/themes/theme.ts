/**
 * Design tokens for lazybuilder TUI. All visual constants flow from here.
 * Values are Ink color names — keep them; do not switch to hex.
 *
 * Token groups:
 *   text     — foreground intent
 *   border   — chrome around panels, panes, dividers
 *   status   — semantic colors for ok/warn/danger/info/neutral
 *   focus    — the single most important visual: which pane is live
 *   accent   — interactive emphasis (cursor, selected row, primary action)
 */

import { legacyWindowsConsole } from './colors.js';

type InkColor =
  | 'black' | 'red' | 'green' | 'yellow' | 'blue' | 'magenta' | 'cyan' | 'white' | 'gray'
  | 'blackBright' | 'redBright' | 'greenBright' | 'yellowBright'
  | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright';

export const theme = {
  color: {
    text: {
      primary: undefined as InkColor | undefined, // terminal default — best contrast
      secondary: 'gray' as InkColor,
      muted: 'gray' as InkColor,
      accent: 'cyan' as InkColor,
      inverse: 'black' as InkColor,
    },
    border: {
      default: 'gray' as InkColor,
      subtle: 'blackBright' as InkColor,
      focused: 'cyan' as InkColor,
      success: 'green' as InkColor,
      warning: 'yellow' as InkColor,
      danger: 'red' as InkColor,
      info: 'cyan' as InkColor,
    },
    status: {
      ok: 'green' as InkColor,
      warning: 'yellow' as InkColor,
      danger: 'red' as InkColor,
      info: 'cyan' as InkColor,
      neutral: 'gray' as InkColor,
    },
    focus: {
      ring: 'cyan' as InkColor,        // border of the focused container
      title: 'cyan' as InkColor,       // panel title color when focused
      titleDim: 'gray' as InkColor,    // panel title color when not focused
      cursor: 'cyan' as InkColor,      // selected-row caret/inverse tint
    },
    accent: {
      primary: 'cyan' as InkColor,
      secondary: 'magenta' as InkColor,
      key: 'cyan' as InkColor,         // key hint label color
    },
  },
  border: {
    style: 'round' as const,
    styleFocused: 'round' as const,    // ink border styles are limited; we use color + bold instead
  },
  spacing: {
    paneX: 1,
    paneY: 0,
    rowGap: 1,
    sectionGap: 1,
  },
  glyphs: legacyWindowsConsole ? {
    play: '>',
    stop: 'x',
    running: '*',
    follow: 'Follow',
    paused: 'Paused',
    action: '->',
    focus: '|',          // left-edge marker for focused panel/row
    bullet: '*',
    chevronRight: '>',
    chevronLeft: '<',
    divider: '-',
    dot: '.',
    treeCollapsed: '+',
    treeExpanded: '-',
    treeBranch: '|-',
  } as const : {
    play: '▶',           // ▶
    stop: '■',           // ■
    running: '⟳',        // ⟳
    follow: '⬇ Follow',  // ⬇ Follow
    paused: '⏸ Paused',  // ⏸ Paused
    action: '→',         // →
    focus: '▎',          // ▎ vertical block — strong focus marker
    bullet: '•',         // •
    chevronRight: '▸',   // ▸
    chevronLeft: '◂',    // ◂
    divider: '─',        // ─
    dot: '●',            // ●
    treeCollapsed: '▶',  // ▶ collapsed solution group
    treeExpanded: '▼',   // ▼ expanded solution group
    treeBranch: '└─',    // └─ child indent guide
  } as const,
  symbols: legacyWindowsConsole ? {
    ok: 'v',
    warning: '!',
    error: 'x',
    unknown: '?',
    info: 'i',
  } as const : {
    ok: '✔',       // ✔
    warning: '⚠',  // ⚠
    error: '✘',    // ✘
    unknown: '?',
    info: 'ⓘ',     // ⓘ
  } as const,
} as const;

export type Theme = typeof theme;
export type Severity = 'ok' | 'warning' | 'danger' | 'info' | 'neutral';

export function statusColor(severity: Severity | 'unknown' | 'error'): InkColor {
  switch (severity) {
    case 'ok': return theme.color.status.ok;
    case 'warning': return theme.color.status.warning;
    case 'danger':
    case 'error': return theme.color.status.danger;
    case 'info': return theme.color.status.info;
    case 'neutral':
    case 'unknown':
    default: return theme.color.status.neutral;
  }
}

export function statusSymbol(severity: Severity | 'unknown' | 'error'): string {
  switch (severity) {
    case 'ok': return theme.symbols.ok;
    case 'warning': return theme.symbols.warning;
    case 'danger':
    case 'error': return theme.symbols.error;
    case 'info': return theme.symbols.info;
    case 'neutral':
    case 'unknown':
    default: return theme.symbols.unknown;
  }
}
