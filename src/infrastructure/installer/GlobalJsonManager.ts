import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { logger, errToLog } from '../logging/Logger.js';

const log = logger.child({ component: 'GlobalJsonManager' });

export interface GlobalJsonShape {
  sdk?: {
    version?: string;
    rollForward?: string;
    allowPrerelease?: boolean;
  };
  [key: string]: unknown;
}

/**
 * Updates `sdk.version` in the global.json at `cwd`. Creates the file if missing.
 * Preserves any other top-level keys. Returns true if the file was written.
 */
export function updateGlobalJsonSdkVersion(
  cwd: string,
  version: string,
  rollForward: string = 'latestFeature',
): boolean {
  const filePath = join(cwd, 'global.json');
  let current: GlobalJsonShape = {};
  if (existsSync(filePath)) {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      current = JSON.parse(raw) as GlobalJsonShape;
    } catch (err) {
      log.warn('global.json parse failed; overwriting', { filePath, ...errToLog(err) });
      current = {};
    }
  }

  const next: GlobalJsonShape = {
    ...current,
    sdk: {
      ...(current.sdk ?? {}),
      version,
      rollForward,
    },
  };

  const serialized = JSON.stringify(next, null, 2) + '\n';
  try {
    writeFileSync(filePath, serialized, 'utf-8');
    return true;
  } catch (err) {
    log.warn('global.json write failed', { filePath, ...errToLog(err) });
    return false;
  }
}
