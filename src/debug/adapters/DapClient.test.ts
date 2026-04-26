import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { DapClient, type DapEvent } from './DapClient.js';

/**
 * Build a fake `ChildProcess` whose stdin/stdout we control. Lets us drive
 * the DAP client deterministically without spawning anything.
 */
function makeFakeChild(): {
  child: ChildProcess;
  stdoutPush: (chunk: Buffer | string) => void;
  stdinChunks: () => Buffer;
  emitExit: () => void;
} {
  const stdout = new Readable({ read() {} });
  const stdinBuf: Buffer[] = [];
  const stdin = new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      stdinBuf.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      cb();
    },
  });
  const emitter = new EventEmitter() as ChildProcess;
  // Cast through unknown — we only need stdout/stdin/on/emit on this fake.
  const child = emitter as unknown as ChildProcess & {
    stdout: Readable;
    stdin: Writable;
  };
  child.stdout = stdout;
  child.stdin = stdin;
  return {
    child,
    stdoutPush: (chunk) => {
      stdout.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    },
    stdinChunks: () => Buffer.concat(stdinBuf),
    emitExit: () => emitter.emit('exit', 0, null),
  };
}

function frame(message: object): Buffer {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.from(
    `Content-Length: ${body.length}\r\n\r\n`,
    'utf8',
  );
  return Buffer.concat([header, body]);
}

describe('DapClient framing', () => {
  it('parses a single response and resolves the matching request', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const p = client.request<{ ok: true }>('initialize', {});
    // Read the seq the client used so the response targets it correctly.
    await new Promise((r) => setImmediate(r));
    const sent = JSON.parse(
      fake.stdinChunks().toString('utf8').split('\r\n\r\n')[1] ?? '{}',
    );
    fake.stdoutPush(
      frame({
        seq: 100,
        type: 'response',
        request_seq: sent.seq,
        command: 'initialize',
        success: true,
        body: { ok: true },
      }),
    );
    await expect(p).resolves.toEqual({ ok: true });
    client.close();
  });

  it('parses two back-to-back messages in one buffer', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);

    const events: DapEvent[] = [];
    client.on('event', (ev: DapEvent) => events.push(ev));

    const buf = Buffer.concat([
      frame({
        seq: 1,
        type: 'event',
        event: 'initialized',
        body: {},
      }),
      frame({
        seq: 2,
        type: 'event',
        event: 'stopped',
        body: { reason: 'breakpoint', threadId: 1 },
      }),
    ]);
    fake.stdoutPush(buf);
    await new Promise((r) => setImmediate(r));
    expect(events).toHaveLength(2);
    expect(events[0]!.event).toBe('initialized');
    expect(events[1]!.event).toBe('stopped');
    expect(events[1]!.body).toMatchObject({ reason: 'breakpoint' });
    client.close();
  });

  it('handles a message split across two reads (chunk boundary inside body)', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const events: DapEvent[] = [];
    client.on('event', (ev: DapEvent) => events.push(ev));

    const full = frame({
      seq: 1,
      type: 'event',
      event: 'output',
      body: { category: 'console', output: 'hi\n' },
    });
    // split right in the middle of the body
    const split = Math.floor(full.length / 2);
    fake.stdoutPush(full.subarray(0, split));
    await new Promise((r) => setImmediate(r));
    expect(events).toHaveLength(0);
    fake.stdoutPush(full.subarray(split));
    await new Promise((r) => setImmediate(r));
    expect(events).toHaveLength(1);
    expect(events[0]!.event).toBe('output');
    client.close();
  });

  it('handles a chunk boundary inside the header', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const events: DapEvent[] = [];
    client.on('event', (ev: DapEvent) => events.push(ev));

    const full = frame({ seq: 1, type: 'event', event: 'foo', body: {} });
    fake.stdoutPush(full.subarray(0, 5)); // mid-header
    await new Promise((r) => setImmediate(r));
    expect(events).toHaveLength(0);
    fake.stdoutPush(full.subarray(5));
    await new Promise((r) => setImmediate(r));
    expect(events).toHaveLength(1);
    client.close();
  });

  it('rejects when Content-Length header is missing', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const errSpy = vi.fn();
    client.on('error', errSpy);
    const p = client.request('foo', {});
    fake.stdoutPush(Buffer.from('Garbage: nope\r\n\r\nignored'));
    await expect(p).rejects.toThrow(/Content-Length/);
    expect(errSpy).toHaveBeenCalled();
    client.close();
  });

  it('rejects pending requests when the child exits before responding', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const exitSpy = vi.fn();
    client.on('exit', exitSpy);
    const p = client.request('initialize', {});
    fake.emitExit();
    await expect(p).rejects.toThrow(/exited/);
    expect(exitSpy).toHaveBeenCalled();
  });

  it('rejects with the adapter message when success=false', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const p = client.request('launch', {});
    await new Promise((r) => setImmediate(r));
    const sent = JSON.parse(
      fake.stdinChunks().toString('utf8').split('\r\n\r\n')[1] ?? '{}',
    );
    fake.stdoutPush(
      frame({
        seq: 5,
        type: 'response',
        request_seq: sent.seq,
        command: 'launch',
        success: false,
        message: 'no such program',
      }),
    );
    await expect(p).rejects.toThrow(/no such program/);
    client.close();
  });

  it('sends Content-Length framed messages on stdin', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const pending = client.request('initialize', { foo: 'bar' }).catch(() => {});
    await new Promise((r) => setImmediate(r));
    const text = fake.stdinChunks().toString('utf8');
    expect(text).toMatch(/^Content-Length: \d+\r\n\r\n/);
    const [, body] = text.split('\r\n\r\n');
    const parsed = JSON.parse(body!);
    expect(parsed.command).toBe('initialize');
    expect(parsed.type).toBe('request');
    expect(parsed.arguments).toEqual({ foo: 'bar' });
    client.close();
    await pending;
  });

  it('rejects requests after close()', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    client.close();
    await expect(client.request('initialize', {})).rejects.toThrow(/closed/);
  });

  it('times out a request that never gets a response', async () => {
    const fake = makeFakeChild();
    const client = new DapClient(fake.child);
    const p = client.request('initialize', {}, 20);
    await expect(p).rejects.toThrow(/timed out/);
    client.close();
  });
});
