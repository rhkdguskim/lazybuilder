import { EventEmitter } from 'node:events';
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ProcessRunner } from '../process/ProcessRunner.js';
import { logger, errToLog } from '../logging/Logger.js';
import type { InstallStep } from '../../domain/models/InstallPlan.js';
import type { InstallerEvent, InstallerRunOptions } from './DotnetInstaller.js';

const log = logger.child({ component: 'VsBuildToolsInstaller' });

export const VS_BUILDTOOLS_URL =
  'https://aka.ms/vs/17/release/vs_BuildTools.exe';
const BOOTSTRAP_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const IS_WINDOWS = process.platform === 'win32';

export type VsProjectKind = 'cpp' | 'cli' | 'cmake';

const WORKLOAD_ID_FOR_KIND: Record<VsProjectKind, string> = {
  cpp: 'Microsoft.VisualStudio.Workload.VCTools',
  cli: 'Microsoft.VisualStudio.Workload.NativeDesktop',
  cmake: 'Microsoft.VisualStudio.Component.VC.CMake.Project',
};

/**
 * Drives the Microsoft Visual Studio Build Tools bootstrapper
 * (`vs_BuildTools.exe`) to install C++ workloads in unattended mode.
 *
 * Always installs to machine scope (Program Files), so a single UAC prompt is
 * required up-front. On macOS / Linux we throw a clear error.
 */
export class VsBuildToolsInstaller extends EventEmitter {
  private readonly cacheDir: string;
  private readonly bootstrapPath: string;

  constructor() {
    super();
    this.cacheDir = join(homedir(), '.lazybuilder', 'cache');
    this.bootstrapPath = join(this.cacheDir, 'vs_BuildTools.exe');
  }

  resolveBootstrapPath(): string {
    return this.bootstrapPath;
  }

  /**
   * Pure helper: build the argv passed to `vs_BuildTools.exe`.
   *
   * Workload selection is project-driven so we install the *narrowest* set
   * the user actually needs. Toolset is currently informational — VS chooses
   * the latest matching MSVC toolset by default.
   */
  buildArgs(_toolset: string, projectKinds: Set<VsProjectKind>): string[] {
    const workloads: string[] = [];
    if (projectKinds.has('cpp')) workloads.push(WORKLOAD_ID_FOR_KIND.cpp);
    if (projectKinds.has('cli')) workloads.push(WORKLOAD_ID_FOR_KIND.cli);
    if (projectKinds.has('cmake')) workloads.push(WORKLOAD_ID_FOR_KIND.cmake);

    // MVP: when no project kinds were inferred, default to VCTools so a
    // C++ build environment is always provisioned.
    if (workloads.length === 0) {
      workloads.push(WORKLOAD_ID_FOR_KIND.cpp);
    }

    return [
      '--quiet',
      '--wait',
      '--norestart',
      '--nocache',
      ...workloads.flatMap(id => ['--add', id]),
    ];
  }

  /**
   * Pure preview helper used by ToolchainService.toStep so the propose card
   * shows a faithful command line without side effects.
   */
  buildPreviewArgs(step: InstallStep): { executable: string; args: string[] } {
    const projectKinds = new Set<VsProjectKind>(['cpp']);
    const args = this.buildArgs(step.version, projectKinds);
    return {
      executable: this.bootstrapPath,
      args,
    };
  }

  async ensureBootstrap(): Promise<string> {
    if (!IS_WINDOWS) {
      throw new Error(
        'VS Build Tools install is only supported on Windows. Refer to the docs to install manually.',
      );
    }

    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    if (this.isBootstrapFresh()) {
      log.debug('using cached vs_BuildTools.exe', { path: this.bootstrapPath });
      return this.bootstrapPath;
    }

    log.info('fetching vs_BuildTools.exe', { url: VS_BUILDTOOLS_URL });
    const body = await this.fetchBootstrap();
    writeFileSync(this.bootstrapPath, body);
    return this.bootstrapPath;
  }

  async run(options: InstallerRunOptions): Promise<{ exitCode: number; logTail: string[] }> {
    const { step, signal } = options;
    if (!IS_WINDOWS) {
      throw new Error(
        'VS Build Tools install is only supported on Windows. Refer to the docs to install manually.',
      );
    }

    const bootstrap = await this.ensureBootstrap();
    const projectKinds = new Set<VsProjectKind>(['cpp']);
    const innerArgs = this.buildArgs(step.version, projectKinds);

    // Wrap with `Start-Process -Verb RunAs -Wait` so a single UAC prompt
    // covers the install. The bootstrapper itself runs unattended via
    // --quiet --wait --norestart.
    const psCommand = [
      `Start-Process`,
      `-FilePath`,
      `'${bootstrap}'`,
      `-ArgumentList`,
      `@(${innerArgs.map(a => `'${a.replace(/'/g, "''")}'`).join(',')})`,
      `-Verb`,
      `RunAs`,
      `-Wait`,
      `-PassThru`,
    ].join(' ');

    const args = [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-Command',
      `$p = ${psCommand}; exit $p.ExitCode`,
    ];

    return runWithEvents(this, step.id, 'powershell', args, signal);
  }

  private isBootstrapFresh(): boolean {
    if (!existsSync(this.bootstrapPath)) return false;
    try {
      const stats = statSync(this.bootstrapPath);
      const age = Date.now() - stats.mtimeMs;
      return age < BOOTSTRAP_CACHE_TTL_MS && stats.size > 0;
    } catch {
      return false;
    }
  }

  private async fetchBootstrap(): Promise<Buffer> {
    const response = await fetch(VS_BUILDTOOLS_URL, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(
        `Failed to download ${VS_BUILDTOOLS_URL}: HTTP ${response.status}`,
      );
    }
    const ab = await response.arrayBuffer();
    return Buffer.from(ab);
  }
}

/**
 * Shared spawn-and-stream helper used by both VS Build Tools and Winget
 * installers. Mirrors DotnetInstaller's `'event'` emission shape.
 */
export function runWithEvents(
  emitter: EventEmitter,
  stepId: string,
  executable: string,
  args: string[],
  signal: AbortSignal | undefined,
): Promise<{ exitCode: number; logTail: string[] }> {
  const runner = new ProcessRunner();
  const tail: string[] = [];
  const TAIL_LIMIT = 200;

  return new Promise((resolve, reject) => {
    const onAbort = () => {
      log.warn('install aborted', { stepId });
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
      emitter.emit('event', {
        stepId,
        type: 'log',
        line,
      } satisfies InstallerEvent);
    };

    runner.on('stdout', captureLine);
    runner.on('stderr', captureLine);
    runner.on('error', err => {
      signal?.removeEventListener('abort', onAbort);
      log.warn('install runner error', { stepId, ...errToLog(err) });
      emitter.emit('event', {
        stepId,
        type: 'error',
        error: err instanceof Error ? err.message : String(err),
      } satisfies InstallerEvent);
      reject(err);
    });
    runner.on('exit', (code: number) => {
      signal?.removeEventListener('abort', onAbort);
      emitter.emit('event', {
        stepId,
        type: 'done',
        exitCode: code,
      } satisfies InstallerEvent);
      resolve({ exitCode: code, logTail: [...tail] });
    });

    runner.start({
      command: executable,
      args,
      shell: false,
      forceUtf8: false,
    });
  });
}
