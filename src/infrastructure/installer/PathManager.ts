import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import { logger, errToLog } from '../logging/Logger.js';

const log = logger.child({ component: 'PathManager' });

/**
 * Reads the user PATH from the registry (Windows only).
 * Returns null on non-Windows or on read failure.
 */
export async function readUserPath(): Promise<string | null> {
  if (process.platform !== 'win32') return null;
  const result = await runCommand(
    'reg',
    ['query', 'HKCU\\Environment', '/v', 'Path'],
    { timeout: TIMEOUTS.QUICK_PROBE },
  );
  if (result.exitCode !== 0) return null;
  const match = result.stdout.match(/REG_(?:EXPAND_)?SZ\s+(.*)/);
  return match?.[1]?.trim() ?? null;
}

/**
 * Appends `dir` to user PATH if not already present.
 * Uses `setx` (which truncates at 1024 chars but is the safest user-level option).
 * Returns true if PATH was changed.
 */
export async function ensureUserPathContains(dir: string): Promise<boolean> {
  if (process.platform !== 'win32') return false;
  const current = await readUserPath();
  if (current && current.split(';').some(p => normalize(p) === normalize(dir))) {
    return false;
  }
  const next = current ? `${current};${dir}` : dir;
  const result = await runCommand('setx', ['Path', next], {
    timeout: TIMEOUTS.QUICK_PROBE,
  });
  if (result.exitCode !== 0) {
    log.warn('failed to update user PATH', {
      dir,
      stderr: result.stderr.slice(0, 200),
    });
    return false;
  }
  return true;
}

/**
 * Returns an env object with `dir` prepended to PATH for the current process tree.
 * Useful so spawned children can find the freshly installed tool without a shell restart.
 */
export function withPathPrepended(
  baseEnv: NodeJS.ProcessEnv,
  dir: string,
): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(baseEnv)) {
    if (typeof v === 'string') env[k] = v;
  }
  const sep = process.platform === 'win32' ? ';' : ':';
  const existing = env['PATH'] ?? env['Path'] ?? '';
  try {
    env['PATH'] = `${dir}${sep}${existing}`;
  } catch (err) {
    log.debug('withPathPrepended fallback', errToLog(err));
  }
  return env;
}

function normalize(p: string): string {
  return p.trim().replace(/[\\/]+$/, '').toLowerCase();
}
