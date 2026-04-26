# Contributing to LazyBuilder

Thanks for the interest. This is a small, opinionated codebase — read [`agent.md`](agent.md) once before opening a non-trivial PR.

## TL;DR

```bash
git clone https://github.com/rhkdguskim/lazybuilder.git
cd lazybuilder
npm install
npm run dev          # tsx, hot dev
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest
npm run build        # tsc → dist/
```

## Conventions you must follow

1. **Layer flow is inward only.** `ui → application → domain` and `infrastructure → domain`. Never the reverse. See [`docs/agents/architecture.md`](docs/agents/architecture.md) § 1.
2. **All subprocess calls go through `ProcessRunner`** (`src/infrastructure/process/ProcessRunner.ts`). Never `child_process.spawn` directly outside it (and `DevShellRunner`).
3. **No hard-coded timeouts.** Use `TIMEOUTS.<bucket>` from `src/config/timeouts.ts`. Operators tune via `LAZYBUILDER_TIMEOUT_*` env vars.
4. **No `console.*` outside `bin/`.** Use `logger.child({ component: '<X>' })` from `src/infrastructure/logging/Logger.ts`.
5. **TypeScript `strict`.** No `any` without an inline disable comment.
6. **Docs PR-couple.** Behavior changes update `agent.md` + `docs/agents/` in the *same* PR.

## Branch & commit

- Branch from `master` (or `main`).
- One logical change per PR. Refactors and behavior changes belong in separate PRs.
- Conventional commit subject is appreciated but not enforced: `fix:`, `feat:`, `docs:`, `refactor:`, `chore:`.

## Tests

- Pure logic (rules, parsers) → unit tests next to the source (`<Name>.test.ts`).
- Adapters / detectors → use a `FakeCommandPort` (planned — until then, factor pure helpers and test those).
- TUI → `ink-testing-library` scenarios.

The current bar is **don't regress** existing tests. We are growing coverage incrementally — see `docs/agents/architecture.md` § Test harness.

## Releasing (maintainers)

1. Bump `version` in `package.json`.
2. Update `CHANGELOG.md` Unreleased → new version section.
3. Commit, then `git tag vX.Y.Z && git push --tags`.
4. The `release.yml` workflow publishes to npm with provenance and creates a GitHub Release.

## Code of conduct

Be kind. Assume good intent. Stay on topic.
