# Agent surface reset — plan and evidence (2026-11-03)

Status: IN PROGRESS on branch `cursor/agent-surface-reset-7f3a` (one PR, every layer). Bryce, 2026-11-03, in the
reviewing session: "Let's fix all and add/edit new skills agents and any changes within one pr" — the grant for the
hook, settings and memory edits below (recorded as D-001 in ./docs/DECISIONS.md). Paths written as `./x` do not exist
yet at the time of this commit; they are created by this PR. The review reports this plan summarises were produced in
`scratch/review-2026-11-03/` (ignored); the evidence that matters is reproduced here.


2026-11-03 · deploy tip `c35963c0` · lead: this session (Fable 5.1) · reports in `scratch/review-2026-11-03/`

## 0. How this was produced

- Six adversarial Opus reviewers, one per layer: `01` AGENTS.md + rules, `02` docs, `03` skills, `04` subagents + workflows,
  `05` orchestration, `06` MCP + vendor tools. Each wrote a ≤120-line report with `file:line` evidence.
- Six Opus designers, each given the reviews and asked for a decision, not a list: `10` dispatcher, `11` rulebook (with a
  draft AGENTS.md), `12` verification cost, `13` hooks, `14` knowledge, `15` skills + subagents.
- An independent `finding-verifier` re-probed the 15 highest-severity claims on the tree: **15/15 confirmed** (two clauses
  softened, noted inline).
- My own checks: AGENTS.md and process word counts, `list_triggers`, live GitHub state, `select-specs` floor on the last 18
  game merges (**null on 18/18**), skill-hint on 8 phone prompts (2/8, one wrong), hook latencies, apex-lsp/apex-tools calls,
  and the platform docs (code.claude.com, platform.claude.com, Context7) for every claim a design depends on.

## 1. The verdict in ten lines

1. The game-facing half of the surface is accurate and well made: every `__apex` hook, path, flag and constant checked out;
   the 30 domain skills are small, routed by disciplined descriptions, and their references are correct.
2. The process half is where the rot is. It is 80 % of AGENTS.md by bytes, restated in 4–6 places per rule (51 of 128 rules
   have ≥ 2 homes), and several of its "hook-enforced" claims are false or point at nothing.
3. The 2026-10-27 redesign's principles have already regressed: a persistent coordinator session with a lock is back, three
   receipt systems are back, `merge_policy.py` is back, and the rulebook is ~9k words for a worker against a 1.5k target.
4. The coordinator is dead right now: every dispatcher scheduled task is disabled (the newest since 11-02 12:20Z), by the
   "pause when idle" rule that has no resumer. 6 dispatcher sessions and 7 triggers in a week is the rotation problem renamed.
5. The local-browser-run doctrine (rules 2, 5, 6, 7, half of 8 and 10; test-bg, stop-guard, live-run; ~1,700 lines) guards a
   practice agents have abandoned: 0 of 60 recent merged PRs ran a local group, and the "ONE floor spec" is null on 18/18.
6. Authority is an honor system ("a quoted relay of Bryce's words counts") while GitHub already records the one signal that
   would make it checkable (`performed_via_github_app` is null on Bryce's own clicks, `claude` on every agent write).
7. Three vendor-control MCP tools can launch, message or delete other agents under Bryce's own logins, are blanket-allowed,
   unhooked, and unmentioned by the contract.
8. The in-session `worker` subagent has had no MCP tools since it was written: its `tools:` uses the bare `mcp__server` form,
   which the current docs say matches nothing.
9. Knowledge is write-only: 306 top-level notes (+7.5/day), 60 with zero citers, 277 about the agent process; 45 inline
   "Bryce said" quotes serve as the decision record.
10. The platform now offers the pieces the home-built coordinator was imitating: GitHub-event-triggered scheduled tasks,
    an HTTP `/fire` endpoint, auto-fix PR watching, subagent `hooks:`/`skills:` frontmatter, skill `paths:`. Most of the
    bespoke machinery can be replaced by them or by GitHub itself.

## 2. What is good — protect it

- GitHub as the only state store; `land.yml` + the "Deploy-reset" ruleset (one required check `gate`, merge commits only,
  binds admins). `land.yml`'s trust split (PR code only in a read-only leg) is careful and cited.
- `planDispatch` is pure and tested (53/53). The decisions are right; only the executor is wrong.
- `tools/manifest.cjs` as the one load-order truth, generated shells, byte-identity tests; `gen:check`; the ratchets.
- The PR body as the session log: agents really keep the Plan live, and `ready-gate`'s Plan-closed check has teeth.
- The verification table scaled to the change; `pick-tests`; `remote-group.mjs` (45 dispatches in 4.6 days, 8–21 min).
- The browser ban for subagents is double-enforced and fails closed. `READONLY_AGENTS` + REPORTER/SURVEYOR scopes are real.
- apex-lsp is correct and fast; `lsp-hint` nags at the right strength. The six MCP configs are lockstepped and tested.
- Domain skills: thin bodies, "Use when … Not X → y" descriptions, every arrow resolves. `renderer-debug` is the model.
- code-survey's effort→model tiering and the two-lens verifier panel: the one measured win (hunt 7: 16 confirmed, all fixed).
- The nested `js/track` / `js/circuits` AGENTS.md files: short, local, incident-grounded.

## 3. Findings that matter (all verified; details in the numbered reports)

**Stated enforcement that does not exist**
- AGENTS.md:147-149 attributes bash-guard's refusals (`pkill -f`, PID kills, run cancels, force/deploy pushes) to
  `.githooks/pre-commit`, which only runs tests. (01#1)
- `Ratchet-Reason:` trailer is read from `COMMIT_EDITMSG` inside pre-commit, before git writes the new message: a stale
  trailer grants 40 lines, the current one is ignored. (01#2)
- "Every session hands off at 300k": `context-cap.py` has no default; a session without `STOP AT` has no cap. (01#6)
- `APEX_RUN_CANCEL_OK=1` anywhere in the command text — a trailing comment — disables the never-cancel refusal. (05#5)
- `launch-gate --override` accepts any non-empty string, even at quota `rejected`. (05#7)
- REST/GraphQL merge and arm routes get *ask*, not deny, despite "no session merges". (05#8)
- Chrome MCP beside a Playwright run: no mechanism at all; `mcp-browser-guard` checks subagents only. (11 A65)

**Rules that point at nothing or contradict each other**
- "the one timer allowed is the bounded safety check-in, WORKERS §4": no §4, definition deleted 10-30, WORKERS:107 says
  "no send_later", worker item 4 says "do not invent a timer". (01#3, 03#1, 05#4)
- A red after `land`: worker says "not you", AGENTS.md says "work NOW", dispatcher re-owns after 2 h. No owner. (03#5)
- `/orchestrate` implements the orchestrator role WORKERS.md lists as retired; its NEVER list forbids quarantining a test
  that AGENTS.md rule 9 tells agents to quarantine. (02#1, 03#3-4)
- The pre-push floor has five write-ups with different first commands; `verify-change.mjs`'s generated doc line says the
  opposite of rule 3. (02#2-3) The floor spec itself is null on 18/18 recent game merges (my run) and 39/40 (12 E5).
- WORKERS.md says `gh api search/*` is refused in cloud sessions; it works here (total_count 4). (00)

**Regressions against the 10-27 plan** — §3.2 no coordinator process → persistent session + lock; §3.1 no receipts →
three receipt chains; §3.3 removes `merge_policy.py` → 337 lines with dead ASK text; §3.9 worker page ≤ 1,500 words →
~9,000 words of required reading; coordination code 27.9k → ~34k lines. (00)

**Subagent seams** — `verify-agent --base` is hard-refused by `READONLY_GIT` (worktree verb); `track-surveyor`'s one
allowed memory write is refused and its first-denial rule then aborts the survey; `total-audit` asks for row kinds
`subagent-contract.py` bounces; `worker.md`'s bare `mcp__server` entries grant nothing; `Explore` is not in
`READONLY_AGENTS`; `node -e` / `python -c` / `npm run gen` writes pass for reporters. (04#1-5,12; 15)

**MCP / vendor** — `apex_cursor_agents` launch/delete, `apex_claude_agents followup` (`claude -p --cloud`, logged in here)
and `apex_codex_control` are blanket-allowed and unhooked; `claude-transcript.py` drives the TUI through a PTY to export
when `list_events` + `session-transcript.mjs` exist; `codex-cloud.py` speaks a raw WSS to an undocumented backend with the
consumer token; Codex's MCP door omits `issue_write`; the output gateway adds 7–19 % to every tool listing with no
measured saving; ~17 apex wraps are pure pass-throughs. (06)

**Docs / knowledge** — 512 note files, 60–70 unlinked, `Supersedes:` used twice; `rulebook-guards` pins 14 literal
sentences, so paraphrases carry the contradictions; `DEFECT-LEDGER` has no hunt since 10-28; 47 files tracked under
ignored `artifacts/` and `scratch/`; `REPORT.md` at repo root is a stale Cursor fleet report. (02, 14, 00)

**Live operational issues** — dispatcher paused since 11-02 12:20Z with a pending `needs-owner` for #4510; #4379
`needs-decision` idle since 10-30 (nothing notifies Bryce: comments written as `brycejmurrin` do not reach his phone);
bot PR #4436 (ratchet fold) green and jammed for 3 days because nothing owns bot PRs. (05)

## 4. The design

### 4.1 Coordination: GitHub is the dispatcher; the cloud only runs workers

Platform facts (verified this session, URLs in `10`): a cloud scheduled task can be fired by `POST …/routines/{id}/fire`
(returns a session id; 30/h per task, no idempotency key); scheduled tasks also take **GitHub event triggers**
(`issue.labeled`, `pull_request.labeled` with label/draft filters; each event = a new session; Claude GitHub App is
installed); a run is a full cloud session with the repo's skills, `.mcp.json` and `.claude/settings.json` hooks (single
repo); `performed_via_github_app` is `null` on Bryce's clicks and `claude` on agent writes; the repo is public so Actions
are free. Unverified (one experiment): whether a fired session has `subscribe_pr_activity`.

**Target:** one `dispatch.yml` (cron hourly + `issues`/`pull_request` labeled + `check_suite` + `issue_comment` +
`workflow_dispatch`, one `concurrency` group) runs the existing pure `planDispatch`, writes labels and the Board with
`GITHUB_TOKEN`, and launches each `CREATE_SESSION` by firing one Bryce-owned "Apex worker" scheduled task with a one-line
address (`ISSUE n` / `CONTINUE PR n` / `DEPLOY-RED`), then posts the claim comment with the returned session id. Nudges
become PR comments. Archiving, the lock, PAUSE/RESUME, launch receipts, `--children`, `@parent` and dispatcher hand-offs
all go. Alternative launcher kept in reserve: `claude-code-action@v1` with `label_trigger` + `CLAUDE_CODE_OAUTH_TOKEN`
(runs on the runner, no phone steering, 6 h cap).

Why not the first-party Projects coordinator: project threads do **not** load `.claude/skills`, `.claude/agents`,
`.mcp.json` or `settings.json` hooks/permissions (docs, verified). Until enforcement lives entirely in GitHub (ruleset +
CI), Projects would strip this repo's guard layer. Revisit after §4.3/§4.7 land.

**The experiment first (≈30 min, ≈$1):** Bryce creates the "Apex worker" task with an API trigger and the saved prompt
from `dispatch.mjs`'s header; a `workflow_dispatch` job fires it with `PROBE: list your tools; subscribe_pr_activity on
#4436 then unsubscribe; comment the result`. Bryce adds/removes a scratch label from GitHub Mobile. That settles the tool
list, payload opt-in, claim path, bot-mention notification and mobile provenance. If `subscribe_pr_activity` is missing,
workers end at their first push and the Action re-fires `CONTINUE PR` on a red `check_suite` or on Bryce's answer — which
is the 10-27 plan's "a lane ends; it does not wait" anyway.

### 4.2 Verification: no local browser test runs; CI gives drafts a browser verdict

Measured (12): 0/60 merged PRs ran a local group; floor spec null 39/40; CI already runs change-aware `selected` specs on
ready PRs; `remote-group` median 8–21 min vs 30–45 local; CI is $0 (public); ~147 label/edit noise runs a day exist only
because `run-ci` is a label.

**Target (P2 + simpler trigger):** agents never run a browser test locally (Bryce may grant one by name); interactive MCP
pokes stay, one browser at a time; `ci.yml` drops `labeled`/`edited` from its triggers, every draft push gets the fast tier
plus one budget-capped `selected` shard, `run-ci` and `CI: run` retire. The local floor becomes `tooling-fast --changed`
(+ `verify-track` for a circuit). One rule replaces 2, 5, 6, 7, 8a, 10a. Deletable ≈1,700 lines (test-bg 807, its tests
419, live-run 129, stop-guard 73, protect-files live rule, bash-guard supervisor rule, ~250 lines of TESTING.md, ~100
lines of ci.yml gate copies). Cost ≈+600 job-min/day; latency push→browser verdict ≈12 min; risk accepted: a red shows
one push later.

### 4.3 Authority: provenance, not quoted relays

`./tools/ci/lib/provenance.mjs`: a grant is a label event or a `decision:` comment whose actor is `brycejmurrin` and whose
`performed_via_github_app` is null. Readers: dispatch (`priority`, `dispatch:pause`, clearing `needs-decision`),
merge-gate's `hold` row (only Bryce lifts a hold Bryce set; Board shows hold actor + age). Delete "a quoted relay counts"
everywhere, `launch-gate --override`, and the paragraphs on telling relays from paraphrases. Workers' questions: ONE
channel — `needs-decision` + one comment; `dispatch.yml` posts one `@brycejmurrin` digest from `github-actions[bot]` so
his phone is notified; his click or `decision:` comment wakes the subscribed worker or fires `CONTINUE PR`.

### 4.4 Rulebook: AGENTS.md 3,462 → 1,184 words; WORKERS.md retired

`AGENTS.draft.md` (11) keeps rule numbers 1–13 (≈170 citations), the loop, layout, physics, generated-files and deploy
facts, and links everything else. Accounting: 128 rules → 39 stay always-on, 6 become path-scoped rules, 56 move to the
skill that already holds them, 17 become a one-clause pointer at the hook that enforces them, 10 are deleted. A worker's
required reading drops to ≈2,100 words. Prerequisite: `docs/VERIFICATION.md §By change` receives the table. Tests to
adjust: four CANON sentences re-homed to steward/ship; `agent-config.test.mjs:247` points at `claude-config.md`; budgets
ratchet to 9,000 bytes / 36 rule lines and the unread `agentsMdLines`, `fleetCoreLines`, `fleetCoreBytes` go.
WORKERS.md becomes a 3-line stub: Hand-off fence → PR template, labels → generated from `.github/labels.json`, vendors /
LAND_TOKEN / `blocked_by` → `steward/references/`, Cursor procedure → `apex-shared.mdc`; seven citers retargeted (11 §4).
Fold the three independent findings into the draft: the verdict is `= bg exit N`; rule 13's timer clause is gone; the
run-cancel rule says "refused unless Bryce asked" with no hatch text in always-on prose.

### 4.5 Skills: 41 → 39; one PR-lifecycle owner; routing by description

- Fold `worker` and `ship` into `steward` (keeps its name: 29 inbound links), with sections §Lane, §Open, §Push, §Red,
  §Land, §After land; `/ship` stays as a 5-line user verb. Process set 7,639 → ≈5,470 words. One owner per lifecycle step
  (table in 15 §1); a red after `land` belongs to the subscribed owner.
- Delete `orchestrate` (retired role, second launcher, contradicts rule 9, 0 inbound links from rules/agents). Keep
  `/challenge`. Attended fan-out = agent `worker` + the parent/child paragraph (§4.6).
- Delete `skill-hint.py` (2/8 on phone prompts in my run, 5/12 in 03; routes to uninvocable skills; its A/B was never
  run), `skill-smoke` (+recipes +test, ≈1,230 lines; asserts nothing about a skill) and ≈12 prose-pinning tests. Replace
  with `./tests/data/skill-routing/phone.json` (3 short prompts + 1 near-miss per skill, Bryce's register) and one
  deterministic `skill-descriptions.test.mjs` (Use-when form, arrows resolve, vocabulary overlap, every `tools/…` path
  exists). If Bryce wants the hook kept: run `--compare targeted vs off` on phone.json first; keep only for ≥ 5 points.
- Use skill `paths:` (now documented; agent-config's "no `paths:`" is stale): `renderer-debug` on `js/render/**`,
  `new-track`/`scenery-dress` on `js/circuits/**`, `css-play`/`ui-menu-a11y` on `css/**`, `pwa-cache-service-worker` on
  `sw.js`/`version.json`. Zero-cost routing for the files that matter most.
- Fix the stale bits: `phone-bridge` gets a "Not for" clause; audio-debug query #7 label; `check` vs README "≤5/≤6 lines";
  the README table shrinks to name + one line (or is generated from frontmatter).

### 4.6 Subagents: fix the seams, one cross-file reviewer, one protocol paragraph

- Mechanical fixes (15 §3): every MCP entry as `mcp__<server>__*`; drop Task*/SendUserFile from background agents' lists;
  remove the browser servers from `worker`'s `tools:` (omission beats a deny hook); `verify-agent` gets a narrow
  `git worktree (add --detach|remove) scratch/verify-base-*` allowance; delete `memory:` on surveyor/verify/bloat and the
  two header-only memory files; widen `subagent-contract.py` kinds and skip schema-driven JSON runs; add `Explore` to
  `READONLY_AGENTS`; refuse interpreter writes (`writeFileSync|appendFileSync|open(…,'w')|npm run gen|tools/gen/`) for
  read-only agents; `worker.md` 175 → ≈60 lines.
- Roster 12 → 11: merge `bloat-auditor` into `code-hunter` (`focus: dead-code`); re-spec `agent-surface-reviewer` as
  `surface-reviewer` (input: a SET of units; extracts every claim file A makes about file B and tests it against B — `--help`,
  section anchors, piped hook payloads, WebFetch for host-doc claims; flags one-home collisions and pointer cycles). The
  repo's own reviewer could not see any of 04's findings because each sat in two files.
- Use per-agent `hooks:` frontmatter (documented) for agent-specific scopes instead of `agent_type` branches in
  `protect-files.py`: the surveyor's path scope and the reporter's `scratch/**.md` scope become two small scripts named
  in their own cards. `skills:` preload replaces "read skill X first" prose.
- Parent↔child: one paragraph in WORKERS' successor (15 §5) — child message format, what a parent message may authorize
  (direction, never a grant past the brief/hook), the exact parent action per kind (blocked/question/collision/scope/
  checkpoint) — with a fixture test; a `worker` row in `subagent-contract.py`.
- Model table (15 §6), one home: cloud workers Sonnet (`dispatch.json`), implementers inherit (downshift only),
  reviewers Sonnet, scouts Haiku, `code-hunter` tiered at spawn time; workflow critics/synth explicit Opus; total-audit's
  17 untiered Opus finders get code-survey's `TIER_MODEL`; verifier schema gains `needsBrowser` so renderer/HUD findings
  are reported, not refuted.
- `track-surveyor` / `worker` push a `wip/` branch at each commit (a reclaimed container loses up to 50 turns today) and a
  `./tools/track/merge-surveyor.mjs` does scope → merge → verify-track → worktree remove.

### 4.7 Hooks: the minimal set (≈5,700 → ≈1,500 lines; ≈3,000 test lines go with them)

Report 13's 55-row table classifies every refusal, ask and advisory. About 790 of `shellparse.py`'s 2,198 lines repeat
what the ruleset, repo merge settings (squash/rebase already off), `.githooks/pre-push` (already blocks force, delete and
deploy-branch pushes for every host; 33 lines) or CI already enforce; under 10 % has no other backstop (the subagent
browser ban and the kill scan). It also misfires (it blocked a read-only grep whose argument was a filename).

**Target set:** git `pre-push` + the Deploy-reset ruleset + a new `cursor/**` ruleset (no force push; start in evaluate
mode) + ≈15 `settings.json` deny/ask rules (deny and ask rules apply inside `&&`, `$()` and loop bodies, documented) +
three gate rows that check Bryce clicked the label himself (`hold`, `ratchet-raise`, `config`) + a CI check before the
full tier on a ready flip + slim hooks: `bash-guard` ≈120 (the kill scan and the subagent browser ban), `protect-files`
≈120 (Write/Edit only), one 60-line GitHub-tool table shared by all three hosts, `mcp-browser-guard` ≈30 (+ the
live-Playwright check), the `context-cap` advisory, `subagent-contract`, `post-edit`, `lsp-hint`, `memory-sync`,
`session-start`; `stop-guard`/`live-run` only while local browser runs exist (§4.2 removes them).
**Deleted:** `shellparse.py`, `merge_policy.py`, `foreign_push.py` (ported to pre-push), `launch-gate.py`,
`launch-page.py`, `ui-fixer-uncommitted.sh` (the platform's own stop nag already does this), `skill-hint.py` (§4.5).
Generated-file protection moves to `gen:check` (already in `test:guards` and the gate); the reporter/surveyor scopes move
to per-agent `hooks:` / `tools:` + `isolation: worktree`.
**settings.json:** 90 of 145 allow entries are dead because bare `"Bash"` is allowed; `mcp__MDN` and
`mcp__mcp_browserstack_com` name no server; the ten `enabledPlugins` entries do nothing; `Bash(git push *--no-verify*)`
is missing from deny and is the one way around pre-push.
**"Hooks need Bryce's explicit yes" does nothing today:** 4 of the 7 non-merge hook commits from 10-29 to 11-01 cite no
grant and nothing reads the rule; CODEOWNERS cannot help because every agent writes as `brycejmurrin`. Replace it with
the `config` gate row (a `config-ok` label Bryce adds himself, provenance-checked).
Order: each hook is deleted only after its replacement is in place (13 §5); keep the `hold` ask until the mobile
provenance experiment passes. Measured advisory cost: ≈60 ms per prompt, 160–900 ms per Bash call, ≈270 ms per edit;
evidence of value exists only for `post-edit` and `lsp-hint`.

### 4.8 MCP and vendor tools

- Decide (Bryce): may any agent session start or message another agent through his personal Cursor/Codex/Claude login?
  If no: delete `apex_codex_control`, `codex-cloud.py --control`, `apex_claude_agents followup` and the Cursor write verbs
  from the MCP surface (≈870 lines Codex adapter + the verbs). If yes: a PreToolUse `ask` on those tools plus a bash-guard
  row for `claude -p --cloud` and `cursor-agents.mjs launch|followup|delete`, and a §Per vendor paragraph.
- Delete `claude-transcript.py` + the `transcript` verb (PTY scraper; `list_events` + `session-transcript.mjs` is the
  supported route). Delete `tinyfish-mcp.sh` + `tinyfish-rpc.py` (the docs call them dead in-container). Retire the four
  `apex_inbox_*` tools (a SQLite mirror of comments the GitHub MCP already reads).
- Retire ≈17 pass-through `apex_*` wraps whose CLI already prints JSON; keep lock- and job-bearing tools, LSP, shots, HUD.
- Measure the output gateway on one real session with and without it; drop it if there is no net saving (today it adds
  7–19 % to every listing). Add `issue_write` to the Codex MCP door and a parity test over the three doors' GUARDED sets.
- Keep `cursor-agents.mjs` reads (Cursor made 260 commits since 10-20, hand-launched); gate or remove its writes until
  `hosts.cursor.enabled` flips. Fix the js-debugger setup link doctor flags.

### 4.9 Knowledge: one home per kind, with retention

- Rule → hook/test + one anchored prose line. Measured fact → a row in the doc that uses it (`value · tool · date ·
  re-measure-by`). Decision → `./docs/DECISIONS.md` `D-NNN` rows (replaces 45 inline quotes; ≈35 rule/test sites rewritten
  to `(D-NNN)`; no test asserts quote text, so nothing breaks; "no unsanctioned ratchet raise" becomes checkable).
  Narrative → PR body, issue or `artifacts/`, never `docs/` unless cited.
- `./tools/docs/knowledge-gc.mjs` + `./tests/unit/knowledge-retention.test.mjs` (in `test:guards`): a note uncited for 21 days
  moves to archive (weekly cron opens the PR); hunt/survey/design-pass prefixes refused unless cited; 40 KB cap with a
  shrink-only allow-list; `Kind:` / `Re-measure-by:` header; NOTES-INDEX generated. One-time backfill: the 60 zero-citer
  notes and 18 shipped/superseded plans to archive; untrack the 47 `artifacts/`/`scratch/` files; delete `REPORT.md`.
- Memory: auto-memory keeps preferences only (11 of 17 qualify; 5 coordination rules and 1 dated fact leave); the tracked
  `.claude/memory/` becomes a one-way SessionStart restore (repo wins), deleting the three-way sync, baseline dir,
  `assume-unchanged` dance and most of 563 hook+test lines.
- Hand-off block: keep `owner:` and `next:`; drop `branch:`/`lane:`; `ready-gate` checks `head:` against the PR; `verified`/
  `not-run` generated by `session-status.mjs`.
- Doc merges (14 §4): VERIFICATION absorbs PREPUSH-GATE-LADDER + TESTING command blocks + flaky procedure; ARCHITECTURE-MAP
  absorbs FLOW + USAGE-PATHS journeys; COMPONENTS absorbs LAYOUT-TOKENS + ui-experience-studio; delete the 7 redirect stubs;
  BUGS.md → `bug` issues; survey dirs → archive.

## 5. New things to add

| kind | name | why |
|---|---|---|
| workflow | `.github/workflows/dispatch.yml` | the dispatcher as an Action (§4.1) |
| tool | `dispatch.mjs --fire` | POST the worker task, record the claim with the returned id |
| tool | `./tools/ci/lib/provenance.mjs` | "did Bryce decide this" from GitHub events (§4.3) |
| scheduled task (Bryce) | "Apex worker" (API trigger; optionally `issue.labeled ready` and `pull_request.labeled needs-owner` triggers) | the only model process left |
| tool + test | `./tools/docs/knowledge-gc.mjs`, `knowledge-retention.test.mjs` | retention (§4.9) |
| doc | `./docs/DECISIONS.md` | the decision ledger |
| agent | `surface-reviewer` (cross-file) | the bug class the one-unit reviewer cannot see |
| test | `skill-descriptions.test.mjs` + `phone.json` | routing guard without the hook |
| test | `parent-protocol.test.mjs` | pins the one parent/child paragraph |
| tool | `./tools/track/merge-surveyor.mjs` | the surveyor hand-back as one script |
| hook change | `mcp-browser-guard.sh` live-Playwright check | the one safety rule with no mechanism |
| hook change | `commit-msg` hook for `Ratchet-Reason:` (or drop the trailer) | the trailer is read from the previous commit today |
| config | skill `paths:` on render/circuit/css/pwa skills | free routing |
| test | hook-door parity (`GUARDED` sets equal across Claude/Cursor/Codex) | the Codex `issue_write` gap |
| ruleset (Bryce) | `cursor/**`: no force push (evaluate mode first) | server-side for every host; lets bash-guard's push rows go |
| gate rows | `hold`, `ratchet-raise`, `config` provenance rows in merge-gate | replace the hook asks and the unenforced "Bryce's yes" rule |
| settings | `Bash(git push *--no-verify*)` deny; prune 90 dead allows | the one way around pre-push |

## 6. What to delete (consolidated)

Persistent dispatcher session, Board lock, PAUSE/RESUME, `--children`, `launch-gate.{py,mjs}` + `launch-page.py` + test
(≈530 lines), skill `dispatcher` (→ 10 lines), `/orchestrate`, handoff §"Handing over an orchestrator", every `@parent`,
"bounded safety check-in", "quoted relay counts" · test-bg group mode, `live-run.py`, `stop-guard.sh`, protect-files live
rule, bash-guard supervisor rule, `run-ci` + `CI: run` + 25 `if:` copies, ~250 lines of TESTING.md · `skill-hint.py`,
`skill-smoke*` (≈1,360 lines), ≈12 prose-pinning tests, README skill table · `merge_policy.py` ASK_MERGE/ASK_DESK_METHOD/
merge `receipt_check` twin, `fleet-bus` mention in gate-receipt, `shellparse.py` (2,198), `foreign_push.py` (→ pre-push), `ui-fixer-uncommitted.sh`,
`distance` row of merge-gate (the team's own data says
it buys nothing since gen/ratchets run on the merge result; keep only for the shared shell if at all) · `claude-transcript.py`,
`codex-cloud.py --control`, `tinyfish-mcp.sh`+`tinyfish-rpc.py`, `apex_inbox_*`, ≈17 pass-through wraps · `.claude/rules/
tests-specs.md` (wrong-regex copy), AGENTS.md §Cursor Cloud and hooks paragraph, `agentsMdLines`/`fleetCore*` budgets,
`mcp__MDN`/`mcp__mcp_browserstack_com` allow entries, the 10-false `enabledPlugins` · `REPORT.md`, 47 tracked
`artifacts/`/`scratch/` files, 60 uncited notes, 18 dead plans, 7 redirect stubs · on the account: 7 disabled dispatcher
triggers and ≈20 `auto_disabled_session_gone` check-ins · memory entries `launch-prompts-route-questions-to-dispatcher`
and the dispatcher clauses in two others.

## 7. Landing plan

Immediate (today, Bryce or an attended session): decide whether to re-enable the dispatcher trigger or leave it off until
`dispatch.yml` lands; answer or close #4379's `needs-decision`; land or close the jammed fold PR #4436.

**Wave 0 — the experiment** (30 min): fire a probe worker; read its tool list, provenance and notification results.

**Wave 1 — mechanisms (each PR independent):**
A. `dispatch.yml` + `--fire` + `concurrency`, running `--plan` only for 24 h, then `--apply`; old trigger stays off.
B. `provenance.mjs` wired into dispatch and merge-gate `hold`; `decision:` comment; `needs-decision` bot digest.
C. `ci.yml` trigger simplification + `selected` shard on drafts; header fix.
D. Hook fixes that are pure bugs: cancel-hatch anchored to a leading env assignment; REST/GraphQL merge → deny;
   `Ratchet-Reason` to a `commit-msg` hook or dropped; `mcp-browser-guard` live-Playwright check; Codex `issue_write`.
E. Subagent seams: `__*` tools form, verify-agent worktree allowance, surveyor memory, contract kinds, Explore read-only,
   interpreter-write pattern, `worker.md` cut. Vendor-control tools hooked or removed per Bryce's answer.

**Wave 2 — prose (docs-only fast path), after Wave 1 is green:**
F. `docs/VERIFICATION.md §By change`; steward/ship CANON literals; then the AGENTS.md swap + budget ratchet in one commit.
G. `steward` absorbs `worker` + `ship`; `orchestrate` deleted; WORKERS.md stubbed and its 7 citers retargeted;
   skill `paths:`; phone.json + `skill-descriptions.test.mjs`; `skill-hint`/`skill-smoke` deleted.
H. `DECISIONS.md` backfill; `knowledge-gc` + retention test with the allow-list; note/plan archive; memory one-way restore.

**Wave 3 — deletions, after ≥ 3 fired workers reached `land` and one week of draft-CI data:**
I. Dispatcher session machinery, launch receipts, `context-cap` create_session half, test-bg/live-run/stop-guard,
   `distance` row, `merge_policy` dead text, vendor adapters, pass-through wraps, gateway (if unmeasured), doc merges.

Every wave keeps `rulebook-guards`, `docs-integrity`, `agent-config` and `test:guards` green on its own; each PR names
the sentences it re-homes. Hooks and `settings.json` edits wait for Bryce's explicit yes (`claude-config.md`) — Waves 1D/E
and 3 are the ones that need it.

## 8. Decisions for Bryce

1. Coordination: adopt §4.1 (Actions dispatcher + fired worker task)? And run the 30-minute experiment first?
2. Authority: will your grants be clicks (labels, `decision:` comments you make yourself) so "quoted relay" can be retired?
3. Verification: forbid local browser test runs for agents (keep an explicit-grant escape for you)? Draft `selected`
   budget: one ~5-min shard or the full ready budget?
4. Should any agent reach another agent through your personal Cursor/Codex/Claude login (`apex_codex_control`,
   `apex_claude_agents followup`, Cursor launch/delete)? If not, they are deletions, not hooks.
5. Is Codex Cloud still in use (last `lane:codex` PR 10-31)? If not, the Codex adapter, mirror budget and `openai.yaml` go.
6. AGENTS.md code-first (≈1,200 words, process in skills) — accept the draft shape?
7. `/orchestrate`: delete it (recommended), or keep `ask`/`ask+` as the attended fan-out verb?
8. `skill-hint.py`: delete, or keep only if an A/B on phone prompts shows ≥ 5 points of lift?
9. Knowledge: 21-day cite-or-archive window; chat preferences become `D-NNN` rows via PR or keep going to auto-memory?
10. Do you still run local browser groups by hand? (decides whether `test-bg` is deleted or kept as `--spec` behind a grant)

## 9. Report index

`00` lead findings · `01` AGENTS.md + rules · `02` docs · `03` skills · `04` subagents + workflows · `05` orchestration ·
`06` MCP + vendor tools · `10` dispatcher design · `11` rulebook design + `AGENTS.draft.md` · `12` verification design ·
`13` hooks design · `14` knowledge design · `15` skills + agents design · verifier: 15/15 confirmed (in this session's log).
