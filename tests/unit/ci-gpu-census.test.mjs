// ci-gpu-census — gpu-census.yml: nightly cadence, cam/entry inputs, census-entry parsing and the WGX leg.
// Split from ci-coverage.test.mjs (T2-16); shared workflow slices live in tests/helpers/ci-workflow.mjs.

import "../helpers/git-fixture-env.mjs"; // FIRST: scrubs the GIT_DIR & co. a git hook exports (#1807)
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import cp from "node:child_process";
import path from "node:path";
import { parse as parseYAML } from "yaml";
import { ciWorkflow, gpuWorkflow } from "../helpers/ci-workflow.mjs";

test("gpu-census runs nightly staggered from the boot group, with the full check and its dispatch defaults", () => {
  // 2026-09-29: both were `17 3 * * *` and stacked on the same ~20 slots with
  // the boot-group nightly. Stagger them (ci.yml 04:17, gpu-census 05:47) and
  // keep neither on the old 03:17 pin.
  assert.match(ciWorkflow, /- cron: "17 4 \* \* \*"/,
    "ci.yml nightly must leave 03:17 (staggered to 04:17 UTC)");
  assert.match(gpuWorkflow, /^on:\s*\n  schedule:\s*\n    - cron: "47 5 \* \* \*"\s*\n  workflow_dispatch:/m,
    "gpu-census.yml nightly must be staggered (05:47 UTC), not shared with ci.yml");
  assert.doesNotMatch(ciWorkflow, /- cron: "17 3 \* \* \*"/);
  assert.doesNotMatch(gpuWorkflow, /- cron: "17 3 \* \* \*"/);
  // The inputs survive (a dispatch is still the way to ask a question)…
  for (const input of ["track:", "images:", "census_only:", "force:", "ls:"]) assert.match(gpuWorkflow, new RegExp(`^      ${input}`, "m"));
  // …and a scheduled run, where every input is empty, still gets the FULL
  // check on the default images and track — not census_only.
  // Plan job resolves inputs → outputs; census gates on those.
  assert.match(gpuWorkflow, /if: \$\{\{ needs\.plan\.outputs\.census_only != 'true' \}\}/);
  assert.match(gpuWorkflow, /if: \$\{\{ !cancelled\(\) && needs\.plan\.outputs\.census_only != 'true' \}\}/,
    "the Verdict must still gate a scheduled run");
  // macos-latest is the default for the nightly (2026-09-29) AND a dispatch
  // (2026-10-14): ubuntu/windows have no hardware adapter and their software
  // game checks were cancelled at the 30-min cap on every run measured.
  const wf = parseYAML(gpuWorkflow);
  assert.equal(wf.on.workflow_dispatch.inputs.images.default, "macos-latest", "a default dispatch must be the one image with a real GPU");
  const split = wf.jobs.plan.steps.find((s) => s.id === "split");
  assert.equal(split.env.INPUT_IMAGES, "${{ inputs.images || 'macos-latest' }}", "a scheduled run (no inputs) must get the real-GPU image");
  assert.match(split.run, /picked or \["macos-latest"\]/, "an images list with nothing valid falls back to the real GPU, not a software image");
  const trackUses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"/g) || [];
  assert.equal(trackUses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must use the plan-resolved track");
});

test("gpu-census: agents may still request by push; dispatches queue, push requests never cancel each other", () => {
  // The push-request path (2026-09-09) is how sessions WITHOUT dispatch rights
  // reach the real GPU (a GH App token gets 403 on workflow_dispatch), and it
  // is in daily use (2026-10-14: runs 38603534048, 38610120171, 38611116514).
  const wf = parseYAML(gpuWorkflow);
  assert.deepEqual(Object.keys(wf.on).sort(), ["push", "schedule", "workflow_dispatch"]);
  assert.match(gpuWorkflow, /paths: \["\.github\/gpu-census-request\.json"\]/,
    "agents without workflow_dispatch may push a request file on cursor/*");
  assert.deepEqual(wf.on.push.branches, ["cursor/**", "claude/**"]);
  const req = JSON.parse(fs.readFileSync(new URL("../../.github/gpu-census-request.json", import.meta.url), "utf8"));
  assert.ok(req && typeof req === "object", "the request file must stay valid JSON — the plan job json.load()s it");
  const split = wf.jobs.plan.steps.find((s) => s.id === "split");
  assert.match(split.run, /if os\.environ\.get\("EVENT"\) == "push":\n\s+with open\("\.github\/gpu-census-request\.json"/, "a push request reads ITS commit's file");
  assert.equal(split.env.EVENT, "${{ github.event_name }}");
  // DISPATCH: one run per ref, and a second dispatch QUEUES instead of
  // cancelling a census in flight (A/B arms used to cancel each other).
  // PUSH: one group per run_id, so two request legs never cancel or queue.
  // NIGHTLY: its own group, the only one that cancels.
  assert.equal(wf.concurrency.group, "gpu-census-${{ (github.event_name == 'push' && format('{0}-{1}', github.ref, github.run_id)) || (github.event_name == 'schedule' && 'nightly') || github.ref }}");
  assert.equal(wf.concurrency["cancel-in-progress"], "${{ github.event_name == 'schedule' }}");
  assert.equal(wf.concurrency.queue, undefined, "queue: max cannot combine with a cancel-in-progress that may be true");
  // INHERITED REQUESTS DO NOT RUN (2026-09-24): only the branch's own
  // first-parent, non-merge commits that edited the file. Executed against a
  // scratch repo in tests/unit/census-verdict.test.mjs.
  const gate = wf.jobs.plan.steps.find((s) => s.id === "gate");
  assert.match(gate.run, /git log --first-parent --no-merges --format=%h "\$BASE\.\.\$GITHUB_SHA" -- "\$F"/);
  assert.match(gate.run, /if \[ "\$EVENT" = "push" \] && \[ "\$BRANCH" != "claude\/f1-game-project-26h3ng" \]; then/, "the deploy branch always runs");
});

test("gpu-census: the nightly skips an unchanged renderer, fail-safe; legs time out inside the job cap", () => {
  const wf = parseYAML(gpuWorkflow);
  // G1: skip ONLY on a known, empty diff from the last GREEN nightly over the
  // renderer paths. Unknown base, API error or failed diff → run. Executed
  // against a scratch repo in tests/unit/census-verdict.test.mjs.
  const gate = wf.jobs.plan.steps.find((s) => s.id === "gate");
  assert.ok(gate, "the nightly gate step is gone");
  assert.equal(gate.if, undefined, "the gate runs on every event and decides by EVENT");
  assert.match(gate.run, /if \[ "\$EVENT" != "schedule" \]; then echo "run=true" >> "\$GITHUB_OUTPUT"; exit 0; fi/, "a dispatch always runs");
  assert.match(gate.run, /PATHS="js\/render js\/lighting tools\/gfx vendor \.github\/workflows\/gpu-census\.yml"/);
  assert.match(gate.run, /event=schedule&status=success&branch=\$BRANCH&per_page=1/, "the base is the last GREEN nightly");
  assert.equal((gate.run.match(/echo "run=false"/g) || []).length, 2, "exactly two paths skip: an inherited push request, an unchanged nightly");
  assert.equal(wf.jobs.plan.permissions.actions, "read");
  assert.equal(wf.jobs.census.if, "${{ needs.plan.outputs.run != 'false' }}", "an empty gate output (dispatch) must run");
  // G3: each leg ends red inside the job's 30-min cap, so a hang names its leg
  // instead of the whole job reading `cancelled`.
  const legs = wf.jobs.census.steps.filter((s) => /^Game check — /.test(s.name || ""));
  assert.equal(legs.length, 4);
  for (const s of legs) {
    assert.equal(s["timeout-minutes"], 6, `${s.name}: 6 min per leg (max measured 3.2)`);
    assert.equal(s["continue-on-error"], true, `${s.name}: a red leg must still reach the Verdict`);
  }
  assert.ok(legs.length * 6 < wf.jobs.census["timeout-minutes"], "four capped legs must fit inside the job cap");
  const up = wf.jobs.census.steps.find((s) => String(s.uses || "").startsWith("actions/upload-artifact@"));
  assert.equal(up.with["retention-days"], 7);
});

test("gpu-census threads a cam input (helmet default, chase for the mirror-mip cap) to every game check (hunt 4 H5)", () => {
  const wf = parseYAML(gpuWorkflow);
  const inputs = wf.on.workflow_dispatch.inputs;
  // Appended last: every earlier input keeps its name, position and default.
  assert.deepEqual(Object.keys(inputs), ["track", "images", "census_only", "force", "ls", "clock", "tod", "cam", "entry"]);
  assert.equal(inputs.track.default, "montreal"); assert.equal(inputs.clock.default, "12"); assert.equal(inputs.tod.default, "");
  assert.equal(inputs.cam.type, "choice");
  assert.deepEqual(inputs.cam.options, ["helmet", "chase", "chase>cockpit"]);
  assert.equal(inputs.cam.default, "helmet", "the default is the game's own camera, so a default dispatch measures what it did before");
  assert.ok(Object.keys(inputs).length <= 25, "GitHub caps workflow_dispatch at 25 inputs");
  const plan = wf.jobs.plan;
  assert.equal(plan.outputs.cam, "${{ steps.split.outputs.cam }}");
  const split = plan.steps.find((s) => s.id === "split");
  assert.equal(split.env.INPUT_CAM, "${{ inputs.cam || 'helmet' }}", "a scheduled run (no inputs) gets the default");
  assert.equal(wf.jobs.census.env.CENSUS_CAM, "${{ needs.plan.outputs.cam }}");
  const camUses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"[^\n]*--cam "\$\{CENSUS_CAM:-helmet\}"/g) || [];
  assert.equal(camUses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must drive the plan-resolved camera");
  // The plan's own allowlist, executed: a push request bypasses the choice list.
  const py = split.run.slice(split.run.indexOf("\n", split.run.indexOf("<<'PY'")) + 1).split("\nPY")[0];
  const camOf = (env) => {
    const r = cp.spawnSync("python3", ["-c", py], { encoding: "utf8", env: { PATH: process.env.PATH, EVENT: "workflow_dispatch", ...env } });
    if (r.error) return null;   // no python3 on this box: the static checks above still hold
    assert.equal(r.status, 0, r.stderr);
    return (r.stdout.match(/^cam=(.*)$/m) || [])[1];
  };
  const chase = camOf({ INPUT_CAM: "chase" });
  if (chase !== null) {
    assert.equal(chase, "chase");
    assert.equal(camOf({ INPUT_CAM: "chase>cockpit" }), "chase>cockpit");
    assert.equal(camOf({ INPUT_CAM: "chase>drone" }), "helmet", "only the listed switch is allowed");
    assert.equal(camOf({}), "helmet");
    assert.equal(camOf({ INPUT_CAM: "drone\nimages=[\"x\"]" }), "helmet", "anything off the allowlist falls back, newline and all");
  }
  const ggc = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(ggc, /--cam ID {2,}player camera/, "gpu-game-check --help documents --cam");
  assert.match(ggc, /out\.cam = await bounded\(\(\) => page\.evaluate\(/);
  assert.ok(ggc.indexOf("out.cam = await bounded") < ggc.indexOf("out.raceCall = await bounded"), "the camera is set BEFORE race(), so race entry never draws through another one");
  assert.ok(ggc.indexOf("out.cam = await bounded") < ggc.indexOf("out.menu = await enterViaMenu("), "…and before the menu entry, whose car prep reads the camera");
});

test("gpu-census threads an entry input (api default; menu / menu-full = the player's RACE!) to every game check (hunt 5 E)", () => {
  const wf = parseYAML(gpuWorkflow);
  const inputs = wf.on.workflow_dispatch.inputs;
  assert.equal(Object.keys(inputs).at(-1), "entry", "appended LAST: every earlier input keeps its position");
  assert.equal(inputs.entry.type, "choice");
  assert.deepEqual(inputs.entry.options, ["api", "menu", "menu-full"]);
  assert.equal(inputs.entry.default, "api", "a default dispatch and the nightly enter as every earlier census did");
  assert.ok(Object.keys(inputs).length <= 25, "GitHub caps workflow_dispatch at 25 inputs");
  const plan = wf.jobs.plan, split = plan.steps.find((s) => s.id === "split");
  assert.equal(plan.outputs.entry, "${{ steps.split.outputs.entry }}");
  assert.equal(split.env.INPUT_ENTRY, "${{ inputs.entry || 'api' }}", "a scheduled run (no inputs) gets the default");
  assert.equal(wf.jobs.census.env.CENSUS_ENTRY, "${{ needs.plan.outputs.entry }}");
  const uses = gpuWorkflow.match(/gpu-game-check\.mjs "\$\{CENSUS_TRACK\}"[^\n]*--entry "\$\{CENSUS_ENTRY:-api\}"/g) || [];
  assert.equal(uses.length, 4, "every game check (three/webgpu, three/webgl2, glx, wgx) must enter the plan-resolved way");
  // The plan's allowlist, executed, for a PUSH request too (the request JSON bypasses the choice list).
  const py = split.run.slice(split.run.indexOf("\n", split.run.indexOf("<<'PY'")) + 1).split("\nPY")[0];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "census-plan-"));
  const outOf = (env, req) => {
    if (req) { fs.mkdirSync(path.join(dir, ".github"), { recursive: true }); fs.writeFileSync(path.join(dir, ".github/gpu-census-request.json"), JSON.stringify(req)); }
    const r = cp.spawnSync("python3", ["-c", py], { cwd: dir, encoding: "utf8",
      env: { PATH: process.env.PATH, EVENT: req ? "push" : "workflow_dispatch", ...env } });
    if (r.error) return null;   // no python3: the static checks above still hold
    assert.equal(r.status, 0, r.stderr);
    return Object.fromEntries(r.stdout.trim().split("\n").map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
  };
  try {
    const d = outOf({ INPUT_ENTRY: "menu" });
    if (d !== null) {
      assert.equal(d.entry, "menu");
      assert.equal(outOf({}).entry, "api");
      assert.equal(outOf({ INPUT_ENTRY: "menu-full" }).entry, "menu-full");
      assert.equal(outOf({ INPUT_ENTRY: "garage\nimages=[\"x\"]" }).entry, "api", "anything off the allowlist falls back, newline and all");
      const pushed = outOf({}, { images: "macos-latest", entry: "menu", cam: "chase>cockpit", ls: "apex26.tlxMirWarmLazy=1" });
      assert.equal(pushed.entry, "menu"); assert.equal(pushed.cam, "chase>cockpit"); assert.equal(pushed.ls, "apex26.tlxMirWarmLazy=1");
      assert.equal(pushed.images, '["macos-latest"]');
      assert.equal(outOf({}, { entry: "teleport" }).entry, "api", "a pushed request is allowlisted too");
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // The tool records the entry and threads it.
  const ggc = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(ggc, /--entry api\|menu\|menu-full {2,}how the race starts/, "--help documents --entry");
  assert.match(ggc, /glErrDrain: glErrDrainEveryPresent \? "present" : "beat", entry \}/, "the game JSON records which entry ran");
  assert.match(ggc, /if \(entry === "api"\) \{\n\s+out\.raceCall = await bounded/, "api keeps race() exactly as before");
  assert.match(ggc, /page\.waitForFunction\(menuPrepReady, null, \{ polling: 100, timeout: menuTimeout \}\)/, "the menu entry waits on the game's own prep signal");
  assert.ok(ggc.indexOf('locator("#rs-go").click') > ggc.indexOf("waitForFunction(menuPrepReady"), "START RACE only after the prep wait");
  assert.match(ggc, /out\.warmEnd = await bounded\(/, "memState().warm is read again after the window (the lazy mirror warm lands there)");
  // LoAF script attribution beside the longtask window, and the gap rows' callback count.
  assert.match(ggc, /\.observe\(\{ type: "long-animation-frame", buffered: true \}\)/);
  assert.match(ggc, /loaf: window\.__apexLoaf \|\| \[\], loafObserver: window\.__apexLoafObserver/, "the dump carries the LoAF series");
  assert.match(ggc, /out\.raceEntry\.loaf = _loaf;/, "written as raceEntry.loaf in the game JSON");
  assert.match(ggc, /prevFrameMs: _gFrameDur, prevCallbacks: _gFrameCb,/);
});

test("census-entry parses --entry / --cam A>B and gates START RACE on the menu prep (hunt 5 E)", async () => {
  const E = await import("../../tools/lib/census-entry.mjs");
  assert.deepEqual(E.ENTRIES, ["api", "menu", "menu-full"]);
  assert.equal(E.parseEntry(undefined), "api"); assert.equal(E.parseEntry(""), "api");
  assert.equal(E.parseEntry("menu"), "menu"); assert.equal(E.parseEntry(" menu-full "), "menu-full");
  assert.equal(E.parseEntry("garage"), null, "an unknown entry is refused, never silently api");
  assert.deepEqual(E.parseCam(null), { start: null, switchTo: null }, "no --cam = the game's default camera");
  assert.deepEqual(E.parseCam("chase"), { start: "chase", switchTo: null });
  assert.deepEqual(E.parseCam("chase>cockpit"), { start: "chase", switchTo: "cockpit" });
  for (const bad of ["chase>", ">cockpit", "a>b>c"]) assert.equal(E.parseCam(bad), null, bad);
  assert.equal(E.switchBeat(20), 10); assert.equal(E.switchBeat(15), 7);
  assert.equal(E.switchBeat(1), 1, "never the first beat: the switch lands inside the window");
  // menuPrepReady reads window.__apex.menuPrep() — run it against stand-in pages.
  const ready = { state: "menu", world: true, done: true, warmFrames: 0, warming: false };
  const at = (p) => { globalThis.window = { __apex: p === undefined ? undefined : { menuPrep: () => p } }; try { return E.menuPrepReady(); } finally { delete globalThis.window; } };
  assert.equal(at(ready), true);
  assert.equal(at(undefined), false, "a build with no __apex is not ready");
  assert.equal(at(null), false, "a build with no menuPrep hook is not ready");
  for (const [k, v] of [["state", "count"], ["world", false], ["done", false], ["warmFrames", 2], ["warming", true]])
    assert.equal(at({ ...ready, [k]: v }), false, `${k}=${v} is not ready`);
  assert.equal(at({ ...ready, warmable: false, warmed: false }), true, "GLX/WGX have no program warm: done is enough");
  // Serializable: Playwright ships the function's source, so it must not close over module scope.
  assert.doesNotMatch(String(E.menuPrepReady), /\bE\.|import|require/);
});

test("the census race gate passes an entry that requested NO warm instead of waiting for warm.done (hunt 5 E)", async () => {
  // Runs 491/492/502/503/505/507 read RACE NOT REACHED: the pack gate skipped
  // requestWarm, so no warm:* mark, no entry warm, and memState().warm.done never came.
  const { raceGate } = await import("../../tools/lib/census-entry.mjs");
  const run = ({ state = "race", warming = false, warm = { done: false }, tlx = true, marks = [{ n: "begin:startRace", t: 0 }], hook = true }, gate) => {
    globalThis.window = { __apex: { info: () => ({ state }), ...(hook ? { raceEntryProfile: () => ({ marks }) } : {}) } };
    if (gate) globalThis.window.__raceGate = gate;
    globalThis.GLX = tlx ? { __tlx: { memState: () => ({ warm }), warming: () => warming } } : {};
    try { return { ok: raceGate(), g: globalThis.window.__raceGate }; } finally { delete globalThis.window; delete globalThis.GLX; }
  };
  const begin = { n: "begin:startRace", t: 0 };
  // No warm mark at all (pack gate): passes once racing and not compiling, and records it.
  let r = run({ marks: [begin, { n: "debrisPrime:end", t: 900 }] });
  assert.equal(r.ok, true, "no warm requested: warm.done is not awaited");
  assert.equal(r.g.warmRequested, false); assert.equal(r.g.warmMark, null);
  // skipped-menu / noop: same, with the mark named.
  r = run({ marks: [begin, { n: "warm:skipped-menu", t: 900 }] });
  assert.equal(r.ok, true); assert.equal(r.g.warmMark, "warm:skipped-menu");
  r = run({ marks: [begin, { n: "warm:noop", t: 900 }], tlx: false, warm: null });
  assert.equal(r.ok, true); assert.equal(r.g.warmMark, "warm:noop");
  // ...but never while something compiles, nor before the race state.
  assert.equal(run({ marks: [begin], warming: true }).ok, false);
  assert.equal(run({ marks: [begin], state: "count" }).ok, false);
  // warm:request: the entry's warm must FINISH, exactly as before.
  const req = [begin, { n: "warm:request", t: 900 }];
  r = run({ marks: req, warm: { done: false } });
  assert.equal(r.ok, false, "a requested warm that has not finished holds the gate");
  assert.equal(r.g.warmRequested, true); assert.equal(r.g.warmMark, "warm:request");
  assert.equal(run({ marks: req, warm: { done: true } }).ok, true);
  // A build with no raceEntryProfile hook keeps the older rule: timeline done, or 5 s of race.
  assert.equal(run({ hook: false, warm: { done: false } }).ok, false);
  assert.equal(run({ hook: false, warm: { done: true } }).ok, true);
  // An unprofiled window (no begin: mark) does not count as "no warm requested".
  assert.equal(run({ marks: [], warm: { done: false } }).ok, false);
  assert.equal(run({ hook: false, warm: null }, { t0: performance.now() - 6000, saw: false }).ok, true, "no timeline: 5 s of race with none");
  assert.doesNotMatch(String(raceGate), /\bimport\b|require\(/, "serializable for page.waitForFunction");
  const ggc = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(ggc, /await page\.waitForFunction\(raceGate, null, \{ polling: 100, timeout:/);
  assert.match(ggc, /out\.raceEntry\.warmRequested = out\.race \? out\.race\.warmRequested : null;/, "raceEntry.warmRequested in the game JSON");
  assert.match(ggc, /out\.raceEntry\.warmMark = out\.race \? out\.race\.warmMark : null;/);
});

test("gpu-census has a NATIVE WGX leg with hardware gates (bound, swapchain, gpuErrors)", () => {
  // Until 2026-09-02 the "webgpu" leg was three.js on WebGPU, so js/render/webgpu/
  // had no real-GPU evidence at all. The leg must run WGX itself and the
  // Verdict must fail a hardware run where WGX fell back or soft-presents.
  assert.match(gpuWorkflow, /- name: Game check — WGX \/ WebGPU \(native, opt-in\)/);
  assert.match(gpuWorkflow, /--backend webgpu \$LS \\\n\s+--json "game-wgx-\$\{\{ matrix\.image \}\}\.json"/);
  // The Verdict is tools/gfx/census-verdict.mjs since 2026-10-14 (audit G4);
  // its gates are EXECUTED against fixtures in census-verdict.test.mjs and
  // gfx-backend-canary.test.mjs. Here: the step runs it, and its source keeps
  // every leg and every hardware clause.
  const verdictStep = parseYAML(gpuWorkflow).jobs.census.steps.find((s) => /^Verdict — /.test(s.name || ""));
  assert.equal(verdictStep.run, "node tools/gfx/census-verdict.mjs", "the Verdict step runs the tool, not an inline script");
  assert.equal(verdictStep.env.IMAGE, "${{ matrix.image }}");
  const verdictSrc = fs.readFileSync(new URL("../../tools/gfx/census-verdict.mjs", import.meta.url), "utf8");
  assert.match(verdictSrc, /export const LEGS = \["webgpu", "webgl2", "glx", "wgx"\];/);
  assert.match(verdictSrc, /const tlxLeg = path3 === "webgpu" \|\| path3 === "webgl2";/,
    "the WGX leg must not be held to the TLX env-probe expectations");
  assert.match(verdictSrc, /if \(hardware && gfx\.wgx !== true\) bad\.push\(`wgx: WGX did not bind/);
  // The swapchain gate is conditioned on the PIN, not the UA: gpu-game-check
  // always launches headless (headlessUa=true in 65/65 runs), so the old
  // `headlessUa !== true` exemption could never let the clause fire.
  assert.match(verdictSrc, /else if \(hardware && cap == null && gfx\.wgxSoftPresent !== false\) \{/,
    "WGX off the swapchain with the native pin in force must fail a hardware run");
  assert.doesNotMatch(verdictSrc, /headlessUa !== true/, "the clause that could never fire stays deleted");
  assert.match(verdictSrc, /if \(hardware && tlxLeg && cap == null && be\.softBlit !== false\) \{/,
    "a TLX leg off the direct present path with the native pin in force must fail a hardware run");
  assert.match(verdictSrc, /process\.env|env\.CENSUS_LS/, "the tool reads the dispatch ls so an override is never gated");
  const check = fs.readFileSync(new URL("../../tools/gfx/gpu-game-check.mjs", import.meta.url), "utf8");
  assert.match(check, /r\.wgx = typeof g\.softPresent === "function";/);
  assert.match(check, /r\.wgxSoftPresent = !!g\.softPresent\(\)/);
  // GLX exports softPresent too, so "has softPresent" alone read WGX-bound on a
  // WGX leg that fell back to GLX (hunt 4 I3): the bound api must say webgpu.
  assert.match(check, /if \(r\.wgx && r\.api === "webgl2" && !g\.__tlx\) r\.wgx = false;/);
  // THE PLAYER'S PRESENT PATH on every leg (hunt 4 I1/I3): the WGX and GLX
  // legs pin SCREENSHOTS = NATIVE like the two three.js legs, BEFORE $LS so a
  // dispatcher can still override it. Without it WGX soft-presented every
  // frame (20.8 vs 36.7 fps pinned, spa dusk) and GLX shot one stale blit.
  const pinned = gpuWorkflow.match(/^\s+--[^\n]*--ls apex26\.wgxCapture=0 [^\n]*$/gm) || [];
  assert.equal(pinned.length, 4, `every game-check leg pins apex26.wgxCapture=0 on its command line, found ${pinned.length}`);
  for (const line of pinned) {
    if (line.includes("$LS")) assert.ok(line.indexOf("wgxCapture=0") < line.indexOf("$LS"), "the pin must precede $LS so a dispatch can override it");
  }
});
