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
const distToolchainCli = resolve(here, '..', 'dist', 'cli', 'toolchainCli.js');
const distIntelligenceCli = resolve(here, '..', 'dist', 'cli', 'intelligenceCli.js');
const distMcpCli = resolve(here, '..', 'dist', 'cli', 'mcpCli.js');
const distLspCli = resolve(here, '..', 'dist', 'cli', 'lspCli.js');

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
  lazybuilder                       Run the interactive TUI
  lazybuilder --version, -v         Print version and exit
  lazybuilder --check-update        Check for updates (JSON output)
  lazybuilder --update              Update to the latest version
  lazybuilder --toolchain-plan      Print install plan for missing .NET toolchain (JSON)
  lazybuilder --toolchain-apply     Install missing .NET toolchain (use --yes to confirm)
  lazybuilder --toolchain-sync      Sync to global.json (.NET) — install whatever is missing
  lazybuilder --toolchain-doctor    Diagnose .NET toolchain gaps (JSON)
  lazybuilder --regressions         Recent build regressions (Build Intelligence, JSON)
  lazybuilder --flaky               Recent flaky builds (Build Intelligence, JSON)
  lazybuilder --metrics-export      Export raw build metrics (NDJSON or JSON)
  lazybuilder mcp                   Run MCP stdio server (for AI agents)
  lazybuilder lsp                   Run LSP stdio server (for editors)
  lazybuilder --help, -h            Show this help

Toolchain options:
  --yes                  Skip confirmation, run install non-interactively
  --scope=user|machine   Install scope (user=no admin, default; machine=requires UAC)
  --continue-on-error    Keep going after a failed step
  --update-global-json   Pin SDK version in global.json after a successful install
  --dry-run              Resolve and print the plan without executing

Build Intelligence options:
  --days=N               Window (default 7)
  --project=<id>         Filter by project ID
  --format=ndjson|json   Export format (default ndjson)
  --since=ISO8601        Export since timestamp

Headless agent docs:
  https://github.com/rhkdguskim/lazybuilder/blob/master/agent.md
  https://github.com/rhkdguskim/lazybuilder/tree/master/docs/agents
`);
  process.exit(0);
}

async function loadToolchainCli() {
  if (!existsSync(distToolchainCli)) {
    console.error('[lazybuilder] dist/cli/toolchainCli.js missing — run "npm run build".');
    process.exit(1);
  }
  return import(distToolchainCli);
}

async function dispatchToolchainPlan(rest) {
  const mod = await loadToolchainCli();
  const code = await mod.runToolchainPlan(rest);
  process.exit(code);
}

async function dispatchToolchainApply(rest) {
  const mod = await loadToolchainCli();
  const code = await mod.runToolchainApply(rest);
  process.exit(code);
}

async function dispatchToolchainSync(rest) {
  const mod = await loadToolchainCli();
  const code = await mod.runToolchainSync(rest);
  process.exit(code);
}

async function dispatchToolchainDoctor(rest) {
  const mod = await loadToolchainCli();
  const code = await mod.runToolchainDoctor(rest);
  process.exit(code);
}

async function loadIntelligenceCli() {
  if (!existsSync(distIntelligenceCli)) {
    console.error('[lazybuilder] dist/cli/intelligenceCli.js missing — run "npm run build".');
    process.exit(1);
  }
  return import(distIntelligenceCli);
}

async function dispatchRegressions(rest) {
  const mod = await loadIntelligenceCli();
  const code = await mod.runRegressions(rest);
  process.exit(code);
}

async function dispatchFlaky(rest) {
  const mod = await loadIntelligenceCli();
  const code = await mod.runFlaky(rest);
  process.exit(code);
}

async function dispatchMetricsExport(rest) {
  const mod = await loadIntelligenceCli();
  const code = await mod.runMetricsExport(rest);
  process.exit(code);
}

async function dispatchMcp(rest) {
  if (!existsSync(distMcpCli)) {
    console.error('[lazybuilder] dist/cli/mcpCli.js missing — run "npm run build".');
    process.exit(1);
  }
  const mod = await import(distMcpCli);
  const code = await mod.runMcpServer(rest);
  process.exit(code);
}

async function dispatchLsp(rest) {
  if (!existsSync(distLspCli)) {
    console.error('[lazybuilder] dist/cli/lspCli.js missing — run "npm run build".');
    process.exit(1);
  }
  const mod = await import(distLspCli);
  const code = await mod.runLspServer(rest);
  process.exit(code);
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
  const rest = args.slice(1);
  if (first === '--version' || first === '-v' || first === '-V') await dispatchVersion();
  if (first === '--help'    || first === '-h')                    await dispatchHelp();
  if (first === '--check-update' || first === 'check-update')     await dispatchCheckUpdate();
  if (first === '--update'  || first === 'update')                await dispatchUpdate();
  if (first === '--toolchain-plan')                                await dispatchToolchainPlan(rest);
  if (first === '--toolchain-apply')                               await dispatchToolchainApply(rest);
  if (first === '--toolchain-sync')                                await dispatchToolchainSync(rest);
  if (first === '--toolchain-doctor')                              await dispatchToolchainDoctor(rest);
  if (first === '--regressions')                                   await dispatchRegressions(rest);
  if (first === '--flaky')                                         await dispatchFlaky(rest);
  if (first === '--metrics-export')                                await dispatchMetricsExport(rest);
  if (first === 'mcp')                                             await dispatchMcp(rest);
  if (first === 'lsp')                                             await dispatchLsp(rest);
} catch (err) {
  console.error('[lazybuilder]', err?.message ?? err);
  process.exit(1);
}

// Fallthrough → TUI
await import(distMain);
