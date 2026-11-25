// workflow-schedule-stagger.test.mjs — the scheduled workflows do not share a cron minute (2026-11-21, workflow-waste
// audit); the Pages backstop is daily and the lit-WGSL advisory runs on ready PRs only (#6536 R4, R7).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const YAML = createRequire(import.meta.url)("yaml");
const DIR = path.join(ROOT, ".github/workflows");
const read = (f) => YAML.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

test("pages.yml: one daily backstop cron, off the hour and outside 13:00-16:00 UTC (#6536 R4)", () => {
  const sched = read("pages.yml").on.schedule;
  assert.equal(sched.length, 1);
  const [minute, hour, ...rest] = sched[0].cron.trim().split(/\s+/);
  assert.deepEqual(rest, ["*", "*", "*"], "every day");
  assert.ok(/^\d+$/.test(hour) && /^\d+$/.test(minute), `${sched[0].cron} names one hour and one minute`);
  assert.ok(Number(minute) !== 0 && (Number(hour) < 13 || Number(hour) > 16), `${sched[0].cron} sits on a busy slot`);
});

test("lit-wgsl-advisory: pull_request into the deploy branch, its census job on ready PRs only (#6536 R7)", () => {
  const wf = read("lit-wgsl-advisory.yml");
  assert.deepEqual(Object.keys(wf.on), ["pull_request"]);
  assert.deepEqual(wf.on.pull_request.types, ["opened", "synchronize", "reopened", "ready_for_review"]);
  assert.equal(wf.jobs.census.if, "${{ !github.event.pull_request.draft }}", "a draft does nothing; the ready flip runs it");
});

// land.yml and ci.yml still sit on :17 (other open PRs edit them); they move in a follow-up.
const PENDING = new Set(["land.yml", "ci.yml"]);

test("scheduled workflows flake-tally, ratchets-fold and pages own their cron minute, off :00 :17 :30 :47", () => {
  const seen = new Map();
  for (const f of fs.readdirSync(DIR).filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const sched = read(f)?.on?.schedule;
    if (!sched || PENDING.has(f)) continue;
    for (const { cron } of sched) {
      const minute = cron.trim().split(/\s+/)[0];
      assert.ok(Number.isInteger(Number(minute)), `${f}: ${cron} must name one minute`);
      seen.set(minute, [...(seen.get(minute) || []), f]);
    }
  }
  const pages = read("pages.yml").on.schedule.map((s) => s.cron.split(" ")[0]);
  const flake = read("flake-tally.yml").on.schedule.map((s) => s.cron.split(" ")[0]);
  const fold = read("ratchets-fold.yml").on.schedule.map((s) => s.cron.split(" ")[0]);
  for (const m of [...pages, ...flake, ...fold]) {
    assert.ok(![0, 17, 30, 47].includes(Number(m)), `cron minute :${m} sits on a crowded minute`);
    assert.deepEqual(seen.get(m).length, 1, `minute :${m} is shared by ${seen.get(m).join(", ")}`);
  }
});
