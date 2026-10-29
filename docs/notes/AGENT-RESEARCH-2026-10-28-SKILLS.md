<!-- Research subagent report (2026-10-28), copied verbatim from scratch/research/skills-design.md. Spot-checked claims are listed in docs/notes/SKILL-REVIEW-2026-10-28.md; everything else is unverified. -->
# Agent Skills with scripts, references and assets: best practice (2026-10-28) vs `.claude/skills/`

Research only. No repo file edited except this report. Sources were fetched 2026-10-28; quotes are verbatim.
Sources: [CC] https://code.claude.com/docs/en/skills (Claude Code skills page) · [BP] https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices · [SPEC] https://agentskills.io/specification · [AS-BP] https://agentskills.io/skill-creation/best-practices · [AS-SCR] https://agentskills.io/skill-creation/using-scripts · [AS-DESC] https://agentskills.io/skill-creation/optimizing-descriptions · [AS-EVAL] https://agentskills.io/skill-creation/evaluating-skills · [PE] https://code.claude.com/docs/en/plugin-evals (`claude plugin eval`) · [GH] https://github.com/anthropics/skills (skills/pdf, docx, xlsx, skill-creator, mcp-builder; checked · [BLOG] https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills · [CODEX] https://developers.openai.com/codex/skills (now redirects to learn.chatgpt.com/docs/build-skills) · [CURSOR] https://cursor.com/docs/skills

## 1. Layout: scripts/, references/, assets/; executed vs read

- The spec's layout is: "skill-name/ ├── SKILL.md # Required ├── scripts/ # Optional: executable code ├── references/
  # Optional: documentation ├── assets/ # Optional: templates, resources" [SPEC]. Codex [CODEX] and Cursor [CURSOR]
  use the same three directories. Codex also adds `agents/openai.yaml` ("appearance and dependencies").
- What each directory is for [SPEC]:
  - `scripts/`: "Be self-contained or clearly document dependencies · Include helpful error messages · Handle edge
    cases gracefully".
  - `references/`: "Keep individual reference files focused. Agents load these on demand, so smaller files mean less
    use of context."
  - `assets/`: "Templates (document templates, configuration templates) · Images · Data files (lookup tables,
    schemas)".
- skill-creator [GH] puts it in one line each: "scripts/ - Executable code for deterministic/repetitive tasks ·
  references/ - Docs loaded into context as needed · assets/ - Files used in output (templates, icons, fonts)".
- Executed vs read:
  - [CC] tree: "scripts/helper.py (utility script - executed, not loaded)".
  - [BP]: "Make clear in your instructions whether Claude should: **Run the script** (most common) … **Read it as
    reference** (for complex logic)". Also: "Scripts run efficiently: … Only the script's output consumes tokens."
- Pointing from SKILL.md:
  - [BP]: "**Keep references one level deep from `SKILL.md`**. All reference files should link directly from
    `SKILL.md`". The reason it gives: "Claude might use commands such as `head -100` to preview content rather than
    reading entire files".
  - [BP]: "For reference files longer than 100 lines, include a table of contents at the top."
  - [AS-BP]: "'Read `references/api-errors.md` if the API returns a non-200 status code' is more useful than a
    generic 'see references/ for details.'"
  - Paths: [SPEC] says to use "relative paths from the skill root", and [AS-SCR] notes that "script execution paths
    (in code blocks) are relative to the **skill directory root**".
  - Claude Code has its own variable [CC]: "`${CLAUDE_SKILL_DIR}` … Using the same variable in both places lets a
    skill run a bundled script without a permission prompt" (example: `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)`).
- Size: [CC] "Keep `SKILL.md` under 500 lines." [SPEC] "Instructions (< 5000 tokens recommended)".
- Real examples [GH]:
  - `pdf/` keeps FORMS.md and REFERENCE.md at the root, with 8 scripts. The body says "If you need to fill out a PDF
    form, read FORMS.md and follow its instructions". FORMS.md then says "Run this script from this file's
    directory: `python scripts/check_fillable_fields <file.pdf>`".
  - `docx/` and `xlsx/` give inline one-liners such as
    `python scripts/office/validate.py out.docx --original doc.docx   # XSD checks; --auto-repair fixes common issues`.
  - `mcp-builder/` uses `reference/` (singular) and adds a "**Load ✅ Evaluation Guide (`reference/evaluation.md` in that repo)
    …**" line.
  - `skill-creator/` has `agents/` (subagent prompts), `assets/eval_review.html`, `references/schemas.md` and 8
    scripts. Its body has a "The agents/ directory contains instructions for specialized subagents. Read them when
    you need to spawn the relevant subagent" section.

## 2. Script design for agents

- Prefer code for deterministic work:
  - [BLOG]: "sorting a list via token generation is far more expensive than simply running a sorting algorithm …
    many applications require the deterministic reliability that only code can provide."
  - [BP] lists the gains: "Are more reliable than generated code · Save tokens · Save time · Ensure consistency".
  - [BP] "Prefer scripts for deterministic operations: Write `validate_form.py` rather than asking Claude to
    generate validation code."
  - When to bundle one [AS-BP]: "If you notice the agent independently reinventing the same logic each run … that's
    a signal to write a tested script once and bundle it in `scripts/`."
  - Codex leans the other way [CODEX]: "Prefer instructions over scripts unless you need deterministic behavior or
    external tooling."
- Solve, don't defer [BP]: "handle error conditions rather than deferring to Claude". On constants: "avoid 'voodoo
  constants' (Ousterhout's law). If you don't know the right value, how will Claude determine it?" (bad:
  `TIMEOUT = 47  # Why 47?`).
- Agent-facing interface [AS-SCR]:
  - "Avoid interactive prompts … This is a hard requirement".
  - "`--help` output is the primary way an agent learns your script's interface".
  - "say what went wrong, what was expected, and what to try" (`Error: --format must be one of: json, csv, table.
    Received: "xml"`).
  - "Prefer structured formats — JSON, CSV, TSV" and "send structured data to stdout and … diagnostics to stderr".
  - Also: "Idempotency", "Dry-run support", "Meaningful exit codes", "Safe defaults … (`--confirm`, `--force`)",
    "Predictable output size … (e.g., 10-30K characters)".
- Plan-validate-execute [BP]: "analyze → **create plan file** → **validate plan** → execute → verify". Validators
  should be verbose: "Field 'signature_date' not found. Available fields: customer_name, order_total,
  signature_date_signed".
- Feedback loop [BP]: "Run validator → fix errors → repeat … This pattern greatly improves output quality."
- Dependencies:
  - [BP] "List required packages in your `SKILL.md`"; "claude.ai: Can install packages … Claude API: Has no network
    access".
  - [AS-SCR] pin versions (`npx eslint@9.0.0`) and use inline deps (PEP 723 with `uv run`, Deno `npm:`).
  - [SPEC] `compatibility` (≤500 chars) records environment requirements.
- Security [BLOG]: "pay particular attention to code dependencies and bundled resources like images or scripts".

## 3. Description, frontmatter and invocation (Claude Code, as of 2026-10-28)

- Caps:
  - Spec [SPEC]: "`description` … Max 1024 characters".
  - Claude Code [CC]: "the combined `description` and `when_to_use` text is truncated at 1,536 characters in the
    skill listing … The cap is configurable with `skillListingMaxDescChars`." The listing budget "scales at 1% of
    the model's context window. When the listing overflows, Claude Code drops descriptions starting with the skills
    you invoke least".
  - Codex [CODEX]: "at most 2% of the model's context window, or 8,000 characters … Front-load the key use case and
    trigger words".
- Writing descriptions:
  - [BP] "**Always write in third person**".
  - [AS-DESC] "**Use imperative phrasing** … 'Use this skill when...'" and "**Err on the side of being pushy**".
  - skill-creator [GH]: "Claude has a tendency to 'undertrigger' skills … make the skill descriptions a little bit
    'pushy'".
  - These sources differ on point of view. This repo's "Use when …" style follows agentskills and skill-creator.
- Frontmatter reference [CC] (abridged; every field optional):

| Field | Description (verbatim, trimmed) |
|---|---|
| `name` | "Command name shown in the `/` menu. Defaults to the directory name." |
| `description` | "What the skill does and when to use it … Put the key use case first" |
| `when_to_use` | "Additional context … such as trigger phrases or example requests. Appended to `description` … counts toward the 1,536-character cap." |
| `argument-hint` / `arguments` | autocomplete hint / "Named positional arguments for `$name` substitution" |
| `disable-model-invocation` | "prevent Claude from automatically loading this skill … Also prevents the skill from being preloaded into subagents" |
| `user-invocable` | "`false` when only Claude should invoke the skill … Default: `true`." |
| `allowed-tools` | "Tools Claude can use without asking permission during the turn that invokes this skill. The grant clears when you send your next message." |
| `disallowed-tools` | "Tools removed from Claude's available pool while this skill is active" |
| `model` / `effort` | per-turn model / effort override |
| `context` / `agent` / `background` | "`fork` to run in a forked subagent context" / "Which subagent type" / "`false` to wait for the forked subagent's result" |
| `hooks` | hooks registered when invoked, for the rest of the session |
| `paths` | "Glob patterns that limit when this skill is activated" |
| `shell` | `bash` (default) or `powershell` for `!` blocks |
| `metadata`, `license`, `compatibility` | spec fields; Claude Code "accepts the field but doesn't act on it" |

- Substitutions [CC]: `$ARGUMENTS`, `$ARGUMENTS[N]`/`$N`, named `$name`, `${CLAUDE_SKILL_DIR}`,
  `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_SESSION_ID}`.
- Dynamic context: "The `` !`<command>` `` syntax runs shell commands before the skill content is sent to Claude".
  The gotchas [CC]:
  - "A failed command aborts the entire skill invocation";
  - "exit code 1 from search and comparison commands" is tolerated, so otherwise append `|| true`;
  - synced or Cowork skills receive the `!` lines as literal text.
- Portability:
  - Codex has no `disable-model-invocation`. It uses `agents/openai.yaml` with `policy.allow_implicit_invocation:
    false` [CODEX].
  - Cursor supports `paths`, `disable-model-invocation` and `metadata` [CURSOR].
  - claude.ai uploads accept only `name, description, license, compatibility, metadata, allowed-tools` [CC].
- Persistence [CC]: "Claude Code does not re-read the skill file on later turns". After compaction it "can keep only
  the start of an invoked skill, so put the most important instructions near the top". It also advises: "Claude
  skipped a rule that must hold every time: move the rule into a hook".

## 4. Evaluating skills

- Eval-driven development [BP]: "**Create evaluations BEFORE writing extensive documentation.**" The steps are
  "Identify gaps → Create evaluations (three scenarios) → Establish baseline → Write minimal instructions →
  Iterate". The checklist asks for "At least three evaluations created · Tested with Haiku, Sonnet, and Opus".
- Baseline comparison [CC]: "run each one in a fresh session with the skill available and again with it turned off".
  To turn a project skill off, "set it to `"off"` in `skillOverrides`".
- skill-creator loop [CC][GH]:
  - files: `evals/evals.json`, then `grading.json`, then `benchmark.json` (with vs without skill: pass rate, time,
    tokens);
  - "blind A/B between two versions";
  - "Description tuning: generates should-trigger and should-not-trigger prompts, measures the hit rate".
  - Its `run_loop.py` "splits the eval set into 60% train and 40% held-out test … running each query 3 times".
- Trigger-rate testing [AS-DESC]:
  - "Aim for about 20 queries: 8-10 that should trigger and 8-10 that shouldn't".
  - "The most valuable negative test cases are **near-misses**".
  - "Run each query multiple times (3 is a reasonable starting point) and compute a **trigger rate**".
  - Train/validation split "~60% / ~40% … keep the split fixed across iterations".
- Output grading [AS-EVAL]:
  - "Require concrete evidence for a PASS";
  - "Remove or replace assertions that always pass in both configurations";
  - "For assertions that can be checked by code … use a verification script".
- `claude plugin eval` [PE]:
  - "Each case is a realistic prompt plus one or more graders"; "each case runs three times by default";
  - there is a no-plugin baseline (`WITH`/`W/OUT`/`Δ`);
  - grader types are `regex`, `tool_used`, `tool_order`, `file_exists`, `llm`, `baseline`, and "There are no
    custom-code graders";
  - the routing check is `type: tool_used`, `tool: Skill`, with an `input_match` on the skill name;
  - it "exits non-zero below a threshold so you can gate CI on it".
  - It needs a plugin manifest or a "skills-directory plugin". I have not verified whether this repo's plain
    `.claude/skills/` qualifies.
- [CC] notes the two eval formats "aren't interchangeable". `claude plugin validate .claude/skills` finds
  frontmatter that does not parse (v2.1.233+).

## 5. Anti-patterns (all quoted)

• "Avoid time-sensitive information … use 'old patterns' section" [BP]. • "Avoid deeply nested references" [BP]. • "Avoid offering too many options … Provide a default (with escape hatch)" [BP]; [AS-BP] puts it as "Provide defaults, not menus". • "Avoid Windows-style paths" [BP]. • "voodoo constants" [BP]. • Verbose explanations: "Default assumption: Claude is already very smart. Only add context Claude doesn't already have" [BP]. [AS-BP] gives the test: "'Would the agent get this wrong without this instruction?' If the answer is no, cut it." • "Overly comprehensive skills can hurt more than they help" [AS-BP]. • Don't assume tools are installed [BP]. For MCP tools, use fully qualified names (`ServerName:tool_name`) [BP]. • Vague names (`helper`, `utils`) and "Inconsistent patterns within your skill collection" [BP]. • Positive pattern: "The highest-value content in many skills is a list of gotchas … Keep gotchas in `SKILL.md` where the agent reads them before encountering the situation" [AS-BP].

## 6. This repo, measured (worktree HEAD, 2026-10-28)

- Skill count: `.claude/skills/` has **36** skill directories. The 37th entry is `README.md`.
  - 31 skills have `references/` (100 files); 1 has `scripts/` (`lighting-tuner`: bake.mjs, merge-proposals.mjs);
    **0** have `assets/`; **0** have `evals/`.
  - Without `references/`: agent-config, check, handoff, race-weekend, ship.
- Description lengths:
  - total 10,835 chars against the cap `skillDescriptionChars` = 11,000 (`tests/data/agent-config-budgets.json`),
    which leaves **165 chars of headroom**;
  - longest: input-controls 441, race-incidents-control 435, agent-view 402; mean 300;
  - all far under the per-skill 1,024 cap (repo test) and Claude Code's 1,536.
  - All descriptions use the "Use when …" form with a "Not X → skill" clause.
- Body size: every SKILL.md is under 500 lines. Largest: steward 170 lines / 1,759 words, renderer-debug 137/1,173,
  survey-ui-matrix 132/1,130, input-controls 121/1,128.
- Frontmatter:
  - extra keys are rare: `user-invocable: true` on check/handoff/ship, which is the default and so redundant;
    `argument-hint` on survey-track;
  - none use `allowed-tools`, `disable-model-invocation`, `when_to_use`, `context: fork`, `${CLAUDE_SKILL_DIR}`,
    `paths` (deliberate: agent-config says "no `paths:`");
  - one dynamic injection: check-changes line 19, ``!`node tools/ci/pick-tests.mjs 2>&1 | head -24` ``.
- Pointers to tools/ CLIs instead of bundled scripts:
  - 148 distinct `tools/…` paths are named across skill markdown. playwright-probe has 26 mentions, survey-ui-matrix
    23, mcp-probe 20, check-changes 18.
  - Even tools that only one skill names (for example `tools/perf/garage-census.mjs` in mcp-probe and
    `tools/check/check-physics.mjs` in tune-physics) are referenced by 3–9 other repo files (tests, docs, generated
    `tools/README.md` `@skill` headers, apex_* MCP wrappers).
  - So tools/ is the shared CLI layer by design. The apex-tools MCP says "Skills say when; tools/ CLIs do the work".
- References: **0 of 100** reference files are orphans, because every one is named in its own SKILL.md.
  - Long reference files carry a `## Contents` TOC.
  - But about 30 reference files link on to other reference files (second level). Examples: mcp-probe/traps.md →
    traps-chrome.md → offline.md; f1-animation-cameras/game.md → replay.md → replay-diagnosis.md.
  - 16 files link **across skills** to `check-changes/references/bump.md`. Only 5 SKILL.md link it directly; the
    other skills reach it two levels down.
  - 25 links in SKILL.md bodies leave the skill directory (`../../../docs/…`).
- Gotchas placement: only 2 skills have a heading named Pitfalls/Gotchas/Traps (agent-config line 84 of 89;
  race-weekend line 73 of 87), and both sit at the END. This was a heading-name grep only; inline "Never …"
  lines elsewhere were not counted.
- Script quality (lighting-tuner/scripts/bake.mjs):
  - Good: `--help`, `--check/--dry-run`, `--json`, unknown-flag rejection, specific stderr errors.
  - But on a likely-wrong full replace (fewer profiles than on disk) it prints "Writing anyway (this tool never
    blocks)" and overwrites. That goes against [AS-SCR] "Safe defaults … require explicit confirmation flags".
  - Its paths are repo-root-relative (`node .claude/skills/lighting-tuner/scripts/bake.mjs`). That is correct here,
    because Codex reads the `.agents/skills` symlink with the same cwd and does not substitute `${CLAUDE_SKILL_DIR}`.
- Evaluation already in place, ahead of most public practice:
  - trigger-rate routing eval `tools/check/skill-routing-eval.py` (8 queries per skill, 5 positive + 3
    near-miss, `--runs`, base/head `--compare`, detection "follows the skill-creator's run_eval.py");
  - a ≥85% top-2 hint floor (`tests/unit/skill-hint-hook.test.mjs`);
  - offline smoke recipes (`tools/check/skill-smoke.mjs`).
  - Gaps: no held-out split, about 8 queries per skill against the recommended ~20, and **no with-skill vs
    without-skill OUTPUT-quality eval** for any skill.

## 7. Ranked proposals (concrete; none applied)

1. **Add output-quality evals for 2–3 high-traffic skills** (steward, check-changes, lighting-tuner bake).
   - Create `.claude/skills/<s>/evals/evals.json` in skill-creator format: 3 cases each, with assertions graded by
     scripts where possible.
   - Turn the skill off for the baseline arm with `skillOverrides: {"<s>": "off"}` [CC].
   - Record the deltas in `docs/notes/`.
   - Why: [BP] "At least three evaluations created" and [AS-EVAL]. Today the repo measures routing, not whether the
     skill improves the outcome.
2. **Hold out a fixed validation split in routing evals.**
   - Tag 3 of each `tests/data/skill-routing/queries/<s>.json` rows `"split":"validation"` (keep 1 near-miss in
     each split).
   - Have `skill-routing-eval.py --compare` report train and validation separately.
   - Grow to ~12 rows for the 6 most-confused pairs.
   - Why: description rewrites are tuned on the same 8 rows they are scored on, which is the overfitting [AS-DESC]
     warns about.
3. **Flatten second-level reference chains.**
   - Every reference that another reference links to (about 30; list with the grep in §6) must also get a direct
     "Read X when …" line in its own SKILL.md, or be merged into its parent.
   - Replace the cross-skill `check-changes/references/bump.md` hops with a direct SKILL.md line in each of the 11
     skills that reach it only through a reference.
   - Add a rule in `tests/unit/skill-progressive.test.mjs`: a reference may link only to files its SKILL.md also
     links. Why: [BP] "one level deep".
4. **Move gotchas to the top of SKILL.md.**
   - Each body should open with a ≤6-line `## Gotchas` drawn from the corrections already recorded in
     references/traps*.md and the end-of-file Pitfalls (agent-config, race-weekend). Start with steward,
     renderer-debug, mcp-probe and playwright-probe.
   - Why: [AS-BP] gotchas belong where they are read first, and [CC] after compaction "can keep only the start".
   - Document the convention in `.claude/skills/agent-config/SKILL.md`.
5. **Make bake.mjs safe by default.** In `.claude/skills/lighting-tuner/scripts/bake.mjs`, exit 2 on the
   shrinking full replace unless `--force` is passed, keep the existing advice text, and document the exit codes in
   `--help` [AS-SCR].
6. **Write a "script contract" for skill-named tools/ CLIs.**
   - Do not move tools/ into skill `scripts/`: they are shared by tests, MCP wrappers and generated docs.
   - Instead, add one agent-config bullet with the contract: non-interactive; `--help` with examples; JSON on
     stdout, diagnostics on stderr; distinct exit codes; bounded output (`--limit`/`--out`); `--dry-run` for
     writes.
   - Have `game-tools-help.test.mjs`/`tools-w13a-agent-help.test.mjs` assert `--help` exits 0 for every
     `tools/…` path a SKILL.md names. Note: §6's regex also caught `.json` data paths as false `.js` hits.
   - Bundle a script under `scripts/` only when it is used solely by that skill and touches nothing else (the
     lighting-tuner pattern).
7. **Re-budget descriptions before the next skill lands.** At 165 chars of headroom, one new skill forces trims.
   - Trim the four ≥400-char descriptions (input-controls, race-incidents-control, ai-racecraft, agent-view) to
     ≤330 by moving secondary trigger words into routing queries.
   - Keep the key use case first [CC]. Do NOT adopt `when_to_use`: Codex and Cursor ignore it, and the
     `.agents/skills` mirror makes description-only the portable choice.
8. **Use `disable-model-invocation` only where side effects need it, and decide explicitly.**
   - `ship` (push, PR, `land`) is the candidate [CC], but workers call it autonomously, so record a decision rather
     than flip it.
   - Drop the redundant `user-invocable: true` from check/handoff/ship.
   - If manual-only is chosen, mirror it for Codex via `agents/openai.yaml` `policy.allow_implicit_invocation:
     false` [CODEX].
9. **Use `!` injection sparingly, and always guard it.**
   - Candidates: `check` (``!`git status -sb | head -5` ``) and steward (a pr-board summary).
   - Every `!` line needs `|| true` or a pipe ending in a command that cannot fail, because a failure aborts the
     skill [CC]. Note in agent-config that Codex and Cursor show these lines as literal text.
10. **Run `claude plugin validate .claude/skills`** as a docs-guard step (v2.1.233+) [CC]. It catches YAML that
    silently loads "with no fields set". Treat it as a supplement to the existing `SKILL_KEYS` test, not a
    replacement.
