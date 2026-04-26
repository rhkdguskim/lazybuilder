# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Centralized timeout buckets in `src/config/timeouts.ts` with env overrides via `LAZYBUILDER_TIMEOUT_*`.
- Structured NDJSON logger (`src/infrastructure/logging/Logger.ts`) with `trace..fatal` levels, child bindings, and daily-rotated default log file at `~/.lazybuilder/logs/lazybuilder-YYYYMMDD.ndjson`.
- Logger env knobs: `LAZYBUILDER_LOG_LEVEL`, `LAZYBUILDER_LOG_FILE`, `LAZYBUILDER_LOG_STDERR`.
- `EnvironmentService.scanWithDiagnostics()` returns per-detector failures (`DetectorFailure[]`) so a single hung tool no longer blocks boot.
- `unhandledRejection` handler now routes through the structured logger.
- ESLint 9 flat config + Prettier 3 + new `lint:fix` / `format` / `format:check` scripts.

### Changed
- `EnvironmentService.scan()` is preserved for backwards compatibility but now delegates to `scanWithDiagnostics()`.
- `ProcessRunner` instruments spawn / error / exit / timeout via the logger.
- npm tarball is leaner: `agent.md` and `docs/agents/` are no longer published. They remain in the GitHub repo. README now links out to the docs on GitHub.
- `BuildTab.tsx` decomposed from 848 LOC monolith into `src/ui/tabs/build/` with `useBuildTargets` + `useBuildController` hooks and 7 focused presentational components. Same behavior, ~55% smaller orchestration shell.

### Repo / CI
- New GitHub Actions workflows: `ci.yml` (typecheck + lint + format check + vitest + build, matrix Node 20/22 × ubuntu/windows/macos, plus a `pack-smoke` job that asserts `agent.md` and `docs/` are excluded from the tarball) and `release.yml` (auto-publishes to npm with provenance on `v*` tags).
- Dependabot enabled for npm and github-actions.
- New issue/PR templates and `CONTRIBUTING.md` + `SECURITY.md`.

### Removed
- Hard-coded timeout literals in detectors / updater / DevShellRunner. Use `TIMEOUTS.<bucket>`.
- `console.error` in `main.tsx` — now uses `logger.fatal`.

## [0.1.1] — 2026-04-26

Initial published release. See `git log` for details.
