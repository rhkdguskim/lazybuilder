import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import treeKill from 'tree-kill';

export interface ProcessRunnerOptions {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  shell?: boolean;
  /** Force UTF-8 output on Windows by prepending chcp 65001 */
  forceUtf8?: boolean;
}

export interface CommandOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class ProcessRunner extends EventEmitter {
  private child: ChildProcess | null = null;

  start(options: ProcessRunnerOptions): void {
    const { command, args = [], cwd, env, shell = true, forceUtf8 = true } = options;

    const mergedEnv = env ? { ...process.env, ...env } : process.env;

    // On Windows, force UTF-8 codepage to avoid Korean (CP949) garbling
    const isWindows = process.platform === 'win32';
    let finalCommand: string;
    let finalArgs: string[];
    let finalShell: boolean | string;

    if (shell && isWindows && forceUtf8) {
      // Wrap command with chcp 65001 to force UTF-8 output
      const cmdPart = args.length > 0 ? `${command} ${args.join(' ')}` : command;
      finalCommand = `chcp 65001 >nul && ${cmdPart}`;
      finalArgs = [];
      finalShell = true;
    } else if (shell && args.length > 0) {
      finalCommand = `${command} ${args.join(' ')}`;
      finalArgs = [];
      finalShell = true;
    } else {
      finalCommand = command;
      finalArgs = args;
      finalShell = shell;
    }

    this.child = spawn(finalCommand, finalArgs, {
      cwd,
      env: mergedEnv,
      shell: finalShell,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    // Use manual line splitting with UTF-8 decoding
    if (this.child.stdout) {
      this.readLines(this.child.stdout, 'stdout');
    }

    if (this.child.stderr) {
      this.readLines(this.child.stderr, 'stderr');
    }

    this.child.on('error', (err) => this.emit('error', err));
    this.child.on('close', (code) => this.emit('exit', code ?? 1));
  }

  async cancel(): Promise<void> {
    if (!this.child?.pid) return;
    return new Promise<void>((resolve) => {
      treeKill(this.child!.pid!, 'SIGTERM', (err) => {
        if (err) {
          try { this.child?.kill('SIGKILL'); } catch { /* ignore */ }
        }
        resolve();
      });
    });
  }

  private readLines(stream: NodeJS.ReadableStream, event: 'stdout' | 'stderr'): void {
    let buffer = '';
    stream.setEncoding('utf-8');
    stream.on('data', (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        this.emit(event, line);
      }
    });
    stream.on('end', () => {
      if (buffer.length > 0) {
        this.emit(event, buffer);
        buffer = '';
      }
    });
  }
}

export async function runCommand(
  command: string,
  args: string[] = [],
  options?: { cwd?: string; env?: Record<string, string>; timeout?: number },
): Promise<CommandOutput> {
  return new Promise((resolve) => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const runner = new ProcessRunner();

    const timer = options?.timeout
      ? setTimeout(() => {
          runner.cancel().then(() =>
            resolve({ exitCode: -1, stdout: stdout.join('\n'), stderr: 'timeout' }),
          );
        }, options.timeout)
      : null;

    runner.on('stdout', (line: string) => stdout.push(line));
    runner.on('stderr', (line: string) => stderr.push(line));
    runner.on('error', () => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: -1, stdout: stdout.join('\n'), stderr: stderr.join('\n') });
    });
    runner.on('exit', (code: number) => {
      if (timer) clearTimeout(timer);
      resolve({ exitCode: code, stdout: stdout.join('\n'), stderr: stderr.join('\n') });
    });

    runner.start({ command, args, cwd: options?.cwd, env: options?.env });
  });
}
