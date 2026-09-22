# Agent tooling & process research — 2026-09-22

Fourth pass after `PROCESS-SPEEDUP-2026-09.md`, `PROCESS-SPEEDUP-2026-09-16.md`
and `AGENT-PROCESS-RESEARCH-2026-09-16.md`. Those three measured where the
minutes go; this one asks a different question — **does the agent surface
(AGENTS.md, skills, subagents, hooks, MCP, CI, branching) match what the
2026 guidance says, and what is still missing?** It is a research record,
not a plan of record: nothing here was applied. Every recommendation carries
its source; every "here" line was checked against the tree on this date.

Method: nine read-only Sonnet subagents with web search, each briefed on one
topic and told to return recommendations with URLs; one session reading the
repo and comparing. Pass 1 (§2) covered the five instruction surfaces; pass 2
(§3) covered CI/CD, testing, branching for parallel sessions, and parallel
subagent orchestration. §4 is the repo's own review of its instruction files
by four more subagents. §5 is the consolidated, ranked gap list.

> Errata: none yet. Web sources are dated 2025-2026 and were read on
> 2026-09-22; a claim about Claude Code behaviour is only as current as
> `code.claude.com` was that day.

## 1. Where the surface stands

| Surface | Measured 2026-09-22 |
|---|---|
| `AGENTS.md` | 200 lines, 2,051 words; `CLAUDE.md` is a 7-line `@AGENTS.md` stub |
| Skills | 26; bodies 35–102 lines; 50 `references/*.md`; descriptions 35–65 words (only `check-changes` > 60) |
| Subagents | 5, all `model: inherit`, all read-only or single-circuit; no `memory`, `isolation`, `skills`, `maxTurns` |
| Hooks | 3 scripts on 3 events (SessionStart; PreToolUse on edits; PreToolUse on Bash); 30–44 ms each |
| Rules | 2 path-scoped (`render-wgx`, `render-tlx`); mirrored to `.cursor/rules/` |
| MCP | 3 servers; `apex-tools` = 11 pinned CLI wraps; Playwright MCP pinned `0.0.79` |
| Settings | 25 `allow` entries, no `deny`, no `ask`; `enabledMcpjsonServers` set |
| Prior open items | A5 (allowlist), A6 (`worktree.baseRef`), B8 (fat descriptions — mostly done) from the 09-16 note |

## 2. Pass 1 — the five instruction surfaces

### 2.1 CLAUDE.md / AGENTS.md / rules

Recommendations (source: [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory),
[code.claude.com/docs/en/best-practices](https://code.claude.com/docs/en/best-practices),
[agents.md](https://agents.md/)):

- Under ~200 lines per file; adherence falls as the file grows. For each
  line ask "would removing it cause a mistake?" — if not, cut it.
- Include only what the agent cannot derive: commands it cannot guess, style
  that differs from defaults, repo etiquette, env quirks, non-obvious
  gotchas. Exclude directory layouts, dependency lists, platitudes.
- `@import` loads the whole file at launch (organisation, not token
  savings); relative to the importing file; max depth 4; silent on failure.
- `.claude/rules/*.md` with `paths:` globs load only when a matching file
  is touched — the place for conditional content. Rules without `paths`
  load unconditionally.
- Claude Code ≥ 2.1.277 reads `AGENTS.md` directly when no `CLAUDE.md`
  exists; with both, `CLAUDE.md` wins unless `/config` says otherwise.
- Memory files and rules are advisory. Anything that must hold every time
  is a hook ([permissions doc](https://code.claude.com/docs/en/permissions)).
- `/doctor` proposes trims; `/context` shows what actually loaded.
- Anti-patterns: bloat; vague rules ("be careful"); duplicated rules across
  files (the model picks one arbitrarily); stale content (a 2026 study puts
  the cost at 2–4 % task success and 20–23 % inference,
  [arXiv](https://arxiv.org/pdf/2606.09090)); `IMPORTANT` on everything;
  import chains past 4 hops.

Here: the `CLAUDE.md → @AGENTS.md` shape, the "rules here, evidence in
docs/" split, the two path-scoped rules and the hook-enforced bans are the
documented pattern. `AGENTS.md` sits exactly at the 200-line ceiling with no
headroom; §4.1 lists what the reviewer found derivable or duplicated.

### 2.2 Skills

Recommendations (source: [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills),
[Anthropic: equipping agents with skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills),
[anthropics/skills](https://github.com/anthropics/skills)):

- `description` is the trigger: third person, what AND when, naming the
  phrases a user would type. Combined with `when_to_use` it is capped at
  1,536 characters.
- Three tiers: frontmatter always loaded; body on trigger; `references/`
  and `scripts/` on demand. Body under ~500 lines, ideally a phone screen.
  Scripts execute without entering context.
- Frontmatter extensions worth knowing: `paths:` (activate only for
  matching files), `disable-model-invocation: true` (side-effecting
  workflows), `user-invocable: false` (reference-only), `context: fork` +
  `agent:` + `background:` (run in an isolated subagent), `allowed-tools`,
  `argument-hint`, `model`, `effort`, `hooks`. Only `name`, `description`,
  `license`, `compatibility`, `metadata`, `allowed-tools` are in the open
  Agent Skills standard; the rest are Claude Code extensions that Codex and
  Cursor ignore.
- `/skill-doctor` (≥ 2.1.252) reports per-skill trigger counts and per-turn
  cost; `skill-creator` runs with/without A-B evals from `evals/evals.json`.
- Anti-patterns: fat body; generic description; two skills claiming one job;
  a skill restating an always-on rule; narrative "why" in the body;
  `context: fork` without a concrete task; reference material packaged as a
  task skill.

Here: 26 skills all use only `name` + `description`. The 09-16 B8 item is
mostly closed (one description over 60 words). `tests/unit/skill-progressive.test.mjs`
already enforces the body cap on `mcp-probe` and the description shape on
all. §4.2 has the per-skill frontmatter and overlap findings.

### 2.3 Subagents

Recommendations (source: [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents),
[Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system),
[when to use multi-agent](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them)):

- `description` is a routing signal, written as a trigger condition. Prefer
  an explicit `tools:` list, but `tools: Read` alone is an anti-pattern
  (blocks running checks); `disallowedTools` is the targeted denial.
- `model:` tiering — haiku for high-volume low-judgement scans, sonnet for
  domain work, the strongest model for synthesis. Resolution: call param →
  frontmatter → `CLAUDE_CODE_SUBAGENT_MODEL` → session model.
- `memory: project` (`.claude/agent-memory/<name>/`, git-shareable) lets a
  repeatedly-run auditor keep what it learned. `isolation: worktree` gives a
  write agent its own worktree, auto-cleaned if unchanged. `skills:`
  preloads a skill body cheaper than discovery. `maxTurns` bounds runaway.
- A subagent returns a verdict, not a dump; decompose by context boundary,
  not by problem taxonomy (the agent that implements should own its tests).
  Sequential plan → implement → test handoffs are the named anti-pattern.
- Multi-agent research measured +90 % over single-agent at ~15× tokens: for
  parallelisable research and audits, not coupled coding.
- Background is the default; background agents lose most tools. Depth cap
  3, concurrency cap 20 (env-configurable). Community ceiling for
  productively managed concurrent agents: 3–4.

Here: five agents already follow the verdict-not-dump rule and the read-only
posture. None uses `model`, `memory`, `isolation`, `skills` or `maxTurns`;
four carry prose about the stale-worktree checkout that `isolation:
worktree` + `worktree.baseRef: "head"` (09-16 A6) would delete. §4.3 has
the per-agent table and the new-agent brainstorm.

### 2.4 MCP

Recommendations (source: [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp),
[MCP spec 2026-07-28](https://modelcontextprotocol.io/specification/2026-07-28/server/prompts),
[Anthropic: code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp),
[tool search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool)):

- Default to a CLI via Bash for anything local and scriptable: zero fixed
  context cost. Reach for MCP when there is no CLI, auth is involved, the
  workflow is stateful, or a shared schema/audit trail pays.
- Every loaded tool schema costs context every turn; 30+ tools is 10k+
  tokens. Tool Search defers schemas (~85 % reduction); programmatic tool
  calling goes further (Anthropic's example: 150k → 2k tokens).
- Descriptions must state action, object, result and the boundary against
  sibling tools. One intent and one safety profile per tool.
- Playwright MCP ≈ 13.7k tokens of schema, Chrome DevTools MCP ≈ 18k
  (Nov-2025 benchmarks). Playwright drives; DevTools observes (console,
  network, traces, heap).
- Secrets via `${ENV}` interpolation, never literal; tool results are
  untrusted input (indirect prompt injection).

Here: `apex-tools` is the recommended thin-wrapper-over-CLI shape and its
wrap map refuses to grow; the Playwright MCP is version-pinned; the TinyFish
key is gitignored. The two browser MCPs load in every session while most
sessions use neither; Tool Search hides the cost in Claude Code but Cursor
and Codex load them eagerly — measure with `/context` before acting.

### 2.5 Hooks and settings

Recommendations (source: [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks),
[code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions)):

- ~30 events now (SessionStart/End, UserPromptSubmit, Pre/PostToolUse,
  PostToolUseFailure, PermissionRequest, Stop, SubagentStart/Stop,
  Pre/PostCompact, FileChanged, …). Exit 2 is the only blocking exit;
  JSON `permissionDecision` allow/deny; `updatedInput` can rewrite a call;
  `async: true` for slow checks.
- Permission lists evaluate deny → ask → allow, first match wins. Bash
  rules are text matches after splitting on `&&`/`||`/`;`/`|` and do NOT
  catch `/bin/rm`, `sh -c '…'` or `git -C . push`; the docs say use
  sandboxing or a PreToolUse hook for real enforcement.
- Cloud/web sessions read only the repo's `.claude/settings.json`, never
  `~/.claude/`. SessionStart stdout lands in context.
- Anti-patterns: slow or network hooks on high-frequency events; treating
  allow/deny text patterns as a security boundary; a hook that blocks one
  path while an equivalent tool path stays open; over-broad allowlists
  outside a container.

Here: three hooks, all fast, cover the generated-file ban, the live-run edit
ban, the commit guard and the pkill ban. Missing: any `deny` list (09-16
A5 proposed one), any Stop/SubagentStop/PreCompact hook, and a hook-side
check that a subagent never starts a browser. §4.3 has the bypass test
results and the proposed hook set.

## 3. Pass 2 — CI/CD, testing, branching, orchestration

### 3.1 CI/CD for an agent-driven repo

Recommendations:

- Gate whole jobs by path filter on docs/tools-only pushes
  ([dorny/paths-filter](https://gitea.com/actions/dorny-paths-filter/src/tag/v3/README.md)).
  Playwright `--only-changed[=ref]` selects specs by changed files plus
  transitive imports; it over-selects on shared fixtures, so it is a
  cross-check for `pick-tests`, not a replacement
  ([playwright dev.to](https://dev.to/playwright/iterate-quickly-using-the-new-only-changed-option-55m2),
  [issue 34339](https://github.com/microsoft/playwright/issues/34339)).
- Blob reporter + `merge-reports` for sharded runs; upload blobs even on
  failure; guard the merge with `if: ${{ !cancelled() }}`
  ([qaskills blob guide](https://qaskills.sh/blog/playwright-blob-reporter-guide)).
- **Retries hide, quarantine surfaces.** A retry turns an intermittent
  failure into a silent pass; quarantine keeps the test running and
  reported but non-blocking with an owner and a deadline. Use
  `--fail-on-flaky-tests` so a retry-recovered pass reads red
  ([mergify](https://mergify.com/blog/why-jest-retrytimes-hides-bugs),
  [oneuptime](https://oneuptime.com/blog/post/2026-07-28-quarantine-flaky-tests/view),
  [contextqa](https://contextqa.com/blog/flaky-tests-in-ci-cd-without-retries/)).
- User-owned repos: no merge queue, no bypass actors; required status
  checks on a ruleset still work. GitHub Environments' protection rules are
  public-repo-only below Enterprise
  ([GitHub docs](https://docs.github.com/actions/reference/workflows-and-actions/deployments-and-environments)).
- `cancel-in-progress: true` for PR feedback, never for the deploy job
  ([community 8336](https://github.com/orgs/community/discussions/8336)).
- Cache `~/.cache/ms-playwright` keyed on the exact Playwright version with
  NO `restore-keys`; cache the npm store via `setup-node`, not
  `node_modules` ([qaskills cache](https://qaskills.sh/blog/github-actions-cache-playwright-browsers)).
- `anthropics/claude-code-action@v1` for PR review/autofix with
  `allowedTools` scoping and `track_progress`; the marketplace autofix
  action tags commits `[N/M]` and stops at a cap — copy the cap
  ([solutions.md](https://github.com/anthropics/claude-code-action/blob/main/docs/solutions.md),
  [PR autofix action](https://github.com/marketplace/actions/pr-autofix-with-claude-code)).
- Post-deploy: fetch the live URL and assert the deployed marker; rollback
  targets last-known-good and re-runs the same smoke.

Here (checked in `ci.yml`, `pages.yml`, `playwright.config.js`, `test-bg.mjs`):
Pages is already a cron release train, not on-push; deploy-branch pushes get
their own concurrency group so they never cancel each other; `retries` is 1
in CI and 0 locally, and live-reporter reports flaky; `--last-failed` exists
in `test-bg`; the Playwright cache is keyed on the lockfile and npm is cached
by `setup-node`; `deploy-research` does the post-deploy `apex-sha` check.
**Open:** no flake budget or quarantine policy in `AGENTS.md`; no
`--fail-on-flaky-tests`; `--only-changed` untried as a `select-specs`
cross-check.

### 3.2 Testing in an agent-maintained WebGL game

Recommendations:

- Weight the pyramid toward sub-minute deterministic layers; use browser
  E2E surgically ([Frontiers pyramid 2.0](https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2025.1695965/full)).
- Deterministic simulation testing: one seed controls time, randomness and
  concurrency; golden traces with a deliberate, documented epsilon
  ([Polar Signals DST](https://www.polarsignals.com/blog/posts/2025/07/08/dst-rust),
  [S2 DST](https://s2.dev/blog/dst)).
- Contract tests (load order, API surface, docs drift, size budgets) are
  the type system of a no-build-step tree.
- Visual regression on software renderers: perceptual thresholds or no gate
  at all; screenshots are sign-off, not assertions.
- WebGPU without a GPU: static WGSL validation (Naga/Tint), pipeline
  creation checks; macOS hosted runners expose paravirtual Metal, so a GPU
  census must say which it saw
  ([runner-images 7085](https://github.com/actions/runner-images/issues/7085)).
- Mutation testing is the honest signal for AI-written tests, which reach
  high line coverage while killing few mutants
  ([Meta engineering](https://engineering.fb.com/2025/09/30/security/llms-are-the-key-to-mutation-testing-and-better-compliance/),
  [Thoughtworks radar](https://www.thoughtworks.com/radar/techniques/mutation-testing)).
- Verdict tiers pass / partial / fail / **skip-with-reason**; an unrun
  check is named, never omitted
  ([four verdicts](https://dev.to/aleksanndr_nfa/four-verdicts-instead-of-done-grading-an-ai-agents-claims-on-an-evidence-ladder-5eic)).
- Playwright: no fixed sleeps; `expect.poll` / `toPass`; workers sized to
  measured headroom, not `auto` ([Playwright best practices](https://playwright.dev/docs/best-practices)).

Here: the gate ladder, the ratchets, `physics-characterization.spec.js`,
the `__apex` > `render()` > DOM > screenshot evidence order, the WGX
boot-evidence rule and the `gpu-census` dispatch all match the sources
almost line for line. **Open:** no mutation-testing pass anywhere; the
09-16 note records `assert.match` on source text growing (2,184 → 2,513),
which is the coverage-without-kill pattern the sources warn about.

### 3.3 Parallel sessions and deploy branching

Recommendations:

- One worktree per session; a worktree starts stale, so sync to the
  session's commit first (matches AGENTS.md rule 10)
  ([MindStudio worktrees](https://www.mindstudio.ai/blog/parallel-ai-coding-agents-git-worktrees)).
- Isolation is not coordination: partition by file/area ownership before
  spawning; claim-before-work with an age-based staleness check
  ([Alook](https://alook.ai/blog/prevent-coding-agents-duplicating-work)).
- Trunk-based small batches beat long-lived agent branches
  ([Lopes](https://journal.daniellopes.dev/p/trunk-based-development-vs-feature-branches-ai)).
  A 33,596-PR study measured 27.7 % merge-conflict rate for agent PRs, and
  half that within one agent's own PRs — cross-agent parallel writes are
  measurably worse than one agent sequentially
  ([Vaughan](https://codex.danielvaughan.com/2026/07/28/agent-pr-merge-conflicts-concurrent-coding-agents-codex-cli-worktree-isolation-coordination-defence/)).
- Merge queue is org/Enterprise only; Bors' "not rocket science" rule is
  the principle; Mergify/Kodiak are the bot substitutes
  ([Mergify origin](https://mergify.com/blog/the-origin-story-of-merge-queues)).
- `merge=union` corrupts a ratchet JSON (it keeps both numbers); regenerate
  on merge instead. GitHub's web merge ignores custom merge drivers, so a
  driver must live in the tool the agents run — which is what `sync-pr.mjs`
  is ([rulestack](https://dev.to/rulestack/two-writers-one-append-only-ledger-the-git-conflict-one-gitattributes-line-fixed-and-the-files-55j0)).
- Deploy from a pinned SHA or tag, never a moving tip; GitHub Environments
  with deployment-branch policies stop a race
  ([immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases)).
- Stacked PRs (Graphite, git-spice) suit 2–5 agents without extra infra
  ([Zylos](https://zylos.ai/research/2026-05-21-stacked-prs-ai-agent-collaboration/)).

Three branching models for this repo, as the reviewer framed them:

| Model | Shape | Pro | Con |
|---|---|---|---|
| **A. Status quo, hardened** | Keep direct pushes to the shared branch; mandatory `deploy.mjs --gate-only`; `sync-pr.mjs` never a hand merge; pin `pages.yml` to the branch via an Environment policy | Zero migration; matches how sessions work | Two sessions can both pass locally and push together; "push over a live run cancels it" stays inherent |
| **B. Per-session PRs + auto-merge bot** | Sessions open a PR into the integration branch; Mergify/Kodiak lands green ones one at a time | Most of the never-red-trunk guarantee without a merge queue; a review surface | Third-party dependency; the bot's rebase hits the same generated-file conflicts, so regeneration must run in the bot's path too |
| **C. Deploy from tags** | Integration stays as today; Pages publishes only a tag (or a bot-fast-forwarded `release` branch) cut after a clean gate | Strongest deploy safety; immutable gated SHA | Adds a release-cut step and latency; the one-step train becomes two |

Here: the train already publishes "exactly that commit" after re-gating the
tip, which is most of C's benefit without the tag step; the open risk is the
pre-gate window on the shared branch, which `SHARED-BRANCH-COORDINATION.md`
handles by protocol. The reviewer's claim-before-work pattern has no
mechanical form here yet (a lock file or a task-list row naming the session
and the red it is fixing).

### 3.4 Parallel subagents inside one session

Recommendations (sources as in §2.3 plus
[code.claude.com/docs/en/workflows](https://code.claude.com/docs/en/workflows),
[MAST failure taxonomy](https://arxiv.org/pdf/2503.13657),
[SentinelOne adversarial consensus](https://www.sentinelone.com/labs/building-an-adversarial-consensus-engine-multi-agent-llms-for-automated-malware-analysis/)):

- Fan out only across independent context boundaries; keep coupled edits
  and shared test resources single-threaded.
- Every brief standalone; every return a fixed-format verdict with explicit
  "not covered" fields; skeptic agents refute findings before they are
  believed; de-duplicate by clustering, not vote count.
- Each subagent costs ~25–35k tokens to initialise, so micro-agents erase
  the savings of a cheaper model.
- `SubagentStart`/`SubagentStop` hooks are where a concurrency cap, a
  browser ban and verdict normalisation belong.
- On a 4-core no-GPU box: read-only fan-out is free; a browser is one
  global resource behind a lock; zero extra agents while a group is live;
  scripted workflows for fixed-shape sweeps; background the deterministic
  work, keep judgement in the driving session.
- Failure modes: file-dump returns, telephone-game handoffs, "verified by
  reading", silent partial completion, frequency-weighted consensus.

Here: `PARALLEL-WORK.md` and the saved workflows (`total-audit`,
`code-survey`) already encode read-only fan-out, skeptic verification and the
one-browser rule. The rule "never hand a subagent a browser run" is prose
only; a `SubagentStart` hook could make it deterministic.

## 4. The repo's own review

Four read-only subagents reviewed the instruction files against §2. Their
findings are appended below as they reported; file:line citations were
kept verbatim.

### 4.1 AGENTS.md, CLAUDE.md, rules

**Stale** (each verified on this box today):

- `AGENTS.md:44-45` — "`test:tooling-fast` (208 of 278 unit files) … The other
  70". Today `tests/groups.json` `toolingFast` lists **217** files and
  `tests/unit/` holds **289**; the gap is 72. The numbers were copied from
  `docs/notes/PREPUSH-GATE-LADDER.md:9` (dated by design) into the undated
  rule. Fix: replace the triple with the two one-line commands that compute
  them, so the rule cannot rot again.
- `AGENTS.md:14` — "~3 min". The 09-16 note §5 A2 measured 117–130 s after
  `--jobs=3` landed.
- `AGENTS.md:22-25` present SwiftShader as the only browser cost;
  `playwright.config.js:49-59` wires `APEX_GL=llvmpipe`, measured 8–12×
  faster in `CI-RENDERING-PERFORMANCE.md`, and `AGENTS.md` never names it
  (zero hits).

Not stale: "eleven rules", the 112-member scenery contract, 52 circuits,
26 skills, 5 agents, 3 servers, 10 CLIs / 11 tools — all re-counted.

**Duplicated** (one owner each):

| Rule | Restated at | Owner |
|---|---|---|
| Frac-keyed `_sceneryShift` | `AGENTS.md:126-127` and `js/circuits/CLAUDE.md:9-11` | the path-scoped circuits file; AGENTS.md keeps a pointer |
| No Chrome MCP while Playwright runs; never hand a subagent a browser run | `AGENTS.md:64-65,83` and `.cursor/rules/apex-shared.mdc:27` | AGENTS.md; Cursor file links |
| Cache-busting paragraph | `AGENTS.md:110-112` and `.claude/skills/README.md:59-62` | AGENTS.md |
| "Three MCP servers" | `AGENTS.md:173`, `apex-shared.mdc:21`, `skills/README.md:9-10` | `docs/AGENT-SURFACE.md` |

**Enforceable but prose:**

- `AGENTS.md:140` "read `c.aeroX`, never `c.xOn`" has no lint. Hook: PreToolUse
  on Edit/Write under `js/**`, grep the new content for `\.xOn\b` outside the
  helper's own file, block with the vstd-lint escape hatch.
- Rule 4 "a push over a live run cancels it": `bash-guard.sh` has no `git push`
  handling. Hook: PreToolUse on Bash matching `git push`, block while a
  `test-bg.mjs` supervisor is live.
- Rule 5 "ONE Playwright process" is already tool-enforced
  (`test-bg.mjs:368-400` refuses above loadavg 3); say so in the rule.

**Derivable:** `AGENTS.md:95-107` restates directory prose that line 93
already defers to `docs/ARCHITECTURE.md`; keep the G façade and the
script-tag-order invariant, move the rest. `.claude/skills/README.md:14-22`
is fold provenance, not workflow; it belongs in a dated note.

**Missing:** the llvmpipe escape hatch; a one-line "list live sessions before
fixing a shared-branch red" pointer (`SHARED-BRANCH-COORDINATION.md` §3 calls
it the whole fix and `AGENTS.md:183` never says it); a sentence on how routine
the 15+ merge commits per 80 are.

**Proposed outline** (≈170 lines from 200): header + commands 20;
verification 45 (computed counts, llvmpipe line); seeing the game 15;
layout 10 (from 19); conventions 18; physics 13; asset pack 5; `__apex` 5;
agent extensions 15 (one AGENT-SURFACE link, no server count); Cursor 6;
branch + CI 22 (from 32, plus the live-sessions line).

### 4.2 Skills

**Stale references: none.** 668 path references (215 unique), 28 npm
scripts, every `__apex.<hook>` and every subagent name resolve.

**Overlapping descriptions** (the body disambiguates, the description does
not, and only the description is loaded every turn):

| Pair | Example | Fix |
|---|---|---|
| css-play vs ui-menu-a11y | "pause menu is cramped and Escape doesn't close it" | ui-menu-a11y: "single-screen fit only; a DOM/class restructure is css-play" |
| tune-physics vs playwright-probe | "camera feels laggy after a kerb hit" | tune-physics: "camera lag as a framing/state bug → playwright-probe" |
| asset-pack vs webgpu-debug | "WebGPU road looks flat grey instead of textured" | webgpu-debug: "textured-vs-procedural look → asset-pack" |
| garage-parts-livery vs playwright-probe | "show me the new livery in the garage" | promote body line 12 ("isolated studio renders → playwright-probe") into the description |

**Duplicated rules:** `?v=dev` / no bump in 9 skill bodies and 19 references
(`asset-pack/SKILL.md:29`, `audio-debug:40`, `tune-physics:53`,
`garage-parts-livery:28`, `scenery-dress:46`, `survey-track:47`,
`pwa-cache-service-worker:25`, …) — trim each to a bare link to
`check-changes/references/bump.md`. "Never run Chrome MCP while Playwright
runs" restated in `css-play/SKILL.md:43` and `slim-bloat/references/carves.md:58`
— link `mcp-probe/references/traps-chrome.md`. `{ polling: 100 }` restated in
four places, none citing its real gate `tools/check/wait-polling-lint.mjs`.

**Frontmatter:** all 26 use only `name` and `description`. Fits:

| Skill | Field |
|---|---|
| ai-racecraft / audio-debug / input-controls | `paths: ["js/physics/ai-drive.js"]` / `["js/audio/engine.js"]` / `["js/input/*.js"]` |
| asset-pack / webgl-debug / webgpu-debug | `paths: ["assets/pack/**"]` / `["js/render/glx/**"]` / `["js/render/webgpu/**"]` |
| new-track / scenery-dress | `paths: ["js/circuits/*.js"]` / `["js/circuits/scenery/*.js", "js/track/scenery/**"]` |
| lighting-tuner | `disable-model-invocation: true` — `references/bake.md` FULL-REPLACES `js/lighting/presets.js` from a pasted blob |
| check-changes | `allowed-tools: Bash, Read` — a verifier never edits |
| agent-view / new-track / check-changes | `argument-hint` |
| any skill ending in a browser verdict | `context: fork` is **excluded** by rule 10 |

**Body vs references:** `career-mode/SKILL.md:31-64` carries two catalog
tables (101 lines, tied largest); `mcp-probe/SKILL.md:53-67` carries a dated
war story inside "Hard rules" although it is the project's own
thin-index template. No orphaned references.

**Gaps:** `tools/gfx/gpu-census.mjs` / `gpu-game-check.mjs` are named in the
AGENTS.md verification table and have no skill — draft **gpu-census**: "Use
when a render change needs proof it runs on a real GPU, not SwiftShader:
dispatch `gpu-census.yml` and read its Verdict step." The garage shot tools
are covered by `garage-parts-livery/references/garage-angles.md` but
under-indexed in `tools/README.md`. No merge or split beyond the
test-enforced folds.

**Top edits, ranked:** (1–2) the css-play / ui-menu-a11y boundary in both
descriptions; (3) webgpu-debug → asset-pack clause; (4) tune-physics →
playwright-probe camera clause; (5) garage-parts-livery routing line into
the description; (6) mcp-probe war story to `traps-chrome.md`; (7)
career-mode tables to `references/workflow.md`; (8) trim the `?v=dev`
restatements; (9) `disable-model-invocation` on lighting-tuner; (10)
`paths:` on the seven file-scoped skills.

### 4.3 Subagents, hooks, settings, workflows

**Hook coverage** (each hook run with synthetic JSON on stdin; the bypasses
were re-run by the main session and reproduce — and the guard then blocked
the session's own attempt to write this section, because the text below
contains the literal command: the false positive is real too):

| Rule | Enforced by | Gap |
|---|---|---|
| Rule 2, no source edit during a live run | `protect-files.sh:139-148` | — |
| Rules 6/7, no `pkill -f` / PID kill of a run | `bash-guard.sh:37-77` | `sh -c "pkill -f chrome"` and `/usr/bin/pkill -f chrome` both exit 0 (the regex hoists `sudo`/`env` but not `sh -c`, and matches the bare word only). An `echo` whose string contains `&& pkill -f chrome` is blocked (false positive). |
| Rule 11, generated files | `protect-files.sh:55-137` | `tests/data/ratchets.json` is in no list — an Edit exits 0 |
| Commit guard | `bash-guard.sh:79-141` | `git -C <dir> commit` is matched and runs the guards for real |
| Deploy-branch push ban | prompt only | no `allow`, no `deny`, so a raw `git push origin HEAD:claude/f1-game-project-26h3ng` is one prompt away |
| Never hand a subagent a browser run | `skill-progressive.test.mjs:389-421` lints the bodies | all five agents carry `Bash`; nothing stops `test-bg.mjs` inside one |
| `/tmp` ban | prose | `protect-files.sh:41-43` early-exits when the path is outside a repo, so `/tmp` is never evaluated |
| `console.*` ban | `no-bare-console.test.mjs` in `toolingFast` only | not in `test:guards`, so a bare `console.log` commits |

**Agent frontmatter, recommended:**

| Agent | Today | Change | Why |
|---|---|---|---|
| bloat-auditor | inherit; Bash,Read,Grep,Glob,WebFetch,WebSearch | `model: haiku`, `maxTurns: 15`, `memory: project` | scan-and-classify; `docs/plans/research-2026-09-16/agent-ergonomics.md` item 11 already designed the memory |
| deploy-research | inherit | `model: haiku`, `maxTurns: 10` | fetch, grep, compare |
| physics-contract-auditor | inherit | keep the tier; `maxTurns: 15` | column classification needs judgement |
| track-surveyor | inherit; the only Edit-capable agent | `isolation: worktree` once `worktree.baseRef: "head"` lands; `maxTurns: 30`; drop the checkout dance at `:58` | the iterative one |
| verify-agent | inherit | `model: haiku`, `maxTurns: 8`, `memory: project` for `--base` | runs one script, reports JSON verbatim |

Body issues: `track-surveyor.md:58` and `verify-agent.md:47` carry the
stale-worktree checkout that `worktree.baseRef: "head"` replaces — designed
in the 09-16 note (A6) and `agent-ergonomics.md` item 12, never landed
because the session's permission classifier refused the settings edit as
self-modification; a human pastes it. `verify-agent` `--base` names three
verdict tokens inline but nothing forces exactly one back. `bloat-auditor`'s
row format has no length cap on `why` / `carve`.

**Candidate subagents** (none duplicates an existing agent or skill):

| Name | Job | Tools / model | Returns |
|---|---|---|---|
| `ci-red-triage` | read a failed `ci.yml` / `pages.yml` run's job logs and junit; name test title, assertion, lane per the AGENTS.md template | Bash, Read, Grep, Glob, GitHub MCP; sonnet; read-only | one verdict line with Expected / Received / lane |
| `shared-branch-coordinator` | before fixing an inherited red, check recent pushes on the deploy branch and whether the fix already landed | Bash, Read, Grep, Glob; sonnet; read-only | "already fixed at SHA" / "proceed" / "a push landed N min ago, re-pull" |
| `spec-timing-auditor` | read junit and shard durations; flag imbalance or a spec past its group budget | Bash, Read, Grep, Glob; sonnet; read-only | specs to move + wall-time delta |
| `release-train-watcher` | given a SHA, tell PR CI, ship-push CI and Pages apart by `head_sha` and report in the AGENTS.md format | Bash, Read, Grep, Glob, WebFetch; sonnet; read-only | the status line |
| `circuit-batch-surveyor` | rank every circuit in `Tracks.LIST` by how much it needs `track-surveyor` | Bash, Read, Grep, Glob; haiku; read-only | prioritised list |

The routing test (§4.4) independently found the first of these as an
uncovered request.

**Hooks to add:** two are already designed in `agent-ergonomics.md` — a
PostToolUse async `node --check` + scoped lint after an `Edit(js/**)`
(item 9) and a Stop hook that refuses to end a turn over a live browser run
(item 3). New: a PreToolUse deny on a direct `git push` naming the deploy
branch (`deploy.mjs` pushes from a Node subprocess, so the sanctioned path
is untouched); a SubagentStop reap warning; a PreCompact re-print of the
session-start orientation line. Plus the two regex fixes above (`sh -c`,
absolute path), a `ratchets.json` entry in `protect-files.sh`, and a
tighter command-position match so quoted text stops tripping the guard.

**Settings:** the 09-16 note (lines 325-419) already holds the paste-in
`deny` block, the wider `allow` list and `worktree.baseRef`; land it as is.
One addition: deny `Bash(git push *claude/f1-game-project-26h3ng*)` so the
deploy branch is a hard stop while every other `git push` keeps prompting.

### 4.4 Routing test — 40 requests against the descriptions

Method: 40 realistic requests (32 clear, 8 deliberately straddling), routed
on descriptions alone, then the bodies of the chosen skills opened for every
ambiguous or low-confidence case. 30 routed high-confidence and correctly;
the rest:

| Request | Chosen | Verdict after reading the body |
|---|---|---|
| AI dives in, lap-1 pileups | ai-racecraft (runner-up race-incidents-control) | right — `c1Pileup` is a takeover system, not aggression |
| Suzuka Spoon elevation looks flat | new-track | agent-view first; new-track's own text redirects diagnosis there |
| `ci.yml` run red on my PR, why? | check-changes, LOW | **no owner** — check-changes is pre-push only; Actions-log triage lives only in AGENTS.md prose |
| Night too dark AND shadows wrong | lighting-tuner | split: dark → lighting-tuner, shadows → webgl-debug; a compound report has no resolver |
| Career save shows wrong sprint format | season-mode | **wrong** — career-mode's body owns "career state leaks into season", but the exception is invisible from season-mode's description |
| WGX garbled colours on the pit straight | webgpu-debug | asset-pack more likely (MAT-layer mismatch); webgpu-debug is the WGX catch-all |
| Did the last push regress frame rate or CI? | check-changes | genuinely needs check-changes + playwright-probe; nothing unifies them |
| AI cars crash into scenery near a chicane | ai-racecraft, LOW | **no owner** — car-vs-static-prop collision is neither scenery placement nor AI behaviour |

Lost requests: career-mode (missing "career's own season instance",
"in-career sprint/quali"); asset-pack (missing "wrong colours", "garbled
texture", "colour mismatch on WGX"). Stolen requests:
race-incidents-control's "pileups" headline; season-mode's exact-phrase
match on "season calendar / sprint / weekend format"; webgpu-debug's
"rendering is wrong" breadth.

Uncovered: red Actions-run triage; car-vs-scenery collision; a combined
CI-plus-perf regression check.

Rewrites proposed (each under 60 words, third person): race-incidents-control
(move "pileup" to the takeover mechanic and disclaim bad racing);
season-mode (standalone screen only; an in-career report is career-mode
even if it says sprint); career-mode (claim the in-save season/quali/sprint
behaviour); asset-pack (claim wrong / garbled / mismatched colours on any
backend; black or NaN-white is the renderer skill); check-changes (state
that it does NOT diagnose a red Actions run).

The pattern that worked: garage-parts-livery's redirect clause ("isolated
studio renders → playwright-probe") inside its own description resolved its
case cleanly; the losing pairs above lack the same clause on the side that
loses the keyword race.

## 5. Consolidated gaps, ranked by value ÷ effort

0. **Close the three hook holes found today** — a `sh -c` wrapper and an
   absolute path to the kill binary bypass `bash-guard.sh`;
   `tests/data/ratchets.json` is unprotected in `protect-files.sh`;
   `no-bare-console` is absent from `test:guards`. Each is a one-line
   change and each is a rule the repo already believes is enforced.
1. **Skill frontmatter extensions** — WITHDRAWN for `paths:` and
   `disable-model-invocation` (§6: both restrict activation, and the tree
   had already measured that for `paths`); `context: fork` remains open where
   a skill is really a subagent job.
2. **Agent frontmatter** — `model: sonnet`/`haiku` on bloat-auditor and
   deploy-research; `memory: project` on the repeat auditors;
   `isolation: worktree` + `worktree.baseRef: "head"` to retire the
   stale-checkout prose (09-16 A6); `maxTurns` everywhere.
3. **Deny list and allowlist** (09-16 A5) — deny `git push --force*`,
   `bump-cache.mjs --apply`, `assets.mjs bake*`, `rotate-markings.cjs
   --write`; allow the routine read-only shell and git verbs; keep plain
   `git push` prompting.
4. **New hooks** — `SubagentStart` browser ban; `Stop` reap check (rule 7);
   `PreCompact` re-inject of the session-start orientation line.
5. **Flake policy** — a stated budget and quarantine rule in `AGENTS.md`;
   `--fail-on-flaky-tests` on the gate so a retry-recovered pass is red.
6. **Mutation pass** on `js/physics/` and `js/track/core/` to measure
   whether the suite's growing `assert.match` count kills anything.
7. **Claim-before-work** — a mechanical form of the shared-branch protocol
   (a tracked lock row naming session, branch and the red being fixed,
   with an age limit).
8. **Duplicated rules and stale counts** — the `?v=dev` rule in nine skill
   bodies, `awaitSoftPresent` in four, the "208 of 278" triple in
   `AGENTS.md:44-45` (217 of 289 today), and the missing `llvmpipe` line
   (§4.1, §4.2 have the lists).
8b. **Description boundaries** — the five rewrites in §4.4 and the four
   redirect clauses in §4.2, so the losing side of each keyword race carries
   the exception.
8c. **`ci-red-triage`** — the one new subagent both the routing test and the
   agent review asked for independently.
9. **Diagnostics to run once locally** — `/doctor` and `/skill-doctor`
   (neither runs over Remote Control) to test the 26-skill roster for dead
   weight; `/context` to price the two browser MCP schemas.
10. **Not worth doing** — agent teams for coding work (15× tokens for
    coupled tasks), a merge queue (unavailable), `merge=union` on ratchets
    (corrupts them), retries above 1.

## 6. Landed the same day (branch `claude/project-understanding-research-87a711`)

Applied after the research above, on this date, with the test that pins each
change. Two items the reviews recommended were **withdrawn on evidence in the
tree**, recorded here so they are not re-proposed.

| Item | Landed | Pinned by |
|---|---|---|
| `bash-guard.sh`: the `sh -c` and absolute-path bypasses closed, the quoted-`&&` false positive removed (quoted strings blanked, heredoc bodies dropped, a shell `-c` body unwrapped) | yes | `agent-config.test.mjs` "every shape of the kill" (13 block, 6 allow) |
| `bash-guard.sh`: a browser run is refused inside a subagent (hook input carries `agent_id` / `agent_type` or a transcript under `subagents/`, which this session's own transcripts confirmed) | yes | `agent-config.test.mjs` "refuses a browser run from inside a subagent" |
| `protect-files.sh`: `tests/data/ratchets.json` joins the never-hand-edited list | yes | `agent-config.test.mjs` "treats ratchets.json as tool-written" |
| `no-bare-console` joins `test:guards` (was `toolingFast` only) | yes | `tests/groups.json`, regenerated `package.json` |
| `AGENTS.md`: the "208 of 278" triple replaced by the list it names; `~3 min` → `~2 min`; the `llvmpipe` line; rule 5 marked tool-enforced; rule 9 gains the flaky-pass rule; rule 10 names the hook; the derivable directory prose cut; the hooks paragraph names all five; the who-is-on-it line in §Git | yes, 200 lines | `agent-config.test.mjs` line cap |
| Five description rewrites + four redirect clauses (§4.2, §4.4) | yes | `skill-progressive.test.mjs` trigger regexes |
| `?v=dev` restatements in seven skill bodies → bare links; css-play and slim-bloat Chrome-MCP lines → links; skills README fold history → §4.2 here; the Cursor entry's restated browser rules → a pointer | yes | `skill-progressive.test.mjs` "skills README says … ?v=dev" (kept its one sentence) |
| Agents: `model: haiku` on verify-agent, deploy-research, bloat-auditor; `maxTurns` on all; `memory: project` on verify-agent and bloat-auditor with seeded `MEMORY.md`; verify-agent's `DELTA:` token; bloat-auditor's 140-char row cap | yes | `skill-progressive.test.mjs` TIER table |
| New subagent `ci-red-triage` (sonnet, read-only, the AGENTS.md status line) | yes | six-agent list in `skill-progressive.test.mjs` |
| New hooks `post-edit-check.sh` (PostToolUse: `node --check`, `verify-track` for a circuit) and `stop-guard.sh` (Stop: one nudge per live run, `stop_hook_active` and `.claude/allow-stop` respected) | yes, registered | `agent-config.test.mjs` "registers the hooks" |
| `run-playwright.mjs`: `APEX_FAIL_ON_FLAKY=1` passes `--fail-on-flaky-tests` | superseded the same day (next row): the Playwright flag is all-or-nothing | — |
| Flaky policy ON THE GATE: `tests/helpers/live-reporter.js` fails a run under `APEX_FAIL_ON_FLAKY=1` when a test passed only on retry, unless its spec is in `tests/data/flaky-quarantine.json` (owner, date, why; `wake-lock.spec.js` is the one entry); `ci.yml` sets the variable on all six browser-job env blocks | yes | `flaky-quarantine.test.mjs` (ledger shape, verdict, ci.yml coverage, no CLI flag) |
| `tools/ci/who-is-on-it.mjs`: recent pushes per branch, commits touching named paths | yes | `tools-runnable`, `tools/README.md` row |
| `who-is-on-it --claim / --release`: one `claude/claims/<slug>` branch per session branch, empty-tree commit as the claim, `released` tombstone as the release, listed with age (stale > 2 h). Measured on the way: the git proxy allows `refs/heads/claude/*` only (`refs/claims/*` → 403) and refuses ref deletion over git and REST alike, hence the tombstone | yes, live-tested (`claude/claims/probe-87a711` is the tombstoned probe) | `who-is-on-it.test.mjs` |
| `deploy.mjs --pr` without `gh`: REST list/create + GraphQL `enablePullRequestAutoMerge` over `curl`, token in the curl config on stdin (never argv); the compare URL only when there is no token either | yes | `deploy-pr-rest.test.mjs` (fake `curl` on PATH) |
| `deploy.mjs --pr` auto-merge, CORRECTED: the first version armed it over GraphQL, which `api.github.com/graphql` REFUSES from a Claude Code session — and the refusal is a plain `{"message": …}` with no `errors` array, so the code read it as success. PRs #182 and #184 were both told auto-merge was armed; neither timeline ever carried an `auto_merge_enabled` event and both were merged by hand. Now armed through the session's CCR route (`PUT /repos/{o}/{r}/pulls/{n}/ccr/auto_merge`) and CONFIRMED by reading the PR back, with the note saying "WATCH this PR and merge it yourself" whenever it is not. The lesson is the general one: absence of an error is not evidence of an effect | yes | `deploy-pr-rest.test.mjs` (GraphQL now fails the fake curl outright; one case replays the 200-shaped refusal and asserts `autoMerge: false`) |
| Triage of the push/PR dedupe: AGENTS.md rule 8 and `ci-red-triage` now tell the DESIGNED cancellation (same `head_sha`, cancelled seconds in, sibling still running — the PR run on the merge commit wins) from a superseded push. Investigated as a possible CI defect and found to be the CURE for one: before 2026-09-10 a push to a branch with an open PR started two full runs that never cancelled each other, 58.5 + 47.4 job-minutes for one commit. Dropping the `pull_request` trigger — the obvious fix — would discard the merge-commit verdict and buy nothing, so the mechanism is unchanged and only the reading of it was wrong | yes, guidance only | `ci-coverage.test.mjs` (the group expression and both triage surfaces, pinned together) |
| Mutation pass: three new asymmetric mutants — `m-tyre-cliff-flat`, `m-tyre-long-share-full` (tyre-model.js, `tyre-model.test.mjs`) and `m-line-kon-blunt` (track/core/line.js, `track-line.test.mjs`); each run through `twin-fidelity.mjs`, 1/1 caught as declared | yes | `twin-fidelity.test.mjs` (needle uniqueness, asymmetry) |
| `context: fork` + `agent:` on `playwright-probe` and `survey-ui-matrix` (general-purpose) and `survey-track` (track-surveyor): the batch frames, matrix walk and survey output stay in the fork; each body says what comes back and what stays the parent's (the fleet gate: a browser run is blocked inside the fork). `slim-bloat` stays in-context because the parent applies its carves | yes | `agent-surface.test.mjs` "every skill with agent: names an existing subagent or a builtin, and forks" |
| `/doctor`, `/skill-doctor`, `claude plugin eval` (§5 items 6) | not actionable from a remote container: interactive CLI surfaces; run them from a desktop session and record the report in this note | — |
| Watch the hooks for a week (§5 item 7) | not actionable in one session by construction; the `post-edit.sh` debounce and `stop-guard.sh` one-nudge rule are the two things to re-read after a week of use | — |
| `.gitignore`: `!.claude/agent-memory/` | yes | — |

**Withdrawn.** `paths:` on the file-scoped skills: the tree already tried it —
`skill-progressive.test.mjs` "file-family skills…" records that four skills
carried `paths` until 2026-09 and were invisible to a chat-only ask ("why is
WGX black?" with no file open), so the field restricts activation rather than
adding it. `disable-model-invocation: true` on lighting-tuner: it hides the
description from the model entirely, so "night looks washed out" would stop
routing; only the bake reference is destructive, and that stays a
user-initiated step inside the body.

**Settings, landed on the second try.** The `.claude/settings.json` write
was refused by the auto-mode permission classifier as self-modification, as
it was on 09-16; with auto mode off it went through as an ordinary approval.
The file below is what landed: every existing entry kept, plus
`permissions.deny` (force-push, the deploy branch by name, `bump-cache
--apply`, `assets.mjs bake`, `rotate-markings --write`), the wider read-only
`allow` list, `worktree.baseRef: "head"`, and the two new hook rows, so
`post-edit-check.sh` and `stop-guard.sh` fire from the next session. Lesson
for the next pass: a settings edit needs auto mode OFF, not a retry.

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run test:*)", "Bash(npm test *)", "Bash(npm run gen)", "Bash(npm run gen:*)",
      "Bash(npm install *)", "Bash(npm ci)", "Bash(npx playwright install *)", "Bash(npx serve *)",
      "Bash(node --test *)", "Bash(node --check *)", "Bash(node -e *)",
      "Bash(node tools/ci/verify-change.mjs *)", "Bash(node tools/ci/pick-tests.mjs *)",
      "Bash(node tools/ci/select-specs.mjs *)", "Bash(node tools/ci/test-bg.mjs *)",
      "Bash(node tools/ci/test-solo.mjs *)", "Bash(node tools/ci/tooling-fast.mjs *)",
      "Bash(node tools/ci/twinned-specs.mjs *)", "Bash(node tools/ci/bump-cache.mjs *)",
      "Bash(node tools/ci/deploy.mjs --plan*)", "Bash(node tools/ci/deploy.mjs --gate-only*)",
      "Bash(node tools/ci/sync-pr.mjs * --plan*)", "Bash(node tools/ci/who-is-on-it.mjs *)",
      "Bash(node tools/track/verify-track.cjs *)", "Bash(node tools/track/graph-parity.cjs *)",
      "Bash(node tools/gen/gen-shell.mjs *)", "Bash(node tools/gen/gen-test-groups.mjs *)",
      "Bash(node tools/gen/gen-*.mjs *)", "Bash(node tools/gen/assets.mjs verify)",
      "Bash(node tools/check/*)", "Bash(node tools/shot/*)", "Bash(node tools/ui/*)",
      "Bash(node tools/gfx/wgx-validate.mjs *)", "Bash(node tools/gfx/gfx-probe.mjs *)",
      "Bash(bash tools/env/cloud-agent-install.sh)", "Bash(bash tools/env/mirror-skills.sh *)",
      "Bash(tools/mcp/apex-tools-mcp.sh call *)",
      "Bash(git status *)", "Bash(git diff *)", "Bash(git log *)", "Bash(git branch *)",
      "Bash(git show *)", "Bash(git add *)", "Bash(git commit *)", "Bash(git fetch *)",
      "Bash(git checkout *)", "Bash(git switch *)", "Bash(git stash *)", "Bash(git worktree *)",
      "Bash(git merge *)", "Bash(git rev-parse *)", "Bash(git ls-files *)", "Bash(git remote *)",
      "Bash(git for-each-ref *)",
      "Bash(grep *)", "Bash(rg *)", "Bash(cat *)", "Bash(ls *)", "Bash(wc *)", "Bash(find *)",
      "Bash(head *)", "Bash(tail *)", "Bash(sed -n *)", "Bash(awk *)", "Bash(sort *)", "Bash(jq *)",
      "Bash(diff *)", "Bash(cat /proc/loadavg)", "Bash(ps *)",
      "Bash(curl http://127.0.0.1*)", "Bash(curl http://localhost*)"
    ],
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f *)",
      "Bash(git push * claude/f1-game-project-26h3ng*)",
      "Bash(git push *:claude/f1-game-project-26h3ng*)",
      "Bash(node tools/ci/bump-cache.mjs --apply*)",
      "Bash(node tools/gen/assets.mjs bake*)",
      "Bash(node tools/track/rotate-markings.cjs --write*)"
    ]
  },
  "worktree": { "baseRef": "head" },
  "enabledMcpjsonServers": ["apex-tools", "playwright-official", "chrome-devtools"],
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh\"", "timeout": 300 } ] }
    ],
    "PreToolUse": [
      { "matcher": "Write|Edit|MultiEdit|NotebookEdit",
        "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/protect-files.sh\"" } ] },
      { "matcher": "Bash",
        "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/bash-guard.sh\"", "timeout": 180 } ] }
    ],
    "PostToolUse": [
      { "matcher": "Write|Edit|MultiEdit",
        "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/post-edit-check.sh\"", "timeout": 30 } ] }
    ],
    "Stop": [
      { "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR/.claude/hooks/stop-guard.sh\"", "timeout": 10 } ] }
    ]
  }
}
```

Plain `git push` (no target) is deliberately absent from both lists so it
keeps prompting; the deploy branch is a hard stop by name. The `deny` list
is a guardrail against a slip, not a security boundary (`node -e` and `awk`
are general execution) — the hooks are the enforcement layer.

**Collision, measured.** While this branch's deploy train ran its gate, three
pushes landed on the deploy branch: PR #170 (CI hardening), a career merge,
and PR #172 — another session's agent-surface pass, done in the same hour
from the same 09-16 backlog. The train re-verified twice (about 12 minutes
each) and stopped on real conflicts in `settings.json`, `AGENTS.md` and two
skill files. Hand-merged here. Where the two sessions decided differently:

| Item | This branch | PR #172 | Merged |
|---|---|---|---|
| PostToolUse after an edit | `post-edit-check.sh`, blocking (exit 2), `node --check` + `verify-track` | `post-edit.sh`, advisory (exit 0, debounced), gen `--check` + `verify-track` | theirs, with the syntax check folded in |
| `paths:` on skills | withdrawn on the skill-progressive comment | added to four skills as an additive file-access trigger, test-pinned | theirs (the pin wins; the comment now records both readings) |
| Ladder counts in AGENTS.md | replaced by the list's name, to stop rotting | kept as `N of M`, pinned live by `docs-integrity` | theirs (a pinned number beats a vague one) |
| Frontmatter keys | `disallowed-tools` on check-changes | an allow-list test of host-documented keys, without it | theirs; the key is dropped |
| `protect-files.sh` | `ratchets.json` guarded | the escape hatch narrowed to rules 1 and 3; the live-run check scoped to this checkout | both, auto-merged |

The lesson is the one §3.3 predicted: `who-is-on-it` would have shown PR
#172's branch active before this pass started, had it existed then. It
exists now; run it first.

**Two more measurements from the same deploy.** (1) The rerun's gate reported
`coverage-merge.test.mjs` red with "Cannot find package": PR #172 had added a
dev dependency and the train merged the lockfile without installing, so the
verdict was about this box, not the union. `deploy.mjs` now installs after any
merge that touches `package-lock.json` (`installIfLockMoved`). (2) The deploy
branch itself was red at PR #172's merge, and `ci-red-triage`'s first live run
named it in one pass: `docs-integrity` "N of M unit files", Structural guards,
expected 223 got 218, new on that push, green on the base; `who-is-on-it`
showed two branches already fixing it, so no third fix was written here.

### 6.1 Skill fold provenance (moved here from `.claude/skills/README.md`)

44 skills until 2026-09, 26 after. The folded ones and the rows that absorbed
them: `bump-cache`, `deploy-merge`, `test-timeout-triage` → check-changes;
`motion-capture`, `perf-profile`, `car-viewer`, `debug-cameras` →
playwright-probe; `bake-lighting` → lighting-tuner; `scene-graph-instancing`
→ scenery-dress; `debug-state`, `debug-tracks` → agent-view; `game-feel` →
tune-physics; `restructure-screens-css` → css-play; `cross-backend-parity` →
`docs/ARCHITECTURE.md` §Cross-backend parity. Deleted outright:
`apex-env-setup`, `pixel-perfect`, `webapp-testing`, `webgpu-inspector` (env
setup is AGENTS.md §Verification 1 + `tools/env/cloud-agent-install.sh`).
`tests/unit/skill-progressive.test.mjs` pins the folds and the trigger words
each hub had to absorb.

## Sources

Primary: code.claude.com docs (memory, best-practices, skills, sub-agents,
hooks, permissions, mcp, agents, workflows, agent-teams); agents.md;
anthropic.com engineering (agent skills, multi-agent research system, code
execution with MCP, advanced tool use); claude.com blog (when to use
multi-agent); modelcontextprotocol.io spec 2026-07-28; github.com/anthropics/skills
and claude-code-action; playwright.dev best practices; docs.github.com
(environments, immutable releases, required status checks). Secondary
sources are linked inline where they carried a number or a pattern the
primary docs did not.
