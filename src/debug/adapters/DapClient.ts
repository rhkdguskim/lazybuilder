import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { logger, errToLog } from '../../infrastructure/logging/Logger.js';

const log = logger.child({ component: 'DapClient' });

/**
 * Default request timeout (ms). Most DAP requests should answer in well
 * under a second; we cap at 30s to allow `launch` / `initialize` enough room.
 */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout | null;
  command: string;
}

export interface DapEvent {
  event: string;
  body: unknown;
}

export interface DapResponse {
  seq: number;
  type: 'response';
  request_seq: number;
  command: string;
  success: boolean;
  message?: string;
  body?: unknown;
}

export interface DapEventMessage {
  seq: number;
  type: 'event';
  event: string;
  body?: unknown;
}

type DapMessage = DapResponse | DapEventMessage | { type: string; [k: string]: unknown };

/**
 * Minimal Debug Adapter Protocol client.
 *
 * Speaks JSON-RPC over stdio with `Content-Length:` framing (the DAP wire
 * format used by VS Code / netcoredbg / debugpy / cppdbg). No native
 * dependencies — pure stdio.
 *
 * Lifecycle:
 *   - Construct with an already-spawned ChildProcess.
 *   - Call `request(command, args)` for request/response RPCs.
 *   - Listen for `'event'` for adapter-pushed events (`stopped`, `exited`, ...).
 *   - Call `close()` to detach. The `'exit'` event fires when the child exits.
 */
export class DapClient extends EventEmitter {
  private seq = 1;
  private pending = new Map<number, PendingRequest>();
  private readBuffer = Buffer.alloc(0);
  private contentLength: number | null = null;
  private closed = false;

  constructor(private readonly child: ChildProcess) {
    super();
    if (!child.stdout || !child.stdin) {
      throw new Error('DapClient: child process must be spawned with stdio pipes.');
    }
    child.stdout.on('data', (chunk: Buffer) => this.onData(chunk));
    child.stdout.on('error', (err) => log.warn('dap stdout error', errToLog(err)));
    child.stdin.on('error', (err) => log.warn('dap stdin error', errToLog(err)));
    child.on('exit', () => this.onChildExit());
    child.on('error', (err) => {
      log.warn('dap child error', errToLog(err));
      this.failAll(err instanceof Error ? err : new Error(String(err)));
    });
  }

  /**
   * Send a DAP request and resolve with `response.body`.
   *
   * Rejects with an Error if:
   *   - the adapter returns `success:false` (Error.message = response.message)
   *   - the request times out
   *   - the child process exits before responding
   *   - the client is already closed
   */
  request<T = unknown>(
    command: string,
    args?: unknown,
    timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
  ): Promise<T> {
    if (this.closed) {
      return Promise.reject(new Error(`DapClient closed; cannot send '${command}'.`));
    }
    const seq = this.seq++;
    const message = {
      seq,
      type: 'request',
      command,
      arguments: args ?? {},
    };
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const settleResolve = (v: unknown): void => {
        if (settled) return;
        settled = true;
        resolve(v as T);
      };
      const settleReject = (err: Error): void => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const timer = timeoutMs > 0
        ? setTimeout(() => {
          this.pending.delete(seq);
          settleReject(
            new Error(`DAP request '${command}' timed out after ${timeoutMs}ms`),
          );
        }, timeoutMs)
        : null;
      this.pending.set(seq, {
        resolve: settleResolve,
        reject: settleReject,
        timer,
        command,
      });
      try {
        this.writeMessage(message);
      } catch (err) {
        this.pending.delete(seq);
        if (timer) clearTimeout(timer);
        settleReject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Detach from the child. Pending requests are rejected. Does NOT kill the
   * child — caller is responsible for terminating it (typically via DAP
   * `disconnect` then `child.kill()`).
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.failAll(new Error('DapClient closed.'));
  }

  /** Whether the underlying child is still attached. */
  isClosed(): boolean {
    return this.closed;
  }

  private writeMessage(message: unknown): void {
    const json = JSON.stringify(message);
    const body = Buffer.from(json, 'utf8');
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'utf8');
    const stdin = this.child.stdin;
    if (!stdin || stdin.destroyed) {
      throw new Error('DAP child stdin is not writable.');
    }
    stdin.write(header);
    stdin.write(body);
  }

  private onData(chunk: Buffer): void {
    this.readBuffer = Buffer.concat([this.readBuffer, chunk]);
    // Repeatedly try to consume framed messages; chunk boundaries can split
    // headers, bodies, or multi-message buffers.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      if (this.contentLength === null) {
        const headerEnd = this.readBuffer.indexOf('\r\n\r\n');
        if (headerEnd < 0) return; // wait for more bytes
        const headerText = this.readBuffer.subarray(0, headerEnd).toString('utf8');
        const match = /Content-Length:\s*(\d+)/i.exec(headerText);
        if (!match) {
          const err = new Error(
            `DAP header missing Content-Length: ${JSON.stringify(headerText)}`,
          );
          this.failAll(err);
          this.emit('error', err);
          return;
        }
        this.contentLength = parseInt(match[1]!, 10);
        this.readBuffer = this.readBuffer.subarray(headerEnd + 4);
      }
      if (this.readBuffer.length < this.contentLength) return; // need more body bytes
      const bodyBuf = this.readBuffer.subarray(0, this.contentLength);
      this.readBuffer = this.readBuffer.subarray(this.contentLength);
      this.contentLength = null;

      let parsed: DapMessage;
      try {
        parsed = JSON.parse(bodyBuf.toString('utf8')) as DapMessage;
      } catch (err) {
        log.warn('dap body parse failed', errToLog(err));
        continue;
      }
      this.dispatch(parsed);
    }
  }

  private dispatch(message: DapMessage): void {
    if (message.type === 'response') {
      const r = message as DapResponse;
      const pending = this.pending.get(r.request_seq);
      if (!pending) {
        log.debug('dap response without pending', { request_seq: r.request_seq });
        return;
      }
      this.pending.delete(r.request_seq);
      if (pending.timer) clearTimeout(pending.timer);
      if (r.success) {
        pending.resolve(r.body);
      } else {
        pending.reject(new Error(r.message ?? `DAP '${r.command}' failed.`));
      }
    } else if (message.type === 'event') {
      const ev = message as DapEventMessage;
      this.emit('event', { event: ev.event, body: ev.body } satisfies DapEvent);
    } else {
      log.debug('dap unknown message type', { type: message.type });
    }
  }

  private onChildExit(): void {
    this.failAll(new Error('DAP child process exited before responding.'));
    this.closed = true;
    this.emit('exit');
  }

  private failAll(err: Error): void {
    for (const [seq, pending] of this.pending) {
      if (pending.timer) clearTimeout(pending.timer);
      pending.reject(err);
      this.pending.delete(seq);
    }
  }
}
