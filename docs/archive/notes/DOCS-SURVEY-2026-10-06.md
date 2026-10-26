# Docs survey — 2026-10-06 (ship tip)

Report-first. No game/runtime edits. Tree at
`a0b371e27` (`claude/f1-game-project-26h3ng`,
`fix(zolder): clear S/F stand clip cluster (12→0 severe) (#1038)`).
Method: pinned reads first (`AGENTS.md`, stall/handoff/steward/contract notes,
survey indexes, `docs/TESTING.md` + ship notes, `cursor-plugins/**` rules/skills).
No repo-wide grep. Named-path/symbol checks only.

**Out of scope this PR:** `cursor-plugins/**` (plugin-sync lane),
`docs/TESTING.md` + `tools/README.md` (open #1075), broad rewrites.
Tiny relative-link fixes: none applied — every cited relative href in the
pinned set resolved on disk / `git ls-files` (see S4).

## Contract check (prompt vs tree)

| Rule (2026-10-06 launch) | Where it lives | Verdict |
|---|---|---|
| Specialty bots never arm auto-merge; Merge Desk owns merge-when-green (MERGE commit only) | `AGENTS.md:165`, `:184`, `:190`; steward card `:60–64` | **In AGENTS** (reworded 2026-10-06). Launch prompts must not paste a body veto that blocks Merge Desk. |
| Ready PRs only (draft until tip-green; ready ≤15 min) | `AGENTS.md:184` | **In AGENTS.** Stale “mark ready only when final” in `TESTING.md` §Merge train and `CONCURRENT-PRS-CI-HYGIENE`. |
| Sync = merge origin/ship; no rebase/force | stall note §3; `AGENTS.md:175`, `:190` | **Split.** Stall: `sync-pr.mjs` **or** `git merge`. AGENTS same paragraph: merge ship **and** “never a hand merge”. Steward skill still “never a hand merge”. |
| Pre-push = `test:tooling-fast` + pick-tests Structural guards | `AGENTS.md:49` (last sentence) | **In AGENTS.** Contradicted by loop step 6 (`AGENTS.md:18`), ladder sentence (`:48`), `check-changes` SKILL, steward §6, steward card. Those still name `deploy.mjs --gate-only` as *the* pre-push. |
| Queue hold = commit locally; `queue-depth.json`; max 6 launches / 10 min | `AGENTS.md:51` (hold / >15 queued) | **Partial.** `apex-status/queue-depth.json` is not in the repo (host artifact). “6 launches / 10 min” is **not** in AGENTS, stall note, or plugins. This box: file missing; Actions `queued=8` `in_progress=7` (not >15 queued). |
| Ship-checkpoint freeze = no sync pushes/merges | — | **Missing.** No `ship-checkpoint` string in AGENTS, notes, TESTING, or plugins. |
| Stall abort + handoff gate | `AGENTS.md:155–156` → stall note | **In tree.** Plugin specialty-handoff omits **owned globs**. Plugin launch skill omits stall abort. |
| Model Auto / `default` | `AGENTS.md:163`; plugin launch `:14`; `apex-lanes.mdc:14` | **Match.** |

Steward-card HASHES vs files on this tip: `steward=43b8d99f`
`check-changes=a5e8d0b5` `pr-template=b3157d7c` — **match**.

---

## Ranked findings

Severity: **S1** agents will ship the wrong merge/push/ready behaviour;
**S2** contract holes / stale “current” rules; **S3** missing index pages;
**S4** markup / incomplete catalogs (no behavioural fork).

### S1 — merge, ready, pre-push (agents will do the wrong thing)

1. **`AGENTS.md:18`** vs **`AGENTS.md:49`**
   - **Issue:** Loop step 6 still says `deploy.mjs --gate-only` is “before a
     push: the only check that runs what the deploy runs”. Rule 3’s last
     sentence requires `npm run test:tooling-fast` plus `pick-tests`
     (Structural guards) before every `git push`. Specialty launch this
     session uses the second. Agents that follow the loop block still run
     the heavier gate (or skip the named pair).
   - **Fix:** One sentence in the loop: local pre-push = tooling-fast +
     pick-tests Structural guards; `--gate-only` remains the *deploy*
     ladder rung, not every topic-branch push. Keep sizes unquoted.
   - **Owner:** Docs (AGENTS) — not this PR (always-on budget; cap 200 lines).

2. **`.claude/skills/check-changes/SKILL.md:34–46`** and
   **`.claude/skills/steward/SKILL.md:115–125`** and
   **`docs/notes/APEX-STEWARD-CARD-2026-10-05.md:15–17`**
   - **Issue:** All three still teach “BEFORE A PUSH, `--fast` IS NOT THE TOP
     RUNG” / “Validate a fix push with the GATE” / “Pre-push → check-changes
     … `--gate-only`”. That is the 2026-09 ladder, not the 2026-10-06 local
     pre-push pair. Steward card HASHES still match those files, so the card
     will keep skipping a re-read after the skill text changes until hashes
     refresh.
   - **Fix:** Align the three to AGENTS rule 3’s *push* sentence; leave
     `--gate-only` for deploy / Pages-shaped changes. Refresh steward-card
     HASHES in the same commit.
   - **Owner:** Docs / steward lane (skills + card). Forbidden here to
     rewrite TESTING.md; skills are allowed in a follow-up PR.

3. **`docs/TESTING.md:1054–1058`** and
   **`docs/notes/CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md:9`**
   - **Issue:** “Agents open DRAFT PRs and mark ready only when the change is
     final.” AGENTS `:184` is “when the draft tip is green, mark ready within
     15 min (CI Watch flips otherwise)”. Agents following TESTING/the 09-30
     note sit in draft after tip-green; CI Watch then races them.
   - **Fix:** One clause in TESTING §Merge train (blocked by #1075) and a
     one-line errata on the 09-30 note pointing at AGENTS §Concurrent PRs.
   - **Owner:** Docs. TESTING.md wait for #1075; errata on the note is a
     tiny follow-up.

4. **`docs/notes/CI-MERGE-BURST-2026-10-03.md:39–40`** vs **`AGENTS.md:165`**
   - **Issue:** Burst note still: “do not arm auto-merge on more than two PRs
     at once per session.” AGENTS: only CI Watch arms **squash** auto-merge
     on **ready** PRs; specialty/cloud never arm. A session that follows the
     burst note will arm MERGE/SQUASH itself.
   - **Fix:** Replace the “max two per session” sentence with a pointer to
     AGENTS MERGE PACING. Keep the ship-fast / poke-train evidence.
   - **Owner:** Docs (CI notes).

5. **`tools/ci/deploy.mjs:718–765`** (documented at
   **`docs/TESTING.md:1821`**)
   - **Issue:** `--pr` still tries to arm **merge-commit** auto-merge and
     confirms it. Policy is CI Watch + **squash** + ready-only. Test
     `deploy-pr-rest.test.mjs` pins the GraphQL auto-merge sequence. Cloud
     agents told “do not enable auto-merge” can still trip it via
     `deploy.mjs --pr`.
   - **Fix:** Stop arming from `--pr` (or no-op unless CI Watch); update the
     unit pin. Not a docs-only change.
   - **Owner:** CI Watch / tools. Do not mix into this docs PR.

### S2 — stall/handoff/sync/queue holes and plugin drift

6. **`cursor-plugins/apex-f1-game/skills/apex-ci-and-pages-watch/SKILL.md:21–29`**
   vs **`AGENTS.md:50`**
   - **Issue:** Plugin skill is an explicit **polling loop** with
     `AwaitShell` 60–180s until the current head SHA is success. AGENTS:
     never a sleep / `gh run view` loop; watch via `ci-watch.mjs` / Monitor.
     Skill also “deciding whether to merge” without “squash + ready only”.
   - **Fix:** Rewrite the watch section onto `ci-watch.mjs --sha` /
     `--once`; state squash auto-merge is CI Watch + ready only. Plugin-sync
     PR; **FORBIDDEN this PR**.
   - **Owner:** plugin-sync.

7. **`cursor-plugins/apex-f1-game/skills/apex-cloud-agent-launch/SKILL.md:10–23`**
   - **Issue:** Model `default` (Auto) is correct. Missing from the template:
     `OWNED:` / `FORBIDDEN:`, `Do not arm auto-merge yourself; Merge Desk owns merge-when-green (MERGE commit only).`, stall
     abort, handoff gate, merge-not-rebase, queue hold, 6 launches / 10 min,
     ready-within-15, tooling-fast + Structural guards, ship-checkpoint
     freeze.
   - **Fix:** Add those bullets to Defaults / Constraints. Plugin-sync PR.
   - **Owner:** plugin-sync.

8. **`cursor-plugins/apex-f1-game/skills/apex-specialty-handoff/SKILL.md:22–26`**
   vs **`docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md:30–41`**
   - **Issue:** Plugin lists four fields (paths, PR/bc, ranked next ≤3,
     blockers). Stall gate requires five: **owned path globs** as well.
     Close-outs without OWNED fail the gate.
   - **Fix:** Add owned / forbidden globs to the plugin list. Plugin-sync.
   - **Owner:** plugin-sync.

9. **`AGENTS.md:175–176`** (one paragraph) vs stall note §3 vs steward §2
   - **Issue:** “Sync by merging origin/ship; never rebase or force-push.
     Then catch it up with `sync-pr.mjs`, never a hand merge.” Agents cannot
     tell whether `git merge origin/claude/f1-game-project-26h3ng` is
     allowed. Stall note: prefer `sync-pr.mjs`, else `git merge`. This
     launch: merge origin/ship. Steward: never a hand merge.
   - **Fix:** One rule: topic branch → `git merge origin/ship` (or
     `sync-pr.mjs` when generated files/ratchets will conflict). Never
     rebase/force. “Hand merge” means “don’t eyeball generated JSON”, not
     “don’t merge ship”.
   - **Owner:** Docs (AGENTS + steward). Stall note already closer.

10. **`AGENTS.md:51`** `apex-status/queue-depth.json`
    - **Issue:** Path is not in the git tree. No note documents who writes
      it, the `hold` schema, or the 6 launches / 10 min cap. Agents that
      cannot reach `/workspace/apex-status/` have only “>15 runs queued”.
    - **Fix:** Document the host artifact (schema + `hold`) in the stall
      note or steward card; add the launch-rate cap next to it. Do not
      commit a fake JSON in-repo.
    - **Owner:** Docs + Insights (host writer).

11. **Ship-checkpoint freeze**
    - **Issue:** Launch requires “if a ship-checkpoint freeze is on, no sync
      pushes.” Zero hits for `ship-checkpoint` in AGENTS, `docs/TESTING.md`,
      `docs/notes/*`, `cursor-plugins/**`.
    - **Fix:** Name the freeze (file or claim-board key) in the stall note
      and one AGENTS clause.
    - **Owner:** Docs / CI Watch.

12. **`cursor-plugins/apex-f1-game/skills/apex-ui-screenshot-runbook/SKILL.md:13`**
    vs **`AGENTS.md:184`** (pin Chromium smoke to `apex-sha` / PR Pages)
    - **Issue:** Runbook defaults to live `https://brycejmurrin.github.io/f1-game/`.
      AGENTS bans binding loops to moving production github.io.
    - **Fix:** Prefer local serve / `apex-sha` / PR preview. Plugin-sync.
    - **Owner:** plugin-sync / UI Survey.

13. **`cursor-plugins/apex-f1-game/rules/apex-lanes.mdc:7–14`**
    - **Issue:** Lane list is a six-bullet stub. Missing: stall abort,
      auto-merge ban, OWNED mutex table (steward card), docs-only exclusion
      from merge-train swarms, 15-min ready. AlwaysApply false + `**/*` glob
      is easy to miss.
    - **Fix:** Point at steward card + stall note instead of duplicating.
      Plugin-sync.
    - **Owner:** plugin-sync.

### S3 — missing / incomplete indexes (survey surfaces)

14. **`docs/look-survey/README.md:47–59`**
    - **Issue:** Sheets table lists 10 circuits. Disk has **25**
      `*_grid.png`. Unindexed (exist, not linked): `albert_park`,
      `buenos_aires`, `catalunya`, `cota`, `estoril`, `hockenheim`, `imola`,
      `indianapolis`, `interlagos`, `istanbul`, `jacarepagua`, `kyalami`,
      `monaco`, `monza`, `suzuka`. Zero broken PNG hrefs.
    - **Fix:** Add the 15 rows (or generate the table from the directory).
    - **Owner:** Docs / lighting-tuner.

15. **`docs/README.md:63–100` notes table**
    - **Issue:** README claims the index exists “so nothing goes
      unfindable”. 44 of 80 `docs/notes/*.md` have no row. Contract/survey
      notes **absent** from the table: `PREPUSH-GATE-LADDER.md`,
      `SHARED-BRANCH-COORDINATION.md`,
      `CONCURRENT-PRS-CI-HYGIENE-2026-09-30.md`,
      `GRAPHICS-DETAIL-SURVEY-2026-10-01.md`,
      `GRAPHICS-DETAIL-SURVEY-2-2026-10-01.md`,
      `SKILL-TESTDRIVE-2026-10-05.md`,
      `SKILL-TOOLING-PROPOSALS-2026-10-05.md`.
      (Stall note and steward card **are** indexed.)
    - **Fix:** Add rows for the seven contract/survey notes. Do not dump
      all 44 (dated ledgers).
    - **Owner:** Docs.

16. **`docs/survey/`**
    - **Issue:** Directory does not exist on ship. Live claims own
      `docs/survey/perf-survey-*.md`. Agents looking for a survey index
      there get nothing.
    - **Fix:** Either create the dir with a README once the first perf
      survey lands, or point claims at `docs/notes/` / `docs/look-survey/`.
    - **Owner:** Perf survey PRs (disjoint). Do not invent the folder here.

### S4 — markup, stale survey leftovers, non-canonical links

17. **`docs/README.md:27–30`**
    - **Issue:** Area-docs table: header, then a data row for
      `ui-experience-studio.md`, then the `|---|---|` separator. CommonMark
      treats that as a broken table; the studio row (and possibly the rest)
      mis-renders.
    - **Fix:** Move the separator to line 28; keep the studio row with the
      others. Tiny, not a relative-link fix (left for a follow-up so this
      PR stays one file).
    - **Owner:** Docs.

18. **`docs/README.md:113`**
    href `../docs/research/WEBGPU-PARITY.md` (label WEBGPU-PARITY.md)
    - **Issue:** From `docs/README.md`, `..` plus `docs/research/…` resolves
      (path normalize / GitHub from `docs/` to repo root to `docs/research/`).
      House form is `research/WEBGPU-PARITY.md`. Not broken; easy to copy
      wrong.
    - **Fix:** `research/WEBGPU-PARITY.md`.
    - **Owner:** Docs. Not applied (not broken).

19. **`docs/notes/AGENT-SURFACE-SURVEY-2026-10-05.md:99–101`, `:140–141`**
    vs **`:189–190`**
    - **Issue:** Opening gap list still says AGENT-SURFACE “twelve CLIs”
      and a broken skills README table. §8 records both **fixed the same
      day**. Readers of §1–7 will “fix” them again.
    - **Fix:** Strike the open-gap bullets; leave §8 as the record.
    - **Owner:** Docs.

20. **`docs/notes/SHARED-BRANCH-COORDINATION.md:66–71`** vs **`:73–86`**
    - **Issue:** “Not a lock, not a claim file, not a queue” then the
      claims-board file queue. Historical, but the first block still reads
      as current policy.
    - **Fix:** One-line errata under the first block: claims-board since
      2026-10-03.
    - **Owner:** Docs.

21. **`cursor-plugins/apex-f1-game/skills/apex-garage-collision-guard/SKILL.md:21`**
    - **Issue:** “Cap Cars cloud agents at 4” vs AGENTS concurrent-PR
      twin/cap rules and steward-card lane mutex. Stale number.
    - **Fix:** Defer to who-is-on-it + lane mutex. Plugin-sync.
    - **Owner:** plugin-sync / Cars.

---

## Matches (do not re-open)

- Stall note exists and is indexed; AGENTS pointer `:155–156` is live.
- Steward-card hashes match the three files.
- Skills README camera rows are one table (surface-survey §8).
- `docs/AGENT-SURFACE.md:79` no longer quotes “twelve CLIs”.
- Model id `default` / Auto in AGENTS + plugin launch + lanes rule.
- Look-survey PNG hrefs that *are* listed all exist.
- `docs/research/WEBGPU-PARITY.md` and `spike/backends/README.md` exist.
- #1075 is the open TESTING.md / `tools/README.md` / CI-speedup PR —
  disjoint from this note.

## Not run / not claimed

- No `js/` / `css/` / workflow edits.
- No plugin files edited.
- No TESTING.md / tools/README.md edits.
- No auto-merge, no merge, no rebase, no force-push.
- Browser groups: not required (docs-only).
