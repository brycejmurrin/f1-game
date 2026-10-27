// Measurement requests must be validated before browser/server work starts.
// The runner below uses injected workers; this test never launches a browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CliArgError } from "../../tools/lib/cli-args.mjs";
import { main, planSweep } from "../../tools/check/physics-tune-sweep.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("space and equals sweep options produce the same requested work", () => {
  const space = ["--sliders", "pm-rate", "--tracks", "monza", "--notches", "5", "--aggr", "0.8", "--steps", "1", "--json", "out.json"];
  const equals = ["--sliders=pm-rate", "--tracks=monza", "--notches=5", "--aggr=0.8", "--steps=1", "--json=out.json"];
  const plan = planSweep(equals);
  assert.deepEqual(plan, planSweep(space));
  assert.deepEqual(plan.sweep.map((s) => s.id), ["pm-rate"]);
  assert.deepEqual(plan.tracks, ["monza"]);
  assert.equal(plan.aggr, 0.8);
  assert.equal(plan.steps, 1);
  assert.equal(plan.jsonOut, "out.json");
  assert.deepEqual(plan.jobs.map(({ sliderId, notch }) => [sliderId, notch]), [["pm-rate", 5]]);
});

test("an omitted notch option sweeps every actual slider notch, never zero", () => {
  const plan = planSweep([]);
  assert.equal(plan.sweep.length, 6);
  assert.deepEqual(plan.tracks, ["monza", "suzuka", "bahrain"]);
  assert.equal(plan.steps, 2600);
  assert.equal(plan.aggr, 0.88);
  assert.equal(plan.jsonOut, "");
  assert.equal(plan.jobs.length, 69);
  for (const slider of plan.sweep) {
    const actual = plan.jobs.filter((job) => job.sliderId === slider.id).map((job) => job.notch);
    const count = slider.id === "pm-pace" ? 19 : 10;
    assert.deepEqual(actual, Array.from({ length: count }, (_, i) => i + 1));
  }
  assert.deepEqual(planSweep(["--sliders=pm-pace", "--notches=19"]).jobs.map((j) => j.notch), [19]);
  assert.deepEqual(planSweep(["--sliders=pm-rate", "--notches=1,,5"]).jobs.map((j) => j.notch), [1, 5]);
});

test("invalid sweep requests reject before starting any server, worker or cleanup", async () => {
  let calls = 0;
  const forbidden = () => { calls++; throw new Error("launch reached"); };
  const dependencies = { startServer: forbidden, openWorker: forbidden, driveTrack: forbidden, cleanup: forbidden };
  const invalid = [
    ["--sliders=pm-raet"], ["--sliders=pm-rate,typo"], ["--sliders="], ["--sliders=,,"],
    ["--tracks=monza,typo"], ["--tracks="], ["--tracks=,,"],
    ["--notches="], ["--notches", ""], ["--notches=,,"], ["--notches=0"],
    ["--notches=1,NaN"], ["--notches=Infinity"], ["--notches=1.5"], ["--notches=-1"],
    ["--sliders=pm-rate", "--notches=11"], ["--sliders=pm-pace", "--notches=20"],
    ["--steps=0"], ["--steps=NaN"], ["--steps=Infinity"], ["--steps=1.5"],
    ["--aggr=0"], ["--aggr=NaN"], ["--aggr=-1"], ["--aggr=Infinity"],
    ["--json="], ["--json"], ["--steps", "--tracks=monza"],
    ["--tema"], ["--help=false"], ["-x"], ["monza"],
  ];
  for (const argv of invalid) {
    await assert.rejects(main(argv, dependencies), (e) => e instanceof CliArgError, JSON.stringify(argv));
  }
  assert.equal(calls, 0);
});

test("help prints usage without a launch", async () => {
  const output = [];
  const forbidden = () => assert.fail("help must not start work");
  await main(["--help"], { startServer: forbidden, openWorker: forbidden, driveTrack: forbidden,
    cleanup: forbidden, log: (line) => output.push(line) });
  assert.match(output.join("\n"), /physics-tune-sweep.*driveability/);
});

test("the runner uses the requested scenario and writes its requested JSON file", async (t) => {
  const parent = path.join(ROOT, "artifacts", "cli-plan-e8b1-tests");
  fs.mkdirSync(parent, { recursive: true });
  const dir = fs.mkdtempSync(path.join(parent, "run-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const jsonOut = path.join(dir, "nested", "requested.json");
  const page = {};
  const calls = [];
  const row = { notch: 5, value: 3.23, completed: true, lapTime: 87.5,
    distM: 5793, excursions: 0, offSec: 0, slipMean: 0.2, slipPeak: 0.3, latPeak: 2.5 };
  await main(["--sliders=pm-rate", "--tracks=monza", "--notches=5", "--aggr=0.8", "--steps=1", `--json=${jsonOut}`], {
    startServer: async (root) => { assert.equal(root, ROOT.replace(/[\\/]$/, "")); calls.push("server"); return { port: 1234 }; },
    openWorker: async (url) => { assert.equal(url, "http://127.0.0.1:1234/"); calls.push("worker"); return { page }; },
    driveTrack: async (actualPage, track, jobs, onRow, policy) => {
      assert.equal(actualPage, page);
      assert.equal(track, "monza");
      assert.deepEqual(policy, { aggr: 0.8, steps: 1 });
      assert.deepEqual(jobs.map(({ sliderId, tuningKey, notch }) => [sliderId, tuningKey, notch]), [["pm-rate", "wheelbase", 5]]);
      calls.push("drive");
      onRow(track, jobs[0], row);
    },
    cleanup: async () => { calls.push("cleanup"); },
    log: () => {},
  });
  assert.deepEqual(calls, ["server", "worker", "drive", "cleanup"]);
  assert.deepEqual(JSON.parse(fs.readFileSync(jsonOut, "utf8")), {
    aggr: 0.8, steps: 1, tracks: ["monza"], results: { "pm-rate": { monza: [row] } },
  });
});
