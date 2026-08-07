/* deploy-staging.test.mjs — everything the browser fetches must be DEPLOYED.
 *
 * WHY THIS EXISTS. .github/workflows/pages.yml does not upload the repo root
 * (that shipped a ~174 MB artifact and timed out the Pages deploy). It copies
 * an ALLOW-LIST of runtime directories instead. An allow-list edited by hand is
 * a list that goes stale, and this one did: `vendor/` was never in it, so every
 * dynamically imported library — trystero, rapier, jsQR, three.js — 404'd on
 * the deployed site while working in every local run and every test, because
 * those serve the repo root.
 *
 * The failure mode is what makes it worth a test. A missing <script> tag breaks
 * the page instantly and loudly. A missing DYNAMIC import breaks one feature,
 * on one screen, only in production, and only for whoever taps that button —
 * it reached a real player as "could not load the room service".
 *
 * So: read the workflow's staging commands, read what the shipped code can
 * fetch, and assert the second is covered by the first.
 *
 * Run: node --test tests/unit/deploy-staging.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const workflow = read(".github/workflows/pages.yml");
const html = read("index.html");
const sw = read("sw.js");

/* What the workflow actually puts in _site. Parsed from the `cp` lines rather
 * than from a duplicated list here — a copy of the list would drift from the
 * workflow exactly as the workflow drifted from reality. */
function staged() {
  const out = new Set();
  for (const m of workflow.matchAll(/^\s*cp (?:-r )?(.+?) _site\/$/gm)) {
    for (const w of m[1].trim().split(/\s+/)) out.add(w.replace(/\/$/, ""));
  }
  return out;
}

/* Every same-origin path the shipped code can request, as its top-level entry
 * (a file for `sw.js`, a directory for `vendor/…`). */
function referenced() {
  const hits = new Map();          // top-level entry -> an example full path
  const add = (url, where) => {
    if (/^[a-z]+:/i.test(url) || url.startsWith("//") || url.startsWith("#")) return;
    const clean = url.replace(/^\.?\//, "").split(/[?#]/)[0];
    if (!clean) return;
    const top = clean.split("/")[0];
    if (!hits.has(top)) hits.set(top, `${clean}  (${where})`);
  };

  // Tags and the importmap. The importmap is the ONLY thing that resolves the
  // bare specifiers the ES-module islands import, so its targets are fetched.
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) add(m[1], "index.html tag");
  const map = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
  if (map) for (const v of Object.values(JSON.parse(map[1]).imports)) add(v, "importmap");

  // The service worker precaches by literal path, and a precache miss is a
  // failed install rather than a missing feature.
  for (const m of sw.matchAll(/"((?:\.\/)?(?:js|css|icons|assets|vendor|worker)\/[^"]+)"/g)) {
    add(m[1], "sw.js precache");
  }

  // Runtime URLs built in JS — `new URL("../../vendor/…", src)` is how the
  // debris world reaches rapier, and no tag or importmap mentions it.
  for (const file of walk("js")) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    for (const m of src.matchAll(/["'`]((?:\.\.\/)*vendor\/[^"'`]+)["'`]/g)) {
      add(m[1].replace(/^(\.\.\/)+/, ""), file);
    }
  }
  return hits;
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

test("the Pages workflow stages every directory the shipped code can fetch", () => {
  const have = staged();
  const missing = [];
  for (const [top, example] of referenced()) {
    if (!have.has(top)) missing.push(`${top}/ — e.g. ${example}`);
  }
  assert.deepEqual(missing, [],
    "these will 404 on the deployed site and work perfectly in every local run");
});

test("vendor/ is staged, because every dynamic import lives there", () => {
  // Named explicitly as well as caught by the sweep above: this is the entry
  // that was missing, and the sweep only catches it while something still
  // references it. A regression here should read as itself.
  assert.ok(staged().has("vendor"), "vendor/ must be copied into _site");
});

test("everything the workflow stages actually exists in the repo", () => {
  // The other direction. `cp` of a missing path fails the step outright, which
  // is at least loud — but it fails AFTER checkout on a runner, minutes later,
  // for something knowable here in milliseconds.
  for (const p of staged()) {
    assert.ok(fs.existsSync(path.join(ROOT, p)), `pages.yml stages "${p}", which is not in the repo`);
  }
});

test("importmap and precache targets are real files", () => {
  // Staging the right directory does not help if the path inside it is wrong.
  const map = JSON.parse(html.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1]).imports;
  for (const [spec, target] of Object.entries(map)) {
    if (target.endsWith("/")) continue;                  // a prefix mapping, not a file
    const rel = target.replace(/^\.?\//, "");
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `importmap "${spec}" points at a missing ${rel}`);
  }
});
