// designer-code-cli — tools/track/designer-code.mjs: headless share-code decode
// + TrackValidate / TrackInsight report. Round-trips a green ellipse (exit 0,
// JSON shape), refuses a corrupted code (exit 1), and flags a figure-8
// (invalid geometry) with a listed RED issue (exit 1).
//
// Run: node --test tests/unit/designer-code-cli.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { bootEditor, design, ellipse } from "../helpers/editor-vm.mjs";
import {
  analyzeCode,
  formatReport,
  parseArgs,
  run,
} from "../../tools/track/designer-code.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLI = path.join(ROOT, "tools/track/designer-code.mjs");

const cli = (args, opts = {}) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 30000,
  maxBuffer: 4 * 1024 * 1024,
  input: opts.input,
  env: { ...process.env, ...(opts.env || {}) },
});

/** A figure-8 that TrackValidate marks RED on crossing (same lattice as the geometry suite). */
function figureEightPts() {
  const eight = [];
  for (let i = 0; i < 48; i++) {
    const t = (i / 48) * Math.PI * 2;
    eight.push([Math.round(900 * Math.sin(t) * 4) / 4, Math.round(450 * Math.sin(2 * t) * 4) / 4]);
  }
  return eight;
}

test("parseArgs accepts code / --file / --json and rejects unknown flags", () => {
  assert.deepEqual(parseArgs(["--json", "APXT1.p.AAA"]).json, true);
  assert.equal(parseArgs(["--json", "APXT1.p.AAA"]).code, "APXT1.p.AAA");
  assert.equal(parseArgs(["--file", "x.txt"]).file, "x.txt");
  assert.equal(parseArgs(["--help"]).help, true);
  assert.match(parseArgs(["--nope"]).error || "", /unknown flag/);
  assert.match(parseArgs(["--file"]).error || "", /requires a path/);
});

test("valid round-trip share code: exit 0 and JSON shape (length, corners, issues)", async () => {
  const editor = bootEditor();
  const code = await editor.CD.encode(design({ name: "OVAL LOOP", pts: ellipse() }));
  assert.match(code, /^APXT1\./);

  const report = await analyzeCode(code, editor);
  assert.equal(report.ok, true, JSON.stringify(report.issues));
  assert.equal(report.exitCode, 0);
  assert.equal(report.stage, "validate");
  assert.ok(report.lengthM > 2500, `length ${report.lengthM}`);
  assert.ok(report.corners >= 1, `corners ${report.corners}`);
  assert.ok(Array.isArray(report.issues));
  assert.equal(report.red, 0);
  assert.ok(report.id);
  assert.match(formatReport(report), /^OK\b/);

  const viaRun = await run(["--json", code], { editor });
  assert.equal(viaRun.exitCode, 0, viaRun.stderr);
  const json = JSON.parse(viaRun.stdout);
  assert.equal(json.ok, true);
  assert.equal(json.exitCode, 0);
  assert.ok(Number.isFinite(json.lengthM));
  assert.ok(Number.isFinite(json.corners));
  assert.ok(Array.isArray(json.issues));
  assert.equal(json.red, 0);

  const spawned = cli(["--json", code]);
  assert.equal(spawned.status, 0, spawned.stderr);
  const spawnedJson = JSON.parse(spawned.stdout);
  assert.equal(spawnedJson.ok, true);
  assert.ok(spawnedJson.lengthM > 0);
  assert.ok(Array.isArray(spawnedJson.issues));
});

test("corrupted share code: exit 1 with decode reason", async () => {
  const editor = bootEditor();
  const good = await editor.CD.encode(design());
  const body = good.split(".")[2];
  const flipped = "APXT1.p." + body.slice(0, 10) + (body[10] === "A" ? "B" : "A") + body.slice(11);

  const report = await analyzeCode(flipped, editor);
  assert.equal(report.ok, false);
  assert.equal(report.exitCode, 1);
  assert.equal(report.stage, "decode");
  assert.equal(report.reason, "check");

  const viaRun = await run(["--json", flipped], { editor });
  assert.equal(viaRun.exitCode, 1);
  const json = JSON.parse(viaRun.stdout);
  assert.equal(json.ok, false);
  assert.equal(json.stage, "decode");
  assert.equal(json.reason, "check");

  const spawned = cli(["APXT1.p.NOTAVALIDCODE"]);
  assert.equal(spawned.status, 1);
  assert.match(spawned.stderr, /decode failed|FAIL/);
});

test("invalid-geometry track (figure-8): exit 1 and lists a RED issue", async () => {
  const editor = bootEditor();
  const code = await editor.CD.encode(design({ name: "EIGHT", pts: figureEightPts() }));
  const report = await analyzeCode(code, editor);
  assert.equal(report.ok, false);
  assert.equal(report.exitCode, 1);
  assert.equal(report.stage, "validate");
  assert.ok(report.red >= 1, `expected reds, got ${report.red}`);
  assert.ok(
    report.issues.some((i) => i.level === "red" && (i.code === "crossing" || i.code === "clearance")),
    JSON.stringify(report.issues),
  );
  assert.match(formatReport(report), /^FAIL\b/);
  assert.match(formatReport(report), /crossing|clearance/);

  const parent = path.join(ROOT, "artifacts/tmp");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "designer-code-"));
  const file = path.join(dir, "eight.txt");
  fs.writeFileSync(file, code);
  try {
    const spawned = cli(["--file", file, "--json"]);
    assert.equal(spawned.status, 1, spawned.stderr + spawned.stdout);
    const json = JSON.parse(spawned.stdout);
    assert.equal(json.ok, false);
    assert.ok(json.issues.some((i) => i.level === "red"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--help exits 0; missing input exits 1", async () => {
  const help = await run(["--help"]);
  assert.equal(help.exitCode, 0);
  assert.match(help.stdout, /usage: designer-code/);

  const missing = await run([], { stdin: () => "" });
  assert.equal(missing.exitCode, 1);
  assert.match(missing.stderr, /no share code/);
});
