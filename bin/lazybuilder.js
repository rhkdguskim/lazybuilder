#!/usr/bin/env node
// LazyBuilder bin entry — dispatches headless flags before falling through to TUI.
// See agent.md and docs/agents/cli-reference.md for the contract.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync, existsSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(here, '..', 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const args = process.argv.slice(2);
const first = args[0];

const SCHEMA = 'lazybuilder/v1';
const envelope = (kind, data) => JSON.stringify({ schema: SCHEMA, kind, data });

const distMain = resolve(here, '..', 'dist', 'main.js');
const distUpdater = resolve(here, '..', 'dist', 'infrastructure', 'updater', 'UpdateChecker.js');

if (!existsSync(distMain)) {
  console.error('[lazybuilder] dist/ is missing. Run "npm run build" first.');
  process.exit(1);
}

async function loadUpdater() {
  const mod = await import(distUpdater);
  return new mod.UpdateChecker();
}

async function dispatchVersion() {
  console.log(pkg.version);
  process.exit(0);
}

async function dispatchHelp() {
  console.log(`LazyBuilder ${pkg.version}
A TUI + headless CLI for .NET / MSBuild / C++ / CMake build environments.

Usage:
  lazybuilder                   Run the interactive TUI
  lazybuilder --version, -v     Print version and exit
  lazybuilder --check-update    Check for updates (JSON output)
  lazybuilder --update          Update to the latest version
  lazybuilder --help, -h        Show this help

Headless agent docs:
  https://github.com/rhkdguskim/lazybuilder/blob/master/agent.md
  https://github.com/rhkdguskim/lazybuilder/tree/master/docs/agents
`);
  process.exit(0);
}

async function dispatchCheckUpdate() {
  const checker = await loadUpdater();
  const result = await checker.check();
  const data = result ?? {
    updateAvailable: false,
    currentVersion: checker.getCurrentVersion(),
    latestVersion: checker.getCurrentVersion(),
    mode: checker.getInstallMode(),
  };
  console.log(envelope('UpdateCheck', data));
  process.exit(0);
}

async function dispatchUpdate() {
  const checker = await loadUpdater();
  const before = await checker.check();
  if (!before) {
    console.error('[lazybuilder] could not determine install mode (no .git, not in node_modules).');
    console.error(`             try: npm install -g ${pkg.name}@latest`);
    process.exit(1);
  }
  if (!before.updateAvailable) {
    console.log(envelope('UpdateResult', {
      success: true,
      mode: before.mode,
      fromVersion: before.currentVersion,
      toVersion: before.currentVersion,
      note: 'already up to date',
    }));
    process.exit(0);
  }
  console.error(`[lazybuilder] updating ${before.currentVersion} → ${before.latestVersion} (mode: ${before.mode})...`);
  const outcome = await checker.performUpdate();
  console.log(envelope('UpdateResult', outcome));
  if (!outcome.success && outcome.manualCommand) {
    console.error(`[lazybuilder] auto-update failed. Run manually:`);
    console.error(`             ${outcome.manualCommand}`);
  }
  process.exit(outcome.success ? 0 : 1);
}

// Headless flag dispatch BEFORE TUI bootstrap (no alt-screen side effects)
try {
  if (first === '--version' || first === '-v' || first === '-V') await dispatchVersion();
  if (first === '--help'    || first === '-h')                    await dispatchHelp();
  if (first === '--check-update' || first === 'check-update')     await dispatchCheckUpdate();
  if (first === '--update'  || first === 'update')                await dispatchUpdate();
} catch (err) {
  console.error('[lazybuilder]', err?.message ?? err);
  process.exit(1);
}

// Fallthrough → TUI
await import(distMain);
