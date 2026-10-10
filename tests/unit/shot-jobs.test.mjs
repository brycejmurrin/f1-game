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
