// Bounded negative contracts: an invalid or uncovered request cannot report green.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import vm from "node:vm";
import { selectionReceipt, validateSelectionArgs } from "../../tools/ci/pick-tests.mjs";
import { cachedPlan, returnTo } from "../../tools/ci/sync-pr.mjs";
import { sessionId, main as whoMain } from "../../tools/ci/who-is-on-it.mjs";
import { episodeLeaks } from "../../tools/check/episode-diff.mjs";
import { update, updateReceipt, DATA } from "../../tools/check/ratchets.mjs";
import { project, main as importMain } from "../../tools/track/import-circuit-path.mjs";
import { validatePresets, presetChanges } from "../../tools/lighting/preset-validation.mjs";
import { skyDepthErrors } from "../../tools/gfx/wgx-validate.mjs";
import { encodePNG, decodePNG } from "../../tools/gen/assets.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const cli = (file, args = [], env = {}) => spawnSync(process.execPath, [file, ...args], {
  cwd: ROOT, encoding: "utf8", timeout: 10000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, ...env },
});
const fixture = (t) => {
  const parent = path.join(ROOT, "artifacts/tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "validation-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test("selection receipts retain uncovered config in a mixed change and route skill-only changes", () => {
  const scripts = { "test:tooling-fast": "node test" };
  const mixed = selectionReceipt(["docs/DEBUG-HOOKS.md", "playwright.config.js"], scripts);
  assert.equal(mixed.reason, "partial");
  assert.deepEqual(mixed.unclaimed, ["playwright.config.js"]);
  assert.deepEqual(mixed.receipts.map((r) => r.claimed), [true, false]);
  const skill = selectionReceipt([".claude/skills/agent-view/SKILL.md", "AGENTS.md"], scripts);
  assert.equal(skill.reason, "matched");
  assert.ok(skill.receipts.every((r) => r.groups.includes("tooling-fast")));
  assert.equal(selectionReceipt(["docs/DEBUG-HOOKS.md"], {}).reason, "unmatched", "a missing script is not coverage");
});

test("selector and verifier reject typo and missing-value flags before diff selection", () => {
  for (const args of [["--snice", "HEAD"], ["--since"], ["--since", "--json"]]) {
    assert.throws(() => validateSelectionArgs(args), /Unknown|requires/);
    for (const tool of ["pick-tests", "verify-change"]) {
      const result = cli(`tools/ci/${tool}.mjs`, args);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /Unknown|requires/);
    }
  }
  const plan = cli("tools/ci/verify-change.mjs", ["--plan", "docs/DEBUG-HOOKS.md", "playwright.config.js"]);
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(plan.stdout).selection, "partial");
  assert.deepEqual(JSON.parse(plan.stdout).unclaimed, ["playwright.config.js"]);
});

test("sync plan only reads cached refs, and does not invent conflict evidence", () => {
  const calls = [];
  const plan = cachedPlan("claude/demo", (args) => {
    calls.push(args);
    return { code: 0, out: args[0] === "rev-parse" ? "123456789abcdef" : args[0] === "log" ? "abc one" : "", err: "" };
  });
  assert.ok(calls.every((args) => ["rev-parse", "merge-base", "log"].includes(args[0])));
  assert.equal(plan.source, "cached-remote-refs");
  assert.equal(plan.conflictsChecked, false);
  assert.equal(plan.conflicts, null);
});

test("sync-pr's failure path aborts a merge in progress, checks the checkout, and says where the tree is", () => {
  // It logged "tree left on <sync branch>" and then ran an unchecked
  // `git checkout <startedOn>` — wrong when that worked, silent when it failed.
  const fake = (state) => {
    const calls = [];
    const g = (args) => {
      calls.push(args.join(" "));
      if (args[0] === "rev-parse" && args.includes("MERGE_HEAD")) return { code: state.merging ? 0 : 1, out: "", err: "" };
      if (args[0] === "merge" && args[1] === "--abort") { state.merging = false; return { code: 0, out: "", err: "" }; }
      if (args[0] === "checkout") {
        if (state.merging || state.refuse) return { code: 1, out: "", err: "error: you need to resolve your current index first" };
        state.on = args[1]; return { code: 0, out: "", err: "" };
      }
      if (args[0] === "branch") return { code: 0, out: state.on, err: "" };
      return { code: 0, out: "", err: "" };
    };
    return { g, calls };
  };
  const mid = { on: "sync-pr-x", merging: true };
  const a = fake(mid);
  const r1 = returnTo("claude/x", "sync-pr-x", a.g);
  assert.ok(a.calls.includes("merge --abort"), "a merge in progress is aborted before the checkout");
  assert.equal(r1.ok, true);
  assert.match(r1.line, /back on claude\/x; the attempt is kept on branch sync-pr-x/);
  const stuck = { on: "sync-pr-x", refuse: true };
  const r2 = returnTo("claude/x", "sync-pr-x", fake(stuck).g);
  assert.equal(r2.ok, false);
  assert.match(r2.line, /could NOT return to claude\/x .*the working tree is on sync-pr-x/);
});

test("sync --plan CLI never fetches or changes branches", (t) => {
  const dir = fixture(t), log = path.join(dir, "calls.jsonl"), fakeGit = path.join(dir, "git");
  fs.writeFileSync(fakeGit, `#!${process.execPath}\nimport fs from 'node:fs';
const args = process.argv.slice(2);
fs.appendFileSync(process.env.APEX_FAKE_GIT_LOG, JSON.stringify(args) + '\\n');
if (args[0] === 'rev-parse') console.log('123456789abcdef');
else if (args[0] === 'log') console.log('abc cached commit');
else if (args[0] !== 'merge-base') process.exit(90);
`, { mode: 0o755 });
  const result = cli("tools/ci/sync-pr.mjs", ["claude/demo", "--plan"], {
    PATH: dir + path.delimiter + process.env.PATH, APEX_FAKE_GIT_LOG: log,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).source, "cached-remote-refs");
  const calls = fs.readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(calls.map((args) => args[0]), ["rev-parse", "rev-parse", "merge-base", "log"]);
});

test("claims require stable host-neutral identity before any git or network operation", () => {
  assert.equal(sessionId({}), null);
  assert.equal(sessionId({ APEX_SESSION_ID: "thread-1" }), sessionId({ CODEX_THREAD_ID: "thread-1" }));
  assert.notEqual(sessionId({ APEX_SESSION_ID: "thread-1" }), sessionId({ APEX_SESSION_ID: "thread1" }));
  const result = cli("tools/ci/who-is-on-it.mjs", ["--claim", "fixture"], {
    APEX_SESSION_ID: "", CODEX_THREAD_ID: "", CLAUDE_CODE_SESSION_ID: "", CLAUDE_SESSION_ID: "",
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /requires --session/);
  assert.equal(whoMain(["--session"]), 1);
});

const mockGame = (overrides = {}) => {
  const headless = [];
  const g = { G: { cars: [{ code: "AAA", speed: 0 }] }, headless, close() {} };
  g.apex = {
    headless(v) { headless.push(v); }, reset() { return { ok: true }; },
    rollout() { return { ran: { ticks: 6 }, distanceM: 12, speedKph: { min: 1, max: 2, mean: 1.5, final: 2 }, to: { frac: .02, lap: 0 } }; },
    field() { return { positions: g.G.cars.map((c) => ({ code: c.code, pace: 1 })) }; },
    ...overrides,
  };
  return g;
};

test("episode requests validate numeric bounds before boot or headless mutation", async () => {
  for (const opts of [{ seconds: NaN }, { seconds: 0 }, { seconds: 121 }, { episodes: 1 }, { episodes: 2.5 }, { seed: Infinity }]) {
    const game = mockGame();
    await assert.rejects(episodeLeaks({ ...opts, game }), /seconds|episodes|seed/);
    assert.deepEqual(game.headless, []);
  }
  const result = cli("tools/check/episode-diff.mjs", ["--seconds", "abc", "--json"]);
  assert.equal(result.status, 1);
  assert.equal(JSON.parse(result.stdout).ok, false);
});

test("episode evidence checks rollout envelopes, finite digest and field count; restores headless on errors", async () => {
  for (const rollout of [null, { ok: false }, { ran: { ticks: 0 } }, { ran: { ticks: 1 }, distanceM: NaN }]) {
    const game = mockGame({ rollout: () => rollout });
    await assert.rejects(episodeLeaks({ game }), /Rollout/);
    assert.deepEqual(game.headless, [true, false]);
  }
  const game = mockGame({ field: () => ({ positions: [] }) });
  await assert.rejects(episodeLeaks({ game }), /Field/);
  assert.deepEqual(game.headless, [true, false]);
  const valid = await episodeLeaks({ game: mockGame() });
  assert.equal(valid.digestsMatch, true);
  assert.equal(valid.episodesChecked, 3);
  assert.equal(valid.carsChecked, 1);
});

test("episode rejects an empty or changing car field and a failed reset", async () => {
  const empty = mockGame(); empty.G.cars = [];
  await assert.rejects(episodeLeaks({ game: empty }), /empty field/);
  const changed = mockGame(); let resets = 0;
  changed.apex.reset = () => { if (++resets === 2) changed.G.cars.push({ code: "BBB" }); return { ok: true }; };
  await assert.rejects(episodeLeaks({ game: changed }), /Car count/);
  await assert.rejects(episodeLeaks({ game: mockGame({ reset: () => false }) }), /reset failed/);
});

test("extraction rejects nonnumeric, reversed, oversized and empty ranges", (t) => {
  const dir = fixture(t), file = path.join(dir, "source.js");
  fs.writeFileSync(file, "function foo() { return external + offset; }\n\n");
  for (const range of [["x", "1"], ["2", "1"], ["1", "100"], ["1.5", "2"], ["2", "2"]]) {
    const result = cli("tools/check/extract-module.mjs", [file, ...range]);
    assert.equal(result.status, 1, `${range}: ${result.stdout} ${result.stderr}`);
    assert.match(result.stderr, /range|no source/);
  }
  const valid = cli("tools/check/extract-module.mjs", [file, "1", "1"]);
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /external/);
  assert.match(valid.stdout, /offset/);
});

test("bloat scan reports missing explicit scopes alongside successfully scanned files", (t) => {
  const missing = "definitely-no-validation-cli-scope";
  const result = cli("tools/check/bloat-scan.mjs", ["--json", "tools/check/extract-module.mjs", missing]);
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.deepEqual(report.coverage.missing, [missing]);
  assert.ok(report.coverage.scanned.includes("tools/check/extract-module.mjs"));
  const empty = fixture(t);
  const emptyResult = cli("tools/check/bloat-scan.mjs", ["--json", empty]);
  assert.equal(emptyResult.status, 1);
  assert.equal(JSON.parse(emptyResult.stdout).coverage.emptyScopes.length, 1);
  const absolute = cli("tools/check/bloat-scan.mjs", ["--json", path.join(ROOT, "tools/check/extract-module.mjs")]);
  assert.equal(absolute.status, 0, absolute.stderr);
  assert.ok(JSON.parse(absolute.stdout).coverage.scanned.includes("tools/check/extract-module.mjs"));
});

test("ratchet preview is read-only, lower-only receipt exposes skipped raises", async () => {
  const before = fs.readFileSync(DATA);
  const data = { files: { "tools/check/extract-module.mjs": { lines: 1 } }, tree: {} };
  const rows = await update(data, { dryRun: true });
  assert.deepEqual(fs.readFileSync(DATA), before);
  assert.equal(data.files["tools/check/extract-module.mjs"].lines, 1);
  const receipt = updateReceipt([...rows, { file: "smaller", metric: "lines", ceiling: 9, value: 2 }], { lowerOnly: true });
  assert.equal(receipt.skippedRaises.length, 1);
  assert.deepEqual(receipt.changes.map((r) => r.file), ["smaller"]);
});

test("importer imports without fetching, and help/invalid options are validated before fetching", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error("fetch forbidden"); };
  try {
    assert.equal(await importMain(["--help"]), 0);
    for (const args of [["--unknown", "monza:it-1922"], ["--source"], ["--self-check", "fuji"], ["not-a-pair"], []])
      await assert.rejects(importMain(args), /Unknown|requires|Unsupported|Expected|Pass/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
  assert.throws(() => project([]), /coordinates/);
  assert.throws(() => project([[1, 2], [NaN, 3], [4, 5]]), /coordinates/);
});

test("importer does not claim success when source has no requested circuit coverage", (t) => {
  const dir = fixture(t), source = path.join(dir, "empty.geojson");
  fs.writeFileSync(source, JSON.stringify({ type: "FeatureCollection", features: [] }));
  const result = cli("tools/track/import-circuit-path.mjs", ["--source", source, "--self-check", "monza", "--json"]);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.ok, false);
  assert.equal(report.requested, 1);
  assert.equal(report.checked, 0);
  assert.equal(report.skipped.length, 1);
});

test("lighting snapshots share exact profile/knob/range/grid validation", () => {
  assert.deepEqual(validatePresets({ "monza|night|wet": { keyMul: 1.005 }, "*|dusk": { keyMul: 1 }, "custom-1234abcd|day|dry": { keyMul: 1 } }), []);
  for (const obj of [{ invalid: { keyMul: 1 } }, { "monza|night|wet": { typo: 1 } }, { "monza|day|dry": { keyMul: 100 } }, { "monza|day|dry": { keyMul: 1.0001 } }])
    assert.ok(validatePresets(obj).length > 0);
  assert.deepEqual(presetChanges({ z: { keyMul: 1 }, a: { keyMul: 1 } }, { a: { keyMul: 2 }, b: {} }), { added: ["b"], deleted: ["z"], changed: ["a"] });
});

test("lighting check mode reports actual snapshot/delta changes without writing shipped presets", (t) => {
  const dir = fixture(t), before = fs.readFileSync(path.join(ROOT, "js/lighting/presets.js"));
  const snapshot = path.join(dir, "snapshot.json"), edits = path.join(dir, "edits.js");
  fs.writeFileSync(snapshot, JSON.stringify({ "*": { keyMul: 1 } }));
  fs.writeFileSync(edits, 'window.LightEdits = {"monza|night|wet":{"keyMul":1.005}};');
  for (const [tool, input] of [["bake", snapshot], ["merge-proposals", edits]]) {
    const result = cli(`.claude/skills/lighting-tuner/scripts/${tool}.mjs`, [input, "--check", "--json"]);
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.mode, "check");
    assert.ok(report.changes);
  }
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "js/lighting/presets.js")), before);
  fs.writeFileSync(edits, 'window.LightEdits = {"monza|night|wet":{"typo":1}};');
  const bad = cli(".claude/skills/lighting-tuner/scripts/merge-proposals.mjs", [edits, "--check"]);
  assert.equal(bad.status, 1);
  assert.ok(bad.stderr.includes(path.relative(ROOT, edits)), "diagnostic retains the input path");
  for (const input of [
    'window.LightEdits = {"monza|night|wet":{"wetness":0.5}};',
    JSON.stringify({ track: "monza", combos: { "night|wet": { wetness: 0.5 } } }),
  ]) {
    fs.writeFileSync(edits, input);
    const wet = cli(".claude/skills/lighting-tuner/scripts/merge-proposals.mjs", [edits, "--check"]);
    assert.equal(wet.status, 1, "physics wetness cannot be baked through either proposal shape");
    assert.match(wet.stderr, /wetness must not be baked/);
  }
  assert.deepEqual(fs.readFileSync(path.join(ROOT, "js/lighting/presets.js")), before);
});

test("material PNG decoder rejects damaged signature, CRC and truncated image data", () => {
  const png = encodePNG(2, 34, Buffer.alloc(2 * 34 * 4));
  assert.equal(decodePNG(png).h, 34);
  const signature = Buffer.from(png); signature[7] ^= 1;
  assert.throws(() => decodePNG(signature), /signature/);
  const crc = Buffer.from(png); crc[20] ^= 1;
  assert.throws(() => decodePNG(crc), /CRC/);
  assert.throws(() => decodePNG(png.subarray(0, png.length - 4)), /truncated|IEND/);
});

test("asset verifier checks material bytes, shape and low-tier licensing/identity", (t) => {
  const pack = fixture(t);
  const layer = { id: "concrete", mat: 1, scale: 5, licence: "CC0", source: "fixture" };
  const manifest = { version: 1, materials: { size: 2, albedo: "a.png", normal: "n.png", layers: [layer],
    low: { size: 1, albedo: "la.png", normal: "ln.png", layers: [{ ...layer }] } }, models: {}, env: {} };
  const png = encodePNG(2, 34, Buffer.alloc(2 * 34 * 4));
  for (const f of ["a.png", "n.png"]) fs.writeFileSync(path.join(pack, f), png);
  for (const f of ["la.png", "ln.png"]) fs.writeFileSync(path.join(pack, f), encodePNG(1, 17, Buffer.alloc(17 * 4)));
  const verify = () => { fs.writeFileSync(path.join(pack, "manifest.json"), JSON.stringify(manifest)); return cli("tools/gen/assets.mjs", ["verify"], { APEX_PACK_DIR: pack }); };
  assert.equal(verify().status, 0);
  manifest.materials.low.layers[0].licence = "CC-BY";
  let bad = verify(); assert.equal(bad.status, 1); assert.match(bad.stderr, /materials.low.*licence/);
  manifest.materials.low.layers[0].licence = "CC0";
  fs.writeFileSync(path.join(pack, "a.png"), Buffer.from("broken"));
  bad = verify(); assert.equal(bad.status, 1); assert.match(bad.stderr, /PNG/);
  fs.writeFileSync(path.join(pack, "a.png"), encodePNG(2, 33, Buffer.alloc(2 * 33 * 4)));
  bad = verify(); assert.equal(bad.status, 1); assert.match(bad.stderr, /shape/);
  fs.writeFileSync(path.join(pack, "a.png"), png);
  manifest.materials.low.layers[0].scale = 6;
  bad = verify(); assert.equal(bad.status, 1); assert.match(bad.stderr, /match high tier/);
});

test("WGX sky gate requires both descriptors and exact comparison/write state", () => {
  const source = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  assert.deepEqual(skyDepthErrors(source), []);
  for (const name of ["skyPipeline", "skyPipelineMS"]) {
    const assignment = new RegExp(`${name} = device\\.createRenderPipeline\\(\\{[\\s\\S]*?depthStencil: \\{[^}]+\\}`);
    for (const [from, to] of [['depthCompare: "less-equal"', 'depthCompare: "less"'], ["depthWriteEnabled: false", "depthWriteEnabled: true"]]) {
      const changed = source.replace(assignment, (block) => block.replace(from, to));
      assert.ok(skyDepthErrors(changed).some((e) => e.startsWith(name)), `${name} ${to} must fail`);
    }
    assert.ok(skyDepthErrors(source.replace(`${name} = device.createRenderPipeline`, `${name} = device.notAPipeline`)).length > 0);
  }
  assert.ok(skyDepthErrors("// skyPipeline depthCompare: less-equal depthWriteEnabled: false").length > 0);
});

test("WGX diagnostic invokes lastFailure and serializes the returned record", () => {
  const source = fs.readFileSync(path.join(ROOT, "tools/gfx/wgx-validate.mjs"), "utf8");
  const expression = source.match(/out\.lastFailure = ([^;\n]+);/);
  assert.ok(expression, "page diagnostic must collect lastFailure");
  let calls = 0;
  const WGX = { lastFailure() { calls++; return { reason: "adapter denied", at: 42 }; } };
  const record = vm.runInNewContext(`(() => { const out = {}; ${expression[0]} return JSON.stringify(out); })()`, { window: { WGX }, WGX });
  assert.equal(calls, 1);
  assert.deepEqual(JSON.parse(record), { lastFailure: { reason: "adapter denied", at: 42 } });
  assert.match(source, /lastFailure: state\.lastFailure/, "final report must expose the collected reason");
});
