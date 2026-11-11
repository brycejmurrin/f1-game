# UI-matrix probes, routes, diagnosis, mistakes

## Contents
- 1. The probe — four questions, each with its trap
- 2. Reaching each screen, and resetting between them
- 3. Diagnosing "my CSS change did nothing"
- 4. What to do with the findings
- Common mistakes

Load this when a hand-rolled measurement looks wrong, when reaching a screen, or when a CSS change "did
nothing". Axes live in code, not prose: viewports (with injected iPhone safe-area insets) in
`tools/ui/menu-screens.mjs` `VIEWPORTS`, screens in its `SCREENS`, and the scale axis (40–200 %) in
`tools/ui/ui-scale-axis.mjs`.

**Inputs:** the route, viewport/scale cell, pointer mode, and the observed geometry or style symptom.

**Verification:** capture the measured cell, DOM/CSS evidence, and whether the result came from the UI matrix or a focused screen probe.

**Writes/ownership:** read-only diagnosis; CSS edits stay with `css-play` and menu ownership stays with `ui-menu-a11y`.

## 1. The probe — four questions, each with its trap

Paste into `evaluate_script`. Every helper here is written the way it is because
the naive version produced a wrong answer.

```js
// (a) CLIPPED — content escaping a box that cannot scroll to it.
// TRAP: a .pane with `overflow-y: auto; overflow-x: hidden` is NOT clipping
// vertically — that is what scrolling IS. Exempt the axis the clipper SCROLLS,
// or you get dozens of false positives on a long help screen.
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

// (c) TAP TARGETS. ONE rule: tools/ui/tap-floor.mjs (judgeTap + measureTapTarget,
//   pinned by tests/unit/ui-reset-tap-floor.test.mjs); layout-audit, menu-mock and
//   fit-audit all judge by it. Do NOT hand-write another. Install it in the page:
//   paste the output of
//     node -e 'import("./tools/ui/tap-floor.mjs").then((m) => console.log(m.TAP_FLOOR_SRC))'
//   into evaluate_script, then use window.__apexTap. What it already handles:
// TRAP 1: --tap is read off <body>, NOT :root (css/tokens.css raises it on
//   `body:not(.desktop)`; :root answers the desktop floor on every phone).
// TRAP 2: a checkbox/radio is activated by the UNION of it and its <label>.
// TRAP 3: getBoundingClientRect() inside `.sheet` is ZOOMED px (zoom: var(--ui-scale));
//   it divides by el.currentCSSZoom so the box compares with --tap in CSS px.
// Triage, not scoring: a `small` hit on a merely NARROW full-height tab, or a chip
//   sized to --chip-h, may be deliberate — report BOTH w and h, then judge.
function tapsIn(root) {
  const T = window.__apexTap, floors = T.floors();
  const SEL = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";
  const out = [];
  for (const el of root.querySelectorAll(SEL)) {
    const m = T.measure(el, root);
    if (m.box.width < 1 || m.box.height < 1) continue;
    const j = T.judge(m, floors);
    if (j.tiny || j.small) out.push({ el: el.id || String(el.className).split(' ')[0], w: Math.round(m.w), h: Math.round(m.h), ...j });
  }
  return { floors, under: out };
}

// (d) DOCUMENT OVERFLOW — always a bug on a fixed-viewport game.
const hOverflow = document.documentElement.scrollWidth - innerWidth;
```

**Wait for the open transition before measuring any of it.** Every `.screen` is a
`<dialog>` that fades in; a flat 400 ms caught `#pmsettings` at `opacity: 0` (it
settles ~1.2 s), which reads as "the screen isn't there":

```js
await new Promise((r,reject) => { const deadline=Date.now()+15000; const t = setInterval(() => {
  if(Date.now()>deadline){clearInterval(t); reject(new Error('screen transition timed out: '+sel)); return;}
  const el = document.querySelector(sel); if (!el) return clearInterval(t), r();
  const a = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
  if (!a.some(x => x.playState === 'running') && getComputedStyle(el).opacity !== '0') { clearInterval(t); r(); }
}, 50); });
```

---

## 2. Reaching each screen, and resetting between them

Reach a screen **through the app's own controls**, never by unhiding its element —
forcing `hidden = false` desyncs the screen's internal state and poisons every
later cell in the sweep. **Leave it the same way: through its door.** Hiding a
layer is not closing it — `DataHub` keeps its own `openFlag`, so after a
`hidden = true` reset the next `#mb-data` click never opens the hub.

ONE reset serves every tool: `tools/ui/ui-reset.mjs` (`resetToTitleState(page)`
from a script; `resetOverlays` is the page function). While `UiLayers.top()` is
not `#overlay` it takes a title exit (`#pausemenu` → QUIT, `#results` → MENU),
else `TopModal.escapeTop()`, else the layer's `data-esc-close` button, else a
module close (`DataHub.close()`); only what is still open after that gets
`hidden = true`, and those ids come back as `fallbackIds` (logged — each is a
door the reset could not use). `#rotate-device` is never hidden (CSS-gated on
`body.in-race`). Then verify the title is hittable (`titleUsable`) and reload
on failure. By hand in `evaluate_script`, the door half is:

```js
for (let i = 0; i < 8; i++) { const t = UiLayers.top();
  if (!t || t.id === 'overlay' || !TopModal.escapeTop()) break;
  await new Promise((r) => setTimeout(r, 60)); }
// anything still open: the hidden=true fallback over the LIVE OVERLAY_IDS
//   node -e 'import("./tools/ui/menu-screens.mjs").then((m) => console.log(JSON.stringify(m.OVERLAY_IDS)))'
```

**The screen-root inventory DRIFTS — enumerate it, don't trust this list.**
The authoritative enumeration is `SCREENS` in `tools/ui/menu-screens.mjs` (`node tools/ui/layout-audit.mjs --list` prints them and
starts no browser; `OVERLAY_IDS` there is the reset list above); `index.html`
holds the `<dialog>` roots (`grep -c '^<dialog' index.html`). Sweeping
the seven or eight you can reach from the title in two clicks is the easy half
and is NOT the survey — defects hide on the shapes and screens nobody opens.

| root | route |
|---|---|
| `#overlay` | boot |
| `#select` | `mb-race` |
| `#carsetup` | `mb-garage` |
| `#race-settings` | `mb-race`, `sel-go` |
| `#career` | `mb-career` |
| `#season-setup` | `mb-season` (SEASON setup screen — `season-ui.js`) |
| `#pmsettings` | `mb-settings` |
| `#howtoplay` | `mb-help` |
| `#vsfriend` | `mb-vs` |
| `#duel-picker` | race settings → open FIELD fold (`rs-fold-field`) → `rs-duel-open` |
| `#trackdesigner` | `mb-designer` |
| `#photo-studio` | `mb-photo` |
| `#loading` | pre-race, opened through its own module (see `SCREENS` `loading`) |
| `#datahub` | `mb-data` (+ each of its tabs: `js/data/hub.js`) |
| `#teampicker` | garage → TEAM tab → `cs-team-card` |
| `#customize` | garage → TEAM tab → `cs-customize` |
| `#advanced` | settings → `pm-advanced` |
| `#audioset` | settings → `pm-audio` |
| `#lighting` | in-race settings → `pm-open-display` → ADVANCED VISUALS (`pm-visual-tuners`) → `pm-lighting` |
| `#spotifypanel` | shown directly (no account needed) |
| `#track-detail` | select → click `sel-preview-map` |
| `#pausemenu` | in-race → `pausebtn` |
| `#standings` | in-race → pause → `pm-standings` |
| `#camtune` | in-race settings → `pm-open-display` → ADVANCED VISUALS → `pm-camtune` |
| `#flyby` | same route → `pm-flyby` |
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

## 3. Diagnosing "my CSS change did nothing"

Before re-editing, prove the browser has the rule:

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

If `ruleInCSSOM` is the OLD text, the browser cached the stylesheet: hard-reload (tags stay `?v=dev`; do not hand-bump `?v=N`)
then verify the shell build without hand-editing `version.json`. If the rule is present but the computed value
differs, it is losing a cascade fight — check `@layer` order first (unlayered
beats every layer; later layers beat earlier ones) and remember a container query
adds no specificity.

---

## 4. What to do with the findings

Sort by **failure mode, not by count**:

- **unreachable content** (clipped, and no ancestor scrolls to it) — always a
  defect; fix first
- **truncated text** — a defect when the label IS the information ("CLOUD)" is
  not a weather option); acceptable when it is a known long value with a tooltip
- **below `--tap`** — `tiny` (under the WCAG 2.2 SC 2.5.8 floor) is a defect;
  `small` (under body `--tap`) is a house preference (`tools/ui/tap-floor.mjs`)
- **document h-overflow** — always a defect here
- **dead space beside cramped space in one composition** — a design finding, not
  a bug; feed it to `css-play` (its restructure.md, linked from SKILL.md §References)

Re-measure after every fix **in the shape you fixed it in and at least one other**
— a fix correct in landscape can push a centred element hard against the left
edge in portrait, and only a portrait sweep catches it.

Then run the batch instrument to cover what you did not: `node tools/ui/layout-audit.mjs`
(add `--shots` for a PNG per cell, `--scale=100,130,150` to add the scale axis).
Then `node tools/ci/pick-tests.mjs --staged` names the groups; they run on the PR
(AGENTS.md rule 5), or request one on the pushed branch with
`node tools/ci/remote-group.mjs <group>`. The `gallery` group's `ui-audit.spec.js`
is a capture harness that **asserts nothing**: read its PNGs, not its pass count.
Expect the `baseline` group's `menu-baseline.spec.js` snapshots to change whenever
menu geometry does; re-bless them deliberately rather than by reflex.

---

## Common mistakes

- Hand-rolling a tap floor instead of installing `tools/ui/tap-floor.mjs` — a
  second rule gives a second answer for the same button (`:root` `--tap`, no
  label union, no zoom division were all past bugs).
- Treating a scroller as a clipper — mass false positives.
- Comparing a `getBoundingClientRect()` height against a CSS-px token without
  dividing by `currentCSSZoom` — everything inside `.sheet` looks too big.
- Measuring during the open transition — the screen reports as absent.
- Soft-reload without cache bypass — you measure the previous stylesheet (hard-reload; tags stay `?v=dev`).
- Screenshotting with the WebGL canvas visible — large black regions that look
  exactly like a layout bug.
- Leaving the MCP browser on a live game page while Playwright runs — contention
  that produces false timeouts.
- Testing only at UI scale 100 — players dial UI SIZE in SETTINGS (range:
  `tools/ui/ui-scale-axis.mjs`), and some layout bugs only show above 100%.
