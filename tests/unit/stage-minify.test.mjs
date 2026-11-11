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
 *  4. The shell (#5050): staged css/*.css and index.html lose their comments
 *     and nothing else the page reads (rule count, tag list, CSP per script).
 * The staged boot itself is CI's `staged-boot` job (ci.yml).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { minify } from "terser";
import { Worker } from "node:worker_threads";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { minifyInWorkers } from "../../tools/desktop/minify-worker.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { MINIFY_OPTIONS, canMinify, minifyExcluded, minifySource, minifyStaged, minifyTargets, minifyJobCount, unminifiedPolicy,
  minifyCss, minifyShellHtml, minifyStagedShell, cssTargets } from "../../tools/desktop/minify.mjs";
import { inlineScripts, cspFor, scriptHash } from "../../tools/gen/gen-shell.mjs";

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

// The file's first statement when it is a "use strict" directive (comments skipped), else "".
function leadingDirective(src) {
  const body = src.replace(/^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*\n))*\s*/, "");
  return /^["']use strict["']/.test(body) ? "use strict" : "";
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
    assert.equal(leadingDirective(code), leadingDirective(src), `${rel}: its leading directive changed`);
  }
});

test("keep_fnames: a named function keeps its name and .name", async () => {
  const { code } = await minifySource('"use strict";\nconst X = (function () { function buildTrackMesh(a) { return a; } return { f: buildTrackMesh, n: buildTrackMesh.name }; })();', fake("js", "probe.js"));
  const ctx = vm.createContext({});
  vm.runInContext(code.replace(/\bconst X=/, "var X="), ctx);
  assert.equal(ctx.X.n, "buildTrackMesh");
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

function minifyFixture(t) {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "stage-minify-pool-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const sources = Array.from({ length: 7 }, (_, i) => `/*! keep license */\n"use strict"; const Probe${i}=(function () { function readable(value) { return { "model-id": value + ${i} }; } return readable; })();`);
  const targets = sources.map((src, i) => {
    const rel = `js/probe${i}.js`;
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), src);
    return rel;
  });
  const resultRoot = path.join(dir, "results");
  fs.mkdirSync(resultRoot);
  return { dir, sources, targets, resultRoot };
}

test("minify pool is capped by CPU and memory capacity, with a two-worker default", () => {
  const roomy = { parallelism: 8, memory: 8 * 1024 ** 3 };
  assert.equal(minifyJobCount(undefined, roomy), 2);
  assert.equal(minifyJobCount(99, roomy), 2);
  assert.equal(minifyJobCount(1, roomy), 1);
  assert.equal(minifyJobCount(2, { ...roomy, parallelism: 1 }), 1);
  assert.equal(minifyJobCount(2, { ...roomy, memory: 700 * 1024 ** 2 }), 1);
  assert.equal(minifyJobCount(0, roomy), 1);
});

test("persistent minify workers execute multiple tasks and preserve exact code and maps", async (t) => {
  const fixture = minifyFixture(t);
  const workers = [];
  class ObservedWorker extends Worker {
    constructor(...args) { super(...args); this.sent = 0; workers.push(this); assert.ok(this.threadId > 0); }
    postMessage(...args) { this.sent++; return super.postMessage(...args); }
  }
  const results = await minifyInWorkers({ siteRoot: fixture.dir, targets: fixture.targets,
    resultRoot: fixture.resultRoot, jobs: 2, WorkerClass: ObservedWorker });
  assert.equal(workers.length, 2, "actual CPU threads, not async jobs on the caller");
  assert.ok(workers.some((worker) => worker.sent > 1), "threads are reused across files");
  assert.ok(workers.every((worker) => worker.threadId === -1), "all workers joined before resolving");
  for (const [i, rel] of fixture.targets.entries()) {
    const expected = await minifySource(fixture.sources[i], rel);
    assert.equal(fs.readFileSync(path.join(fixture.resultRoot, `${i}.js`), "utf8"), expected.code);
    assert.equal(fs.readFileSync(path.join(fixture.resultRoot, `${i}.map`), "utf8"), expected.map);
    assert.equal(results[i].before, Buffer.byteLength(fixture.sources[i]));
    assert.equal(results[i].after, Buffer.byteLength(expected.code));
    assert.equal(fs.readFileSync(path.join(fixture.dir, rel), "utf8"), fixture.sources[i], "workers only write disposable output");
  }
});

test("a crashed minify worker stops dispatch and joins a stalled peer before rejecting", { timeout: 5000 }, async (t) => {
  const fixture = minifyFixture(t);
  const crash = path.join(fixture.dir, "crash.mjs");
  fs.writeFileSync(crash, 'import { workerData } from "node:worker_threads"; if (workerData.id === 0) process.exit(17); else setInterval(() => {}, 1000);');
  const workers = [];
  class CrashingWorker extends Worker {
    constructor(_url, options) {
      super(pathToFileURL(crash), { ...options, workerData: { id: workers.length } });
      this.sent = 0;
      workers.push(this);
    }
    postMessage(...args) { this.sent++; return super.postMessage(...args); }
  }
  await assert.rejects(minifyInWorkers({ siteRoot: fixture.dir, targets: fixture.targets,
    resultRoot: fixture.resultRoot, jobs: 2, WorkerClass: CrashingWorker }), /js\/probe0\.js: worker exited \(17\)/);
  assert.equal(workers.reduce((sum, worker) => sum + worker.sent, 0), 2, "no new task after failure");
  assert.ok(workers.every((worker) => worker.threadId === -1), "no orphan worker after rejection");
});

test("a failed minify task leaves every staged source/map untouched in serial and pool modes", async (t) => {
  for (const jobs of [1, 2]) {
    const fixture = minifyFixture(t);
    // Invalid source exists only inside the disposable staged-site fixture.
    const bad = path.posix.join("js", "zz-bad.js");
    fs.writeFileSync(path.join(fixture.dir, bad), "function {");
    for (const rel of fixture.targets) fs.writeFileSync(path.join(fixture.dir, rel + ".map"), "old map");
    await assert.rejects(minifyStaged(fixture.dir, { jobs }), /minify: js\/zz-bad\.js:/);
    for (const [i, rel] of fixture.targets.entries()) {
      assert.equal(fs.readFileSync(path.join(fixture.dir, rel), "utf8"), fixture.sources[i]);
      assert.equal(fs.readFileSync(path.join(fixture.dir, rel + ".map"), "utf8"), "old map");
    }
    assert.equal(fs.readFileSync(path.join(fixture.dir, bad), "utf8"), "function {");
    assert.equal(fs.readdirSync(fixture.dir).some((name) => name.startsWith(".minify-")), false, "temporary results cleaned");
  }
});

// A local (non-Actions, non-release) env, so the skip below does not depend on the CI event.
function localEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (k.startsWith("GITHUB_")) delete env[k];
  delete env.APEX_RELEASE_BUILD;
  return env;
}

test("jobs1 does not import workers; unavailable Terser skips without changing staged bytes", (t) => {
  const fixture = minifyFixture(t);
  const loader = path.join(fixture.dir, "loader.mjs");
  fs.writeFileSync(loader, `export async function resolve(name, context, next) {
    if (name === process.env.APEX_MINIFY_BLOCK_IMPORT) throw Object.assign(new Error("fixture unavailable"), { code: "ERR_MODULE_NOT_FOUND" });
    return next(name, context);
  }`);
  const moduleURL = pathToFileURL(path.join(ROOT, "tools/desktop/minify.mjs")).href;
  const run = (blocked) => spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval",
    `import { minifyStaged } from ${JSON.stringify(moduleURL)}; console.log(JSON.stringify(await minifyStaged(${JSON.stringify(fixture.dir)}, { jobs: 1 })));`],
  { encoding: "utf8", env: { ...localEnv(), APEX_MINIFY_BLOCK_IMPORT: blocked } });
  const absent = run("terser");
  assert.equal(absent.status, 0, absent.stderr);
  assert.match(JSON.parse(absent.stdout).skipped, /terser is not installed/);
  for (const [i, rel] of fixture.targets.entries()) {
    assert.equal(fs.readFileSync(path.join(fixture.dir, rel), "utf8"), fixture.sources[i]);
    assert.equal(fs.existsSync(path.join(fixture.dir, rel + ".map")), false);
  }
  const serial = run("node:worker_threads");
  assert.equal(serial.status, 0, serial.stderr);
  assert.equal(JSON.parse(serial.stdout).files, fixture.targets.length);
  for (const [i, rel] of fixture.targets.entries()) {
    assert.notEqual(fs.readFileSync(path.join(fixture.dir, rel), "utf8"), fixture.sources[i]);
    assert.equal(JSON.parse(fs.readFileSync(path.join(fixture.dir, rel + ".map"))).sources[0], rel);
  }
});

test("a Terser task error joins every real worker before returning its source path", async (t) => {
  const fixture = minifyFixture(t);
  fs.writeFileSync(path.join(fixture.dir, fixture.targets[0]), "function {");
  const workers = [];
  class ObservedWorker extends Worker {
    constructor(...args) { super(...args); workers.push(this); }
  }
  await assert.rejects(minifyInWorkers({ siteRoot: fixture.dir, targets: fixture.targets,
    resultRoot: fixture.resultRoot, jobs: 2, WorkerClass: ObservedWorker }), /minify: js\/probe0\.js:/);
  assert.equal(workers.length, 2);
  assert.ok(workers.every((worker) => worker.threadId === -1), "task errors also drain the pool");
});

// A missing terser: a release build fails, a pull-request or local build stages
// source bytes and logs the choice (minify.mjs unminifiedPolicy).
test("unminifiedPolicy: release builds refuse, PR and local builds allow with a reason", () => {
  const cases = [
    [{}, true],
    [{ APEX_RELEASE_BUILD: "1" }, false],
    [{ APEX_RELEASE_BUILD: "true", GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" }, false],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" }, true],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "merge_group" }, true],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/tags/desktop-v1.0.0" }, false],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "push", GITHUB_REF: "refs/heads/claude/f1-game-project-26h3ng" }, false],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "workflow_dispatch" }, false],
    [{ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "schedule" }, false],
    [{ GITHUB_REF_TYPE: "tag" }, false],
  ];
  for (const [env, allow] of cases) {
    const p = unminifiedPolicy(env);
    assert.equal(p.allow, allow, JSON.stringify(env));
    assert.ok(p.reason.length > 0, "every verdict names its reason");
  }
});

test("minifyStaged without terser: throws in a release build, logs and skips in a PR build", (t) => {
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", ".minify-policy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "js"), { recursive: true });
  const src = "(function () { var longName = 1; return longName; })();\n";
  fs.writeFileSync(path.join(dir, "js", "a.js"), src);
  const loader = path.join(dir, "loader.mjs");
  fs.writeFileSync(loader, `export async function resolve(name, context, next) {
    if (name === "terser") throw Object.assign(new Error("fixture unavailable"), { code: "ERR_MODULE_NOT_FOUND" });
    return next(name, context);
  }`);
  const moduleURL = pathToFileURL(path.join(ROOT, "tools/desktop/minify.mjs")).href;
  const base = { ...process.env };
  for (const k of Object.keys(base)) if (k.startsWith("GITHUB_")) delete base[k];
  delete base.APEX_RELEASE_BUILD;
  const run = (extra) => spawnSync(process.execPath, ["--experimental-loader", loader, "--input-type=module", "--eval",
    `import { minifyStaged } from ${JSON.stringify(moduleURL)}; console.log(JSON.stringify(await minifyStaged(${JSON.stringify(dir)}, { jobs: 1 })));`],
  { encoding: "utf8", env: { ...base, ...extra } });

  const release = run({ APEX_RELEASE_BUILD: "1" });
  assert.notEqual(release.status, 0, "a release build must not stage unminified");
  assert.match(release.stderr, /a release build must minify js\/ \(APEX_RELEASE_BUILD is set\)/);

  const pr = run({ GITHUB_ACTIONS: "true", GITHUB_EVENT_NAME: "pull_request" });
  assert.equal(pr.status, 0, pr.stderr);
  assert.match(JSON.parse(pr.stdout).skipped, /allowed: GitHub Actions pull_request build/);
  assert.match(pr.stderr, /::warning::stage: terser is not installed/);
  assert.equal(fs.readFileSync(path.join(dir, "js", "a.js"), "utf8"), src, "skipped stage keeps source bytes");
});

/* ── the shell: css/*.css and index.html (#5050) ───────────────────────── */
// The `{` count outside comments and strings: one per rule block, the cheap
// rule-count proxy the issue names (the CSSOM comparison is the PR's probe).
function braces(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/g, "").split("{").length - 1;
}
const CSS_FILES = fs.readdirSync(path.join(ROOT, "css")).filter((f) => f.endsWith(".css")).sort();

test("#5050 minifyCss: every css/*.css keeps its rule count and loses every comment but /*!", () => {
  for (const f of CSS_FILES) {
    const src = read("css/" + f);
    const min = minifyCss(src, f);
    assert.equal(braces(min), braces(src), `${f}: rule blocks`);
    assert.deepEqual(min.match(/\/\*(?!!)/g), null, `${f}: no plain comment survives`);
    assert.equal(min.length < src.length, true, `${f}: smaller`);
    assert.equal(minifyCss(min, f), min, `${f}: idempotent`);
  }
});

test("#5050 minifyCss: strings, url() bodies and token seams are kept exactly", () => {
  assert.equal(minifyCss('a  ,\n  b  {  content: "x  /* y */  z" ;  }'), 'a , b{content: "x  /* y */  z"}\n');
  assert.equal(minifyCss(".a { background: url( a  b.png ) ; margin: 1px/**/solid; }"), ".a{background: url( a  b.png );margin: 1px solid}\n");
  assert.equal(minifyCss(".a/* c */.b { --x: ; }"), ".a.b{--x: ;}\n");
  assert.equal(minifyCss("/*! keep */\n/* drop */ .a{ color : red }"), "/*! keep */ .a{color : red}\n");
  assert.equal(minifyCss("@media (min-width: 600px) {\n  .a > .b + .c { width: calc(1px + 2px) !important; }\n}\n"),
    "@media (min-width: 600px){.a > .b + .c{width: calc(1px + 2px) !important}}\n");
  assert.throws(() => minifyCss("a { /* open"), /unterminated comment/);
});

test("#5050 minifyShellHtml: comments go, the tag list stays, every inline script's CSP hash matches its staged body", async () => {
  const src = read("index.html");
  const tags = (h) => [...h.replace(/<!--[\s\S]*?-->/g, "").matchAll(/<(?:script|link)\b[^>]*>/gi)].map((m) => m[0]).filter((t) => !/http-equiv/.test(t));
  const { minify: terserMinify } = await import("terser");
  const minifyScript = async (body) => (await terserMinify(body, { ...MINIFY_OPTIONS, format: { ...MINIFY_OPTIONS.format } })).code;
  const out = await minifyShellHtml(src, { minifyScript });
  assert.deepEqual(out.match(/<!--/g), null, "no HTML comment left");
  assert.deepEqual(tags(out), tags(src), "every <script>/<link> tag (src, href, media, type) is byte-identical");
  const bodies = inlineScripts(out);
  assert.equal(bodies.length, inlineScripts(src).length, "same inline scripts");
  const meta = out.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
  assert.equal(meta[1], cspFor(out), "the CSP is regenerated for the staged bodies");
  for (const b of bodies) assert.equal(meta[1].includes(scriptHash(b).slice(1, -1)), true, "hashed: " + b.slice(0, 40));
  assert.equal(bodies.find((b) => b.trim().startsWith("{")), inlineScripts(src).find((b) => b.trim().startsWith("{")), "the importmap is not touched");
  assert.equal(out.length < src.length, true);
  const keep = await minifyShellHtml(src, { minifyScript: null });
  assert.deepEqual(inlineScripts(keep), inlineScripts(src), "no terser: bodies and so the CSP are unchanged");
  assert.deepEqual(keep.match(/<!--/g), null, "comments go without terser too");
  assert.equal(await minifyShellHtml("<p>a</p>\n  <!-- x -->\n<p>b<!-- y --></p>\n<script>//<!-- kept\n</script>\n"),
    "<p>a</p>\n<p>b</p>\n<script>//<!-- kept\n</script>\n", "a comment's own line goes; script data is never scanned");
});

test("#5050 minifyStagedShell: a staged css/ and index.html are rewritten in place, totals reported", async (t) => {
  const tmp = fs.mkdtempSync(path.join(ROOT, "scratch", "stage-shell-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  fs.mkdirSync(path.join(tmp, "css"));
  for (const f of ["tokens.css", "title.css"]) fs.copyFileSync(path.join(ROOT, "css", f), path.join(tmp, "css", f));
  fs.copyFileSync(path.join(ROOT, "index.html"), path.join(tmp, "index.html"));
  assert.deepEqual(cssTargets(tmp), ["css/title.css", "css/tokens.css"]);
  const r = await minifyStagedShell(tmp);
  assert.equal(r.css.files, 2);
  assert.equal(r.css.before, Buffer.byteLength(read("css/tokens.css")) + Buffer.byteLength(read("css/title.css")));
  assert.equal(r.css.after, fs.statSync(path.join(tmp, "css/tokens.css")).size + fs.statSync(path.join(tmp, "css/title.css")).size);
  assert.equal(r.html.after, fs.statSync(path.join(tmp, "index.html")).size);
  assert.equal(r.html.scripts, await canMinify());
  assert.equal(fs.readFileSync(path.join(tmp, "css/tokens.css"), "utf8"), minifyCss(read("css/tokens.css"), "css/tokens.css"));
});
