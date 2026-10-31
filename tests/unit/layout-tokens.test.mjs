/* layout-tokens.test.mjs — the width tiers have one source.
 *
 * css/tokens.css declares --bp-*. A media query cannot read a custom property,
 * so tokens.css and css/responsive.css repeat the pixel values. js/ui/scale.js
 * repeats them again as the fallback for when the sheet has not applied.
 * This test is the lock: a tier that moves in one copy and not the others
 * is a layout that disagrees with html[data-layout].
 *
 * Run: node --test tests/unit/layout-tokens.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const tokens = fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8");
const responsive = fs.readFileSync(path.join(ROOT, "css/responsive.css"), "utf8");
const scaleJs = fs.readFileSync(path.join(ROOT, "js/ui/scale.js"), "utf8");

function tokenPx(name) {
  const m = tokens.match(new RegExp(name + ":\\s*(\\d+)px"));
  assert.ok(m, name + " missing from css/tokens.css");
  return Number(m[1]);
}

function tokenDecl(name) {
  const m = tokens.match(new RegExp(name + ":\\s*([^;]+);"));
  assert.ok(m, name + " missing from css/tokens.css");
  return m[1].trim();
}

test("width-tier tokens, the media queries, and scale.js name the same pixels", () => {
  const ctx = vm.createContext({ JSON, window: { matchMedia: () => ({ matches: false }) } });
  vm.runInContext(scaleJs.replace(/^const UiScale\b/m, "var UiScale"), ctx, { filename: absSrc("js/ui/scale.js") });
  const bps = JSON.parse(vm.runInContext("JSON.stringify(UiScale.LAYOUT_BPS)", ctx));
  const names = { ultra: "--bp-ultra", wide: "--bp-wide", desktop: "--bp-desktop", laptop: "--bp-laptop", tablet: "--bp-tablet" };
  assert.deepEqual(bps.map((r) => r[0]), Object.keys(names));
  for (const [name, px] of bps) {
    assert.equal(tokenPx(names[name]), px, names[name]);
    const q = tokens.match(new RegExp("@media \\(min-width: (\\d+)px\\) \\{ :root \\{ --layout-active: var\\(" + names[name] + "\\)"));
    assert.ok(q, "no --layout-active query for " + names[name]);
    assert.equal(Number(q[1]), px);
  }
  assert.equal(tokenPx("--bp-phone"), 480);
  assert.equal(tokenPx("--col-max"), 660, "the large-portrait column cap");
  assert.match(responsive, /@media \(min-width: 1920px\) and \(orientation: landscape\)/);
  assert.match(responsive, /horizontal-viewport-segments: 2/);
  assert.match(responsive, /vertical-viewport-segments: 2/);
  assert.match(tokens, /--safe-w: calc\(100svw - var\(--safe-l\) - var\(--safe-r\)\)/);
  assert.equal(tokenDecl("--touch-label-floor"), "11px");
  assert.equal(tokenDecl("--touch-pedal-radius"), "28%");
  assert.equal(tokenDecl("--touch-tablet-btn"), "96px");
  assert.equal(tokenDecl("--touch-tablet-steer"), "108px");
  assert.equal(tokenDecl("--hud-glance"), "color-mix(in oklab, var(--text) 68%, var(--dim))");
});

test("layoutOf walks the tiers from the wide end", () => {
  const ctx = vm.createContext({ window: { matchMedia: () => ({ matches: false }) } });
  vm.runInContext(scaleJs.replace(/^const UiScale\b/m, "var UiScale"), ctx, { filename: absSrc("js/ui/scale.js") });
  const of = (w) => vm.runInContext("UiScale.layoutOf(" + w + ")", ctx);
  assert.equal(of(0), "phone");
  assert.equal(of(479), "phone");
  assert.equal(of(699), "phone");
  assert.equal(of(700), "tablet");
  assert.equal(of(899), "tablet");
  assert.equal(of(900), "laptop");
  assert.equal(of(1439), "laptop");
  assert.equal(of(1440), "desktop");
  assert.equal(of(1919), "desktop");
  assert.equal(of(1920), "wide");
  assert.equal(of(2199), "wide");
  assert.equal(of(2200), "ultra");
  assert.equal(of(2560), "ultra");
  assert.equal(of(NaN), "phone");
});
