import type { BuildProfile } from '../domain/models/BuildProfile.js';
import type { BuildResult, BuildDiagnostic } from '../domain/models/BuildResult.js';
import type { ProjectInfo } from '../domain/models/ProjectInfo.js';
import type { EnvironmentSnapshot } from '../domain/models/EnvironmentSnapshot.js';
import type { HardwareInfo } from '../domain/models/HardwareInfo.js';
import type { BuildAdapter, ResolvedCommand } from '../infrastructure/adapters/BuildAdapter.js';
import { DotnetAdapter } from '../infrastructure/adapters/DotnetAdapter.js';
import { MsBuildAdapter } from '../infrastructure/adapters/MsBuildAdapter.js';
import { CppMsBuildAdapter } from '../infrastructure/adapters/CppMsBuildAdapter.js';
import { CMakeAdapter } from '../infrastructure/adapters/CMakeAdapter.js';
import { ProcessRunner } from '../infrastructure/process/ProcessRunner.js';
import { DevShellRunner, findDevShellPath, findBestInstallation } from '../infrastructure/process/DevShellRunner.js';
import { MsBuildOutputParser } from '../infrastructure/parsers/MsBuildOutputParser.js';
import { DotnetOutputParser } from '../infrastructure/parsers/DotnetOutputParser.js';
import { CMakeOutputParser } from '../infrastructure/parsers/CMakeOutputParser.js';
import { detectHardware } from '../infrastructure/system/HardwareDetector.js';
import type { LogEntry } from '../domain/models/LogEntry.js';

export class BuildService {
  private adapters: BuildAdapter[];
  private currentRunner: ProcessRunner | null = null;
  private logIndex = 0;
  readonly hardware: HardwareInfo;

  constructor(snapshot?: EnvironmentSnapshot, hardware?: HardwareInfo) {
    const msbuildPath = snapshot?.msbuild.selectedPath ?? undefined;
    this.hardware = hardware ?? detectHardware();
    this.adapters = [
      new CppMsBuildAdapter(msbuildPath, this.hardware),  // Check C++ first (more specific)
      new DotnetAdapter(this.hardware),
      new MsBuildAdapter(msbuildPath, this.hardware),
      new CMakeAdapter(this.hardware),
    ];
  }

  getAdapter(project: ProjectInfo): BuildAdapter | null {
    return this.adapters.find(a => a.canHandle(project)) ?? null;
  }

  resolveCommand(project: ProjectInfo, profile: BuildProfile): ResolvedCommand | null {
    const adapter = this.getAdapter(project);
    return adapter?.resolveCommand(project, profile) ?? null;
  }

  async execute(
    project: ProjectInfo,
    profile: BuildProfile,
    snapshot: EnvironmentSnapshot,
    onLogEntry: (entry: LogEntry) => void,
  ): Promise<BuildResult> {
    const adapter = this.getAdapter(project);
    if (!adapter) {
      throw new Error(`No adapter found for project type: ${project.projectType}`);
    }

    const resolved = adapter.resolveCommand(project, profile);
    const startTime = new Date();
    this.logIndex = 0;

    // Use the directory of the target file as working directory
    const { dirname } = await import('node:path');
    const workingDir = dirname(profile.targetPath);

    // Select parser
    const parser = project.buildSystem === 'cmake'
      ? new CMakeOutputParser()
      : project.buildSystem === 'dotnet'
        ? new DotnetOutputParser()
        : new MsBuildOutputParser();

    // Log the full build command
    onLogEntry({
      index: this.logIndex++,
      timestamp: Date.now(),
      level: 'info',
      text: `> ${resolved.displayString}`,
      source: 'stdout',
    });
    onLogEntry({
      index: this.logIndex++,
      timestamp: Date.now(),
      level: 'info',
      text: `  Working directory: ${workingDir}`,
      source: 'stdout',
    });

    // Determine if Developer Shell is needed
    // C++ projects (vcxproj) always need DevShell for INCLUDE/LIB paths
    const needsDevShell = resolved.requiresDevShell
      || project.projectType === 'cpp-msbuild'
      || project.buildSystem === 'msbuild';

    // Create runner
    let runner: ProcessRunner;
    if (needsDevShell && snapshot.visualStudio.installations.length > 0) {
      // Find the best VS installation for this project's toolset
      const bestVs = findBestInstallation(
        snapshot.visualStudio.installations,
        project.platformToolset,
      );

      const devShell = bestVs ? findDevShellPath(bestVs) : null;
      const archArg = profile.platform === 'x86' || profile.platform === 'Win32' ? 'x86' : 'x64';

      if (devShell) {
        const devRunner = new DevShellRunner(devShell.path, archArg, devShell.isVsDevCmd);
        devRunner.startWithDevShell(resolved.command, resolved.args, workingDir);
        runner = devRunner;
      } else if (snapshot.cpp.vcvarsPath) {
        // Fallback to detected vcvarsall
        const devRunner = new DevShellRunner(snapshot.cpp.vcvarsPath, archArg, false);
        devRunner.startWithDevShell(resolved.command, resolved.args, workingDir);
        runner = devRunner;
      } else {
        // No dev shell available, try anyway
        runner = new ProcessRunner();
        runner.start({ command: resolved.command, args: resolved.args, cwd: workingDir });
      }
    } else {
      runner = new ProcessRunner();
      runner.start({
        command: resolved.command,
        args: resolved.args,
        cwd: workingDir,
      });
    }

    this.currentRunner = runner;

    return new Promise<BuildResult>((resolve) => {
      const createEntry = (text: string, source: 'stdout' | 'stderr'): LogEntry => ({
        index: this.logIndex++,
        timestamp: Date.now(),
        level: source === 'stderr' ? 'stderr' : 'stdout',
        text,
        source,
      });

      runner.on('stdout', (line: string) => {
        const diag = parser.feedLine(line);
        const entry = createEntry(line, 'stdout');
        if (diag) {
          entry.level = diag.severity === 'error' ? 'error' : 'warning';
        }
        onLogEntry(entry);
      });

      runner.on('stderr', (line: string) => {
        parser.feedLine(line);
        onLogEntry(createEntry(line, 'stderr'));
      });

      runner.on('error', (err: Error) => {
        onLogEntry(createEntry(`Build process error: ${err.message}`, 'stderr'));
        const endTime = new Date();
        const summary = parser.getSummary();
        this.currentRunner = null;
        resolve({
          profileId: profile.id,
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          exitCode: -1,
          status: 'failure',
          errorCount: summary.errors.length + 1,
          warningCount: summary.warnings.length,
          errors: summary.errors,
          warnings: summary.warnings,
        });
      });

      runner.on('exit', (code: number) => {
        const endTime = new Date();
        const summary = parser.getSummary();
        this.currentRunner = null;
        resolve({
          profileId: profile.id,
          startTime,
          endTime,
          durationMs: endTime.getTime() - startTime.getTime(),
          exitCode: code,
          status: code === 0 ? 'success' : 'failure',
          errorCount: summary.errors.length,
          warningCount: summary.warnings.length,
          errors: summary.errors,
          warnings: summary.warnings,
        });
      });
    });
  }

  async cancel(): Promise<void> {
    if (this.currentRunner) {
      await this.currentRunner.cancel();
      this.currentRunner = null;
    }
  }
}
