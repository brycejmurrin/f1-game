/* settings-one-home.test.mjs — one setting, one control, one name (UI audit
 * 2026-10-18, issues #2843 #2845 #2846). A second mention of a setting is a
 * JUMP (data-settings-jump="<page>" data-jump-target="<id>", wired in
 * js/ui/settings-tabs.js) to its one home, never a second live copy; rows that
 * sit together never share a label. Run: node --test tests/unit/settings-one-home.test.mjs
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const SHELL = read("index.html");
const TABS = read("js/ui/settings-tabs.js");

test("TILT SENSITIVITY has one control: ADVANCED jumps to FEEL instead of a second tiltDeg slider", () => {
  assert.doesNotMatch(SHELL, /id="pm-tiltdeg"/, "ADVANCED › TILT RANGE was a second slider on tiltDeg");
  assert.match(SHELL, /id="pm-tiltsimple"[^>]*type="range"/, "FEEL › TILT SENSITIVITY stays the home");
  assert.match(SHELL, /id="pm-tiltdeg-jump"[^>]*data-settings-jump="controls"[^>]*data-jump-target="pm-tiltsimple"/);
});

test("every settings jump names a real route and an existing control", () => {
  const jumps = [...SHELL.matchAll(/data-settings-jump="([^"]+)"[^>]*data-jump-target="([^"]+)"/g)];
  assert.ok(jumps.length > 0, "no jumps found: the scan is vacuous");
  for (const [, page, target] of jumps) {
    assert.match(TABS, new RegExp(`\\b${page}: Object\\.freeze\\(`), `jump to unknown settings page "${page}"`);
    assert.match(SHELL, new RegExp(`id="${target}"`), `jump target #${target} does not exist`);
  }
  assert.match(TABS, /closest\("\[data-settings-jump\]"\)/, "settings-tabs.js no longer wires the jump");
});

test("MUSIC & SOUND rows never share a label (two VOLUMEs; a layer's level and its switch)", () => {
  const start = SHELL.indexOf('id="audioset"');
  const panel = SHELL.slice(start, SHELL.indexOf("</section>", start));
  const labels = [...panel.matchAll(/<span class="tune-label">([^<]+?)\s*<b/g)].map((m) => m[1].trim());
  const pills = [...panel.matchAll(/id="as-l-[a-z]+"[^>]*>([^<]+)</g)].map((m) => m[1].trim());
  const seen = new Set();
  for (const l of labels) {
    assert.ok(!seen.has(l), `two sound rows are both labelled "${l}"`);
    seen.add(l);
    assert.ok(!pills.includes(l), `the "${l}" slider and the ${l} layer switch share one word`);
  }
});

test("Appearance Studio names its two accent colours apart", () => {
  const src = read("js/ui/appearance-studio.js");
  assert.doesNotMatch(src, /colour\((menu|hud), "Accent colour"/, "menu and HUD accent both read \"Accent colour\"");
});

test("DRIVING HELP and STEER ASSIST: one name each, the FINE sliders and their DRIVING AIDS rows jump to each other", () => {
  assert.match(SHELL, /DRIVING HELP · FINE <b id="pm-help-v">/);
  assert.match(SHELL, /STEER ASSIST · FINE <b id="pm-line-v">/);
  assert.doesNotMatch(SHELL, />RACING LINE <b id="pm-line-v">/, "one setting, two names (RACING LINE vs STEER ASSIST)");
  for (const [from, page, to] of [["pm-help-jump", "driving", "pm-helplevel-sel"], ["pm-line-jump", "driving", "pm-linemode-sel"],
    ["pm-helplevel-jump", "advanced", "pm-help"], ["pm-linemode-jump", "advanced", "pm-line"]]) {
    assert.match(SHELL, new RegExp(`id="${from}"[^>]*data-settings-jump="${page}"[^>]*data-jump-target="${to}"`), `${from} → ${page} #${to}`);
  }
});
