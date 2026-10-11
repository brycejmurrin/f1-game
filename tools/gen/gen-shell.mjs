#!/usr/bin/env node
/**
 * gen-shell.mjs — the shell's load-order blocks, from tools/manifest.cjs.
 * @doc Generates the shell tag blocks, sw.js precache seed and js/roster.js from the manifest; `--check` fails on drift.
 * @skill check-changes
 *
 * tools/manifest.cjs is the ONE hand-edited roster. Everything that used to
 * mirror it by hand — the <script>/<link> tags in index.html, the carview
 * tags, the lazy rosters js/game.js injects at runtime, and the tagless files
 * sw.js has to seed into its optional precache — is now written by this tool.
 * Adding a file is one manifest line plus `node tools/gen/gen-shell.mjs`; moving a
 * file is `git mv` plus the same. tests/unit/load-order.test.mjs runs the
 * `--check` form, so a hand edit inside a generated block cannot land.
 *
 * Owned blocks (markers must already exist; the tool never guesses):
 *   index.html         <!-- @gen-shell:csp --> … <!-- /@gen-shell:csp -->
 *                      <!-- @gen-shell:preload --> … <!-- /@gen-shell:preload -->
 *                      <!-- @gen-shell:css --> … <!-- /@gen-shell:css -->
 *                      <!-- @gen-shell:scripts --> … <!-- /@gen-shell:scripts -->
 *   tools/carview.html <!-- @gen-shell:carview --> … <!-- /@gen-shell:carview -->
 *   controller.html    <!-- @gen-shell:csp --> … <!-- /@gen-shell:csp -->
 *                      <!-- @gen-shell:controller --> … <!-- /@gen-shell:controller -->
 *   sw.js              // @gen-shell:sw-optional … // /@gen-shell:sw-optional
 *                      // @gen-shell:sw-lazy-agent … // /@gen-shell:sw-lazy-agent
 *   js/roster.js       the whole file (one global, ApexRoster)
 *
 * The `?v=` token on every tag in the REPO is the literal `dev`: hashes are
 * stamped by the deploy (pages.yml runs `bump-cache --apply --at N --root
 * _site` on the staged copy), so no cache bump ever happens in development
 * and index.html changes only when markup changes. `digest()` stays exported
 * for that deploy path and computes the same 12-hex token bump-cache writes.
 *
 *   node tools/gen/gen-shell.mjs            # write every block
 *   node tools/gen/gen-shell.mjs --check    # exit 1 when any committed block ≠ generated
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { ROOT, isMain, firstDiff } from "./gen-lib.mjs";

const require = createRequire(import.meta.url);
const MANIFEST = require("../manifest.cjs");

export const TARGETS = Object.freeze(["index.html", "tools/carview.html", "cockpit-view.html", "controller.html", "sw.js", "js/roster.js"]);
/** The `?v=` token written into the repo's shell. Real hashes exist only in
 *  the deploy's staged copy. */
export const DEV_TOKEN = "dev";

/** 12-hex SHA-256 prefix — the same token tools/ci/bump-cache.mjs writes. The
 *  roster is hashed from its GENERATED text, so index.html's tag for it is
 *  right on the same run that first writes the file. */
const hashText = (text) => createHash("sha256").update(text).digest("hex").slice(0, 12);
export function digest(rel) {
  if (rel === "js/roster.js") return hashText(rosterSource());
  return hashText(fs.readFileSync(path.join(ROOT, rel)));
}

/** Replace the text between two marker lines, keeping the markers. */
export function replaceMarked(text, open, close, body) {
  const a = text.indexOf(open);
  if (a < 0) throw new Error(`marker ${JSON.stringify(open)} not found`);
  const b = text.indexOf(close, a + open.length);
  if (b < 0) throw new Error(`closing marker ${JSON.stringify(close)} not found after ${JSON.stringify(open)}`);
  const lineStart = text.lastIndexOf("\n", b) + 1;
  return text.slice(0, a + open.length) + "\n" + body + text.slice(lineStart);
}

// ---------------------------------------------------------------------------
// Block bodies.

// CONTENT-SECURITY-POLICY, the strictest this shell boots under. Defence in
// depth: the 2026-10-04 DOM-sink sweep found nothing to exploit; this contains
// the NEXT regression or a compromised dependency.
//   script-src has NO 'unsafe-inline' (round-2 SEC2-7): each inline <script>
//     (the shell guards, the importmap, the deferred-stylesheet flipper below)
//     is allowed by its own 'sha256-…', computed here from the page text, so a
//     shell edit regenerates the line in the same run. Attribute handlers
//     (onload=, onclick=) are NOT allowed and the load-order test refuses them;
//     the deferred stylesheets flip print→all from DEFER_CSS_SCRIPT instead.
//     'strict-dynamic' needs nonces/hashes on every loader, so it is out. What
//     it buys: no script from any origin but ours and the Spotify Web Playback
//     SDK, and an injected inline <script>/onerror= no longer runs.
//     'wasm-unsafe-eval' is Rapier (vendor/rapier, the optional debris world,
//     which degrades if refused). No 'unsafe-eval'.
//     style-src keeps 'unsafe-inline': the shell is styled by inline <style>
//     and style= attributes by design.
//   connect-src stays https:/wss: wide on purpose: the TURN credential URL
//     (apex26.turnApi), the room-code Worker (apex26.rendezvous) and the Nostr
//     relays are player-configurable, so an allow-list would break overrides.
//   object-src 'none' and base-uri 'self' close plugin and <base> injection.
// frame-ancestors / report-to are header-only and cannot be set from a meta.
// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy
const CSP_DIRECTIVES = (scriptHashes) => [
  "default-src 'self'",
  ["script-src 'self'", ...scriptHashes, "'wasm-unsafe-eval' https://sdk.scdn.co"].join(" "),
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // + loopback ws/http: tools/net/nostr-local.cjs and rtc-e2e-room.mjs point
  //   apex26.nostrRelays at ws://127.0.0.1:7448; `wrangler dev` serves the
  //   room-code Worker on http://localhost.
  "connect-src 'self' data: blob: https: wss: ws://127.0.0.1:* ws://localhost:* http://127.0.0.1:* http://localhost:*",
  "worker-src 'self' blob:",
  "frame-src https://sdk.scdn.co",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

/** Every inline <script> body in `html` (no src=), in document order. The
 *  parser hashes the text between the tags with CRLF folded to LF. */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(m[1])) continue;
    out.push(m[2].replace(/\r\n?/g, "\n"));
  }
  return out;
}

/** CSP source expression for one inline script body. */
export const scriptHash = (text) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;

/** The CSP for a page: one hash per distinct inline script (deduped, in order). */
export function cspFor(html) {
  return CSP_DIRECTIVES([...new Set(inlineScripts(html).map(scriptHash))]);
}

function cspBlock(html) {
  return `<meta http-equiv="Content-Security-Policy" content="${cspFor(html)}">\n`;
}

// The deferred stylesheets (MANIFEST.CSS_DEFERRED) load as media="print" so
// they do not hold LCP, then flip to "all". That was an onload= attribute; an
// attribute handler needs 'unsafe-inline'/'unsafe-hashes', so it is one hashed
// script instead. A sheet already loaded when this runs has a .sheet; a
// still-loading one gets a load listener (listeners are not CSP-governed).
export const DEFER_CSS_SCRIPT = `<script>(function(){var L=document.querySelectorAll('link[rel="stylesheet"][media="print"]');` +
  `for(var i=0;i<L.length;i++)(function(l){function f(){l.media="all"}if(l.sheet)f();else l.addEventListener("load",f)})(L[i])})();</script>`;

function preloadBlock() {
  return (MANIFEST.CSS_PRELOAD || []).map((f) =>
    `<link rel="preload" href="${f}?v=${DEV_TOKEN}" as="style">`).join("\n") + "\n";
}

function cssBlock() {
  const deferred = new Set(MANIFEST.CSS_DEFERRED || []);
  return MANIFEST.CSS.map((f) =>
    `<link rel="stylesheet" href="${f}?v=${DEV_TOKEN}"` +
    (deferred.has(f) ? ` media="print"` : "") + ">").join("\n") + "\n" + DEFER_CSS_SCRIPT + "\n";
}

function scriptsBlock() {
  const notes = MANIFEST.SHELL_NOTES || { before: {}, after: {} };
  const out = [];
  for (const f of MANIFEST.FULL) {
    if (notes.before[f]) out.push(notes.before[f]);
    out.push(`<script defer crossorigin="anonymous" src="${f}?v=${DEV_TOKEN}"></script>`);
    if (notes.after[f]) out.push(notes.after[f]);
  }
  return out.join("\n") + "\n";
}

function carviewBlock() {
  return MANIFEST.CARVIEW.map((f) => `<script src="../${f}"></script>`).join("\n") + "\n";
}

// Public, isolated inspection host. The developer studio is not shipped.
function cockpitViewPage() {
  return `<!doctype html>
<!-- Generated by tools/gen/gen-shell.mjs; edit the generator and CARVIEW roster. -->
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Apex 26 — Cockpit Preview</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#171b20;color:#eee;font:14px system-ui}#view{width:100%;height:100%;display:block}#err{position:fixed;inset:0;display:none;place-items:center;text-align:center;padding:20px}</style>
</head><body><canvas id="view" aria-label="Stationary cockpit model"></canvas>
<div id="hud" hidden></div><div id="tip" hidden></div><div id="err" role="status"></div>
${MANIFEST.CARVIEW.map((f) => `<script src="${f}?v=${DEV_TOKEN}"></script>`).join("\n")}
</body></html>\n`;
}

/** controller.html is a ROOT page like index.html: same `?v=dev` token, hashed
 *  by the same deploy step (bump-cache rewrites every root page it finds). */
function controllerBlock() {
  return MANIFEST.CONTROLLER.map((f) =>
    `<script defer crossorigin="anonymous" src="${f}?v=${DEV_TOKEN}"></script>`).join("\n") + "\n";
}

/** Every tagless file sw.js must seed: loadBackendScripts() injects each one as
 *  `<path>?v=<build>`, and the tag parser cannot see any of them. LAZY_AGENT is
 *  deliberately absent (dev/test surface; an install-time put full-compiles). */
export function swOptionalFiles() {
  return [
    ...Object.values(MANIFEST.DEFERRED).flat(),
    ...MANIFEST.LAZY_RACE, ...(MANIFEST.LAZY_RACE_SESSION || []),
    ...MANIFEST.LAZY_CIRCUIT, ...MANIFEST.LAZY_SCENERY, ...MANIFEST.LAZY_DATA, ...MANIFEST.LAZY_NET,
    ...(MANIFEST.LAZY_AUDIO || []),
    ...MANIFEST.LAZY_WORKER, ...MANIFEST.LAZY_EDITOR, ...(MANIFEST.LAZY_XR || []),
    ...(MANIFEST.LAZY_CAM_EDITOR || []), ...(MANIFEST.LAZY_CAREER_UI || []),
  ];
}

/** Root pages other than the shell that an installed PWA must answer offline
 *  (the manifest's "Phone controller" shortcut and the QR landing page). Seeded
 *  OPTIONAL and bare: sw.js serves them cache-first-after-race under their own
 *  URL and never substitutes the game shell for them. */
export const SW_ROOT_PAGES = Object.freeze(["controller.html"]);

function swOptionalBlock() {
  const groups = [
    ["ROOT PAGES — answered offline under their own URL, never by the game shell", SW_ROOT_PAGES],
    ["DEFERRED renderer backends (no <script> tag; injected on opt-in)", Object.values(MANIFEST.DEFERRED).flat()],
    ["LAZY_RACE + LAZY_CIRCUIT + LAZY_SCENERY — race payload; a miss builds a bare/meta circuit offline", [...MANIFEST.LAZY_RACE, ...MANIFEST.LAZY_CIRCUIT, ...MANIFEST.LAZY_SCENERY]],
    ["LAZY_RACE_SESSION — pit/radio/reliability behind startRace (title boots stub)", MANIFEST.LAZY_RACE_SESSION || []],
    ["LAZY_AUDIO — engine/panel/voice behind first sound gesture or race start", MANIFEST.LAZY_AUDIO || []],
    ["LAZY_DATA — the data hub bundle behind the DATA button", MANIFEST.LAZY_DATA],
    ["LAZY_NET — the multiplayer stack behind VS FRIEND", MANIFEST.LAZY_NET],
    ["LAZY_WORKER — worker entry scripts (new Worker, never a page tag)", MANIFEST.LAZY_WORKER],
    ["LAZY_EDITOR — the track designer behind the TRACK DESIGNER door", MANIFEST.LAZY_EDITOR],
    ["LAZY_XR — WebXR session behind navigator.xr / ENTER VR", MANIFEST.LAZY_XR || []],
    ["LAZY_CAM_EDITOR — camera tuner + flyby shot editor panels", MANIFEST.LAZY_CAM_EDITOR || []],
    ["LAZY_CAREER_UI — CAREER screen behind the title CAREER door", MANIFEST.LAZY_CAREER_UI || []],
  ];
  const out = [];
  for (const [title, files] of groups) {
    out.push(`    // ${title}`);
    for (const f of files) out.push(`    "${f}",`);
  }
  return out.join("\n") + "\n";
}

function swLazyAgentBlock() {
  return `  const LAZY_AGENT = ${JSON.stringify(MANIFEST.LAZY_AGENT)};\n`;
}

function rosterSource() {
  const pretty = (v) => JSON.stringify(v, null, 2).replace(/\n/g, "\n  ");
  const fields = [
    ["DEFERRED", MANIFEST.DEFERRED], ["DEFERRED_EDGES", MANIFEST.DEFERRED_EDGES],
    ["LAZY_AGENT", MANIFEST.LAZY_AGENT], ["LAZY_EDGES", MANIFEST.LAZY_EDGES],
    ["LAZY_RACE", MANIFEST.LAZY_RACE],
    ["LAZY_RACE_SESSION", MANIFEST.LAZY_RACE_SESSION],
    ["LAZY_RACE_SESSION_EDGES", MANIFEST.LAZY_RACE_SESSION_EDGES],
    ["CIRCUITS_DIR", MANIFEST.CIRCUITS_DIR], ["LAZY_CIRCUIT", MANIFEST.LAZY_CIRCUIT],
    ["SCENERY_DIR", MANIFEST.SCENERY_DIR],
    ["LAZY_AUDIO", MANIFEST.LAZY_AUDIO], ["LAZY_AUDIO_EDGES", MANIFEST.LAZY_AUDIO_EDGES],
    ["LAZY_DATA", MANIFEST.LAZY_DATA], ["LAZY_DATA_EDGES", MANIFEST.LAZY_DATA_EDGES],
    ["LAZY_NET", MANIFEST.LAZY_NET], ["LAZY_NET_EDGES", MANIFEST.LAZY_NET_EDGES],
    ["LAZY_WORKER", MANIFEST.LAZY_WORKER],
    ["LAZY_EDITOR", MANIFEST.LAZY_EDITOR], ["LAZY_EDITOR_EDGES", MANIFEST.LAZY_EDITOR_EDGES],
    ["LAZY_XR", MANIFEST.LAZY_XR], ["LAZY_XR_EDGES", MANIFEST.LAZY_XR_EDGES],
    ["LAZY_CAM_EDITOR", MANIFEST.LAZY_CAM_EDITOR], ["LAZY_CAM_EDITOR_EDGES", MANIFEST.LAZY_CAM_EDITOR_EDGES],
    ["LAZY_CAREER_UI", MANIFEST.LAZY_CAREER_UI], ["LAZY_CAREER_UI_EDGES", MANIFEST.LAZY_CAREER_UI_EDGES],
    // The build Worker's importScripts list, "@circuits" expanded in page order
    // so the worker's Tracks.LIST indexes exactly as the page's does.
    ["TRACK_VM", MANIFEST.TRACK_VM.flatMap((e) => (e === "@circuits" ? MANIFEST.CIRCUITS.map(MANIFEST.circuitPath) : [e]))],
    // …and the worker's own extras after it (assets.js: the baked model pack).
    ["TRACK_WORKER_EXTRA", MANIFEST.TRACK_WORKER_EXTRA],
  ];
  return [
    "// js/roster.js — GENERATED by tools/gen/gen-shell.mjs from tools/manifest.cjs. Do not edit.",
    "// The tagless rosters js/game.js injects at runtime (deferred backends, the",
    "// agent surface, the race payload, the data hub, the multiplayer stack) and",
    "// the eval-order edges inside each. Edit the manifest, then regenerate.",
    "(function () {",
    '  "use strict";',
    "  self.ApexRoster = Object.freeze({",
    ...fields.map(([k, v]) => `    ${k}: ${pretty(v)},`),
    "  });",
    "})();",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------

/** Generated content for every target, keyed by repo-relative path. */
export function generate() {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
  let html = read("index.html");
  html = replaceMarked(html, "<!-- @gen-shell:preload -->", "<!-- /@gen-shell:preload -->", preloadBlock());
  html = replaceMarked(html, "<!-- @gen-shell:css -->", "<!-- /@gen-shell:css -->", cssBlock());
  html = replaceMarked(html, "<!-- @gen-shell:scripts -->", "<!-- /@gen-shell:scripts -->", scriptsBlock());
  // Last: the CSP hashes every inline script, including the one cssBlock emits.
  html = replaceMarked(html, "<!-- @gen-shell:csp -->", "<!-- /@gen-shell:csp -->", cspBlock(html));
  let carview = read("tools/carview.html");
  carview = replaceMarked(carview, "<!-- @gen-shell:carview -->", "<!-- /@gen-shell:carview -->", carviewBlock());
  let controller = read("controller.html");
  controller = replaceMarked(controller, "<!-- @gen-shell:controller -->", "<!-- /@gen-shell:controller -->", controllerBlock());
  controller = replaceMarked(controller, "<!-- @gen-shell:csp -->", "<!-- /@gen-shell:csp -->", cspBlock(controller));
  let sw = read("sw.js");
  sw = replaceMarked(sw, "// @gen-shell:sw-optional", "// /@gen-shell:sw-optional", swOptionalBlock());
  sw = replaceMarked(sw, "// @gen-shell:sw-lazy-agent", "// /@gen-shell:sw-lazy-agent", swLazyAgentBlock());
  return { "index.html": html, "tools/carview.html": carview, "cockpit-view.html": cockpitViewPage(), "controller.html": controller, "sw.js": sw, "js/roster.js": rosterSource() };
}

/** Targets whose committed bytes differ from a fresh generation. */
export function stale() {
  const out = [];
  for (const [rel, content] of Object.entries(generate())) {
    const abs = path.join(ROOT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
    if (current !== content) out.push({ rel, diff: firstDiff(current, content) });
  }
  return out;
}

export function main(argv = process.argv.slice(2)) {
  const USAGE = "usage: node tools/gen/gen-shell.mjs [--check]\n  Regenerates the @gen-shell blocks (index.html, sw.js, ...) from tools/manifest.cjs; --check only reports drift.";
  if (argv.includes("--help") || argv.includes("-h")) { process.stdout.write(USAGE + "\n"); return 0; }
  // An unknown flag used to fall through to WRITE mode (an agent's `--help`
  // regenerated every block on 2026-10-05). Refuse it instead.
  const unknown = argv.filter((a) => a !== "--check");
  if (unknown.length) { process.stderr.write(`gen-shell: unknown argument ${unknown.join(" ")}\n${USAGE}\n`); return 2; }
  const check = argv.includes("--check");
  const drift = stale();
  if (check) {
    if (!drift.length) { process.stdout.write("gen-shell: every block up to date\n"); return 0; }
    for (const d of drift) process.stdout.write(`${d.rel}: STALE — run \`node tools/gen/gen-shell.mjs\`\n${d.diff}\n`);
    return 1;
  }
  const out = generate();
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    const current = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
    if (current === out[rel]) { process.stdout.write(`${rel}: unchanged\n`); continue; }
    fs.writeFileSync(abs, out[rel]);
    process.stdout.write(`${rel}: written\n`);
  }
  return 0;
}

if (isMain(import.meta.url)) process.exit(main());
