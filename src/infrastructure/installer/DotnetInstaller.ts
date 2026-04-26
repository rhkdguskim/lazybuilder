import { EventEmitter } from 'node:events';
import { mkdirSync, existsSync, statSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ProcessRunner } from '../process/ProcessRunner.js';
import { logger, errToLog } from '../logging/Logger.js';
import type {
  InstallStep,
  InstallScope,
} from '../../domain/models/InstallPlan.js';

const log = logger.child({ component: 'DotnetInstaller' });

const DOTNET_INSTALL_PS1_URL = 'https://dot.net/v1/dotnet-install.ps1';
const DOTNET_INSTALL_SH_URL = 'https://dot.net/v1/dotnet-install.sh';
const SCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const IS_WINDOWS = process.platform === 'win32';

export interface InstallerEvent {
  stepId: string;
  type: 'log' | 'progress' | 'done' | 'error';
  line?: string;
  exitCode?: number | null;
  error?: string;
}

export interface InstallerRunOptions {
  step: InstallStep;
  signal?: AbortSignal;
}

/**
 * Downloads and runs Microsoft's official dotnet-install script.
 * - Windows: dotnet-install.ps1 via powershell
 * - macOS / Linux: dotnet-install.sh via bash
 *
 * The two scripts accept different flag syntax (PowerShell uses `-Channel`,
 * the shell script uses `--channel`). Plan/preview output reflects the
 * platform-specific command so the JSON contract is honest about what will
 * actually run.
 */
export class DotnetInstaller extends EventEmitter {
  private readonly cacheDir: string;
  private readonly scriptPath: string;
  private readonly scriptUrl: string;
  private readonly executable: string;

  constructor() {
    super();
    this.cacheDir = join(homedir(), '.lazybuilder', 'cache');
    if (IS_WINDOWS) {
      this.scriptPath = join(this.cacheDir, 'dotnet-install.ps1');
      this.scriptUrl = DOTNET_INSTALL_PS1_URL;
      this.executable = 'powershell';
    } else {
      this.scriptPath = join(this.cacheDir, 'dotnet-install.sh');
      this.scriptUrl = DOTNET_INSTALL_SH_URL;
      this.executable = 'bash';
    }
  }

  resolveInstallDir(scope: InstallScope): string {
    if (scope === 'machine') {
      if (IS_WINDOWS) {
        return join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'dotnet');
      }
      return '/usr/local/share/dotnet';
    }
    return join(homedir(), '.dotnet');
  }

  async ensureScript(): Promise<string> {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    if (this.isScriptFresh()) {
      log.debug('using cached dotnet-install script', { path: this.scriptPath });
      return this.scriptPath;
    }

    log.info('fetching dotnet-install script', { url: this.scriptUrl });
    const body = await this.fetchScript();
    writeFileSync(this.scriptPath, body, 'utf-8');
    if (!IS_WINDOWS) {
      // Shell script must be executable for `bash <path>` to work cleanly,
      // and for callers that want to spawn it directly.
      try { chmodSync(this.scriptPath, 0o755); } catch { /* best-effort */ }
    }
    return this.scriptPath;
  }

  async run(options: InstallerRunOptions): Promise<{ exitCode: number; logTail: string[] }> {
    const { step, signal } = options;
    const scriptPath = await this.ensureScript();
    const installDir = this.resolveInstallDir(step.scope);

    if (!existsSync(installDir)) {
      mkdirSync(installDir, { recursive: true });
    }

    const args = this.buildArgs(step, scriptPath, installDir);
    const runner = new ProcessRunner();
    const tail: string[] = [];
    const TAIL_LIMIT = 200;

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        log.warn('install aborted', { stepId: step.id });
        runner.cancel().catch(() => undefined);
      };
      if (signal) {
        if (signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }

      const captureLine = (line: string) => {
        tail.push(line);
        if (tail.length > TAIL_LIMIT) tail.splice(0, tail.length - TAIL_LIMIT);
        this.emit('event', {
          stepId: step.id,
          type: 'log',
          line,
        } satisfies InstallerEvent);
      };

      runner.on('stdout', captureLine);
      runner.on('stderr', captureLine);
      runner.on('error', err => {
        signal?.removeEventListener('abort', onAbort);
        log.warn('install runner error', { stepId: step.id, ...errToLog(err) });
        this.emit('event', {
          stepId: step.id,
          type: 'error',
          error: err instanceof Error ? err.message : String(err),
        } satisfies InstallerEvent);
        reject(err);
      });
      runner.on('exit', (code: number) => {
        signal?.removeEventListener('abort', onAbort);
        this.emit('event', {
          stepId: step.id,
          type: 'done',
          exitCode: code,
        } satisfies InstallerEvent);
        resolve({ exitCode: code, logTail: [...tail] });
      });

      runner.start({
        command: this.executable,
        args,
        shell: false,
        forceUtf8: false,
      });
    });
  }

  buildPreviewArgs(step: InstallStep): { executable: string; args: string[] } {
    if (step.kind === 'dotnet-workload') {
      return {
        executable: 'dotnet',
        args: ['workload', 'install', step.version],
      };
    }
    const installDir = this.resolveInstallDir(step.scope);
    const args = this.buildArgs(step, this.scriptPath, installDir);
    return { executable: this.executable, args };
  }

  private buildArgs(step: InstallStep, scriptPath: string, installDir: string): string[] {
    if (step.kind === 'dotnet-workload') {
      if (IS_WINDOWS) {
        return ['-NoProfile', '-Command', `dotnet workload install ${step.version}`];
      }
      return ['-c', `dotnet workload install ${step.version}`];
    }

    if (IS_WINDOWS) {
      const versionArg = step.version.endsWith('.x')
        ? ['-Channel', step.version.slice(0, -2)]
        : ['-Version', step.version];
      const runtimeArg = step.kind === 'dotnet-runtime' ? ['-Runtime', 'dotnet'] : [];
      return [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        scriptPath,
        ...versionArg,
        ...runtimeArg,
        '-InstallDir',
        installDir,
        '-NoPath',
      ];
    }

    // POSIX: dotnet-install.sh uses long-form flags.
    const versionArg = step.version.endsWith('.x')
      ? ['--channel', step.version.slice(0, -2)]
      : ['--version', step.version];
    const runtimeArg = step.kind === 'dotnet-runtime' ? ['--runtime', 'dotnet'] : [];
    return [
      scriptPath,
      ...versionArg,
      ...runtimeArg,
      '--install-dir',
      installDir,
      '--no-path',
    ];
  }

  private isScriptFresh(): boolean {
    if (!existsSync(this.scriptPath)) return false;
    try {
      const stats = statSync(this.scriptPath);
      const age = Date.now() - stats.mtimeMs;
      return age < SCRIPT_CACHE_TTL_MS && stats.size > 0;
    } catch {
      return false;
    }
  }

  private async fetchScript(): Promise<string> {
    const response = await fetch(this.scriptUrl, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(
        `Failed to download ${this.scriptUrl}: HTTP ${response.status}`,
      );
    }
    const body = await response.text();
    // Sanity-check: PS1 mentions Install-Dotnet; SH mentions dotnet-install.
    if (!body.includes('dotnet-install') && !body.includes('Install-Dotnet')) {
      throw new Error(`Downloaded ${this.scriptUrl} failed sanity check`);
    }
    return body;
  }
}
