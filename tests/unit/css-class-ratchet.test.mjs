/* css-class-ratchet.test.mjs — a RATCHET on the two counts that only ever grow:
 * the distinct CSS class tokens across css/, and the DOM node count of the
 * single-file shell.
 *
 * WHY THIS FILE EXISTS AT ALL. `.claude/skills/restructure-screens-css/references/rules.md`
 * rule 11 says to "ratchet the distinct-class count the way ratchets.json
 * ratchets game.js". docs/archive/research/UI-REMODEL-DECISION-2026-08.md
 * prescribed it concretely ("start at 538"). It was never installed — and
 * docs/research/STRUCTURE-REDECISION-2026-08.md §Q5 records the consequence as a
 * formal execution debt: with no test carrying a ceiling, the count crept
 * 538 -> 543 in five days while every suite stayed green. That is the exact
 * failure mode the size ratchet (tests/data/ratchets.json) was written for, in a different currency:
 * nobody did anything wrong, there was simply nothing that would notice.
 *
 * The class count is the repo's headline structural cost. Measured against Pico
 * CSS (a complete design system in 2,835 lines / 16 classes / 251 custom
 * properties), this repo ran ~7,800 lines / 543 classes / 75 properties at
 * the 2026-08 census (the ratchets below hold the LIVE numbers) —
 * 34x the classes on 2.8x the lines with 0.3x the tokens. SKILL.md rule 8's
 * answer is `--sheet-w`: one primitive class plus N one-line `--property`
 * contexts, which is already the shape used by fourteen dialogs here. Every
 * consolidation onto that shape lowers this number; LOWER THE CEILING WHEN IT
 * DOES, the same way you lower a size-ratchet ceiling after an extraction.
 *
 * The body-node ceiling is the second half, endorsed by STRUCTURE-REDECISION
 * §Q1's operational addendum. The split-index.html question was decided
 * UPHOLD (keep the monolith) on the grounds that the node count sits under
 * Lighthouse's ~1,400 error band — but it drifted 969 -> 1,133 over rule 13's
 * lifetime with nothing watching, and "the drift rate is the thing to watch".
 * A ceiling here does not forbid growth; it makes the growth a deliberate edit,
 * which is the whole mechanism.
 *
 * COUNTING METHOD IS THE SKILL'S OWN, DELIBERATELY. Both counts reproduce
 * SKILL.md's shell commands character-for-character:
 *
 *   grep -ohE '\.[a-zA-Z_-][a-zA-Z0-9_-]*' css/*.css | sort -u | wc -l   -> 543
 *   grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l                 -> 1133
 *
 * Both are approximations — the class grep does not strip comments, so a
 * `.sheet-foot` named in prose and a filename like `game.js` both land in the
 * set; the node grep counts every tag occurrence in the whole file including
 * `<script>` and closing-tag-free voids. A stricter parse would give different
 * numbers (952 body element nodes, for instance). That is fine and it is the
 * point: these are TREND instruments, and comparability with the 543 / 1,133
 * figures written into SKILL.md, UI-REMODEL-DECISION and STRUCTURE-REDECISION
 * is worth more than a purer number nobody can line up against the record.
 * If you improve the method, restate the baselines in all four places at once.
 *
 * Run: node --test tests/unit/css-class-ratchet.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** SKILL.md: grep -ohE '\.[a-zA-Z_-][a-zA-Z0-9_-]*' css/*.css | sort -u | wc -l */
export function classTokens() {
  const dir = path.join(ROOT, "css");
  const seen = new Set();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".css")).sort())
    for (const m of fs.readFileSync(path.join(dir, f), "utf8")
      .matchAll(/\.[a-zA-Z_-][a-zA-Z0-9_-]*/g)) seen.add(m[0]);
  return seen;
}

/** SKILL.md rule 13: grep -oE '<[a-zA-Z][a-zA-Z0-9-]*' index.html | wc -l —
 *  minus the <script>/<link> tags, which are a projection of tools/manifest.cjs
 *  (written by gen-shell) and not DOM the page renders; counting them made
 *  every new js file a ratchet edit. */
export function shellNodes() {
  return [...fs.readFileSync(path.join(ROOT, "index.html"), "utf8")
    .matchAll(/<([a-zA-Z][a-zA-Z0-9-]*)/g)].filter((m) => m[1] !== "script" && m[1] !== "link").length;
}

// LOWER THESE WHEN YOU CONSOLIDATE. Raising one is allowed — this is a ratchet,
// not a cap on doing work — but it must be a deliberate edit here with the
// reason in the commit message, which is the entire mechanism.
//
// 543 was the count at install time (STRUCTURE-REDECISION-2026-08 §Q5), and is
// the figure SKILL.md rule 8 quotes as "the whole finding".
// 541 after the mb-prefix family collapsed onto #mb-career / #mb-career-sub.
// 538 after the garage preview bar's two chip variants became --vb-fs / --vb-pad
// on the buttons' own ids, and .cs-cam-lbl (a duplicate of an inherited value)
// went entirely.
// 537 after .sel-section (one element, one declaration) became #sel-track-section.
// UI redesign: the one-off Last Race heading moved from a class to a stable ID.
// 536 → 534: unused .ui-panel / .ui-kicker / .ui-value / .ui-muted
// placeholders (no html/js consumer) removed from css/menus.css.
// 534 → 532: .menu-status-item / .menu-status-label left with the
// title-screen dashboard chrome.
// 532 → 534: ScrollFade's sideways "more this way" edges (.sf-l / .sf-r),
// the horizontal twin of the existing .sf-t / .sf-b pair. No new host class.
/* 535 (2026-08-26): +1 for .fit-managed — the opt-in marker that lets a
   non-.sheet card (the data hub's .dh-card) join SheetShape's classifyFit
   scan. It cannot be a custom property: the scan is a querySelectorAll and
   a MutationObserver classList test (js/game/sheetshape.js), both of which
   need a selector-addressable hook. */
/* 536 (2026-08-26): +1 for .sel-map-btn — the display:contents button that
   makes CIRCUIT DETAIL keyboard/gamepad-reachable (the door used to be a
   bare onclick on the preview canvas). It cannot reuse an existing family:
   the boxless wrapper needs its own focus-ring/hover rules that target the
   canvas inside it. */
// 2026-08-27 round 12: 536 -> 533. The live tab's row-main class folded into
// the standings' identical .dh-cons-main (the wrap floor became a context
// override on the class board), buying real headroom instead of sitting as
// a duplicate recipe.
// 2026-08-27 round 12 (second lowering): 533 -> 532. The camera panel's row
// class left the shell — its five rows are the panel's only direct div
// children, so the id scopes them without a class repeated five times.
// 2026-08-28: 532 -> 533. +1 for .cs-liv-pal, the strip of already-used colours
// under each livery colour row. It cannot be a custom property on a context
// selector (SKILL.md rule 8's usual answer): this is a NEW flex container with
// its own wrap behaviour, not a variation of an existing box. The chips inside
// it deliberately reuse .cs-liv-ed-none rather than adding a second class.
// 533 -> 534: body.rotate-ok, the RACE IN PORTRAIT opt-in. Reuses the
// existing rotate- family (rotate-inner/-icon/-help-open) so no new family.
const CLASS_CEILING = 534;

// 1,133 at install time. Lighthouse warns at ~800 nodes and errors at ~1,400;
// SKILL.md rule 13's ruling (do not split the shell) rests on staying under
// that error band, so this ceiling is where the ruling's premise is kept true.
// Growth points named by STRUCTURE-REDECISION §Q1: #advanced (106 nodes),
// #vsfriend (95).
// 1152 = the count MEASURED on the merged tree, not either lineage's arithmetic:
// the deploy branch and the season branch each raised this in parallel and both
// numbers are stale the moment they meet.
// 1160 = category-based Settings navigation: tab buttons + panels.
// Still well below 1,400. The PERF tab / PerfTry script were removed
// when those switches baked ON; NODE_CEILING stays a max, not a target.
// +3 2026-08-18: five How-to-Play landmark links and their labelled navigation
// replace the former undifferentiated long sheet without adding wrapper headings.
// +8 2026-08-18: Adaptive Buttons OFF/ON in Advanced → BUTTON INPUT (h3 +
// label + opt-row + two buttons + help). Reuses existing classes.
// +30 2026-08-18: How to Play CONTROLS grew a CONTROLLER row and accurate
// keyboard / phone / camera copy (key chips + the missing pad mapping).
// Still well under Lighthouse's ~1,400 error band.
// +10 2026-08-18: title-screen #menu-status season chips (3 items).
// +8 2026-08-18: Adaptive Buttons moved onto the simple sheet; BRAKE CUE
// slider + How-to-Play key chips + brake-cue.js script tag. Still under ~1400.
// −10 2026-08-18: #menu-status chips removed with the dashboard chrome.
// +1 2026-08-19: <script> block for iOS double-tap zoom cancel (gesturestart/
// touchend handlers). Needed for Safari which ignores viewport maximum-scale.
// +1 2026-08-19: four separate pm-metrics* buttons injected into DISPLAY panel.
// +2 2026-08-26: #sel-map-btn (the display:contents button making CIRCUIT
// DETAIL keyboard-reachable) + #sel-detail-chip (the fallback door on tiny
// sheets where the canvas is display:none — hiding it used to make the whole
// screen unreachable).
// +4 2026-08-26: #pm-hud-sample and its hud-box — the HUD SIZE slider's live
// sample; every real cluster is hidden while the settings sheet is open, so
// the slider had zero visible effect.
// +1 2026-08-27: the js/render/lamp-chunks.js script tag (new-file lockstep —
// the shared per-chunk lamp bake consumed by GLX and WGX).
// +8 2026-08-27: mode sublines on the title 2x2 (RACE / TIME TRIAL / RACE A
// FRIEND / SEASON each gain a stack span + sub span answering "what is
// this?"), the round-10 judged ask. The label itself is an anonymous flex
// item — no third span. Hidden at compact density, so the measured 390px
// landscape clearance is untouched.
// 1227 on the deploy union (both lineages' adds; re-measured per the
// deploy-merge rule).
// 1228 -> 1229: one <script> tag for js/perf/gfx-debug-overlay.js, the ?gfxdebug=1
// overlay. A node is the honest price of the only channel a player with no
// console has for telling us what their GPU did.
// 1234 -> 1238: +4 for the MY TEAM customizer's LOGO OUTLINE row (label +
// colour input + NONE button + their row div). The outline stopped sharing a
// picker with the mark's second SHAPE — on Red Bull that one row was labelled
// SUN DISC and moved a rim, which is the report this raise answers — so it
// needs a row of its own in both editors. The GARAGE editor builds its rows
// from LiveryTex.markSlots at runtime and costs the shell nothing; this dialog
// is static markup, and two editors disagreeing about a paint slot is worse
// than four nodes.
// 1238 -> 1239: the RACE IN PORTRAIT button in #rotate-device (PERF-FINDINGS
// 5a) — one node, and the opt-in it carries is what makes the portrait touch
// dock reachable at all.
// 1239 -> 1064 (2026-09-03): shellNodes() stopped counting <script>/<link> tags
// — they are a projection of tools/manifest.cjs written by gen-shell, not DOM
// the page renders, and counting them made every new js file a ratchet edit.
// 1059 real body nodes at the switch; 5 of headroom.
const NODE_CEILING = 1064;   // 1234 -> 1238 was the MY TEAM LOGO DETAIL row
// (label + colour input + NONE button + their row div). Raised deliberately:
// the livery editor grew a second logo colour and a paint slot the two editors
// disagree about is worse than four nodes — see js/car/liverytex.js secondSlot.
// +4 2026-08-13: title font preload links (measured ~126ms, CLS work) joined the
// shell in the deploy merge.
// +1 2026-08-13: the <script> tag for the renderer A/B switch module
// (measurable only on real hardware — later baked ON and deleted).
// +1 2026-08-13: the <script> tag for js/perf/quality-preset.js (GRAPHICS presets).
// A script tag, not UI markup — it adds nothing to the rendered tree Lighthouse's
// ~1,400 error band is about, and the feature itself reuses the EXISTING hidden
// #pm-gfx button rather than minting new controls, so the visible UI grew by zero
// nodes and css/ by zero classes.
// +1 2026-08-14: the <script> tag for js/camera/cockpit-opts.js (the opt-in
// cockpit HALO). Its SETTINGS button is injected at runtime and costs no shell
// node, exactly like PerfTry's — the tag itself is the whole +1.
// +12 2026-08-14: the SEASON calendar/format feature — two <script> tags
// (js/career/season-cal.js, js/career/season-ui.js) and 10 markup nodes for the whole
// #season-setup screen, because both of its panes are EMPTY and season-ui.js
// fills them (the shape #career established at index.html:438). It is also a
// <dialog>, so nothing but the head/foot is in the tree until it is opened, and
// its CUSTOMISE button is created in js/game/menus.js rather than sitting in the
// shell. The CLASS count did not move at all: every selector on the screen is an
// id scoping a class that already existed.
// 1140 (deploy) + 12 = 1152, still far under the ~1,400 error band the
// keep-the-monolith ruling rests on.
// +1 2026-08-18: <script> for js/perf/metrics-overlay.js (SETTINGS METRICS overlay).
// The button and <pre> are injected at runtime — the tag is the whole +1.
// +1 2026-08-28: <script> for js/game/garage-scene.js (the setup preview's pit
// bay — shell, props, team dress, light rig). All of it is geometry built in
// the module and drawn to the canvas, so again the tag is the whole +1.

test("the distinct CSS class count is not growing unnoticed", () => {
  const n = classTokens().size;
  assert.ok(n <= CLASS_CEILING,
    `css/ defines ${n} distinct class tokens, ceiling ${CLASS_CEILING} (+${n - CLASS_CEILING}).\n` +
    "Put the variation in a custom property on a context selector instead of a new class " +
    "(SKILL.md rule 8; `--sheet-w` in css/components.css is the worked template) — or raise " +
    "CLASS_CEILING in tests/unit/css-class-ratchet.test.mjs deliberately and say why in the commit.");
});

test("the shell's DOM node count stays under the Lighthouse error band", () => {
  const n = shellNodes();
  assert.ok(n <= NODE_CEILING,
    `index.html holds ${n} tag occurrences, ceiling ${NODE_CEILING} (+${n - NODE_CEILING}).\n` +
    "The ruling to keep index.html monolithic (SKILL.md rule 13, STRUCTURE-REDECISION §Q1) is " +
    "conditional on staying under Lighthouse's ~1,400 error band. Raise NODE_CEILING here " +
    "deliberately, or take the nodes out of the shell.");
});

// The other failure mode, straight out of the size ratchet: consolidate, never
// lower the ceiling, and the ratchet silently stops ratcheting. A ceiling sitting
// well above what it guards has lost its grip. The slack allowances are small on
// purpose — these counts move in ones and twos, not in hundreds like a line count.
test("neither ceiling is left slack above the count it guards", () => {
  const slack = [];
  const classes = classTokens().size;
  if (CLASS_CEILING - classes > 5)
    slack.push(`CLASS_CEILING is ${CLASS_CEILING} but css/ defines ${classes} — lower it`);
  const nodes = shellNodes();
  if (NODE_CEILING - nodes > 25)
    slack.push(`NODE_CEILING is ${NODE_CEILING} but index.html holds ${nodes} — lower it`);
  assert.deepEqual(slack, [],
    "a ceiling drifted above the count it guards — lower it so the ratchet keeps working");
});
