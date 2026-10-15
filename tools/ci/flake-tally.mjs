#!/usr/bin/env node
/**
 * @doc Nightly flake tally — first-try fails and pass-on-retry by spec+title across recent scheduled CI runs.
 * @section runner
 * @skill check-changes
 *
 * Read-only. Pulls the last N scheduled `ci.yml` runs on the deploy branch,
 * prefers Playwright HTML-report JSON (embedded `report.json`) from
 * `playwright-artifacts-*`, else parses job logs for live-reporter `= FLAKY` /
 * `x FAIL` lines. Tallies fails vs flaky-passes for deflake / quarantine targets.
 *
 * API: per-run artifact lists, or exact `?name=` lookups — never a repo-wide
 * artifact page scan (those 500 here). Auth: `GITHUB_TOKEN` / `GH_TOKEN` /
 * `gh auth token` via github-token.mjs.
 *
 *   node tools/ci/flake-tally.mjs              # last 14 scheduled runs
 *   node tools/ci/flake-tally.mjs --runs 7
 *   node tools/ci/flake-tally.mjs --runs 3 --json
 *   node tools/ci/flake-tally.mjs --help
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";
import { githubToken, NO_TOKEN_HINT } from "./github-token.mjs";
import { proxyFetch } from "../lib/proxy-fetch.mjs";   // #2188: Node fetch ignores HTTPS_PROXY

export const REPO = "brycejmurrin/f1-game";
export const DEPLOY_BRANCH = "claude/f1-game-project-26h3ng";
export const WORKFLOW_FILE = "ci.yml";
export const DEFAULT_RUNS = 14;
export const ARTIFACT_PREFIX = "playwright-artifacts-";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const API = `https://api.github.com/repos/${REPO}`;

/** @typedef {{ spec: string, title: string, kind: "fail"|"flaky", runId: number|string }} FlakeEvent */
/** @typedef {{ test: string, spec: string, fails: number, flakyPasses: number, runsSeen: number, lastSeenRunId: number|string }} TallyRow */

// ── pure parsers (unit-tested) ─────────────────────────────────────────────

/** `specs/smoke.spec.js` → `tests/specs/smoke.spec.js`. */
export function normaliseSpec(name) {
  let file = String(name || "").replace(/^\.\//, "").split(" ")[0];
  if (!file) return "";
  if (!file.startsWith("tests/")) file = "tests/" + file;
  return file;
}

/** Join Playwright report path + title the way live-reporter's key() does. */
export function reportTitle(pathParts, title) {
  const parts = [...(pathParts || []), title].filter(Boolean).map(String);
  return parts.join(" › ");
}

/**
 * Events from a Playwright HTML `report.json` (files[].tests[].outcome).
 * `flaky` → pass-on-retry; `unexpected` → first-try failure that stayed red.
 */
export function parseReportJson(report, runId) {
  /** @type {FlakeEvent[]} */
  const out = [];
  if (!report || typeof report !== "object") return out;
  const files = report.files || [];
  for (const file of files) {
    const spec = normaliseSpec(file.fileName || file.file || "");
    if (!/\.spec\.js$/.test(spec)) continue;
    for (const t of file.tests || []) {
      const title = reportTitle(t.path, t.title);
      if (!title) continue;
      const outcome = t.outcome || t.status;
      if (outcome === "flaky") out.push({ spec, title, kind: "flaky", runId });
      else if (outcome === "unexpected") out.push({ spec, title, kind: "fail", runId });
    }
  }
  return out;
}

/**
 * Pull the embedded zip (`data:application/zip;base64,…`) out of an HTML
 * report's index.html and return parsed `report.json`, or null.
 */
export function extractReportJsonFromHtml(html) {
  const m = /data:application\/zip;base64,([A-Za-z0-9+/=]+)/.exec(String(html || ""));
  if (!m) return null;
  try {
    const buf = Buffer.from(m[1], "base64");
    // Prefer Node's zlib only for gzip; the payload is a zip. Use `unzip -p`
    // via a temp file when available — callers in tests pass report.json
    // directly. Here we decode with a minimal zip central-directory walk so
    // unit tests need no unzip binary for the HTML path.
    const json = readZipEntry(buf, "report.json");
    if (!json) return null;
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/** Minimal zip reader for a single stored/deflated entry (no external unzip). */
export function readZipEntry(buf, entryName) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  // End of central directory
  let eocd = -1;
  for (let i = b.length - 22; i >= 0; i--) {
    if (b[i] === 0x50 && b[i + 1] === 0x4b && b[i + 2] === 0x05 && b[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const entries = b.readUInt16LE(eocd + 10);
  let cd = b.readUInt32LE(eocd + 16);
  for (let n = 0; n < entries; n++) {
    if (b[cd] !== 0x50 || b[cd + 1] !== 0x4b || b[cd + 2] !== 0x01 || b[cd + 3] !== 0x02) return null;
    const method = b.readUInt16LE(cd + 10);
    const comp = b.readUInt32LE(cd + 20);
    const nameLen = b.readUInt16LE(cd + 28);
    const extraLen = b.readUInt16LE(cd + 30);
    const commentLen = b.readUInt16LE(cd + 32);
    const localOff = b.readUInt32LE(cd + 42);
    const name = b.slice(cd + 46, cd + 46 + nameLen).toString("utf8");
    cd += 46 + nameLen + extraLen + commentLen;
    if (name !== entryName) continue;
    const locNameLen = b.readUInt16LE(localOff + 26);
    const locExtra = b.readUInt16LE(localOff + 28);
    const dataStart = localOff + 30 + locNameLen + locExtra;
    const data = b.slice(dataStart, dataStart + comp);
    if (method === 0) return data.toString("utf8");
    if (method === 8) return inflateRawSync(data).toString("utf8");
    return null;
  }
  return null;
}

/**
 * live-reporter log lines → events.
 *   = FLAKY: … then "BLOCKING|quarantined|unlisted  spec › title"
 *   x FAIL   N/M spec › title (…s)
 */
export function parseLiveLogFlakes(text, runId) {
  /** @type {FlakeEvent[]} */
  const out = [];
  const lines = String(text || "").split("\n");
  let inFlaky = false;
  for (const raw of lines) {
    const line = raw.replace(/^\S+Z\s/, ""); // Actions timestamp prefix
    if (/=\s*FLAKY:/i.test(line)) {
      inFlaky = true;
      continue;
    }
    if (inFlaky) {
      const m = /^\s*(?:BLOCKING|quarantined|unlisted)\s+(\S.*?)\s+›\s+(.+?)\s*$/i.exec(line);
      if (m) {
        out.push({ spec: normaliseSpec(m[1]), title: m[2].trim(), kind: "flaky", runId });
        continue;
      }
      // Leave the block on the next = summary / run line.
      if (/^\s*\[?\d|^\[?\d{2}:|=\s*\w/.test(line) && !/^\s*(?:BLOCKING|quarantined|unlisted)/i.test(line)) {
        inFlaky = false;
      }
    }
    const fail = /x\s+FAIL\s+\d+\/\d+\s+(\S.*?)\s+›\s+(.+?)\s+\(/.exec(line);
    if (fail) {
      out.push({ spec: normaliseSpec(fail[1]), title: fail[2].trim(), kind: "fail", runId });
    }
  }
  return out;
}

/**
 * Junit with one <testcase> per attempt: first failed + last passed → flaky;
 * last still failed → fail. (Playwright often omits attempts; report/log preferred.)
 */
export function parseJunitAttempts(xml, runId) {
  /** @type {FlakeEvent[]} */
  const out = [];
  /** @type {Map<string, boolean[]>} */
  const by = new Map();
  for (const m of String(xml || "").matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const attrs = m[1] || "";
    const body = m[2] || "";
    if (/<skipped\b/.test(body)) continue;
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1];
    const cn = /\bclassname="([^"]*)"/.exec(attrs)?.[1];
    if (!name || !cn) continue;
    const spec = normaliseSpec(cn);
    if (!/\.spec\.js$/.test(spec)) continue;
    const key = JSON.stringify([spec, name]);
    const failed = /<(?:failure|error)\b/.test(body);
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(failed);
  }
  for (const [key, attempts] of by) {
    if (attempts.length < 2) {
      if (attempts.length === 1 && attempts[0]) {
        const [spec, title] = JSON.parse(key);
        out.push({ spec, title, kind: "fail", runId });
      }
      continue;
    }
    const [spec, title] = JSON.parse(key);
    const firstFailed = attempts[0];
    const lastFailed = attempts[attempts.length - 1];
    if (firstFailed && !lastFailed) out.push({ spec, title, kind: "flaky", runId });
    else if (lastFailed) out.push({ spec, title, kind: "fail", runId });
  }
  return out;
}

/** Aggregate events → sorted tally rows. */
export function tallyEvents(events) {
  /** @type {Map<string, { spec: string, title: string, fails: number, flakyPasses: number, runs: Set<string>, last: number|string }>} */
  const map = new Map();
  for (const e of events || []) {
    if (!e?.spec || !e?.title) continue;
    const key = JSON.stringify([e.spec, e.title]);
    let row = map.get(key);
    if (!row) {
      row = { spec: e.spec, title: e.title, fails: 0, flakyPasses: 0, runs: new Set(), last: e.runId };
      map.set(key, row);
    }
    if (e.kind === "flaky") row.flakyPasses++;
    else if (e.kind === "fail") row.fails++;
    else continue;
    row.runs.add(String(e.runId));
    // Prefer the numerically newer run id when both are numbers.
    const a = Number(row.last);
    const b = Number(e.runId);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (b >= a) row.last = e.runId;
    } else {
      row.last = e.runId;
    }
  }
  /** @type {TallyRow[]} */
  const rows = [...map.values()].map((r) => ({
    test: r.title,
    spec: r.spec,
    fails: r.fails,
    flakyPasses: r.flakyPasses,
    runsSeen: r.runs.size,
    lastSeenRunId: r.last,
  }));
  rows.sort((a, b) =>
    (b.fails + b.flakyPasses) - (a.fails + a.flakyPasses)
    || b.flakyPasses - a.flakyPasses
    || b.fails - a.fails
    || a.spec.localeCompare(b.spec)
    || a.test.localeCompare(b.test));
  return rows;
}

export function formatMarkdownTable(rows, { runsExamined = 0 } = {}) {
  const lines = [];
  lines.push(`# Nightly flake tally`);
  lines.push("");
  lines.push(`Scheduled CI runs examined: **${runsExamined}** (branch \`${DEPLOY_BRANCH}\`).`);
  lines.push("");
  lines.push("| test | spec | fails | flaky-passes | runs seen | last seen run id |");
  lines.push("| --- | --- | ---: | ---: | ---: | ---: |");
  if (!rows.length) {
    lines.push("| _(none)_ | — | 0 | 0 | 0 | — |");
  } else {
    for (const r of rows) {
      const test = String(r.test).replace(/\|/g, "\\|");
      const spec = String(r.spec).replace(/\|/g, "\\|");
      lines.push(`| ${test} | ${spec} | ${r.fails} | ${r.flakyPasses} | ${r.runsSeen} | ${r.lastSeenRunId} |`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

export function isPlaywrightArtifactName(name) {
  return String(name || "").startsWith(ARTIFACT_PREFIX);
}

/** Exact-name URL path (never a bare repo-wide page scan). */
export function artifactNamePath(name) {
  return `actions/artifacts?per_page=100&name=${encodeURIComponent(name)}`;
}

/** Pick the artifact whose workflow_run.id matches `runId` from a name= list. */
export function pickArtifactForRun(artifacts, runId) {
  const want = String(runId);
  return (artifacts || []).find((a) => !a.expired && String(a.workflow_run?.id ?? a.workflow_run_id ?? "") === want)
    || null;
}

// ── GitHub API (injectable) ────────────────────────────────────────────────

let _fetch = proxyFetch;
let _delay = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

/** @param {{ fetch?: typeof fetch, delay?: (ms: number) => Promise<void> }} [hooks] */
export function setFlakeTallyTestHooks(hooks = {}) {
  _fetch = hooks.fetch || proxyFetch;
  _delay = hooks.delay || ((ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve()));
}

export async function githubApi(method, pathQs, { token, raw = false, absUrl = null } = {}) {
  const auth = token || githubToken();
  if (!auth) return { error: NO_TOKEN_HINT };
  const url = absUrl || `${API}/${pathQs}`;
  const headers = {
    Accept: raw ? "application/vnd.github+json" : "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${auth}`,
  };
  if (raw && /\/logs$/.test(url)) headers.Accept = "application/vnd.github+json";
  let last = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await _fetch(url, { method, headers, signal: AbortSignal.timeout(90_000) });
    } catch (err) {
      last = err;
      if (attempt === 4) return { error: String(err.message || err) };
      await _delay(Math.min(1000 * (2 ** (attempt - 1)), 8000));
      continue;
    }
    const code = res.status;
    if (code === 204) return { code, text: "" };
    const buf = Buffer.from(await res.arrayBuffer());
    if (code >= 200 && code <= 299) {
      if (raw) return { code, buffer: buf, text: buf.toString("utf8") };
      const text = buf.toString("utf8");
      if (!text.trim()) return { code, text };
      try { return { code, json: JSON.parse(text) }; } catch { return { code, text }; }
    }
    if ((code === 429 || code >= 500) && attempt < 4) {
      await _delay(Math.min(1000 * (2 ** (attempt - 1)), 8000));
      last = { code, text: buf.toString("utf8").slice(0, 200) };
      continue;
    }
    return { error: `HTTP ${code} ${buf.toString("utf8").slice(0, 240)}`, code };
  }
  return { error: String(last?.message || last || "githubApi failed") };
}

/** Last N completed scheduled workflow runs on the deploy branch. */
export async function listScheduledRuns({ n = DEFAULT_RUNS, branch = DEPLOY_BRANCH, token } = {}) {
  const qs = `actions/workflows/${WORKFLOW_FILE}/runs?branch=${encodeURIComponent(branch)}&event=schedule&per_page=${Math.min(100, Math.max(1, n))}`;
  const r = await githubApi("GET", qs, { token });
  if (r.error) return { error: r.error, code: r.code };
  const runs = (r.json?.workflow_runs || []).slice(0, n);
  return { runs };
}

/**
 * Playwright artifact names for one run — per-run list (not repo-wide),
 * filtered to `playwright-artifacts-*`.
 */
export async function listRunPlaywrightArtifacts(runId, { token } = {}) {
  const r = await githubApi("GET", `actions/runs/${runId}/artifacts?per_page=100`, { token });
  if (r.error) return { error: r.error, code: r.code };
  const arts = (r.json?.artifacts || [])
    .filter((a) => !a.expired && isPlaywrightArtifactName(a.name));
  return { artifacts: arts };
}

/** Exact-name lookup, then keep only the artifact for this run id. */
export async function lookupArtifactExactName(name, runId, { token } = {}) {
  const r = await githubApi("GET", artifactNamePath(name), { token });
  if (r.error) return { error: r.error, code: r.code };
  const hit = pickArtifactForRun(r.json?.artifacts || [], runId);
  return hit ? { artifact: hit } : { artifact: null };
}

export async function downloadArtifactZip(artifactId, destZip, { token } = {}) {
  const auth = token || githubToken();
  if (!auth) return { error: NO_TOKEN_HINT };
  const url = `${API}/actions/artifacts/${artifactId}/zip`;
  const r = await githubApi("GET", "", { token: auth, raw: true, absUrl: url });
  if (r.error) return r;
  fs.mkdirSync(path.dirname(destZip), { recursive: true });
  fs.writeFileSync(destZip, r.buffer);
  return { ok: true, bytes: r.buffer.length };
}

export async function fetchJobLogText(jobId, { token } = {}) {
  const r = await githubApi("GET", `actions/jobs/${jobId}/logs`, { token, raw: true });
  if (r.error) return r;
  return { text: r.text || "" };
}

/** Extract report HTML + junit XML paths from an unzipped artifact dir. */
export function collectArtifactSources(dir) {
  const htmls = [];
  const junits = [];
  const walk = (d) => {
    let ents;
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name === "index.html" && /report-/i.test(p)) htmls.push(p);
      else if (e.name === "junit.xml") junits.push(p);
    }
  };
  walk(dir);
  return { htmls, junits };
}

function unzipSelect(zipPath, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  // Prefer selective extract of report HTML + junit (keeps traces on disk out).
  const r = spawnSync("unzip", ["-o", "-q", zipPath, "*/index.html", "*/junit.xml", "-d", outDir], {
    encoding: "utf8",
  });
  // unzip returns 11 when some patterns miss; still OK if anything landed.
  if (r.status !== 0 && r.status !== 11) {
    const r2 = spawnSync("unzip", ["-o", "-q", zipPath, "-d", outDir], { encoding: "utf8" });
    if (r2.status !== 0) return { error: (r2.stderr || r.stderr || "unzip failed").trim() };
  }
  return { ok: true };
}

/**
 * Collect flake/fail events for one run. Prefers report.json from artifacts;
 * falls back to job logs when no report yields events.
 */
export async function collectRunEvents(run, {
  token,
  workDir,
  maxArtifactBytes = 80 * 1024 * 1024,
  preferLogs = false,
} = {}) {
  const runId = run.id;
  /** @type {FlakeEvent[]} */
  let events = [];
  const notes = [];

  if (!preferLogs) {
    const listed = await listRunPlaywrightArtifacts(runId, { token });
    if (listed.error) {
      notes.push(`artifacts: ${listed.error}`);
    } else {
      for (const art of listed.artifacts || []) {
        if (art.size_in_bytes > maxArtifactBytes) {
          notes.push(`skip ${art.name} (${art.size_in_bytes} B > cap)`);
          continue;
        }
        const dir = path.join(workDir, `run-${runId}`, art.name);
        const zip = path.join(dir, "a.zip");
        const dl = await downloadArtifactZip(art.id, zip, { token });
        if (dl.error) {
          notes.push(`download ${art.name}: ${dl.error}`);
          continue;
        }
        const uz = unzipSelect(zip, dir);
        if (uz.error) {
          notes.push(`unzip ${art.name}: ${uz.error}`);
          continue;
        }
        const { htmls, junits } = collectArtifactSources(dir);
        for (const h of htmls) {
          const report = extractReportJsonFromHtml(fs.readFileSync(h, "utf8"));
          if (report) events.push(...parseReportJson(report, runId));
        }
        // Junit only if the HTML report gave nothing for this artifact.
        if (!htmls.length) {
          for (const j of junits) {
            events.push(...parseJunitAttempts(fs.readFileSync(j, "utf8"), runId));
          }
        }
      }
    }
  }

  if (!events.length) {
    const jobs = await githubApi("GET", `actions/runs/${runId}/jobs?per_page=100`, { token });
    if (jobs.error) {
      notes.push(`jobs: ${jobs.error}`);
    } else {
      for (const job of jobs.json?.jobs || []) {
        // Browser jobs upload playwright artifacts or run npm test / playwright.
        const name = String(job.name || "");
        if (!/smoke|selected|driving|renderer|playwright|browser|gfx|xr/i.test(name)) continue;
        if (job.conclusion === "skipped" || job.conclusion === "cancelled") continue;
        const log = await fetchJobLogText(job.id, { token });
        if (log.error) {
          notes.push(`log ${job.id}: ${log.error}`);
          continue;
        }
        events.push(...parseLiveLogFlakes(log.text, runId));
      }
    }
  }

  // Deduplicate identical events from multiple shards naming the same flake.
  const seen = new Set();
  events = events.filter((e) => {
    const k = JSON.stringify([e.spec, e.title, e.kind, e.runId]);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return { events, notes };
}

export const USAGE = `usage: node tools/ci/flake-tally.mjs [--runs N] [--branch <ref>] [--json] [--work-dir <dir>]
       node tools/ci/flake-tally.mjs --help

Tally first-try failures and pass-on-retry flakes across the last N scheduled
CI runs on ${DEPLOY_BRANCH} (default N=${DEFAULT_RUNS}). Writes a markdown table
to stdout and appends it to $GITHUB_STEP_SUMMARY when set.`;

function parseArgs(argv) {
  const opt = (k, d) => {
    const eq = argv.find((a) => a.startsWith(k + "="));
    if (eq) return eq.slice(k.length + 1);
    const i = argv.indexOf(k);
    if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
    return d;
  };
  return {
    runs: Math.max(1, Number(opt("--runs", DEFAULT_RUNS)) || DEFAULT_RUNS),
    branch: opt("--branch", DEPLOY_BRANCH),
    json: argv.includes("--json"),
    workDir: opt("--work-dir", path.join(ROOT, "artifacts", "flake-tally")),
    help: argv.includes("--help") || argv.includes("-h"),
  };
}

export async function runFlakeTally(argv = process.argv.slice(2), { token } = {}) {
  const args = parseArgs(argv);
  if (args.help) return { code: 0, text: USAGE };
  const auth = token !== undefined ? token : githubToken();
  if (!auth) return { code: 3, text: NO_TOKEN_HINT };

  const listed = await listScheduledRuns({ n: args.runs, branch: args.branch, token: auth });
  if (listed.error) return { code: 3, text: listed.error };
  const runs = listed.runs || [];
  /** @type {FlakeEvent[]} */
  const all = [];
  const runNotes = [];
  fs.mkdirSync(args.workDir, { recursive: true });

  for (const run of runs) {
    process.stderr.write(`[flake-tally] run ${run.id} ${run.created_at} ${run.conclusion}\n`);
    const { events, notes } = await collectRunEvents(run, { token: auth, workDir: args.workDir });
    all.push(...events);
    if (notes.length) runNotes.push(`${run.id}: ${notes.join("; ")}`);
  }

  const rows = tallyEvents(all);
  const md = formatMarkdownTable(rows, { runsExamined: runs.length });
  if (process.env.GITHUB_STEP_SUMMARY) {
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + "\n"); } catch (e) {
      process.stderr.write(`[flake-tally] GITHUB_STEP_SUMMARY write failed: ${e.message}\n`);
    }
  }
  if (args.json) {
    return {
      code: 0,
      text: JSON.stringify({ runsExamined: runs.length, runs: runs.map((r) => r.id), rows, notes: runNotes }, null, 2) + "\n",
      rows,
      runsExamined: runs.length,
    };
  }
  return { code: 0, text: md, rows, runsExamined: runs.length, notes: runNotes };
}

async function main() {
  const r = await runFlakeTally();
  process.stdout.write(r.text.endsWith("\n") ? r.text : r.text + "\n");
  process.exit(r.code);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error("[flake-tally]", e);
    process.exit(3);
  });
}
