// Pure shot.mjs job parse / batch / format helpers (no Chromium).
// Run: node --test tests/unit/shot-jobs.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  imageFormatFor,
  normalizeJob,
  parseShotArgv,
  groupJobsByTrack,
  shotSessionKey,
  loadBatchFile,
  SHOT_USAGE,
} from "../../tools/shot/shot-jobs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TMP = path.join(ROOT, "artifacts", "tmp", "shot-jobs-test");

test("imageFormatFor: extension and --jpeg", () => {
  assert.equal(imageFormatFor("a.png").type, "png");
  assert.equal(imageFormatFor("a.jpg").type, "jpeg");
  assert.equal(imageFormatFor("a.png", { jpegFlag: true }).type, "jpeg");
  assert.equal(imageFormatFor("a.jpeg").quality, 85);
});

test("normalizeJob defaults and safety", () => {
  const j = normalizeJob({}, { ROOT });
  assert.equal(j.trackId, "monza");
  assert.equal(j.cam, "orbit");
  assert.equal(j.type, "png");
  assert.match(j.out, /playwright-probe[/\\]monza-10-orbit\.png$/);
  const jpg = normalizeJob({ out: path.join(TMP, "x.jpg") }, { ROOT });
  assert.equal(jpg.type, "jpeg");
  assert.throws(() => normalizeJob({ cam: "nope" }, { ROOT }), /unknown cam/);
});

test("parseShotArgv single + batch + raster", () => {
  fs.mkdirSync(TMP, { recursive: true });
  const batch = path.join(TMP, "jobs.json");
  fs.writeFileSync(batch, JSON.stringify([
    { track: "monza", frac: 0.1, cam: "orbit" },
    { track: "spa", frac: 0.2, cam: "eye", out: path.join(TMP, "spa.jpg") },
    { track: "monza", frac: 0.5, cam: "park" },
  ]));
  const single = parseShotArgv(["monaco", "0.25", "eye"], ROOT);
  assert.equal(single.mode, "single");
  assert.equal(single.jobs[0].trackId, "monaco");
  assert.equal(single.jobs[0].frac, 0.25);

  const multi = parseShotArgv(["--batch", batch, "--jpeg"], ROOT);
  assert.equal(multi.mode, "batch");
  assert.equal(multi.jobs.length, 3);
  assert.equal(multi.jobs[1].type, "jpeg");
  const groups = groupJobsByTrack(multi.jobs);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].trackId, "monza");
  assert.equal(groups[0].jobs.length, 2);

  const raster = parseShotArgv(["monza", "0.1", "--raster"], ROOT);
  assert.equal(raster.jobs[0].raster, true);
  assert.match(SHOT_USAGE, /--batch/);
});

test("--clear is opt-in: off by default, on from the flag or a batch field (#2253)", () => {
  assert.equal(parseShotArgv(["monza", "0.1", "orbit"], ROOT).jobs[0].clear, false);
  const flagged = parseShotArgv(["monza", "0.1", "--clear", "cinematic"], ROOT).jobs[0];
  assert.equal(flagged.clear, true);
  assert.equal(flagged.cam, "cinematic", "--clear takes no value, so the next positional is still the cam");
  assert.equal(normalizeJob({ track: "vegas", cam: "orbit", clear: true }, { ROOT }).clear, true);
  assert.match(SHOT_USAGE, /--clear/);
});

test("loadBatchFile accepts JSONL", () => {
  fs.mkdirSync(TMP, { recursive: true });
  const f = path.join(TMP, "jobs.jsonl");
  fs.writeFileSync(f, [
    '{"track":"monza","frac":0.1}',
    "# comment",
    '{"track":"spa","frac":0.2}',
  ].join("\n"));
  assert.equal(loadBatchFile(f).length, 2);
});


test("batch groups only compatible warm scenes, including an unpinned first team", () => {
  const raws = [
    { track: "monza", team: null },
    { track: "spa", team: "ferrari" },
    { track: "monza", team: "ferrari" },
    { track: "monza", team: null, frac: 0.3 },
    { track: "monza", team: null, tod: "night" },
    { track: "monza", team: null, backend: "webgl2" },
    { track: "monza", team: null, width: 640, height: 360 },
    { track: "monza", team: null, dpr: 2 },
  ];
  const jobs = raws.map((raw) => normalizeJob(raw, { ROOT }));
  const groups = groupJobsByTrack(jobs);
  assert.equal(groups.length, 7);
  assert.deepEqual(groups[0].jobs.map((j) => j.frac), [0.1, 0.3]);
  assert.notEqual(shotSessionKey(jobs[0]), shotSessionKey(jobs[2]));
  assert.equal(shotSessionKey(jobs[0]), shotSessionKey(jobs[4])); // lighting can change in-place
  for (const index of [5, 6, 7]) assert.notEqual(shotSessionKey(jobs[0]), shotSessionKey(jobs[index]));
});

test("shared capture flags do not consume shot positionals and preview controls output", () => {
  const plan = parseShotArgv(["--profile", "preview", "--trace", "--cache-assets", "monaco", "0.25", "eye", "--backend", "webgl2"], ROOT);
  const job = plan.jobs[0];
  assert.equal(job.trackId, "monaco");
  assert.equal(job.cam, "eye");
  assert.equal(job.backend, "webgl2");
  assert.equal(job.type, "jpeg");
  assert.equal(job.quality, 80);
  assert.deepEqual(job.viewport, { width: 640, height: 360 });
  assert.match(job.out, /monaco-25-eye\.jpg$/);
  assert.equal(plan.capture.trace, true);
  assert.equal(plan.capture.cacheAssets, true);
  assert.throws(() => parseShotArgv(["--dpr", "8", "monza"], ROOT), /--dpr/);
});

test("isolated batches keep every job in its own group", () => {
  const capture = parseShotArgv(["monza", "--isolated"], ROOT).capture;
  const jobs = [0.1, 0.2].map((frac) => normalizeJob({ track: "monza", frac }, { ROOT, capture }));
  assert.equal(groupJobsByTrack(jobs).length, 2);
});

test("job-specific comparison profile resets preview encoder and size", () => {
  const capture = parseShotArgv(["monza", "--profile", "preview"], ROOT).capture;
  const job = normalizeJob({ profile: "comparison" }, { ROOT, capture });
  assert.equal(job.type, "png");
  assert.deepEqual(job.viewport, { width: 1280, height: 720 });
  assert.equal(job.quality, undefined);
  assert.throws(() => normalizeJob({ tod: "bad" }, { ROOT }), /time of day/);
  assert.throws(() => normalizeJob({ backend: "bad" }, { ROOT }), /backend/);
});


test("per-job isolation is retained even when the batch otherwise reuses warm scenes", () => {
  const job = normalizeJob({ track: "monza", isolated: true }, { ROOT });
  assert.equal(job.capture.isolated, true);
  assert.equal(groupJobsByTrack([job, job]).length, 2);
});

test("--weather parses, validates, and splits batch groups", () => {
  const plan = parseShotArgv(["monaco", "0.47", "orbit", "--tod", "dusk", "--weather", "rain"], ROOT);
  assert.equal(plan.jobs[0].weather, "rain");
  assert.equal(plan.jobs[0].tod, "dusk");
  assert.equal(plan.jobs[0].cam, "orbit");
  assert.equal(parseShotArgv(["monza"], ROOT).jobs[0].weather, "dry");
  assert.throws(() => parseShotArgv(["monza", "--weather", "snow"], ROOT), /unknown weather/);
  assert.throws(() => normalizeJob({ weather: "hail" }, { ROOT }), /unknown weather/);
  const jobs = [{ weather: "fog" }, { weather: "dry" }, { frac: 0.3, weather: "fog" }, { frac: 0.4 }]
    .map((raw) => normalizeJob({ track: "monza", ...raw }, { ROOT }));
  const groups = groupJobsByTrack(jobs);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.map((g) => g.jobs.map((j) => j.weather)), [["fog", "fog"], ["dry", "dry"]]);
  assert.equal(shotSessionKey(jobs[0]), shotSessionKey(jobs[1])); // weather changes in place, like tod
  assert.match(SHOT_USAGE, /--weather dry\|wet\|rain\|overcast\|fog/);
});
