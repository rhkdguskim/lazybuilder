export const colors = {
  ok: 'green',
  warning: 'yellow',
  error: 'red',
  unknown: 'gray',
  active: 'blue',
  muted: 'gray',
  accent: 'cyan',
  highlight: 'white',
} as const;

export const severityColors: Record<string, string> = {
  ok: colors.ok,
  warning: colors.warning,
  error: colors.error,
  unknown: colors.unknown,
};

export const legacyWindowsConsole = process.platform === 'win32'
  && !process.env.WT_SESSION
  && !process.env.TERM_PROGRAM
  && process.env.ConEmuANSI !== 'ON';

export const symbols = legacyWindowsConsole ? {
  ok: 'v',
  warning: '!',
  error: 'x',
  unknown: '?',
  bullet: '*',
  arrow: '>',
  dash: '-',
} as const : {
  ok: '\u2714',
  warning: '\u26A0',
  error: '\u2718',
  unknown: '?',
  bullet: '\u2022',
  arrow: '\u25B6',
  dash: '\u2500',
} as const;

export const glyphs = legacyWindowsConsole ? {
  play: '>',
  stop: 'x',
  running: '*',
  follow: 'Follow',
  paused: 'Paused',
  action: '->',
} as const : {
  play: '\u25B6',
  stop: '\u25A0',
  running: '\u27F3',
  follow: '\u2B07 Follow',
  paused: '\u23F8 Paused',
  action: '\u2192',
} as const;
