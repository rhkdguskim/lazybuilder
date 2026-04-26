import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { updateGlobalJsonSdkVersion } from './GlobalJsonManager.js';

describe('updateGlobalJsonSdkVersion', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'globaljson-mgr-test-'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates a new global.json when the file is missing', () => {
    const file = join(tmpDir, 'global.json');
    expect(existsSync(file)).toBe(false);

    const ok = updateGlobalJsonSdkVersion(tmpDir, '8.0.405');
    expect(ok).toBe(true);
    expect(existsSync(file)).toBe(true);

    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
      sdk: { version: string; rollForward: string };
    };
    expect(parsed.sdk.version).toBe('8.0.405');
    expect(parsed.sdk.rollForward).toBe('latestFeature');
  });

  it('preserves other top-level keys when updating sdk.version', () => {
    const file = join(tmpDir, 'global.json');
    const initial = {
      sdk: { version: '6.0.428', rollForward: 'latestFeature', allowPrerelease: false },
      'msbuild-sdks': { 'Microsoft.Build.Traversal': '4.0.0' },
      tools: { someTool: '1.2.3' },
    };
    writeFileSync(file, JSON.stringify(initial, null, 2), 'utf-8');

    const ok = updateGlobalJsonSdkVersion(tmpDir, '8.0.405');
    expect(ok).toBe(true);

    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Record<string, unknown> & {
      sdk: { version: string; rollForward: string; allowPrerelease?: boolean };
    };
    expect(parsed.sdk.version).toBe('8.0.405');
    expect(parsed.sdk.allowPrerelease).toBe(false); // preserved within sdk
    expect(parsed['msbuild-sdks']).toEqual({ 'Microsoft.Build.Traversal': '4.0.0' });
    expect(parsed['tools']).toEqual({ someTool: '1.2.3' });
  });

  it('defaults rollForward to "latestFeature"', () => {
    updateGlobalJsonSdkVersion(tmpDir, '8.0.405');
    const parsed = JSON.parse(
      readFileSync(join(tmpDir, 'global.json'), 'utf-8'),
    ) as { sdk: { rollForward: string } };
    expect(parsed.sdk.rollForward).toBe('latestFeature');
  });

  it('respects a custom rollForward value', () => {
    updateGlobalJsonSdkVersion(tmpDir, '8.0.405', 'major');
    const parsed = JSON.parse(
      readFileSync(join(tmpDir, 'global.json'), 'utf-8'),
    ) as { sdk: { rollForward: string } };
    expect(parsed.sdk.rollForward).toBe('major');
  });

  it('returns false when the target directory is not writable', () => {
    if (process.platform === 'win32') {
      // Windows fs permissions don't honor chmod the same way; skip on Windows.
      return;
    }
    chmodSync(tmpDir, 0o555);
    try {
      const ok = updateGlobalJsonSdkVersion(tmpDir, '8.0.405');
      expect(ok).toBe(false);
    } finally {
      chmodSync(tmpDir, 0o755);
    }
  });

  it('overwrites a malformed existing global.json', () => {
    const file = join(tmpDir, 'global.json');
    writeFileSync(file, '{ this is { not json', 'utf-8');

    const ok = updateGlobalJsonSdkVersion(tmpDir, '8.0.405');
    expect(ok).toBe(true);

    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as {
      sdk: { version: string; rollForward: string };
    };
    expect(parsed.sdk.version).toBe('8.0.405');
    expect(parsed.sdk.rollForward).toBe('latestFeature');
  });
});
