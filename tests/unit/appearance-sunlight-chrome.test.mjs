/* appearance-sunlight-chrome.test.mjs — Sunlight / Broadcast preset chrome.
 *
 * Live survey (Settings → Appearance under Sunlight): preset labels overflow
 * tiles (BROADCAST / SUNLIGHT), selected state vanishes at ~125% zoom when the
 * sunlight art goes near-black (it read --text/--dim, which LIGHT remaps),
 * gold ON fails on light plates, and .sheet-foot stays a dark gradient.
 *
 * Pins the CSS contracts; runtime paint is css-play / browser.
 *
 * Run: node --test tests/unit/appearance-sunlight-chrome.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
const tokens = cssRules(read("css/tokens.css"));
const studio = cssRules(read("css/appearance-studio.css"));

test("LIGHT remaps --gold to a dark amber and race chrome restates bright gold", () => {
  assert.equal(decl(tokens, ':root[data-ui-theme="light"]', "--gold"), "#7a5600",
    "Sound ON / fold ON must clear ~4.5:1 on light plates");
  assert.equal(decl(tokens, ":is(#hud, #announce, #game-metrics)", "--gold"), "#ffd700",
    "LIGHT gold must not leak onto dark race chrome");
  const sys = ruleFor(tokens, ':root[data-ui-theme="system"]');
  assert.ok(sys && sys.decls.get("--gold") === "#7a5600",
    "SYSTEM-light copies the same readable gold");
});

test("LIGHT themes the shared sheet-foot away from the hard-coded dark gradient", () => {
  const foot = decl(tokens, ':root[data-ui-theme="light"] .sheet-foot', "background");
  assert.ok(foot && foot.includes("var(--surf-1)") && foot.includes("var(--surf-3)"),
    "Sunlight Settings BACK must sit on a light surface ladder, not rgba(8,8,13)");
  assert.ok(!/rgba\(\s*8\s*,\s*8\s*,\s*13/.test(foot),
    "light foot must not keep the dark plate literal");
});

test("preset tiles wrap long labels and keep a visible selected ring", () => {
  assert.match(decl(studio, '#appearance-studio [data-as="preset-list"] strong', "overflow-wrap") || "",
    /anywhere/, "BROADCAST / SUNLIGHT must wrap inside the tile");
  assert.match(decl(studio, '#appearance-studio [data-as="preset-list"] strong', "font-size") || "",
    /em/, "preset labels scale from the button, not --fs-micro under Sunlight large text");
  assert.equal(decl(studio, '#appearance-studio [data-as="preset-list"] button', "overflow"), "hidden");
  const pressed = decl(studio, '#appearance-studio [data-as="preset-list"] button[aria-pressed="true"]', "border-color");
  assert.equal(pressed, "var(--red)", "selected preset keeps a red ring at zoom");
  assert.equal(
    decl(studio, '#appearance-studio [data-as="preset-list"] button[aria-pressed="true"]', "border-width"),
    "2px");
});

test("sunlight / broadcast preset art is theme-stable (not --text/--dim)", () => {
  const sun = decl(studio, '#appearance-studio [data-preset="sunlight"] [data-as="preset-art"]', "background-image");
  assert.ok(sun && !sun.includes("var(--text)") && !sun.includes("var(--dim)"),
    "sunlight swatch must not go near-black when LIGHT remaps --text/--dim");
  assert.match(sun || "", /--look-sunlight/, "sunlight art uses theme-stable look tokens");
  assert.equal(decl(tokens, ":root", "--look-sunlight-hi"), "#f7e7a4");
  assert.equal(decl(tokens, ":root", "--look-sunlight-lo"), "#e0b84a");
  assert.equal(decl(tokens, ':root[data-ui-theme="light"]', "--look-sunlight-hi"), null,
    "LIGHT must not remappoint sunlight art tokens");
  const bc = decl(studio, '#appearance-studio [data-preset="broadcast"] [data-as="preset-art"]', "background-image");
  assert.ok(bc && bc.includes("var(--red)"), "broadcast art follows menu accent via --red");
});

test("profile name row keeps a readable min width on light plates", () => {
  const min = decl(studio, '#appearance-studio [data-as="profile-row"] input, #appearance-studio [data-as="profile-row"] select', "min-width")
    || decl(studio, /^#appearance-studio \[data-as="profile-row"\] input/, "min-width");
  assert.ok(min && min.includes("11rem"),
    "Name your appearance must not clip to 'Name your appearanc'");
  assert.equal(
    decl(studio, '#appearance-studio [data-as="profile-row"] input, #appearance-studio [data-as="profile-row"] select', "background")
      || decl(studio, /^#appearance-studio \[data-as="profile-row"\] input/, "background"),
    "var(--plate-opaque)");
});
