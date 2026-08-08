# Cleanup & hardening campaign — the plan of record (2026-08)

THE live plan the wave work executes against. It consolidates the campaign's
workflow findings into one place and says which dated record owns which piece.
It supersedes the session-local plan file; when the campaign completes it
archives to `docs/archive/` alongside the records it indexes.

Method note: every wave's inputs came from `Workflow`-orchestrated agent fleets
(scripts committed in `.claude/workflows/`), with every finding adversarially
verified before being believed, and every workflow's output saved verbatim as a
dated record in this directory (`raw/` holds the uncompressed evidence).

## Wave status

| Wave | What | Status |
|---|---|---|
| W0 | Fix the red spec the cleanup itself created (`tests/specs/agent-view.spec.js`) | **LANDED** `788ac8d3`, verified 117/117 |
| W1 | The audit synthesis's FIX-NOW list (8 items) | **LANDED** `33114382` + `af05fa98` — incl. the discovered camera inside-of-corner bug; camera group 45/45 |
| W1.5 | Test-audit mechanical strengthen batch (guard blind spots + ten weak specs) | **LANDED** `46b999e8`, `89f6889d`, `6112fb74`, `f9bbf479` — caught the stale Mexico terrain pin (a spec that never runs is prose) |
| W2a | Test-semantics audit workflow (all 162 test files) | **DONE** — record: [TEST-AUDIT-2026-08.md](TEST-AUDIT-2026-08.md) |
| W2b | Total-audit workflow (all code + all docs) | **DONE** — 197 verified findings: [TOTAL-AUDIT-2026-08.md](../archive/research/TOTAL-AUDIT-2026-08.md). Survived a mid-run token-limit crash via cached resume with slimmed (haiku, batched) verification |
| W2-fix | The total-audit's Batch A/B/C fix train (headline: the LIVE curvature-sign trio in the track engine — kerbs/barriers/corner boards on the wrong side — plus the session-verified jump()/IncidentSim authority bug, career slot overwrite, racecontrol dead caps, DRIZZLE tier, matTexMix truth cluster) | **LANDED** `89ce4f2f` (A+B+C together, bump v1025) + `d23b70b8` (tail, bump v1026). The tail also REPAIRED a regression the first commit shipped — an intermediate paul_ricard.js whose widened modelGroup bounds made preflight reject the cabanon AND its wall (299,716 vs 299,946 verts) — and REVERTED an art change it had smuggled in (city-building `setback` massing; see the design ticket below). Geometry sweeps green across all 40 circuits; browser groups running |
| W2-perf | Shared-page test fixture (`sharedTest`) — kill the per-test page boot | **LANDED** `e52bb772`, `9b91f807`, `3fa9d047`, `75ae72f9`, `85a91f40`. Settled at **6 specs / 284 tests** on the shared page after 8/405 was tried and two specs reverted. Headline: `agent-view` **117/117 in 11m16s against ~43 min** before. Also green: `new-hooks` 56/56, `headless-api` 24/24, `logging` 6/6. `career` (101) and `quali` (20) reverted — both drive MENU SCREENS, which is the axis that decides reuse; `dev-tools` + `camera-driving-hooks` verifying. Full rationale, the three conversion edges and the load-inversion diagnostic are in [docs/TESTING.md](../TESTING.md) |
| W2-verify | Run the browser groups against the live track-engine changes, ordered by ignorance | **IN FLIGHT** — `89ce4f2f`'s kerb/barrier side-flip is verified from BOTH directions: bisect-cleared locally (all three elevation failures reproduce byte-identically at `fdd4082f`) and CI's per-circuit geometry sweep green throughout. **CI #204 is fully green — guards, sweeps AND smoke.** Verified: `agent-view` 117/117, `steering` 96/96, `api` 193/193, `smoke`+`net` 79/79, shared-fixture set 101/101, `camera` 45/45, `elevation-tracks` 47/47 (after 3 repairs), `smoke` 9/9, plus `audio`/`debris`/`ab`/`paths`/`map`/`baseline`/`shimmer` inside the 56-test tail batch, plus node-only `net-unit` 99/99, `agent-contract`, `service-worker`, `webgpu-lifecycle`. **Execution integrity checked, not assumed: every green group's count equals its declared total, with zero skips, zero retries and zero flakes.** `tlx` **14/15** after `767d3ec7`; `gallery` **78/78**. **`circuit` 64/64, ONE failure — and the SHIP GATE IS SATISFIED.** Both questions registered before that run came back clean: `tracks-walls`'s `monza bounded: 770.4 vs < 60` (a real assertion failure from 02:09, PREDATING the 03:01 side-flip) **did not reproduce**, and the street-wall sweep passed at 134.5 s once it had budget. With `audit`, `autopilot` (monza 42.7 s, suzuka 46.5 s) and `elevation` 47/47 also green, **wall containment across the 40-circuit kerb/barrier side-flip is verified** — the last hole from Batch A/B/C. The single failure was the 40-circuit boundary sweep timing out at 372.8 s, since replaced by the per-circuit split (`93234ab1`). **BOTH remaining failures are now CLOSED and both were test defects:** `menu-keyboard` ×1 (`7bafa71b`, a race on `vt()`'s async reveal) and `tlx-probes` M6 skid (`5c735736`, waiting on a value that could not move — `skids.stamp()` lives in `render()` and the stint never renders). **COMPLETE 2026-08-07 20:47. 490 tests across eight groups, 18 failures.** `tlx` 15/15 clean (first time ever) · `parts` 167/167, **12 red** · `modes` 140/140, 1 red · `scenery` 13/13, **2 red** · `webgl` 28/28, 1 red · `collision` 46/46, **2 red** · `barriers` 62/62 **clean** · `physics` 19/19 **clean**. Of the 18: **six were contention and ALL SIX pass solo unchanged**; **eight were test defects, fixed and verified** (`39c65beb`, `9bd62d57`, verified `5cff488d`); **four are open findings**. **`barriers` and `physics` are the two groups that had never run since Batch A/B/C and the reason W2 was blocked — both fully clean**, so the kerb/barrier side-flip broke neither wall containment nor the driving model. W2's stated condition is met: no red test remains whose history is unknown |
| W2-step0 | Make the tests/ split's SILENT failures loud — before the split | **LANDED** `d6f09674`. R2's lockstep marks five items "no guard turns red"; a guard that arrives after the commit it protects has protected nothing. `tools/cross-file-paths.mjs` + guard: every relative reference in `tests/`+`tools/` (static import, dynamic `import()`, `require()`, `new URL(rel, import.meta.url)`) must resolve — **137 refs across 239 files, green**. espree, not grep: two test files build fixtures out of source text containing import statements, and a guard with false positives gets switched off. **`output-paths.spec.js` could not have detected the move breaking it** — it asserted against `resolve(import.meta.dirname, "..")`, the identical expression the module under test uses, so both sides move together and agree; post-split both resolve to `tests/`, galleries land in the test tree, and `existsSync(dir)` passes too because `galleryDir()` CREATES what it returns. Both modules now walk up for `package.json`. Two vacuous-pass regexes widened to admit subdirectories, each with a tripwire. **Live finding:** `test-groups`' pinned-`--project` check has ZERO inputs — only `test:render`/`test:headless` carry `--project` and neither names a spec, so its loop body has never run. It is a regression guard for a bug fixed by removing the pin that fed it. It HAS an assertion, so `assert-audit` cannot see it — a fourth category beyond asserting/implicit/vacuous: **structurally unreachable**. It now asserts WHY its input set is empty |
| W2-assert | "A test that asserts nothing is prose too" — the third sibling of the never-run finding | **LANDED** `3eadb40d` + `a50c18ae`. Gallery split **VERIFIED 78/78, zero skips, zero retries** — 34 portrait + 34 landscape + the 10 merged large-screen tests, all green, including the ten that were committed unrun. `tools/assert-audit.mjs` grades every declared test **asserting / implicit / vacuous** and flags empty `.catch(() => {})`. Tree: **1152 tests, 0 vacuous, 40 implicit-only**. The gallery specs were the whole of the implicit set: `ui-audit` (34) and `ui-desktop` (5) are PNG harnesses whose ticks were being read as `test:ui` coverage. `ui-desktop` is merged into `ui-audit` as two viewport rows and deleted; `ui-audit` moves to an on-demand `test:gallery` group (test-audit §1a/§1d, executed early because W2-verify surfaced it). `tests/unit/assert-audit.test.mjs` is the ratchet. **The tool's own first version was 20% false** — a body-only scan called hud-audit's eight steer-mode tests vacuous because they assert only through `assertHud()`; helper-following to a fixpoint is the tool, and two guard cases pin it |
| W2 | RESTRUCTURE + change-aware CI | **COMPLETE 2026-08-08.** R2 tests/ split (178 moves, 218 rewrites; guards 77 red -> green, all 59 unit suites 461/461, every browser group verified), R1 audio-panel (game.js 7972 -> 7783, ratchet lowered), R3 tools/ subdirs in reduced form (net/ car/ capture/ lighting/ — the earlier CUT was reversed once R2 proved the lockstep discipline holds), and CI selection as its own wave. The split's own escapes are the record worth keeping: `physics-characterization` would have `test.skip`ped forever against a relocated baseline, ci.yml's sweeps filter would have fail-OPEN on pre-split paths, and `playwright.config.js`'s `./tests/global-setup.js` escaped BOTH rewriters (a `./` prefix defeats the token regex) and killed every browser job — caught only by RUNNING the browser half. A lockstep proven by node guards alone is proven for the node half only |
| W2-ci | Change-aware CI selection — its own wave, and it earned the separation | **COMPLETE 2026-08-08.** `tools/select-specs.mjs` + the advisory `selected` job: per-spec, budget-fitted, `continue-on-error`, and it NAMES everything it drops. Four defects found by running it rather than by reading it: (1) specs declaring their own `test.setTimeout` of 180-420 s OVERRIDE the job's `--timeout`, so a "14-minute" selection signed up for 3-7 min/test and failed — excluded by name now; (2) the job cap was 20 min against a 24-min true worst case (10 tests x 120 s + setup), which would have reported `cancelled`, the verdict this workflow's own header records as having once hidden a dead deploy — derived to 26; (3) `tests/helpers/fixtures.js` is imported by 59 specs but pick-tests routes `^tests/` to `audit`, so editing the file EVERY spec depends on selected ZERO specs — TRACKED infra paths now say "not meaningful" instead of nothing; (4) **`js/track/tracks.js` holds buildProps but did not route to `scenery`**, so the two specs that reported BOTH of this session's scenery defects were silently absent from any selection for the file that produces them. Research-grounded: Facebook's Predictive Test Selection (faulty-CHANGE recall is the metric, >99.9% vs >95% of individual failures), Fowler's TIA survey (always run new + previously-failing; data-driven blind spots), Datadog TIA (tracked files), Playwright's `--only-changed` (import graph — adopted for helper->spec, useless for js/ here since specs load the game over HTTP). `tools/select-recall.mjs` replays the selector over this repo's real regression history and fails only on a SILENT miss |
| W3 | Bedrock Ph0-1: dependency scanner + global registry, `.d.ts` contracts, `tsc --checkJs` CI, `@ts-check` tranche + ratchet | Planned — [ARCHITECTURE-REDESIGN-2026-08.md](ARCHITECTURE-REDESIGN-2026-08.md) is the adopted direction |
| W4 | Loop-until-dry lens-diverse review of the post-restructure tree, CAP 3 ROUNDS | Planned (shrinks if W2b leaves little) |
| W5 | Bedrock Ph2-4: gen-manifest, renderer port, seal & carve `G` | Planned |

Ship cadence: the deploy branch (`claude/f1-game-project-26h3ng`) advances by
fast-forward after each green wave, never mid-wave. `main` is a stale diverged
fork — never touched.

## THE PLAN FROM HERE (2026-08-07 18:00)

Ordered by dependency. Everything in step 1 needs the box, and only one
Playwright process may hold it.

**1. Finish the burndown** — the prerequisite everything else waits on.
   1. The serial queue: `tlx` ✅ 15/15, `parts` ✅ 167/167 (12 red, all diagnosed),
      `modes` in flight, then `scenery`, `webgl`, `collision`.
   2. **Solo re-run of `parts`' four timeouts.** The prediction is recorded
      BEFORE the run so it can be wrong: at the measured ~1.9× contention factor
      all four pass unchanged. If one still fails alone it is a real defect and
      gets an instrument, never a budget bump.
   3. **Consolidate the staged fixes** — `19971739` lives in a worktree and has
      NOT been executed. Cherry-pick, verify `test:parts` alone, confirm the
      mesh-signature count reaches **0 and not merely lower** (node reproduced
      17 duplicates where the browser reported 19, and that gap is unexplained),
      then amend the "UNVERIFIED" line out of the message before pushing.
   4. `barriers` and `physics` — the last groups never run post-Batch-A/B/C.

**2. W2 restructure** — COMPLETE (see the wave table). Kept below as the record of what the lockstep cost.
   5. R2 tests/ split — **LANDED `72e9df33` + `ffff348d` + the config fix,
      2026-08-07.** `--apply` moved 178 files and rewrote 218; the guard suite
      went red as designed (77 failures) and was driven to **331/331 green**,
      then all 59 unit suites **461/461**. What the landing tail actually held,
      recorded because each item is a class the next move will hit again:
      - THREE distinct ROOT-anchor forms in unit suites (the `resolve()` climb,
        `join(dirname(),"..")`, `new URL("..")`) plus inline
        `createRequire("../tools/…")` calls — a single sed catches one form and
        reports done; the guard suite named the other 41 files.
      - Every flat-`tests/` scanner in tools/ (coverage-audit, ci-coverage,
        select-budget, assert-audit, evaluate-scope-lint, fixture-consumer-audit,
        test-observed). test-observed also maps PRE-split log history onto the
        new paths, or every test would have read never-run.
      - **Two silent-failure catches the guards get credit for:**
        `physics-characterization.spec.js` resolved its baseline beside itself —
        post-split it would have `test.skip`ped forever, green; and ci.yml's
        sweeps path-filter named pre-split sweep-suite paths, so the sweeps
        would have skipped exactly when a sweep suite changed.
      - **One escape both rewriters missed, caught only by RUNNING the browser
        half:** `playwright.config.js`'s `./tests/global-setup.js` +
        `./tests/live-reporter.js` — the mover's token regex has a lookbehind a
        `./` prefix defeats, and the comment sweep skipped root configs. Every
        browser group died at config load. The lesson is already in this doc's
        §"a test that never runs is prose": a lockstep proven by node guards
        alone is proven for the node half only.
      - tests-split's own guards were rewritten for their post-apply life: the
        live invariant is now "the planner finds NOTHING left to move" (a stray
        file at tests/ root goes red), derivation + history-protection pinned
        on scratch trees.
      Browser groups running serially now (smoke → scenery → collision →
      steering → physics → circuit). Cache bumped 1031 (comment-only js/ edits
      from the 878-reference sweep).
   6. R1 audio-panel — a `js/` edit, so it wants a tree with nothing running.
   7. Ship by fast-forward once green.

**3. Records cleanup — archive the spent campaign records.** Sequenced here, not
   left to "when the campaign completes", because half its lockstep is
   unguarded (see §Record lifecycle → *the archive move itself*).
   8. **Widen the relative-link check from `docs/README.md` to EVERY live doc,
      and watch it pass on the current tree FIRST.** Today only README's links
      are validated, so archiving a record silently breaks the ten cross-record
      links between AUDIT-SYNTHESIS / TEST-AUDIT / TOTAL-AUDIT / CAMPAIGN. This
      is `d6f09674`'s move applied a second time: de-silence before you move.
   9. Archive the spent records **together**, per the lifecycle table, plus
      their `raw/*.json` evidence. Rewrite inbound links in the records that
      STAY (`ARCHITECTURE-REDESIGN-2026-08`). This doc goes LAST — it is the
      index that points at the rest.
   Note: `docs/` root has **no** archive candidates. All 22 files are cited from
   a live place and all were touched within three days; the tree was rewritten
   during this campaign. Do not go looking for dead weight there.

**4. Separated out, with reasons.**
  10. CI change-aware selection — its own wave (see the W2 row).
  11. A never-observed REPORTER in CI — reports, never gates. The durable
      output of the `parts` finding.
  12. W3–W5 Bedrock — the largest remaining commitment, and the one worth
      re-deciding with today's evidence in hand rather than on the strength of
      a plan written before it.

**R3 tools/ subdirs is cut.** Recorded here so it stops being re-proposed.

## W2 — what executes, in order, once W2b's findings are reconciled in

Sources of authority: [AUDIT-SYNTHESIS-2026-08.md](../archive/research/AUDIT-SYNTHESIS-2026-08.md)
§RESTRUCTURE (the R1/R2/R3 lockstep lists) and
[TEST-AUDIT-2026-08.md](TEST-AUDIT-2026-08.md) (taxonomy, split map,
CI design + its 14 feasibility gaps). This doc does not duplicate their
step lists — it fixes the ORDER and the gates:

**Re-measured against the tree 2026-08-07** (the records were written before the
fix train and this session's guards):

| Record's claim | Actual | Consequence |
|---|---|---|
| R1 citations — game.js 7972 lines, ceiling 7975 | **exact match** | R1 is landable as written; locate by content, not number |
| R2 relocates 109 specs | 110 − the `hud-audit` merge = **109** | still right, by a different route (`ui-desktop` already merged) |
| `tests/unit/` = 48 files | **55** | this session added six guards; the plan must not hardcode counts |
| 66 specs import `./fixtures.js` | **58** | mechanical |
| all five ⚠ silent-failure citations | **all still resolve exactly** | lockstep is line-accurate; `ci.yml`'s sweeps filter is now `:211` |

**0. Step 0 — de-silence the ⚠ set. LANDED `d6f09674`, see the wave table.**
This was not in the original ordering and belongs at the front: R2's five ⚠
items are the ones no guard catches, and `output-paths.spec.js` turned out to be
structurally incapable of catching its own breakage rather than merely likely to
miss it.

1. **Taxonomy first** (test-audit §1): merges → foundation renames + new
   `foundation`/`gallery` groups → double-billing dedupe. **The foundation
   renames are DONE** (`6a495374`): 16 specs left `physics-` for
   `<circuit>-foundation.spec.js` and a new `test:foundation` group, so the glob
   left behind now matches exactly the two genuine physics files. The routing
   landed in the SAME commit — gap 11's requirement — and is verified:
   `js/circuits/monza.js` selects circuit+foundation+scenery,
   `js/track/mesh.js` selects circuit+foundation+physics+sweeps. The group has
   not yet been RUN. **The `gallery` group
   and the `ui-desktop`→`ui-audit` merge are DONE** (`a50c18ae`, pulled forward
   by W2-assert); `hud-audit`→`hud-layout` is NOT — it swaps a helper's `#hud`
   visibility check for real geometry assertions, so it is a behaviour change to
   eight tests rather than a file move, and wants its own verified commit. The
   foundation renames and the dedupe are untouched. The dedupe MUST add
   pick-tests RULES coverage for collision/drift/offtrack (test-audit gap 11 —
   dropping them from `test:behaviour` without new routing opens holes).
2. **tests/ split** (synthesis R2 + test-audit §2 extensions 14-18): one
   `git mv` commit, no background runs in flight, snapshot dirs and
   `physics-baseline.json` move with their specs.
3. **R1 audio-panel extraction** (synthesis R1, 10-step lockstep).
4. **R3 tools/ subdirs — RECOMMEND CUTTING, on the measurement.** The synthesis
   already downgraded it to "CONDITIONAL GO, last". Enumerating the four kept
   families against the tree settles it: `net/` is two files
   (`nostr-local.cjs`, `nostr-probe.mjs`), `lighting/` is essentially one
   (`ab-lighting.mjs`), and `carshot.mjs`/`render-car.mjs` are genuinely
   ambiguous between `car/` and `capture/` — either home is arguable, which is
   the signature of a split that is not carving at a joint. Item 5 keeps
   everything frequently used flat anyway. So: ~9 of 65 files moved into four
   directories, four commits of lockstep risk (including the
   `docs-integrity:395-402` deepening, without which every moved tool leaves the
   index guard permanently), for navigability that does not measurably improve.
   Cut it, or re-scope it to a single `tools/net/` move if the itch persists.
5. **Change-aware CI — RECOMMEND MOVING OUT OF W2 into its own wave.** Not a
   new judgement: the record's own closing recommendation is to land the tooling
   (done — `pick-tests --json`, `DEPLOY_BRANCH`, `cache-bump-only`, all green),
   then *re-derive the budget* and treat the workflow file as a separate
   deliberate decision. Gaps 7/8/13 are not polish — real groups are 71-193
   tests against a 12-test cap, and `retries: 1` with `--timeout=240000` makes
   one timing-out test cost 8 minutes rather than 115 s, so the cap fits only
   the all-pass case and the step dies exactly when the selection finds a
   regression. Bundling an unlandable YAML design into the restructure is how a
   wave stalls behind its weakest item. The drafted
   `selected` job is not landable (test-audit gaps 1-2 are blocking: the
   `workflow_call` guard never fires and a failing advisory job would gate the
   deploy). The redesign must fix: the discriminator (branch-ref check or a
   `workflow_call` input), merge-base against the deploy branch as diff base
   (gap 5), per-spec granularity so the budget admits real work (gap 7),
   retry-inflation-aware caps (gap 8), machine-readable pick-tests output
   (gap 6), and the `?v` bump exemption problem (gap 10).

## The finding that outgrew its wave: HALF THE SUITE HAD NEVER RUN HERE

"A test that never runs is prose" started as a one-line lesson from the stale
Mexico terrain pin. It is now the campaign's largest measured defect class.
`tools/test-observed.mjs` (added `2b2ac224`, corrected `9781e26d`) answers it
mechanically — every title declared in `tests/*.spec.js`, from the AST, against
every title any log in `artifacts/logs/` has reported a result for.

**Measured 2026-08-07: 578 of 1152 Playwright tests have a recorded local
result. 574 do not.** Ten groups had never run at all; `steering` (88) and
`net` (70) are the largest. (The first figure quoted here was 564 of 1135 — the
denominator was wrong because the detector silently dropped every
loop-generated `test(\`${id}: …\`)` declaration, 17 of them across 16 specs.
Corrected in `9781e26d`; the observed count also rose as groups were run.)
`artifacts/` is gitignored and local, so this is "what this box has never run",
not "what has never run anywhere" — a worklist ordered by ignorance.

**Five broken tests found by running them, none findable by reading:**

| Test | What it did | Landed |
|---|---|---|
| Mexico terrain pin | asserted a value the tree had moved past | W1.5 |
| `menu-keyboard` `:modal` | pinned a `<dialog>` conversion whose markup a merge had silently dropped | `0667da63` |
| `audit.spec.js` reverse-crossing lap | shipped with the fixed frame budget its own commit message calls wrong | `afd546ed` |
| `elevation-tracks` `flatMax` | measured the length of the start straight, not a top speed | `58614db2` — the road-edge bound works (monaco/monza/spa now pass); the dwell threshold beside it does not, see strengthen 25 |
| `elevation-tracks` climb | assertion contradicted its own comment | `2b2ab54c` |
| **(mine)** all 47 elevation tracks | `58614db2` read Node-side constants inside `page.evaluate` and was committed WITHOUT BEING RUN — one commit after this section was written. Four green tracks went red and it presented as a physics regression | `0f458925`, guarded by `466ba98a` |
| **(mine)** Mexico grade | `f9bbf479` repaired the Mexico terrain pin above by lifting a number out of a PROSE COMMENT and pinning it. See below — the repair inherited the defect | staged `747dfe61` |

### The fourth sibling: prose pinned as though it were a measurement

The Mexico terrain pin appears TWICE in that table, and the second entry is the
repair of the first. `f9bbf479` replaced the stale `elevationRange <= 1.0` with
two bounds taken from `mexico.js`'s own comment — *"~7 m end to end, under 2 %
anywhere"* — and landed without a run. The range half happened to be right
(6.642 m). **The slope half had never been computed by anybody.**

Measured off the built spline, 240 samples: **2.83 %**, on the flank of the
`s = 0.245` rise (3.0 m over halfM 380), with 6 samples over 2 %. Bisected to
rule out this session: `0.0283` identically at HEAD, at `fdd4082f` and at
`89ce4f2f~1`. The elevations are data and nothing touched them. The geometry is
correct and 2.83 % is gentle by any standard — Eau Rouge is around 18 %. Only
the sentence was wrong, and the test had been pinning the sentence.

**The lesson is narrower than "tests drift" and worth stating on its own: a
comment is not evidence, and repairing a bad pin by quoting one just relocates
the defect.** Both ends are fixed — the bound is now the measured figure plus
headroom, and `mexico.js` states its measured numbers and says to re-measure
rather than reword if the three rows change.

Its three siblings, for the record: a test that never runs is prose; a guard
that only runs on one machine is prose everywhere else; a check that lives
inside another job reports under that job's name. This one is the inverse of
the first — the test DID run, and faithfully asserted something nobody had
checked.

The `flatMax` one is the most instructive: it had been feeding a poisoned
reference into the descent-overspeed check for its entire life, and three
circuits failed it for a reason that had nothing to do with elevation. It was
found by PROBING (six circuits, speed trace plus lateral offset) after two
plausible-sounding explanations — "COTA's turn-1 climb", then "maybe the car
doesn't accelerate at all" — both turned out to be wrong. Neither guess would
have survived a measurement, and neither should have been trusted without one.

### The sibling lesson: a guard that only runs on ONE MACHINE is prose everywhere else

Three guards added on 2026-08-07 passed locally and could not run in CI at all,
turning the guards job red for environment facts rather than defects:

| guard | why CI could not run it |
|---|---|
| `pick-tests` "--since takes a REF" | `git diff HEAD~1` — the guards job checks out at DEPTH 1 |
| `evaluate-scope-lint` "the REAL bug" | `git show <old-sha>` — same shallow checkout |
| `test-observed` "titles match log lines" | `artifacts/` is GITIGNORED; in CI there are no logs, so every title is legitimately unobserved |

Two machine assumptions — git history, and a gitignored directory. Fixed in
`9cd75f1e` + `0d4cf538` by pinning the same properties against things that exist
everywhere (`HEAD` rather than `HEAD~1`; an inline copy of the broken shape;
the logs-dependent half skipped where there are no logs, the rest asserted
unconditionally).

**The practice that follows**: an environment-sensitive guard is verified in a
SIMULATED CI checkout before landing — `git clone --depth 1 file://$(pwd)`, no
`artifacts/`, run the suite there. That simulation was run for the fix (21/21)
and is what should have been run for the original.

Worth stating plainly, since the campaign records its own errors: this happened
while building tooling to find tests that never run. The blind spot was not
knowing the rule, it was assuming my box was the environment.

**NOT every never-run group is rotten, and the record should say so.** The two
largest came back completely clean on first execution — `steering` 96/96 and
`net-unit` 99/99 — while the broken tests clustered in `elevation-tracks` and
`audit`. "Never run" means UNKNOWN, not "rotten"; the value of the tooling is
telling those apart, and a register that only recorded the failures would
misstate the risk of the ones still unrun.

**Consequence for the campaign**: the tests/ split (W2 R2) must not move files
while half of them have never been executed — a red test that has never run
looks identical to a test broken by the move. Burning down the never-observed
list by group is now a prerequisite of W2, not a follow-up to it.

### The `parts` group, which puts a number on all of it

Run for the first time 2026-08-07: **167/167 executed, 12 FAILED, 46 minutes.**
Measured against every other log in `artifacts/logs/`: of the 137 titles it
reported, **12 had ever been seen before and 125 had not — 91 % never-executed.**

All twelve resolved to test defects. **Zero product bugs.** But the useful split
is not defect-vs-not, it is *could this ever have passed*:

| | count | |
|---|---|---|
| **Structurally impossible** — no version of the product could satisfy them | **6** | a 32-triangle ceiling against a sheet that has been 36 at every revision; a wheel-rim comparison that never passed the rim argument; five wheel-side knobs asserted against a `noWheels: true` build; a 4-key helper compared to a 3-key `toEqual` (×2 routes); a deferred global read without loading it; a surname uppercased before a case-sensitive match |
| **Incoherent with their own setup** | 2 | a world-Y compared to a road-relative constant; the same, differently |
| **Bare timeouts** | 4 | box contention, see the ~1.9× factor in docs/TESTING.md |

**Only ONE of the six was mechanically detectable.** An AST scan for the dropped
argument does find it — `-1 buildWheel(7/8) parts-physics.spec.js:896` — but
among ~22 other `-1` entries that are all deliberate trailing-optional
omissions. Signal-to-noise ~1:22 at exactly the level where the real bug lived,
so it was **not shipped**: a guard that cries wolf gets switched off, which
`tools/fixture-consumer-audit.mjs` already records happening. Repo-wide scans
for the other detectable classes came back clean (one deferred-global reference
in 110 specs — the one already fixed; five case-transform sites, four correct).

So the conclusion is not "build better lints". It is that **running a test is
the only detector for this class**, and the repo has no standing mechanism that
notices a group has not run in months. `tools/test-observed.mjs` answers the
question; nothing asks it.

### What the whole burndown returned, and the half that says DON'T panic

490 tests, 18 failures — and the distribution is the finding, not the total:

| | count | |
|---|---|---|
| contention, not defects | 6 | all six pass solo, unchanged. One (`lighting-tuner-grade`) has no headroom even alone and needs a measured budget |
| test defects, fixed & verified | 8 | six of them structurally impossible under any code |
| open findings | 2 | #37 nurburgring road · #40 the PACE literal gap. Two more resolved the same evening — see below |

### The side-flip is fully exonerated — settled by running the tests at the old revision

The evening's two remaining suspicions about `89ce4f2f` (the curvature-sign fix
that moved kerbs, barriers and corner boards across all 40 circuits) were both
put to the decisive test: the failing specs themselves, run in a worktree at
`fdd4082f` — the commit immediately before the flip.

**The wall-drift bound (was #39):** `maxAbsX` reads **23.49 before** the flip
and **21.31 after**. The `< 20` bound has never been satisfiable — an invented
round number in a never-run test — and the flip IMPROVED the excursion by
2.2 m. The fix is a derived bound (a multiple of the ~7.5 m half-width), never
a raise to 24.

**The racing-line props (was #38):** the vegas and buenos_aires offenders at
`fdd4082f` are **byte-identical** to HEAD — same fractions, laterals, colours,
centres. Both pre-date the flip. The circumstantial case had been strong (a
212-vertex cluster measurably mirrored left→right at exactly vegas's flagged
arc position), and it was still the wrong prop: the offending triangle's bin
was unchanged at both revisions. The recorded caveat — *"that is inference, not
measurement"* — turned out to be the operative sentence, and the lesson is
worth its own line: **a strong circumstantial pattern at the right location is
not identification.** Only running the actual test at the old revision was.

**The campaign's product-regression count therefore stands at ZERO**, now
verified from every direction the evidence pointed: wall containment clean,
driving model clean, the one containment figure that moved improved, and the
racing-line props unchanged. What remains from the sweeps is two LONG-STANDING
scenery defects — vegas's yellow prop 1.10 m over the line (a car would meet
it) and buenos_aires' foliage at 3.52 m (a car clears it; fix vs a justified
exemption is a per-circuit call) — plus #37's nurburgring road offender, still
under investigation as a browser-vs-node banking divergence. All three are on
the live site today and have been for the defects' whole lives; they are
ordinary scenery-fix work, not ship blockers.

**CLOSED 2026-08-08 — both scenery defects fixed at the mechanism, and
`props-over-road` PASSES for the first time in the record.** Root-caused
offline through `tools/track-build-vm.cjs` (the sweeps' own harness — the
per-primitive emitter stacks named both call sites in one run each):

- **vegas was not a prop at all — it was the street-barrier itself.** The
  panels are straight boxes spanning two nodes, and on the inside of a bend
  the chord SAGS INWARD from its own barrier line (0.43 m measured at frac
  0.678 against `barrierGap: 1.0`); the audit walks the full road mesh to 75 %
  of its width, and the 1.1 m panel hung over the verge it samples. Fix in
  `js/track/tracks.js`: an apex span whose chord gives up more than 0.1 m of
  the gap at the skipped middle node is emitted as two single-node panels
  that follow the curve. Cost lands only on apex spans. One coplanar spot was
  the price (vegas 66 → 67, the same top-face seam class every existing panel
  joint already contributes — re-baselined with the reason in
  `tests/unit/coplanar-faces.test.mjs`).
- **buenos_aires was a CROSS-SEGMENT overhang.** The circuit plants its park
  woodland 30 m off the road — but the circuit loops back on itself, and a
  tree planted off one straight landed with its canopy 8.8 m from the
  centreline of the parallel stretch across the loop. `clearTreeDist` checked
  recorded barriers only; candidate positions now also have to clear the ROAD
  anywhere on the lap (`onTrack()`, the world-space segment test) — push out
  or drop, exactly as a fence conflict.

Verified: offending geometry gone from both VM builds, all 40 circuits build
headlessly, `props-over-road` green in the browser (1/1, solo), remaining
sweeps green unchanged. Shipped on the work branch with cache 1033.

**Four groups had never run and four came back with something. They are not the
same four.** `parts` (91 % never-executed) returned twelve. `modes`, `barriers`
and `physics` — equally unrun — returned one contended timeout between them and
no assertion failures at all. That is the record's own line measured to
exhaustion: *"never run" means UNKNOWN, not "rotten"*. A register that had only
logged the alarming half would have misstated the risk of every group still
unrun, which is exactly the mistake this campaign is trying not to make.

**And the flip is exonerated where it was suspected.** `89ce4f2f` moved kerbs,
tyre barriers and corner boards across all 40 circuits, and the two groups that
could catch containment damage — `barriers` 62/62 and `physics` 19/19 — are
clean. Bisecting `collisions-deep`'s wall-drift bound settles it in the useful
direction: `maxAbsX` is **23.49 before** the flip and **21.31 after**, so the
commit IMPROVED the only containment figure that moved, by 2.2 m. The bound
itself (a bare `< 20`) has never been satisfiable and is a separate defect —
and not a PACE one, since a lateral distance is not a speed and `vstd-lint`
would never cover it even widened.

**Proposed, not yet built:** a CI step that REPORTS the never-observed count
rather than gating on it. Gating is wrong — `artifacts/` is gitignored, so in CI
every title is legitimately unobserved, which is the exact trap that turned the
guards job red once already (see the sibling lesson above). A number in the job
summary, trending, is enough to make a silent group visible.

### The third sibling: a gate that runs INSIDE another job inherits its fate

`tests/specs/physics-characterization.spec.js` pins six-sample traces of four driving
scenarios and fails when the model's numbers move. It was in no CI job at all —
not `guards` (browser spec, not node), not `sweeps` (geometry only), not
`smoke`'s spec list — so **175 commits of deliberate physics work drifted past
it** (geometric RACE PACE, the PACE regrid, the SPEED STEER taper, the wheelbase
recentre) and its baseline was ~9 % stale before anyone looked. It had also
never passed locally. Added in `7bafa71b`, it ran in CI for the first time in
#253: 42 s, green.

**It was added as a STEP INSIDE `smoke`, and that was wrong in both directions a
step can be wrong** — corrected to its own job in `8939d135`:

- It ran only AFTER smoke's twelve minutes, so a red smoke meant the gate never
  executed. That is a fresh instance of the exact class this section is about,
  introduced by the commit that fixed another instance of it.
- **GitHub's checks list reports JOBS, not steps.** `7bafa71b`'s message
  justified the separate step as "a failure reads as *the driving model
  changed* rather than *smoke went red*" — false at the level anyone reads,
  since a failure surfaced under the name `Smoke (page boots, __apex responds)`.

The cost that motivated the shortcut was smaller than it looked: smoke is the
only job installing the browser binaries, but the gate's critical path is
`sweeps` (~15 min) and `smoke` (13m21s measured on #253), so a parallel job
costing ~40 s of setup plus 42 s of test adds **zero wall-clock**. One runner is
the whole price of an independent verdict.

**The generalisable rule**: "is it running?" is not the same question as "can it
report?" A check reaches a human through the name of the JOB it lives in, and a
check downstream of a slow gate is silently conditional on that gate passing.

## OPERATIONAL: the deploy is WEDGED, and the error says how

`pages.yml`'s run #1267 for `a187ecb0` sat in `queued` from 2026-08-06 18:17 —
over 14 hours — and the last deploy that actually reached the site was
`a162b00a` on 2026-08-05 22:52.

**My reading of it was wrong, and the API corrected me.** I described it as
"queued, never started" and offered environment-protection approval or runner
capacity as the likely causes. Cancelling it returns:

```
409 Cannot cancel a workflow re-run that has not yet queued
```

So it was never waiting for a runner and there is no approval gate. It is a
RE-RUN REQUEST THAT NEVER ENTERED THE QUEUE — consistent with the session plan's
note that run 31125635974 had been "re-queued" for `a187ecb0`. Nothing is
cancellable because there is nothing running, which is also why it could not be
cancelled from the UI. A wedged re-run is a GitHub-side state, not a repo
misconfiguration, and no amount of testing or pushing clears it.

**The way past it is a fresh dispatch, not a re-run.** `pages.yml` declares
`workflow_dispatch`, so run #1268 (`31165492254`) was dispatched against the
deploy branch with the user's explicit authorisation — a new run rather than
another re-run of the wedged one, which is the whole point.

Still to confirm: whether #1268 leaves `queued`. A healthy deploy on this repo
takes about two minutes end to end (#1266: 22:52:14 → success). If #1268 also
parks, the wedge is environmental after all and the fix is in repo settings.
The live build could not be read from the sandbox — the proxy 403s github.io —
so what the site actually serves needs checking from outside.

**Consequence for the ship step, unchanged**: "the deploy branch advances by
fast-forward after each green wave" assumes the shipping mechanism works. For
14 hours it did not, and green tests would not have made anything ship.

## CI failures NOT caused by this session

- **`smoke` › "minimap canvas has content after race starts"** — RESOLVED
  `b7a636d3`, and it was NOT what this document first said. I recorded it as a
  local-vs-CI split and guessed strengthen item 19's pixel sampling had become
  too strict for a different GPU stack. The log says otherwise: it never reached
  an assertion. `Test timeout of 240000ms exceeded`, twice (328 s, then 356 s on
  retry), with the car correctly parked at s=0. The passing tests in the same
  job give the real constraint — "select screen is a circuit picker" measures
  179 s on that runner and "grid start renders a non-blank frame" 164 s, against
  seconds locally, so `goToRace` + `park` eats most of the budget before this
  test asserts anything. On top of that the first-paint poll read back the WHOLE
  canvas every tick, which Chromium warned about in the CI console on both
  attempts ("Multiple readback operations using getImageData are faster with the
  willReadFrequently attribute set to true"). Fixed by polling five 1-pixel
  strips instead — the exact count that follows is unchanged, so the assertion
  is exactly as strong — plus `test.slow()`. **CI smoke now passes in 14m16s.**
  Strengthen item 19 was not the mistake; strengthening the assertion was right,
  and only the POLLING needed to be cheap.

- **Most of the day's CI never reported.** Every commit fires a push run and a
  pull_request run, and the pull_request ones are cancelled by `concurrency` on
  the next push. Pushing every few minutes meant run after run reported
  `cancelled`, which is how a red guards job went unnoticed for hours. A signal
  nobody reads is not a signal — the same blind spot as the never-run tests, one
  level up.

## Post-ship foundation failures — bisected, and one of them is mine

The `foundation` group ran for the first time after the rename and produced
three failures. `physics-characterization` is resolved (stale baseline, see
`c563e875`). The other two were bisected against `js/` at `fdd4082f` in a
worktree, with the CURRENT specs copied in so the only variable is the engine:

| spec | pre-Batch | current | verdict |
|---|---|---|---|
| `qatar-foundation` | fails `:123` | fails `:123` | **pre-existing** — night ground-gap check, untouched by the ship |
| `montreal-foundation` | fails `:108` (elevation 3.309 vs <= 1.3) | fails `:99` (support grounding 0.0633 vs <= 0.05) | **`:99` is NEW** |

Montreal is the one worth being precise about. Line 99 runs BEFORE line 108, so
pre-Batch it PASSED and the test died later at the elevation range. It now dies
at 99. Batch A/B/C therefore changed Montreal's support grounding — a genuinely
new failure, inside a test that was already red for a different reason. It is
not a new RED SPEC, which is why the ship gate did not catch it, and that
distinction is exactly the kind that hides a regression: a test already failing
cannot report a second, different failure.

Neither is a player-visible break on the evidence so far — both are foundation
geometry contracts, 27% over a 5 cm tolerance in one case — but the Montreal
delta is a real consequence of the shipped commit and should be fixed rather
than absorbed.

METHOD NOTE worth keeping: the first version of this bisect ran BOTH trees from
the worktree, because `cd` persisted between commands and the "current" run
silently re-ran the old code. The paths in the output were the only tell. A
comparison whose two halves are the same half looks exactly like a clean result.

## Open failures blocking W2-verify — ALL CLOSED

**Nothing in this section is still open.** Every entry below is kept with its
wrong turns intact, because the wrong turns are the transferable part; the
resolutions are inline. Final state, measured 2026-08-07 17:00:01 on a quiet
box: **`tlx` 15/15, 0 failed, 8m16s, two workers, no retries and no flakes.**
The file had never been fully green before.

- **`tlx-probes` — ONE HALF FIXED (`767d3ec7`), ONE HALF NOW A DIFFERENT AND
  BIGGER QUESTION.** 15/15 → **14 pass, 1 fail** → **15/15 (`5c735736`)**.

  **Fixed: all three canvas screenshots ran against a LIVE render loop.**
  `park()` freezes physics, not rendering, so a `.screenshot()` queues behind an
  endless SwiftShader redraw. `tests/specs/smoke.spec.js:35-56` had already measured
  exactly this — 88-96 s solo, 154-214 s under two workers, **29-32 s once
  `headless(true)` stops the loop** — and `tests/helpers/track-helpers.js:117` already
  relies on the compositor keeping the last drawn frame. Ten specs use the
  pattern; tlx-probes used it at none of its three sites. Measured before and
  after, the three screenshot tests each dropped 25-33 s and nothing else moved:

  | test | before | after |
  |---|---|---|
  | M2 world geometry | 92.6 s | **59.5 s** |
  | M8 post chain | 81.2 s | **55.7 s** |
  | M9 env probe | 152.8 s FAIL | **128.0 s PASS** |

  M9 needed BOTH changes: 128.0 s still exceeds the 120 s default, so
  `test.slow()` is what makes it pass rather than an optional extra. The
  file-wide budget is separately justified — the thirteen passing tests spanned
  10.6-92.6 s against 120 s, a median around 65 s and the slowest at 77 %.

  **NOT fixed, and no longer a budget problem: M6 skid is HUNG.** It failed
  again at **371.2 s against a 360 s budget** — tripling the budget changed only
  the number in the message. Two facts locate it precisely. It did NOT fail on
  its own inner `waitForFunction(skidVerts > 0, {timeout: 30_000})`, which would
  print `Timeout 30000ms exceeded`; and its explicit waits total only
  30+60+30 = 120 s, so the missing ~240 s sits inside an un-timeouted
  `page.evaluate`. `freeze(true)` is trivial, which leaves exactly:

  ```js
  window.__apex.jump(0.1, 70);
  window.__apex.act({ steer: 1, throttle: true }, 1 / 60, 120);
  ```

  Deterministic across both failures, byte-identical: `s=644.0730245379482`,
  `x=13.899999618530273`, `speed=2.552148177582885`, `rescueT=0.6333333333333336`
  — 13.9 m off the centreline, nearly stopped, mid-rescue.

  Two candidates, NOT yet separated, and the order matters:
  (a) **PRODUCT** — `__apex.act()` hangs or degrades when an incident engages
  mid-batch. Batch A/B/C changed `jump()` to clear
  `rescueT`/`wallT`/`wrongT`/`wrongWay`/`offT` and call `IncidentSim.release`,
  and this test jumps then immediately drives full lock into the barrier,
  re-arming that machinery. If real it is an agent-API bug far beyond this file;
  `agent-view` passed 117/117 but nothing there drives into a wall.
  (b) **TEST DESIGN** — full lock at 70 m/s for 120 steps drives the car OFF the
  circuit rather than sliding along it, so marks may never be laid.
  **No pre-Batch baseline exists** — M6 has never run on this box, before or
  after — so it cannot yet be called a regression.
  **PROBE RESULT (`77cf5d4d`, run `47666f59`): candidate (a) is DISPROVEN as
  stated, and the probe that disproved it was itself unfaithful.**
  `act({steer:1,throttle:true}, 1/60, 120)` measures **309 ms** — slowest single
  step 129 ms, and that is step #0, first-call warmup. Nothing hangs. The
  manoeuvre reproduces exactly: off the road at step #32, rescue at #80, ending
  `x=13.9 rescueT=0.667` — M6's failure state byte for byte. Only the TIME does
  not reproduce. Both controls behaved as designed (`steer 0.3` never triggers
  rescue; `steer 1.0`×25 never leaves the road, max |x| 4.86), so neither step
  count nor full lock is the variable.

  **But it ran as `[headless]`.** `act-probe.spec.js` is not in `RENDER_SPECS`,
  so all three cases used the default GLX backend, while M6 runs under TLX —
  `tlx-probes.spec.js:10-14` installs `apex26.gfxBackend="three"` and
  `apex26.tlxForceGL="1"` via `addInitScript` in a `beforeEach`. The probe
  therefore cleared `act()` under a renderer M6 does not use. A control that
  does not reproduce the environment is not a control, and the only thing that
  caught it was the project tag in the reporter output.
  A second unfaithfulness, self-inflicted: the probe called `jump(0.1, 70, 0)`
  where M6 calls `jump(0.1, 70)`. `jump(frac, speed, lateral)` writes `x` only
  when `lateral !== undefined`, so M6 starts from the car's existing lateral
  offset and the probe from the centreline — a different trajectory.

  What the source rules out: `act()` calls `update(d)`, pure physics with no
  renderer work, so the backend cannot change `act()`'s own cost. That points
  the missing ~240 s at `goto` or `race("monza")` under TLX rather than at the
  stepping. A TLX-faithful re-probe timing every await separately is running.

  A further narrowing from the suite itself: across every `act()` call site,
  full lock (`steer: 1`) is never held for more than **25 steps**. M6 holds it
  for **120** — nearly five times longer, which is what it takes to leave the
  circuit rather than merely slide. No other test reaches an off-track rescue
  state through this API, which is why nothing else has ever hit this.
  Next: **`tests/manual/act-probe.spec.js`** (committed `77cf5d4d`, queued to
  run) steps one frame at a time and times each, with `steer 0.3`×120 and
  `steer 1.0`×25 as controls, so the answer is a step index and the two
  candidates separate by construction. If it hangs, bisect against `fdd4082f`;
  only then choose a fix. Do NOT redesign the test first — that would paper over
  an agent-API bug with the test that found it.
  **`767d3ec7`'s commit message frames M6 as possibly-just-slow; that is now
  disproven and the record is corrected here.**

  **RESOLVED (`5c735736`) — candidate (b), and the diagnosis took a fifth
  attempt because the first four all asked about the WAIT.** M6 skid passes in
  **49.0 s** and M9 env in **72 s**; `tlx-probes` has no never-passing test
  left. The two had the same error message and nothing else in common — M9 was
  a real wait starved by rAF polling and needed only the `polling: 100` fix,
  while M6 was waiting on something that could not happen.

  Two stacked faults, both measured by `tests/manual/skid-probe.spec.js`:

  1. `skids.stamp()` is called from **`render()`** (`js/game.js:6064`), not from
     the physics step. The stint is driven through `act()`, which steps physics
     and never presents a frame — so no mark can be laid however hard the car
     slides. Every earlier theory implicitly assumed marks were recorded in the
     step, which is what the test's own comment claimed.
  2. 120 steps of full lock is a crash, not a slide. Stepping one frame at a
     time, the stamp condition (`|slip| > 8.59°` and `speed > 10`) holds over
     steps **24..37**, slip peaking at 12.3° with the car still at 56 m/s. Then
     it reaches the barrier at `x 13.9`, slip snaps to exactly 0 and it
     decelerates into rescue. By step 120: 2.5 m/s, zero slip — below BOTH gates,
     permanently. The byte-identical end state recorded above was never evidence
     of a hang; it was evidence of a deterministic crash.

  The instrument is why it resolved. From outside, `drawSkidBatch` returning
  early on `vertCount 0` and never being called at all are indistinguishable —
  both leave `skidVerts` at 0 — and they have opposite fixes. The probe wraps
  `GLX.drawSkidBatch` before the stint and records call count and max
  `vertCount`; the reading was one call, always with 0. That split the pipeline
  in a **37-second** run, against 360 s of timeouts that never said anything.

  One caveat kept for the record: the probe's first version compared
  `slipDeg > 8.59` while `skidIntensity` uses `Math.abs`, and steering right
  makes `slipDeg` negative. It reported "0 of 120 steps — no window exists"
  with `-11.73` printed in the rows directly beneath. Caught only by reading
  the rows against the verdict. **A probe answering the wrong question
  confidently would have been the fifth wrong mechanism, and it would have
  carried more authority than the four theories because it had numbers.**

  Follow-on worth considering: nothing MECHANICALLY stops the next spec
  screenshotting a live render loop. That is the same shape as the four lints
  already in `test:tooling-fast`, and this file is the evidence that a rule
  living only in a comment gets missed — three times, in one file.

- **`menu-keyboard` ×1 — the only genuine ASSERTION failure outstanding.**
  "Tab cannot escape the track-detail dialog into the select screen behind it"
  fails `Error: real top-layer dialog`, expected `true` got `false`
  (`artifacts/logs/e-ui.log`, 07:48:32). This is almost certainly the same root
  cause as the `#track-detail` design ticket below — `02e4e003`'s `index.html`
  hunk was lost in a merge, so the markup is not a real `<dialog>` and
  `TopModal.scan` never claims it. If so the test is RIGHT and the product is
  wrong, which would make it the first product bug of the day; every other
  failure has been the test's fault. Confirm solo before believing it.

## SHIPPED 2026-08-08 — `788a2bb4..4ceb31b4`, 13 commits, fast-forward → build 1039

The subsystem-survey + research-wave defects, landed clean (fast-forward, no
merge into the deploy branch's own history). Full research residue:
[`RESEARCH-WAVE-2026-08.md`](RESEARCH-WAVE-2026-08.md) and the survey section
above.

**What shipped, every finding re-derived against source before landing:**

| Fix | Mechanism |
|---|---|
| perf governor could never restore | `_floorMs ≤ _frameEMA` invariant made the restore branch unreachable — one-way degrade, all session. Proven over 60 M frames; restore re-measured from the floor, up-step verified, missing test added. |
| multiplayer authority gap | `netplay.js` receive side obeyed no authority; a guest could set the host's `netStart`, apply a caution, or fill its classification. The star topology protects guests, not the host. |
| leaked WebRTC transport | `session.js` timeout marked the session dead without closing the transport, and `close()`'s `!alive` guard then never could — a peer connection per timed-out peer, for the tab's life. |
| debris panel leak | promoted barrier panels that never broke were freed by nothing; ten and `PANEL_CAP` exhausts, breakable barriers gone for the session. |
| quali PACE mismatch | quali took bare `ACCEL` into a pace-scaled `vTop()` ceiling; fixed at source with `aTop()`. |
| scenery coordinate split | point and range emitters read different spaces on kyalami/paul_ricard — barriers most of a lap off. Geometry measurably improved (paul_ricard clipping → 0); baselines ratcheted down. |
| `G.netNow` expando | written at 4 sites, declared nowhere — the countT shape, and what would make `Object.seal(G)` throw. Declared. |
| `lostpointercapture` net | moved to the document per PE3 §9.5 (the event fires there, not at the removed element) — the throttle-bug's most likely remaining latch path. |

Also: the circuit-comment batch (stale corner numbers vs `CircuitMarkings`, the
liverytex roster that had `redbull`/`racingbulls` both "RB"), and
`tools/test-solo.mjs` — the "re-run alone on a quiet box" rule as a command that
refuses to measure a loaded box, after four `career.spec.js` timeouts at load 20
proved (solo, at load 3.5) to be pure contention.

**Two mistakes, both now with a guardrail.** A verification worktree grew into a
parallel branch before being merged back and deleted; and two pushes skipped
full `test:tooling-fast` and hit ratchet failures CI caught (module-size,
comment-citations) — the discipline is now "full tooling-fast before any push
that touches `js/`, and the worktree needs `node_modules` linked or its runs are
worthless".

**Open after this wave** (tasks, not lost): renderer #46-49 (wire the instanced
path — the 413→71 MB VRAM prize — the uniform budget, the GPU-time governor
signal, chunked IBO), monaco's coordinate space #43 (now unblocked by the
coordinate fix), the monza/spa/suzuka re-anchors #42, and the wave-2 research
threads still in flight (see RESEARCH-WAVE-2026-08 §"Wave 2").

## SHIPPED 2026-08-07 — `a187ecb0..bb6e73a2`, 74 commits, fast-forward

Landed clean, no merge commit. Cache invariant checked first (`version.json`
build 1029, every `?v` in `index.html` at 1029, no stragglers) because a stale
bump is how a deploy silently serves old code. PR #13 closed with the ship
record rather than merged — its title described one early commit, so merging it
would have written a merge commit that misdescribes 74. All five PRs open this
morning are now closed.

**Two known-red tests shipped, deliberately and on the record:**
`menu-keyboard`'s `:modal` assertion (focus containment on the track-detail
dialog — an accessibility behaviour, and the one open candidate for a real
product bug) and `tlx-probes`' M6 skid (a test defect, and TLX is deferred and
opt-in so no player path touches it).

**Both are now fixed** — `menu-keyboard` in `7bafa71b` (a race on `vt()`'s
async reveal, not a product bug: the dialog becomes visible before TopModal's
observer calls `showModal()`, and a fixed `waitForTimeout(300)` was a guess
about how much before), M6 skid in `5c735736`. So the accessibility candidate
resolved to a test defect too, and **every failure chased in this campaign has.
Zero product bugs found, across the whole wave.** That is a claim about the
product's test suite as much as about the product: a suite this large with this
many never-run and never-passing members was reporting its own condition, not
the code's.

**A cadence correction worth keeping:** the four CI runs cancelled earlier today
were `pull_request` runs, and `ci.yml`'s `cancel-in-progress` is
`${{ github.event_name == 'pull_request' }}` — push runs never cancel, and the
concurrency group is per-ref regardless. Feature-branch pushes were never the
hazard; only a second push to the deploy branch is.

**That correction was itself wrong, and CI #252 is the counterexample:** a
`push` run, `conclusion: cancelled`, `jobs total_count: 0`. It never started.
`cancel-in-progress: false` protects runs that are RUNNING; a run still sitting
in the concurrency queue is superseded by the next one on the same ref and
dropped without ever executing a job. So a rapid second push to a feature branch
does silently discard the first push's gate — which matters because a run that
never started looks, in a listing, much like one that passed nothing of note.
Check `jobs total_count` before reading a cancellation as harmless.

## The decision, as it was taken (PR vs fast-forward)

Measured 2026-08-07: deploy is `a187ecb0`, the work branch `6a495374`, **67
commits ahead and 0 behind — a clean fast-forward**.

**The two options differ less than they appear, and not where you would think.**
PR #13's head IS this branch and its base IS the deploy branch, so merging it
and fast-forwarding land the same 67 commits. Both then push the deploy branch,
which fires `pages.yml` → the full `ci.yml` gate → deploy. Identical CI, identical
risk. Where they differ:

- **The record.** PR #13 is titled *"Record the architecture-redesign panel:
  Bedrock-with-grafts adopted"* — one early commit, not 67. Merged as-is its
  merge commit misdescribes the entire wave. Fast-forward writes no merge commit
  at all and leaves the 67 individual messages as the record, which is what they
  were written to be.
- **Review.** 67 commits is not reviewable in a PR UI in any useful sense. The
  PR adds ceremony without adding review.
- **History shape.** Fast-forward stays linear; a PR merge adds a merge commit.
  This doc's cadence already says fast-forward.

**What does NOT differ, and is worth knowing either way:** four other PRs target
the deploy branch — #12, #11, #10 (draft), #5, from other sessions. Advancing
deploy by 67 commits moves their merge base and they will likely need rebasing.
That happens under BOTH options equally; it is a consequence of shipping, not of
the mechanism.

**Recommendation: fast-forward, and close or retitle PR #13** so it stops
standing as a stale description of this work.

**Two known-red tests ship with it, and that should be a conscious choice, not a
silent one:** `tlx-probes` M6 skid (a test defect — the TLX backend is DEFERRED
and opt-in, so nothing a player touches) and `menu-keyboard`'s `:modal` failure
(focus containment on the track-detail dialog — an accessibility behaviour, and
the one open item that may be a real product bug). Neither blocks a deploy on
the evidence available, but the second is a user-facing claim and shipping it
red is a decision worth making deliberately.

**Both were fixed after the ship, and both were test defects** (`7bafa71b`,
`5c735736`). The accessibility candidate — the one flagged here as most likely
to be a real product bug — was a race on `vt()`'s async reveal against a fixed
`waitForTimeout(300)`. So the deliberate-choice framing was right and the risk
estimate inside it was wrong in the safe direction.

**CLAUDE.md forbids pushing the deploy branch without review, so this is
recorded as a recommendation and not acted on.**

Push cadence remains the standing hazard: four CI runs today (#193, #199, #200,
#202) were cancelled by subsequent pushes from this session. Batch pushes, or
accept that most runs will never report.

## Design tickets (carried into W2 reconciliation, not mechanical)

- **W2-perf fan-out — pick the next tranche on the RIGHT axis.** The first
  tranche was chosen on "zero `localStorage` coupling and a single boot helper";
  `career` and `quali` both satisfy that and both had to be reverted, because
  the axis that decides reuse is whether the spec drives MENU SCREENS. Screen
  state is what the shallow reset cannot restore, and the failure presents as a
  120 s timeout rather than an assertion. Count `locator()` calls, not `goto()`
  calls. That reclassifies the obvious remaining candidates by `goto()` volume —
  `ui-audit` (34), `ui-button-touch` (20), `menu-keyboard` (16), `menu-survey`
  (11), `ui-desktop` (5) — as NO-GO: they are the menu suite, and `__apex` has
  no return-to-main-menu hook to reset them with. `page.goto("/")` is the honest
  reset there, so the remaining win is small and lives in the hook/physics
  specs: `steering` (5), `collisions-deep` (4), `terrain-over-road` (5),
  `elevation-tracks` (5). Decide whether that is worth the churn before doing
  it — the large win (`agent-view`, 43 min → 11 min) is already banked.
  Adding a `__apex` hook that returns the UI to the main menu would unlock ~86
  menu tests, and is the only thing that would change this verdict.

- **BUG WE INTRODUCED — race-control's `capHoldT` leaks across races.**
  `reset()` does not zero `capHoldT`, and every path that reaches `reset()` is
  gated on `caution.level !== 0`. So a cap-forced drop in the last 45 s of a
  race ends the race with `level === 0` and `capHoldT > 0`; nothing decrements
  it out of race state, and the NEXT race starts with the suppression armed —
  swallowing its first genuine caution for up to 45 s. Fix: zero `capHoldT` in
  `reset()` AND widen the guard to `if (caution.level !== 0 || capHoldT)
  reset();`, plus call `raceCtl.reset()` from `startRace()` (a stale
  `caution.level` carrying into the next race is the same latent class,
  pre-existing). Blocked on the browser driver; verify with the node suite
  `tests/unit/race-control.test.mjs`, which needs a new cross-race case.

- **PRE-EXISTING, CAUSE FOUND — `#track-detail` claims to be a modal and is
  not.** `index.html` ships `<div id="track-detail" role="dialog"
  aria-modal="true">`, while `css/track-detail.css` and
  `js/game/topmodal.js`'s comment both say it "migrated to a real `<dialog>`".
  `TopModal.scan` selects `dialog.screen`, so it is not wired. The cause is
  not an oversight: commit `02e4e003` ("Make #track-detail's modal claim
  true") IS an ancestor of HEAD, but its `index.html` hunk was lost in a later
  merge — the CSS half survived, the markup half did not (`git log -L` on the
  line traces past it). Fix: either re-apply that commit's markup hunk plus the
  `showModal()`/`close()` switch, or drop the `aria-modal="true"` lie and
  rewrite both comments, keeping the load-bearing `z-index: 400` with a note
  saying so. The live defect is the false `aria-modal` (Escape still works via
  TopModal's non-dialog path).

- **FOLLOW-UP TO OUR OWN FIX — race-control's cap re-arm hold is too blunt.**
  `js/game/racecontrol.js` now force-drops a flag at its cap (90 s SC / 30 s
  yellow) and suppresses re-raising for `CAP_REARM_HOLD` (45 s) so the same
  stale hazard picture cannot instantly re-flag. But the suppression is
  unconditional: during those 45 s a *genuinely worse* incident — debris
  growing from a local yellow into a safety-car pile — is also swallowed, so
  the race runs green through a real SC-worthy event for up to three quarters
  of a minute. Fix: remember the level that capped, and let `desired` through
  when it EXCEEDS that level (escalation), suppressing only same-or-lower
  re-raises. The existing test still holds under that rule (a capped SC has no
  higher level to escalate to). Not applied yet — a browser run was serving
  the working tree when this was found.

- **City-building `setback` massing is dormant, deliberately.** `building()`'s
  massing knob is `arch`. FIVE call sites still pass a `setback:` boolean it has
  never read — `suzuka.js:182`, `monaco.js:231/:293/:1159`, `bahrain.js:250`;
  the sixth, `js/track/scenery-city.js`'s generated rows, had the dead key
  removed in `d23b70b8` with the reasoning left in place. Every street circuit
  was tuned and shipped with the hash-picked archetypes, so honouring it is a
  change of LOOK, not a cleanup — measured, switching on the generated rows
  alone adds a severe interpenetration on Baku (clip-audit 31 → 32). Decide it
  as an art change across all six sites at once, with the clip baselines
  re-measured.

- `tests/specs/camera-driving-hooks.spec.js` spin test asserts nothing; add
  heading-change + sign asserts (test-audit strengthen 1).
- `tests/specs/headless-api.spec.js` obs()-false test accepts both outcomes; pick a
  contract (strengthen 2).
- Camera-family mechanical items deferred while the group ran: yawRate expect,
  the fixed 3 s sleeps → waitForFunction, the dolly eye-position assert,
  map-hooks north-up pin (strengthen 3-5, 10).
- `parts-livery-contrast` asserts its own inline mirror of buildAtlas — needs a
  real helper export from `js/car/liverytex.js` (+ bump) (strengthen 11).
- ~~racecontrol.js SC_MAX/YELLOW_MAX are dead code~~ — DECIDED AND SHIPPED in
  `89ce4f2f` (force-green at the cap, `tests/unit/race-control.test.mjs` re-pinned).
  The remaining work is the re-arm refinement at the top of this list.
- Synthesis §DEFER stands unchanged (js/game rename NO-GO is final; tlx.js
  header collapse on next touch; phone-UA sniff dedup wants a shared file; the
  tombstone-comment house rule).

## The subsystem surveys (2026-08-08) — six reads, and what survived verification

The campaign's own reading had never opened whole subsystems: `js/net/`,
`js/game/`'s side-worlds, `js/render/`'s backends, `js/car/`, `js/circuits/`.
Six agents were sent to read them in full and report findings with mechanisms.
**Every finding was re-derived against the source before anything was applied**,
and the re-derivation mattered in both directions — it killed some claims and it
widened others.

**Landed (fba33659) — four defects, each with a mechanism:**

| Finding | Mechanism |
|---|---|
| `js/net/netplay.js` receive side ungated | The file declares its authority model as `ownsRaceControl()`/`ownsClassification()`; the SEND side obeyed it, the RECEIVE side obeyed nothing. The star topology protects the GUESTS, not the host — a host holds one session per guest and bound these handlers to every one. A guest could set the host's `netStart`, apply a caution, or fill "the host's classification". The EVENT-channel twin of a STATE-channel bug the same file already fixed and documented. |
| `js/net/session.js` timeout leaked its transport | `pump()` set `alive = false` without closing the transport, and `close()` opens with `if (!alive) return;` — so after the death clock fired NOTHING could tear it down. Every timed-out peer left an RTCPeerConnection and two data channels open for the tab's life. |
| `js/game/debrisworld.js` panel leak | `live = false` appeared only inside `if (p.broken)`, so a promoted panel that never broke was freed by nothing. Ten of those exhaust `PANEL_CAP` and breakable barriers are gone for the session. |
| `js/game/quali.js` PACE mismatch | The G façade hands quali the friction-circle constants promising it runs "off the SAME numbers the driving model uses". It took a bare `G.ACCEL` while its ceiling is the pace-scaled `G.vTop()`, so the modelled field reached a halved cap at undiminished pace-5 acceleration. Fixed at the source with `aTop()`. |

**Landed (b8295474) — the one that was bigger than reported.** Two code paths
answered "which space are this def's scenery numbers in": `sceneryFrac()`
consulted the def, both scenery call sites of `range()` hard-coded `"source"`.
Invisible unless a def declares `"racing"` AND `reverse: true`. Kyalami's
Crowthorne gravel is a POINT at racing 0.078; the tyre wall written on the next
line to back it is a RANGE at 0.060-0.098, landing at 0.912-0.950 — and since
`guardrail`/`fence`/`tyreWall` feed `recordBarrier`, this moved collision
geometry, not just props. Now one answer, `TrackSpace.scenerySpace(def)`.

**Two corrections to my own re-derivation, both worth keeping:**

1. I alarmed at **22 affected circuits** and was wrong. I had grepped source
   files, where monza's `reverse: false, // ...(was auto-audit reverse:true)`
   matches a search for `reverse: true`. Counting from the RESOLVED defs gives
   exactly the two the survey said. *Grep the resolved object, not the file that
   declares it.*
2. The regression guard's anti-vacuity clause rejected my first draft of it. I
   checked monaco's remap on `0.10-0.18`; a reversed remap sends `s` to `phi-s`
   and swaps the ends back, so **any pair summing to `startFrac` (0.28) maps to
   itself**. The check would have asserted nothing. Every fix in this batch was
   then proved by reintroducing the exact bug in a worktree at HEAD and watching
   the new test go red.

**Blast radius, measured rather than argued.** Only three defs reach
`transformSceneryApi` at all. Built each plus two controls before and after,
comparing prop vertex counts and a hash of `barL`/`barR`: kyalami and
paul_ricard changed; monaco, monza and spa are byte-identical.

**Batch B (`claude/survey-batch-b`)** carries the lower-stakes half: stale
corner numbers in vegas checked against `CircuitMarkings.vegas`, the
buenos_aires lake comment, imola's species comment, Audi's colour hex, monza's
duplicated lakeside tree loop (interleaved, not deleted), and `liverytex`'s
private copy of the roster — where `redbull` and `racingbulls` were BOTH "RB".

**Deferred as tasks, not applied:** the monza / spa / suzuka scenery re-anchors
(#42) and monaco's declared coordinate space (#43). Both need per-circuit
measured work and a scenery browser group; #43 is only now safe because
b8295474 made ranges and points agree on whatever a def declares.

## Record lifecycle

| Record | Archives when |
|---|---|
| AUDIT-SYNTHESIS-2026-08 | W2 steps 2-4 land (FIX-NOW already marked worked off in place) |
| TEST-AUDIT-2026-08 | W2 steps 1-2 + the CI redesign land **AND** its §1c strengthen list is closed — 14 of 21 landed in W1.5, the remaining 7 (items 1-5, 10, 11) are the design tickets above. Without that clause the record would archive with live work inside it |
| ARCHITECTURE-REDESIGN-2026-08 | Stays — decision record for W3/W5 (Bedrock-with-grafts adopted, ESM the escalation path) |
| TOTAL-AUDIT-2026-08 | Batch A/B/C are worked off (`89ce4f2f`, `d23b70b8`); archives when §"Feed the restructure" and §Defer are absorbed into W2 |
| RESEARCH-WAVE-2026-08 | With this doc — it is the survey/perf wave's evidence, and its open items are live renderer/circuit tasks |
| This doc | Campaign completes → `docs/archive/` |
| `research/raw/*.json` | With their parent record — they are its uncompressed evidence and mean nothing alone |

### The archive move itself, and the one thing that is NOT guarded

Measured 2026-08-07, before any of it moves. Half the lockstep already fails
loudly and half fails silently, which is the same shape as R2's ⚠ set.

**Guarded — an incomplete move turns `docs-integrity` red:**

- *"a doc under docs/ is not linked from docs/README.md"* — the index must gain
  the archive row.
- *"docs/README.md links to a path that does not exist"* — the old
  `research/…` href must become `archive/…`.

**NOT guarded — dead links between records, and there are ten of them.** The
link check only walks `docs/README.md`. Cross-record links are unchecked, and
these four records cite each other heavily:

| record | inbound links from live docs |
|---|---|
| AUDIT-SYNTHESIS-2026-08 | TEST-AUDIT, CAMPAIGN, TOTAL-AUDIT, README |
| TEST-AUDIT-2026-08 | CAMPAIGN, README |
| TOTAL-AUDIT-2026-08 | CAMPAIGN, README |
| CAMPAIGN-2026-08 | TEST-AUDIT, TOTAL-AUDIT, README |

So archiving AUDIT-SYNTHESIS on its own leaves three dead links behind it and
nothing says so. **Do the de-silencing FIRST**, exactly as `d6f09674` did for the
tests split: widen the relative-link check from README to EVERY live doc, watch
it pass on the current tree, and only then move a file. A guard that arrives
after the commit it protects has protected nothing — that sentence is already in
this document and this is its second application.

Also worth knowing before planning a bigger sweep: **`docs/` root has no archive
candidates.** Every one of its 22 files is cited from at least one live place
(`TRACK-MIGRATION-CHECKLIST.md` is the thinnest at 1) and every one was touched
within three days — the tree was rewritten during this campaign. The archiving
work is the dated records in `research/`, nothing else.

**Order, once the link check is widened:** archive the spent records together
rather than one at a time, since they are mutually linked and a partial move
maximises the rewriting. Records that STAY (`ARCHITECTURE-REDESIGN-2026-08`)
keep live links and must have theirs rewritten to `archive/…`. This doc goes
last, when the campaign closes — it is the index that points at the rest.

## Standing rules (unchanged, restated because every wave trips over them)

- Browser suites run in the MAIN LOOP, serially, backgrounded with watchers —
  agents never run them. One heavy group is the 4-core box's full capacity.
- **One Playwright PROCESS at a time, however many specs it covers.** Local runs
  set `reuseExistingServer`, so a second process attaches to the first's
  `python3 -m http.server` instead of starting its own; killing either run pulls
  the server out from under the other and the survivor's remaining tests all die
  with `net::ERR_CONNECTION_REFUSED` (measured: 33 false failures in
  `career.spec.js`). To cover more at once, pass every spec to ONE process and
  raise `APEX_WORKERS` — never start a second one.
- No `js/`/`css/` edits and no `?v` bump while a browser run serves the tree;
  bump LAST, once per landing commit set.
- Every file move carries its guard lockstep (manifest, index.html, load-order,
  docs-integrity, test-groups, coverage-audit, skills/docs paths) in the SAME
  commit; the guard suite going green IS the restructure's proof.
- Findings only count after adversarial verification; workflow outputs get
  committed as dated records before they are acted on.
