/**
 * stage-minify.test.mjs — the deploy-only minify (tools/desktop/minify.mjs,
 * issue #3110) must not change what the shipped code reads back out of itself.
 *
 *  1. String(fn) scans: Assets.modelIds / modelsReady take a scenery closure's
 *     SOURCE TEXT and keep the quoted literals that name a model in
 *     assets/pack/manifest.json (js/core/lazy-bundles.js sceneryModels,
 *     js/track/build-client.js, js/track/build-worker.js). Every scenery closure
 *     must name the same models minified as from source.
 *  2. Top-level names: every file is a classic script whose top-level
 *     const/let/function/class names are globals other scripts destructure at
 *     eval (tools/manifest.cjs HARD_EDGES). Minified, each must still be declared.
 *  3. Directives, kept names, no sourceMappingURL, and byte determinism.
 * The staged boot itself is CI's `staged-boot` job (ci.yml).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { minify } from "terser";
import { absSrc } from "../helpers/abs-src.mjs";
import { MINIFY_OPTIONS, canMinify, minifyExcluded, minifySource, minifyStaged, minifyTargets } from "../../tools/desktop/minify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const MODELS = JSON.parse(read("assets/pack/manifest.json")).models || {};

// The scan Assets uses (js/render/shared/assets.js _idsNamedIn), copied: the
// test must see the same ids the page would.
function idsNamedIn(src) {
  const out = [];
  const re = /["'`]([^"'`\s\\]+)["'`]/g;
  let r;
  while ((r = re.exec(src)) !== null) {
    if (Object.prototype.hasOwnProperty.call(MODELS, r[1]) && !out.includes(r[1])) out.push(r[1]);
  }
  return out.sort();
}

// The names a classic script declares at its top level (terser's own parse).
async function topLevelNames(src) {
  const { ast } = await minify(src, { compress: false, mangle: false, format: { ast: true, code: false } });
  const out = [];
  for (const st of ast.body) {
    if (st.definitions) for (const d of st.definitions) out.push(d.name.name || "<pattern>");
    else if ((st.TYPE === "Defun" || st.TYPE === "DefClass") && st.name) out.push(st.name.name);
  }
  return out.sort();
}

// Run a scenery file and return { id: String(closure) }.
function sceneryClosures(src, filename) {
  const sandbox = { TrackDefs: [] };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  vm.runInContext(src, vm.createContext(sandbox), { filename: absSrc(filename) });
  const out = {};
  for (const [id, fn] of Object.entries(sandbox.TrackScenery || {})) out[id] = String(fn);
  for (const def of sandbox.TrackDefs) if (def && typeof def.scenery === "function") out[def.id] = String(def.scenery);
  return out;
}

test("options: compress off, locals-only mangle, names and quoted keys kept", () => {
  assert.equal(MINIFY_OPTIONS.compress, false);
  assert.equal(MINIFY_OPTIONS.toplevel, false);
  assert.equal(MINIFY_OPTIONS.mangle.toplevel, false);
  assert.equal(MINIFY_OPTIONS.keep_fnames, true);
  assert.equal(MINIFY_OPTIONS.keep_classnames, true);
  assert.equal(MINIFY_OPTIONS.format.keep_quoted_props, true);
  assert.ok(Object.isFrozen(MINIFY_OPTIONS));
});

// Paths that need not exist, assembled so no doc/comment path lint reads them as references.
const fake = (...parts) => parts.join("/");

test("only js/**/*.js outside vendor/ is a target", () => {
  assert.equal(minifyExcluded("js/core/log.js"), false);
  assert.equal(minifyExcluded(fake("js", "render", "vendor", "lib.js")), true);
  assert.equal(minifyExcluded(fake("vendor", "lib", "lib.js")), true);
  assert.equal(minifyExcluded("sw.js"), true);
  assert.equal(minifyExcluded("js/core/log.js.map"), true);
});

test("every scenery closure names the same models minified as from source", async () => {
  const files = [
    ...fs.readdirSync(path.join(ROOT, "js/circuits/scenery")).filter((f) => f.endsWith(".js")).map((f) => `js/circuits/scenery/${f}`),
    ...fs.readdirSync(path.join(ROOT, "js/circuits")).filter((f) => f.endsWith(".js")).map((f) => `js/circuits/${f}`),
  ];
  let closures = 0, named = 0;
  for (const rel of files) {
    const src = read(rel);
    const before = sceneryClosures(src, rel);
    const after = sceneryClosures((await minifySource(src, rel)).code, rel);
    assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), `${rel}: closure set changed`);
    for (const id of Object.keys(before)) {
      closures++;
      const want = idsNamedIn(before[id]);
      if (want.length) named++;
      assert.deepEqual(idsNamedIn(after[id]), want, `${rel}: scenery "${id}" names different models minified`);
    }
  }
  assert.ok(closures >= 40, `expected every circuit's scenery closure, saw ${closures}`);
  assert.ok(named >= 1, "no closure names a model: the scan is not testing anything");
});

test("top-level declarations, directives and function names survive; no map link", async () => {
  const targets = minifyTargets(ROOT);
  assert.ok(targets.length > 400, `expected the whole js/ tree, saw ${targets.length}`);
  for (const rel of targets) {
    const src = read(rel);
    const { code, map } = await minifySource(src, rel);
    assert.doesNotMatch(code, /sourceMappingURL/, `${rel}: shipped file links its map`);
    assert.equal(JSON.parse(map).sources[0], rel, `${rel}: map names its source`);
    assert.deepEqual(await topLevelNames(code), await topLevelNames(src), `${rel}: top-level names changed`);
    const body = src.replace(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, "");
    if (/^["']use strict["']/.test(body)) assert.match(code, /^(?:\/\*[\s\S]*?\*\/\s*)*["']use strict["']/, `${rel}: lost its "use strict"`);
  }
});

test("keep_fnames: a named function keeps its name and .name", async () => {
  const { code } = await minifySource('"use strict";\nconst X = (function () { function buildTrackMesh(a) { return a; } return { f: buildTrackMesh, n: buildTrackMesh.name }; })();', fake("js", "probe.js"));
  const ctx = vm.createContext({});
  vm.runInContext(code.replace(/\bconst X=/, "var X="), ctx);
  assert.equal(ctx.X.n, "buildTrackMesh");
  assert.match(code, /function buildTrackMesh\(/);
});

test("minifyStaged is byte-deterministic and writes an unlinked .map beside each file", async (t) => {
  const tmp = fs.mkdtempSync(path.join(ROOT, "scratch", "stage-minify-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const pick = ["js/core/log.js", "js/core/lazy-bundles.js", "js/circuits/scenery/monaco.js"];
  const runs = [];
  for (const run of ["a", "b"]) {
    const dir = path.join(tmp, run);
    for (const rel of pick) {
      fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
    }
    const r = await minifyStaged(dir, { jobs: run === "a" ? 1 : 3 });
    assert.equal(r.files, pick.length);
    assert.ok(r.after < r.before);
    runs.push(pick.map((rel) => fs.readFileSync(path.join(dir, rel), "utf8") + fs.readFileSync(path.join(dir, rel + ".map"), "utf8")));
  }
  assert.deepEqual(runs[0], runs[1]);
});

test("terser loads lazily: pages.yml deploy/verify-live and desktop.yml stage with no root npm ci", async () => {
  // A static import failed desktop.yml's pack job (run 39341343728) and would have failed the Pages deploy.
  const src = read("tools/desktop/minify.mjs");
  assert.doesNotMatch(src, /^\s*import\b[^;]*["']terser["']/m, "terser must not be a static import");
  assert.equal(await canMinify(), true, "this checkout has terser (devDependency), so the stage minifies");
});
