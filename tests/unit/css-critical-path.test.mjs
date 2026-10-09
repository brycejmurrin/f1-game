/* css-critical-path.test.mjs — title paint must not fetch settings/dialogs at
 * preload priority, and HUD faces must not sit in a render-blocking sheet.
 *
 * Survey-A (2026-10-06) findings 3–4: CSS_PRELOAD still listed dialogs.css,
 * settings.css, settings-controls.css and dialog-platform.css (~79 KB) that
 * do not paint #overlay / #title / #menu-buttons, while tokens.css declared
 * Barlow + unused Titillium weights the title never preloads.
 *
 * Run: node --test tests/unit/css-critical-path.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");

const TITLE_CRITICAL = [
  "css/tokens.css", "css/components.css", "css/title.css", "css/menus.css",
  "css/responsive.css",
];
const SETTINGS_FOUC = [
  "css/dialogs.css", "css/settings.css", "css/settings-controls.css",
  "css/dialog-platform.css",
];

function stripV(u) {
  return u.replace(/\?v=[A-Za-z0-9._-]+$/, "");
}

test("CSS_PRELOAD is the title-critical set, not settings/dialogs", () => {
  assert.deepEqual(MANIFEST.CSS_PRELOAD, TITLE_CRITICAL);
  for (const f of SETTINGS_FOUC) {
    assert.equal(MANIFEST.CSS_PRELOAD.includes(f), false, `${f} must not be preloaded`);
    assert.ok(MANIFEST.CSS_DEFERRED.includes(f), `${f} stays rel=stylesheet print→all`);
  }
});

test("the shell preload and stylesheet blocks match the manifest", () => {
  const preload = [...html.matchAll(/<link rel="preload" href="(css\/[^"]+)" as="style">/g)]
    .map((m) => stripV(m[1]));
  assert.deepEqual(preload, MANIFEST.CSS_PRELOAD);

  const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"([^>]*)>/g)];
  const hrefs = sheets.map((m) => stripV(m[1]));
  assert.deepEqual(hrefs, MANIFEST.CSS);

  const deferred = new Set(MANIFEST.CSS_DEFERRED);
  for (const [, href, rest] of sheets) {
    const file = stripV(href);
    const print = /media="print"/.test(rest);
    assert.equal(print, deferred.has(file),
      `${file}: print→all must match CSS_DEFERRED (sw.js essential-set still sees rel=stylesheet)`);
  }
});

test("title font preloads and the density stamp stay in the shell", () => {
  assert.match(html, /titillium-web-latin-600-normal\.woff2" as="font"/);
  assert.match(html, /titillium-web-latin-700-italic\.woff2" as="font"/);
  assert.match(html, /saira-apex26-800-italic\.woff2" as="font"/);
  assert.match(html, /data-density/);
  assert.doesNotMatch(html, /barlow-condensed[^"]+" as="font"/);
});

test("Barlow and unused Titillium faces live in deferred fonts-hud.css", () => {
  const tokens = fs.readFileSync(path.join(ROOT, "css/tokens.css"), "utf8");
  const hud = fs.readFileSync(path.join(ROOT, "css/fonts-hud.css"), "utf8");
  assert.doesNotMatch(tokens, /font-family:\s*"Barlow Condensed"/);
  assert.doesNotMatch(tokens, /titillium-web-latin-400-normal/);
  assert.doesNotMatch(tokens, /titillium-web-latin-700-normal/);
  assert.match(tokens, /titillium-web-latin-600-normal/);
  assert.match(tokens, /titillium-web-latin-700-italic/);
  assert.match(tokens, /saira-apex26-800-italic/);
  assert.match(hud, /Barlow Condensed/);
  assert.match(hud, /titillium-web-latin-400-normal/);
  assert.match(hud, /titillium-web-latin-700-normal/);
  assert.ok(MANIFEST.CSS_DEFERRED.includes("css/fonts-hud.css"));
  assert.equal(MANIFEST.CSS_PRELOAD.includes("css/fonts-hud.css"), false);
});

test("blocking sheets restate the dialog.screen closed-box guard", () => {
  const blocking = TITLE_CRITICAL
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.match(blocking, /dialog\.screen:not\(\[open\]\)\s*\{\s*display:\s*none/,
    "print→all dialog-platform must not leave the hidden→showModal seam unguarded");
  assert.match(blocking, /dialog\.screen\[open\]\s*\{\s*display:\s*grid/,
    "open dialogs need a display flip in the blocking set so dropped child boxes heal");
  assert.match(blocking, /dialog\.screen\s*\{[^}]*width:\s*100%/,
    "UA fit-content of a 0×0 subtree must not win before dialog-platform arrives");
  assert.match(blocking, /dialog\.screen\s*\{[^}]*height:\s*100%/);
});

test("blocking sheets hide #rotate-device until overlays.css arrives", () => {
  const blocking = TITLE_CRITICAL
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.match(blocking, /#rotate-device\s*\{\s*display:\s*none\s*;?\s*\}/,
    "a cold print→all withhold must not paint the rotate dialog in flow");
  const overlays = fs.readFileSync(path.join(ROOT, "css/overlays.css"), "utf8");
  assert.match(overlays, /body\.in-race:not\(\.rotate-ok\) #rotate-device \{ display: flex; \}/,
    "the in-race show rule stays in the deferred chrome sheet");
});

test("blocking and preload byte census stay under the post-cut ceilings", () => {
  const blocked = MANIFEST.CSS.filter((f) => !MANIFEST.CSS_DEFERRED.includes(f));
  assert.deepEqual(blocked, TITLE_CRITICAL);
  let blocking = 0, preload = 0;
  for (const f of blocked) blocking += fs.statSync(path.join(ROOT, f)).size;
  for (const f of MANIFEST.CSS_PRELOAD) preload += fs.statSync(path.join(ROOT, f)).size;
  // Pre home-live CLS (2026-10-07): blocking 208648 / preload 214469. Live Home
  // grid geometry in css/menus.css adds ~3.6 KiB so experience.css cannot move
  // the title column on first paint. Compact-wide under-brand #menu-secondary
  // nest (2026-10-07 UI Fit) adds ~2 KiB more in the same blocking sheet.
  assert.ok(blocking < 218000, `blocking CSS is ${blocking} B; want < 218000`);
  assert.ok(preload < 218000, `preload CSS is ${preload} B; want < 218000`);
  const settingsBytes = SETTINGS_FOUC.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  assert.ok(settingsBytes > 70000, "the dropped preload still exists as print→all bytes");
});
