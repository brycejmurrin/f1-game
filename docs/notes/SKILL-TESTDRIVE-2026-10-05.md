# Skill, MCP and agent test-drive — 2026-10-05

One Sonnet subagent per skill (30), one realistic task each, offline; the six
custom agents on a real read-only task each; every MCP server poked live.
Measured facts only; the PR carries the per-skill fixes.

## What the research settled first

Anthropic's skill-authoring guide (platform.claude.com, read 2026-10-05) says a
reference file over 100 lines gets a table of contents, because a reference
reached through another reference may be previewed with `head -100`, and that
references stay one hop from SKILL.md. It does NOT apply to CLAUDE.md, AGENTS.md
or SKILL.md: those load whole (AGENTS.md up to 4 MiB at launch; a SKILL.md as
one message on invocation), and the Claude Code memory page's rule for them is
the opposite — under 200 lines, because adherence drops with length. The
"models only read the first 100 lines" rumour conflates the two. Enforced now by
`tests/unit/agent-config.test.mjs` ("every skill reference is linked from its
SKILL.md and, past 100 lines, opens with a Contents block").

## MCP servers

| Server | Result |
|---|---|
| apex-tools | 9 read-only wraps OK (status, doctor 151/1/0, session_status, pick_tests, who_is_on_it, ci_status, select_specs, bump_cache_check, job_status) |
| chrome-devtools | `new_page` + `evaluate_script` on 127.0.0.1:3456: `__apex.info()` answered, 15 agentHelp keys |
| playwright-official | BROKEN as shipped: the bare `npx -y @playwright/mcp@0.0.79` wants the `chrome` channel (/opt/google/chrome); `--browser chromium` wants chromium-1237 (the build its bundled Playwright pins) while the container has chromium-1194. Fixed: the catalogs launch `bash tools/mcp/playwright-mcp.sh run`, which passes `--executable-path $(node tools/lib/chromium-path.mjs --path)`; `browser_navigate` then returns the page title. The 2026-09 "wrapper failed to connect" was `--isolated` combined with `--user-data-dir`. |
| github, TinyFish, Claude_Docs (host) | OK |

## Custom agents

deploy-research (live == tip, zero lag), ci-red-triage (no red in 30 runs),
physics-contract-auditor (no BLOCKER, 40 sites classified) and track-surveyor
(a dry-run Monaco survey that found the scenery frame defect in the PR's
handoff) ran as designed. Two agents ran out of turns before reporting and
handed back only after a nudge: **bloat-auditor** (40 turns on a six-file
scope, one BLOAT row) and **verify-agent** (`maxTurns: 8`, Haiku: the fast
gate took 470 s under loadavg 20 and the agent spent its turns polling). Both
caught real things — the verify-agent's one red was a test still pinning the
old Playwright launch line — so the fix is a "report what you have" stop in
each brief, not a bigger cap.

## Tool defects found by the drive (fixed here)

`--help` booted Chromium in four agents (`apex-eval.mjs` took `--help` as a
track id; the bash guard does not catch it inside a subagent) and was a poll,
a default run, a stack trace or exit 1 on nine other tools. All ten now answer
`--help` before work and sit in `tests/unit/game-tools-help.test.mjs`.

## Concurrency

20 concurrent subagents held loadavg at 10–13 (17 with the gate running), so a
"`node --test` only under loadavg 3" rule made most agents skip their unit runs.
Cap at ~12, or allow one-file `node --test` at any load.

## Routing eval

`tools/check/skill-routing-eval.py` on claude-fable-5-1: **213/224** with 4
workers under loadavg 20+ (the eval's own `claude -p` sessions spawn the three
MCP servers each, so the eval IS the load). Re-running the 11 misses alone at
loadavg 6: 6 routed correctly, 5 still went to Bash first (race-incidents
"make the cones settle faster", season-mode "implement flPoint", slim-bloat
"AGENTS.md has grown repetitive", steward "I marked the PR ready and the
earlier run shows cancelled", track-realism "a repeatable research skill").
Net ≈ 218/224 (97 %) against 214/216 (99 %) on 2026-09-30; none of those five
descriptions changed today, so the drift is model behaviour on "implement /
do" phrasings, not vocabulary. The two query files added today (replay-camera,
f1-animation-cameras) scored 16/16 and are not in the 224.
