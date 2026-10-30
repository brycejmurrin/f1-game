/* profile-lib.test.mjs — tools/perf/lib.mjs: median/spread aggregation and the
 * "a delta inside the spread is noise" rule. Run: node --test tests/unit/profile-lib.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import * as espree from "espree";
import { aggregate, diff, verdict, formatDiff, formatTable, median, intervalStats } from "../../tools/perf/lib.mjs";

const run = (p50, p95 = p50 * 2) => ({ spans: { physics: { p50, p95, p99: p95, max: p95, n: 100 } } });

test("median and aggregate: median across repeats, spread = max-min", () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5);
  const a = aggregate([run(1.0), run(1.2), run(1.1)]).physics;
  assert.equal(a.p50, 1.1); assert.equal(a.spread50, 0.2); assert.equal(a.runs, 3); assert.equal(a.n, 300);
});

test("a delta inside the spread is noise, outside it is a WIN / REGRESS", () => {
  const base = aggregate([run(1.0), run(1.2), run(1.1)]);   // spread 0.2
  const same = aggregate([run(1.15), run(1.0), run(1.1)]);
  assert.equal(diff(base, same)[0].verdict, "noise");
  const faster = aggregate([run(0.5), run(0.55), run(0.52)]);
  assert.equal(diff(base, faster)[0].verdict, "WIN");
  const slower = aggregate([run(2.0), run(2.1), run(2.05)]);
  assert.equal(diff(base, slower)[0].verdict, "REGRESS");
});

test("fewer than 3 repeats prove nothing; raf is info; a span on one side only is n/a", () => {
  const one = aggregate([run(1), run(1.1)]), other = aggregate([run(0.1), run(0.1)]);
  assert.equal(diff(one, other)[0].verdict, "unproven");
  const raf = (x) => aggregate([1, 2, 3].map(() => ({ spans: { raf: { p50: x, p95: x, p99: x, max: x, n: 9 } } })));
  assert.equal(diff(raf(10), raf(1))[0].verdict, "info");
  assert.equal(verdict(null, one.physics), "n/a");
  const d = diff({}, one); assert.equal(d[0].dp50, null); assert.equal(d[0].verdict, "n/a");
});

test("tables render and sort by p50", () => {
  const agg = aggregate([{ spans: { a: { p50: 1, p95: 2, p99: 2, max: 3, n: 5 }, b: { p50: 4, p95: 5, p99: 5, max: 6, n: 5 } } }]);
  assert.match(formatTable(agg).split("\n")[1], /^b /);
  assert.match(formatDiff(diff(agg, agg), "x", "y"), /A\/B  base=x  head=y/);
});

test("intervalStats", () => {
  assert.equal(intervalStats([]), null);
  assert.equal(intervalStats([10, 20, 30, 40]).p50, 20);
});

import { summariseCpu } from "../../tools/perf/query.mjs";
test("summariseCpu: self vs total, fn filter", () => {
  const cf = (functionName, url = "game.js") => ({ functionName, url, lineNumber: 0 });
  const profile = { nodes: [{ id: 1, callFrame: cf("root"), children: [2] }, { id: 2, callFrame: cf("update"), children: [3] }, { id: 3, callFrame: cf("collide") }], samples: [2, 3, 3, 3] };
  const s = summariseCpu(profile);
  const upd = s.bySelf.find((r) => r.fn === "update"), col = s.bySelf.find((r) => r.fn === "collide");
  assert.equal(upd.selfPct, 25); assert.equal(upd.totalPct, 100); assert.equal(col.selfPct, 75);
  assert.equal(summariseCpu(profile, { fn: "^coll" }).bySelf.length, 1);
});

test("incomparable: arms with different capture modes never read as noise/WIN/REGRESS", async () => {
  const { supportsCaptureKey } = await import("../../tools/perf/lib.mjs");
  assert.equal(supportsCaptureKey(["x", 'sessionStorage.getItem("apex26.wgxCapture")']), true);
  assert.equal(supportsCaptureKey(["x", ""]), false);
  const base = aggregate([run(1300), run(1200), run(1400)]), head = aggregate([run(54), run(50), run(60)]);
  assert.equal(diff(base, head)[0].verdict, "WIN");
  const r = diff(base, head, { incomparable: true })[0];
  assert.equal(r.verdict, "incomparable"); assert.equal(r.verdict95, "incomparable");
});


import { profileScenario, profileScenarioSignature, profileComparability } from "../../tools/perf/lib.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scenario = () => profileScenario({ track: "monaco", frames: 40,
  viewport: { width: 320, height: 180, deviceScaleFactor: 1 }, capture: "disabled",
  environment: { backend: "three", api: "webgl2", device: "ANGLE SwiftShader", browser: "Chromium 140" } });

test("saved profiles require complete matching workload, capture and observed renderer", () => {
  const base = { scenario: scenario() }, head = { scenario: scenario() };
  assert.equal(profileComparability(base, head).comparable, true);
  assert.equal(profileScenarioSignature(base.scenario), profileScenarioSignature({ ...head.scenario, environment: { ...head.scenario.environment } }));
  for (const [key, value] of [["track", "monza"], ["frames", 600], ["capture", "enabled"], ["warmupFrames", 10], ["workload", "different-v2"], ["version", 2]]) {
    assert.equal(profileComparability(base, { scenario: { ...scenario(), [key]: value } }).comparable, false, key);
  }
  for (const key of ["backend", "api", "device", "browser"]) {
    const changed = scenario(); changed.environment[key] += " changed";
    assert.equal(profileComparability(base, { scenario: changed }).comparable, false, key);
    delete changed.environment[key];
    assert.equal(profileScenarioSignature(changed), null, key + " unknown");
  }
  for (const key of ["width", "height", "deviceScaleFactor"]) {
    const changed = scenario(); changed.viewport[key] *= 2;
    assert.equal(profileComparability(base, { scenario: changed }).comparable, false, key);
  }
  assert.equal(profileComparability({ track: "monaco", frames: 40 }, head).comparable, false, "legacy reports cannot establish capture/renderer");
  assert.equal(profileScenarioSignature({ ...scenario(), frames: NaN }), null);
});

// Evaluate the actual browser callbacks without importing the CLI (which starts
// Chromium). AST extraction avoids a duplicate implementation or a new API.
function profileCallbacks(apex) {
  const source = readFileSync(new URL("../../tools/perf/profile.mjs", import.meta.url), "utf8");
  const ast = espree.parse(source, { ecmaVersion: "latest", sourceType: "module", range: true });
  const declarations = ["prepareRace", "measureSteps"].map(name => {
    const node = ast.body.find(n => n.type === "FunctionDeclaration" && n.id.name === name);
    assert.ok(node, name); return source.slice(...node.range);
  });
  const ctx = vm.createContext({ window: { __apex: apex }, track: "monza", WAIT_MS: 30000, performance });
  vm.runInContext(declarations.join("\n"), ctx, { filename: absSrc("tools/perf/profile.mjs") });
  return ctx;
}

test("profile race setup seeds before creation, awaits readiness and rejects an unbuilt world", async () => {
  const events = []; let built = false, state = "menu", actual = "bahrain";
  const apex = {
    seed: n => events.push(["seed", n]),
    race: t => { events.push(["race", t]); return { track: t, then(resolve) {
      events.push(["settled"]); built = true; state = "count"; actual = t; resolve({ track: t });
    } }; },
    info: () => ({ track: actual, state, n: built ? 100 : 0, total: built ? 1000 : 0 }),
    fieldState: () => built ? [{ id: 0, lap: 0, frac: 0 }, { id: 1, lap: 0, frac: 0.1 }] : [],
  };
  const ctx = profileCallbacks(apex);
  const page = { evaluate: (fn, arg) => fn(arg), waitForFunction: (fn, arg) => {
    events.push(["ready"]); assert.equal(fn(arg), true, "must observe the actual built world and grid");
  } };
  await ctx.prepareRace(page);
  assert.deepEqual(events, [["seed", 42], ["race", "monza"], ["settled"], ["ready"]]);
  apex.race = t => ({ track: t }); // old refs may return a plain descriptor
  await ctx.prepareRace(page);
  actual = "bahrain";
  await assert.rejects(ctx.prepareRace(page), /actual built world/);
  actual = "monza"; state = "menu";
  await assert.rejects(ctx.prepareRace(page), /actual built world/);
  state = "count"; built = false;
  await assert.rejects(ctx.prepareRace(page), /actual built world/);
  apex.race = () => Promise.resolve(false);
  await assert.rejects(ctx.prepareRace(page), /race setup rejected/);
  apex.race = () => Promise.reject(new Error("entry failed"));
  await assert.rejects(ctx.prepareRace(page), /entry failed/);
});

test("profile fixed-step samples require real motion, count the final partial batch and restore input/rendering", () => {
  const steps = [], cleanup = []; let prog = 0, moves = true, reset = true;
  const ctx = profileCallbacks({
    go: () => "race", reset: () => reset && {}, info: () => ({ state: "race" }),
    headless: v => cleanup.push(["headless", v]), clearInput: () => cleanup.push(["clear"]), setInput() {},
    step: (dt, n) => { assert.equal(dt, 1 / 60); steps.push(n); if (moves) prog += n; },
    fieldState: () => [{ id: 0, lap: 0, frac: prog / 1000 }, { id: 1, lap: 0, frac: (prog + 10) / 1000 }],
  });
  const result = ctx.measureSteps({ n: 101, w: 3 });
  assert.equal(steps.reduce((a, b) => a + b, 0), 104, "three warm steps plus exactly 101 measured steps");
  assert.equal(steps.at(-1), 1); assert.equal(result.spans.step.n, 11); assert.equal(result.cars, 2);
  assert.deepEqual(cleanup, [["headless", true], ["clear"], ["headless", false]]);
  moves = false; cleanup.length = 0;
  assert.throws(() => ctx.measureSteps({ n: 100, w: 0 }), /did not advance/);
  assert.deepEqual(cleanup, [["headless", true], ["clear"], ["headless", false]]);
  reset = false;
  assert.throws(() => ctx.measureSteps({ n: 100, w: 0 }), /reset failed/);
  reset = true; prog = NaN;
  assert.throws(() => ctx.measureSteps({ n: 100, w: 0 }), /invalid field/);
});

test("query CLI never awards a win to incompatible or unknown saved profiles; matching captures retain noise rule", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const parent = join(root, "artifacts/profiles"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "compare-unit-"));
  const baseline = { scenario: scenario(), head: aggregate([run(10), run(10), run(10)]) };
  const candidate = { scenario: scenario(), head: aggregate([run(1), run(1), run(1)]) };
  const query = (a, b) => {
    writeFileSync(join(dir, "base.json"), JSON.stringify(a)); writeFileSync(join(dir, "head.json"), JSON.stringify(b));
    const p = spawnSync(process.execPath, [join(root, "tools/perf/query.mjs"), join(dir, "base.json"), join(dir, "head.json"), "--json"], { encoding: "utf8", timeout: 5000 });
    assert.equal(p.status, 0, p.stderr);
    return { rows: JSON.parse(p.stdout), warning: p.stderr };
  };
  try {
    assert.equal(query(baseline, candidate).rows[0].verdict, "WIN");
    const incompatible = { ...candidate, scenario: { ...scenario(), track: "monza", frames: 600 } };
    let r = query(baseline, incompatible);
    assert.equal(r.rows[0].verdict, "incomparable"); assert.equal(r.rows[0].verdict95, "incomparable");
    assert.match(r.warning, /incompatible/); assert.equal(r.rows[0].pct50, -90, "observations stay available without a win");
    r = query({ track: "monaco", frames: 40, head: baseline.head }, { track: "monza", frames: 600, head: candidate.head });
    assert.equal(r.rows[0].verdict, "incomparable"); assert.match(r.warning, /unknown scenario/);
    const slower = { ...candidate, head: aggregate([run(20), run(20), run(20)]) };
    assert.equal(query(baseline, slower).rows[0].verdict, "REGRESS");
    assert.equal(query(baseline, { ...slower, scenario: null }).rows[0].verdict, "incomparable");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("CPU summaries preserve full source and column identity, including pipe characters", () => {
  const cf = (url, columnNumber = 0) => ({ functionName: "up|date", url, scriptId: "7", lineNumber: 10, columnNumber });
  const profile = { nodes: [
    { id: 1, callFrame: { functionName: "root", url: "", lineNumber: -1 }, children: [2, 3, 4] },
    { id: 2, callFrame: cf("http://localhost/js/circuits/monza.js") },
    { id: 3, callFrame: cf("http://localhost/js/circuits/scenery/monza.js") },
    { id: 4, callFrame: cf("http://localhost/js/circuits/scenery/monza.js", 20) },
  ], samples: [2, 3, 3, 4] };
  const rows = summariseCpu(profile, { fn: "up\\|date" }).bySelf;
  assert.equal(rows.length, 3);
  assert.equal(rows.find(r => r.loc.endsWith("/circuits/monza.js:11:1")).selfPct, 25);
  assert.equal(rows.find(r => r.loc.endsWith("/scenery/monza.js:11:1")).selfPct, 50);
  assert.equal(rows.find(r => r.loc.endsWith("/scenery/monza.js:11:21")).selfPct, 25);
  assert.equal(summariseCpu(profile, { file: "scenery" }).bySelf.length, 2);
  assert.equal(summariseCpu({ nodes: [] }).samples, 0, "empty profile has no observed samples");
});

test("CPU summaries reject cyclic and ambiguous saved trees instead of hanging or misattributing samples", () => {
  const node = (id, children = []) => ({ id, callFrame: { functionName: "update", url: "game.js", lineNumber: 0 }, children });
  for (const nodes of [
    [node(1, [1])], [node(1, [2]), node(2, [1])],
    [node(1), node(2, [3]), node(3, [2])], // unreachable cycle also invalid
    [node(1, [3]), node(2, [3]), node(3)],
    [node(1, [99])], [node(1), node(1)],
  ]) assert.throws(() => summariseCpu({ nodes, samples: [1] }), /invalid CPU profile/);
  assert.throws(() => summariseCpu({ nodes: [node(1)], samples: [99] }), /unknown sample/);
  const deep = Array.from({ length: 10000 }, (_, i) => node(i, i < 9999 ? [i + 1] : []));
  assert.equal(summariseCpu({ nodes: deep, samples: [9999] }).bySelf[0].totalPct, 100, "iterative validation handles deep stacks");
});

test("query CLI handles shared flag spellings and rejects invalid limits, cyclic artifacts and symlink escapes", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const parent = join(root, "scratch"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "profile-query-unit-"));
  const file = join(dir, "cpu.cpuprofile");
  const cf = functionName => ({ functionName, url: "http://localhost/js/game.js", lineNumber: 0 });
  writeFileSync(file, JSON.stringify({ nodes: [{ id: 1, callFrame: cf("root"), children: [2] }, { id: 2, callFrame: cf("update") }], samples: [2] }));
  const query = (...args) => spawnSync(process.execPath, [join(root, "tools/perf/query.mjs"), ...args], { encoding: "utf8", timeout: 3000 });
  try {
    for (const args of [["--top=1"], ["--top", "1"]]) {
      const r = query(file, "--json", ...args);
      assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).bySelf.length, 1);
    }
    const filtered = query(file, "--json", "--fn=^update$", "--file=js/game");
    assert.equal(filtered.status, 0, filtered.stderr); assert.equal(JSON.parse(filtered.stdout).bySelf[0].fn, "update");
    for (const args of [["--top"], ["--top=0"], ["--top=-1"], ["--top=1.5"], ["--top=101"], ["--top=Infinity"], ["--fn"], ["--file"]]) {
      const r = query(file, ...args); assert.equal(r.status, 1, args.join(" ")); assert.match(r.stderr, /must be|requires/); assert.equal(r.stdout, "");
    }
    const link = join(dir, "outside.json"); symlinkSync(join(root, "package.json"), link);
    const escaped = query(link, "--json"); assert.equal(escaped.status, 1); assert.match(escaped.stderr, /must be under/); assert.equal(escaped.stdout, "");
    writeFileSync(file, JSON.stringify({ nodes: [{ id: 1, callFrame: cf("root"), children: [1] }], samples: [1] }));
    const cycle = query(file, "--json"); assert.equal(cycle.status, 1, cycle.error?.message); assert.match(cycle.stderr, /cycle/); assert.equal(cycle.stdout, "");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("profile child modes preserve numeric exits and reject signal or spawn failure", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const scratch = join(root, "scratch"); mkdirSync(scratch, { recursive: true });
  const dir = mkdtempSync(join(scratch, "profile-child-unit-"));
  const cli = join(dir, "tools/perf/profile.mjs");
  try {
    for (const sub of ["tools/perf", "tools/lib", "tools/shot", "tools/gfx"]) mkdirSync(join(dir, sub), { recursive: true });
    // Run the real CLI dispatch and wrapper with inert profiler children. Any
    // unexpected browser work fails immediately rather than starting Chromium.
    writeFileSync(cli, readFileSync(join(root, "tools/perf/profile.mjs"), "utf8"));
    for (const file of ["tools/perf/lib.mjs", "tools/lib/cli-args.mjs"])
      writeFileSync(join(dir, file), readFileSync(join(root, file), "utf8"));
    writeFileSync(join(dir, "tools/lib/harness.mjs"), `
      export function launchChromium() { throw new Error("unexpected browser launch"); }
      export function startStaticServer() { throw new Error("unexpected server launch"); }
      export async function shutdown() {}
    `);
    const child = `
      console.error("inert profiler diagnostic");
      if (process.argv[2] === "signal") process.kill(process.pid, "SIGTERM");
      else process.exit(Number(process.argv[2]));
    `;
    for (const file of ["tools/shot/profile-gameloop.mjs", "tools/gfx/frame-hitch.mjs"])
      writeFileSync(join(dir, file), child);
    const invoke = (mode, arg, env = process.env) => spawnSync(process.execPath,
      [cli, arg, "--mode", mode], { cwd: dir, env, encoding: "utf8", timeout: 3000 });
    for (const mode of ["cpu", "hitch"]) {
      for (const code of [0, 7]) {
        const r = invoke(mode, String(code));
        assert.equal(r.status, code, `${mode} numeric exit: ${r.stderr}`);
        assert.match(r.stderr, /inert profiler diagnostic/, "child stderr remains inherited");
      }
      const signalled = invoke(mode, "signal");
      assert.notEqual(signalled.status, 0, `${mode}: a signalled child must not report success`);
      assert.match(signalled.stderr, /SIGTERM/, "the terminal diagnostic names the signal");
      const missing = invoke(mode, "0", { ...process.env, PATH: dir });
      assert.notEqual(missing.status, 0, `${mode}: failed node spawn must not report success`);
      assert.match(missing.stderr, /ENOENT/, "spawn failure is visible in the terminal diagnostic");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
