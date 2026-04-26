import { mkdirSync, appendFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

/**
 * Lightweight structured logger.
 *
 * - Levels: trace < debug < info < warn < error < fatal < silent
 * - Configured via env:
 *     LAZYBUILDER_LOG_LEVEL  ─ trace|debug|info|warn|error|fatal|silent (default: info)
 *     LAZYBUILDER_LOG_FILE   ─ explicit file path (default: ~/.lazybuilder/logs/lazybuilder-YYYYMMDD.ndjson)
 *     LAZYBUILDER_LOG_STDERR ─ "1" to also mirror to stderr (default: off, keeps TUI clean)
 *
 * The TUI takes over stdout/stderr for rendering, so file output is the primary sink.
 * Each line is one JSON object (NDJSON) for easy ingestion by agents/grep/jq.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 100,
};

export interface LogContext {
  [key: string]: unknown;
}

export interface Logger {
  trace(msg: string, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, ctx?: LogContext): void;
  fatal(msg: string, ctx?: LogContext): void;
  child(bindings: LogContext): Logger;
}

interface LoggerConfig {
  level: LogLevel;
  filePath: string | null;
  mirrorStderr: boolean;
}

let cachedConfig: LoggerConfig | null = null;

function isUnderTest(): boolean {
  // Vitest sets VITEST=true, jest sets JEST_WORKER_ID. NODE_ENV=test is the
  // generic signal. Any of these means we should NOT pollute the user's
  // persistent log file with test-induced errors.
  return (
    process.env['VITEST'] === 'true'
    || process.env['VITEST_WORKER_ID'] != null
    || process.env['JEST_WORKER_ID'] != null
    || process.env['NODE_ENV'] === 'test'
  );
}

function resolveConfig(): LoggerConfig {
  if (cachedConfig) return cachedConfig;

  const rawLevel = (process.env['LAZYBUILDER_LOG_LEVEL'] ?? 'info').toLowerCase();
  const level: LogLevel = (rawLevel in LEVEL_RANK ? rawLevel : 'info') as LogLevel;

  let filePath: string | null = null;
  if (level !== 'silent') {
    const explicit = process.env['LAZYBUILDER_LOG_FILE'];
    if (explicit) {
      filePath = explicit;
    } else if (isUnderTest()) {
      // Tests intentionally trigger expected failures (EACCES, JSON parse,
      // "disk full") and would otherwise spam the user's real log file.
      // Drop on the floor unless an explicit override file is set.
      filePath = null;
    } else {
      const dir = join(homedir(), '.lazybuilder', 'logs');
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const date = new Date();
        const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
        filePath = join(dir, `lazybuilder-${stamp}.ndjson`);
      } catch {
        filePath = null;
      }
    }
  }

  const mirrorStderr = process.env['LAZYBUILDER_LOG_STDERR'] === '1';

  cachedConfig = { level, filePath, mirrorStderr };
  return cachedConfig;
}

function emit(level: LogLevel, msg: string, bindings: LogContext, ctx?: LogContext): void {
  const cfg = resolveConfig();
  if (LEVEL_RANK[level] < LEVEL_RANK[cfg.level]) return;

  const record = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...bindings,
    ...(ctx ?? {}),
  };

  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({ ts: record.ts, level, msg, _serializeError: true });
  }

  if (cfg.filePath) {
    try {
      appendFileSync(cfg.filePath, line + '\n', 'utf-8');
    } catch {
      // file unwritable — fall through
    }
  }

  if (cfg.mirrorStderr) {
    process.stderr.write(line + '\n');
  }
}

class StructuredLogger implements Logger {
  constructor(private bindings: LogContext = {}) {}

  trace(msg: string, ctx?: LogContext): void { emit('trace', msg, this.bindings, ctx); }
  debug(msg: string, ctx?: LogContext): void { emit('debug', msg, this.bindings, ctx); }
  info(msg: string, ctx?: LogContext): void { emit('info', msg, this.bindings, ctx); }
  warn(msg: string, ctx?: LogContext): void { emit('warn', msg, this.bindings, ctx); }
  error(msg: string, ctx?: LogContext): void { emit('error', msg, this.bindings, ctx); }
  fatal(msg: string, ctx?: LogContext): void { emit('fatal', msg, this.bindings, ctx); }

  child(bindings: LogContext): Logger {
    return new StructuredLogger({ ...this.bindings, ...bindings });
  }
}

/** Root logger. Attach a `component` binding via `.child()` per module. */
export const logger: Logger = new StructuredLogger();

/** Reset cached config — used by tests only. */
export function _resetLoggerForTests(): void {
  cachedConfig = null;
}

/** Serialize an Error into a plain log-friendly object. */
export function errToLog(err: unknown): LogContext {
  if (err instanceof Error) {
    return { errName: err.name, errMessage: err.message, errStack: err.stack };
  }
  return { err: String(err) };
}
