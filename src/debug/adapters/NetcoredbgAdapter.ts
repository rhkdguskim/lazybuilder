import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { runCommand } from '../../infrastructure/process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import { logger } from '../../infrastructure/logging/Logger.js';
import { DapClient } from './DapClient.js';

const log = logger.child({ component: 'NetcoredbgAdapter' });

/**
 * Wraps `netcoredbg` (the Samsung-maintained .NET DAP adapter) with our DapClient.
 *
 * Discovery order:
 *   1. PATH lookup (`where` on Windows, `which` elsewhere)
 *   2. `~/.lazybuilder/cache/netcoredbg/netcoredbg(.exe)` — where Toolchain
 *      Resolver caches a downloaded copy
 *
 * Spawn invocation: `netcoredbg --interpreter=vscode` — vscode interpreter
 * means "speak DAP over stdio".
 */
export class NetcoredbgAdapter {
  static async resolveExecutable(): Promise<string | null> {
    // 1. PATH probe
    const isWindows = process.platform === 'win32';
    const which = isWindows ? 'where' : 'which';
    const target = isWindows ? 'netcoredbg.exe' : 'netcoredbg';
    try {
      const out = await runCommand(which, [target], { timeout: TIMEOUTS.QUICK_PROBE });
      if (out.exitCode === 0) {
        // `where` on Windows can print multiple lines — take the first.
        const first = out.stdout
          .split(/\r?\n/)
          .map((s) => s.trim())
          .find((s) => s.length > 0);
        if (first && existsSync(first)) {
          log.debug('netcoredbg found on PATH', { path: first });
          return first;
        }
      }
    } catch {
      // ignore — fall through
    }

    // 2. cache directory
    const cacheBin = join(
      homedir(),
      '.lazybuilder',
      'cache',
      'netcoredbg',
      isWindows ? 'netcoredbg.exe' : 'netcoredbg',
    );
    if (existsSync(cacheBin)) {
      log.debug('netcoredbg found in cache', { path: cacheBin });
      return cacheBin;
    }

    log.debug('netcoredbg not found');
    return null;
  }

  constructor(private readonly executablePath: string) {}

  /**
   * Spawn netcoredbg in DAP mode and wrap it with a DapClient.
   *
   * Caller is responsible for sending the `initialize`/`launch` handshake
   * and for cleaning up the child (DapClient.close + DAP `disconnect`).
   */
  async spawn(): Promise<DapClient> {
    const child = spawn(this.executablePath, ['--interpreter=vscode'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    // Mirror stderr to our log file so adapter chatter is visible during
    // debugging the debugger. NEVER write it to stdout — stdout is reserved
    // for the MCP transport.
    child.stderr?.setEncoding('utf8');
    child.stderr?.on('data', (chunk: string) => {
      log.debug('netcoredbg stderr', { line: chunk.trimEnd() });
    });
    child.on('error', (err) => {
      log.warn('netcoredbg spawn error', { err: err.message });
    });

    return new DapClient(child);
  }
}
