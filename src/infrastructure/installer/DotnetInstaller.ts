import { EventEmitter } from 'node:events';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
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
const SCRIPT_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

export class DotnetInstaller extends EventEmitter {
  private readonly cacheDir: string;
  private readonly scriptPath: string;

  constructor() {
    super();
    this.cacheDir = join(homedir(), '.lazybuilder', 'cache');
    this.scriptPath = join(this.cacheDir, 'dotnet-install.ps1');
  }

  resolveInstallDir(scope: InstallScope): string {
    if (scope === 'machine') {
      return join(process.env['ProgramFiles'] ?? 'C:\\Program Files', 'dotnet');
    }
    return join(homedir(), '.dotnet');
  }

  async ensureScript(): Promise<string> {
    if (process.platform !== 'win32') {
      throw new Error('DotnetInstaller MVP supports Windows only');
    }

    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    const fresh = this.isScriptFresh();
    if (fresh) {
      log.debug('using cached dotnet-install.ps1', { path: this.scriptPath });
      return this.scriptPath;
    }

    log.info('fetching dotnet-install.ps1', { url: DOTNET_INSTALL_PS1_URL });
    const body = await this.fetchScript();
    writeFileSync(this.scriptPath, body, 'utf-8');
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
        command: 'powershell',
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
    return { executable: 'powershell', args };
  }

  private buildArgs(step: InstallStep, scriptPath: string, installDir: string): string[] {
    if (step.kind === 'dotnet-workload') {
      return [
        '-NoProfile',
        '-Command',
        `dotnet workload install ${step.version}`,
      ];
    }

    const versionArg = step.version.endsWith('.x')
      ? ['-Channel', step.version.slice(0, -2)]
      : ['-Version', step.version];

    const runtimeArg =
      step.kind === 'dotnet-runtime' ? ['-Runtime', 'dotnet'] : [];

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
    const response = await fetch(DOTNET_INSTALL_PS1_URL, {
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(
        `Failed to download dotnet-install.ps1: HTTP ${response.status}`,
      );
    }
    const body = await response.text();
    if (!body.includes('dotnet-install') && !body.includes('Install-Dotnet')) {
      throw new Error('Downloaded dotnet-install.ps1 failed sanity check');
    }
    return body;
  }
}
