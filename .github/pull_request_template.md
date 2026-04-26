## Summary

<!-- 1-3 bullets. What changes, and why? -->

## Behavior change?

- [ ] No behavior change (refactor/docs/test)
- [ ] Behavior change — docs in `docs/agents/` and `agent.md` updated in this PR

## Test plan

<!--
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] Manual: ran `lazybuilder` against …
-->

## Conventions checklist

- [ ] No hard-coded `{ timeout: <number> }` — used `TIMEOUTS.<bucket>`
- [ ] No new `console.*` outside `bin/` — used `logger.child(...)`
- [ ] No new `child_process.spawn` calls outside `ProcessRunner`
- [ ] Layer dependencies still flow inward
