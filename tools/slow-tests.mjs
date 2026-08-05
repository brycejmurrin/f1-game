#!/usr/bin/env node
/* Apex 26 — find tests whose COST nobody costed.
 *
 * A timing-shaped failure ("Test timeout of 120000ms exceeded", a bare teardown
 * timeout) has two causes and they need opposite responses. Either the box was
 * oversubscribed — in which case the result is an artifact and re-running alone
 * fixes it — or that one test is structurally several times the work of its
 * siblings and is measured against the same shared budget, in which case it will
 * keep failing on every busy machine forever and wants test.slow().
 *
 * Telling those apart by hand meant reading a log and eyeballing durations. This
 * does it: parse the timestamped pass/fail lines tests/live-reporter.js writes
 * into artifacts/logs/*.log, group by spec FILE, and report every test whose
 * duration is an outlier against its own file's median. Same file = same setup
 * cost, same server, same circuit builds, so the median is a fair baseline in a
 * way a suite-wide average is not.
 *
 *   node tools/slow-tests.mjs                    # every log in artifacts/logs
 *   node tools/slow-tests.mjs behaviour physics  # named groups
 *   node tools/slow-tests.mjs --ratio 3          # only 3x or worse (default 2)
 *   node tools/slow-tests.mjs --budget 120       # timeout in s (default 120)
 *
 * Not part of the game, so it prints with console (see CLAUDE.md on Log).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const LOG_DIR = "artifacts/logs";
// live-reporter.js: "[12:07:02] + pass   14/77 tests/foo.spec.js › suite › name (30.5s)"
const LINE = /^\[[\d:]+\]\s+[+x]\s+(pass|FAIL)\s+\d+\/\d+\s+(\S+\.spec\.js)\s+›\s+(.*?)\s+\(([\d.]+)s\)\s*$/;

function parseArgs(argv) {
  const groups = [];
  let ratio = 2, budget = 120;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--ratio") ratio = Number(argv[++i]);
    else if (argv[i] === "--budget") budget = Number(argv[++i]);
    else groups.push(argv[i]);
  }
  return { groups, ratio, budget };
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const { groups, ratio, budget } = parseArgs(process.argv.slice(2));

let files;
try {
  files = (await readdir(LOG_DIR))
    .filter((f) => f.endsWith(".log"))
    .filter((f) => !groups.length || groups.includes(path.basename(f, ".log")));
} catch {
  console.error(`no ${LOG_DIR} — run a group first (node tools/test-bg.mjs <group>)`);
  process.exit(1);
}
if (!files.length) {
  console.error(groups.length ? `no logs for: ${groups.join(", ")}` : `no logs in ${LOG_DIR}`);
  process.exit(1);
}

// spec file -> [{name, secs, outcome, group}]
const bySpec = new Map();
for (const f of files) {
  const group = path.basename(f, ".log");
  for (const line of (await readFile(path.join(LOG_DIR, f), "utf8")).split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, outcome, spec, name, secs] = m;
    if (!bySpec.has(spec)) bySpec.set(spec, []);
    // A spec can appear in several logs (a re-run, or two groups sharing it);
    // keep every observation and let the median absorb the spread.
    bySpec.get(spec).push({ name, secs: Number(secs), outcome, group });
  }
}
if (!bySpec.size) {
  console.error("no test result lines found — is APEX_HEARTBEAT/live-reporter wired?");
  process.exit(1);
}

const findings = [];
for (const [spec, runs] of bySpec) {
  // One observation is no baseline: a file with a single test has no siblings to
  // be an outlier against, and reporting it would be noise.
  if (runs.length < 3) continue;
  const med = median(runs.map((r) => r.secs));
  if (med <= 0) continue;
  for (const r of runs) {
    const mult = r.secs / med;
    if (mult >= ratio) findings.push({ spec, med, mult, ...r });
  }
}
findings.sort((a, b) => b.mult - a.mult);

if (!findings.length) {
  console.log(`no test is ${ratio}x its file's median across ${bySpec.size} spec files. ` +
              `Timing failures here are contention, not cost.`);
  process.exit(0);
}

console.log(`Outliers at >=${ratio}x their own file's median (budget ${budget}s):\n`);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad("mult", 7) + pad("secs", 8) + pad("median", 8) + pad("hdrm", 7) + "test");
console.log("-".repeat(100));
for (const f of findings) {
  // Headroom: how much of the shared budget is left. Under ~1.5x, one busy
  // machine is the difference between green and a timeout that reads as a
  // regression — which is exactly the case test.slow() exists for.
  const head = budget / f.secs;
  const flag = head < 1.5 ? "  <-- test.slow()" : "";
  console.log(
    pad(f.mult.toFixed(1) + "x", 7) + pad(f.secs.toFixed(1), 8) +
    pad(f.med.toFixed(1), 8) + pad(head.toFixed(2) + "x", 7) +
    `${f.spec} › ${f.name}`.slice(0, 90) + flag
  );
}
console.log(`\n${findings.length} outlier(s) over ${bySpec.size} spec files.`);
console.log("A high multiple is not a bug — it is a test doing more work (extra page");
console.log("reloads, extra circuit builds). It becomes one when the headroom against");
console.log("the shared timeout drops below ~1.5x, because then any busy machine turns");
console.log("it red and it reads as a regression in the code under test.");
