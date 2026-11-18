/* tools-runnable-cli.test.mjs — the tool surface an agent reaches must ANSWER:
 * MCP-facing entry points and CLI help paths exit fast without a browser or a
 * network, unknown flags are errors, and the browser-launching tools resolve
 * Chromium and the track-build budget the portable way. Split out of
 * tools-runnable.test.mjs (#3043 T5-12), assertions unchanged.
 *
 * Run: node --test tests/unit/tools-runnable-cli.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { ROOT, FILES, tool } from "../helpers/tools-tree.mjs";

test("the MCP-facing entry points answer without touching a browser or a network", () => {
  // These are what an agent reaches for first; a help path that throws reads as
  // "the tool is gone". Each is side-effect-free by construction.
  const cases = [
    { cmd: process.execPath, args: [tool("mcp-cli.mjs"), "--help"], want: /probe/ },
    { cmd: process.execPath, args: [tool("mcp-cli.mjs"), "probe", "--dry-run"], want: /new_page/ },
    { cmd: "python3", args: [tool("probe-mcp.py"), "help"], want: /chrome_/ },
    { cmd: "bash", args: [tool("apex-tools-mcp.sh"), "help"], want: /apex_/ },
    { cmd: "bash", args: [tool("apex-tools-mcp.sh"), "help"], want: /smoke/ },
    { cmd: process.execPath, args: [tool("mcp-smoke.mjs"), "--help"], want: /Never wraps test-bg/ },
    { cmd: "bash", args: [tool("playwright-mcp.sh"), "help"], want: /browser_resize/ },
    { cmd: "bash", args: [tool("playwright-mcp.sh"), "help"], want: /css-play\.mjs/ },
    { cmd: process.execPath, args: [tool("css-play.mjs"), "--help"], want: /hot-swap|hot swap/i },
    // Probe-debug CLIs that used to treat --help as a run (2026-10-01 audit):
    { cmd: process.execPath, args: [tool("cdmcp-bg.mjs"), "--help"], want: /usage:/ },
    { cmd: "python3", args: [tool("cdmcp-cli.py"), "--help"], want: /list-tools/ },
    { cmd: process.execPath, args: [tool("report-server.mjs"), "--help"], want: /--port/ },
    { cmd: process.execPath, args: [tool("garage-angles.mjs"), "--help"], want: /--plan/ },
    { cmd: process.execPath, args: [tool("garage-before.mjs"), "--help"], want: /--plan/ },
    { cmd: process.execPath, args: [tool("garage-angles-fetch.mjs"), "--help"], want: /nearest ancestor/ },
    { cmd: process.execPath, args: [tool("loading-probe.mjs"), "--help"], want: /PHASE ORDER|loading-probe/ },
    { cmd: process.execPath, args: [tool("garage-frame.mjs"), "--help"], want: /garage-frame/ },
    { cmd: process.execPath, args: [tool("flyby.mjs"), "--help"], want: /flyby/ },
    { cmd: process.execPath, args: [tool("profile-gameloop.mjs"), "--help"], want: /cpuprofile|profile-gameloop/ },
    { cmd: process.execPath, args: [tool("backend-compare.mjs"), "--help"], want: /backend-compare/ },
    { cmd: process.execPath, args: [tool("apex-capture.mjs"), "--help"], want: /apex-capture/ },
    { cmd: process.execPath, args: [tool("pit-shots.mjs"), "--help"], want: /--plan/ },
    { cmd: process.execPath, args: [tool("motion-capture.mjs"), "--help"], want: /motion-capture|flicker/ },
    { cmd: process.execPath, args: [tool("frame-report.mjs"), "--help"], want: /frame-report|--fleet/ },
    { cmd: process.execPath, args: [tool("fit-audit.mjs"), "--help"], want: /fit-audit|--only/ },
    { cmd: process.execPath, args: [tool("menu-fit.mjs"), "--help"], want: /--safe/ },
    // Prefer an explicit path so the assertion is independent of a clean vs
    // dirty checkout. `--help` also answers without git (see pick-tests.mjs);
    // either shape is fine — the path form also exercises RULES → test:gfx.
    { cmd: process.execPath, args: [tool("pick-tests.mjs"), "js/render/glx/glx.js"],
      want: /test:gfx/ },
    { cmd: process.execPath, args: [tool("pick-tests.mjs"), "--help"],
      want: /group|test:/ },
  ];
  const failed = [];
  for (const c of cases) {
    const r = spawnSync(c.cmd, c.args, { encoding: "utf8", cwd: ROOT, timeout: 30000 });
    const text = `${r.stdout || ""}\n${r.stderr || ""}`;
    if (r.status !== 0) failed.push(`${path.basename(c.args[0])}: exit ${r.status}`);
    else if (!c.want.test(text)) failed.push(`${path.basename(c.args[0])}: output missing ${c.want}`);
  }
  assert.deepEqual(failed, [], "an MCP-facing entry point does not answer");
});

test("CLI clarity (#1702 #1699 #1696 #1694): help paths answer fast without side effects, typos are errors", () => {
  const at = (rel) => path.join(ROOT, rel);
  const run = (rel, ...args) => spawnSync(rel.endsWith(".py") ? "python3" : process.execPath, [at(rel), ...args],
    { encoding: "utf8", cwd: ROOT, timeout: 15000 });
  const text = (r) => `${r.stdout}\n${r.stderr}`;
  // --help / bare: usage, exit 0. The 15 s timeout is the "no browser, no replay, no scan" assertion.
  for (const [rel, args, want] of [
    ["tools/ci/pick-unit-slices.mjs", ["--help"], /usage:.*pick-unit-slices/],
    ["tools/ci/geometry-paths.mjs", [], /usage:.*geometry-paths/],
    ["tools/ci/playwright-occupancy.mjs", [], /usage:.*playwright-occupancy/],
    ["tools/ci/spec-staleness.mjs", ["--help"], /usage:.*spec-staleness/],
    ["tools/ci/run-playwright.mjs", ["--help"], /usage:.*run-playwright/],
    ["tools/shot/baked-scenery.mjs", ["--help"], /--limit/],
    ["tools/check/scan-globals.mjs", ["--help"], /usage:.*scan-globals/],
    ["tools/check/font-digits.py", ["--help"], /usage:.*font-digits/],
    ["tools/check/extract-module.mjs", ["--help"], /usage:.*extract-module/],
    ["tools/shot/cam-motion.mjs", ["--help"], /usage:/],
    ["tools/shot/cam-corners.mjs", ["--help"], /usage:/],
  ]) {
    const r = run(rel, ...args);
    assert.equal(r.status, 0, `${rel} ${args.join(" ")}: exit ${r.status} ${r.stderr}`);
    assert.match(r.stdout, want, rel);
  }
  // pick-unit-slices --help must print usage, not a computed plan.
  assert.equal(run("tools/ci/pick-unit-slices.mjs", "--help").stdout, "usage: node tools/ci/pick-unit-slices.mjs [paths…] [--since REF] [--json] [--all] [--github-output] [--needed-only] [--costs]\n  Which Pure-node CI matrix slices a diff needs; fail-safe: an unclaimed path selects every slice.\n  no paths: the diff against the deploy merge-base.   --help: this text, nothing is computed.\n");
  // scan-globals --help writes no artifact.
  const graph = at("artifacts/dep-graph.json");
  const before = fs.existsSync(graph) ? fs.statSync(graph).mtimeMs : null;
  run("tools/check/scan-globals.mjs", "--help");
  assert.equal(fs.existsSync(graph) ? fs.statSync(graph).mtimeMs : null, before, "scan-globals --help wrote dep-graph.json");
  // An unknown flag exits non-zero and says so, before any browser or VM boots.
  for (const [rel, args] of [
    ["tools/shot/baked-scenery.mjs", ["--bogus"]],
    ["tools/shot/repro-shot.mjs", ["x.json", "--bogus"]],
    ["tools/shot/shot-survey.mjs", ["--tema"]],
    ["tools/shot/track-session.mjs", ["--serve", "--bogus"]],
    ["tools/shot/cam-motion.mjs", ["--bogus"]],
    ["tools/shot/agent.mjs", ["monza", "world", "--tema=x"]],
    ["tools/shot/shot.mjs", ["monza", "0.1", "--bogus"]],
    ["tools/shot/garage-tap.mjs", ["--bogus"]],
    ["tools/check/physics-tune-sweep.mjs", ["--tema"]],
    ["tools/check/defend-duel.mjs", ["--tema"]],
    ["tools/check/player-dyn.mjs", ["--tema"]],
  ]) {
    const r = run(rel, ...args);
    assert.ok(r.status === 1 || r.status === 2, `${rel} ${args.join(" ")}: exit ${r.status}`);
    assert.match(text(r), /unknown flag/, rel);
  }
  // A bad extract-module range is a message, not a SyntaxError stack. js/game.js lines 1-3 open a comment.
  const bad = run("tools/check/extract-module.mjs", "js/game.js", "1", "3");
  assert.equal(bad.status, 1);
  assert.equal(bad.stderr, "range 1-3 of js/game.js does not parse as a program (Unterminated comment); pass whole functions or statements\n");
  // baked-scenery documents --limit (the cheap smoke).
  assert.match(fs.readFileSync(at("tools/shot/baked-scenery.mjs"), "utf8"), /--limit=1/);
});

test("offline-precache-check --help prints usage and does not launch Chromium", () => {
  // Measured 2026-10-01: `--help` was taken as the warm circuit id and the
  // check booted Playwright against warm=--help. A new agent following the
  // PWA skill's "run it" line must get usage, not a browser.
  const r = spawnSync(process.execPath, [tool("offline-precache-check.cjs"), "--help"],
    { encoding: "utf8", cwd: ROOT, timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  // The usage gained --stage / --root= with #5300 (PWA offline audit), which
  // landed one merge after #5392 pinned the old two-line text exactly.
  assert.equal(r.stdout, "usage: node tools/check/offline-precache-check.cjs [--stage | --root=<staged dir>] [warmCircuit] [coldCircuit]\n"
    + "  Defaults: warm=spa cold=cota, the working tree on 127.0.0.1. Launches Chromium (~1-2 min).\n"
    + "  --stage  stage + stamp the site into artifacts/offline-precache/site first (what pages.yml ships)\n"
    + "  --root=  serve an already staged, stamped site directory\n", "must exit before the server/Chromium path");
});

test("garage-angles / render-car reject an unknown flag (exit 2 + usage) before Chromium; hud-mock -h is help", () => {
  // A bare `--dry-run` used to be ignored and both tools went on to boot a
  // browser for a multi-minute shoot. The 10 s timeout is the "no browser"
  // assertion: a launch would not answer with exit 2 that fast.
  const run = (file, ...args) => spawnSync(process.execPath, [tool(file), ...args],
    { encoding: "utf8", cwd: ROOT, timeout: 10000 });
  for (const [file, args] of [
    ["garage-angles.mjs", ["--bogus"]],
    ["garage-angles.mjs", ["--dry-run", "--team=redbull"]],
    ["render-car.mjs", ["--bogus"]],
    ["render-car.mjs", ["--tema=redbull"]],
  ]) {
    const r = run(file, ...args);
    assert.equal(r.status, 2, `${file} ${args.join(" ")}: exit ${r.status} ${r.stderr}`);
    assert.match(r.stderr, /unknown flag/, file);
    assert.match(r.stderr, new RegExp(file.replace(".", "\\.")), `${file}: usage on stderr`);
  }
  // A livery field (--k=v) stays an open axis on garage-angles: --plan still plans.
  assert.equal(run("garage-angles.mjs", "--plan", "--team=redbull", "--spineLogo=wrap").status, 0);
  const h = run("hud-mock.mjs", "-h");
  assert.equal(h.status, 0, h.stderr);
  assert.match(h.stdout, /--devices/);
  assert.equal(run("hud-mock.mjs", "--bogus").status, 1, "hud-mock: makeFlags rejects an unknown flag");
  // render-car's allow-list must cover every flag the file reads.
  const src = fs.readFileSync(tool("render-car.mjs"), "utf8");
  const set = src.match(/const RC_FLAGS = new Set\(\[([\s\S]*?)\]\)/);
  assert.ok(set, "render-car RC_FLAGS");
  const listed = new Set([...set[1].matchAll(/'([A-Za-z0-9]+)'/g)].map((m) => m[1]));
  const read = [...new Set([...src.matchAll(/\barg\('([A-Za-z0-9]+)'/g)].map((m) => m[1]))];
  assert.deepEqual(read.filter((k) => !listed.has(k)), [], "an arg('…') name missing from RC_FLAGS");
});

test("chrome-devtools-mcp.sh reports its state without launching Chrome", () => {
  // `status` is the one command that must work on a box where the local clone
  // was never built — it is how you find out that is the case.
  const r = spawnSync("bash", [tool("chrome-devtools-mcp.sh"), "status"],
    { encoding: "utf8", cwd: ROOT, timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Chrome:/);
  assert.match(r.stdout, /Bin:/);
});

test("playwright-mcp.sh help and status exit 0 without launching Chromium", () => {
  const help = spawnSync("bash", [tool("playwright-mcp.sh"), "help"],
    { encoding: "utf8", cwd: ROOT, timeout: 15000 });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /@playwright\/mcp@0\.0\.79/);
  assert.match(help.stdout, /browser_evaluate/);
  assert.match(help.stdout, /css-play\.mjs/);
  assert.match(help.stdout, /\bdom\b/);
  const st = spawnSync("bash", [tool("playwright-mcp.sh"), "status"],
    { encoding: "utf8", cwd: ROOT, timeout: 15000 });
  assert.equal(st.status, 0, st.stderr);
  assert.match(st.stdout, /Package:/);
  assert.doesNotMatch(st.stdout, /0\.0\.0\.0/);
});

test("chrome-devtools-mcp.sh help exits 0 without requiring Chromium", () => {
  // help used to run after detect_chrome() at script load, so a Mac without
  // /opt/pw-browsers died before printing usage. Detect belongs in run/verify.
  const r = spawnSync("bash", [tool("chrome-devtools-mcp.sh"), "help"],
    { encoding: "utf8", cwd: ROOT, timeout: 30000 });
  const text = `${r.stdout}\n${r.stderr}`;
  assert.equal(r.status, 0, text);
  assert.match(text, /clone/);
  assert.match(text, /status/);
});

test("self-booting capture/physics tools use harness.mjs, not a subprocess server", () => {
  // These were the last holdouts: python -m http.server / npx serve + a
  // sleep, or a pinned /opt/pw-browsers path. harness.mjs is the
  // teardown-safe server+Chromium pair every other tool uses.
  const files = [
    "survey-track.mjs", "shot.mjs", "measure-props-over-road.mjs", "carshot.mjs",
    "career-economy.mjs", "check-physics.mjs", "rtc-e2e.mjs", "rtc-e2e-3p.mjs",
    "rtc-e2e-room.mjs", "profile-gameloop.mjs", "apex-capture.mjs", "motion-capture.mjs",
    "ab-lighting.mjs", "quick-validate.mjs", "css-play.mjs",
  ];
  const bad = [];
  for (const rel of files) {
    const src = fs.readFileSync(tool(rel), "utf8");
    if (!/from ["']\.{1,2}\/(?:lib\/)?harness\.mjs["']/.test(src))
      bad.push(`${rel}: missing harness.mjs import`);
    if (/spawn\(\s*["']python3["']/.test(src) || /spawn\(\s*["']npx["']/.test(src))
      bad.push(`${rel}: still spawns a subprocess server`);
    if (/chromium-1194/.test(src))
      bad.push(`${rel}: pinned chromium-1194 path`);
  }
  assert.deepEqual(bad, []);
});

test("no tool pins a Linux-only Chromium path as executablePath", () => {
  // rtc-e2e used to die on a Mac with executablePath: "/opt/pw-browsers/chromium".
  // The ladder lives in harness.mjs; everyone else must go through it.
  const pinned = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    if (f.rel.endsWith("harness.mjs")) continue;
    const src = fs.readFileSync(f.abs, "utf8");
    if (/executablePath:\s*["']\/opt\/pw-browsers\/chromium/.test(src))
      pinned.push(f.rel);
  }
  assert.deepEqual(pinned, []);
});

test("a tool waiting on the track build budgets longer than a build takes", () => {
  // MEASURED 2026-09-21 on this container: a TLX build of monza reaches
  // `info().track` in 16.6 s under SwiftShader — the same with and without
  // `polling: 100`, so rAF is not starved and the budget is the whole story.
  // TLX became the DEFAULT backend on 2026-09-18, and from that day the two
  // tools still budgeting 15 s failed on their own default while every sibling
  // kept working (agent.mjs 20 s, shot.mjs 120 s, ssr-probe 120 s). It reads as
  // "the game will not boot", which is the most expensive way to be wrong.
  const FLOOR_MS = 20000;
  const short = [];
  for (const f of FILES) {
    if (![".mjs", ".cjs", ".js"].includes(f.ext)) continue;
    const src = fs.readFileSync(f.abs, "utf8");
    // The wait and its options can straddle a line break, so the window after
    // the predicate is what carries the budget.
    for (const m of src.matchAll(/info\(\)\.track\s*!=\s*null[\s\S]{0,160}?timeout:\s*([\d_]+)([\s\S]{0,120})/g)) {
      const ms = Number(String(m[1]).replace(/_/g, ""));
      // A CAUGHT wait is a probe, not a budget: tools/track/survey-track.mjs
      // races up to three times and treats each timeout as "try again", which
      // works because the second build no longer pays the one-off boot cost.
      // Only a wait whose expiry is FATAL has to outlast a real build.
      if (/\.catch\s*\(/.test(m[2])) continue;
      if (ms < FLOOR_MS) short.push(`${f.rel}: ${ms} ms`);
    }
  }
  assert.deepEqual(short, [],
    `a track-build wait budgets less than ${FLOOR_MS} ms; a real build measured 16.6 s here`);
});
