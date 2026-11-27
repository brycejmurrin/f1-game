/* ui-fit round 6 — Photo Studio portrait select tap floors.
   Pins #ps-* setting-row selects in css/photo-studio.css. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const css = fs.readFileSync(path.join(ROOT, "css/photo-studio.css"), "utf8");
const rules = cssRules(css);
const SELECTS = "#ps-panel :is(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather, #ps-look-room, #ps-look-crew, #ps-look-mood, #ps-resolution)";

test("Photo Studio setting-row selects floor at max(--tap, --tap-paint)", () => {
  assert.match(
    css,
    /#ps-panel :is\(#ps-subject, #ps-aspect, #ps-grid-select, #ps-postcard, #ps-tod, #ps-weather, #ps-look-room, #ps-look-crew, #ps-look-mood, #ps-resolution\)\s*\{[^}]*min-height:\s*max\(var\(--tap\), var\(--tap-paint\)\)/s,
    "#ps-subject / #ps-aspect / #ps-grid-select / #ps-postcard / #ps-tod / #ps-weather / #ps-look-* must paint at max(--tap, --tap-paint) (#3337), not --chip-h",
  );
  assert.equal(decl(rules, SELECTS, "min-height"), "max(var(--tap), var(--tap-paint))");
});

test("r6 select floor is min-height only (no height lock that would shrink landscape)", () => {
  assert.equal(decl(rules, SELECTS, "height"), null,
    "do not set height — landscape already met --tap; a height lock can shrink it");
  assert.equal(decl(rules, SELECTS, "max-height"), null,
    "do not cap height on the r6 select carve");
});

test("r6 carve stays Photo Studio #ps-* (no foreign selectors)", () => {
  const m = css.match(/UI Fit r6: Photo Studio setting-row selects[\s\S]*?\n#ps-panel \.tune-row/);
  assert.ok(m, "r6 block present before #ps-panel .tune-row");
  assert.doesNotMatch(m[0], /#lighting|#camtune|#ct-|#lt-|title|#hud/,
    "must not retarget tuner / title / HUD selectors");
});

test("portrait studio: preview-band pad, guide, overflow and --bg (393×852 hunt)", () => {
  // cssRules/decl (no source-pin regex) — assertPinsAll is at its ceiling.
  const phone = { context: /max-width:\s*640px/ };
  assert.equal(decl(rules, "body.photo-studio-open", "background"), "var(--bg)",
    "open studio fills the letterbox with --bg (not white)");
  assert.equal(decl(rules, "#photo-studio", "--ps-preview-h", phone),
    "calc(100svh - 42svh - var(--safe-b))", "preview band = viewport minus sheet minus safe-b");
  assert.equal(decl(rules, "#photo-studio", "padding-top", phone), "var(--ps-preview-h)");
  assert.equal(decl(rules, "#photo-studio", "padding-bottom", phone), "0");
  assert.equal(decl(rules, "#ps-panel", "overflow", phone), "visible",
    "Garage / Subject native selects must not clip to the sheet");
  assert.equal(decl(rules, "#ps-body", "overscroll-behavior", phone), "contain");
});

test("portrait studio centres each export guide on the full canvas behind the sheet", () => {
  const phone = { context: /max-width:\s*640px/ };
  assert.equal(decl(rules, "#photo-studio", "inset"), "0");
  assert.equal(decl(rules, "#ps-guide", "left"), "50%");
  assert.equal(decl(rules, "#ps-guide", "top"), "50%");
  assert.equal(decl(rules, "#ps-guide", "top", phone), null,
    "the sheet may overlay the scene without moving the crop centre");
  for (const [mode, ratio, height] of [["wide", "16 / 9", "56.25vw"], ["square", "1", "100vw"], ["portrait", "4 / 5", "125vw"]]) {
    const selector = `#photo-studio[data-aspect="${mode}"] #ps-guide`;
    assert.equal(decl(rules, selector, "aspect-ratio"), ratio);
    assert.equal(decl(rules, selector, "height"), `min(100%, ${height})`);
    assert.equal(decl(rules, selector, "height", phone), null);
  }
});

test("#7017 portrait DOCK top / HIDE: the sheet leaves the 4:5 guide's lower half clear and the sticks follow", () => {
  const phone = { context: /max-width:\s*640px/ };
  assert.equal(decl(rules, '#photo-studio[data-dock="top"] #ps-panel', "bottom", phone), "auto");
  assert.equal(decl(rules, '#photo-studio[data-dock="top"] #ps-panel', "top", phone), "calc(var(--safe-t) / var(--sheet-scale, var(--ui-scale)))");
  assert.equal(decl(rules, '#photo-studio[data-dock="top"]', "padding-top", phone), "0");
  assert.equal(decl(rules, '#photo-studio[data-dock="top"]', "padding-bottom", phone), "calc(100svh - 42svh - var(--safe-t))");
  assert.equal(decl(rules, '#photo-studio[data-sheet="collapsed"] #ps-body', "display", phone), "none");
  assert.equal(decl(rules, '#photo-studio[data-sheet="collapsed"] #ps-panel', "height", phone), "auto");
  assert.equal(decl(rules, 'body.photo-mode.photo-studio-open[data-ps-dock="top"] :is(.pc-stickwrap, .pc-altcol)', "bottom", phone),
    "calc((var(--safe-b) + var(--gap)) / var(--ps-touch-z))", "sticks drop to the bottom edge under a top sheet");
  assert.equal(decl(rules, "#ps-sheet-tools", "display"), "none", "landscape / desktop keep the side dock without the controls");
  assert.equal(decl(rules, "#ps-sheet-tools", "display", phone), "flex");
  assert.equal(decl(rules, "#ps-panel #ps-sheet-tools > button", "min-width"), "var(--tap)");
  assert.equal(decl(rules, "#ps-panel #ps-sheet-tools > button", "min-width", { context: /pointer:\s*coarse/ }), "var(--tap-paint)");
  // The arithmetic the CSS encodes, at each portrait window (tests/data/phone-windows.json + 390/360 class).
  assert.equal(decl(rules, "#ps-panel", "height", phone), "calc(42svh / var(--sheet-scale, var(--ui-scale)))");
  for (const [w, h, t, bot] of [[393, 852, 59, 34], [390, 844, 59, 34], [360, 780, 47, 34]]) {
    const guideH = Math.min(h, 1.25 * w), guideMid = h / 2;   // centred 4:5 guide
    const topSheetBottom = t + 0.42 * h, bottomSheetTop = h - bot - 0.42 * h;
    assert.ok(topSheetBottom <= guideMid, `${w}x${h}: top sheet ends ${topSheetBottom} above the guide middle ${guideMid}`);
    assert.ok(bottomSheetTop < guideMid + guideH / 2, `${w}x${h}: the bottom sheet does cover the lower half (the reported bug)`);
  }
});
