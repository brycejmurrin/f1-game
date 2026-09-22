#!/usr/bin/env node
// spec-staleness — which browser specs has the change-aware gate not run lately?
// @doc Replays select-specs over recent history to rank tests/specs/*.spec.js by how long since CI last selected one.
// @section runner
//
// WHY THIS EXISTS. ci.yml's blocking gate is change-aware: it runs the specs a
// diff routes to, names the rest, and goes green. That is the right trade for a
// 15-minute budget — but it means "the branch is green" is a claim about the
// SELECTED specs, not about the suite. A spec no diff has routed to in weeks is
// not passing; it is unobserved, and the two read identically on the badge.
//
// It is not hypothetical. On 2026-09-21 tests/specs/debris.spec.js had been red
// for three days behind a green branch: the default flipped to OFF on the 18th
// and nothing since had touched a file that routes to that spec. On 2026-09-22
// three more (parts-physics, parts-factory-presets, parts-mesh-cache) turned out
// to have been red since the Legends work landed, for the same reason. Four
// specs, one cause, and in both cases the gate was working exactly as designed.
//
// WHAT IT DOES. For every commit in the window it replays the REAL selector —
// select() with `<sha>~1..<sha>`, so the routing is the gate's own, not a
// reimplementation of it — and records the newest commit that would have run
// each spec. A spec runs if it lands in `selected` or in `oversize` (a spec too
// big for the main shard is billed its own timeout and still runs); `skipped`,
// `unreachable` and the covered-elsewhere buckets do not count as a run.
//
// READING IT. Age is the signal, not the verdict: a spec that nothing routes to
// may be genuinely stable, or may have been broken since the day it stopped
// being selected. The point is to make the distinction cheap to check, so the
// list is ordered by risk and the tail is the place to look first.
//
// RUN THE RESULT AT --workers=1. Measured 2026-09-22: the first sweep of the 12
// unreachable specs used --workers=4 on this 4-core box, Playwright spawned
// more than that, SwiftShader made every one CPU-bound, and loadavg hit 22. It
// reported 14 failures across three specs. Every one was the box: touch-steer,
// parts-catalog and parts-setup-ids each pass 100% alone. Note especially that
// two of the fourteen were ASSERTION failures, not timeouts — touch-steer
// measures steering ramps over TIME, so contention shows up as a wrong number
// rather than a slow one, and "it failed fast, so it is real" is exactly
// backwards for that kind of test.
//
//   node tools/ci/spec-staleness.mjs                 # last 30 days
//   node tools/ci/spec-staleness.mjs --days 60
//   node tools/ci/spec-staleness.mjs --json
//   node tools/ci/spec-staleness.mjs --top 20
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { select } from "./select-specs.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const DAYS = Math.max(1, parseInt(flag("--days", "30"), 10) || 30);
const TOP = Math.max(1, parseInt(flag("--top", "25"), 10) || 25);
const JSON_OUT = argv.includes("--json");

const git = (...a) => execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();

const allSpecs = fs.readdirSync(path.join(ROOT, "tests/specs"))
  .filter((f) => f.endsWith(".spec.js")).map((f) => `tests/specs/${f}`).sort();

// Newest first, so the first commit that runs a spec is its most recent run.
const log = git("log", `--since=${DAYS}.days.ago`, "--format=%H\t%cs\t%s", "--no-merges");
const commits = log ? log.split("\n").map((l) => {
  const [sha, date, ...rest] = l.split("\t");
  return { sha, date, subject: rest.join("\t") };
}) : [];

const lastRun = new Map();      // spec -> {date, sha, subject, how}
const everNamed = new Map();    // spec -> the bucket that most recently named it
let replayed = 0, failed = 0;

for (const c of commits) {
  let r;
  try { r = select(`${c.sha}~1..${c.sha}`, 15); } catch { failed++; continue; }
  replayed++;
  const ran = [...new Set([...(r.selected || []), ...((r.oversize || []).map((o) => o.file))])];
  for (const f of ran) if (!lastRun.has(f)) lastRun.set(f, { ...c, how: "run" });
  for (const bucket of ["skipped", "unreachable", "coveredByFixedGates", "coveredByVmTwin"]) {
    for (const e of r[bucket] || []) {
      const f = typeof e === "string" ? e : e.file;
      if (f && !everNamed.has(f)) everNamed.set(f, bucket);
    }
  }
}

const today = new Date();
const ageOf = (d) => Math.round((today - new Date(d + "T00:00:00Z")) / 86400000);
const rows = allSpecs.map((f) => {
  const hit = lastRun.get(f);
  return { spec: f, lastRun: hit ? hit.date : null, ageDays: hit ? ageOf(hit.date) : null,
           bucket: everNamed.get(f) || null, sha: hit ? hit.sha.slice(0, 9) : null };
});
// Never-run first (unbounded age), then oldest.
rows.sort((a, b) => (a.ageDays == null ? -1 : b.ageDays == null ? 1 : b.ageDays - a.ageDays));

if (JSON_OUT) {
  console.log(JSON.stringify({ days: DAYS, commits: commits.length, replayed, failed, rows }, null, 1));
} else {
  const never = rows.filter((r) => r.ageDays == null);
  console.log(`spec staleness — ${replayed} of ${commits.length} commits replayed over ${DAYS} days`
    + (failed ? ` (${failed} unreplayable)` : ""));
  console.log(`${allSpecs.length} specs · ${allSpecs.length - never.length} selected at least once · `
    + `${never.length} NEVER selected in the window\n`);
  console.log("age  last run    spec                                              why not, if named");
  for (const r of rows.slice(0, TOP)) {
    const age = r.ageDays == null ? "  —" : String(r.ageDays).padStart(3);
    const last = r.lastRun || "  never   ";
    console.log(`${age}  ${last}  ${r.spec.replace("tests/specs/", "").padEnd(46)}  ${r.bucket || ""}`);
  }
  if (rows.length > TOP) console.log(`\n… ${rows.length - TOP} more (--top N)`);
  console.log("\nAge is a RISK ranking, not a verdict. A spec nothing routes to may be stable");
  console.log("or may have been broken since the day it stopped being selected — this only");
  console.log("says which ones are worth the SwiftShader minutes to find out.");
}
