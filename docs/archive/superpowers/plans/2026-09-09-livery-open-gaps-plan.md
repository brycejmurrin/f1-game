# Livery open gaps + flank placement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship #100 flank-mark placement, restore SIDE `slash`, add Racing Bulls `streaks` TOP, add Cadillac full-body `bodySplit:"lr"`, and apply Alpine pink crown only if a second photo source confirms.

**Architecture:** Four sequential git branches off deploy tip. Atlas-only lanes (`liverytex` / `teams` / garage pills) land before mesh (`car3d`) so review stays focused. Alpine is last and may no-op on the photo gate.

**Tech Stack:** Vanilla IIFE JS (`js/car/liverytex.js`, `js/car/car3d.js`, `js/data/teams.js`, `js/garage/setup-sheet.js`, `js/car/liveries.js`), Node unit tests under `tests/unit/`, deploy via `node tools/ci/deploy.mjs`.

## Global Constraints

- Base every branch on `origin/claude/f1-game-project-26h3ng`; never push deploy without review/`deploy.mjs`.
- Branch names: `cursor/<descriptive-name>-0fe5` (except rebase of existing `cursor/spine-flank-placement-242d` for #100).
- Keep tip’s SPINE_SIDE cull for `bars` / `split` / `chevron`; only `slash` returns.
- Mercedes stays `spineSide: "sash"`.
- Alpine pink applies **only** after a second independent source is recorded in `docs/notes/LIVERY-2026-REFERENCE.md`.
- Cadillac `bodySplit: "lr"`: car-space `x < 0` → `color` (c1), `x ≥ 0` → `color2` (c2); swap team colours if photos disagree — do not add a third field.
- No cache bump; `?v=dev` stays.
- Verify with `node tools/ci/verify-change.mjs --fast` after each lane; browser groups only when pick-tests names them (cap two).
- Logging via `Log`, not bare `console.*`.

**Spec:** `docs/superpowers/specs/2026-09-09-livery-open-gaps-design.md`

## File map

| File | Role |
|------|------|
| `js/car/liverytex.js` | `FLANK_MARK` / `flankMarkStation`; `slash` SIDE; `streaks` TOP; bodySplit-aware cover field |
| `js/car/car3d.js` | `bodySplit` paint for chassis / pods / cover |
| `js/car/liveries.js` | `FIELDS` includes `bodySplit` |
| `js/data/teams.js` | Cadillac / RB / Alpine (gated) data |
| `js/garage/setup-sheet.js` | pills + hints for `slash`, `streaks`, `bodySplit` |
| `tests/unit/fin-design.test.mjs` | slash allow / bars still culled |
| `tests/unit/livery-contrast.test.mjs` / new body-split test | contrast + L/R vertex colours |
| `docs/notes/LIVERY-2026-REFERENCE.md` | close or keep open gaps |

---

### Task 1: Rebase and ship #100 flank placement

**Files:**
- Modify: `js/car/liverytex.js` (`FLANK_MARK`, add `flankMarkStation`, call sites)
- Possibly: docs under `.claude/skills/garage-parts-livery/references/placement.md` if tip still has the old numbers
- Test: extend `tests/unit/fin-design.test.mjs` or a small liverytex unit assert on station helpers

**Interfaces:**
- Produces: `flankMarkStation(spineLogo, sideFrom, spineSide) → { u, v }`
- Produces: `FLANK_MARK = { u: 0.19, uOnCrown: 0.38, uOnSaddle: 0.26, v: 0.45, vOnSaddle: 0.36, halfW: 0.36, halfH: 0.24 }`

- [ ] **Step 1: Branch from tip**

```bash
git fetch origin claude/f1-game-project-26h3ng cursor/spine-flank-placement-242d
git checkout -B cursor/spine-flank-placement-242d origin/claude/f1-game-project-26h3ng
```

- [ ] **Step 2: Write failing station test**

In `tests/unit/fin-design.test.mjs` (or new `tests/unit/flank-mark.test.mjs`):

```js
import { createRequire } from "module";
const require = createRequire(import.meta.url);
// Load liverytex via the project’s existing unit harness pattern (see fin-design.test.mjs).
// Assert:
//   flankMarkStation("saddle", false, "logo").v === 0.36
//   flankMarkStation("saddle", false, "logo").u === 0.26
//   flankMarkStation("wrap", true, "none").u === 0.38
//   flankMarkStation("logo", false, "none").v === 0.45
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
node --test tests/unit/fin-design.test.mjs
# or the file created above
```

- [ ] **Step 4: Port placement-only patch onto tip**

Replace tip `FLANK_MARK` and flankMark call sites with:

```js
const FLANK_MARK = {
  u: 0.19, uOnCrown: 0.38, uOnSaddle: 0.26,
  v: 0.45, vOnSaddle: 0.36,
  halfW: 0.36, halfH: 0.24,
};
function flankMarkStation(spineLogo, sideFrom, spineSide) {
  if (sideFrom) return { u: FLANK_MARK.uOnCrown, v: FLANK_MARK.v };
  if (spineLogo === "saddle" && spineSide === "logo") {
    return { u: FLANK_MARK.uOnSaddle, v: FLANK_MARK.vOnSaddle };
  }
  return { u: FLANK_MARK.u, v: FLANK_MARK.v };
}
```

Wire `flankMark` to use `flankMarkStation(...)`. Export `flankMarkStation` on the public API object next to `FLANK_MARK`. Do **not** restore culled SIDE ids from the old branch.

Cherry-pick reference: `git show origin/cursor/spine-flank-placement-242d:js/car/liverytex.js` around the old `FLANK_MARK` / `flankMark` blocks — copy only those hunks.

- [ ] **Step 5: Re-run unit test — expect PASS**

- [ ] **Step 6: Fast verify + commit + push + merge/deploy**

```bash
node tools/ci/verify-change.mjs --fast
git add js/car/liverytex.js tests/unit/*.mjs
git commit -m "fix(livery): center flank marks for wrap+none and saddle+logo"
git push -u origin cursor/spine-flank-placement-242d
# Update PR #100 body if needed; merge when checks green; node tools/ci/deploy.mjs
```

---

### Task 2: Restore SIDE `slash` (single stroke)

**Files:**
- Modify: `js/car/liverytex.js` (`SPINE_SIDE_IDS`, `SIDE_FILL`, painter branch)
- Modify: `js/garage/setup-sheet.js` (hint text if it lists sides)
- Modify: `tests/unit/fin-design.test.mjs` (allow slash; keep bars/split/chevron culled)
- Branch: `cursor/livery-slash-streaks-0fe5` (shared with Task 3)

**Interfaces:**
- Consumes: tip `eachFlank`, flank band colour (`sideTint` / derived `flankBandC`)
- Produces: `"slash"` in `SPINE_SIDE_IDS`; painter draws one raked stroke

- [ ] **Step 1: Branch from tip (after Task 1 is on tip, or from tip + Task 1 commit)**

```bash
git fetch origin claude/f1-game-project-26h3ng
git checkout -B cursor/livery-slash-streaks-0fe5 origin/claude/f1-game-project-26h3ng
# cherry-pick Task 1 commit if not merged yet
```

- [ ] **Step 2: Failing test — slash allowed, bars still culled**

```js
assert.ok(LiveryTex.SPINE_SIDE_IDS.includes("slash"));
assert.ok(!LiveryTex.SPINE_SIDE_IDS.includes("bars"));
assert.ok(!LiveryTex.SPINE_SIDE_IDS.includes("split"));
assert.ok(!LiveryTex.SPINE_SIDE_IDS.includes("chevron"));
```

- [ ] **Step 3: Implement slash**

```js
const SPINE_SIDE_IDS = [/* existing */, "slash"];
// SIDE_FILL: slash is a stroke on bare flank — do NOT add to SIDE_FILL
// (SIDE_FILL means solid panel under wrap bull; slash is content like ribbon)

} else if (spineSide === "slash") {
  eachFlank((F) => {
    const y0 = F.R.y + F.R.h * 0.18;
    const y1 = F.R.y + F.R.h * 0.82;
    const x0 = F.fx(0.12);
    const x1 = F.fx(0.78);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y0);
    ctx.strokeStyle = css(flankBandC); // use the same band colour sash uses
    ctx.lineWidth = F.R.h * 0.14;
    ctx.lineCap = "butt";
    ctx.stroke();
    ctx.restore();
  });
}
```

Tune geometry against garage side view after unit green; prefer matching pre-cull single-stroke if `git log -S 'spineSide === "slash"'` still finds it.

- [ ] **Step 4: Mercedes stays sash — assert in team-livery test**

```js
assert.equal(Teams.byId.mercedes.livery.spineSide, "sash");
```

- [ ] **Step 5: Commit (keep branch open for Task 3)**

```bash
git add js/car/liverytex.js js/garage/setup-sheet.js tests/unit/fin-design.test.mjs
git commit -m "feat(livery): restore spineSide slash as a single raked stroke"
```

---

### Task 3: Racing Bulls `streaks` TOP

**Files:**
- Modify: `js/car/liverytex.js` (`SPINE_LOGO_IDS`, `drawSpineTop`)
- Modify: `js/data/teams.js` (racingbulls)
- Modify: `js/garage/setup-sheet.js` if logo list is hard-coded anywhere
- Modify: `docs/notes/LIVERY-2026-REFERENCE.md`
- Test: `tests/unit/fin-design.test.mjs` / contrast

**Interfaces:**
- Consumes: `spineTint` / `color2` as streak colour
- Produces: `"streaks"` in `SPINE_LOGO_IDS`

- [ ] **Step 1: Failing test**

```js
assert.ok(LiveryTex.SPINE_LOGO_IDS.includes("streaks"));
```

- [ ] **Step 2: Implement drawSpineTop branch**

```js
} else if (id === "streaks") {
  // 4 parallel strokes along the crest, tint = acc (bandC / spineTint)
  const n = 4;
  for (let i = 0; i < n; i++) {
    const t = (i + 1) / (n + 1);
    const x = R.x + R.w * (0.15 + 0.7 * t);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x - R.w * 0.02, R.y + R.h * 0.12);
    ctx.lineTo(x + R.w * 0.02, R.y + R.h * 0.88);
    ctx.strokeStyle = css(acc);
    ctx.lineWidth = R.w * 0.035;
    ctx.stroke();
    ctx.restore();
  }
}
```

Add `"streaks"` to `SPINE_LOGO_IDS`.

- [ ] **Step 3: Team data**

```js
// racingbulls
livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "streaks", spineSide: "sash",
          spineTint: [0.086, 0.204, 0.796] },
```

- [ ] **Step 4: Docs — mark RB streaks applied; leave Alpine/Cadillac notes for later tasks**

- [ ] **Step 5: verify-change --fast, commit, push, open/update PR, deploy when green**

```bash
git commit -m "feat(livery): Racing Bulls spineLogo streaks + restore slash"
git push -u origin cursor/livery-slash-streaks-0fe5
node tools/ci/deploy.mjs   # or --pr then merge
```

---

### Task 4: Cadillac `bodySplit: "lr"` (full body)

**Files:**
- Modify: `js/car/liveries.js` (`FIELDS`)
- Modify: `js/car/car3d.js` (paint helper + sidepod / cover / chassis emit sites)
- Modify: `js/car/liverytex.js` (cover field left/right when split)
- Modify: `js/data/teams.js` (cadillac)
- Modify: `js/garage/setup-sheet.js` (`LIV_DRAFT_PILLS.bodySplit`, hint)
- Create: `tests/unit/body-split.test.mjs`
- Branch: `cursor/cadillac-body-split-0fe5`
- Docs: close Cadillac open gap

**Interfaces:**
- Produces: `liv.bodySplit === "lr"`
- Produces: `bodyPaint(side)` / `bodyPaintX(x)` inside `car3d` build

- [ ] **Step 1: Branch from tip after slash/streaks merged (or cherry-pick)**

```bash
git checkout -B cursor/cadillac-body-split-0fe5 origin/claude/f1-game-project-26h3ng
```

- [ ] **Step 2: Failing unit test**

```js
// tests/unit/body-split.test.mjs
// Build Cadillac (or a fixture liv with bodySplit:"lr", c1 black, c2 white)
// Sample a vertex from sidepod left (x < 0) and right (x > 0) with mat=paint
// Expect left ≈ c1, right ≈ c2
```

- [ ] **Step 3: Schema**

```js
// liveries.js FIELDS — append "bodySplit"
// setup-sheet.js:
LIV_DRAFT_PILLS.bodySplit = "off"; // stored as absent when off; "lr" when on
// pillRow("BODY SPLIT", "bodySplit", ["off", "lr"], "off");
// draft→liv: write bodySplit only when "lr"
```

- [ ] **Step 4: car3d helper + call sites**

```js
const splitLR = liv.bodySplit === "lr";
const bodyPaint = (side) => (splitLR ? (side < 0 ? c1 : c2) : c1);
const bodyPaintX = (x) => bodyPaint(x < 0 ? -1 : 1);
```

- `buildSidepodBodywork`: `bodyPaint(side)` per loft.
- `buildEngineCoverBodywork`: when `splitLR`, emit left and right half-lofts with `bodyPaint(±1)` instead of one `c1` block (split each ring at x=0).
- `buildSharedChassis` / hood spans: when `splitLR`, dual half-width spans (or two coloured halves). Prefer surgical emit-site splits over a post-pass vertex recolour.

- [ ] **Step 5: liverytex cover field**

When `colors.bodySplit === "lr"`, crest fill uses left half `c1` and right half `c2` (canvas x split). Flank regions already separate — pass each side’s body colour as local cover/field.

- [ ] **Step 6: Cadillac data**

```js
livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "saddle", spineSide: "plate",
          bodySplit: "lr" },
```

- [ ] **Step 7: Tests pass + verify-change --fast + commit + PR + deploy**

```bash
git commit -m "feat(livery): Cadillac bodySplit lr paints full body L/R"
```

---

### Task 5: Alpine pink crown (gated)

**Files:**
- Modify: `docs/notes/LIVERY-2026-REFERENCE.md` (always — record attempt)
- Modify: `js/data/teams.js` **only if confirmed**
- Branch: `cursor/alpine-pink-crown-0fe5`

- [ ] **Step 1: Second-source attempt**

Use deploy-research / host WebFetch / remote evidence for an official Alpine or F1 gallery frame that shows the crown band. Record URL + one sentence in the reference doc.

- [ ] **Step 2a: If confirmed**

```js
livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "stripe", spineSide: "band",
          spineTint: [1.0, 0.529, 0.737] },
```

Update reference Alpine section to APPLIED. Contrast test if required.

- [ ] **Step 2b: If not confirmed**

Leave `teams.js` unchanged. Keep open-gap bullet. Commit docs-only note of the attempt.

- [ ] **Step 3: commit / PR / deploy as appropriate**

---

### Task 6: Final tip hygiene

- [ ] **Step 1:** `git fetch origin claude/f1-game-project-26h3ng` — confirm all merged lanes are ancestors.
- [ ] **Step 2:** Live `version.json` via deploy-research after last deploy.
- [ ] **Step 3:** Open gaps list in reference doc matches reality (Cadillac/RB/slash closed; Alpine closed or still waiting).

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| #100 flank placement | Task 1 |
| slash single stroke; Merc stays sash | Task 2 |
| RB streaks TOP | Task 3 |
| Cadillac full body L/R | Task 4 |
| Alpine gated pink | Task 5 |
| Deploy / verify | Tasks 1,3,4,5,6 |

## Placeholder scan

None intentional. Slash stroke numbers may be tuned after first garage shot — start from values in Task 2, adjust with measured screenshots, do not widen unit tolerances.
