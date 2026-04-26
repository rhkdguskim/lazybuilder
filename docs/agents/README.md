# docs/agents — guides for AI tools

Read [`/agent.md`](../../agent.md) first. This directory holds the deep references it points to.

## Files

| File | Purpose | Read when |
|---|---|---|
| [quickstart.md](quickstart.md) | 30-second orientation for first-time invocation | A user just asked "use lazybuild for X" |
| [cli-reference.md](cli-reference.md) | Every flag, exit code, env var, output mode | Building a wrapper or CI step |
| [output-schemas.md](output-schemas.md) | JSON contracts for every output `kind` | Parsing structured output |
| [recipes.md](recipes.md) | Worked end-to-end agent workflows | Looking for a known-good pattern |
| [harness-integration.md](harness-integration.md) | How LazyBuild fits into an AI dev loop | Designing multi-step agent flows |
| [architecture.md](architecture.md) | Code map, layers, extension points, test harness | Modifying lazybuild's source |

## Stability matrix

| Section | Stability | Notes |
|---|---|---|
| Schemas tagged `buildercli/v1` | **Stable** | Additive changes only. Breaking change ⇒ bump to `v2`. |
| Headless CLI surface | **In design (P0)** | Flag names may shift slightly before v1.0; envelope and exit codes are locked. |
| Recipes | **Living** | Add freely; don't remove without a replacement |
| Architecture | **Synced to HEAD** | Update in the PR that changes the layout |
| Harness integration patterns | **Living** | Pattern catalog grows over time |

## Convention for AI agents reading these docs

- If a doc says **"planned"**, the feature does not yet exist in code. Use the programmatic fallback in `recipes.md` § Programmatic fallback until shipped.
- If a doc and the code disagree, **the code wins**. Cross-check against `src/`.
- Cite line ranges (`src/application/BuildService.ts:41-72`) instead of paraphrasing when explaining behavior to humans.
