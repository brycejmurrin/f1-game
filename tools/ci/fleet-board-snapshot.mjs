#!/usr/bin/env node
// fleet-board-snapshot.mjs — one JSON per dataset of the Apex Fleet Board dashboard, into artifacts/fleet-board/.
// @doc Writes the Fleet Board dashboard's six snapshot datasets to artifacts/fleet-board/; read-only, no bus cursor.
// Full description: Gathers open PRs into the deploy branch with CI per head (REST, the ci-watch verdict), the fleet bus (readBus, no cursor), live claims (the claims board), the deploy tip with its Pages run, and the GAME-SLOT / last DONE bus lines; writes prs.json bus.json claims.json deploy.json derived.json snapshot.json. Display times carry a Pacific `*_pt` twin. Upload and dataset update steps: docs/notes/FLEET-BOARD-2026-10-19.md.
// @skill agent-fleet
//
//   node tools/ci/fleet-board-snapshot.mjs [--out DIR] [--max-prs N] [--no-fetch]
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const BY = "fleet-board-snapshot.mjs";
export const DATASETS = ["prs", "bus", "claims", "deploy", "derived", "snapshot"];
export const BUS_LAST = 40;
export const MAX_PRS = 25;
export const CLAIM_STALE_MIN = 120;

/** ISO time -> `2026-10-19 11:45 PDT` in America/Los_Angeles. Pure. */
export function pacific(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short",
  }).formatToParts(new Date(t)).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute} ${parts.timeZoneName}`;
}

const iso = (unixSeconds) => new Date(unixSeconds * 1000).toISOString();

/** The ```fleet block of a PR body as key/values (`#` comments dropped); {} when absent. Pure. */
export function parseFleetBlock(body) {
  const m = /```fleet\s*\n([\s\S]*?)```/.exec(String(body || "").replace(/<!--[\s\S]*?-->/g, ""));
  const out = {};
  if (!m) return out;
  for (const l of m[1].split(/\r?\n/)) {
    const kv = /^\s*([a-z-]+)\s*:\s*(.*?)\s*(?:#.*)?$/.exec(l);
    if (kv && kv[2] && !kv[2].startsWith("<")) out[kv[1]] = kv[2];
  }
  return out;
}

const sessionOf = (v = "") => String(v).replace(/^[a-z]+:/, "");

/** game / non-game from the changed paths (what the deploy would ship). Pure. */
export function classifyGame(files = []) {
  return files.some((f) => /^(js|css|assets)\//.test(f) || /^(index\.html|sw\.js|version\.json)$/.test(f)) ? "game" : "non-game";
}

/** Runs (any workflow) + their jobs for one head -> { state, ci_detail }. Same verdict as `ci-watch --once`. Pure. */
export function ciSummary(runs, jobsByRun, { verdict, latestPerWorkflow, labelNoiseRun }) {
  const latest = latestPerWorkflow((runs || []).filter((r) => !labelNoiseRun(r)));
  const v = verdict(latest, jobsByRun);
  const tail = v.line.replace(/^\S+\s*/, "").replace(/ — .*/, "");
  const list = latest.map((r) => `#${r.id} ${r.event}`).join(", ");
  return { state: v.state, ci_detail: latest.length ? `${tail} run=${list}` : v.line };
}

/** One PR row of prs.json. Pure: `fleet` is pr-board's fleetStatus() for the PR. */
export function prRow({ pr, files = [], ci, fleet, hasMergeHold }) {
  const block = parseFleetBlock(pr.body);
  const blocker = fleet?.reason || (block.blocker && block.blocker !== "none" ? block.blocker : "");
  return {
    number: pr.number,
    title: pr.title || "",
    draft: pr.draft ? "draft" : "ready",
    sha: String(pr.head?.sha || "").slice(0, 8),
    branch: pr.head?.ref || "",
    mergeable: pr.mergeable_state || "",
    labels: (pr.labels || []).map((l) => l.name).join(","),
    updated_at: pr.updated_at || "",
    updated_pt: pacific(pr.updated_at),
    game: classifyGame(files),
    files: files.length,
    ci: ci.state,
    ci_detail: ci.ci_detail,
    fleet: String(block.fleet || "").toUpperCase(),
    worker: sessionOf(block.worker),
    orchestrator: sessionOf(block.orchestrator),
    fleet_state: fleet?.state || block.state || "",
    blocker,
    merge_hold: hasMergeHold ? "MERGE-HOLD" : "",
    url: pr.html_url || `https://github.com/brycejmurrin/f1-game/pull/${pr.number}`,
  };
}

/** readBus() entries (oldest first) -> bus.json rows, newest first. Pure. */
export function busRows(entries) {
  return [...entries].reverse().map((e) => ({
    at: iso(e.at), at_pt: pacific(iso(e.at)), kind: e.type || e.kind, from: e.from, to: e.to, text: e.text, sha: String(e.sha).slice(0, 8),
  }));
}

/** The newest GAME-SLOT HANDOFF and the newest DONE among the bus rows (newest first). Pure. */
export function derive(rows) {
  const out = [];
  const slot = rows.find((r) => r.kind === "HANDOFF" && /^GAME-SLOT\b/.test(r.text));
  if (slot) out.push({ key: "game_slot", at: slot.at, at_pt: slot.at_pt, from: slot.from, text: slot.text });
  const done = rows.find((r) => r.kind === "DONE");
  if (done) out.push({ key: "last_done", at: done.at, at_pt: done.at_pt, from: done.from, text: done.text });
  return out;
}

/** who-is-on-it parseBoard() claims -> claims.json rows (live only), newest first. Pure. */
export function claimRows(claims) {
  return claims.filter((c) => !c.released && c.ageMin <= CLAIM_STALE_MIN).sort((a, b) => b.at - a.at).map((c) => ({
    at: iso(c.at), at_pt: pacific(iso(c.at)), age_min: c.ageMin, claim: c.slug,
    branch: (/\[([^;\]]+)/.exec(c.text) || [])[1] || c.slug.replace(/-[0-9a-f]{24}$/, "").replace(/^(cursor|claude)--/, "$1/"), who: c.who, text: c.text.replace(/\s\s\[[^\]]*\]\s*$/, ""),
  }));
}

export function snapshotRow(source, at, rows, ok, note) {
  return { source, at, at_pt: pacific(at), by: BY, rows, ok: ok ? "ok" : "error", note };
}

/** Everything, behind injected I/O so a test runs it on fixtures. `io`:
 *  { request(pathQs)->{json}|{error}, readBus(), readBoard(), lsRemote(), ciWatch, prBoard, whoIsOnIt, now }. */
export function collect(io, { maxPrs = MAX_PRS } = {}) {
  const at = new Date(io.now()).toISOString();
  const { request, ciWatch, prBoard } = io;
  const DEPLOY = ciWatch.DEPLOY;
  const rowsOf = {};
  const log = [];
  const guard = (source, note, fn) => {
    try { const r = fn(); rowsOf[source] = r; log.push(snapshotRow(source, at, r.length, true, typeof note === "function" ? note() : note)); }
    catch (e) { rowsOf[source] = []; log.push(snapshotRow(source, at, 0, false, `${note} — ${String(e.message || e).slice(0, 160)}`)); }
  };
  const ciFor = (sha) => {
    const r = request(`actions/runs?head_sha=${sha}&per_page=50`);
    if (r.error) throw new Error(`runs ${sha.slice(0, 7)}: ${r.error}`);
    const runs = ciWatch.latestPerWorkflow((r.json?.workflow_runs || []).filter((x) => !ciWatch.labelNoiseRun(x)));
    const jobsByRun = {};
    for (const run of runs) {
      const j = request(`actions/runs/${run.id}/jobs?per_page=100`);
      if (j.error) throw new Error(`jobs #${run.id}: ${j.error}`);
      jobsByRun[run.id] = j.json?.jobs || [];
    }
    return { runs, ...ciSummary(runs, jobsByRun, ciWatch) };
  };

  guard("prs", `GitHub REST open PRs into ${DEPLOY}; CI = the ci-watch verdict on each head (first ${maxPrs})`, () => {
    const list = request(`pulls?state=open&base=${encodeURIComponent(DEPLOY)}&per_page=100`);
    if (list.error) throw new Error(list.error);
    const out = [];
    for (const item of (list.json || []).sort((a, b) => b.number - a.number).slice(0, maxPrs)) {
      const one = request(`pulls/${item.number}`);
      if (one.error) throw new Error(`PR #${item.number}: ${one.error}`);
      const pr = one.json;
      const f = request(`pulls/${item.number}/files?per_page=100`);
      const files = f.error ? [] : (f.json || []).map((x) => x.filename);
      let comments = [];
      if (pr.comments > 0) {
        const c = request(`issues/${item.number}/comments?per_page=100&page=${Math.ceil(pr.comments / 100)}`);
        if (!c.error && Array.isArray(c.json)) comments = c.json;
      }
      out.push(prRow({
        pr, files, ci: ciFor(pr.head.sha),
        fleet: prBoard.fleetStatus(pr.body, comments), hasMergeHold: prBoard.hasMergeHold(pr.body),
      }));
    }
    return out;
  });

  let bus = [];
  let busTip = "";
  guard("bus", () => `fleet-bus readBus --last ${BUS_LAST} (bus tip ${busTip.slice(0, 8)}, no cursor)`, () => {
    const b = io.readBus();
    busTip = String(b.tip);
    bus = busRows(b.entries);
    return bus;
  });

  guard("claims", `claims board, non-stale (stale after ${CLAIM_STALE_MIN} min)`, () => claimRows(io.whoIsOnIt.parseBoard(io.readBoard(), Math.floor(io.now() / 1000))));

  guard("deploy", "git ls-remote + CI verdict and pages.yml run on the tip", () => {
    const sha = io.lsRemote();
    if (!sha) throw new Error(`no ${DEPLOY} on origin`);
    const c = request(`commits/${sha}`);
    const tipAt = c.json?.commit?.committer?.date || "";
    const ci = ciFor(sha);
    const pages = ci.runs.find((r) => /pages/i.test(r.name) || /pages\.yml$/.test(r.path || ""));
    return [{
      branch: DEPLOY, tip: sha.slice(0, 8), tip_message: String(c.json?.commit?.message || "").split("\n")[0],
      tip_at: tipAt, tip_at_pt: pacific(tipAt), verdict: ci.state, detail: ci.ci_detail,
      pages_run: pages ? String(pages.id) : "", pages_state: !pages ? "none" : pages.status === "completed" ? pages.conclusion : "pending",
    }];
  });

  guard("derived", "from the bus rows: newest GAME-SLOT and newest DONE", () => derive(bus));

  return { at, datasets: { ...rowsOf, snapshot: log }, ok: log.every((r) => r.ok === "ok") };
}

export async function main(argv = process.argv.slice(2)) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node tools/ci/fleet-board-snapshot.mjs [--out DIR] [--max-prs N] [--no-fetch]");
    return 0;
  }
  const out = path.resolve(ROOT, opt("--out", "artifacts/fleet-board"));
  // Imported here: ci-watch and pr-board read process.argv at load (--help handling).
  const ciWatch = await import("./ci-watch.mjs");
  const prBoard = await import("./pr-board.mjs");
  const bus = await import("./fleet-bus.mjs");
  const who = await import("./who-is-on-it.mjs");
  const noFetch = argv.includes("--no-fetch");
  const git = (...a) => spawnSync("git", a, { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  const io = {
    request: (p) => ciWatch.api(p), ciWatch, prBoard, whoIsOnIt: who, now: Date.now,
    readBus: () => bus.readBus({ last: BUS_LAST, fetch: !noFetch }),
    readBoard: () => {
      if (!noFetch) git("fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${who.CLAIMS_BOARD}:refs/remotes/origin/${who.CLAIMS_BOARD}`);
      return who.readBoard(`refs/remotes/origin/${who.CLAIMS_BOARD}`);
    },
    lsRemote: () => (git("ls-remote", "origin", `refs/heads/${ciWatch.DEPLOY}`).stdout.split(/\s/)[0] || ""),
  };
  const res = collect(io, { maxPrs: Number(opt("--max-prs", MAX_PRS)) });
  fs.mkdirSync(out, { recursive: true });
  for (const id of DATASETS) fs.writeFileSync(path.join(out, `${id}.json`), JSON.stringify(res.datasets[id], null, 1) + "\n");
  for (const r of res.datasets.snapshot) console.log(`${r.ok === "ok" ? "ok " : "ERR"} ${r.source.padEnd(8)} ${String(r.rows).padStart(3)} rows  ${r.note}`);
  console.log(`= snapshot ${res.ok ? "ok" : "partial"} at=${res.at} pt=${pacific(res.at)} out=${path.relative(ROOT, out)}`);
  return res.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((c) => process.exit(c));
}
