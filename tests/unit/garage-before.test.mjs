/* garage-before.test.mjs — pack recipe, fetch CLI, garage-before.yml.
 *
 * Car agents must fetch garage-before-<sha> instead of recapturing the grid.
 * Pure / spawn --help only — no network, no Chromium.
 *
 * Run: node --test tests/unit/garage-before.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parse as parseYAML } from "yaml";
import {
  SHIP_BRANCH, WORKFLOW_FILE, WORKFLOW_NAME, ARTIFACT_PREFIX, RETENTION_DAYS,
  VIEWS, PRESET_FOR_VIEW, TEAM_SHARDS, TEAMS, WATCH_PATHS,
  artifactName, parseArtifactSha, pathWatched, watchedFiles, shardMatrix,
  captureArgs, decideCapture, pickNearestPack, parseShotName, buildManifest,
  writeManifest, USAGE,
} from "../../tools/shot/garage-before.mjs";
import { USAGE as FETCH_USAGE, loadArtifactsOverride, fetchPack } from "../../tools/garage-angles-fetch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const YML = fs.readFileSync(path.join(ROOT, ".github/workflows", WORKFLOW_FILE), "utf8");
const CAR_SHOT = fs.readFileSync(path.join(ROOT, ".github/workflows/car-shot.yml"), "utf8");

test("recipe: 11 factory teams in 4 shards, 7 named views, hero is 3q", () => {
  assert.equal(TEAMS.length, 11);
  assert.equal(TEAM_SHARDS.length, 4);
  assert.deepEqual(TEAM_SHARDS.flat(), [...TEAMS]);
  assert.deepEqual(VIEWS, ["hero", "front", "side", "rear", "top", "wingFront", "wingRear"]);
  assert.equal(PRESET_FOR_VIEW.hero, "3q");
  assert.equal(PRESET_FOR_VIEW.wingFront, "front-wing");
  assert.equal(PRESET_FOR_VIEW.wingRear, "rear-wing");
  assert.deepEqual(shardMatrix().map((s) => s.shard), ["0", "1", "2", "3"]);
  assert.equal(RETENTION_DAYS, 30);
  assert.equal(WORKFLOW_NAME, "Garage before");
  assert.equal(SHIP_BRANCH, "claude/f1-game-project-26h3ng");
});

test("artifact name is garage-before-<sha>; parse rejects Car shot names", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  assert.equal(artifactName(sha), ARTIFACT_PREFIX + sha);
  assert.equal(parseArtifactSha(ARTIFACT_PREFIX + sha), sha);
  assert.equal(parseArtifactSha("car-shot-macos-latest"), null);
  assert.equal(parseArtifactSha("garage-angles-before-" + sha), null);
});

test("watched paths cover car/garage/render, teams.js and the capture tools", () => {
  assert.ok(pathWatched("js/car/car3d.js"));
  assert.ok(pathWatched("js/garage/setup-sheet.js"));
  assert.ok(pathWatched("js/render/gfx.js"));
  assert.ok(pathWatched("js/data/teams.js"));
  assert.ok(pathWatched("tools/shot/garage-angles.mjs"));
  assert.ok(pathWatched("tools/shot/garage-before.mjs"));
  assert.ok(pathWatched(".github/workflows/garage-before.yml"));
  assert.ok(!pathWatched("js/game.js"));
  assert.ok(!pathWatched("docs/TESTING.md"));
  assert.deepEqual(watchedFiles(["js/car/car3d.js", "css/hud.css", { filename: "js/data/teams.js" }]),
    ["js/car/car3d.js", "js/data/teams.js"]);
  assert.ok(WATCH_PATHS.some((p) => p.startsWith("js/car")));
});

test("decideCapture: dispatch always; schedule / Pages only on watched-path delta", () => {
  assert.deepEqual(decideCapture({ event: "workflow_dispatch" }), { capture: true, reason: "dispatch" });
  assert.deepEqual(decideCapture({ event: "workflow_run", conclusion: "failure" }),
    { capture: false, reason: "pages-not-success" });
  assert.deepEqual(decideCapture({ event: "workflow_run", conclusion: "success", exactPack: { sha: "a" } }),
    { capture: false, reason: "pack-exists" });
  assert.deepEqual(decideCapture({ event: "workflow_run", conclusion: "success" }),
    { capture: true, reason: "no-pack-yet" });
  assert.deepEqual(decideCapture({ event: "workflow_run", conclusion: "success", lastPack: { sha: "a" }, watched: ["js/car/car3d.js"] }),
    { capture: true, reason: "watched-paths-changed" });
  assert.deepEqual(decideCapture({ event: "workflow_run", conclusion: "success", lastPack: { sha: "a" }, watched: [] }),
    { capture: false, reason: "unchanged-since-pack" });
  // The daily schedule (2026-10-14) takes the same skip-when-unchanged path.
  assert.deepEqual(decideCapture({ event: "schedule", exactPack: { sha: "a" } }), { capture: false, reason: "pack-exists" });
  assert.deepEqual(decideCapture({ event: "schedule" }), { capture: true, reason: "no-pack-yet" });
  assert.deepEqual(decideCapture({ event: "schedule", lastPack: { sha: "a" }, watched: ["js/car/car3d.js"] }),
    { capture: true, reason: "watched-paths-changed" });
  assert.deepEqual(decideCapture({ event: "schedule", lastPack: { sha: "a" }, watched: [] }),
    { capture: false, reason: "unchanged-since-pack" });
});

test("pickNearestPack: exact SHA, else newest ancestor (compare ahead / behind_by 0)", () => {
  const packs = [
    { sha: "aaa1111", created_at: "2026-10-01T00:00:00Z" },
    { sha: "bbb2222", created_at: "2026-10-04T00:00:00Z" },
    { sha: "ccc3333", created_at: "2026-10-03T00:00:00Z" },
  ];
  const want = "ddd4444deadbeef";
  assert.equal(pickNearestPack(want, packs, {}), null);
  const exact = pickNearestPack("bbb2222abc", packs, {});
  assert.equal(exact.pack.sha, "bbb2222");
  assert.equal(exact.exact, true);
  const compares = {
    bbb2222: { status: "diverged", ahead_by: 2, behind_by: 1 },
    ccc3333: { status: "ahead", ahead_by: 4, behind_by: 0 },
    aaa1111: { status: "ahead", ahead_by: 20, behind_by: 0 },
  };
  const near = pickNearestPack(want, packs, compares);
  assert.equal(near.pack.sha, "ccc3333", "newest ancestor, not the diverged newer pack");
  assert.equal(near.exact, false);
  assert.equal(near.ahead_by, 4);
});

test("captureArgs and MANIFEST map team-cam.png onto preset names", () => {
  const args = captureArgs({ teams: ["mclaren", "ferrari"], out: "scratch/g" });
  assert.ok(args.includes("--team=mclaren,ferrari"));
  assert.ok(args.includes("--full-views"));
  assert.ok(args.includes("--views=" + VIEWS.join(",")));
  assert.ok(args.includes("--name={team}-{cam}"));
  assert.equal(parseShotName("mclaren-hero.png").preset, "3q");
  assert.equal(parseShotName("ferrari-wingRear.png").preset, "rear-wing");
  assert.equal(parseShotName("all-teams-rollup.png"), null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-before-"));
  fs.writeFileSync(path.join(dir, "mclaren-hero.png"), "x");
  fs.writeFileSync(path.join(dir, "mclaren-front.png"), "x");
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const m = writeManifest(dir, { sha, timestamp: "2026-10-05T00:00:00.000Z" });
  assert.equal(m.sha, sha);
  assert.equal(m.shots.length, 2);
  assert.deepEqual(new Set(m.shots.map((s) => s.preset)), new Set(["3q", "front"]));
  assert.ok(m.shots.every((s) => s.team === "mclaren" && s.sha === sha));
  const onDisk = JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8"));
  assert.equal(onDisk.shots.length, 2);
  fs.rmSync(dir, { recursive: true, force: true });
  assert.ok(buildManifest({ sha, files: ["cadillac-top.png"] }).shots[0].preset === "top");
});

test("workflow is Garage before, not an extension of Car shot", () => {
  assert.match(YML, /^name: Garage before$/m);
  assert.match(YML, /default: "claude\/f1-game-project-26h3ng"/);
  assert.match(YML, /runs-on: macos-latest/);
  assert.doesNotMatch(YML, /runs-on: ubuntu-latest\n    timeout-minutes: 25/, "capture is macos, not ubuntu");
  assert.doesNotMatch(YML, /pull_request:/);
  assert.match(YML, /retention-days: 30/);
  assert.match(YML, /name: garage-before-\$\{\{ needs\.plan\.outputs\.sha \}\}/);
  assert.match(YML, /cancel-in-progress: false/);
  assert.match(YML, /node tools\/shot\/garage-angles\.mjs/);
  assert.doesNotMatch(YML, /node tools\/car\/render-car\.mjs/);
  const runBlocks = YML.split("\n").filter((l) => /^\s+(run:|node )/.test(l) || /garage-angles\.mjs/.test(l));
  assert.ok(runBlocks.some((l) => /garage-angles\.mjs/.test(l)));
  assert.ok(!runBlocks.some((l) => /render-car|carview\.html/.test(l)), "jobs must not invoke the studio renderer");
  assert.doesNotMatch(CAR_SHOT, /garage-before/);
  assert.match(CAR_SHOT, /render-car\.mjs/, "Car shot stays the studio job");
  // Inputs reach the script through env, never interpolated into run:.
  const runs = YML.split("\n").filter((l) => /^\s+run: /.test(l) || /^\s+node /.test(l));
  for (const l of runs) {
    assert.ok(!/\$\{\{\s*(inputs|github\.event)\./.test(l), `input interpolated into a shell line: ${l.trim()}`);
  }
  assert.match(YML, /NOT A GATE/);
});

// ACTIONS-AUDIT-2026-10-14 finding 1: a per-sha group on the 4-shard capture
// MATRIX let one shard run, parked one and cancelled two, so 0 of 65 runs packed.
test("workflow: single-flight per run, never a concurrency group on a matrix job", () => {
  const wf = parseYAML(YML);
  const jobs = Object.entries(wf.jobs);
  const matrixJobs = jobs.filter(([, j]) => j.strategy && j.strategy.matrix);
  assert.ok(matrixJobs.length >= 1, "capture is still a matrix");
  for (const [id, j] of matrixJobs) {
    assert.equal(j.concurrency, undefined, `${id}: concurrency on a matrix job cancels its shards`);
  }
  assert.equal(wf.jobs.capture.strategy["max-parallel"], 2, "capture holds at most 2 of the 5 macOS slots");
  assert.equal(wf.jobs.capture["runs-on"], "macos-latest");
  // The run holds the group; a newer run waits instead of discarding a pack.
  assert.match(String(wf.concurrency?.group), /^garage-before-\$\{\{ inputs\.ref \|\| 'claude\/f1-game-project-26h3ng' \}\}$/);
  assert.equal(wf.concurrency["cancel-in-progress"], false);
  // pack keeps its own per-sha group, distinct from the run-level one (no self-deadlock).
  assert.equal(wf.jobs.pack.concurrency.group, "garage-before-pack-${{ needs.plan.outputs.sha }}");
  assert.equal(wf.jobs.pack.concurrency["cancel-in-progress"], false);
  assert.notEqual(wf.jobs.pack.concurrency.group, wf.concurrency.group);
  assert.match(String(wf.jobs.pack.if), /needs\.capture\.result == 'success'/);
  // Daily schedule + dispatch, not after every train publish.
  const on = wf.on;
  assert.deepEqual(Object.keys(on).sort(), ["schedule", "workflow_dispatch"]);
  assert.equal(on.schedule.length, 1);
  assert.match(on.schedule[0].cron, /^\d{1,2} \d{1,2} \* \* \*$/, "once a day");
  assert.doesNotMatch(on.schedule[0].cron, /^0 /, "off the top-of-hour schedule delay");
  assert.doesNotMatch(YML, /^\s+workflow_run:/m);
});

// Car shot's ubuntu control hit its 20-min cap twice on SwiftShader
// (37094281675, 37087026592): Linux gets Mesa llvmpipe, which render-car reads.
test("car-shot: the Linux control runs on Mesa llvmpipe, macOS on the host GPU", () => {
  assert.match(CAR_SHOT, /if: runner\.os == 'Linux'\n\s+uses: \.\/\.github\/actions\/mesa-xvfb/);
  assert.match(CAR_SHOT, /APEX_GL: \$\{\{ runner\.os == 'Linux' && 'llvmpipe' \|\| '' \}\}/);
  assert.match(CAR_SHOT, /RUNNER_OS" != "Linux" \]; then ARGS="\$ARGS --gpu=1"/);
  const src = fs.readFileSync(path.join(ROOT, "tools/car/render-car.mjs"), "utf8");
  assert.match(src, /glStack\(\) === 'llvmpipe'/, "render-car honours APEX_GL=llvmpipe");
  assert.match(src, /'--use-angle=gl', '--use-gl=angle'/);
  assert.match(src, /\['--use-angle=swiftshader'\]/, "SwiftShader stays the default pin");
});

test("garage-before.mjs and fetch --help exit 0 without network", () => {
  const help = spawnSync(process.execPath, ["tools/shot/garage-before.mjs", "--help"], {
    cwd: ROOT, encoding: "utf8", timeout: 8000,
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /usage: node tools\/shot\/garage-before\.mjs/);
  assert.match(USAGE, /--plan/);
  const fetch = spawnSync(process.execPath, ["tools/garage-angles-fetch.mjs", "--help"], {
    cwd: ROOT, encoding: "utf8", timeout: 8000,
  });
  assert.equal(fetch.status, 0, fetch.stderr);
  assert.match(fetch.stdout, /usage: node tools\/garage-angles-fetch\.mjs/);
  assert.match(FETCH_USAGE, /nearest ancestor/);
});

test("fetch --artifacts=@empty is the no-pack case (exit 2)", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-fetch-"));
  const empty = path.join(dir, "empty.json");
  fs.writeFileSync(empty, "[]\n");
  const r = spawnSync(process.execPath, [
    "tools/garage-angles-fetch.mjs",
    "--sha=0123456789abcdef0123456789abcdef01234567",
    `--artifacts=@${empty}`,
    "--dry-run",
    "--json",
  ], { cwd: ROOT, encoding: "utf8", timeout: 8000 });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /no garage-before-<sha> pack/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("fetch --artifacts=@file with no matching SHA is the no-pack case", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "garage-fetch-"));
  const catalog = path.join(dir, "packs.json");
  fs.writeFileSync(catalog, JSON.stringify([
    { name: "garage-before-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", created_at: "2026-10-01T00:00:00Z", expired: false, id: 1 },
  ]));
  const r = spawnSync(process.execPath, [
    "tools/garage-angles-fetch.mjs",
    "--sha=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    `--artifacts=@${catalog}`,
    "--dry-run",
    "--json",
  ], { cwd: ROOT, encoding: "utf8", timeout: 8000 });
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr + r.stdout, /no garage-before-<sha> pack/);
  assert.deepEqual(loadArtifactsOverride([`--artifacts=@${catalog}`])[0].id, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});


test("fetchPack downloads the repository artifact and extracts it without a live API", async () => {
  fs.mkdirSync(path.join(ROOT, "scratch"), { recursive: true });
  const fixture = fs.mkdtempSync(path.join(ROOT, "scratch/garage-download-"));
  const out = path.join(fixture, "out");
  const priorPath = process.env.PATH;
  const sha = "a".repeat(40);
  try {
    // Stub only external processes; exercise the real download URL construction,
    // curl status handling, extraction arguments and temporary-file removal.
    fs.writeFileSync(path.join(fixture, "curl"), `#!${process.execPath}
import fs from "node:fs";
const args = process.argv.slice(2);
if (args.at(-1) !== "https://api.github.com/repos/brycejmurrin/f1-game/actions/artifacts/123/zip") process.exit(7);
fs.writeFileSync(args[args.indexOf("-o") + 1], "fixture zip");
process.stdout.write("200");
`, { mode: 0o755 });
    fs.writeFileSync(path.join(fixture, "unzip"), `#!${process.execPath}
import fs from "node:fs"; import path from "node:path";
const args = process.argv.slice(2);
if (fs.readFileSync(args[2], "utf8") !== "fixture zip") process.exit(8);
fs.writeFileSync(path.join(args[4], "manifest.json"), '{"fixture":true}');
`, { mode: 0o755 });
    process.env.PATH = fixture + path.delimiter + priorPath;
    const result = await fetchPack({ sha, token: "fixture-token", out, artifacts: [
      { name: artifactName(sha), id: 123, expired: false, created_at: "2026-10-01T00:00:00Z" },
    ] });
    assert.equal(result.error, undefined);
    assert.equal(result.exact, true);
    assert.equal(result.out, out);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8")), { fixture: true });
    assert.equal(fs.existsSync(path.join(ROOT, "artifacts", `garage-before-${process.pid}.zip`)), false);
  } finally {
    if (priorPath === undefined) delete process.env.PATH; else process.env.PATH = priorPath;
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
