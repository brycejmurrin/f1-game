# UI package research — improving the Apex 26 UI (2025–2026)

Companion to `PACKAGE-RESEARCH.md`. Two web-research sweeps: (1) styling &
component foundations, (2) game-HUD / animation / overlays / telemetry data-viz.
Research-only — nothing adopted; this is the menu.

**Constraints:** no build step, static GitHub Pages, pure IIFE `<script>` + one
importmap island, vanilla DOM (NO React/bundler). The UI is already a **mature
bespoke dark design system**: `css/tokens.css` `:root` custom props
(`--red:#e10600`, `--bg`, `--panel`, radii, safe-area insets), CSS split into 10
files, `font-variant-numeric: tabular-nums` already correct on timing tables,
PWA/offline. Fit tags: ✅ drop-in `<script>`/`<link>`/native · ⚠️ vendored-ESM +
importmap · ❌ bundler-required.

**The throughline:** a game with a finished custom look is *hurt* by opinionated
frameworks and *helped* by a real font, icons, modern vanilla CSS, and a couple of
tiny drop-in libs. The biggest wins are additive, not a framework swap.

---

## Top recommendations (ranked, do in this order)

1. **Self-host web fonts** ✅ — the single biggest perceived-quality jump; the
   system-font stack is the most "template-y" thing left. Variable woff2 via
   `@font-face`, added to the SW precache (offline, no runtime fetch). All SIL
   OFL (free for a fan game, ship the license):
   - **Titillium Web** — the family the real F1 site uses; menus/body.
   - **Rajdhani** — condensed technical face for the HUD/timing (or Orbitron for
     a big speed readout, Chakra Petch as an alt). Verify tabular numerals ship.
2. **Lucide inline SVG icons** ✅ (ISC) — paste raw `<svg>` into hud.js/menus.js
   DOM strings; `stroke="currentColor"` inherits the team accent, zero network,
   no FOUT. Tabler (MIT, 6,100+) for coverage gaps; Phosphor (MIT, 6 weights) if
   you want weighted active-states.
3. **GSAP** ✅ — **free incl. commercial since Apr 2025**, UMD global `window.gsap`
   via CDN, load only what you use (~23 KB core). The one animation dependency
   worth taking: timelines for results-screen sequences, staggered HUD reveals,
   menu choreography; MorphSVG (now free) can morph the track-map/minimap;
   SplitText for headline reveals. Not for car physics.
4. **uPlot** ✅ (MIT, ~14 KB gz, UMD global) — the telemetry chart for the DATA
   hub. Best-in-class real-time: ~10% CPU / 12 MB for 3,600 pts @60fps (vs
   Chart.js 40%/77 MB, ECharts 70%/85 MB). Purpose-built for lap-time traces,
   speed/throttle/brake channels, sector overlays, ghost-vs-player.
5. **Per-team skin via `data-team` + `color-mix()`** ✅ native, 0 KB — set one
   team hex, derive the whole HUD skin (`--accent-dim: color-mix(in oklch,
   var(--accent) 40%, var(--bg))`). Steal Bootstrap's `data-*-theme` *mechanism*,
   not the framework. Attribute swap on `<html>`, zero JS/dependency.
6. **Modern vanilla CSS** ✅ native, 0 KB — this is where to spend the "framework
   budget": `@layer` for deterministic cascade across the 10 CSS files;
   **View Transitions API** (same-document, Baseline Oct 2025) —
   `document.startViewTransition(() => swapDom())` for free menu↔race↔results
   crossfades/shared-element morphs, progressive-enhanced; `:has()`, container
   queries for responsive HUD, `clamp()` + `--hud-scale`, CSS anchor positioning
   (behind `@supports`) for tooltips/menus.

---

## Overlays / dialogs / feedback — go native, add nothing

- **`<dialog>` + `showModal()`** ✅ 0 KB — top-layer, `::backdrop`, focus trap,
  `inert` background, Esc-to-close for free. Pause menu, confirm-quit, car-setup.
- **Popover API** ✅ 0 KB (Baseline 2024) — light-dismiss, correct stacking, no
  JS. Settings flyouts, camera-mode picker, tooltips, **and toasts** (race events:
  "Fastest lap!", "Penalty"). Animate entrances with WAAPI/GSAP.
- Verdict: **no modal or toast dependency.** `<dialog>` for blocking, Popover for
  non-blocking. (Notyf/vanilla-toast exist ✅ but are unnecessary.)

## HUD widgets — hand-roll, don't import

A bespoke dark HUD wants thin arcs / glow / team-accent fills. A radial
ERS/throttle meter is ~15 lines: one SVG `<circle>` with
`stroke-dasharray`/`stroke-dashoffset`, or `conic-gradient()`. Zero KB, fully
themeable, animate with WAAPI/GSAP. Tyre/damage indicators have no matching lib —
always bespoke inline SVG driven from hud.js. **Fallback only** if you refuse to
hand-roll: **ProgressBar.js** (✅ 8 KB, SVG-path bars). Skip canvas-gauges
(31 KB, skeuomorphic) and JustGage (dashboard look).

## Number count-ups
**CountUp.js** ✅ (~8 KB, UMD) for points/standings/lap reveals; **Odometer.js**
✅ (<3 KB) for a rolling-digit final-position flourish (needs its theme CSS). Or,
if GSAP is loaded, `gsap.to(obj,{val,onUpdate})` + tabular-nums = 0 extra KB.

## Touch / mobile
- **nipplejs** ✅ (MIT, UMD, maintained) — virtual joystick; prototype against the
  existing `"touch"` steer mode / `#pm-steer`.
- **`env(safe-area-inset-*)`** ✅ native — `viewport-fit=cover` + inset padding so
  HUD clears the notch / home indicator in landscape phone play. Essential.
- **Gamepad `vibrationActuator.playEffect`** ✅ native but uneven support —
  feature-detect, treat rumble (kerb rattle, collision, lock-up) as progressive
  enhancement.
- Responsive HUD scaling: CSS `clamp()` + `--hud-scale` / container queries, not JS.

## Telemetry data-viz (DATA hub)
- **uPlot** ✅ (see #4) for all live/telemetry traces + ghost/sector comparison.
- **Frappe Charts** ✅ (~15 KB, UMD, MIT) for *static* standings/points/schedule
  bars — or hand-roll SVG bars. Not for high-rate live traces.
- **Chart.js** ✅ (UMD) fine but heavier; beaten at both ends by uPlot+Frappe.
- **ECharts** ❌ (full UMD ~1 MB; tree-shaking needs a bundler) — skip.
- **D3 modules** ⚠️ (importmap `+esm`) — only for a signature bespoke viz.

## Minimap / track map
No library warranted — a few hundred spline points + 22 car dots is trivial for
SVG (single `<path>` + `<circle>`s, free hit-testing) or canvas. GSAP/MorphSVG
(now free) for any outline morph or "you are here" pulse.

---

## What to AVOID (and why)

- **Classless CSS frameworks** (Pico/Water/Sakura/MVP) — built to style bare
  document HTML; they'd fight a bespoke class/ID-driven HUD, not help it.
- **Bootstrap / Bulma** — heavy, opinionated "web-app" look; nothing you'd keep.
  (Steal Bootstrap's `data-*-theme` idea only.)
- **Tailwind** — Play CDN is dev-only (JIT in the browser, big JS, CPU cost);
  standalone CLI / `@apply` need the build step we've ruled out. ⚠️/❌.
- **Material Web (MWC)** — maintenance-mode since Jun 2024 + Material aesthetic
  clashes with F1. **MS FAST / Fluent WC** — stale/maintenance-mode. ⚠️+risk.
- **Web Awesome (ex-Shoelace)** ⚠️ (MIT, importmap) — the *one* web-component
  suite worth touching, but Shadow DOM only themes via CSS vars + `::part()`,
  fighting deep per-team skinning. Use as a **scalpel** for genuinely hard widgets
  (`wa-dialog`, `wa-color-picker`, `wa-tooltip`) on the livery/settings screens —
  **never for the HUD**.
- **anime.js v4** ⚠️ (ESM-first; UMD build is degraded) — GSAP being free removes
  its reason to exist here. **Motion One** ✅ (2.3 KB mini) is a fine lightweight
  alternative for spring pop-ins if you don't want GSAP.

---

## Compatibility split

**✅ Drop-in `<script>`/`<link>` (matches IIFE):** GSAP · Motion (legacy global) ·
CountUp.js · Odometer.js · ProgressBar.js · nipplejs · uPlot · Frappe Charts ·
Chart.js (UMD) · Open Props (`<link>` or copy) · Pico/Water/Bulma/Bootstrap CSS
(but avoid) · Lucide/Tabler/Phosphor (paste SVG).
**✅ Native, 0 KB (adopt first):** `@font-face` self-host · `@layer` · nesting ·
`color-mix()` · `:has()` · container queries · View Transitions (same-doc) ·
`<dialog>` · Popover API · `tabular-nums` · `env(safe-area-inset)` · Gamepad
haptics · WAAPI · CSS anchor positioning (`@supports`).
**⚠️ Vendored-ESM + importmap:** Web Awesome · Lit · anime.js v4 · D3 modules ·
Motion `+esm`.
**❌ Bundler-required to be sane:** Tailwind (`@apply`/CLI) · ECharts tree-shaken ·
Material/FAST full ergonomics.

---

## Bottom line
For a bespoke dark game UI that already has a token system and correct tabular
numerals, **modern vanilla CSS + a real font + inline SVG icons + GSAP + uPlot**
beats adopting any CSS framework or web-component suite. Concrete order: fonts →
Lucide icons → `data-team`/`color-mix()` skin → `@layer` + View Transitions →
GSAP for menu/results juice → uPlot in the DATA hub → hand-rolled SVG gauges →
CountUp for reveals → nipplejs prototype. Frameworks are for document sites and
generic web apps; this UI has outgrown what they offer.
