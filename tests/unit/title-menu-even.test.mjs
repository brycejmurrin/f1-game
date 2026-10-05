/* title-menu-even.test.mjs — title doors stay even without px-capped columns. */
import { readCssSource } from "../helpers/css-source.mjs";
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");

test("title 2-up rows share equal flex cells and fill them", () => {
  const menus = readCssSource("css/menus.css");
  assert.match(menus, /#menu-primary\s*\{[^}]*--balance-min:\s*calc\(50%/);
  assert.match(menus, /#menu-secondary\s*\{[^}]*--balance-basis:\s*5\.5rem/);
  assert.match(menus, /#menu-explore\s*\{[^}]*--balance-basis:\s*7rem/);
  assert.match(menus, /#menu-primary, #menu-explore, #menu-secondary\s*\{[^}]*gap:\s*calc\(var\(--gap\) \* 0\.7\)/);
  assert.match(
    menus,
    /#menu-buttons :is\(#menu-primary, #menu-explore, #menu-secondary\)\.balanced-row > \.bigbtn \{ width: 100%/,
  );
  assert.doesNotMatch(
    menus,
    /#menu-buttons :is\(#menu-primary, #menu-explore, #menu-secondary\)\.balanced-row > \.bigbtn \{ width: auto/,
  );
  assert.match(menus, /#menu-buttons \.bigbtn \{[^}]*border-width:\s*1px/);
});

test("compact landscape title doors fit without a nested scroller", () => {
  const menus = readCssSource("css/menus.css");
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-buttons \{[^}]*gap:\s*calc\(var\(--gap\) \* 0\.35\)/,
    "compact-wide title stack is tighter than the desktop 0.9 gap",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-buttons \.bigbtn \{[^}]*min-height:\s*max\(32px, var\(--tap-min\)\)/,
    "play doors drop from --tap (52 on touch) so CAREER + 2×2 + rooms clear 343px",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-secondary \.minibtn \{[^}]*min-height:\s*max\(26px, var\(--tap-min\)\)/,
    "rooms sit one step below the play doors",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\[data-density="compact"\]\) :is\(#menu-primary, #menu-explore, #menu-secondary\) \{[^}]*gap:\s*calc\(var\(--gap\) \* 0\.45\)/,
    "2-up rows also tighten on the short landscape column",
  );
});

test("tall title leftover-row is not gated on compact density", () => {
  const menus = readCssSource("css/menus.css");
  // A 393×844 phone is tall and still above --compact-at (600). The
  // leftover-row used to require both, so secondaries sat under the fold
  // with no working parent scroller.
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #overlay \{[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\)/,
    "every tall title hands leftover height to the door column",
  );
  assert.doesNotMatch(
    menus,
    /body\[data-shape="tall"\]\[data-density="compact"\]\) #overlay \{[^}]*grid-template-rows/,
    "leftover-row must not still require compact",
  );
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #menu-buttons \{[^}]*overflow-y:\s*auto/,
    "the leftover column itself scrolls — #overlay overflow is a dead letter",
  );
});

test("title overlay columns grow with --vwz instead of a pixel cap", () => {
  const menus = readCssSource("css/menus.css");
  const responsive = read("css/responsive.css");
  assert.match(menus, /#menu-hero, #menu-primary, #menu-explore, #menu-secondary \{ width: min\(calc\(78 \* var\(--vwz\)\), 100%\)/);
  assert.match(menus, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.match(menus, /body\[data-shape="wide"\]\[data-density="compact"\]\) #menu-brand,[\s\S]*?width:\s*100%/,
    "landscape compact title fills its 1fr tracks (no 42vwz shrink)");
  assert.doesNotMatch(menus, /min\(calc\(42 \* var\(--vwz\)\), 300px\)/);
  assert.doesNotMatch(menus, /42 \* var\(--vwz\)/);
  assert.match(responsive, /32 \* var\(--vwz\)/);
  assert.doesNotMatch(responsive, /clamp\(320px, calc\(24 \* var\(--vwz\)\), 420px\)/);
  assert.doesNotMatch(menus, /minmax\(0, 1\.35fr\)/);
  assert.doesNotMatch(menus, /43vw|53vw/);
});

test("title hero exposes returning-player and daily doors with explicit names", () => {
  const html = read("index.html");
  const title = read("js/ui/title-menu.js");
  assert.match(html, /id="menu-retention"[\s\S]*id="mb-continue"[\s\S]*id="mb-daily"/);
  for (const id of ["mb-career", "mb-race", "mb-tt", "mb-vs", "mb-season"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-label="[^"]+"`), `${id} has a readable name independent of text-node spacing`);
  }
  assert.match(title, /const careerBtn = \$\("mb-career"\)[\s\S]*if \(careerBtn\) careerBtn\.onclick/,
    "optional retention nodes cannot prevent the existing Career door wiring");
  assert.match(title, /const continueBtn = \$\("mb-continue"\)[\s\S]*if \(continueBtn\) continueBtn\.onclick/);
  assert.match(title, /const dailyBtn = \$\("mb-daily"\)[\s\S]*if \(dailyBtn\) dailyBtn\.onclick/);
  assert.doesNotMatch(title, /\$\("mb-tt"\)\.click\(\)/,
    "Daily does not enter through free-play restore and its speculative flyby");
  assert.match(title, /G\.openDailyPicker\(\)/, "the title uses the dedicated staged-daily picker path");
  assert.match(title, /dailySub\.textContent = p\.trackName[\s\S]*STREAK/);
  assert.match(read("js/race/daily-challenge.js"), /Log\.info\("game", "DailyChallenge\.select "/);
});

test("title scrollers never paint a ScrollFade thumb", () => {
  // #472 hid the thumb on #overlay; the real title scroller is #menu-buttons
  // (zoom rides `#overlay > *`). A 6px accent thumb with no sheet-body padding
  // lane clipped CAREER / DAILY labels on a narrow landscape column.
  const css = readCssSource("css/components.css");
  assert.match(css, /#overlay\.sf-scroll::before,\s*#menu-buttons\.sf-scroll::before\s*\{\s*display:\s*none/,
    "both title scrollers hide the thumb; fades still say there is more");
});

test("narrow title column hides the native bar and reserves a tap under the last door", () => {
  // Live survey ~500px: #menu-buttons is the leftover-row scroller. A light
  // native thumb sat on the doors, and HOW TO PLAY / GARAGE died under
  // ANIMATE BACKGROUND + INSTALL APP with no scroll padding.
  const menus = readCssSource("css/menus.css");
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #menu-buttons \{[^}]*scrollbar-width:\s*none/,
    "tall leftover column hides the native bar; ScrollFade fades still say more",
  );
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #menu-buttons \{[^}]*scroll-padding-bottom:\s*calc\(var\(--tap\) \+ var\(--gap\)\)/,
    "scroll-padding keeps the last utility on the --tap floor above bottom chrome",
  );
  assert.match(
    menus,
    /body\[data-shape="tall"\]\) #menu-buttons \{[^}]*padding-bottom:\s*calc\(var\(--tap\) \+ var\(--gap\)\)/,
    "padding-bottom lets HOW TO PLAY scroll fully into the leftover row",
  );
  assert.match(
    menus,
    /has\(#home-motion:not\(\[hidden\]\)\):has\(#install-chip:not\(\[hidden\]\)\) #overlay #menu-buttons/,
    "two bottom chips share one :has so INSTALL cannot cover the last door",
  );
  assert.match(
    menus,
    /padding-bottom:\s*calc\(\(var\(--tap\) \+ var\(--gap\)\) \* 2\)/,
    "two chips reserve a second --tap under the leftover column",
  );
});

test("CONTINUE + Daily stack the save line under the label, not beside it", () => {
  // A Driver Career save unhides CONTINUE next to Daily. The pair used a
  // row flex + nowrap ellipsis, so desktop painted "2026 · ROU…" and
  // "MONTREA…" once each chip was half a column (survey 2026-10-05).
  // Compact-wide already stacked; the base rule must, or a returning
  // save truncates on every non-compact title.
  const menus = readCssSource("css/menus.css");
  assert.match(
    menus,
    /#menu-retention \.bigbtn \{[^}]*flex-direction:\s*column/,
    "retention chips stack label over sub on every title shape",
  );
  assert.match(
    menus,
    /#menu-retention \.mb-sub \{[^}]*white-space:\s*normal/,
    "the save line wraps ROUND + circuit instead of ellipsising to ROU…",
  );
  assert.match(
    menus,
    /#menu-retention \.mb-sub \{[^}]*max-width:\s*100%/,
    "the save line gets the chip's full width so ROUND / Montreal are not squeezed beside the label",
  );
  assert.match(
    menus,
    /#menu-retention \.bigbtn > span \{[^}]*max-width:\s*100%/,
    "the visible label also cannot spill the cell",
  );
});

test("mid-wide title rooms keep one-line labels and air under the utility row", () => {
  // apex9 ~752–768px: 5-across rooms wrapped TRACK DESIGNER / HOW TO PLAY
  // onto two lines while DATA HUB stayed one; WATCH REAL RACES wrapped
  // inside its tile; the row sat flush on the viewport floor.
  const menus = readCssSource("css/menus.css");
  assert.match(
    menus,
    /#menu-buttons :is\(#menu-primary, #menu-explore, #menu-secondary\)\.balanced-row > \.bigbtn \{ min-width: min-content/,
    "rooms wrap the leftover door, not the label, once TRACK DESIGNER no longer fits",
  );
  assert.match(
    menus,
    /#menu-buttons :is\(#menu-explore, #menu-secondary\) \.bigbtn \{ white-space: nowrap/,
    "WATCH REAL RACES / TRACK DESIGNER / HOW TO PLAY stay one line",
  );
  assert.match(
    menus,
    /body\[data-shape="wide"\]\) #overlay #menu-buttons \{[^}]*padding-bottom:\s*calc\(var\(--tap\) \+ var\(--gap\)\)/,
    "wide title keeps --tap air under the utility row",
  );
});

test("tall Classic docks ANIMATE BACKGROUND to the bottom, not under the wordmark", () => {
  // Live-scene rules used :not([data-home-scene="static"]), so Classic
  // left #home-motion at top-left under APEX 26. Narrow Classic then
  // hid INSTALL/ANIMATE entirely (survey apex6, ~500px).
  const experience = readCssSource("css/experience.css");
  assert.match(
    experience,
    /body\[data-shape="tall"\]\) #home-motion \{[^}]*bottom:\s*var\(--safe-b\)/,
    "tall title docks the motion chip to the safe bottom even on Classic/static",
  );
  assert.doesNotMatch(
    experience,
    /body\[data-shape="tall"\]\) #overlay\[data-home-scene\]:not\(\[data-home-scene="static"\]\) #home-motion/,
    "must not still require a live scene before the chip leaves the wordmark",
  );
});

test("INSTALL APP lifts one tap when ANIMATE BACKGROUND is showing", () => {
  const overlays = readCssSource("css/overlays.css");
  assert.match(
    overlays,
    /#home-motion:not\(\[hidden\]\)\)[^{]*#install-chip \{[^}]*bottom:\s*calc\(var\(--safe-b\) \+ var\(--tap\) \+ var\(--gap\)\)/,
    "fixed INSTALL APP sits one --tap above the live-scene toggle, not on top of it",
  );
  // experience.css's live-scene padding shorthand is @layer overlays; a
  // components-layer inset loses. The restore has to live in this sheet.
  assert.match(
    overlays,
    /#overlay\[data-home-scene\]:not\(\[data-home-scene="static"\]\) #menu-buttons \{[^}]*padding-bottom:\s*calc\(var\(--tap\) \+ var\(--gap\)\)/,
    "live-scene leftover column keeps --tap padding in the overlays layer",
  );
});

// WCAG 2.5.3 (label in name). Lighthouse's label-content-name-mismatch failed all
// six title doors (2026-10-05): "DAILY TIME TRIAL" was named "Daily challenge —",
// "2–4" was named "2 to 4", and the label and its sub-line abutted with no space
// ("RACEONE GRAND PRIX"), so no accessible name could contain the visible text.
// Normalised the way axe does: case-folded, punctuation dropped, whitespace joined.
const norm = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const visibleText = (html) => html.replace(/<svg[\s\S]*?<\/svg>/g, "")
  .replace(/<[^>]+>/g, "").replace(/&ndash;/g, "–").replace(/&middot;/g, "·").replace(/&amp;/g, "&");

test("title doors: the accessible name contains the visible label", () => {
  const html = read("index.html");
  for (const id of ["mb-career", "mb-race", "mb-tt", "mb-vs", "mb-season"]) {
    const m = new RegExp(`<button id="${id}"[^>]*aria-label="([^"]*)"[^>]*>([\\s\\S]*?)</button>`).exec(html);
    assert.ok(m, `#${id} has a static aria-label`);
    assert.ok(norm(m[1]).includes(norm(visibleText(m[2]))),
      `#${id}: name "${m[1]}" must contain visible text "${visibleText(m[2]).trim()}"`);
  }
});

test("title doors: the label and its sub-line are separated by a space, never abutting", () => {
  const html = read("index.html");
  for (const id of ["mb-career", "mb-daily", "mb-continue", "mb-race", "mb-tt", "mb-vs", "mb-season"]) {
    const m = new RegExp(`<button id="${id}"[^>]*>([\\s\\S]*?)</button>`).exec(html);
    assert.ok(m, `#${id} exists in the shell`);
    assert.doesNotMatch(m[1].replace(/<svg[\s\S]*?<\/svg>/g, ""), /[^\s>]<span[^>]*mb-[a-z-]*sub|<\/span><span[^>]*mb-[a-z-]*sub/,
      `#${id}: a bare "LABEL<span class=mb-sub>" reads as one word ("RACEONE GRAND PRIX")`);
  }
});

test("title menu: the doors the script re-names start with their visible label", () => {
  const js = read("js/ui/title-menu.js");
  assert.match(js, /"Career modes — " \+ sub\.textContent/);
  assert.match(js, /"Daily time trial — " \+ dailySub\.textContent/, "the visible label is DAILY TIME TRIAL, not 'Daily challenge'");
  assert.match(js, /"Continue — " \+ contSub\.textContent/, "the visible label is CONTINUE");
  assert.doesNotMatch(js, /Daily challenge — |Continue career — /);
  // the shell's own label is what the script writes, so there is no first-paint flip
  assert.match(read("index.html"), /<span class="mb-label">CAREER MODES<\/span>/);
});
