/* Painted floors for Bryce's UI SIZE 70 (the UI matrix survey of 2026-11-25 on draft PR #6434, rows 5-6).
   At his 70 % (tests/data/settings-live-export-2026-11-10.json) these elements painted text under 12 px and taps
   under 44 px. Each fix is a max() arm on the ONE winning declaration, so every size at UI SIZE 75-85 % and up, and
   every mouse layout, is what it was; only the small touch sizes rise to the floor. Measured live with
   tools/lib/paint-floor.mjs (layout-audit `paint:` lines); this test pins the declarations so a later edit cannot
   drop an arm silently. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, rulesFor, declares } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rules = (f) => cssRules(fs.readFileSync(path.join(ROOT, f), "utf8"));
const has = (f, sel, prop, value, why) => assert.ok(declares(rules(f), sel, prop, value), `${f} ${sel} { ${prop} } — ${why}`);

test("--tap-floor44: 0 with a mouse, 44.2 painted on touch", () => {
  const r = rules("css/overlays.css");
  assert.ok(declares(r, ":root", "--tap-floor44", "0px"), ":root arm is 0 so a desktop max() is unchanged");
  assert.ok(declares(r, "body:not(.desktop)", "--tap-floor44", "calc(44.2px / var(--ui-scale))"),
    "touch arm: 44.2 own px / --ui-scale (44 / 0.7 paints 43.98, #5358)");
  assert.ok(declares(rules("css/tokens.css"), ":root", "--fs-floor", "calc(12px / var(--ui-scale, 1))"), "the 12 painted px text floor");
});

test("text floors: 12 painted px at UI SIZE 70 (row 5)", () => {
  has("css/career.css", "#quali .res-row", "font-size", "max(1em, var(--fs-floor))", "quali names 11.2 px");
  assert.ok(rulesFor(rules("css/overlays.css"), "#pausemenu .sheet-body > button", { context: /@layer base/ })
    .some((r) => r.decls.get("font-size") === "max(1em, var(--fs-floor))"), "pause doors 11.2 px, floored as a DEFAULT");
  assert.ok(!rulesFor(rules("css/overlays.css"), "#pausemenu .sheet-body > button").some((r) =>
    r.decls.has("font-size") && !r.context.some((c) => /@layer base/.test(c))),
  "outside `base` it outranks #pm-resume's --fs-5 (components) and shrinks RESUME at every size");
  assert.ok(declares(rules("css/dialogs.css"), "#pm-resume", "font-size", "var(--fs-5)"), "the rule the base floor must not shadow");
  assert.ok(rulesFor(rules("css/overlays.css"), /#pm-quick-doors > details$/).some((r) =>
    /^max\(calc\(var\(--fs-micro\) \* 0\.92\), var\(--fs-floor\)\)$/.test(r.decls.get("font-size") || "")),
  "pause tray step-down keeps the 0.92 notch above the floor (11.04 px)");
  assert.ok(rulesFor(rules("css/experience.css"), /#menu-brand #disclaimer$/, { context: /@layer layout/ }).some((r) =>
    /^max\(calc\(var\(--fs-micro\) \* \.52 \* var\(--ui-compact-brand-text, 1\)\), var\(--brand-fs-floor\)\)$/.test(r.decls.get("font-size") || "")),
  "title disclaimer (8.9 px): floored by the brand zoom, in `layout` to beat `responsive`");
  assert.ok(rulesFor(rules("css/experience.css"), /#menu-brand #soundbtn$/, { context: /@layer layout/ }).some((r) =>
    /^max\(calc\(var\(--fs-micro\) \* \.6 \* var\(--ui-compact-brand-text, 1\)\), var\(--brand-fs-floor\)\)$/.test(r.decls.get("font-size") || "")),
  "title SOUND (10.3 px): same brand floor");
  assert.ok(declares(rules("css/experience.css"), /#menu-brand$/, "--brand-fs-floor",
    "calc(12px / var(--tl-title-size, 1) / var(--tf, 1))"),
  "the brand zooms by TITLE SIZE x fit, so its floor divides by that; ungated (#6512): the shipped 109 % phone painted 9.07 px");
  const MQ = /@media \(max-height: 519px\) and \(min-aspect-ratio: 1\/1\)/;
  const ctxOf = (f, layer) => rulesFor(rules(f), /#menu-brand #(disclaimer|soundbtn)$/, { context: layer })
    .filter((r) => r.decls.has("font-size")).map((r) => r.context.find((c) => /^@media/.test(c)));
  assert.ok(ctxOf("css/menu-destinations.css", /@layer responsive/).some((c) => MQ.test(c || "")), "the floored rule's own query");
  assert.ok(ctxOf("css/experience.css", /@layer layout/).every((c) => MQ.test(c || "")),
    "the floor sits in the SAME query: unconditional, it beat the desktop clamp() and painted 9.6 px on a MacBook");
  for (const id of ["#cs-team", "#cs-budget"]) has("css/carsetup.css", id, "font-size", "max(var(--label), var(--fs-floor))", "garage 9.8 px");
});

test("tap floors: 44 painted px on touch (row 6)", () => {
  has("css/data.css", ".dh-pill", "min-width", "max(var(--tap-min), var(--tap-floor44))", "data-hub year pills 38 px wide");
  has("css/race-setup.css", '#customize input[type="color"]', "width", "max(48px, var(--tap-min), var(--tap-floor44))", "colour wells 33.6 px");
  has("css/tuner.css", ".lt-preview-row .opt-btn", "min-width", "max(42px, var(--tap-min), var(--tap-floor44))", "tuner chips");
  assert.ok(rulesFor(rules("css/tuner.css"), /\[data-density="compact"\] \.lt-preview-row \.opt-btn$/).some((r) =>
    r.decls.get("min-width") === "max(34px, var(--tap-min), var(--tap-floor44))"),
  "compact tuner chips: lighting TIME/WEATHER 34.8 px, camera PRESET 32.6 px");
  has("css/settings.css", "#pm-panel-credits a", "padding-block", "max(0em, calc((max(var(--tap-floor44), var(--tap-min)) - 1em) / 2))",
    "credits links 19 px tall: inline padding grows the hit box, not the line");
  has("css/settings.css", "#pm-panel-credits a", "margin-inline", "calc(var(--tap-floor44) * -0.12)",
    "the inline pad is cancelled by an equal negative margin, so the text does not move");
  has("css/settings.css", "#pm-panel-credits li", "min-height", "var(--tap-floor44)",
    "a one-line item is a whole hit box tall, so the next link's padding does not cover this one");
});

test("credits links keep a 24 painted px hit floor with a mouse (#6461 row 8)", () => {
  const d = rulesFor(rules("css/settings.css"), /^#pm-panel-credits a$/).map((r) => r.decls.get("padding-block")).find(Boolean);
  assert.ok((d || "").includes("var(--tap-min)"), "fine-pointer arm exists (--tap-min = max(24px, 24px / ui-scale))");
  // CSS arithmetic at the MacBook's UI SIZE 115: --tap-floor44 is 0 with a mouse; micro font ~ 11 own px.
  const scale = 1.15, font = 11, floor = Math.max(24, 24 / scale);
  const hit = (font + 2 * Math.max(0, (floor - font) / 2)) * scale;
  assert.ok(hit >= 24 - 1e-9, `hit ${hit} px >= 24`);
});

test("the dh-pill floor comes after the shared chip rule that also sets min-width", () => {
  const r = rules("css/data.css");
  const idx = (pred) => r.findIndex(pred);
  const shared = idx((x) => /^\.dh-pill, \.dh-dchip/.test(x.selector) && x.decls.has("min-width"));
  const floor = idx((x) => x.selector === ".dh-pill" && /tap-floor44/.test(x.decls.get("min-width") || ""));
  assert.ok(shared >= 0 && floor > shared, "same specificity: the floor must be the later rule");
});
