#!/usr/bin/env node
/**
 * @doc Ready verdict: a dropped spec counts only when a same-head, same-base browser-group run ran it green on attempt 1.
 * @section runner
 * @skill steward
 *
 *   dropped-group-runs.mjs --sel sel.json --names       # select job: the dropped spec files, space-separated (GITHUB_OUTPUT line)
 *   dropped-group-runs.mjs                              # selected-verdict job: the question (stdout: GITHUB_OUTPUT lines)
 *     env DROPPED_SPECS, PR_HEAD_SHA, PR_BASE_REF, GH_TOKEN, GITHUB_REPOSITORY (CURRENT_BASE overrides the merge parent)
 *
 * WHY (#5480; Bryce 2026-11-11 ~09:25 UTC: "Count the separate run (Recommended)"). A wide change (a test helper
 * routed to most specs) overfills the declared-slow pool and the ready plan drops a routed spec. The verdict told the
 * author to run its group with tools/ci/remote-group.mjs, but nothing read that run, so the red could not be cured
 * without splitting the change. This reads it, and accepts it ONLY when every one of these holds (decide() below;
 * each refusal has a unit test in tests/unit/dropped-group-runs.test.mjs):
 *   1. Every dropped spec file is named, and the names agree with the plan's dropped count.
 *   2. Some browser-group.yml run on the SAME head sha ran it: completed, success, attempt 1, and every job of that
 *      run passed and left exactly one readable `apex-group-plan` record (its own step, written BEFORE any spec or
 *      helper runs: what the shard will run) and exactly one `apex-group` end record (remote-group.mjs --run-shard:
 *      the units whose junit shows a pass). The end record may claim only units in the plan, the plan only specs of
 *      the dispatched group; a second record of either kind (something a test printed) refuses the run.
 *   3. That record tested the PR's MERGE ref (remote-group passes `pr`; the shard reads the merge commit's parents):
 *      record head == this PR head, record base == the base THIS run's merge commit sits on (the same commit pair,
 *      so the group run proves what this run's own legs would have; #5407). A branch-head run (base=none) never counts.
 *      The live deploy tip is NOT compared (orchestrator A, 2026-11-11 10:15 UTC, option 2): same head + same base
 *      proves for the dropped specs exactly what this run's own legs prove for the rest; a tip that moves after CI
 *      is the gate's `retest` row (PR #5485), not this file's.
 *   4. Default GL (llvmpipe) and APEX_FAIL_ON_FLAKY on (a retried pass fails the shard; AGENTS.md rule 9).
 *   5. The spec is covered whole: the file as one unit, or every piece j/k of one k.
 *   6. NO run on this head whose group contains the spec is anything but that: a failed, cancelled, still-running
 *      or re-run (attempt > 1) group run of it refuses it, even beside a green one (a pass after a red is a retry).
 * Anything else, including every lookup failure, is accept=false: the verdict stays the red it was.
 *
 * Who writes, who reads, what a liar would forge: the record is a check-run annotation the GitHub Actions app writes
 * from the shard step's own output (written from the commits it checked out, never from dispatch inputs); this file
 * reads it with the job's GITHUB_TOKEN. Forging it means changing remote-group.mjs or browser-group.yml, both config
 * paths (merge-gate's config row: Bryce's own config-ok).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const GROUP_RECORD_TITLE = "apex-group";
export const GROUP_PLAN_TITLE = "apex-group-plan";
export const GROUP_WORKFLOW_PATH = ".github/workflows/browser-group.yml";
const SHA = /^[0-9a-f]{40}$/;
const UNIT_RE = /^(tests\/[A-Za-z0-9_./-]+\.spec\.(?:js|mjs|ts))(?:#([1-9]\d?)\/([1-9]\d?))?$/;

/** The routed spec files a plan cannot run (select-specs' four drop lists), sorted, unique. */
export function droppedSpecs(sel) {
  const out = new Set();
  for (const k of ["overBudgetSpecs", "unreachable", "skipped", "unreadable"]) {
    for (const s of (sel && sel[k]) || []) if (s && typeof s.file === "string") out.add(s.file);
  }
  return [...out].sort();
}

/** Spec files the junit shows PASSED: at least one testcase that is neither failed, errored nor skipped, and no
 *  failed or errored one. Classnames are `specs/x.spec.js` (testDir ./tests); normalised to tests/specs/... */
export function passedSpecFiles(xml) {
  const pass = new Set(), bad = new Set();
  for (const m of String(xml || "").matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const cn = /\bclassname="([^"]*)"/.exec(m[1] || "");
    if (!cn) continue;
    let file = cn[1].split(" ")[0].replace(/^\.\//, "");
    if (!file.startsWith("tests/")) file = "tests/" + file;
    const body = m[2] || "";
    if (/<(?:failure|error)\b/.test(body)) bad.add(file);
    else if (!/<skipped\b/.test(body)) pass.add(file);
  }
  return new Set([...pass].filter((f) => !bad.has(f)));
}

/** One shard's record line. `units`: spec paths or `path#j/k` pieces it ran. */
export function groupRecordLine({ head, base, gl, flaky, group, ok, units }) {
  return `head=${head || "none"} base=${base || "none"} gl=${gl} flaky=${flaky ? "fail" : "off"} group=${group} ok=${ok ? 1 : 0} units=${(units || []).join(",")}`;
}
export function parseGroupRecord(message) {
  const m = /^head=([0-9a-f]{40}|none) base=([0-9a-f]{40}|none) gl=(llvmpipe|swiftshader) flaky=(fail|off) group=([a-z0-9-]+) ok=([01]) units=(\S*)$/
    .exec(String(message || "").trim());
  if (!m) return null;
  const units = m[7] ? m[7].split(",") : [];
  if (!units.every((u) => UNIT_RE.test(u))) return null;
  return { head: m[1], base: m[2], gl: m[3], flaky: m[4], group: m[5], ok: m[6] === "1", units };
}

/** The group and GL a browser-group run was dispatched with, from its run-name. */
export function parseRunTitle(title) {
  const m = /^browser group ([a-z0-9-]+) on \S+ \((llvmpipe|swiftshader)\)$/.exec(String(title || ""));
  return m ? { group: m[1], gl: m[2] } : null;
}

/** Is `spec` covered by these units: whole, or every piece 1..k of one k? */
export function covers(units, spec) {
  const pieces = new Map();
  for (const u of units) {
    const m = UNIT_RE.exec(u);
    if (!m || m[1] !== spec) continue;
    if (!m[2]) return true;
    const k = Number(m[3]);
    if (!pieces.has(k)) pieces.set(k, new Set());
    pieces.get(k).add(Number(m[2]));
  }
  for (const [k, got] of pieces) {
    let all = true;
    for (let j = 1; j <= k; j++) if (!got.has(j)) all = false;
    if (all) return true;
  }
  return false;
}

/**
 * The decision. Pure: every GitHub read is a callback, so a test hands in fixtures.
 * @param {object} q
 * @param {string[]} q.dropped   the dropped spec files (DROPPED_SPECS)
 * @param {string}   q.count     the plan's dropped count (select's `dropped` output)
 * @param {string}   q.head      PR head sha
 * @param {string}   q.base      the base sha THIS run's merge commit sits on
 * @param {Array|null} q.runs    browser-group.yml runs on q.head (any order), or null on a lookup failure
 * @param {(group:string)=>string[]|null} q.groupSpecs the spec files of test:<group> (package.json), null if unknown
 * @param {(id:string)=>Array|null} q.jobsOf          a run's jobs, or null on a lookup failure
 * @param {(jobId:string)=>Array|null} q.annotationsOf a job's annotations, or null on a lookup failure
 * @returns {{accept:boolean, why:string, runs?:string[]}}
 */
export function decide(q) {
  let live = false;
  const no = (why) => ({ accept: false, why, live });
  const dropped = [...new Set((q.dropped || []).filter(Boolean))].sort();
  if (!dropped.length) return no("the dropped spec names are missing (select's dropped_specs output is empty)");
  if (!/^\d+$/.test(String(q.count ?? "")) || Number(q.count) !== dropped.length) {
    return no(`the plan's dropped count (${JSON.stringify(String(q.count ?? ""))}) does not match the ${dropped.length} named spec(s)`);
  }
  if (!SHA.test(String(q.head || ""))) return no("no PR head sha");
  if (!SHA.test(String(q.base || ""))) return no("this run's base sha is unknown");
  if (!Array.isArray(q.runs)) return no("the browser-group runs lookup failed");
  const mine = q.runs.filter((r) => r && r.path === GROUP_WORKFLOW_PATH && r.event === "workflow_dispatch" && r.head_sha === q.head);
  const taint = new Map();   // spec -> why it is refused (a still-running run sets `live`: main() may wait for it)
  const units = new Map();   // run id -> units it proved
  const notes = [];
  for (const r of mine) {
    const id = String(r.id);
    const t = parseRunTitle(r.display_title || r.name);
    const clean = r.status === "completed" && r.conclusion === "success" && Number(r.run_attempt) === 1;   // a missing attempt is not "first"
    const specs = t ? q.groupSpecs(t.group) : null;
    const state = `${r.status}/${r.conclusion || "-"}, attempt ${r.run_attempt ?? "?"}`;
    if (!clean && r.status !== "completed" && (!specs || dropped.some((s) => specs.includes(s)))) live = true;
    if (!clean) {
      // A red, cancelled, live or re-run group run of a dropped spec refuses it. Unknown contents refuse them all.
      for (const s of dropped) {
        if (!specs || specs.includes(s)) {
          if (!taint.has(s)) taint.set(s, `run ${id} ${t ? `(group ${t.group}) ` : "(unreadable group) "}is ${state}`);
        }
      }
      continue;
    }
    if (!t || t.gl !== "llvmpipe") { notes.push(`run ${id} is not a default-GL (llvmpipe) run`); continue; }
    const jobs = q.jobsOf(id);
    if (!Array.isArray(jobs) || !jobs.length) { notes.push(`run ${id}: jobs unreadable`); continue; }
    const got = [];
    let why = "";
    for (const j of jobs) {
      if (j.conclusion !== "success") { why = `job ${j.name} is ${j.conclusion}`; break; }
      // EXACTLY ONE record per job (review S1, 2026-11-11): any process in the shard step (a spec's console.log, a
      // helper) can print a `::notice title=apex-group::` line, so a second one means the record cannot be trusted.
      // The PLAN record (written by its own step before any spec ran) bounds what the END record may claim: an
      // annotation printed during the run is a claim, the plan written before it is the evidence of what was run.
      const notesOf = q.annotationsOf(String(j.id)) || [];
      const recs = notesOf.filter((a) => a && a.title === GROUP_RECORD_TITLE);
      const plans = notesOf.filter((a) => a && a.title === GROUP_PLAN_TITLE);
      if (recs.length > 1 || plans.length > 1) { why = `job ${j.name} has ${recs.length} ${GROUP_RECORD_TITLE} and ${plans.length} ${GROUP_PLAN_TITLE} records (something besides the shard steps printed one)`; break; }
      const rec = parseGroupRecord(recs[0]?.message);
      const plan = parseGroupRecord(plans[0]?.message);
      if (!rec) { why = `job ${j.name} left no readable ${GROUP_RECORD_TITLE} record`; break; }
      if (!plan) { why = `job ${j.name} left no readable ${GROUP_PLAN_TITLE} record (its plan, written before the specs ran)`; break; }
      if (plan.head !== rec.head || plan.base !== rec.base || plan.gl !== rec.gl || plan.group !== rec.group) { why = `job ${j.name}'s plan and end records disagree`; break; }
      const outside = rec.units.find((u) => !plan.units.includes(u));
      if (outside) { why = `job ${j.name}'s end record claims ${outside}, which its plan did not contain`; break; }
      if (!rec.ok) { why = `job ${j.name}'s record says it failed`; break; }
      if (rec.head !== q.head) { why = `job ${j.name} tested head ${rec.head.slice(0, 12)}`; break; }
      if (rec.base === "none") { why = "it tested the branch head, not the PR merge ref (dispatch it with remote-group.mjs, which passes the PR)"; break; }
      if (rec.base !== q.base) { why = `it tested base ${rec.base.slice(0, 12)}, this run tests ${q.base.slice(0, 12)}`; break; }
      if (rec.gl !== "llvmpipe" || rec.flaky !== "fail" || rec.group !== t.group) { why = `job ${j.name}'s record is gl=${rec.gl} flaky=${rec.flaky} group=${rec.group}`; break; }
      // Every unit must be a spec of the group the run was dispatched for (#5480: "a spec the group did not contain").
      const own = specs || [];
      const alien = plan.units.find((u) => !own.includes(UNIT_RE.exec(u)[1]));
      if (alien) { why = `job ${j.name}'s plan names ${alien}, which test:${t.group} does not contain`; break; }
      got.push(...rec.units);
    }
    if (why) { notes.push(`run ${id}: ${why}`); continue; }
    units.set(id, got);
  }
  const used = new Set();
  const missing = [];
  for (const s of dropped) {
    if (taint.has(s)) return no(`${s}: ${taint.get(s)} — a group run that is not green on attempt 1 refuses it`);
    const by = [...units].filter(([, u]) => covers(u, s)).map(([id]) => id);
    if (!by.length) { missing.push(s); continue; }
    used.add(by.sort()[0]);
  }
  if (missing.length) {
    return no(`no green same-head, same-base llvmpipe browser-group run covers ${missing.join(" ")}${notes.length ? ` (${notes.slice(0, 3).join("; ")})` : ""}`);
  }
  const runs = [...used].sort();
  return { accept: true, runs, why: `dropped spec(s) ${dropped.join(" ")} ran green in browser-group run(s) ${runs.join(", ")}: same head ${q.head.slice(0, 12)}, same base ${q.base.slice(0, 12)}, llvmpipe, attempt 1` };
}

/** tests/specs/*.spec.js named by one npm script line (globs expanded against tests/specs on disk), sorted.
 *  The same answer as select-specs.mjs specsOf([name], scripts), kept here because the verdict job cannot import
 *  that file: it has no node_modules (select-specs needs espree) and a sparse checkout without tests/helpers.
 *  Run 43475135417 died on that import with eight green group runs unread. */
export function scriptSpecs(cmd, dir = path.join("tests", "specs")) {
  const out = new Set();
  for (const m of String(cmd || "").match(/tests\/specs\/[^\s"']+\.spec\.js/g) || []) {
    if (!m.includes("*")) { out.add(m); continue; }
    const re = new RegExp("^" + path.basename(m).replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*") + "$");
    for (const f of fs.readdirSync(dir)) if (re.test(f)) out.add(`tests/specs/${f}`);
  }
  return [...out].sort();
}

function gh(args) {
  const r = spawnSync("gh", ["api", ...args], { encoding: "utf8", maxBuffer: 64 << 20 });
  return r.status === 0 ? r.stdout : null;
}
function json(text) { try { return text == null ? null : JSON.parse(text); } catch { return null; } }
function pages(text, key) {
  if (text == null) return null;
  try {
    const out = [];
    for (const page of text.split(/(?=\{"total_count")/)) if (page.trim()) out.push(...(JSON.parse(page)[key] || []));
    return out;
  } catch { return null; }
}
function currentBase() {
  const r = spawnSync("git", ["cat-file", "-p", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? ((/^parent ([0-9a-f]{40})$/m.exec(r.stdout) || [])[1] || "") : "";
}

async function main(argv = process.argv.slice(2)) {
  const env = process.env;
  if (argv.includes("--names")) {
    const at = argv.indexOf("--sel");
    let sel = null;
    try { sel = JSON.parse(fs.readFileSync(at >= 0 ? argv[at + 1] : "sel.json", "utf8")); } catch { /* empty */ }
    process.stdout.write(`dropped_specs=${sel ? droppedSpecs(sel).join(" ") : ""}\n`);
    return;
  }
  const say = (v) => {
    console.error(`dropped-group-runs: ${v.why}`);
    process.stdout.write(`accept=${v.accept}\n${v.runs ? `runs=${v.runs.join(",")}\n` : ""}why=${String(v.why).replace(/[\r\n]+/g, " ")}\n`);
  };
  const repo = env.GITHUB_REPOSITORY || "";
  if (!repo) return say({ accept: false, why: "no GITHUB_REPOSITORY" });
  const head = env.PR_HEAD_SHA || "";
  let scripts = null;
  try { scripts = JSON.parse(fs.readFileSync("package.json", "utf8")).scripts || null; } catch { /* below */ }
  const runs = SHA.test(head) ? pages(gh([`repos/${repo}/actions/workflows/browser-group.yml/runs?head_sha=${head}&per_page=100`, "--paginate"]), "workflow_runs") : null;
  // THE BOUNDED WAIT (orchestrator A, 2026-11-11): a group run dispatched at the ready flip may still be running when
  // this job starts. While a run of a dropped spec's group is queued or in progress, poll until WAIT_S (default 420 s:
  // inside this job's 10-min cap, which stays as it is), then decide on what is there; a run still live is a refusal.
  const waitS = Math.max(0, Math.min(480, Number(env.WAIT_S ?? 420) || 0));
  const until = Date.now() + waitS * 1000;
  const ask = (rs) => decide({
    dropped: String(env.DROPPED_SPECS || "").split(/\s+/), count: env.DROPPED, head,
    base: env.CURRENT_BASE || currentBase(), runs: rs,
    // A glob needs tests/specs on disk; a throw reads as unknown contents (refuses every dropped spec).
    groupSpecs: (g) => { try { return scripts && scripts[`test:${g}`] ? scriptSpecs(scripts[`test:${g}`]) : null; } catch { return null; } },
    jobsOf: (id) => pages(gh([`repos/${repo}/actions/runs/${id}/jobs?per_page=100`, "--paginate"]), "jobs"),
    annotationsOf: (jobId) => json(gh([`repos/${repo}/check-runs/${jobId}/annotations?per_page=100`])),
  });
  const list = () => (SHA.test(head) ? pages(gh([`repos/${repo}/actions/workflows/browser-group.yml/runs?head_sha=${head}&per_page=100`, "--paginate"]), "workflow_runs") : null);
  let v = ask(runs);
  while (!v.accept && v.live && Date.now() + 30000 < until) {
    console.error(`dropped-group-runs: ${v.why} — waiting for it (${Math.round((until - Date.now()) / 1000)} s left)`);
    await new Promise((r) => setTimeout(r, 30000));
    v = ask(list());
  }
  say(v);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
