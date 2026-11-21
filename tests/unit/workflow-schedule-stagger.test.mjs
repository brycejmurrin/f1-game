// workflow-schedule-stagger.test.mjs — phone-shots starts only for its purpose and escapes the two 2026-11-11
// ghost runs, and the scheduled workflows do not share a cron minute (2026-11-21, workflow-waste audit).
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

test("phone-shots: comment created only, app posts screened in the job if, per-issue job-level group", () => {
  const wf = read("phone-shots.yml");
  assert.deepEqual(wf.on.issue_comment.types, ["created"], "a comment edit is a dispatch backfill, not a trigger");
  assert.equal(wf.concurrency, undefined, "no workflow-level group: a skipped run must not queue behind anything");
  const job = wf.jobs.copy;
  // The screen's terms, in one pin: owner sender, and no app on the comment or the issue (agents post as the owner).
  const terms = ["github.event.sender.login == github.repository_owner", "!github.event.comment.performed_via_github_app",
    "!github.event.issue.performed_via_github_app"];
  assert.deepEqual(terms.filter((t) => !job.if.includes(t)), [], "phone-shots job if lost a screen term");
  assert.equal(job.concurrency.group, "phone-shots-copy-${{ github.event.issue.number || inputs.issue }}");
  assert.notEqual(job.concurrency.group, "phone-shots", "the retired group holds runs 43097279571 and 43098589151");
  assert.equal(job.concurrency["cancel-in-progress"], false);
});

// land.yml and ci.yml still sit on :17 (other open PRs edit them); they move in a follow-up.
const PENDING = new Set(["land.yml", "ci.yml"]);

test("scheduled workflows dispatch, flake-tally and ratchets-fold own their cron minute, off :00 :17 :30 :47", () => {
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
  const dispatch = read("dispatch.yml").on.schedule.map((s) => s.cron.split(" ")[0]);
  const flake = read("flake-tally.yml").on.schedule.map((s) => s.cron.split(" ")[0]);
  const fold = read("ratchets-fold.yml").on.schedule.map((s) => s.cron.split(" ")[0]);
  for (const m of [...dispatch, ...flake, ...fold]) {
    assert.ok(![0, 17, 30, 47].includes(Number(m)), `cron minute :${m} sits on a crowded minute`);
    assert.deepEqual(seen.get(m).length, 1, `minute :${m} is shared by ${seen.get(m).join(", ")}`);
  }
});
