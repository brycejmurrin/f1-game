# Codex archive mining — 2026-10-26

What OpenAI Codex Cloud sessions on this repo spent their time on, 2026-10-01 → 10-17, and which of those costs the
current tree still carries. Bryce shared a private Drive folder ("Codex Archives Private 2026-10-26") holding a 61-part
export of Codex transcripts plus a generic findings report; he asked to "dig into the raw archives" and then "use
subagents to dive into everything deeply to find patterns". Session `session_01RrkwnTotSpmGMJQggtig8F`.

Read-only evidence. Every proposal below is a proposal; none is applied by this note. Prior art not re-reported:
[TRANSCRIPT-MINING-2026-10-16](TRANSCRIPT-MINING-2026-10-16.md), [AGENT-RETRO-2026-10-17](AGENT-RETRO-2026-10-17.md),
[FLEET-B-TRANSCRIPT-AUDIT-2026-10-26](FLEET-B-TRANSCRIPT-AUDIT-2026-10-26.md) (all Claude Code sessions; this is the
first pass over Codex).

## Method and coverage

- **Source.** 31 of the 61 zip parts were in the folder (the exporter's upload was paused). Each part was streamed,
  reduced to one compact record per item (command, exit, duration, output size and 300-char tail; MCP tool, args,
  result size; user messages; compactions; subagent events) and deleted. Result: **410 threads, 73,617 shell
  commands, 16,187 MCP calls, 872 user messages, 424 compactions, 12,320 subagent events, 421 command tool-hours**.
  Tool-hours are summed durations and overlap; they are not wall time. Reasoning was excluded by the exporter.
- **Lenses.** Five read-only analyst subagents, one per lens: gates and long jobs; polling and output volume;
  failures and retry loops; Bryce's messages; delegation and compaction. Three re-streamed raw parts for detail.
- **Verification.** Each finding was labelled OPEN / PARTLY-FIXED / STALE against the tree at `17b68ed7`. The two
  claims with code fixes attached were re-checked by hand; one was corrected (finding 6).
- **Limits.** Half the archive is missing, and the 10 biggest fan-outs keep only 4–30 % of their child threads, so
  child-side counts are lower bounds. No token or cost figures exist in the export.

## Ranked findings

### 1. The pre-push gate runs 211 node test files twice — OPEN

`gateOnly()` (`tools/ci/deploy.mjs:823-824`) runs `tooling-fast`, then every script of ci.yml's "Pure-node unit
suites" step (`gateNodeSuites()`, `deploy.mjs:227`). On today's tree **211 of those 333 files are already in
`TOOLING_FAST_FILES`** (`tools/ci/tooling-fast.mjs:77`): state-unit 56/61, steering 39/40, audio 34/39, garage 28/30,
mcp 26/26, desktop 9/9. That is about 1,070 s of recorded file time (~18 serial min) on every gate. The node half
exists to catch pins tooling-fast never runs (the comment at `deploy.mjs:229-234`); the overlap is incidental.
Archive: 388 real gate launches, median 32.5 min, p90 50 min, 142 tool-h (34 % of all command time).
**Proposal:** the node half runs only files tooling-fast did not run on the same tree (after confirming the npm
scripts set no different env); pin overlap = 0 in `tests/unit/prepush-gate-coverage.test.mjs`.

### 2. A gate that dies restarts from zero — OPEN

51 gates ended on a signal (12.5 tool-h); 46 were relaunched from scratch a median 4.5 min later, 24 with no edit in
between (301 min). Causes: 28 killed by the agent itself (deploy branch conflicted mid-gate, early FAIL), 12 Codex
exec-transport drops (ex −1), 6 a Bryce message in the window. Five of Bryce's 22 "Retry" messages followed a dead
gate. Agents hand-built resume: 110 commands in 34 threads import `gateNodeSuites`, 88 write `*-gate-resumed.log`.
`tooling-fast` already stamps a tree hash (`tooling-fast.mjs:421-439`) but only `ready-gate` reads it;
`deploy.mjs:820-873` keeps no per-stage state. **Proposal:** per-stage receipts in `artifacts/logs/` keyed by
work-tree id (`tools/lib/work-tree-id.mjs`) and `deploy.mjs --resume`, refusing when the tree changed.

### 3. Cheap failures surface last — OPEN

37 of 51 reds with a known stage failed inside the guard suite at a median 7.6 min; 72 of 96 failing files run in
under 10 s, and 25 are in the 43-file `test:guards` set (ratchets, merge-hygiene, docs-integrity,
changelog-fragments). The gate orders longest-first with no `--bail` (`deploy.mjs:641,823`;
`tooling-fast.mjs:118-121`). Only 1 of 124 standalone tooling-fast runs used `--changed`. **Proposal:** a fast
prefix in `gateOnly()` (guards → `--changed` → last-failed, with `--bail`), then the full pass skips what the prefix
passed. Context: tooling-fast grew 347 → 647 files in the archive window (median 264 → 622 s) and is 913 today,
while the gate still pins `--jobs=2`.

### 4. Codex watched CI through the GitHub connector, not `ci-watch` — OPEN (guidance)

MCP `github.fetch`: 6,862 calls, **468 MB** of results, in 42 threads (one thread: 2,251 calls, 109 MB). Top
endpoints: `actions/runs/<n>/jobs` 2,840 calls / 182 MB, `actions/runs` 1,036 / 120 MB, `commits/<sha>/check-runs`
278 / 51 MB; the same URL was re-fetched 5,113 times at a median 66 s. 86 % of those calls came from threads where
`ci-watch.mjs` also ran fine (843 calls, 2.6 MB total, ~20× cheaper per call). **2,271 results were truncated at
~64 KiB mid-JSON**, which drove 1,078 `&page=N` retries; `/actions/workflows/*` and `/actions/jobs/<n>` fetches
failed 78 of 78. `AGENTS.md` rule 13 names Claude Code and Cursor only; `agent-fleet/references/adapters.md:13-22`
has no Codex column. **Proposal:** a Codex clause in rule 13 (one foreground `ci-watch.mjs --sha … --failures-only`;
never poll `actions/*` or `check-runs` through the connector; results over ~64 KiB arrive cut) and a Codex column in
adapters.md.

### 5. Log polling: ~34 polls per long gate, `wait-for` never used — PARTLY-FIXED

25,834 log reads (24,680 `tail`) in 280 threads; per gate of ≥10 min a median 34 polls and 21 commentary messages;
472 `sleep` commands and 337 `while`/`until` loops; `wait-for.mjs` used 0 times. `deploy.mjs --status/--wait`
(`deploy.mjs:1040-1055`) and `wait-for.mjs --log-matches` exist, but AGENTS.md step 6 and skill `check-changes` do
not mention `deploy.mjs --wait`, and `wait-for.mjs:26` caps foreground waits at 590 s, a Claude Code limit Codex
does not have. **Proposal:** name `deploy.mjs --wait` in step 6 and check-changes; a Codex line in rule 4.

### 6. Stacked `test-bg --wait` waiters — OPEN (corrected)

73 of 91 `test-bg --wait` calls exited 1, but they trace to only 4 red runs (two 2-second setup failures, one
non-browser half after "20/20 passed", one death at loadavg 9.75); no browser test failure. 65 of the 73 are one
thread where Codex launched a new `--wait` every ~33 s while earlier ones still blocked, all returning together.
A subagent claimed `--wait` reads a stale registry; that is wrong — each start keeps only live runs
(`test-bg.mjs:624-627`), so a wait with nothing running reports the last batch by design. **Proposal:** a
single-waiter lock (`test-bg.mjs:78-90`); print "nothing ran during this wait; last verdict …"; name the failing half
in `outcomeOf` (`:177-182`).

### 7. Bryce's nudges: 140 approvals, 48 "Check", 29 "Retry" — PARTLY-FIXED

872 user messages; 248 of 763 human-typed are ≤12 chars. About 45 approvals only got an agent past a hold it had set
on itself (queue hold, ready cap, someone's claim); he overrode 8 times in so many words. The queue hold and
`ready-full-cap` are retired since (STALE). Still open: a merge asked for before CI is green needs a second "Merge"
(`.claude/skills/ship/SKILL.md:32-34` does not say the grant survives the CI wait). 41 of 48 "Check" messages came a
median 7.5 min after a final answer that claimed "monitoring remains active" with nothing armed; when watching, he
re-checks every ~9 min (p25 7.2, p75 22.3) — data for the check-in cadence still pending him in memory
`short-pr-check-ins`. 11 "Retry" messages came in one 3-minute burst across 11 threads (host-side drop). 16 times he
relayed the same order to 3–11 sessions by hand.
**Proposals:** an in-session merge request stands until that PR merges (gate, then `wait-for.mjs --merged`); a
"monitoring" claim names the armed wake and an ETA in Pacific time.

### 8. Questions agents did not need to ask — PARTLY-FIXED

Of 13 questions put to Bryce, 9 are unnecessary under today's rules (retired holds and caps; the PR owner watches its
own CI), 2 are borderline, 2 were real (a repro detail; a live claim). Every scope question ("which part first?",
"which direction?") got "All" or "(Recommended)". **Proposal** (memory `ask-via-askuserquestion`): for a scope
question, take "All" or the recommended option, say so, and proceed.

### 9. A user message interrupts every running Codex subagent — OPEN (Codex)

37 of 55 child interruptions came within 60 s of a user message (child median age 4.6 min); only 6 interrupted
children were respawned. Two waves lost 19 audit children each after "Fix all in pr" / "use many subagents like 10".
Parents also blocked on untargeted `wait` calls: 2,323 calls, 27.5 tool-h, 45 % timing out empty. Within parents,
more live children did mean more output: 0 live → 1.8 edits/h and 0.53 commits/h; 6+ live → 9.2 and 1.44, without
more waiting; distinct files per hour stayed flat (1.5–1.7). **Proposals:** a Codex row in
`agent-fleet/references/multi-host.md` (list interrupted children, then respawn or strike each); "a parent never
blocks on a worker" in `.claude/agents/README.md`; a 3–6 concurrent-worker default on disjoint OWNED paths in
agent-fleet §In-session worker.

### 10. Instruction re-reads and oversized output — OPEN

AGENTS.md was read by shell 1,386 times (35.7 MB) although Codex loads it natively (`.codex/config.toml:7`); 632 of
those were repeats within one compaction segment. Skill files: 1,380 reads (check-changes 447, steward 349,
agent-fleet 212). Post-compaction windows re-read AGENTS.md ~3× more, with no lost-state reruns. Outputs over 20 kB
were 5,100 of all commands but 213 MB (51 %) of output: whole-file `cat` (AGENTS.md 821×, `js/game.js` 254×),
`rg` without `-m`, and 621 `github.create_blob` calls carrying whole file bodies through the model.
**Proposals:** AGENTS.md header: the file is already in context, re-read one section by line range; a ≤20 kB print
rule in §Critical conventions (write to `artifacts/`, print a count; files reach GitHub by `git push`).

### 11. Failure classes worth a fix — OPEN unless noted

| Class | Threads | Note / proposal |
|---|---|---|
| Credential expiry mid-session (126 auth failures, 107 HTTP 401) | 42 | first at a median ~5 h; nothing classifies a 401 — a shared `isAuthError` in `tools/lib` and "= auth expired — stop" |
| No install after clone; `doctor.mjs:10` imports `yaml` statically, so the doctor crashes without deps | 34 | make the import dynamic; a Codex bootstrap recipe in `docs/AGENT-SURFACE.md` §Bootstrap |
| Tailing a log before it exists | 27 | `wait-for` waits for the file, exits on the verdict line |
| Agent files read as skills (`.claude/skills/ci-red-triage/…`) | 14 | name `.claude/agents/<name>.md` in AGENTS.md routes |
| `props-tris-baseline.json`, `clip-baseline.json` conflicts | 7 | not in `cureableConflicts()` (`deploy.mjs:434-462`) |
| `sync-pr` missing cached PR ref | 6 | `sync-pr.mjs:158` should fetch it |
| Node 24 in Codex vs 22 in CI (646 wrapper calls) | 21 | doctor warns on a major-version mismatch |
| `ratchets.json` / `CHANGELOG.md` conflicts | 27 | STALE — sharded / fragments |
| Concurrent heavy jobs on one box | — | STALE as a concern: 0.50 vs 0.44 non-green, preflight refusals work |

### 12. Bug reports — mostly fixed

No game bug was reported again in a later session; repeats happened within a session. Still OPEN or unverified:
garage camera always the same angle (`js/garage/setup-camera.js`), Photo Studio from the title screen shows no car,
old UI flashing before the profile loads. Fixed since: stuck SAFETY CAR with cautions off
(`js/race/race-control.js:303-310`), rival noise toggle (`js/audio/engine.js:2757-2771`), mobile garage scroll.

## Next step

Findings 1–3 and 6 are tool changes (`tools/ci/deploy.mjs`, `tools/ci/test-bg.mjs`); 4, 5, 9 and 10 are
`AGENTS.md` / `.claude/**` edits that need Bryce's word; 7 and 8 are memory entries.
