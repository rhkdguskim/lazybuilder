import { logger, errToLog } from '../infrastructure/logging/Logger.js';
import {
  DebuggerService,
  type SnapshotPayload,
} from '../application/DebuggerService.js';

const log = logger.child({ component: 'debugCli' });

const SCHEMA = 'lazybuilder/v1';

function envelope(kind: string, data: unknown): string {
  return JSON.stringify({ schema: SCHEMA, kind, data });
}

interface StartFlags {
  project: string | null;
  configuration: string;
  args: string[];
}

function parseStartFlags(argv: string[]): StartFlags {
  const flags: StartFlags = {
    project: null,
    configuration: 'Debug',
    args: [],
  };
  for (const a of argv) {
    if (a.startsWith('--config=')) {
      flags.configuration = a.slice('--config='.length);
    } else if (a.startsWith('--args=')) {
      const raw = a.slice('--args='.length);
      flags.args = raw.length > 0 ? raw.split(/\s+/) : [];
    } else if (!a.startsWith('--') && flags.project === null) {
      flags.project = a;
    }
  }
  return flags;
}

/**
 * `lazybuilder debug start <projectPath> [--config=Debug] [--args="..."]`
 *
 * Runs the *full* lifecycle in one process:
 *   start → wait briefly for the program to either stop on a breakpoint or
 *   terminate → emit a snapshot if it stopped → terminate.
 *
 * For richer multi-step workflows (set breakpoints across files, evaluate
 * expressions, step through code) use the MCP `debug.*` tools — those keep
 * the session alive in-process across calls. The CLI is intentionally
 * one-shot for human verification only.
 */
async function runStart(argv: string[]): Promise<number> {
  const flags = parseStartFlags(argv);
  if (!flags.project) {
    process.stderr.write(
      '[lazybuilder debug] usage: lazybuilder debug start <projectPath> [--config=Debug] [--args="..."]\n',
    );
    return 2;
  }

  const service = new DebuggerService();
  let sessionId: string | null = null;
  try {
    const started = await service.start({
      project: flags.project,
      configuration: flags.configuration,
      args: flags.args,
    });
    sessionId = started.sessionId;

    // Print the session id immediately so the human knows we got past
    // initialize/launch. This is a separate envelope from the final outcome.
    process.stdout.write(
      envelope('DebugSession', { ok: true, sessionId, project: flags.project }) + '\n',
    );

    const outcome = await waitForStopOrTerminate(service, sessionId);
    let snapshot: SnapshotPayload | null = null;
    if (outcome === 'stopped') {
      try {
        snapshot = await service.snapshot({ sessionId });
      } catch (err) {
        log.warn('snapshot failed', errToLog(err));
      }
    }

    await service.terminate({ sessionId }).catch(() => {});

    process.stdout.write(
      envelope('DebugRun', {
        ok: true,
        sessionId,
        outcome,
        snapshot,
      }) + '\n',
    );
    return 0;
  } catch (err) {
    log.warn('debug start failed', errToLog(err));
    if (sessionId) {
      try {
        await service.terminate({ sessionId });
      } catch {
        /* ignore */
      }
    }
    process.stdout.write(
      envelope('DebugRun', {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      }) + '\n',
    );
    return 1;
  }
}

async function waitForStopOrTerminate(
  service: DebuggerService,
  _sessionId: string,
  timeoutMs = 30_000,
): Promise<'stopped' | 'terminated' | 'timeout'> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const session = service.getSession();
    if (!session) return 'terminated';
    if (session.state === 'stopped') return 'stopped';
    if (session.state === 'terminated') return 'terminated';
    await new Promise((r) => setTimeout(r, 100));
  }
  return 'timeout';
}

function printHelp(): void {
  process.stdout.write(`lazybuilder debug — Debugger MVP (D-1)

Usage:
  lazybuilder debug start <projectPath> [--config=Debug] [--args="..."]

Notes:
  - The CLI lifecycle is one-shot: start → snapshot if stopped → terminate.
  - For multi-step workflows (set breakpoints across files, step, evaluate),
    use the MCP \`debug.*\` tools — they keep the session alive between calls.
  - Requires netcoredbg on PATH or in ~/.lazybuilder/cache/netcoredbg/.
  - Requires the project to be already built (artifacts under bin/<config>/<tfm>/).
`);
}

/**
 * Entry point dispatched by `bin/lazybuilder.js debug ...`.
 */
export async function runDebugCli(argv: string[]): Promise<number> {
  const sub = argv[0];
  const rest = argv.slice(1);
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    printHelp();
    return 0;
  }
  switch (sub) {
    case 'start':
      return runStart(rest);
    default:
      process.stderr.write(
        `[lazybuilder debug] unknown subcommand '${sub}'. Try 'lazybuilder debug --help'.\n`,
      );
      return 2;
  }
}
