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
| W0 | Fix the red spec the cleanup itself created (`tests/agent-view.spec.js`) | **LANDED** `788ac8d3`, verified 117/117 |
| W1 | The audit synthesis's FIX-NOW list (8 items) | **LANDED** `33114382` + `af05fa98` — incl. the discovered camera inside-of-corner bug; camera group 45/45 |
| W1.5 | Test-audit mechanical strengthen batch (guard blind spots + ten weak specs) | **LANDED** `46b999e8`, `89f6889d`, `6112fb74`, `f9bbf479` — caught the stale Mexico terrain pin (a spec that never runs is prose) |
| W2a | Test-semantics audit workflow (all 162 test files) | **DONE** — record: [TEST-AUDIT-2026-08.md](TEST-AUDIT-2026-08.md) |
| W2b | Total-audit workflow (all code + all docs) | **DONE** — 197 verified findings: [TOTAL-AUDIT-2026-08.md](TOTAL-AUDIT-2026-08.md). Survived a mid-run token-limit crash via cached resume with slimmed (haiku, batched) verification |
| W2-fix | The total-audit's Batch A/B/C fix train (headline: the LIVE curvature-sign trio in the track engine — kerbs/barriers/corner boards on the wrong side — plus the session-verified jump()/IncidentSim authority bug, career slot overwrite, racecontrol dead caps, DRIZZLE tier, matTexMix truth cluster) | **LANDED** `89ce4f2f` (A+B+C together, bump v1025) + `d23b70b8` (tail, bump v1026). The tail also REPAIRED a regression the first commit shipped — an intermediate paul_ricard.js whose widened modelGroup bounds made preflight reject the cabanon AND its wall (299,716 vs 299,946 verts) — and REVERTED an art change it had smuggled in (city-building `setback` massing; see the design ticket below). Geometry sweeps green across all 40 circuits; browser groups running |
| W2-perf | Shared-page test fixture (`sharedTest`) — kill the per-test page boot | **LANDED** `e52bb772`, `9b91f807`, `3fa9d047`, `75ae72f9`, `85a91f40`. Settled at **6 specs / 284 tests** on the shared page after 8/405 was tried and two specs reverted. Headline: `agent-view` **117/117 in 11m16s against ~43 min** before. Also green: `new-hooks` 56/56, `headless-api` 24/24, `logging` 6/6. `career` (101) and `quali` (20) reverted — both drive MENU SCREENS, which is the axis that decides reuse; `dev-tools` + `camera-driving-hooks` verifying. Full rationale, the three conversion edges and the load-inversion diagnostic are in [docs/TESTING.md](../TESTING.md) |
| W2-verify | Run the browser groups against the live track-engine changes, ordered by ignorance | **IN FLIGHT** — `89ce4f2f`'s kerb/barrier side-flip is BISECT-CLEARED: all three elevation failures reproduce byte-identically at `fdd4082f`, the commit before it. **`elevation-tracks` now 47/47** after four repairs (`afd546ed`, `2b2ab54c`, `ce359164`, `0f458925`). Verified green: `agent-view` 117/117, `new-hooks`, `dev-tools`, `headless-api`, `logging`, `camera-driving-hooks`, `quali`, `career`, `audit`, `elevation-tracks`, plus node-only `net-unit` 99/99, `agent-contract`, `service-worker`, `webgpu-lifecycle`. RUNNING: `steering` (88, never run). NEXT: `net` (70, never run) |
| W2 | RESTRUCTURE + change-aware CI | **BLOCKED on W2-verify** — see "the finding that outgrew its wave" below. Moving files while half the suite has never been executed makes a never-run red test indistinguishable from one the move broke |
| W3 | Bedrock Ph0-1: dependency scanner + global registry, `.d.ts` contracts, `tsc --checkJs` CI, `@ts-check` tranche + ratchet | Planned — [ARCHITECTURE-REDESIGN-2026-08.md](ARCHITECTURE-REDESIGN-2026-08.md) is the adopted direction |
| W4 | Loop-until-dry lens-diverse review of the post-restructure tree, CAP 3 ROUNDS | Planned (shrinks if W2b leaves little) |
| W5 | Bedrock Ph2-4: gen-manifest, renderer port, seal & carve `G` | Planned |

Ship cadence: the deploy branch (`claude/f1-game-project-26h3ng`) advances by
fast-forward after each green wave, never mid-wave. `main` is a stale diverged
fork — never touched.

## W2 — what executes, in order, once W2b's findings are reconciled in

Sources of authority: [AUDIT-SYNTHESIS-2026-08.md](AUDIT-SYNTHESIS-2026-08.md)
§RESTRUCTURE (the R1/R2/R3 lockstep lists) and
[TEST-AUDIT-2026-08.md](TEST-AUDIT-2026-08.md) (taxonomy, split map,
CI design + its 14 feasibility gaps). This doc does not duplicate their
step lists — it fixes the ORDER and the gates:

1. **Taxonomy first** (test-audit §1): merges → foundation renames + new
   `foundation`/`gallery` groups → double-billing dedupe. The dedupe MUST add
   pick-tests RULES coverage for collision/drift/offtrack (test-audit gap 11 —
   dropping them from `test:behaviour` without new routing opens holes).
2. **tests/ split** (synthesis R2 + test-audit §2 extensions 14-18): one
   `git mv` commit, no background runs in flight, snapshot dirs and
   `physics-baseline.json` move with their specs.
3. **R1 audio-panel extraction** (synthesis R1, 10-step lockstep).
4. **R3 tools/ subdirs, reduced form** (synthesis R3 — net/car/capture/lighting
   only), last, one family per commit.
5. **Change-aware CI** — REDESIGN REQUIRED before landing; the drafted
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

**Consequence for the campaign**: the tests/ split (W2 R2) must not move files
while half of them have never been executed — a red test that has never run
looks identical to a test broken by the move. Burning down the never-observed
list by group is now a prerequisite of W2, not a follow-up to it.

## OPERATIONAL: the deploy has been STUCK, not failing

`pages.yml`'s run for `a187ecb0` has sat in **`queued`** since 2026-08-06 18:17 —
~14.5 hours at the time of writing. It has not failed; it has never started. The
last deploy that actually reached the site was `a162b00a` on 2026-08-05 22:52.

This matters to the plan's ship step, which reads "the deploy branch advances by
fast-forward after each green wave". Fast-forwarding on top of a stuck queue
adds a second job BEHIND the stuck one — green tests do not make it ship. The
ship cadence silently assumes the shipping mechanism works, and right now it
does not.

Deploy branch is at build 1022; the work branch is at 1029. The live build could
not be read from this sandbox (the proxy returns 403 for github.io), so
confirming what the site actually serves needs a check from outside.

**Held for the user**: unblocking a queued Pages run means cancelling and
re-dispatching it, or clearing the Pages environment. That is the deployment
pipeline rather than the codebase, so it is not something to do unasked.

## CI failures NOT caused by this session

- **`smoke` › "minimap canvas has content after race starts"** — fails in CI,
  passes locally three runs over (including a full 71/71 `tiny`). Not a flake:
  a genuine local-vs-CI split. It is strengthen item 19, rewritten in W1.5 from
  a `width > 0` check to sampling real pixels via `getImageData` — exactly the
  kind of assertion that can hold under this box's SwiftShader and fail on a
  different GPU stack. The failed runs upload a ~36 MB artifact bundle with
  screenshots; that decides "genuinely blank in CI" versus "below the sample's
  threshold", i.e. whether the product or the test is wrong. OPEN, and
  deliberately not fixed on the hypothesis alone.
- **Most of the day's CI never reported.** Every commit fires a push run and a
  pull_request run, and the pull_request ones are cancelled by `concurrency` on
  the next push. Pushing every few minutes meant run after run reported
  `cancelled`, which is how a red guards job went unnoticed for hours. A signal
  nobody reads is not a signal — the same blind spot as the never-run tests, one
  level up.

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
  `tests/race-control.test.mjs`, which needs a new cross-race case.

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

- `tests/camera-driving-hooks.spec.js` spin test asserts nothing; add
  heading-change + sign asserts (test-audit strengthen 1).
- `tests/headless-api.spec.js` obs()-false test accepts both outcomes; pick a
  contract (strengthen 2).
- Camera-family mechanical items deferred while the group ran: yawRate expect,
  the fixed 3 s sleeps → waitForFunction, the dolly eye-position assert,
  map-hooks north-up pin (strengthen 3-5, 10).
- `parts-livery-contrast` asserts its own inline mirror of buildAtlas — needs a
  real helper export from `js/car/liverytex.js` (+ bump) (strengthen 11).
- ~~racecontrol.js SC_MAX/YELLOW_MAX are dead code~~ — DECIDED AND SHIPPED in
  `89ce4f2f` (force-green at the cap, `tests/race-control.test.mjs` re-pinned).
  The remaining work is the re-arm refinement at the top of this list.
- Synthesis §DEFER stands unchanged (js/game rename NO-GO is final; tlx.js
  header collapse on next touch; phone-UA sniff dedup wants a shared file; the
  tombstone-comment house rule).

## Record lifecycle

| Record | Archives when |
|---|---|
| AUDIT-SYNTHESIS-2026-08 | W2 steps 2-4 land (FIX-NOW already marked worked off in place) |
| TEST-AUDIT-2026-08 | W2 steps 1-2 + the CI redesign land **AND** its §1c strengthen list is closed — 14 of 21 landed in W1.5, the remaining 7 (items 1-5, 10, 11) are the design tickets above. Without that clause the record would archive with live work inside it |
| ARCHITECTURE-REDESIGN-2026-08 | Stays — decision record for W3/W5 (Bedrock-with-grafts adopted, ESM the escalation path) |
| TOTAL-AUDIT-2026-08 | Batch A/B/C are worked off (`89ce4f2f`, `d23b70b8`); archives when §"Feed the restructure" and §Defer are absorbed into W2 |
| This doc | Campaign completes → `docs/archive/` |

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
