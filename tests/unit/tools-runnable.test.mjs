/* tools-runnable.test.mjs — every tool must at least PARSE, and the tool
 * surface an agent reaches through MCP must answer.
 *
 * docs-integrity.test.mjs guards the tools/README index in both directions, so
 * a tool cannot be undocumented and a row cannot be a ghost. Neither direction
 * says the file RUNS. A tool with a syntax error is indexed, documented, and
 * completely inaccessible — and the failure surfaces only when someone reaches
 * for it mid-task, which is the worst moment to discover it. Measured
 * 2026-08-17: a backtick inside a comment in a WGSL template literal took a
 * whole module out, and only a hand-run `bash -n` caught a shell edit.
 *
 * PARSE ONLY for the general sweep — these tools launch browsers, write
 * captures and hit networks, so executing them here would be its own outage.
 * The few entry points with a side-effect-free help path are exercised for real.
 *
 * SPLIT 2026-11-11 (#3043 T5-12): this file keeps the parse sweep and the
 * verdict bans; the help paths are tools-runnable-cli, the report server is
 * tools-runnable-report, the survey / AI / profile instruments are
 * tools-runnable-instruments. Shared walk: tests/helpers/tools-tree.mjs.
 *
 * Run: node --test tests/unit/tools-runnable.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeClosedDbFaults, makeStorageFaults } from "../helpers/storage-faults.mjs";
import { ROOT, FILES, tool } from "../helpers/tools-tree.mjs";

test("storage fault fixtures deterministically model denial, quota, corruption and closed IDB", () => {
  const f = makeStorageFaults({ initial: { "apex26.save": '{"v":1}' }, quotaBytes: 20 });
  assert.equal(f.storage.getItem("apex26.save"), '{"v":1}');
  f.set({ read: true });
  assert.throws(() => f.storage.getItem("apex26.save"), { name: "SecurityError" });
  f.set({ read: false, write: true });
  assert.throws(() => f.storage.setItem("apex26.save", "x"), { name: "SecurityError" });
  f.set({ write: false, quotaBytes: 1 });
  assert.throws(() => f.storage.setItem("apex26.save", "too large"), { name: "QuotaExceededError" });
  f.set({ quotaBytes: Infinity }).corrupt("apex26.save", "not-json");
  assert.equal(f.storage.getItem("apex26.save"), "not-json");
  const closed = makeClosedDbFaults();
  closed.close();
  assert.throws(() => closed.db.transaction("kv"), { name: "InvalidStateError" });
  assert.deepEqual(closed.events.map((e) => e.fault || e.op), ["close", "InvalidStateError"]);
});

test("the sweep sees the whole tools tree (a silent empty list proves nothing)", () => {
  assert.ok(FILES.length >= 70, `expected the full tool set, walked ${FILES.length}`);
  for (const name of ["mcp-cli.mjs", "probe-mcp.py", "manifest.cjs"]) {
    assert.ok(FILES.some((f) => f.rel.endsWith(name)), `${name} missing from the walk`);
  }
});

test("every JS tool parses (node --check)", () => {
  const broken = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    const r = spawnSync(process.execPath, ["--check", f.abs], { encoding: "utf8" });
    if (r.status !== 0) broken.push(`${f.rel}: ${(r.stderr || "").split("\n").find((l) => l.includes("Error")) || "exit " + r.status}`);
  }
  assert.deepEqual(broken, [], "a JS tool does not parse");
});

test("no tool derives a path from import.meta.url.pathname (Windows-broken)", () => {
  // `new URL("..", import.meta.url).pathname` is `/D:/a/repo/` on Windows, and
  // path.resolve() then prefixes the cwd's drive to give a path that cannot
  // exist. tools/gfx/gpu-game-check.mjs is the one tool the GPU-census workflow runs
  // on windows-latest, and this cost it every request 404ing, the game never
  // booting, and a 5-minute timeout that reported nothing — twice, because the
  // first diagnosis blamed the machine and raised the timeout.
  // It also mishandles percent-encoding, so a checkout path containing a space
  // breaks the same way on Linux. fileURLToPath is correct everywhere.
  const bad = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    if (/import\.meta\.url\s*\)\s*\.pathname/.test(fs.readFileSync(f.abs, "utf8"))) bad.push(f.rel);
  }
  assert.deepEqual(bad, [],
    `these tools derive a path from import.meta.url .pathname:\n  ${bad.join("\n  ")}\n\n` +
    `Use fileURLToPath instead:\n` +
    `  import { fileURLToPath } from "node:url";\n` +
    `  const ROOT = fileURLToPath(new URL("..", import.meta.url)).replace(/[\\\\/]$/, "");\n` +
    `Reason: docs/PERF-FINDINGS.md 2f.`);
});

// Comments must NOT be scanned. Every ban below has to be explainable in prose
// beside the code that enforces it, and a scanner that matches its own
// documentation is useless twice over: it fires on the comment describing the
// bug, and — worse — a check written to confirm a fix was removed reports
// success because the fix's COMMENT still quotes it. That happened in this
// session, on this very idiom, while verifying the sabotage below.
function stripComments(src) {
  return src
    .replace(/\/\*[^]*?\*\//g, " ")   // block comments (JSDoc, banners)
    .replace(/^[ \t]*\/\/.*$/gm, " ") // whole-line // comments
    .replace(/([^:"'`\\])\/\/.*$/gm, "$1"); // trailing // comments
}

test("the comment stripper actually strips (or every ban below is vacuous)", () => {
  // The stripper is load-bearing for the ratchet that follows, so it gets its
  // own proof rather than being taken on trust.
  const src = [
    '// (a.b || 0) > 0',
    '/* (c.d || 0) > 0 */',
    'const x = 1; // (e.f || 0) > 0',
    'const keep = (g.h || 0) > 0;',
  ].join("\n");
  const out = stripComments(src);
  assert.equal((out.match(/\|\| 0\) > 0/g) || []).length, 1,
    `the stripper left commented code behind:\n${out}`);
  assert.equal(out, " \n \nconst x = 1; \nconst keep = (g.h || 0) > 0;", "the stripper ate real code");
});

// `(x || 0) > 0` cannot tell "measured zero" from "measured nothing", and in a
// TOOL or a WORKFLOW that comparison IS the verdict. Two shipped defects had
// exactly this shape: `(gfx.gpuErrors || 0) > 0` passed vacuously on the GLX
// leg from the day that leg was added, and `(env.fail || 0) > 0` sat twelve
// lines below the comment explaining the first one, on the same object.
// docs/PERF-FINDINGS.md 2e, 2j.
//
// Deliberately NOT applied to js/: `(ctx.speed || 0) > 0` in js/physics/ai-drive.js
// is a gameplay predicate on a state object that genuinely defaults to zero, not
// a reading from an instrument. Banning it there would be noise, and a noisy ban
// gets widened or ignored — which is how this class survived in the first place.
const COERCED_VERDICT = /\(\s*[A-Za-z_$][A-Za-z0-9_$.]*(\([^()]*\))?\s*(\|\||\?\?)\s*0\s*\)\s*(>=|>|<=|<|!==|!=|===|==)\s*0/;

// Frozen count, the size-ratchet idiom: existing entries are tolerated
// and named, new ones are the defect. Shrinking this is progress.
const COERCED_TOLERATED = {
  // `(d.cost || 0) > 0` over the parts CATALOG — product data this repo owns,
  // read from a loaded module, not a reading taken from a running system. A
  // part with no `cost` field costs nothing, so absent and zero are the same
  // fact and the coercion states it rather than hiding it. Nothing downstream
  // reports a verdict about whether the measurement happened.
  "parts-ladder.mjs": 1,
};

test("no tool decides a verdict by comparing a coerced measurement to zero", () => {
  const bad = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    const lines = stripComments(fs.readFileSync(f.abs, "utf8")).split("\n");
    const hits = lines.map((l, i) => (COERCED_VERDICT.test(l) ? `${f.rel}:${i + 1}: ${l.trim()}` : null)).filter(Boolean);
    const allowed = COERCED_TOLERATED[path.basename(f.rel)] || 0;
    if (hits.length > allowed) bad.push(...hits.slice(allowed));
  }
  assert.deepEqual(bad, [],
    `these tools coerce a measurement and then compare it to zero:\n  ${bad.join("\n  ")}\n\n` +
    `An absent reading is not a zero reading. Test for absence first:\n` +
    `  if (x == null) fail("NO count reported — this check would pass vacuously");\n` +
    `  else if (x > 0) fail(...);\n` +
    `Reason: docs/PERF-FINDINGS.md 2e, 2j.`);
});

test("no workflow decides a gate by comparing a coerced measurement to zero", () => {
  // Hard zero, no tolerated list: a comparison in a workflow is always a gate.
  const dir = path.join(ROOT, ".github/workflows");
  const wfs = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));
  // Corpus floor, same reasoning as the tools walk above: a silent empty list
  // proves nothing, and this one reads a directory the tools walk never enters.
  assert.ok(wfs.length >= 3, `expected the workflow set, found ${wfs.length}`);
  assert.ok(wfs.includes("gpu-census.yml"), "gpu-census.yml missing from the walk");

  const bad = [];
  for (const w of wfs) {
    const lines = stripComments(fs.readFileSync(path.join(dir, w), "utf8")).split("\n");
    lines.forEach((l, i) => { if (COERCED_VERDICT.test(l)) bad.push(`.github/workflows/${w}:${i + 1}: ${l.trim()}`); });
  }
  assert.deepEqual(bad, [],
    `these workflow gates coerce a measurement and then compare it to zero:\n  ${bad.join("\n  ")}\n\n` +
    `Absence must fail, not read as clean. Reason: docs/PERF-FINDINGS.md 2e, 2j.`);
});

test("the coerced-verdict ceiling has not been left far above the real count", () => {
  // The other failure mode, copied from the bareCatches ratchet (tests/data/ratchets.json): fix
  // the last instance, never lower the ceiling, and the ratchet silently stops
  // ratcheting. Every tolerated entry must still be earning its slot.
  const slack = [];
  for (const [rel, allowed] of Object.entries(COERCED_TOLERATED)) {
    // Keys are BASENAMES (the subdirectory a tool sits in is not part of the
    // tolerance) — resolved through FILES so a renamed or deleted tool fails
    // here instead of leaving a permanent free pass behind.
    const f = FILES.find((x) => path.basename(x.rel) === rel);
    assert.ok(f, `${rel} is tolerated but the walk no longer sees it — drop the entry`);
    const lines = stripComments(fs.readFileSync(f.abs, "utf8")).split("\n");
    const n = lines.filter((l) => COERCED_VERDICT.test(l)).length;
    if (n < allowed) slack.push(`${rel}: ${n} left but ${allowed} tolerated — lower it to ${n}`);
  }
  assert.deepEqual(slack, [], "a tolerated count drifted above its file — lower it");
});

test("every shell tool parses (bash -n)", () => {
  const broken = [];
  for (const f of FILES) {
    if (f.ext !== ".sh") continue;
    const r = spawnSync("bash", ["-n", f.abs], { encoding: "utf8" });
    if (r.status !== 0) broken.push(`${f.rel}: ${(r.stderr || "").trim().split("\n")[0]}`);
  }
  assert.deepEqual(broken, [], "a shell tool does not parse");
});

test("cloud-agent install is offline-tolerant (npm ECONNRESET must not fail a usable snapshot)", () => {
  const browsers = fs.readFileSync(tool("install-browsers.sh"), "utf8");
  const cloud = fs.readFileSync(tool("cloud-agent-install.sh"), "utf8");
  assert.match(browsers, /--no-audit/);
  assert.match(browsers, /--prefer-offline/);
  assert.match(browsers, /node_modules\/playwright\/package\.json/);
  assert.match(browsers, /node_modules\/playwright\/cli\.js/);
  assert.match(browsers, /Exit handler never called/);
  assert.doesNotMatch(browsers, /^set -e/m);
  assert.match(cloud, /mesa-vulkan-drivers/);
  assert.match(cloud, /install-browsers\.sh/);
  assert.match(cloud, /tools\/lib\/chromium-path\.mjs/);
  assert.match(cloud, /--path/);
  assert.match(cloud, /node_modules\/playwright\/package\.json/);
  assert.doesNotMatch(cloud, /^set -e/m);
});

test("every python tool parses (compile)", () => {
  const broken = [];
  for (const f of FILES) {
    if (f.ext !== ".py") continue;
    const r = spawnSync("python3", ["-c",
      "import ast,sys; ast.parse(open(sys.argv[1]).read(), sys.argv[1])", f.abs], { encoding: "utf8" });
    if (r.status !== 0) broken.push(`${f.rel}: ${(r.stderr || "").trim().split("\n").pop()}`);
  }
  assert.deepEqual(broken, [], "a python tool does not parse");
});

test("every JSON asset in tools/ parses", () => {
  const broken = [];
  for (const f of FILES) {
    if (f.ext !== ".json") continue;
    try { JSON.parse(fs.readFileSync(f.abs, "utf8")); }
    catch (e) { broken.push(`${f.rel}: ${e.message}`); }
  }
  assert.deepEqual(broken, [], "a JSON asset in tools/ does not parse");
});
