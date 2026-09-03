# UI-matrix probes, routes, diagnosis, mistakes

Load this when a measurement looks wrong, when reaching a screen, or when a CSS change 'did nothing'. Setup ritual + screen enumeration: [setup.md](setup.md). Axes live in code, not prose: viewports (with injected iPhone safe-area insets) in `tools/ui/menu-screens.mjs` `VIEWPORTS`, screens in its `SCREENS`, and the scale axis (40–200 %) in `tools/ui/ui-scale-axis.mjs`.

## 3. The probe — four questions, each with its trap

Paste into `evaluate_script`. Every helper here is written the way it is because
the naive version produced a wrong answer.

```js
// (a) CLIPPED — content escaping a box that cannot scroll to it.
// TRAP: a .pane with `overflow-y: auto; overflow-x: hidden` is NOT clipping
// vertically — that is what scrolling IS. Exempt the axis the clipper SCROLLS,
// or you get ~56 false positives on a long help screen (measured).
function clippedIn(root) {
  const out = [];
  for (const e of root.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    let p = e.parentElement;
    while (p && p !== document.body) {
      const c = getComputedStyle(p);
      const clipY = /(hidden|clip)/.test(c.overflowY), clipX = /(hidden|clip)/.test(c.overflowX);
      const scY  = /(auto|scroll)/.test(c.overflowY), scX  = /(auto|scroll)/.test(c.overflowX);
      if (clipY || clipX) {
        const pr = p.getBoundingClientRect(); let over = 0, axis = '';
        if (clipY && !scY) { const o = Math.max(r.bottom - pr.bottom, pr.top - r.top); if (o > over) { over = o; axis = 'y'; } }
        if (clipX && !scX) { const o = Math.max(r.right - pr.right, pr.left - r.left); if (o > over) { over = o; axis = 'x'; } }
        if (over > 1) out.push({ el: e.id || String(e.className).split(' ')[0], by: p.id || String(p.className).split(' ')[0],
                                 axis, px: Math.round(over), text: (e.textContent||'').trim().slice(0,30) });
        break;
      }
      if (scY || scX) break;            // a scroller absorbs it; stop walking
      p = p.parentElement;
    }
  }
  return out;
}

// (b) TRUNCATED — text ellipsised or cut. Leaf nodes only.
function truncIn(root) {
  const out = [];
  for (const e of root.querySelectorAll('*')) {
    if (e.children.length) continue;
    const t = (e.textContent || '').trim(); if (!t) continue;
    if (e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)
      out.push({ el: e.id || String(e.className).split(' ')[0], text: t.slice(0,28), need: e.scrollWidth, got: e.clientWidth });
  }
  return out;
}

// (c) TAP TARGETS.
// TRAP 1: read --tap off <body>, NOT :root. The touch ladder is declared
//   `body:not(.desktop) { --tap: 52px }`. Asking documentElement returns the
//   44px DESKTOP floor on every device — this bug was live in
//   tools/ui/layout-audit.mjs and undercounted every phone cell it ever produced.
// TRAP 2: the activation target is the UNION of a control and its wrapping
//   <label>; measuring a bare checkbox reports 13x13 for something you tap at
//   342x16.
// TRAP 3: getBoundingClientRect() inside `.sheet` returns ZOOMED px
//   (zoom: var(--ui-scale)). Divide by el.currentCSSZoom for CSS px. A row that
//   paints 60px is 52 CSS px at a UI scale of 1.15 — it PASSES a 52px floor.
//   (1.15 was the coarse-pointer default when this was written; the shipped
//   default is 1.0 on every pointer now, so the arithmetic bites only once a
//   player dials UI SIZE up — which the matrix does deliberately.)
// TRAP 4: DO NOT SCORE ON min(width, height). Height is the thumb dimension; a
//   full-height tab that is merely NARROW is not a small target. Scoring on the
//   minimum produced two false alarms out of three findings in one sweep —
//   `.dh-tab-live` at 44x52 (fine: a short label on a full-height tab) and
//   `.sel-chip` at 85x45 (fine: --chip-h is deliberately one step below --tap).
//   Report BOTH dimensions and judge height against the ladder; use the
//   min only for the WCAG 24x24 test, which really is both-axes.
function tapsIn(root) {
  const floor = parseFloat(getComputedStyle(document.body).getPropertyValue('--tap')) || 44;
  const chip  = parseFloat(getComputedStyle(document.body).getPropertyValue('--chip-h')) || floor;
  const SEL = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
  const out = [];
  for (const el of root.querySelectorAll(SEL)) {
    let r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const lab = el.closest('label');
    if (lab) { const lr = lab.getBoundingClientRect(); r = { width: Math.max(r.width, lr.width), height: Math.max(r.height, lr.height) }; }
    const z = el.currentCSSZoom || 1;
    const w = r.width / z, h = r.height / z;                 // CSS px, not painted
    const wcagFail = Math.min(w, h) < 24;                    // SC 2.5.8 AA — both axes
    // 1.5px of slack: the zoom division rounds (52 x 1.15 = 59.8 -> 51.99).
    const shortForLadder = h < chip - 1.5;
    if (wcagFail || shortForLadder)
      out.push({ el: el.id || String(el.className).split(' ')[0],
                 w: Math.round(w), h: Math.round(h), wcagFail,
                 note: h < floor - 1.5 && h >= chip - 1.5 ? 'chip-height, check if deliberate' : '' });
  }
  return { floor, chip, under: out };
}

// (d) DOCUMENT OVERFLOW — always a bug on a fixed-viewport game.
const hOverflow = document.documentElement.scrollWidth - innerWidth;
```

**Wait for the open transition before measuring any of it.** Every `.screen` is a
`<dialog>` that fades in; a flat 400 ms caught `#pmsettings` at `opacity: 0` (it
settles ~1.2 s), which reads as "the screen isn't there":

```js
await new Promise(r => { const t = setInterval(() => {
  const el = document.querySelector(sel); if (!el) return clearInterval(t), r();
  const a = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
  if (!a.some(x => x.playState === 'running') && getComputedStyle(el).opacity !== '0') { clearInterval(t); r(); }
}, 50); });
```

---

## 4. Reaching each screen, and resetting between them

Reach a screen **through the app's own controls**, never by unhiding its element —
forcing `hidden = false` desyncs the screen's internal state and poisons every
later cell in the sweep. Reset between cells:

```js
const OV = ["select","carsetup","career","teampicker","race-settings","quali","standings","results",
            "customize","howtoplay","advanced","pmsettings","pausemenu","datahub","track-detail",
            "vsfriend","audioset","lighting","camtune","photomode"];
for (const id of OV) { const e = document.getElementById(id);
  if (e) { if (e.tagName === 'DIALOG' && e.open) e.close(); e.hidden = true; } }
const o = document.getElementById('overlay');
if (o) { o.hidden = false; o.style.removeProperty('display'); }
document.body.classList.remove('in-race');
```

**The screen-root inventory DRIFTS — enumerate it, don't trust this list.**
The authoritative enumeration is `SCREENS` in `tools/ui/layout-audit.mjs` (37
cells at last count); `index.html` currently holds 19 `<dialog>` roots (was 17
when this skill was written — re-run `grep -c '<dialog' index.html`). Sweeping
the seven or eight you can reach from the title in two clicks is the easy half
and is NOT the survey — the defects this session found were on the shapes and
screens nobody had opened.

| root | route |
|---|---|
| `#overlay` | boot |
| `#select` | `mb-race` |
| `#carsetup` | `mb-race`, `sel-go` |
| `#race-settings` | `mb-race`, `sel-go`, `cs-done` |
| `#career` | `mb-career` |
| `#season-setup` | `mb-season` (SEASON setup screen — `season-ui.js`) |
| `#pmsettings` | `mb-settings` |
| `#howtoplay` | `mb-settings` → `pm-tab-more` → `pm-howto` |
| `#vsfriend` | `mb-vs` |
| `#datahub` | `mb-data` (+ its 6 tabs: schedule/standings/lastrace/live/telemetry/export) |
| `#teampicker` | garage → TEAM tab → `cs-team-card` |
| `#customize` | garage → TEAM tab → `cs-customize` |
| `#advanced` | settings → `pm-advanced` |
| `#audioset` | settings → `pm-audio` |
| `#lighting` | settings → `pm-lighting` |
| `#spotifypanel` | shown directly (no account needed) |
| `#track-detail` | select → click `sel-preview-map` |
| `#pausemenu` | in-race → `pausebtn` |
| `#standings` | in-race → pause → `pm-standings` |
| `#camtune` | pause → camera tuner |
| `#photo-controls` | photo mode |
| `#hud` | in-race (+ the 3 steering modes via `pm-steer`) |
| `#quali` | race settings → QUALIFYING LAP on → `rs-go` |
| `#results` | `__apex.finishRace()` |
| `#career-guide` | career → HOW CAREER WORKS |
| `#career-history` | career → SEASON BY SEASON |
| `#career-offers` | `__apex.careerRollover()` → `cr-go` |
| `#carsetup` sub-tabs | ENGINE / LIVERY / TEAM / WHEELS — four different layouts on one root |

**Never `page.reload()` mid-sweep** — it destroys the execution context and every
subsequent cell fails with a harness error that reads like a layout bug. Reach
in-race screens with `__apex.race(id)` + `go()` + `jump()`, not by reloading.

---

## 5. Diagnosing "my CSS change did nothing"

Before re-editing, prove the browser has the rule. This exact check saved two
wasted rounds:

```js
let found = null;
for (const sheet of document.styleSheets) {
  let rules; try { rules = sheet.cssRules; } catch (e) { continue; }
  for (const r of rules) {
    if (r.selectorText?.includes('#soundbtn')) found = r.cssText;
    if (r.cssRules) for (const q of r.cssRules) if (q.selectorText?.includes('#soundbtn')) found = q.cssText;
  }
}
return { computed: getComputedStyle(el).minHeight, ruleInCSSOM: found };
```

If `ruleInCSSOM` is the OLD text, the browser cached the stylesheet: bump `?v=N`
and `version.json`, then reload. If the rule is present but the computed value
differs, it is losing a cascade fight — check `@layer` order first (unlayered
beats every layer; later layers beat earlier ones) and remember a container query
adds no specificity.

---

## 6. What to do with the findings

Sort by **failure mode, not by count**:

- **unreachable content** (clipped, and no ancestor scrolls to it) — always a
  defect; fix first
- **truncated text** — a defect when the label IS the information ("CLOUD)" is
  not a weather option); acceptable when it is a known long value with a tooltip
- **below `--tap`** — a defect under 24px CSS (WCAG 2.2 SC 2.5.8 AA); a house
  preference between 24 and `--tap`
- **document h-overflow** — always a defect here
- **dead space beside cramped space in one composition** — a design finding, not
  a bug; feed it to `restructure-screens-css`

Re-measure after every fix **in the shape you fixed it in and at least one other**
— this session, a fix that was correct in landscape put a centred element hard
against the left edge in portrait, and only the portrait sweep caught it.

Then run the batch instrument to cover what you did not: `node tools/ui/layout-audit.mjs`
(add `--shots` for a PNG per cell, `--scale=100,130,150` to add the scale axis).
Finish with `node tools/ci/pick-tests.mjs --staged` and the groups it names — for
menu/CSS work that is `test:ui`, whose `ui-audit.spec.js` is a capture harness that
**asserts nothing**: read its PNGs, do not read its pass count. Expect
`menu-baseline.spec.js` snapshots to change whenever menu geometry does, and
re-bless them deliberately rather than by reflex.

---

## Common mistakes

- Reading `--tap` from `:root` — returns the desktop floor on every device.
- Scoring a tap target on `min(width, height)` — a full-height tab that is merely
  narrow reads as a small target. Two of three findings in one sweep were this.
- Treating a scroller as a clipper — mass false positives.
- Comparing a `getBoundingClientRect()` height against a CSS-px token without
  dividing by `currentCSSZoom` — everything inside `.sheet` looks 15% too big.
- Measuring during the open transition — the screen reports as absent.
- Reloading without bumping `?v=N` — you measure the previous stylesheet.
- Screenshotting with the WebGL canvas visible — large black regions that look
  exactly like a layout bug.
- Leaving the MCP browser on a live game page while Playwright runs — contention
  that produces false timeouts.
- Testing only at UI scale 100 — players can still dial 115–150 via SETTINGS,
  and several layout bugs historically only showed above 100%.
