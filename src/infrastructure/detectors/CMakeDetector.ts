import { runCommand } from '../process/ProcessRunner.js';
import { TIMEOUTS } from '../../config/timeouts.js';
import type { ToolInfo } from '../../domain/models/ToolInfo.js';
import { createToolInfo } from '../../domain/models/ToolInfo.js';
import type { EnvironmentSnapshot } from '../../domain/models/EnvironmentSnapshot.js';

export class CMakeDetector {
  async detect(): Promise<Partial<EnvironmentSnapshot>> {
    const [cmake, ninja] = await Promise.all([
      this.detectCMake(),
      this.detectNinja(),
    ]);
    return { cmake, ninja };
  }

  private async detectCMake(): Promise<ToolInfo> {
    const result = await runCommand('cmake', ['--version'], { timeout: TIMEOUTS.QUICK_PROBE });
    if (result.exitCode !== 0) {
      return createToolInfo({ name: 'cmake', detected: false });
    }
    const match = result.stdout.match(/cmake version (\S+)/);
    const pathResult = await runCommand(process.platform === 'win32' ? 'where' : 'which', ['cmake'], { timeout: TIMEOUTS.QUICK_PROBE });
    return createToolInfo({
      name: 'cmake',
      detected: true,
      version: match?.[1] ?? null,
      path: pathResult.exitCode === 0 ? pathResult.stdout.trim().split('\n')[0]! : null,
      source: 'PATH',
    });
  }

  private async detectNinja(): Promise<ToolInfo> {
    const result = await runCommand('ninja', ['--version'], { timeout: TIMEOUTS.QUICK_PROBE });
    if (result.exitCode !== 0) {
      return createToolInfo({ name: 'ninja', detected: false });
    }
    return createToolInfo({
      name: 'ninja',
      detected: true,
      version: result.stdout.trim(),
      source: 'PATH',
    });
  }
}
