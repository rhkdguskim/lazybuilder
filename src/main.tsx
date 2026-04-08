import React from 'react';
import { render } from 'ink';
import App from './App.js';

// Cleanup function to restore terminal state
function cleanup() {
  process.stdout.write('\x1b[?25h');   // Show cursor
  process.stdout.write('\x1b[?1006l'); // Disable SGR mouse
  process.stdout.write('\x1b[?1003l'); // Disable mouse move tracking
  process.stdout.write('\x1b[?1000l'); // Disable mouse click tracking
  process.stdout.write('\x1b[?1049l'); // Leave alternate screen
}

// Enter alternate screen buffer — fixed canvas like vim/htop
process.stdout.write('\x1b[?1049h');
process.stdout.write('\x1b[?25l');   // Hide cursor
process.stdout.write('\x1b[H');      // Move cursor to top-left

// Ensure cleanup on any exit
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('uncaughtException', (err) => {
  cleanup();
  console.error(err);
  process.exit(1);
});

const { waitUntilExit } = render(<App />, {
  patchConsole: false,
  exitOnCtrlC: true,
});

waitUntilExit()
  .then(() => { cleanup(); process.exit(0); })
  .catch(() => { cleanup(); process.exit(1); });
