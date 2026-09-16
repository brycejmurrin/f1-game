#!/usr/bin/env node
// spec-timings — the per-test duration HISTORY the budget model never had.
// @doc Merges junit/reporter durations into `tests/data/spec-timings.json` (bounded, per env); `--check` flags 2x growth.
// @section runner
//
// `select-budget.mjs` billed every test in the tree at ONE number — 79.7 s, a
// mean taken from CI run 31197770813 on 2026-08-07 — and its own header records
// that using a mean as a per-test TIMEOUT cost three deploys. The data to do
// better was produced and thrown away twice per run:
// `tests/helpers/live-reporter.js` computes every test's wall time and prints
// only the slowest ten, and `playwright.config.js`'s junit reporter writes
// `time` per `<testcase>` into `artifacts/test-results-*/junit.xml`.
//
// This folds either source into a BOUNDED rolling record, so an agent reads
// last week's cost instead of re-measuring it
// (docs/plans/research-2026-09-16/measurement.md item 2).
//
// THREE RULES THE SHAPE ENFORCES.
//
// 1. ENV BUCKETS ARE NEVER MIXED. A SwiftShader CI runner, an llvmpipe one and
//    this container are three different machines; averaging them is how a
//    renderer swap gets read as a regression. Every sample carries its bucket
//    and every comparison happens inside one.
// 2. MERGING IS IDEMPOTENT. A sample is keyed by (bucket, run-start second), so
//    re-merging the same junit — or a run's junit AND its live-reporter log,
//    which are one run seen twice — adds nothing. That is what makes this safe
//    to call from CI on every job with no dedupe step of its own.
// 3. OUTPUT IS DETERMINISTIC. Specs, titles and samples are all sorted, so a
//    committed file diffs as "one line added" rather than as a reshuffle.
//
//   node tools/ci/spec-timings.mjs                       # merge artifacts/**/junit.xml
//   node tools/ci/spec-timings.mjs a/junit.xml b.log     # merge named files
//   node tools/ci/spec-timings.mjs --dry-run --json      # what would change
//   node tools/ci/spec-timings.mjs --check               # growth flags, never fails
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const TIMINGS_FILE = "tests/data/spec-timings.json";

// Ten samples per key. Enough for a stable median and a "has it doubled?"
// question; small enough that the whole tree's history stays a file an agent
// can read, which is the only reason it is committed rather than an artifact.
export const KEEP = 10;

// The three machines this suite runs on. `local` is any developer or agent box
// — this container included — and is deliberately NOT usable as a CI estimate:
// see select-budget.mjs, which promotes a CI bucket only.
export const BUCKETS = ["swiftshader", "llvmpipe", "local"];

export const SCHEMA =
  "spec -> { s: [[ts, env, sec, tests]] whole-run wall, t: { title: [[ts, env, sec]] } }; " +
  "ts = run start at second precision; env = swiftshader|llvmpipe|local; newest last; " +
  "bounded to the last KEEP samples per key. Writer: tools/ci/spec-timings.mjs";


/** Which machine produced a run. CI says WHICH GPU stack through APEX_GL; off
 *  CI the answer is always `local`, because a box nobody characterised is not
 *  evidence about a runner. */
export function envBucket(env = process.env) {
  if (!env.CI) return "local";
  const gl = String(env.APEX_GL || "").toLowerCase();
  return gl.includes("llvmpipe") ? "llvmpipe" : "swiftshader";
}

/** Second-precision ISO — the time half of the dedupe key. */
export function isoSecond(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19) + "Z";
}

export function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const keyOf = (...parts) => JSON.stringify(parts);

const round = (n) => Math.round(n * 1000) / 1000;

/** `specs/<id>.spec.js` or `./tests/specs/<id>.spec.js` -> `tests/specs/<id>.spec.js`.
 *  Junit's classname drops the tests/ prefix, exactly as junit-failed.mjs
 *  records — without this every path fails an existsSync filter downstream. */
export function normaliseSpec(name) {
  let file = String(name || "").split(" ")[0].replace(/^\.\//, "");
  if (!file.startsWith("tests/")) file = "tests/" + file;
  return file;
}

const unescapeXml = (s) => String(s)
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, "&");

const attr = (attrs, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? unescapeXml(m[1]) : null;
};

/** Rows `{ts, spec, title, sec}` from one Playwright junit.xml.
 *
 *  RETRIES: Playwright emits one <testcase> per attempt under the same name, in
 *  order, so the LAST one for a (spec, title) is the final result — the rule
 *  live-reporter.js already applies before it records a duration. Billing both
 *  attempts would inflate every flaky test's history by construction. */
export function parseJunit(xml) {
  const rows = [];
  for (const suite of String(xml).matchAll(/<testsuite\b([^>]*)>([\s\S]*?)<\/testsuite>/g)) {
    const suiteAttrs = suite[1] || "", body = suite[2] || "";
    const ts = isoSecond(attr(suiteAttrs, "timestamp"));
    if (!ts) continue;
    const suiteName = attr(suiteAttrs, "name");
    const last = new Map();
    for (const tc of body.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
      const a = tc[1] || "", inner = tc[2] || "";
      if (/<skipped\b/.test(inner)) continue;
      const title = attr(a, "name");
      const sec = Number(attr(a, "time"));
      if (!title || !Number.isFinite(sec)) continue;
      const spec = normaliseSpec(attr(a, "classname") || suiteName);
      if (!/\.spec\.js$/.test(spec)) continue;
      last.set(keyOf(spec, title), { ts, spec, title, sec });
    }
    rows.push(...last.values());
  }
  return rows;
}

/** Rows from a live-reporter log (`artifacts/logs/*.log`).
 *
 *  The log carries clock TIMES with no date, so the caller supplies the day (the
 *  log's mtime). A run that started before midnight and ended after it rolls
 *  back a day rather than claiming to have started in the future. */
export function parseLiveLog(text, endISO) {
  const day = String(endISO || "").slice(0, 10);
  const endTime = String(endISO || "").slice(11, 19);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const lines = String(text).split("\n");
  const start = lines.map((l) => /^\[(\d{2}:\d{2}:\d{2})\] = run start:/.exec(l)).find(Boolean);
  if (!start) return [];
  let stamp = day;
  if (/^\d{2}:\d{2}:\d{2}$/.test(endTime) && endTime < start[1]) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    stamp = d.toISOString().slice(0, 10);
  }
  const ts = `${stamp}T${start[1]}Z`;
  // `+ pass` and `x FAIL` are FINAL results; `! retry` is not, and `~ skip`
  // measures nothing. That is the same set live-reporter.js records.
  const RE = /^\[\d{2}:\d{2}:\d{2}\]\s+([+x])\s+\S+\s+\d+\/\d+\s+(tests\/\S+\.spec\.js)\s+›\s+(.+?)\s+\((\d+(?:\.\d+)?)s\)\s*$/;
  const seen = new Map();
  for (const line of lines) {
    const m = RE.exec(line);
    if (!m) continue;
    seen.set(keyOf(m[2], m[3]), { ts, spec: m[2], title: m[3], sec: Number(m[4]) });
  }
  return [...seen.values()];
}

export function emptyDb() {
  return { "//": SCHEMA, keep: KEEP, specs: {} };
}

export function loadDb(file = path.join(ROOT, TIMINGS_FILE)) {
  try {
    const db = JSON.parse(fs.readFileSync(file, "utf8"));
    if (db && typeof db === "object" && db.specs) return db;
  } catch { /* absent or unreadable is an empty history, never a hard failure */ }
  return emptyDb();
}

/** Newest last, ties broken by bucket so the order is total and stable. */
const bySample = (a, b) =>
  a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;

function push(list, sample, keep) {
  // (bucket, run-start second) IS the identity of a sample. The same run merged
  // twice — or merged from its junit AND its log — must not double-count.
  if (list.some((s) => s[0] === sample[0] && s[1] === sample[1])) return false;
  list.push(sample);
  list.sort(bySample);
  if (list.length > keep) list.splice(0, list.length - keep);
  return true;
}

/** Fold `rows` into `db` under `env`. Returns the db and what actually landed. */
export function mergeRows(db, rows, { env = "local", keep = KEEP } = {}) {
  if (!BUCKETS.includes(env)) throw new Error(`unknown env bucket: ${env} (${BUCKETS.join("|")})`);
  db.specs = db.specs || {};
  db.keep = keep;
  db["//"] = SCHEMA;
  let added = 0, duplicates = 0;
  // ONE RUN, ONE SAMPLE PER TEST — collapse before anything is counted.
  // A batch routinely carries the same run twice (its junit AND its
  // live-reporter log), and the per-test push would dedupe those while the
  // per-SPEC total below silently added them together: smoke.spec.js came out
  // as "20 tests, 950 s" for a run of 10 tests in 475 s. Collapsing at the row
  // level fixes both halves with one rule.
  const unique = new Map();
  for (const r of rows) {
    if (!r || !r.spec || !r.title || !r.ts || !Number.isFinite(r.sec)) continue;
    // FIRST wins, and the default source list is junit only: junit carries
    // millisecond `time`, the live log rounds to one decimal, so a batch given
    // both keeps the more precise reading rather than whichever was passed last.
    const k = keyOf(r.spec, r.ts, r.title);
    if (!unique.has(k)) unique.set(k, r);
  }
  const collapsed = rows.length - unique.size;
  // Per (spec, run) totals, so the spec-level series says what a whole file cost
  // in that run and how many tests bought it — the per-test figure select-budget
  // needs, undistorted by a spec that grew a test.
  const runs = new Map();
  for (const r of unique.values()) {
    const entry = (db.specs[r.spec] ||= { s: [], t: {} });
    entry.t ||= {};
    entry.s ||= [];
    if (push((entry.t[r.title] ||= []), [r.ts, env, round(r.sec)], keep)) added++;
    else duplicates++;
    const key = keyOf(r.spec, r.ts);
    const agg = runs.get(key) || { spec: r.spec, ts: r.ts, sec: 0, tests: 0 };
    agg.sec += r.sec;
    agg.tests++;
    runs.set(key, agg);
  }
  for (const agg of runs.values())
    push(db.specs[agg.spec].s, [agg.ts, env, round(agg.sec), agg.tests], keep);
  return { db, added, duplicates, collapsed, specs: new Set([...runs.values()].map((a) => a.spec)).size };
}

/** Deterministic serialisation: sorted specs, sorted titles, sorted samples,
 *  ONE LINE PER SERIES. Plain JSON.stringify(…, 1) exploded every three-element
 *  sample across five lines and put 200 bytes on disk per 40 bytes of data —
 *  for a tree of 119 specs that is the difference between a file an agent reads
 *  and a file it greps. The layout is hand-rolled; the content is still JSON. */
export function serialise(db) {
  const line = (xs) => "[" + [...xs].sort(bySample).map((x) => JSON.stringify(x)).join(", ") + "]";
  const out = [`{`, ` "//": ${JSON.stringify(db["//"] || SCHEMA)},`, ` "keep": ${db.keep || KEEP},`, ` "specs": {`];
  const specs = Object.keys(db.specs || {}).sort();
  specs.forEach((spec, i) => {
    const src = db.specs[spec];
    out.push(`  ${JSON.stringify(spec)}: {`, `   "s": ${line(src.s || [])},`, `   "t": {`);
    const titles = Object.keys(src.t || {}).sort();
    titles.forEach((t, j) =>
      out.push(`    ${JSON.stringify(t)}: ${line(src.t[t])}${j === titles.length - 1 ? "" : ","}`));
    out.push(`   }`, `  }${i === specs.length - 1 ? "" : ","}`);
  });
  out.push(` }`, `}`);
  return out.join("\n") + "\n";
}

export function saveDb(db, file = path.join(ROOT, TIMINGS_FILE)) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, serialise(db));
}

/** Samples for one key, restricted to the given buckets. */
export const inBuckets = (samples, buckets) => (samples || []).filter((s) => buckets.includes(s[1]));

/** GROWTH FLAG, advisory only.
 *
 *  A key whose LATEST sample is `factor`x its own median has either got slower
 *  or met a busy box, and this file cannot tell which — which is exactly why it
 *  prints and never fails. The plan gives it four weeks of advisory life before
 *  anyone may gate on it. The comparison stays inside ONE bucket, the latest
 *  sample's own, so a run on a different renderer is never the "regression". */
export function growth(db, { factor = 2, minSamples = 3 } = {}) {
  const out = [];
  const check = (level, spec, title, samples, value) => {
    if (!samples.length) return;
    const bucket = samples[samples.length - 1][1];
    const peers = samples.filter((s) => s[1] === bucket);
    if (peers.length < minSamples) return;
    const med = median(peers.slice(0, -1).map(value));
    const now = value(peers[peers.length - 1]);
    if (!med || now <= med * factor) return;
    out.push({ level, spec, title, bucket, latest: round(now), median: round(med),
      ratio: round(now / med), samples: peers.length });
  };
  for (const spec of Object.keys(db.specs || {}).sort()) {
    const s = db.specs[spec];
    // Spec level is billed PER TEST, so adding a test to a file is not growth.
    check("spec", spec, null, s.s || [], (x) => (x[3] ? x[2] / x[3] : x[2]));
    for (const title of Object.keys(s.t || {}).sort())
      check("test", spec, title, s.t[title], (x) => x[2]);
  }
  return out.sort((a, b) => b.ratio - a.ratio);
}

/** The junit files a run leaves behind, in both layouts: playwright.config.js
 *  writes `artifacts/test-results-<port>/junit.xml`, and CI's uploaded bundles
 *  land under `artifacts/report-<name>/`. */
export function defaultSources(root = ROOT) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync(path.join(root, "artifacts")); } catch { return out; }
  for (const e of entries.sort()) {
    if (!/^(test-results|report)/.test(e)) continue;
    const f = path.join(root, "artifacts", e, "junit.xml");
    if (fs.existsSync(f)) out.push(f);
  }
  return out;
}

/** Rows from one file, by shape. An unparseable file yields nothing. */
export function rowsFromFile(file) {
  const text = fs.readFileSync(file, "utf8");
  if (/\.xml$/i.test(file) || /<testsuite/.test(text.slice(0, 400))) return parseJunit(text);
  let end = null;
  try { end = fs.statSync(file).mtime.toISOString(); } catch { /* keep null */ }
  return parseLiveLog(text, end);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const VALUED = new Set(["--into", "--env", "--keep", "--factor"]);
  const flag = (name, fallback = null) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
  };
  const into = path.resolve(ROOT, flag("--into", TIMINGS_FILE));
  const json = argv.includes("--json");

  if (argv.includes("--check")) {
    const factor = Number(flag("--factor", "2"));
    const rows = growth(loadDb(into), { factor });
    if (json) {
      console.log(JSON.stringify({ file: path.relative(ROOT, into), factor, rows }, null, 2));
    } else if (!rows.length) {
      console.log(`OK: nothing in ${path.relative(ROOT, into)} is above ${factor}x its own median`);
    } else {
      console.log("GROWTH FLAGS (advisory — a busy box looks exactly like a slow test):");
      for (const r of rows)
        console.log(`  ${r.ratio}x  ${r.latest}s vs median ${r.median}s  [${r.bucket}, n=${r.samples}]  ` +
          `${r.spec}${r.title ? ` › ${r.title}` : " (per test)"}`);
    }
    process.exit(0);
  }

  const env = flag("--env", envBucket());
  const keep = Number(flag("--keep", String(KEEP)));
  const named = argv.filter((a, i) => !a.startsWith("--") && !VALUED.has(argv[i - 1]));
  const sources = named.length ? named.map((f) => path.resolve(f)) : defaultSources();
  const rows = [], read = [];
  for (const f of sources) {
    let got = [];
    try { got = rowsFromFile(f); }
    catch (e) { console.error(`skipped ${f}: ${e.message}`); continue; }
    read.push({ file: path.relative(ROOT, f), rows: got.length });
    rows.push(...got);
  }
  const db = loadDb(into);
  const r = mergeRows(db, rows, { env, keep });
  const dry = argv.includes("--dry-run");
  if (!dry) saveDb(db, into);
  if (json) {
    console.log(JSON.stringify({ env, keep, dryRun: dry, sources: read,
      added: r.added, duplicates: r.duplicates, collapsed: r.collapsed, specs: r.specs }, null, 2));
  } else {
    for (const s of read) console.error(`read ${s.rows} test row(s) from ${s.file}`);
    if (!sources.length) console.error("no junit.xml under artifacts/ — pass paths explicitly");
    console.log(`${dry ? "would merge" : "merged"} ${r.added} new sample(s) across ${r.specs} ` +
      `spec(s) into ${path.relative(ROOT, into)} [${env}]` +
      (r.duplicates ? `; ${r.duplicates} already recorded` : "") +
      (r.collapsed ? `; ${r.collapsed} row(s) were one run seen twice` : ""));
  }
}
