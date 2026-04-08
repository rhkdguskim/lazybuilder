import { useEffect } from 'react';

/**
 * Enables mouse wheel scrolling in the terminal.
 * Listens for SGR mouse escape sequences on stdin.
 * Calls onScroll(direction) where direction is 1 (down) or -1 (up).
 */
export function useMouseScroll(onScroll: (direction: 1 | -1) => void, isActive: boolean = true) {
  useEffect(() => {
    if (!isActive || !process.stdin.isTTY) return;

    const stdin = process.stdin;

    // Enable mouse tracking (SGR mode for wider terminal support)
    process.stdout.write('\x1b[?1000h'); // Enable mouse click tracking
    process.stdout.write('\x1b[?1003h'); // Enable mouse move tracking (optional)
    process.stdout.write('\x1b[?1006h'); // Enable SGR mouse mode

    const onData = (data: Buffer) => {
      const str = data.toString();

      // SGR mouse format: \x1b[<button;x;yM or \x1b[<button;x;ym
      // Button 64 = scroll up, Button 65 = scroll down
      const sgrMatch = str.match(/\x1b\[<(\d+);\d+;\d+[Mm]/);
      if (sgrMatch) {
        const button = parseInt(sgrMatch[1]!, 10);
        if (button === 64) {
          onScroll(-1); // scroll up
          return;
        }
        if (button === 65) {
          onScroll(1); // scroll down
          return;
        }
      }

      // Legacy mouse format: \x1b[M followed by 3 bytes
      // Button byte & 0x60 === 0x40 for scroll
      if (str.startsWith('\x1b[M') && str.length >= 6) {
        const button = str.charCodeAt(3) - 32;
        if (button === 96) { // scroll up (button & 0x40 + scroll up)
          onScroll(-1);
          return;
        }
        if (button === 97) { // scroll down
          onScroll(1);
          return;
        }
      }
    };

    stdin.on('data', onData);

    return () => {
      stdin.off('data', onData);
      // Disable mouse tracking
      process.stdout.write('\x1b[?1006l');
      process.stdout.write('\x1b[?1003l');
      process.stdout.write('\x1b[?1000l');
    };
  }, [onScroll, isActive]);
}
