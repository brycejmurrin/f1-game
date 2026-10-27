# Fleet cost model and context stops (2026-10-19)

Why the agent-fleet role cards carry per-role `STOP AT` limits, an output-size budget and a split watcher cadence.
Prompted by Bryce (2026-10-19, ORCH3 session): "do we need to fix any role templates … after doing web research about how costs work".

## Verified prices (fetched 2026-10-19)

Sources: <https://platform.claude.com/docs/en/about-claude/pricing>, <https://code.claude.com/docs/en/costs>,
<https://code.claude.com/docs/en/prompt-caching>, <https://code.claude.com/docs/en/claude-code-on-the-web>.

| Model | Base input | 5m write | 1h write | Cache read | Output |
|---|---|---|---|---|---|
| Opus 5.5 | $4 / MTok | $5 | $8 | $0.20 (0.05x input) | $20 |
| Sonnet 5.5 | $2 / MTok | $2.50 | $4 | $0.10 (0.05x input) | $10 |

Facts from the Claude Code pages: Claude Code re-sends the full conversation on every request and bills the unchanged
prefix at the cached rate, so "a one-line question in a session that has been open all day still draws usage for the
whole conversation" (costs); the main conversation gets a 1 h cache TTL on a subscription, 5 min on usage credits, API
key or cloud provider; subagents, forks and compaction get 5 min (prompt-caching §Which TTL); each model has its own
cache, so a model switch re-reads everything uncached; scheduled tasks and cross-session messages re-send the full
context on every firing (costs §Why usage climbs). Cloud sessions have no separate VM charge; usage counts toward the
plan (claude-code-on-the-web). Cost docs advise Sonnet for most work and delegating verbose output to subagents.

## Measured sessions (2026-10-19)

Cache-read $ = cache-read MTok x the verified rate above.

| Session | Model | Context | Cache read | Total $ | Cache-read $ | Share |
|---|---|---|---|---|---|---|
| physics-2 | Opus | 303k | 44.4M | 16.34 | 8.88 | 54 % |
| physics-1 | Opus | 261k | 35.4M | 14.02 | 7.08 | 51 % |
| car-1 | Sonnet | 211k | 22.3M | 5.43 | 2.23 | 41 % |
| render-2 | Sonnet | 419k | 53.2M | 10.05 | 5.32 | 53 % |
| fleet-watch-1 | Sonnet | 296k | 29.2M | 4.21 (34 min) | 2.92 | 69 % |
| fleet-watch-2 | Sonnet | 224k | n/a | 1.37 (13 min) | n/a | n/a |
| DEBUGGER-B | Opus | 252k | 27.8M + 1.14M uncached | 10.46 | 5.56 (+ 4.56 uncached at $4) | 53 % |

Cache reads are 41-69 % of every long session's bill; an idle fleet watcher is the worst case (69 %) because every
3-minute tick re-reads its whole context.

## Model

One request at context `c` costs `c x read_price`. A session that grows by `s` tokens per call from a base `B`
(system prompt, CLAUDE.md, tools; about 40k here) reads `sum(B + i*s)` over `N = (C - B)/s` calls, so cost per unit
of new work rises with `C`: about quadratic in calls. With `s = 5k`:

| Stop `C` | Calls N | Cache-read tokens | Per token of growth |
|---|---|---|---|
| 150k | 22 | 2.15M | 19.5 |
| 200k | 32 | 3.92M | 24.5 |
| 300k | 52 | 8.97M | 34.5 |

A handoff at 150k instead of 300k cuts cache-read dollars per unit of work by `1 - 19.5/34.5 = 43 %` (about 40 %).
The new session re-reads its `B` plus the handoff, which the table already counts. Opus to Sonnet halves the
cache-read price ($0.20 to $0.10) and the base input price, so it halves the bill again for the same shape of work.

## Context engineering sources

- <https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>: context rot, compaction, notes, subagents returning 1-2k tokens.
- <https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents>: progress file plus git; "compaction isn't sufficient".
- Pricing has no long-context surcharge on the 1M window (pricing page above).

Further transcript data (ORCH4, 2026-10-19): DEBUGGER-A 401k for $18.6 with cache reads about 60 % of cost; REVIEW-SYNTH-2 227k for
$9.2 but 618k of cache writes (about 2.7x its peak context, from rewrites); tooling-2 223k for $5.2.

## Soft and hard caps

Bryce, 2026-10-19 06:14Z: "Should we do both soft and hard caps as well as test auto compact on some sessions". Soft cap = the per-role limits
in launch-policy.md §Size stop; hard cap = soft + 50k. Measure live context (`/context`, statusline), not `get_session` `used_tokens` (turn-end only;
race-1 reported "120k (237k used)"). Fresh sessions start at about 50-60k. Do not hand off with under ~30 calls of work left.
The auto-compact trial (`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE`) is a separate pending experiment (ORCH5).

## Changes this drove

Per-role `STOP AT` (reviewer 120k, worker 150k, PR owner 150k / docs-only 100k, synth 150k, watcher 100k,
orchestrator 200k); a 10k-character budget on any tool result; the watcher split into a 60 s red loop, a 3-minute tick
and an hourly fresh-session sweep; watcher state held in the dashboard `db`; idle-wake discipline for owners; a
reviewer role card. See `.claude/skills/agent-fleet/references/launch-policy.md` §Cost and context.
