import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, isAbsolute, join, resolve as resolvePath } from 'node:path';
import { logger, errToLog } from '../infrastructure/logging/Logger.js';
import { NetcoredbgAdapter } from '../debug/adapters/NetcoredbgAdapter.js';
import type { DapClient, DapEvent } from '../debug/adapters/DapClient.js';

const log = logger.child({ component: 'DebuggerService' });

export type DebugSessionState =
  | 'launching'
  | 'ready'
  | 'stopped'
  | 'running'
  | 'terminated';

export interface DebugBreakpoint {
  id: number;
  line: number;
  condition?: string | undefined;
}

export interface DebugSession {
  id: string;
  client: DapClient;
  configurationDone: boolean;
  state: DebugSessionState;
  lastStopped?: { reason: string; threadId?: number; description?: string };
  breakpoints: Map<string, DebugBreakpoint[]>;
  projectDir: string;
  programPath: string;
}

export interface SnapshotFrame {
  frame: number;
  file: string | null;
  line: number | null;
  method: string;
  sourceSnippet: string[] | null;
  locals: Record<string, string>;
}

export interface SnapshotPayload {
  stoppedReason: string;
  thread: { id: number; name: string };
  stack: SnapshotFrame[];
  exception: { type: string; message: string } | null;
  breakpoints: Array<{ file: string; line: number }>;
}

export interface DebugStartOptions {
  project: string;
  configuration?: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SnapshotOptions {
  sessionId: string;
  maxStackFrames?: number;
  maxLocalsPerFrame?: number;
  sourceContextLines?: number;
}

const DEFAULT_MAX_FRAMES = 10;
const DEFAULT_MAX_LOCALS = 20;
const DEFAULT_SOURCE_CTX = 5;

interface DapVariable {
  name: string;
  value: string;
  type?: string;
  variablesReference?: number;
}

interface DapStackFrame {
  id: number;
  name: string;
  source?: { path?: string; name?: string };
  line?: number;
  column?: number;
}

interface DapScope {
  name: string;
  variablesReference: number;
  expensive?: boolean;
}

interface DapThread {
  id: number;
  name: string;
}

/**
 * Top-level orchestrator for debug sessions. Holds at most one session at a
 * time (D-1 MVP scope — multi-session is D-2).
 */
export class DebuggerService {
  private session: DebugSession | null = null;

  /**
   * Resolve the dll produced by `dotnet build` for an SDK-style project.
   *
   * Convention:
   *   `<projectDir>/bin/<configuration>/<tfm>/<projectName>.dll`
   *
   * If the project file is a directory (caller passed a folder), we look for
   * exactly one `.csproj` inside it. We pick the first matching tfm folder
   * we find — D-1 MVP doesn't try to be clever about multi-targeting.
   */
  private resolveProgramPath(projectPath: string, configuration: string): {
    programPath: string;
    projectDir: string;
    projectName: string;
  } {
    const abs = isAbsolute(projectPath)
      ? projectPath
      : resolvePath(process.cwd(), projectPath);
    let csprojPath = abs;
    let projectDir: string;
    if (existsSync(abs) && statSync(abs).isDirectory()) {
      const found = readdirSync(abs).filter((f) => f.toLowerCase().endsWith('.csproj'));
      if (found.length === 0) {
        throw new Error(
          `No .csproj found under ${abs}. Pass an explicit .csproj path.`,
        );
      }
      if (found.length > 1) {
        throw new Error(
          `Multiple .csproj files in ${abs}: ${found.join(', ')}. Pass an explicit .csproj path.`,
        );
      }
      csprojPath = join(abs, found[0]!);
      projectDir = abs;
    } else if (existsSync(abs) && abs.toLowerCase().endsWith('.csproj')) {
      projectDir = abs.slice(0, abs.length - basename(abs).length).replace(/[\\/]+$/, '');
      if (projectDir.length === 0) projectDir = process.cwd();
    } else {
      throw new Error(`Project path not found or not a .csproj: ${abs}`);
    }

    const projectName = basename(csprojPath, extname(csprojPath));
    const binDir = join(projectDir, 'bin', configuration);
    if (!existsSync(binDir)) {
      throw new Error(
        `Build artifact directory not found: ${binDir}. Build the project first (lazybuilder build / dotnet build).`,
      );
    }
    let tfmDirs: string[];
    try {
      tfmDirs = readdirSync(binDir).filter((f) => {
        try {
          return statSync(join(binDir, f)).isDirectory();
        } catch {
          return false;
        }
      });
    } catch {
      tfmDirs = [];
    }
    if (tfmDirs.length === 0) {
      throw new Error(
        `No TFM output folder under ${binDir}. Build the project first (lazybuilder build / dotnet build).`,
      );
    }
    // Prefer net*.0 (modern .NET); fall back to first.
    const preferred =
      tfmDirs.find((d) => /^net\d+\.\d+/.test(d)) ?? tfmDirs[0]!;
    const programPath = join(binDir, preferred, `${projectName}.dll`);
    if (!existsSync(programPath)) {
      throw new Error(
        `Build artifact not found: ${programPath}. Build the project first (lazybuilder build / dotnet build).`,
      );
    }
    return { programPath, projectDir, projectName };
  }

  /**
   * Spawn netcoredbg, perform the DAP handshake, and stash the session.
   *
   * Throws (rejects) with a clear message if:
   *   - netcoredbg is not installed (PATH or cache)
   *   - the project's build output isn't on disk yet
   *   - a session is already running (D-1: single-session)
   */
  async start(opts: DebugStartOptions): Promise<{ sessionId: string }> {
    if (this.session) {
      throw new Error(
        `A debug session is already active (id=${this.session.id}). Terminate it before starting another.`,
      );
    }
    const configuration = opts.configuration ?? 'Debug';
    const exe = await NetcoredbgAdapter.resolveExecutable();
    if (!exe) {
      throw new Error(
        'netcoredbg not found. Install it (winget install Samsung.Netcoredbg) or place it under ~/.lazybuilder/cache/netcoredbg/.',
      );
    }
    const { programPath, projectDir } = this.resolveProgramPath(
      opts.project,
      configuration,
    );

    const adapter = new NetcoredbgAdapter(exe);
    const client = await adapter.spawn();
    const sessionId = randomUUID();
    const session: DebugSession = {
      id: sessionId,
      client,
      configurationDone: false,
      state: 'launching',
      breakpoints: new Map(),
      projectDir,
      programPath,
    };
    this.session = session;

    client.on('event', (ev: DapEvent) => this.onAdapterEvent(ev));
    client.on('exit', () => {
      log.debug('DAP child exited', { sessionId });
      if (this.session?.id === sessionId) {
        this.session.state = 'terminated';
        this.session = null;
      }
    });

    try {
      await client.request('initialize', {
        clientID: 'lazybuilder',
        clientName: 'LazyBuilder',
        adapterID: 'coreclr',
        pathFormat: 'path',
        linesStartAt1: true,
        columnsStartAt1: true,
        supportsVariableType: true,
      });
      await client.request('launch', {
        program: programPath,
        type: 'coreclr',
        request: 'launch',
        cwd: projectDir,
        args: opts.args ?? [],
        env: opts.env ?? {},
        stopAtEntry: false,
        justMyCode: true,
      });
      session.state = 'running';
    } catch (err) {
      log.warn('debug.start handshake failed', errToLog(err));
      try {
        client.close();
      } catch {
        /* ignore */
      }
      this.session = null;
      throw err;
    }

    return { sessionId };
  }

  /**
   * Replace breakpoints for a single file and return the id assigned by the
   * adapter for the newly added line.
   *
   * DAP requires sending the *full* set per file, so we maintain a per-file
   * cache and resend it on every call.
   */
  async setBreakpoint(opts: {
    sessionId: string;
    file: string;
    line: number;
    condition?: string;
  }): Promise<{ breakpointId: number }> {
    const session = this.requireSession(opts.sessionId);
    const file = isAbsolute(opts.file)
      ? opts.file
      : resolvePath(session.projectDir, opts.file);
    const list = session.breakpoints.get(file) ?? [];
    list.push({ id: -1, line: opts.line, condition: opts.condition });
    session.breakpoints.set(file, list);

    const body = await session.client.request<{
      breakpoints: Array<{ id?: number; verified?: boolean; line?: number }>;
    }>('setBreakpoints', {
      source: { path: file, name: basename(file) },
      breakpoints: list.map((bp) => ({
        line: bp.line,
        condition: bp.condition,
      })),
      sourceModified: false,
    });
    const responses = body?.breakpoints ?? [];
    let lastId = -1;
    for (let i = 0; i < list.length; i++) {
      const r = responses[i];
      if (r && typeof r.id === 'number') {
        list[i]!.id = r.id;
        lastId = r.id;
      }
    }
    if (!session.configurationDone) {
      // netcoredbg expects configurationDone after the first breakpoint set.
      try {
        await session.client.request('configurationDone', {});
        session.configurationDone = true;
      } catch (err) {
        log.debug('configurationDone not accepted', errToLog(err));
      }
    }
    return { breakpointId: lastId };
  }

  async continue(opts: {
    sessionId: string;
    threadId?: number;
  }): Promise<{ ok: boolean }> {
    const session = this.requireSession(opts.sessionId);
    const threadId = opts.threadId ?? session.lastStopped?.threadId ?? 1;
    await session.client.request('continue', { threadId });
    session.state = 'running';
    return { ok: true };
  }

  async stepOver(opts: {
    sessionId: string;
    threadId?: number;
  }): Promise<{ ok: boolean }> {
    const session = this.requireSession(opts.sessionId);
    const threadId = opts.threadId ?? session.lastStopped?.threadId ?? 1;
    await session.client.request('next', { threadId });
    session.state = 'running';
    return { ok: true };
  }

  async stepIn(opts: {
    sessionId: string;
    threadId?: number;
  }): Promise<{ ok: boolean }> {
    const session = this.requireSession(opts.sessionId);
    const threadId = opts.threadId ?? session.lastStopped?.threadId ?? 1;
    await session.client.request('stepIn', { threadId });
    session.state = 'running';
    return { ok: true };
  }

  async stepOut(opts: {
    sessionId: string;
    threadId?: number;
  }): Promise<{ ok: boolean }> {
    const session = this.requireSession(opts.sessionId);
    const threadId = opts.threadId ?? session.lastStopped?.threadId ?? 1;
    await session.client.request('stepOut', { threadId });
    session.state = 'running';
    return { ok: true };
  }

  async pause(opts: {
    sessionId: string;
    threadId?: number;
  }): Promise<{ ok: boolean }> {
    const session = this.requireSession(opts.sessionId);
    const threadId = opts.threadId ?? session.lastStopped?.threadId ?? 1;
    await session.client.request('pause', { threadId });
    return { ok: true };
  }

  async evaluate(opts: {
    sessionId: string;
    expression: string;
    frameId?: number;
  }): Promise<{ value: string; type?: string }> {
    const session = this.requireSession(opts.sessionId);
    const body = await session.client.request<{
      result: string;
      type?: string;
    }>('evaluate', {
      expression: opts.expression,
      frameId: opts.frameId,
      context: 'repl',
    });
    return body?.type
      ? { value: body.result, type: body.type }
      : { value: body?.result ?? '' };
  }

  async terminate(opts: { sessionId: string }): Promise<{ ok: boolean }> {
    const session = this.requireSession(opts.sessionId);
    try {
      await session.client.request('disconnect', {
        terminateDebuggee: true,
      }, 5_000);
    } catch (err) {
      log.debug('disconnect failed (ignoring)', errToLog(err));
    }
    try {
      session.client.close();
    } catch {
      /* ignore */
    }
    session.state = 'terminated';
    if (this.session?.id === session.id) {
      this.session = null;
    }
    return { ok: true };
  }

  /**
   * High-level "show me the current state" primitive.
   *
   * Fetches threads → stackTrace → scopes → variables for each frame, plus a
   * source snippet around each frame's line. Designed to give an LLM enough
   * context to reason about a stop in a single round-trip.
   */
  async snapshot(opts: SnapshotOptions): Promise<SnapshotPayload> {
    const session = this.requireSession(opts.sessionId);
    if (session.state !== 'stopped') {
      throw new Error(
        `Session ${opts.sessionId} is not stopped (state=${session.state}). Set a breakpoint and continue.`,
      );
    }
    const maxFrames = opts.maxStackFrames ?? DEFAULT_MAX_FRAMES;
    const maxLocals = opts.maxLocalsPerFrame ?? DEFAULT_MAX_LOCALS;
    const ctx = opts.sourceContextLines ?? DEFAULT_SOURCE_CTX;

    const threadsBody = await session.client.request<{ threads: DapThread[] }>(
      'threads',
      {},
    );
    const threads = threadsBody?.threads ?? [];
    const desiredId = session.lastStopped?.threadId;
    const thread =
      (desiredId != null ? threads.find((t) => t.id === desiredId) : undefined)
      ?? threads[0]
      ?? { id: desiredId ?? 1, name: 'unknown' };

    const stackBody = await session.client.request<{
      stackFrames: DapStackFrame[];
    }>('stackTrace', {
      threadId: thread.id,
      startFrame: 0,
      levels: maxFrames,
    });
    const frames = stackBody?.stackFrames ?? [];

    const stack: SnapshotFrame[] = [];
    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]!;
      const file = f.source?.path ?? null;
      const line = typeof f.line === 'number' ? f.line : null;
      const sourceSnippet =
        file && line != null ? readSourceSnippet(file, line, ctx) : null;
      const locals = await this.collectLocals(session, f.id, maxLocals);
      stack.push({
        frame: i,
        file,
        line,
        method: f.name,
        sourceSnippet,
        locals,
      });
    }

    const breakpoints: Array<{ file: string; line: number }> = [];
    for (const [file, bps] of session.breakpoints.entries()) {
      for (const bp of bps) breakpoints.push({ file, line: bp.line });
    }

    return {
      stoppedReason: session.lastStopped?.reason ?? 'unknown',
      thread: { id: thread.id, name: thread.name },
      stack,
      exception:
        session.lastStopped?.reason === 'exception'
          ? {
            type: 'unknown',
            message: session.lastStopped?.description ?? '',
          }
          : null,
      breakpoints,
    };
  }

  /** For tests / introspection. */
  getSession(): DebugSession | null {
    return this.session;
  }

  /** TEST ONLY — allow specs to wipe state between cases. */
  _resetForTests(): void {
    if (this.session) {
      try {
        this.session.client.close();
      } catch {
        /* ignore */
      }
    }
    this.session = null;
  }

  private async collectLocals(
    session: DebugSession,
    frameId: number,
    maxLocals: number,
  ): Promise<Record<string, string>> {
    const locals: Record<string, string> = {};
    let scopes: DapScope[] = [];
    try {
      const body = await session.client.request<{ scopes: DapScope[] }>(
        'scopes',
        { frameId },
      );
      scopes = body?.scopes ?? [];
    } catch (err) {
      log.debug('scopes request failed', errToLog(err));
      return locals;
    }
    for (const scope of scopes) {
      if (Object.keys(locals).length >= maxLocals) break;
      // Skip `expensive` scopes (e.g. globals) per DAP spec.
      if (scope.expensive) continue;
      try {
        const body = await session.client.request<{
          variables: DapVariable[];
        }>('variables', { variablesReference: scope.variablesReference });
        const vars = body?.variables ?? [];
        for (const v of vars) {
          if (Object.keys(locals).length >= maxLocals) break;
          locals[v.name] = v.value ?? '';
        }
      } catch (err) {
        log.debug('variables request failed', errToLog(err));
      }
    }
    return locals;
  }

  private onAdapterEvent(ev: DapEvent): void {
    const session = this.session;
    if (!session) return;
    switch (ev.event) {
      case 'stopped': {
        const body = (ev.body ?? {}) as {
          reason?: string;
          threadId?: number;
          description?: string;
        };
        session.state = 'stopped';
        session.lastStopped = {
          reason: body.reason ?? 'unknown',
          threadId: body.threadId,
          description: body.description,
        };
        break;
      }
      case 'continued': {
        session.state = 'running';
        break;
      }
      case 'terminated':
      case 'exited': {
        session.state = 'terminated';
        break;
      }
      case 'initialized': {
        session.state = 'ready';
        break;
      }
      default:
        break;
    }
  }

  private requireSession(sessionId: string): DebugSession {
    if (!this.session) {
      throw new Error(`No active debug session. Call debug.start first.`);
    }
    if (this.session.id !== sessionId) {
      throw new Error(
        `Session id mismatch (active=${this.session.id}, requested=${sessionId}).`,
      );
    }
    return this.session;
  }
}

function readSourceSnippet(
  file: string,
  line: number,
  ctx: number,
): string[] | null {
  try {
    if (!existsSync(file)) return null;
    const text = readFileSync(file, 'utf8');
    const lines = text.split(/\r?\n/);
    const start = Math.max(0, line - ctx - 1);
    const end = Math.min(lines.length, line + ctx);
    return lines.slice(start, end);
  } catch {
    return null;
  }
}
