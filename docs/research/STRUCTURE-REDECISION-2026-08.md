# Structure Re-decision — 2026-08-13

**Dated decision record.** The user explicitly requested re-opening six structural questions despite prior rulings; the prior records were supplied as exhibits, not verdicts, and every question was re-decided from fresh measurement.

**Method:** surveyor (live tree measurements) → three analysts with fixed priors, each required to self-verify every load-bearing number → two independent judges scoring each question against the fresh evidence → this synthesis. Flip rule: a verdict changes only if **both** judges agree; a split is recorded as UPHOLD with the disagreement preserved. Repo state at decision time: working tree at `21f44b21`, read-only throughout.

---

## Fresh measurements

All figures re-verified live in this session (commands: `wc -l`, grep counts, judges' brace-count parses). Where a prior record's figure differs, both are shown.

| Measurement | Prior record's figure | Fresh (verified) | Delta / note |
|---|---|---|---|
| `index.html` lines | 1,689 | **1,689** | matches |
| Static DOM nodes | "~1,390" | **952** body element nodes (excl. scripts); 1,133 by SKILL.md rule 13's own whole-file grep | prior figure reproduces under **no** parse method; both fresh counts are under the ~1,400 Lighthouse error line the rule cites |
| `<dialog>` elements | 18 | **17** | 18th grep hit is prose in a comment at line 680 |
| `.screen` elements | "~38–40 screens" | **20** (17 dialogs + `#select`/`#carsetup`/`#career`); 25 `uilayers.js` DEFS layers | 38–40 was the survey matrix's row count (sub-states/tabs), never a source count |
| Script tags | 146 | **146** src-carrying (149 `<script` occurrences) | matches |
| `index.html` ids | — | 498, 0 duplicates | |
| `js/game.js` | 8,002 ln | **8,002** vs ceiling **8,003** (`module-size.test.mjs:104`) | ONE line of headroom — ratchet saturated |
| `js/agent/apex.js` | 3,079 ln | **3,079** vs ceiling **3,080** | ONE line of headroom |
| `js/game/` files | 46 | **46**: 15 squashed multi-word, 13 hyphenated, 18 single-word | |
| Self-init no-`create(G)` files in `js/game/` | — | **7** (scrollfade, sheetshape, topmodal, menunav, ariastate, uilayers, css-zoom) — grep confirms zero `create(G)` calls | new fact; see Q6 |
| `css/` | 11 files, 7,826 ln | **11 files, 7,826 ln** | matches |
| Distinct CSS classes | 543 | **~543** (session grep: 146 from index.html classes alone; skill's full-corpus method reproduces 543) | was 538 at UI-REMODEL-DECISION time — **crept +5 in ~5 days** |
| Cross-file selector redefinitions | 65 | method-dependent: 61 (surveyor) / 27 (depth-aware) / 2 (top-level-only); of the 27, 19 involve responsive.css/tokens.css doing their override job | ≤8 genuine straddles of ~1,213–1,317 selectors (<1%) |
| `@layer` adoption | — | **11 of 11** css files | ITCSS/layers already implemented natively |
| Rule-11 class-count ratchet test | prescribed | **not installed** — no test carries a 538/543 ceiling | execution gap in a prior ruling, see Q5 |
| `#track-detail` regression (ARCHITECTURE-REVIEW §7) | open defect | **fixed** — index.html:688 ships a real `<dialog id="track-detail" class="screen dim">` | |
| Bedrock implementation status | adopted | **"No phase has been implemented yet"** (ARCHITECTURE-REDESIGN-2026-08.md) | bears on Q1, Q3, Q6 |
| `endRace` size | analyst gap-method: 383 ln | judge brace-count: **64 ln** (ends game.js:2556); the "383" mostly = the G façade block that follows it | measurement dispute, recorded under Q4 |
| Fenced megablocks | — | `updateCar()` ~1,189–1,194 ln (game.js:3372–~4560); `render()` ~1,413 ln (from 5175) | both remain fenced |

---

## Verdicts

### Q1 — Split index.html into partials/generated sections? **UPHOLD** (keep the monolithic shell)

Both judges: UPHOLD. Unanimous analysts on the DOM (one CONDITIONAL, resolved below).

**Deciding evidence.** The pro-split premise — "~1,390 static DOM nodes" — does not reproduce under any parse method; the true counts (952 body element nodes / 1,133 whole-file) sit comfortably under the ~1,400 Lighthouse error line that SKILL.md rule 13 itself cites, and hidden `<dialog>` subtrees never enter the render tree. Both decomposition mechanisms fail binding constraints: fetched partials cost an RTT per screen on GitHub Pages and break `sw.js`, whose precache is derived from the shell's own tags; generated DOM sections create a drift surface for parallel agent sessions and destroy the "grep index.html is the truth" property that `tests/unit/load-order.test.mjs` and the sw.js seed depend on. The honest-removal audit (45 "unreferenced" ids → 0 removable; 224 "dead" classes → 0) still shows the static DOM is more load-bearing than any scanner reports.

**Analyst 1's conditional (generate the 146-tag script block via `gen-manifest`) is not a flip.** Both judges ruled it is the already-adopted Bedrock Phase 2 (ARCHITECTURE-REDESIGN-2026-08.md), which regenerates a checked-in section of the same single file. Its non-execution is a scheduling failure, not grounds to reverse the keep ruling. This record therefore **re-affirms Phase 2 as authorized, unexecuted work** (continuation session; byte-identical-first-run requirement; regeneration-no-op drift test; generator never touches `?v=N` — bump-cache stays the sole version writer).

**Operational addendum (not a flip):** a body-node-count ratchet test in the module-size idiom is endorsed as a guard for the ~1,400 threshold; the count drifted 969→1,133 over rule-13's lifetime and the drift rate is the thing to watch. Growth points: `#advanced` (106 nodes), `#vsfriend` (95).

### Q2 — Restructure/merge the screen inventory? **UPHOLD** (keep 20 screens / 25 layers)

Both judges: UPHOLD. Unanimous analysts.

**Deciding evidence.** The re-opening premise is a measurement artifact: no source of truth contains 38–40 screens. Live truth is 20 `.screen` elements and 25 `uilayers.js` DEFS layers; "38" was the UI-REMODEL survey matrix's row count including tabs and sub-states. The 380-cell survey found two hard defects with one root cause; that record's own verdict ("the argument for merging them is taste") survives — with a *smaller* inventory than it even assumed. Merging dialogs converts free platform behavior (`showModal()` inertness, Escape, focus scoping per dialog) into hand-rolled mode state — the measured 406-line focus-trap bug class — while churning DEFS, `data-esc-close` routing, menus.js flows, and the 6 menu-baseline PNGs to reduce a count no exhibit says must go down. New fact strengthening the ruling: the one open §7 structural defect in this area (`#track-detail` as a div) is verified fixed in the working tree. The screen system currently has zero open defects attributable to its structure.

### Q3 — Rename the grandfathered squashed filenames? **UPHOLD** (do not rename)

Both judges: UPHOLD. Unanimous analysts — all three conceded, including the analyst assigned the pro-rename prior.

**Deciding evidence.** No new fact disturbs a doubly-recorded ruling (CLAUDE.md "grandfathered — do not churn them"; CAMPAIGN-2026-08.md:913 "js/game rename NO-GO is final"). The governing test — "renaming is not restructuring: does it reduce a COUNT?" — fails a 15-file rename outright: same 46 files, same contents. Each rename is a 5-point lockstep (git mv + index.html tag + manifest.cjs + sw.js precache + `?v`/version.json) under load-order.test.mjs, executed by parallel agent sessions — the exact unsynchronized-bulk-change shape the repo's post-mortems identify as its historical damage source — plus blame discontinuity on files whose headers carry safety contracts (`debrisworld.js` "NEVER moves a game car"). The genuinely confusable clusters (cam-tune/cam-tuner/tuner; lighting/light-store/light-presets) are all hyphenated already and handled by CLAUDE.md's disambiguation table. **Earliest rational reconsideration point:** after gen-manifest lands, when a rename becomes a one-field edit — and even then the payoff is cosmetic.

### Q4 — Decompose game.js beyond the ranked backlog? **UPHOLD — with judge disagreement recorded** (Judge 1: UPHOLD; Judge 2: FLIP-PARTIAL; no flip without agreement)

**What is unanimously settled** (both judges, all three analysts): the megablocks stay fenced — `updateCar()` (~1,190 ln) and `render()` (~1,413 ln) are never split; the physics-characterization gate proves lap-level stability but cannot cheaply localize a divergence inside a resliced loop, and this repo's history (the +k curvature sign wrong for months) shows physics-adjacent transcription errors survive review here. Also unanimous: the ratchet is **saturated** (8,002/8,003 and 3,079/3,080 — one line each), so backlog execution is now *forced*, not optional — the next net-positive edit to either file fails the suite.

**The disagreement**, preserved as required: Judge 2 would flip-partially to formally extend the §8 backlog with an extra-backlog non-physics cluster (endRace→GameResults; race-settings/resolution/custom-logo UI; the car-drawing seam unblocking the 415-ln garage preview), citing his own line-for-line scan (~1,078 ln). Judge 1 upholds, having discredited the cluster's measurement: the gap-to-next-function method inflated `endRace` from a brace-counted **64 ln** to "383" by attributing the un-extractable G-façade definition block to it (similarly garageBack 13 not 134, applyResMode 6 not 122); and §8 is explicitly a living list ("Cam modes was taken"), so adding correctly-measured candidates through the §4 boundary-crossings ranking **is the existing ruling operating**, not a reversal.

**Resolution (UPHOLD, operationally convergent).** The upheld ruling authorizes, as its own ordinary operation:
1. **Immediate** (this session's continuation): execute the fewest-crossings backlog items — sky state (~107 ln), liveries (~161 ln) — one carve per commit, physics-characterization green before and after, module-size ceiling lowered in the same commit.
2. **Next**: camera disclosure (~324), pre-race (~261); then the garage-preview car-drawing seam (real design work) unblocking the 415-ln item.
3. **Backlog extension is permitted only after re-measurement by function body (brace count), not gap-to-next-function** — the endRace 383-vs-64 discrepancy is the worked example of why. Candidates surviving re-measurement enter §8 via the §4 crossings ranking.
4. Megablock splitting remains off the table absent a per-step characterization harness that does not exist and is not scheduled.

### Q5 — Re-split the css/ tree? **UPHOLD** (keep the 11-file layout) — with a named execution debt

Both judges: UPHOLD. Unanimous analysts.

**Deciding evidence.** The 543-class count — the one number every exhibit agrees is the real cost — is invariant under any file re-boundary, and the honest-removal audit proves it cannot be ground down by reorganization (224 "dead" classes → all live via `el(tag, className)`). The "65 cross-file redefinitions" smell dissolves under parse discipline: 61/27/2 depending on method, dominated by responsive.css and tokens.css doing exactly their override jobs, leaving <1% genuine straddles. `@layer` is live in all 11 files, so the ITCSS/layers variant of the question is already implemented natively without folders; the current layout already *is* per-screen-over-shared-base. A re-split churns 7,826 lines and forces a whole-tree cache bust, guarded by only 6 menu-baseline PNGs covering 3 screens, for zero count reduction — the rule-9 trap applied to files.

**Execution debt, formally recorded:** the rule-11 distinct-class ratchet prescribed by UI-REMODEL-DECISION-2026-08.md ("start at 538") was **never installed** — no test carries a ceiling — and the count crept 538→543 in five days. This is non-execution of the upheld ruling, not evidence against it. **Authorized now (this session's continuation, in-place work):** install the class-count ratchet test in the module-size idiom, seeded at the current count; then the six one-surface-cluster collapses. Ordered *behind* the zoom/data-density migration per ZOOM-ORIENTATION-STRUCTURE-2026-08.md's 4-step sequence where they touch the same surfaces.

### Q6 — js/ directory-tree moves? **UPHOLD** (no moves now) — with a recorded re-open trigger

Both judges: UPHOLD (Judge 2 explicitly characterizes his conditional as an affirmation of the R3 pattern, not a partial flip).

**Deciding evidence.** The one genuinely new fact — seven `js/game/` files (scrollfade, sheetshape, topmodal, menunav, ariastate, uilayers, css-zoom) verifiably contain zero `Module.create(G)` calls — establishes a classification inconsistency, not a cost: CLAUDE.md's file map already annotates each as self-init, no defect has ever traced to js/ directory layout, no agent navigation failure is recorded, and path-based CI routing errs safe for these files. The claimed benefit ("everything in js/game/ is create(G)" becomes checkable) fails today anyway, because `uilayers.js` — read by game modules for input gating and the Escape ladder, and correctly registering the js/data/ datahub layer as a central registry — would straddle any `js/ui/` boundary immediately. The on-point precedent (R3 tools/-subdirs: navigability for grep-navigating agent maintainers priced at ~zero, at four commits of lockstep risk) generalizes, and js/ moves are strictly costlier than tools/ moves (full load-order triple + `?v=N` per file, mixed-build hazard for in-flight browser runs).

**Recorded re-open trigger (not a flip):** revisit a single one-commit `js/ui/` wave **only after** Bedrock Phase 2's generated manifest lands (collapsing the lockstep triple to a generator re-run), **or** upon the first observed navigation/CI-routing failure attributable to these files. Until then the precondition is unmet — "No phase has been implemented yet."

---

## What this supersedes

**No prior ruling is reversed.** All six verdicts are UPHOLD; the prior records were substantially correct, and where their figures no longer hold, the facts moved in the direction that *strengthens* them. The following annotations should be made (annotate, do not rewrite — the originals were right on the evidence available when written):

- **`.claude/skills/restructure-screens-css/SKILL.md` (rule 13):** annotate the "~1,390 static DOM" figure — it reproduces under no parse method; live counts are 952 (body elements, excl. scripts) / 1,133 (rule's own grep). The rule's *conclusion* (keep the monolith; the real cost is the class count) is re-affirmed with more headroom than it claimed. Also annotate "18 dialogs" → 17 (one grep hit is comment prose). Add a pointer to this record's node-count-ratchet endorsement.
- **`docs/archive/research/UI-REMODEL-DECISION-2026-08.md`:** annotate that "38 screens" was the matrix's row count (sub-states/tabs), source truth being 20 screens / 25 layers — the survey's verdict stands on the corrected count; and annotate that its prescribed rule-11 class-count ratchet was not installed and the count crept 538→543 before this record ordered installation.
- **`docs/ARCHITECTURE-REVIEW.md`:** annotate §7 that the `#track-detail` regression is fixed in-tree (index.html:688); annotate §8 that the backlog is confirmed as the live decomposition plan, now *forced* by ratchet saturation (8,002/8,003; 3,079/3,080), with extension candidates admitted only after function-body (brace-count) re-measurement — the gap-method figures circulated during this re-opening (endRace "383") are recorded here as discredited.
- **`docs/research/ARCHITECTURE-REDESIGN-2026-08.md`:** annotate the Status section that this record re-affirms Phase 2 (gen-manifest) as the authorized next structural work item, and that Q3 renames and the Q6 `js/ui/` wave are explicitly sequenced *behind* it.
- **`docs/archive/research/CAMPAIGN-2026-08.md`:** no annotation needed — the R3 cut and the js/game rename NO-GO were both re-tested against fresh evidence and held.
- **`docs/archive/research/ZOOM-ORIENTATION-STRUCTURE-2026-08.md`:** no annotation — its 4-step ordering is re-affirmed as binding on the Q5 cluster-collapse work.

*Record produced 2026-08-13 from live measurements of the working tree at 21f44b21; six questions re-opened at the user's explicit request; verdicts required two-judge agreement to flip, and none flipped. The Q4 judge split (UPHOLD vs FLIP-PARTIAL) is preserved above.*
