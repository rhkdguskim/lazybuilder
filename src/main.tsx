import React from 'react';
import { render } from 'ink';
import { Writable } from 'node:stream';
import App from './App.js';
import { logger, errToLog } from './infrastructure/logging/Logger.js';

// ── Terminal setup ──────────────────────────────────────────────
const realStdout = process.stdout;

function cleanup() {
  realStdout.write('\x1b[?25h');   // Show cursor
  realStdout.write('\x1b[?1006l'); // Disable SGR mouse
  realStdout.write('\x1b[?1000l'); // Disable mouse click
  realStdout.write('\x1b[?1049l'); // Leave alternate screen
}

realStdout.write('\x1b[?1049h');  // Alternate screen
realStdout.write('\x1b[?25l');    // Hide cursor
realStdout.write('\x1b[2J');      // Clear entire screen
realStdout.write('\x1b[H');       // Cursor home
realStdout.write('\x1b[?1000h');  // Mouse click tracking
realStdout.write('\x1b[?1006h');  // SGR mouse mode

process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('uncaughtException', (err) => {
  cleanup();
  logger.fatal('uncaughtException', errToLog(err));
  // Mirror to stderr after cleanup so the user sees a stack on the real terminal
  process.stderr.write(`[lazybuilder] fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', errToLog(reason));
});

// ── Flicker-free rendering ─────────────────────────────────────
//
// Ink erases previous output line-by-line (\x1b[2K\x1b[1A) then rewrites.
// We intercept, strip erase sequences, and repaint from cursor home.
// Each line gets \x1b[K (erase to end of line) to clear residual chars.
// \x1b[0J at the end clears any leftover lines from previous frame.

const stableStream = new Writable({
  write(chunk: Buffer, _encoding: string, callback: () => void) {
    const raw = chunk.toString();

    // Strip Ink's erase/cursor sequences
    let content = raw
      .replace(/\x1b\[2K/g, '')       // erase line
      .replace(/\x1b\[1A/g, '')       // cursor up
      .replace(/\x1b\[\d*G/g, '');    // cursor horizontal absolute

    // Remove leading empty lines
    content = content.replace(/^\n+/, '');

    if (!content.trim()) {
      callback();
      return;
    }

    // Append \x1b[K to each line (erase from cursor to end of line)
    // This handles Unicode/wide chars without needing to calculate display width
    const lines = content.split('\n');
    const cleanedLines = lines.map(line => line + '\x1b[K');

    // Atomic frame: home → content with per-line erase → clear remaining screen
    realStdout.write(
      '\x1b[H' +                    // Cursor to (0,0)
      cleanedLines.join('\n') +     // Content (each line clears its own tail)
      '\x1b[0J'                     // Clear from cursor to end of screen
    );

    callback();
  },
});

// Expose terminal properties (Ink reads these for layout)
Object.defineProperty(stableStream, 'columns', { get: () => realStdout.columns });
Object.defineProperty(stableStream, 'rows', { get: () => realStdout.rows });
Object.defineProperty(stableStream, 'isTTY', { get: () => true });
realStdout.on('resize', () => {
  // Clear screen on resize to prevent ghost artifacts
  realStdout.write('\x1b[2J');
  realStdout.write('\x1b[H');
  stableStream.emit('resize');
});

// ── Render ──────────────────────────────────────────────────────
const { waitUntilExit } = render(<App />, {
  stdout: stableStream as any,
  patchConsole: false,
  exitOnCtrlC: true,
});

waitUntilExit()
  .then(() => { cleanup(); process.exit(0); })
  .catch(() => { cleanup(); process.exit(1); });
