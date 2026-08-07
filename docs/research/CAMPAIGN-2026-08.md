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
| W2-perf | Shared-page test fixture (`sharedTest`) — kill the per-test page boot | **IN FLIGHT** `e52bb772`, `9b91f807`, `3fa9d047`. 8 specs / 405 tests converted; verifying at the full-405 gate. Rationale and the two conversion edges are documented in [docs/TESTING.md](../TESTING.md) |
| W2 | RESTRUCTURE + change-aware CI | **NEXT** — the W2-fix gate is released |
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

## Design tickets (carried into W2 reconciliation, not mechanical)

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
