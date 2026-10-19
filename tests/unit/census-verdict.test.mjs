/* census-verdict.test.mjs — the real-GPU gate of gpu-census.yml, as functions.
 *
 * tools/gfx/census-verdict.mjs was a ~570-line single-quoted `node -e` script
 * inside the workflow's Verdict step (audit G4, 2026-10-14): reachable only by
 * regex, and one apostrophe in a comment ended it (run 33757119814). These
 * cases drive the exported functions and the CLI with fixtures shaped like
 * what the legs write (tools/gfx/gpu-game-check.mjs; the shapes were checked
 * against the macos-latest artifacts of runs 38550895790, 38530819387 and
 * 38516126440, whose Verdict output the extracted tool reproduces line for
 * line). The older behaviour cases live in gfx-backend-canary.test.mjs and
 * run the same CLI. The nightly gate step of the workflow is executed here
 * too, against a scratch git repo with a stub `gh`.
 *
 * Run: node --test tests/unit/census-verdict.test.mjs
 */
import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYAML } from "yaml";
import { capOverride, verdict, legReport, readArtifacts, main, LEGS } from "../../tools/gfx/census-verdict.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TOOL = path.join(ROOT, "tools/gfx/census-verdict.mjs");
const WF = parseYAML(fs.readFileSync(path.join(ROOT, ".github/workflows/gpu-census.yml"), "utf8"));

test("historical garage A/B only runs for its explicit full push request; normal census keeps four controls", (t) => {
  const plan = WF.jobs.plan, split = plan.steps.find((s) => s.id === "split");
  assert.equal(plan.outputs.garage_ab, "${{ steps.split.outputs.garage_ab }}");
  const steps = WF.jobs.census.steps;
  const experiment = ["Garage exact-revision WebGPU A/B", "Validate garage A/B measurements",
    "Upload garage A/B before control legs", "Garage A/B verdict"];
  const expected = ["${{ needs.plan.outputs.garage_ab == 'true' }}",
    "${{ always() && needs.plan.outputs.garage_ab == 'true' }}",
    "${{ always() && needs.plan.outputs.garage_ab == 'true' }}",
    "${{ !cancelled() && needs.plan.outputs.garage_ab == 'true' }}"];
  for (let i = 0; i < experiment.length; i++)
    assert.equal(steps.find((s) => s.name === experiment[i])?.if, expected[i], experiment[i]);
  const controls = steps.filter((s) => s.name?.startsWith("Game check —"));
  assert.equal(controls.length, 4);
  for (const step of controls) assert.equal(step.if, "${{ needs.plan.outputs.census_only != 'true' }}");
  assert.equal(steps.find((s) => s.name === "Verdict — fail the job on what the game reported").if,
    "${{ !cancelled() && needs.plan.outputs.census_only != 'true' }}");
  assert.equal(WF.jobs.garage_reanalysis.if,
    "${{ needs.plan.outputs.run != 'false' && needs.plan.outputs.reanalysis == 'true' }}");

  const py = split.run.slice(split.run.indexOf("\n", split.run.indexOf("<<'PY'")) + 1).split("\nPY")[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "census-experiment-"));
  try {
    fs.mkdirSync(path.join(dir, ".github"));
    const output = (event, req) => {
      fs.writeFileSync(path.join(dir, ".github/gpu-census-request.json"), JSON.stringify(req));
      const r = spawnSync("python3", ["-c", py], { cwd: dir, encoding: "utf8", timeout: 5000,
        env: { PATH: process.env.PATH, EVENT: event } });
      if (r.error?.code === "ENOENT") { t.skip("no python3 on this box"); return null; }
      assert.equal(r.status, 0, r.stderr || String(r.error || ""));
      return Object.fromEntries(r.stdout.trim().split("\n").map((line) => {
        const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)];
      }));
    };
    const historical = { leg: "garage-retry-63a1", census_only: false };
    const dispatch = output("workflow_dispatch", historical);
    if (!dispatch) return;
    assert.equal(dispatch.garage_ab, "false", "a default dispatch ignores an inherited historical request");
    assert.equal(dispatch.census_only, "false", "the ordinary four controls still run");
    assert.equal(output("schedule", historical).garage_ab, "false", "nightlies never rerun pinned historical A/B");
    assert.equal(output("push", historical).garage_ab, "true", "the original explicit experiment leg opts in");
    assert.equal(output("push", { ...historical, census_only: true }).garage_ab, "false", "adapter-only requests skip the experiment too");
    assert.equal(output("push", { leg: "another-experiment" }).garage_ab, "false");
    const reanalysis = output("push", { leg: "garage-reanalysis-367dc", census_only: true });
    assert.equal(reanalysis.garage_ab, "false");
    assert.equal(reanalysis.reanalysis, "true", "preserved-capture reanalysis remains independent");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// What a healthy macos-latest run writes (run 38550895790): both TLX legs
// carry backendState + envState with softBlit false; GLX and WGX carry
// neither; WGX is bound on the swapchain; every UA is HeadlessChrome.
const tlx = (gfx = {}, top = {}) => ({
  phase: "done", ok: true, frame: { meanLuma: 41.2 },
  gfx: {
    glx: true, gpuErrors: 0, gpuFirstError: null, wgx: true, wgxSoftPresent: false, headlessUa: true,
    backendState: { api: "webgpu", forceWebGL: false, softAdapter: false, headless: true, softBlit: false, skipBatches: false, gpuErrFrames: 0 },
    envState: { on: true, face: 6, ready: true, blank: false, fail: 0, failMsg: "", gaveUp: false },
    gov: { tier: 0, autoTier: 0, userTier: null, scale: 1, fps: 59.8, floorMs: 18.2, open: { frames: 600 } },
    ...gfx,
  },
  ...top,
});
const glx = (gfx = {}) => ({ phase: "done", ok: true, frame: { meanLuma: 52 }, glErrDrain: "beat",
  gfx: { glx: true, gpuErrors: 0, gpuFirstError: null, wgx: false, headlessUa: true, ...gfx } });
const wgx = (gfx = {}) => ({ phase: "done", ok: true, frame: { meanLuma: 60 },
  gfx: { glx: true, gpuErrors: 0, gpuFirstError: null, wgx: true, wgxSoftPresent: false, headlessUa: true, ...gfx } });
const HW = { anyHardware: true, runs: [] }, SW = { anyHardware: false, runs: [] };
const healthy = (over = {}) => ({ webgpu: tlx(), webgl2: tlx({ backendState: { ...tlx().gfx.backendState, api: "webgl2", forceWebGL: true } }), glx: glx(), wgx: wgx(), ...over });
const run = (o) => verdict({ image: "macos-latest", census: HW, legs: healthy(), ...o });

test("capOverride: only a NON-zero apex26.wgxCapture in the dispatch ls overrides the pin, last one wins", () => {
  assert.equal(capOverride(""), null);
  assert.equal(capOverride(undefined), null);
  assert.equal(capOverride("apex26.instCellCache=1"), null);
  assert.equal(capOverride("apex26.wgxCapture=0"), null, "restating the pin is not an override");
  assert.equal(capOverride("apex26.wgxCapture=1"), "1");
  assert.equal(capOverride("apex26.a=1  apex26.wgxCapture=1\napex26.b=2"), "1");
  assert.equal(capOverride("apex26.wgxCapture=1 apex26.wgxCapture=0"), null, "gpu-game-check applies --ls in order; the last value is the one the page sees");
  assert.equal(capOverride("xapex26.wgxCapture=1"), null, "a different key is not this key");
});

test("a healthy hardware run passes and prints one block per leg in the fixed order", () => {
  const { rows, bad } = run();
  assert.deepEqual(bad, [], rows.join("\n"));
  assert.equal(rows[0], "## macos-latest — real-GPU verdict");
  assert.equal(rows[3], "census anyHardware: true");
  const heads = rows.filter((r) => /^(webgpu|webgl2|glx|wgx)\s+phase=/.test(r)).map((r) => r.split(/\s/)[0]);
  assert.deepEqual(heads, LEGS);
  assert.ok(!rows.includes("**FAILED**"));
  assert.ok(rows.some((r) => /path:  api=webgpu forceWebGL=false softBlit=no \(direct present\)/.test(r)));
  assert.ok(rows.some((r) => /wgx: {3}bound=true softPresent=false headlessUa=true$/.test(r)));
});

test("TLX off the direct present path fails a hardware run while the native pin is in force (promoted 2026-10-14)", () => {
  const blit = { backendState: { ...tlx().gfx.backendState, softBlit: true } };
  let r = run({ legs: healthy({ webgpu: tlx(blit) }) });
  assert.equal(r.bad.length, 1, r.bad.join("\n"));
  assert.match(r.bad[0], /^webgpu: TLX is soft-blitting .* apex26\.wgxCapture=0 pinned/);
  // Absence is not a pass: a TLX leg that stopped reporting softBlit fails.
  const gone = { backendState: { ...tlx().gfx.backendState, softBlit: undefined } };
  r = run({ legs: healthy({ webgl2: tlx(gone) }) });
  assert.match(r.bad.join("\n"), /webgl2: NO softBlit reported on a hardware TLX leg/);
  // A dispatch that overrides the pin asked for the readback: reported, not gated.
  r = run({ legs: healthy({ webgpu: tlx(blit) }), cap: "1" });
  assert.deepEqual(r.bad, []);
  assert.ok(r.rows.some((x) => /softBlit=YES \(headless readback/.test(x)), "the row still says which path it took");
  // A software image blits by design.
  r = run({ census: SW, legs: healthy({ webgpu: tlx(blit) }) });
  assert.deepEqual(r.bad, []);
  // GLX and WGX have no TLX backendState: never gated on softBlit.
  assert.deepEqual(legReport("glx", glx(), { hardware: true }).bad, []);
});

test("WGX off the swapchain fails a hardware run whether or not the UA is headless; the old exemption is gone", () => {
  for (const headlessUa of [true, false]) {
    const r = run({ legs: healthy({ wgx: wgx({ wgxSoftPresent: true, headlessUa }) }) });
    assert.equal(r.bad.length, 1, `headlessUa=${headlessUa}: ${r.bad.join("\n")}`);
    assert.match(r.bad[0], /^wgx: WGX is soft-presenting \(CPU blit\) on a hardware adapter with apex26\.wgxCapture=0 pinned/);
  }
  const r = run({ legs: healthy({ wgx: wgx({ wgxSoftPresent: true }) }), cap: "1" });
  assert.deepEqual(r.bad, [], "an overridden pin is reported, not gated");
  assert.ok(r.rows.some((x) => /apex26\.wgxCapture=1 from the dispatch ls overrides the native pin/.test(x)));
  // Not bound wins over soft-present: one root cause, one line.
  const nb = run({ legs: healthy({ wgx: wgx({ wgx: false, wgxSoftPresent: undefined }) }) });
  assert.equal(nb.bad.length, 1);
  assert.match(nb.bad[0], /WGX did not bind/);
});

test("every pre-existing gate still fails: missing leg, unfinished leg, GPU and shader errors, env faces, softAdapter, unknown census", () => {
  const cases = [
    [{ legs: healthy({ glx: null }) }, /glx: game-glx-macos-latest\.json missing/],
    [{ legs: healthy({ wgx: { ...wgx(), ok: false, phase: "boot", error: "timeout" } }) }, /wgx: did not finish \(phase=boot, ok=false\) — timeout/],
    [{ legs: healthy({ glx: glx({ gpuErrors: 2, gpuFirstError: "INVALID_OPERATION" }) }) }, /glx: 2 uncaptured GPU errors — INVALID_OPERATION/],
    [{ legs: healthy({ glx: glx({ gpuErrors: undefined }) }) }, /glx: NO gpuErrors count reported/],
    [{ legs: healthy({ webgpu: tlx({}, { console: ["error: Render pipeline creation failed: x"] }) }) }, /webgpu: 1 shader\/pipeline console errors/],
    [{ legs: healthy({ webgpu: tlx({ envState: { fail: 3, failMsg: "face", gaveUp: false } }) }) }, /webgpu: 3 env-probe faces FAILED — face/],
    [{ legs: healthy({ webgl2: tlx({ envState: undefined }) }) }, /webgl2: NO env-probe fail count reported/],
    [{ legs: healthy({ webgpu: tlx({ envState: { fail: 0, gaveUp: true } }) }) }, /env probe stood down/],
    [{ legs: healthy({ webgpu: tlx({ backendState: { ...tlx().gfx.backendState, softAdapter: true } }) }) }, /softAdapter TRUE/],
    [{ census: null }, /the census measured NOTHING/],
    [{ census: { anyHardware: null } }, /the census measured NOTHING/],
  ];
  for (const [o, re] of cases) {
    const r = run(o);
    assert.ok(r.bad.some((b) => re.test(b)), `${re} not raised; bad=\n${r.bad.join("\n")}`);
    assert.ok(r.rows.includes("**FAILED**"));
  }
});

test("readArtifacts reads the files the legs write and maps unreadable ones to null", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "census-verdict-"));
  try {
    fs.writeFileSync(path.join(dir, "census-macos-latest.json"), JSON.stringify(HW));
    fs.writeFileSync(path.join(dir, "game-glx-macos-latest.json"), JSON.stringify(glx()));
    fs.writeFileSync(path.join(dir, "game-wgx-macos-latest.json"), "{ half a fi");
    const a = readArtifacts(dir, "macos-latest");
    assert.deepEqual(a.census, HW);
    assert.equal(a.legs.glx.phase, "done");
    assert.equal(a.legs.wgx, null, "a truncated JSON reads as missing, which the gate names");
    assert.equal(a.legs.webgpu, null);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("the CLI: step env in, rows to the summary and stdout, ::error:: lines and exit 1 on a failed gate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "census-verdict-"));
  try {
    fs.writeFileSync(path.join(dir, "census-macos-latest.json"), JSON.stringify(HW));
    for (const [leg, json] of Object.entries(healthy())) fs.writeFileSync(path.join(dir, `game-${leg}-macos-latest.json`), JSON.stringify(json));
    const summary = path.join(dir, "summary.md");
    const env = { PATH: process.env.PATH, IMAGE: "macos-latest", CENSUS_LS: "", GITHUB_STEP_SUMMARY: summary };
    let r = spawnSync(process.execPath, [TOOL], { cwd: dir, encoding: "utf8", env });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(fs.readFileSync(summary, "utf8"), /^## macos-latest — real-GPU verdict/);
    fs.writeFileSync(path.join(dir, "game-wgx-macos-latest.json"), JSON.stringify(wgx({ wgxSoftPresent: true })));
    r = spawnSync(process.execPath, [TOOL], { cwd: dir, encoding: "utf8", env });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /::error::REAL-GPU GATE: wgx: WGX is soft-presenting/);
    r = spawnSync(process.execPath, [TOOL], { cwd: dir, encoding: "utf8", env: { ...env, CENSUS_LS: "apex26.wgxCapture=1" } });
    assert.equal(r.status, 0, "CENSUS_LS reaches the gate: an overridden pin is not gated");
    // Flags beat env, so the same tool runs by hand on a downloaded artifact.
    r = spawnSync(process.execPath, [TOOL, "--dir", dir, "--image", "macos-latest", "--ls", "apex26.wgxCapture=1", "--summary", ""], { encoding: "utf8", env: { PATH: process.env.PATH } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(main(["--help"], {}), 0);
  assert.equal(main([], {}), 2, "no image is a usage error, not a pass");
  assert.throws(() => main(["--bogus"], {}), /unknown argument/);
});

test("the Verdict step runs the tool with the image and the job's CENSUS_LS", () => {
  const steps = WF.jobs.census.steps;
  const v = steps.find((s) => /^Verdict — /.test(s.name || ""));
  assert.equal(v.run, "node tools/gfx/census-verdict.mjs");
  assert.equal(v.env.IMAGE, "${{ matrix.image }}");
  assert.equal(v.if, "${{ !cancelled() && needs.plan.outputs.census_only != 'true' }}",
    "a failed producer still reaches the verdict; cancellation must not fabricate a hardware failure");
  assert.equal(WF.jobs.census.env.CENSUS_LS, "${{ needs.plan.outputs.ls }}", "the gate reads the dispatch ls from the job env");
  // The files the legs write are the files the tool reads.
  const jsons = steps.map((s) => String(s.run || "").match(/--json "game-(\w+)-\$\{\{ matrix\.image \}\}\.json"/)).filter(Boolean).map((m) => m[1]);
  assert.deepEqual(jsons, LEGS);
});

// The plan gate, executed. Nightly (audit G1): skip only on a KNOWN, EMPTY diff over
// the renderer paths from the last green nightly; every unknown runs.
test("the plan gate: the nightly skips an unchanged renderer, an inherited push request skips, every unknown runs", (t) => {
  const gate = WF.jobs.plan.steps.find((s) => s.id === "gate");
  const git = (cwd, ...a) => spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...a], { cwd, encoding: "utf8" });
  if (git(ROOT, "--version").status !== 0) { t.skip("no git on this box"); return; }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "census-gate-"));
  try {
    const repo = path.join(dir, "repo"), bin = path.join(dir, "bin");
    fs.mkdirSync(path.join(repo, "js/render"), { recursive: true });
    fs.mkdirSync(bin);
    assert.equal(git(repo, "init", "-q").status, 0);
    const commit = (file, text) => {
      fs.writeFileSync(path.join(repo, file), text);
      git(repo, "add", "-A"); git(repo, "commit", "-q", "-m", file);
      return git(repo, "rev-parse", "HEAD").stdout.trim();
    };
    const A = commit("js/render/gfx.js", "a");
    const B = commit("notes.txt", "b");          // nothing under the renderer paths since A
    const C = commit("js/render/gfx.js", "c");   // renderer change since A
    // A stub gh that answers the runs query with $FAKE_LAST, or fails.
    fs.writeFileSync(path.join(bin, "gh"), "#!/bin/sh\n[ -n \"$FAKE_FAIL\" ] && exit 1\necho \"$FAKE_LAST\"\n", { mode: 0o755 });
    const gateRun = (sha, env) => {
      const out = path.join(dir, `out-${Math.random().toString(36).slice(2)}`);
      const r = spawnSync("bash", ["-e", "-c", gate.run], { cwd: repo, encoding: "utf8",
        env: { PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: out, GITHUB_SHA: sha, REPO: "o/r", BRANCH: "main", ...env } });
      assert.equal(r.status, 0, r.stdout + r.stderr);
      return (fs.readFileSync(out, "utf8").match(/^run=(\w+)$/m) || [])[1];
    };
    const nightly = (sha, env) => gateRun(sha, { EVENT: "schedule", ...env });
    assert.equal(nightly(B, { FAKE_LAST: A }), "false", "nothing under the renderer paths moved: skip");
    assert.equal(nightly(C, { FAKE_LAST: A }), "true", "a renderer change since the last green nightly: run");
    assert.equal(nightly(B, { FAKE_LAST: "" }), "true", "no green nightly yet: run");
    assert.equal(nightly(B, { FAKE_LAST: "0123456789abcdef0123456789abcdef01234567" }), "true", "a base this clone lacks: run");
    assert.equal(nightly(B, { FAKE_FAIL: "1" }), "true", "the API failed: run");
    assert.equal(gateRun(B, { EVENT: "workflow_dispatch" }), "true", "a dispatch always runs");

    // THE PUSH REQUEST (2026-09-24 rule): only the branch's own first-parent,
    // non-merge commits that edited the request run; one inherited by merge
    // does not; the deploy branch always runs.
    fs.mkdirSync(path.join(repo, ".github"), { recursive: true });
    const D = commit(".github/gpu-census-request.json", "{\"leg\":\"d\"}");
    const push = (before, sha, branch = "cursor/x-1234") => gateRun(sha, { EVENT: "push", BEFORE: before, BRANCH: branch });
    assert.equal(push(C, D), "true", "this push's own commit edited the request");
    assert.equal(git(repo, "checkout", "-q", "-b", "side").status, 0);
    commit(".github/gpu-census-request.json", "{\"leg\":\"e\"}");
    assert.equal(git(repo, "checkout", "-q", "-").status, 0);
    const F = commit("notes.txt", "f");
    assert.equal(git(repo, "merge", "-q", "--no-ff", "--no-edit", "side").status, 0);
    const M = git(repo, "rev-parse", "HEAD").stdout.trim();
    assert.equal(push(F, M), "false", "a request that arrived by merge was measured where it was made");
    assert.equal(push(F, M, "claude/f1-game-project-26h3ng"), "true", "the deploy branch always runs");
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
