import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const resolveExecutableMock = vi.fn<() => Promise<string | null>>();
const spawnMock = vi.fn<() => Promise<MockDapClient>>();

class MockDapClient extends EventEmitter {
  closed = false;
  requests: Array<{ command: string; args: unknown }> = [];
  responses = new Map<string, unknown>();
  shouldFail = new Set<string>();

  request<T>(command: string, args?: unknown): Promise<T> {
    this.requests.push({ command, args });
    if (this.shouldFail.has(command)) {
      return Promise.reject(new Error(`mock-${command}-fail`));
    }
    const v = this.responses.get(command);
    return Promise.resolve(v as T);
  }
  close(): void {
    this.closed = true;
  }
  isClosed(): boolean {
    return this.closed;
  }
}

vi.mock('../debug/adapters/NetcoredbgAdapter.js', () => ({
  NetcoredbgAdapter: class {
    static resolveExecutable() {
      return resolveExecutableMock();
    }
    constructor(public readonly _path: string) {}
    spawn() {
      return spawnMock();
    }
  },
}));

const { DebuggerService } = await import('./DebuggerService.js');

let tmpRoot: string;
function makeProjectFixture(opts: { withBuild: boolean; tfm?: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'lazybuilder-debug-'));
  const csproj = join(dir, 'Sample.csproj');
  writeFileSync(csproj, '<Project Sdk="Microsoft.NET.Sdk"></Project>');
  if (opts.withBuild) {
    const tfm = opts.tfm ?? 'net8.0';
    const out = join(dir, 'bin', 'Debug', tfm);
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'Sample.dll'), '');
    writeFileSync(join(out, 'Sample.cs'), 'class A {\n  void M() {}\n}\n');
  }
  return { dir, csproj };
}

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), 'lazybuilder-debug-root-'));
  resolveExecutableMock.mockReset();
  spawnMock.mockReset();
});

afterEach(() => {
  try {
    rmSync(tmpRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

describe('DebuggerService.start error paths', () => {
  it('rejects with a clear message when netcoredbg is not found', async () => {
    resolveExecutableMock.mockResolvedValue(null);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    await expect(svc.start({ project: fixture.csproj })).rejects.toThrow(
      /netcoredbg not found/,
    );
  });

  it('rejects with "Build the project first" when no bin/<config>/<tfm> dll', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const fixture = makeProjectFixture({ withBuild: false });
    const svc = new DebuggerService();
    await expect(svc.start({ project: fixture.csproj })).rejects.toThrow(
      /[Bb]uild the project first/,
    );
  });

  it('rejects when the project file does not exist', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const svc = new DebuggerService();
    await expect(
      svc.start({ project: join(tmpRoot, 'missing.csproj') }),
    ).rejects.toThrow(/not found/i);
  });

  it('rejects when more than one .csproj is in a passed directory', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const dir = mkdtempSync(join(tmpdir(), 'lazybuilder-multi-'));
    writeFileSync(join(dir, 'A.csproj'), '');
    writeFileSync(join(dir, 'B.csproj'), '');
    const svc = new DebuggerService();
    await expect(svc.start({ project: dir })).rejects.toThrow(/Multiple/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('DebuggerService happy-path lifecycle (mocked DAP)', () => {
  it('returns a sessionId after a successful initialize+launch', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    spawnMock.mockResolvedValue(client);

    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    const result = await svc.start({ project: fixture.csproj });
    expect(result.sessionId).toMatch(/[0-9a-f-]{36}/);
    expect(client.requests.map((r) => r.command)).toEqual([
      'initialize',
      'launch',
    ]);
    expect(svc.getSession()?.id).toBe(result.sessionId);
    expect(svc.getSession()?.state).toBe('running');
    svc._resetForTests();
  });

  it('cleans up the session and rejects when launch fails', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.shouldFail.add('launch');
    spawnMock.mockResolvedValue(client);

    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    await expect(svc.start({ project: fixture.csproj })).rejects.toThrow(
      /mock-launch-fail/,
    );
    expect(svc.getSession()).toBeNull();
    expect(client.closed).toBe(true);
  });

  it('refuses a second concurrent start (single-session)', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    await svc.start({ project: fixture.csproj });
    await expect(svc.start({ project: fixture.csproj })).rejects.toThrow(
      /already active/,
    );
    svc._resetForTests();
  });

  it('setBreakpoint sends DAP setBreakpoints with the cumulative file list', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    client.responses.set('setBreakpoints', {
      breakpoints: [{ id: 1, verified: true, line: 42 }],
    });
    client.responses.set('configurationDone', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    const { sessionId } = await svc.start({ project: fixture.csproj });
    const result = await svc.setBreakpoint({
      sessionId,
      file: 'Sample.cs',
      line: 42,
    });
    expect(result.breakpointId).toBe(1);
    const bpReq = client.requests.find((r) => r.command === 'setBreakpoints');
    expect(bpReq).toBeDefined();
    const args = bpReq!.args as {
      breakpoints: Array<{ line: number }>;
      source: { path: string };
    };
    expect(args.breakpoints).toHaveLength(1);
    expect(args.breakpoints[0]!.line).toBe(42);
    expect(args.source.path).toContain('Sample.cs');
    svc._resetForTests();
  });

  it('continue resumes execution and updates session state', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    client.responses.set('continue', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    const { sessionId } = await svc.start({ project: fixture.csproj });
    // Pretend we got a stopped event first.
    svc.getSession()!.state = 'stopped';
    svc.getSession()!.lastStopped = { reason: 'breakpoint', threadId: 7 };
    const out = await svc.continue({ sessionId });
    expect(out.ok).toBe(true);
    expect(svc.getSession()?.state).toBe('running');
    const cont = client.requests.find((r) => r.command === 'continue');
    expect((cont!.args as { threadId: number }).threadId).toBe(7);
    svc._resetForTests();
  });

  it('terminate disconnects, closes the client, and clears the session', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    client.responses.set('disconnect', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    const { sessionId } = await svc.start({ project: fixture.csproj });
    await svc.terminate({ sessionId });
    expect(client.closed).toBe(true);
    expect(svc.getSession()).toBeNull();
  });
});

describe('DebuggerService.snapshot', () => {
  it('throws when there is no active session', async () => {
    const svc = new DebuggerService();
    await expect(svc.snapshot({ sessionId: 'whatever' })).rejects.toThrow(
      /No active debug session/,
    );
  });

  it('throws "Not stopped" when the session is running', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    const { sessionId } = await svc.start({ project: fixture.csproj });
    await expect(svc.snapshot({ sessionId })).rejects.toThrow(/not stopped/i);
    svc._resetForTests();
  });

  it('builds a SnapshotPayload from threads/stackTrace/scopes/variables', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    spawnMock.mockResolvedValue(client);

    const fixture = makeProjectFixture({ withBuild: true });
    const sourceFile = join(fixture.dir, 'bin', 'Debug', 'net8.0', 'Sample.cs');
    client.responses.set('threads', {
      threads: [{ id: 1, name: 'Main' }],
    });
    client.responses.set('stackTrace', {
      stackFrames: [
        {
          id: 1000,
          name: 'A.M',
          source: { path: sourceFile, name: 'Sample.cs' },
          line: 2,
          column: 1,
        },
      ],
    });
    client.responses.set('scopes', {
      scopes: [
        { name: 'Locals', variablesReference: 9, expensive: false },
        { name: 'Globals', variablesReference: 10, expensive: true },
      ],
    });
    client.responses.set('variables', {
      variables: [
        { name: 'x', value: '1', type: 'int' },
        { name: 'y', value: '"hi"', type: 'string' },
      ],
    });

    const svc = new DebuggerService();
    const { sessionId } = await svc.start({ project: fixture.csproj });
    const sess = svc.getSession()!;
    sess.state = 'stopped';
    sess.lastStopped = { reason: 'breakpoint', threadId: 1 };

    const snap = await svc.snapshot({ sessionId, sourceContextLines: 1 });
    expect(snap.stoppedReason).toBe('breakpoint');
    expect(snap.thread).toEqual({ id: 1, name: 'Main' });
    expect(snap.stack).toHaveLength(1);
    expect(snap.stack[0]!.method).toBe('A.M');
    expect(snap.stack[0]!.line).toBe(2);
    expect(snap.stack[0]!.locals).toEqual({ x: '1', y: '"hi"' });
    // 1 line of context around line 2 → roughly 3 lines from the file
    expect(snap.stack[0]!.sourceSnippet).not.toBeNull();
    expect(snap.exception).toBeNull();
    svc._resetForTests();
  });

  it('classifies stop reason "exception" into the exception field', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    client.responses.set('threads', { threads: [{ id: 1, name: 'Main' }] });
    client.responses.set('stackTrace', { stackFrames: [] });
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    const { sessionId } = await svc.start({ project: fixture.csproj });
    const sess = svc.getSession()!;
    sess.state = 'stopped';
    sess.lastStopped = {
      reason: 'exception',
      threadId: 1,
      description: 'NullReferenceException',
    };
    const snap = await svc.snapshot({ sessionId });
    expect(snap.exception).toMatchObject({
      message: 'NullReferenceException',
    });
    svc._resetForTests();
  });
});

describe('DebuggerService event handling', () => {
  it('updates session state on a "stopped" event', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    await svc.start({ project: fixture.csproj });
    expect(svc.getSession()?.state).toBe('running');
    client.emit('event', {
      event: 'stopped',
      body: { reason: 'breakpoint', threadId: 5 },
    });
    expect(svc.getSession()?.state).toBe('stopped');
    expect(svc.getSession()?.lastStopped?.threadId).toBe(5);
    svc._resetForTests();
  });

  it('clears the session when the adapter exits', async () => {
    resolveExecutableMock.mockResolvedValue('/fake/netcoredbg');
    const client = new MockDapClient();
    client.responses.set('initialize', {});
    client.responses.set('launch', {});
    spawnMock.mockResolvedValue(client);
    const fixture = makeProjectFixture({ withBuild: true });
    const svc = new DebuggerService();
    await svc.start({ project: fixture.csproj });
    client.emit('exit');
    expect(svc.getSession()).toBeNull();
  });
});
