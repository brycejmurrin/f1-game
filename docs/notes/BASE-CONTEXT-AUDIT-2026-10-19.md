# Base-context audit — 2026-10-19

Goal (Bryce, 2026-10-19: "Yes, audit and trim"): fresh sessions read ~50–60k tokens per call before work starts.
Guidance: [costs](https://code.claude.com/docs/en/costs), [memory](https://code.claude.com/docs/en/memory)
(keep CLAUDE.md under ~200 lines; move rarely-needed detail to skills / path-scoped rules).

## Measurement (bytes ÷ 4 ≈ tokens; `/context` is not callable from an agent turn)

| Item | Bytes | ≈ tokens | Owned here? |
|---|---|---|---|
| AGENTS.md (imported by CLAUDE.md) | 28 318 | 7 100 | yes |
| CLAUDE.md | 259 | 65 | yes |
| `.claude/rules/fleet-core.md` | 1 393 | 350 | yes |
| MEMORY.md index | 2 537 | 630 | yes |
| 46 skill descriptions (frontmatter) | 13 680 | 3 400 | yes (agent-fleet excluded) |
| 15 subagent descriptions | ~5 800 | 1 450 | yes |
| Controllable subtotal | ~51 900 | ~13 000 | |
| MCP server instructions, deferred-tool name lists, built-in system prompt and tool schemas, hook output | — | the remaining ~40k | no (harness/MCP; hooks forbidden) |

Finding: only ~25 % of the base is repo-controlled. The rest is MCP servers (TinyFish ×2, BrowserStack, Drive, Docs,
Context7, apex-*), their deferred tool lists and the harness. Removing unused MCP servers from `.mcp.json` / connectors
is the largest remaining lever, but is outside this lane (settings forbidden).

## Changes

- AGENTS.md `### Backlog` (760 B) → two-line pointer to `docs/notes/AGENT-WORK-TRACKING-2026-10-14.md`: −513 B, −3 lines.

## Left in place (pinned by a test or hook)

- `## Baked asset pack` — `docs-integrity.test.mjs` "matTexMix default" reads that section of AGENTS.md.
- `## Cursor Cloud specific instructions` — `agent-surface.test.mjs:160` pins the heading.
- Hook names and `allow-protected` — `agent-config.test.mjs` requires them in AGENTS.md.
- AGENTS.md is capped at 200 lines / 28 500 B / 75 rule lines by `agent-config.test.mjs`; it is now below all three.

## Skill descriptions

Longest are 400–480 B (new-track, lighting-tuner, agent-view, asset-pack). Total 13.7 KB, ~300 B average: already
terse, and their routing text is what `skill-hint` and the description-budget tests depend on. Overlapping pairs worth a
future merge: `compound-debug`/`compound-verify`/`compound-review`, `check`/`check-changes`, `ship`/`steward`. No edit made.

## After

AGENTS.md 28 318 → 27 805 B (≈ −130 tokens per call). Honest result: a small cut; the big lever is MCP server count.
