import { useEffect, useRef } from 'react';

export type MouseInputEvent =
  | { type: 'click'; x: number; y: number; button: number }
  | { type: 'scroll'; x: number; y: number; direction: 1 | -1 };

export function useMouseInput(
  onMouse: (event: MouseInputEvent) => void,
  isActive: boolean = true,
) {
  const callbackRef = useRef(onMouse);
  callbackRef.current = onMouse;

  useEffect(() => {
    if (!isActive || !process.stdin.isTTY) return;

    const onData = (data: Buffer) => {
      const str = data.toString();

      const sgrMatch = str.match(/\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
      if (sgrMatch) {
        const button = Number.parseInt(sgrMatch[1]!, 10);
        const x = Number.parseInt(sgrMatch[2]!, 10);
        const y = Number.parseInt(sgrMatch[3]!, 10);
        const action = sgrMatch[4]!;

        if (button === 64) {
          callbackRef.current({ type: 'scroll', x, y, direction: -1 });
          return;
        }
        if (button === 65) {
          callbackRef.current({ type: 'scroll', x, y, direction: 1 });
          return;
        }
        if (action === 'M' && button <= 2) {
          callbackRef.current({ type: 'click', x, y, button });
        }
        return;
      }

      if (str.startsWith('\x1b[M') && str.length >= 6) {
        const button = str.charCodeAt(3) - 32;
        const x = str.charCodeAt(4) - 32;
        const y = str.charCodeAt(5) - 32;
        if (button === 96) {
          callbackRef.current({ type: 'scroll', x, y, direction: -1 });
        } else if (button === 97) {
          callbackRef.current({ type: 'scroll', x, y, direction: 1 });
        } else if (button <= 2) {
          callbackRef.current({ type: 'click', x, y, button });
        }
      }
    };

    process.stdin.on('data', onData);
    return () => { process.stdin.off('data', onData); };
  }, [isActive]);
}
