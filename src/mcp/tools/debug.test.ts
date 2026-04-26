import { beforeEach, describe, expect, it, vi } from 'vitest';

const startMock = vi.fn();
const setBreakpointMock = vi.fn();
const continueMock = vi.fn();
const stepOverMock = vi.fn();
const stepInMock = vi.fn();
const stepOutMock = vi.fn();
const evaluateMock = vi.fn();
const snapshotMock = vi.fn();
const terminateMock = vi.fn();

vi.mock('../../application/DebuggerService.js', () => ({
  DebuggerService: class {
    start = startMock;
    setBreakpoint = setBreakpointMock;
    continue = continueMock;
    stepOver = stepOverMock;
    stepIn = stepInMock;
    stepOut = stepOutMock;
    evaluate = evaluateMock;
    snapshot = snapshotMock;
    terminate = terminateMock;
    getSession() {
      return null;
    }
    _resetForTests() {}
  },
}));

const { debugTools } = await import('./debug.js');

interface Envelope<K extends string, D> {
  schema: 'lazybuilder/v1';
  kind: K;
  data: D;
}
function parseEnvelope<K extends string = string, D = unknown>(text: string) {
  return JSON.parse(text) as Envelope<K, D>;
}

function tool(name: string) {
  const t = debugTools.find((x) => x.name === name);
  if (!t) throw new Error(`tool '${name}' missing from debugTools`);
  return t;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('debug tools registry', () => {
  it('exports the 9 expected MCP tools', () => {
    const names = debugTools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'debug.continue',
        'debug.evaluate',
        'debug.set_breakpoint',
        'debug.snapshot',
        'debug.start',
        'debug.step_in',
        'debug.step_out',
        'debug.step_over',
        'debug.terminate',
      ].sort(),
    );
  });

  it('every tool declares an object input schema with a non-empty description', () => {
    for (const t of debugTools) {
      expect(t.inputSchema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(0);
    }
  });
});

describe('debug.start tool', () => {
  it('declares project as required', () => {
    expect(tool('debug.start').inputSchema.required).toContain('project');
  });

  it('returns DebugSession envelope on success', async () => {
    startMock.mockResolvedValue({ sessionId: 'abc-123' });
    const r = await tool('debug.start').handler({ project: '/x/Foo.csproj' });
    const env = parseEnvelope<'DebugSession', { ok: boolean; sessionId: string }>(
      r.content[0]!.text,
    );
    expect(env.kind).toBe('DebugSession');
    expect(env.data.sessionId).toBe('abc-123');
    expect(startMock).toHaveBeenCalledWith({
      project: '/x/Foo.csproj',
      configuration: undefined,
      args: undefined,
      env: undefined,
    });
  });

  it('returns isError when project is missing', async () => {
    const r = await tool('debug.start').handler({});
    expect(r.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(r.content[0]!.text);
    expect(env.data.error).toContain('project');
  });

  it('forwards configuration / args / env to the service', async () => {
    startMock.mockResolvedValue({ sessionId: 'x' });
    await tool('debug.start').handler({
      project: '/p/A.csproj',
      configuration: 'Release',
      args: ['--filter', 'Foo'],
      env: { FOO: 'BAR', NUM: 1 }, // NUM should be filtered out (not a string)
    });
    expect(startMock).toHaveBeenCalledWith({
      project: '/p/A.csproj',
      configuration: 'Release',
      args: ['--filter', 'Foo'],
      env: { FOO: 'BAR' },
    });
  });

  it('wraps service errors as errorResult', async () => {
    startMock.mockRejectedValue(new Error('netcoredbg not found'));
    const r = await tool('debug.start').handler({ project: '/p/A.csproj' });
    expect(r.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(r.content[0]!.text);
    expect(env.data.error).toContain('netcoredbg');
  });
});

describe('debug.set_breakpoint tool', () => {
  it('requires sessionId, file, line', () => {
    const required = tool('debug.set_breakpoint').inputSchema.required ?? [];
    expect(required).toEqual(
      expect.arrayContaining(['sessionId', 'file', 'line']),
    );
  });

  it('returns errorResult when line is not a number', async () => {
    const r = await tool('debug.set_breakpoint').handler({
      sessionId: 's',
      file: 'F.cs',
      line: 'forty-two',
    });
    expect(r.isError).toBe(true);
  });

  it('returns DebugBreakpoint envelope on success', async () => {
    setBreakpointMock.mockResolvedValue({ breakpointId: 7 });
    const r = await tool('debug.set_breakpoint').handler({
      sessionId: 's',
      file: 'F.cs',
      line: 42,
      condition: 'i > 0',
    });
    const env = parseEnvelope<'DebugBreakpoint', { breakpointId: number }>(
      r.content[0]!.text,
    );
    expect(env.kind).toBe('DebugBreakpoint');
    expect(env.data.breakpointId).toBe(7);
    expect(setBreakpointMock).toHaveBeenCalledWith({
      sessionId: 's',
      file: 'F.cs',
      line: 42,
      condition: 'i > 0',
    });
  });
});

describe('debug step/continue tools', () => {
  it.each([
    ['debug.continue', continueMock],
    ['debug.step_over', stepOverMock],
    ['debug.step_in', stepInMock],
    ['debug.step_out', stepOutMock],
  ] as const)('%s forwards sessionId/threadId', async (name, mock) => {
    mock.mockResolvedValue({ ok: true });
    const r = await tool(name).handler({ sessionId: 's1', threadId: 3 });
    const env = parseEnvelope<'DebugStep', { ok: boolean }>(r.content[0]!.text);
    expect(env.kind).toBe('DebugStep');
    expect(env.data.ok).toBe(true);
    expect(mock).toHaveBeenCalledWith({ sessionId: 's1', threadId: 3 });
  });

  it('debug.continue returns errorResult when service throws', async () => {
    continueMock.mockRejectedValue(new Error('not stopped'));
    const r = await tool('debug.continue').handler({ sessionId: 's1' });
    expect(r.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(r.content[0]!.text);
    expect(env.data.error).toContain('not stopped');
  });

  it('debug.step_over rejects when sessionId missing', async () => {
    const r = await tool('debug.step_over').handler({});
    expect(r.isError).toBe(true);
  });
});

describe('debug.evaluate tool', () => {
  it('requires sessionId and expression', () => {
    const required = tool('debug.evaluate').inputSchema.required ?? [];
    expect(required).toEqual(
      expect.arrayContaining(['sessionId', 'expression']),
    );
  });

  it('returns DebugEvaluate envelope', async () => {
    evaluateMock.mockResolvedValue({ value: '42', type: 'int' });
    const r = await tool('debug.evaluate').handler({
      sessionId: 's',
      expression: 'x + 1',
      frameId: 12,
    });
    const env = parseEnvelope<'DebugEvaluate', { value: string; type: string }>(
      r.content[0]!.text,
    );
    expect(env.kind).toBe('DebugEvaluate');
    expect(env.data.value).toBe('42');
    expect(evaluateMock).toHaveBeenCalledWith({
      sessionId: 's',
      expression: 'x + 1',
      frameId: 12,
    });
  });
});

describe('debug.snapshot tool', () => {
  it('returns DebugSnapshot envelope', async () => {
    snapshotMock.mockResolvedValue({
      stoppedReason: 'breakpoint',
      thread: { id: 1, name: 'Main' },
      stack: [],
      exception: null,
      breakpoints: [],
    });
    const r = await tool('debug.snapshot').handler({ sessionId: 's' });
    const env = parseEnvelope<
      'DebugSnapshot',
      { snapshot: { stoppedReason: string } }
    >(r.content[0]!.text);
    expect(env.kind).toBe('DebugSnapshot');
    expect(env.data.snapshot.stoppedReason).toBe('breakpoint');
  });

  it('returns isError when service rejects (e.g. no session)', async () => {
    snapshotMock.mockRejectedValue(new Error('No active debug session.'));
    const r = await tool('debug.snapshot').handler({ sessionId: 'nope' });
    expect(r.isError).toBe(true);
    const env = parseEnvelope<'Error', { error: string }>(r.content[0]!.text);
    expect(env.data.error).toContain('No active');
  });
});

describe('debug.terminate tool', () => {
  it('returns DebugStep envelope on success', async () => {
    terminateMock.mockResolvedValue({ ok: true });
    const r = await tool('debug.terminate').handler({ sessionId: 's' });
    const env = parseEnvelope<'DebugStep', { ok: boolean }>(r.content[0]!.text);
    expect(env.kind).toBe('DebugStep');
    expect(env.data.ok).toBe(true);
  });

  it('returns isError when sessionId missing', async () => {
    const r = await tool('debug.terminate').handler({});
    expect(r.isError).toBe(true);
  });
});
