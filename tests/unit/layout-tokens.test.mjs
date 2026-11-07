/* layout-tokens.test.mjs — the width tiers have one source.
 *
 * css/tokens.css declares --bp-*. A media query cannot read a custom property,
 * so tokens.css repeats the pixel values in the --layout-active queries and
 * css/responsive.css reads the result. This test is the lock: a tier that moves
 * in one copy and not the other is a layout that disagrees with its token.
 *
 * Until 2026-11-07 js/ui/scale.js carried a third copy and stamped the tier on
 * html[data-layout]; it called an 852/844 landscape phone "tablet" and nothing
 * in css/ read it (UI contract 2026-11-06 gap 20). The second test keeps that
 * writer and any CSS reader from coming back.
 *
 * Run: node --test tests/unit/layout-tokens.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

test("width-tier tokens and their --layout-active media queries name the same pixels", () => {
  const tiers = { tablet: 700, laptop: 900, desktop: 1440, wide: 1920, ultra: 2200 };
  for (const [name, px] of Object.entries(tiers)) {
    assert.equal(tokenPx("--bp-" + name), px, "--bp-" + name);
    const q = tokens.match(new RegExp("@media \\(min-width: (\\d+)px\\) \\{ :root \\{ --layout-active: var\\(--bp-" + name + "\\)"));
    assert.ok(q, "no --layout-active query for --bp-" + name);
    assert.equal(Number(q[1]), px);
  }
  assert.equal(tokenPx("--bp-phone"), 480);
  assert.match(tokens, /--layout-active: var\(--bp-phone\);/, "the tier below tablet is the phone token");
  assert.match(responsive, /var\(--layout-active\)/, "--bp-* has its consumer: the wide-landscape title grid reads --layout-active");
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

test("the width tier never reaches the DOM: no html[data-layout] writer in scale.js, no reader in css/", () => {
  assert.doesNotMatch(scaleJs, /dataset\.layout\b|\bLAYOUT_BPS\b|\blayoutOf\b|getPropertyValue\("--bp-/, "scale.js stamps only the fold (the comment may name what went)");
  assert.match(scaleJs, /root\.dataset\.fold = fold/, "the foldable hinge stamp stays");
  for (const f of fs.readdirSync(path.join(ROOT, "css"))) {
    if (!f.endsWith(".css")) continue;
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, "css", f), "utf8"), /data-layout/, f);
  }
});
