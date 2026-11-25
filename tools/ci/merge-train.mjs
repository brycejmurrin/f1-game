#!/usr/bin/env node
// merge-train.mjs — batch up to TRAIN_MAX green `land` PRs into ONE train PR that gets one CI run and one gate.
// @doc Merge train: folds green `land` PRs onto the deploy tip as a `train/*` PR; the gate checks each car's own rows.
// @section runner
// @skill steward
//
// Why (docs/notes/MERGE-TRAIN-2026-11-18.md, Bryce 2026-11-18 ~10:15Z "Merge train (Recommended)"): 91 open PRs, 23 at `land`, about 20 concurrent
// free runners, and every merge moves the tip, so each other `land` PR re-gates: 4–6 merges an hour. A train merges
// its cars onto the tip with merge commits (`Merge pull request #n …`, a clean merge each, a conflicting car is left
// out), opens that branch as an ordinary PR with `land`, and lets the EXISTING route land it: CI on the train head,
// land.yml's `gate`, arm, a merge commit into the deploy branch. Each car's head is then in the deploy branch, so
// GitHub marks that car merged. Nothing here merges, arms, pushes the deploy branch or changes a ruleset.
//
// THE TRAIN PR'S GATE (merge-gate.mjs, evaluate): a PR whose head branch starts `train/` carries a manifest
// (TRAIN_MARK) naming its base and its cars. Its config and raise rows become the cars' rows (trainRow): the head
// must be EXACTLY the fold of the car heads onto `base` (verifyTrain: first-parent chain, second parents, each tree
// the clean merge-tree of its parents), `base` must be on the deploy branch, and every car must still be open with
// that head, carry `land`, and pass its OWN trusted rows (open, hold, plan, ci, config, raise; carVerdict). So no row
// binding a PR is lost: Bryce's `config-ok`/`ratchet-raise` are read per car, a `hold` on any car vetoes the train.
// open, hold, plan, ci, base, gen, ratchets and retest are the train's own, measured on its head and merge result.
//
//   node tools/ci/merge-train.mjs --plan [--max <n>]     dry run: print the next train from live state, write nothing
//   node tools/ci/merge-train.mjs --screen --out <f>     land.yml `train-screen` job: each car's merge-result ratchets
//   node tools/ci/merge-train.mjs --build [--screen-file <f>] [--max <n>]   land.yml `train` job: close a finished
//                                                        train, open the next from the cars the screen found green
//
// Bisect on red (trainHistory): a closed, unmerged train of n cars caps the next train at floor(n/2) cars, so the
// suspect set halves each round; a car that was alone in a red train is left out until its head changes. A train
// closed because a car moved or lost `land` is `stale`, not red. So is a train whose `gate` success stays unarmed
// (stuckGreen, T1 of the #6379 land-trigger note). A train that goes red while its base (the deploy tip
// it was built on) is itself red is `stale` too (redOnRedTip): its cars were never the suspects. One train is open at a time.
//
// Exit: 0 done (or nothing to do), 1 usage, API or git error.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY, REPO } from "./github-api.mjs";
import { readDeployTip } from "./lib/deploy-tip.mjs";
import { runTipGate, tipView } from "./lib/tip-gate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** A train PR's head branch prefix: merge-gate treats only these as trains. */
export const TRAIN_PREFIX = "train/";
/** The label the builder adds to a train PR (with `land`), so boards and the dispatcher can tell it apart. */
export const TRAIN_LABEL = "train";
/** Cars per train (Bryce: "about 5 PRs at a time"; 2026-11-18 ~19:50Z "Bigger trains 5→10"). */
export const TRAIN_MAX = 10;
/** How far back closed trains count for the bisect (hours). */
export const HISTORY_H = 24;
/** The manifest in a train PR body: one JSON object, `{"base":sha,"cars":[{"pr":n,"head":sha,"ref":branch}]}`. */
export const TRAIN_MARK = /<!-- merge-train (\{[^\n]*\}) -->/;
/** The outcome a builder appends when it closes a train: `{"outcome":"red"|"stale","why":"…"}`. */
export const RESULT_MARK = /<!-- merge-train-result (\{[^\n]*\}) -->/;
/** The trusted rows a car must pass on its own. `base` is the train's (a red tip holds the train, not the car). */
export const CAR_ROWS = Object.freeze(["open", "hold", "plan", "ci", "config", "raise"]);
/** land.yml resolve's per-run gate cap (`sort_by(…) | .[:4]`). A train can hold TRAIN_MAX cars, so the cap alone can starve it. */
export const RESOLVE_CAP = 4;

const SHA = /^[0-9a-f]{40}$/;
const labelNames = (labels) => (labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
const gitIn = (cwd) => (args, extra = {}) => spawnSync("git", args, { cwd, encoding: "utf8", timeout: 120_000, ...extra });

// ---- manifest -------------------------------------------------------------------------------------------

/** Parse the manifest from a train PR body; null when absent or malformed. Pure. */
export function trainManifest(body) {
  const m = TRAIN_MARK.exec(String(body || ""));
  if (!m) return null;
  let j;
  try { j = JSON.parse(m[1]); } catch { return null; }
  const base = String(j?.base || "").toLowerCase();
  if (!SHA.test(base) || !Array.isArray(j.cars) || !j.cars.length) return null;
  const cars = [];
  for (const c of j.cars) {
    const pr = Number(c?.pr), head = String(c?.head || "").toLowerCase();
    if (!Number.isInteger(pr) || pr < 1 || !SHA.test(head)) return null;
    cars.push({ pr, head, ref: String(c?.ref || "") });
  }
  if (new Set(cars.map((c) => c.pr)).size !== cars.length) return null;
  return { base, cars };
}

export const renderManifest = ({ base, cars }) =>
  `<!-- merge-train ${JSON.stringify({ base, cars: cars.map(({ pr, head, ref }) => ({ pr, head, ref })) })} -->`;

/** A closed train's recorded outcome; null when none. Pure. */
export function trainResult(body) {
  const m = RESULT_MARK.exec(String(body || ""));
  if (!m) return null;
  try { const j = JSON.parse(m[1]); return j?.outcome === "red" || j?.outcome === "stale" ? { outcome: j.outcome, why: String(j.why || "") } : null; } catch { return null; }
}

/** The train PR body: Goal, a closed Plan (the gate's plan row) with the gate-exempt `land:` item, the manifest. Pure. */
export function trainBody({ base, cars, dropped = [] }) {
  const lines = [
    "## Goal", "",
    `Merge train (docs/notes/MERGE-TRAIN-2026-11-18.md): ${cars.length} green \`land\` PR${cars.length === 1 ? "" : "s"} merged onto the deploy tip \`${base.slice(0, 12)}\` with merge commits, so one CI run and one \`gate\` land them all. Each car's own rows (hold, plan, ci, config, raise) are re-read by the gate.`, "",
    "## Plan", "",
    ...cars.map((c) => `- [x] #${c.pr} \`${c.head.slice(0, 12)}\` merged clean`),
    "- [ ] land: CI green on this head, then `gate` (each car's own rows) arms it", "",
  ];
  if (dropped.length) lines.push("## Not in this train", "", ...dropped.map((d) => `- #${d.pr}: ${d.why}`), "");
  lines.push("Built by `tools/ci/merge-train.mjs --build`; nobody pushes to this branch.", "", renderManifest({ base, cars }));
  return lines.join("\n");
}

// ---- picking --------------------------------------------------------------------------------------------

/** Candidate cars from open PRs (pulls list rows), in landing order: `priority` first, then oldest. Pure. */
export function carCandidates(pulls, { exclude = new Set(), gateOk = new Set() } = {}) {
  const out = [], skipped = [];
  for (const p of pulls || []) {
    const n = p?.number, names = labelNames(p?.labels), head = String(p?.head?.sha || "").toLowerCase(), ref = String(p?.head?.ref || "");
    if (!names.includes("land")) continue;
    const why = p.state !== "open" ? "not open" : p.draft ? "draft" : names.includes("hold") ? "hold" : ref.startsWith(TRAIN_PREFIX) ? "a train itself"
      : p.head?.repo?.full_name && p.base?.repo?.full_name && p.head.repo.full_name !== p.base.repo.full_name ? "a fork"
      : p.base?.ref && p.base.ref !== DEPLOY ? `base is ${p.base.ref}` : exclude.has(`${n}@${head}`) ? "alone in a red train at this head"
      : gateOk.has(n) ? "its own gate already passed (it arms alone)" : "";
    if (why) skipped.push({ pr: n, why }); else out.push({ pr: n, head, ref, priority: names.includes("priority"), created: String(p.created_at || "") });
  }
  out.sort((a, b) => (b.priority - a.priority) || a.created.localeCompare(b.created) || a.pr - b.pr);
  return { cars: out.map(({ pr, head, ref }) => ({ pr, head, ref })), skipped };
}

function eligibleManifest(p, pulls) {
  const names = labelNames(p?.labels);
  if (p?.state !== "open" || p.draft || p.mergeable === false || names.includes("hold")
      || !names.includes("land") || !names.includes(TRAIN_LABEL) || !String(p.head?.ref || "").startsWith(TRAIN_PREFIX)) return null;
  const m = trainManifest(p.body);
  if (m?.cars.some(c => {
    const current = pulls.find(r => r.number === c.pr)?.head?.sha;
    return current && current !== c.head;
  })) return null;
  return m;
}

/** A car's current head only rides a train whose manifest contains that exact commit. */
export function openTrainCarIds(pulls) {
  const ids = new Set();
  for (const p of pulls || []) for (const c of eligibleManifest(p, pulls)?.cars || []) ids.add(`${c.pr}@${c.head}`);
  return ids;
}

export function boardedTrainOf(pr, head, pulls) {
  for (const p of pulls || []) {
    if (eligibleManifest(p, pulls)?.cars.some(c => c.pr === Number(pr) && c.head === head)) return p.number;
  }
  return null;
}

/**
 * land.yml resolve's landable pick (#6055): an open train ahead of its cars, cars of an open train dropped so they
 * cannot take a slot or arm alone, then `priority`, then oldest; at most `cap`. Pure.
 * `rows`: `{ number, head, prio?, created?, train? }` (`train: true` or a `train/` ref marks the train PR).
 * `trainCarIds`: from `openTrainCarIds`.
 */
export function resolveLandable(rows, { trainCarIds = new Set(), cap = RESOLVE_CAP } = {}) {
  const out = [];
  for (const r of rows || []) {
    if (r?.number == null) continue;
    const isTrain = r.train === true || String(r.ref || "").startsWith(TRAIN_PREFIX);
    if (!isTrain && trainCarIds.has(`${r.number}@${r.head}`)) continue;
    const prio = isTrain ? -1 : (r.prio ?? 1);
    out.push({ number: r.number, head: r.head, prio, created: String(r.created || "") });
  }
  out.sort((a, b) => (a.prio - b.prio) || a.created.localeCompare(b.created) || (a.number - b.number));
  return out.slice(0, Math.max(0, cap)).map(({ number, head }) => ({ number, head }));
}

/** A car's own trusted gate (merge-gate evaluate --trusted): every CAR_ROWS row ok. Pure. */
export function carVerdict(v, head = "") {
  if (!v || v.error) return { ok: false, why: `gate error: ${v?.error || "no verdict"}` };
  if (head && v.head && v.head !== head) return { ok: false, why: `head moved to ${v.head.slice(0, 8)}` };
  const bad = CAR_ROWS.filter((k) => !v.rows?.[k]?.ok);
  return bad.length ? { ok: false, why: bad.map((k) => `${k}: ${String(v.rows?.[k]?.evidence || "missing").slice(0, 120)}`).join("; ") } : { ok: true, why: "" };
}

/** Closed trains ({cars, outcome, closed}) → the next train's cap and the cars left out. Pure. */
export function trainHistory(closed, { now = Date.now(), hours = HISTORY_H, max = TRAIN_MAX } = {}) {
  // GitHub lists pulls by last update; edits to an older train can move it ahead of a later closure.
  const recent = (closed || []).filter((t) => t && now - Date.parse(t.closed) <= hours * 3600_000)
    .sort((a, b) => Date.parse(b.closed) - Date.parse(a.closed));
  const exclude = new Set();
  for (const t of recent) if (t.outcome === "red" && t.cars.length === 1) exclude.add(`${t.cars[0].pr}@${t.cars[0].head}`);
  // A stale train ends the previous bisection. Keep exclusions tied to proven red car heads.
  const last = recent.find((t) => ["red", "merged", "stale"].includes(t.outcome));
  const cap = last?.outcome === "red" ? Math.max(1, Math.floor(last.cars.length / 2)) : max;
  return { cap: Math.min(cap, max), exclude };
}

// ---- git: fold and verify -------------------------------------------------------------------------------

/** The commit message of one car's merge, as GitHub writes it. Pure. */
export const carMessage = (c, owner = REPO.split("/")[0]) => `Merge pull request #${c.pr} from ${owner}/${c.ref || `pr-${c.pr}`}\n\nmerge-train car #${c.pr}`;

/** Fold the car heads onto `base` in order: one clean merge commit each, a conflicting car is dropped. Writes only
 *  git objects (merge-tree + commit-tree): no worktree, no checkout, no hooks, no PR code. */
export function foldCars({ base, cars, cwd = ROOT, git = gitIn(cwd), max = TRAIN_MAX, env = {}, accept = null }) {
  let cur = base;
  const kept = [], dropped = [];
  const cenv = { ...process.env, GIT_AUTHOR_NAME: "merge-train", GIT_AUTHOR_EMAIL: "merge-train@users.noreply.github.com",
    GIT_COMMITTER_NAME: "merge-train", GIT_COMMITTER_EMAIL: "merge-train@users.noreply.github.com", ...env };
  for (const c of cars) {
    if (kept.length >= max) break;
    if (git(["cat-file", "-e", `${c.head}^{commit}`]).status !== 0) { dropped.push({ pr: c.pr, why: `head ${c.head.slice(0, 8)} not fetched` }); continue; }
    if (git(["merge-base", "--is-ancestor", c.head, cur]).status === 0) { dropped.push({ pr: c.pr, why: "already on the tip" }); continue; }
    const mt = git(["merge-tree", "--write-tree", "--name-only", "--no-messages", cur, c.head]);
    if (mt.status !== 0) {
      const files = String(mt.stdout || "").split("\n").slice(1).filter(Boolean);
      dropped.push({ pr: c.pr, why: mt.status === 1 ? `conflicts${files.length ? ` in ${files.slice(0, 4).join(", ")}` : ""} (sync-pr.mjs)` : `merge-tree failed: ${String(mt.stderr || "").trim().split("\n")[0]}` });
      continue;
    }
    const tree = String(mt.stdout).split("\n")[0].trim();
    // The screen (screenFold on the tokenless screen job, screenAccept on the build): a car whose merge turns the fold
    // red is left out and the fold stays where it was, so the next car is measured without it.
    const a = accept ? accept({ car: c, tree, parent: cur, kept: kept.length }) : { ok: true };
    if (!a?.ok) { dropped.push({ pr: c.pr, why: String(a?.why || "refused by the screen") }); continue; }
    const ct = git(["commit-tree", tree, "-p", cur, "-p", c.head, "-m", carMessage(c)], { env: cenv });
    if (ct.status !== 0) return { error: `commit-tree for #${c.pr} failed: ${String(ct.stderr || "").trim()}` };
    cur = ct.stdout.trim();
    kept.push(c);
  }
  return { head: cur, cars: kept, dropped };
}

/** The gate's purity check: `head` is exactly the fold of `cars` onto `base`, and `base` is on `tip`. git only. */
export function verifyTrain({ base, head, cars, tip, cwd = ROOT, git = gitIn(cwd) }) {
  if (!cars?.length) return { ok: false, why: "the manifest names no car" };
  for (const s of [base, head, ...cars.map((c) => c.head)]) if (git(["cat-file", "-e", `${s}^{commit}`]).status !== 0) return { ok: false, why: `${String(s).slice(0, 8)} is not in this clone` };
  if (tip && git(["merge-base", "--is-ancestor", base, tip]).status !== 0) return { ok: false, why: `base ${base.slice(0, 8)} is not on the deploy branch` };
  const rl = git(["rev-list", "--first-parent", "--parents", head, `^${base}`]);
  if (rl.status !== 0) return { ok: false, why: `rev-list failed: ${String(rl.stderr || "").trim()}` };
  const chain = rl.stdout.trim().split("\n").filter(Boolean).map((l) => l.split(" ")).reverse();
  if (chain.length !== cars.length) return { ok: false, why: `head has ${chain.length} commit(s) past base on its first-parent line, the manifest names ${cars.length} car(s)` };
  let prev = base;
  for (let i = 0; i < chain.length; i++) {
    const [sha, p1, p2, extra] = chain[i];
    if (p1 !== prev || p2 !== cars[i].head || extra) return { ok: false, why: `commit ${sha.slice(0, 8)} is not the merge of #${cars[i].pr} ${cars[i].head.slice(0, 8)} onto ${prev.slice(0, 8)}` };
    const mt = git(["merge-tree", "--write-tree", "--no-messages", p1, p2]);
    const tree = git(["rev-parse", `${sha}^{tree}`]).stdout.trim();
    if (mt.status !== 0 || mt.stdout.split("\n")[0].trim() !== tree) return { ok: false, why: `commit ${sha.slice(0, 8)} (#${cars[i].pr}) is not the clean merge of its parents` };
    prev = sha;
  }
  return { ok: true, why: `${head.slice(0, 8)} is the clean fold of ${cars.map((c) => `#${c.pr}`).join(" ")} onto ${base.slice(0, 8)}` };
}

/** merge-gate's config/raise rows for a train PR. `carGate(pr)` is merge-gate evaluate({pr, trusted:true}). */
export function trainRow({ manifest, head, headRef, tip, verify, carGate, carPull }) {
  if (!manifest) return { ok: false, evidence: `a ${TRAIN_PREFIX} branch (${headRef}) with no valid merge-train manifest in its body` };
  const pure = verify({ base: manifest.base, head, cars: manifest.cars, tip });
  if (!pure.ok) return { ok: false, evidence: `train is not a pure merge of its cars: ${pure.why}` };
  const bad = [];
  for (const c of manifest.cars) {
    const p = carPull(c.pr);
    if (p.error) return { error: `car #${c.pr}: ${p.error}` };
    const pull = p.json || {};
    const now = String(pull.head?.sha || "").toLowerCase();
    if (now !== c.head) { bad.push(`#${c.pr} head moved to ${now.slice(0, 8)}`); continue; }
    if (pull.merged_at) continue; // landed on its own with this very head: its own gate passed
    if (String(pull.head?.ref || "").startsWith(TRAIN_PREFIX)) { bad.push(`#${c.pr} is a train`); continue; }
    if (!labelNames(pull.labels).includes("land")) { bad.push(`#${c.pr} no longer carries land`); continue; }
    const v = carVerdict(carGate(c.pr, c.head), c.head);
    if (!v.ok) bad.push(`#${c.pr} ${v.why}`);
  }
  return bad.length ? { ok: false, evidence: `car rows: ${bad.join(" | ")}`.slice(0, 900) }
    : { ok: true, evidence: `${pure.why}; every car passes open, hold, plan, ci, config and raise on its own` };
}

// ---- the screen: each car's merge-result ratchets, before the train is built ------------------------------

/* WHY (#5864, trains #5840 and #5862, 2026-11-19): a car's trusted rows say nothing about its merge onto the CURRENT
 * tip. #5862's cars #5668, #5679 and #5730 were each red ALONE on the train's base (eagerBytes +147 and +2057 against
 * the exact ceiling the tip snapped down after their own gates ran, a hud.js lowering delta written against an older
 * ceiling, assertPins +1), so the train closed red on its gate and the bisect halved the next one. Measuring needs PR
 * code (the ratchets run the merge result's own scripts), and LAND_TOKEN never meets PR code. So land.yml's
 * `train-screen` job (read-only token, no secret, like land-gate) runs `--screen`: the same fold, with merge-gate's
 * ratchetsOnMerge on each cumulative fold, and writes the verdicts as data. The build reads them (readScreen,
 * screenAccept): a forged file can only leave cars out; the train's own gate still measures everything. */

/** Screen wall-clock budget: a car the budget did not reach is "not screened" and waits for the next run. */
export const SCREEN_BUDGET_MS = 12 * 60_000;
const SCREEN_WHY_MAX = 200;
/** A verdict's why as plain one-line text: it lands in the train PR body beside the manifest marker. Pure. */
const plainWhy = (w) => String(w ?? "").replace(/[<>`\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, SCREEN_WHY_MAX);

/** Parse a screen file's text. `{tip, skip?, cars:[{pr, head, ok, why}]}`, or null when it is not a valid screen. Pure. */
export function readScreen(text) {
  let j;
  try { j = JSON.parse(String(text ?? "")); } catch { return null; }
  const tip = String(j?.tip || "").toLowerCase();
  if (j?.skip) return { tip: SHA.test(tip) ? tip : "", skip: plainWhy(j.skip) || "skipped", cars: [] };
  if (!SHA.test(tip) || !Array.isArray(j.cars)) return null;
  const cars = [];
  for (const c of j.cars) {
    const pr = Number(c?.pr), head = String(c?.head || "").toLowerCase();
    if (!Number.isInteger(pr) || pr < 1 || !SHA.test(head) || typeof c.ok !== "boolean") return null;
    cars.push({ pr, head, ok: c.ok, why: plainWhy(c.why) });
  }
  return { tip, skip: "", cars };
}

/** The build's accept: only a car the screen measured green at this very head rides. Pure. */
export function screenAccept(screen) {
  const by = new Map((screen?.cars || []).map((c) => [`${c.pr}@${c.head}`, c]));
  return ({ car }) => {
    const v = by.get(`${car.pr}@${car.head}`);
    if (!v) return { ok: false, why: "not screened at this head (the next train run screens it)" };
    return v.ok ? { ok: true } : { ok: false, why: `red alone on the fold (screen on ${screen.tip.slice(0, 8)}): ${v.why || "over a ratchet"}` };
  };
}

/** The screen job's accept: materialise each candidate fold in ONE throw-away worktree whose HEAD is the tip (so the
 *  pin counters judge the growth the fold adds, as the gate's own row does) and run `check` (merge-gate
 *  ratchetsOnMerge) there. Records every verdict in `out`. → { accept, cleanup }. */
export function screenFold({ tip, cwd = ROOT, git = gitIn(cwd), check, prepare = null, out = [], now = Date.now, budgetMs = SCREEN_BUDGET_MS, fsx = fs }) {
  const wt = path.join(cwd, "artifacts", "merge-train", "screen-wt");
  const started = now();
  let ready = null;
  const cleanup = () => { git(["worktree", "remove", "--force", wt]); git(["worktree", "prune"]); fsx.rmSync(wt, { recursive: true, force: true }); };
  const setup = () => {
    cleanup();
    const add = git(["worktree", "add", "--detach", wt, tip]);
    if (add.status !== 0) return `worktree add failed: ${String(add.stderr || "").trim().split("\n")[0]}`;
    try { fsx.symlinkSync(path.join(cwd, "node_modules"), path.join(wt, "node_modules")); } catch { /* exists */ }
    return "";
  };
  const accept = ({ car, tree }) => {
    const record = (ok, why) => { out.push({ pr: car.pr, head: car.head, ok, why: plainWhy(why) }); return { ok, why }; };
    if (now() - started > budgetMs) return { ok: false, why: "not screened (screen time budget spent)" };
    if (ready === null) ready = setup();
    if (ready) return record(false, `screen: ${ready}`);
    const rt = git(["read-tree", "-u", "--reset", tree], { cwd: wt });
    if (rt.status !== 0) return record(false, `screen: read-tree failed: ${String(rt.stderr || "").trim().split("\n")[0]}`);
    git(["clean", "-fdqx", "-e", "node_modules"], { cwd: wt });
    // The built files (BUILT_PATHS: circuit-meta.js & co.) are not in the tree: gen:check builds them, as the gate's
    // gen row does before its ratchets (without it every car read red on a missing js/track/circuit-meta.js).
    const p = prepare ? prepare({ cwd: wt }) : { ok: true };
    if (!p?.ok) return record(false, p?.evidence || "gen:check fails on the fold");
    const r = check({ cwd: wt });
    return record(Boolean(r?.ok), r?.ok ? "" : r?.evidence || "over a ratchet");
  };
  return { accept, cleanup };
}

// ---- live state (--plan / --build) ----------------------------------------------------------------------

function listPulls(request, state) {
  const rows = [];
  for (let page = 1; page <= 10; page++) {
    const r = request(`pulls?state=${state}&base=${encodeURIComponent(DEPLOY)}&per_page=100&page=${page}${state === "closed" ? "&sort=updated&direction=desc" : ""}`);
    if (r.error) return { error: r.error };
    rows.push(...(r.json || []));
    if ((r.json || []).length < 100 || state === "closed") break;
  }
  return { rows };
}

const gateStatus = (sha, request) => {
  const r = request(`commits/${sha}/statuses?per_page=100`);
  const g = r.error ? null : (r.json || []).find((s) => s.context === "gate");
  return { state: g?.state || "", at: Date.parse(g?.created_at || "") };
};
const gateState = (sha, request) => gateStatus(sha, request).state;

/** T1's inputs for an open train whose `gate` is a success: read the tip's commit time and the retry dispatches only
 *  when the age rule alone does not already close it. */
function stuckInputs(t, g, request, now) {
  const s = { armed: t.auto_merge != null, gateAt: g.at, now, tipAt: null, attempts: null };
  if (s.armed || !Number.isFinite(g.at) || stuckGreen(s).close) return s;
  const tip = request(`branches/${encodeURIComponent(DEPLOY)}`);
  s.tipAt = tip.error ? null : Date.parse(tip.json?.commit?.commit?.committer?.date || "");
  if (!(s.tipAt > g.at)) return s;
  const runs = request(`actions/workflows/land.yml/runs?event=workflow_dispatch&branch=${encodeURIComponent(DEPLOY)}&per_page=100`);
  s.attempts = runs.error ? null : retryAttempts(runs.json, t.number, String(t.head?.sha || "").toLowerCase());
  return s;
}

/** The next train from live state. Reads GitHub and fetches car heads into `cwd`; writes only git objects. */
export async function planTrain({ request = api, cwd = ROOT, max = TRAIN_MAX, now = Date.now(), log = () => {}, acceptFor = null } = {}) {
  const { evaluate } = await import("./merge-gate.mjs");
  const open = listPulls(request, "open");
  if (open.error) return { error: `open PRs: ${open.error}` };
  const running = open.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX));
  const closed = listPulls(request, "closed");
  if (closed.error) return { error: `closed PRs: ${closed.error}` };
  const past = closed.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX) && p.closed_at).map((p) => {
    const m = trainManifest(p.body);
    return m && { cars: m.cars, closed: p.closed_at, outcome: p.merged_at ? "merged" : trainResult(p.body)?.outcome || "red" };
  }).filter(Boolean);
  const hist = trainHistory(past, { now, max });
  const landing = open.rows.filter((p) => labelNames(p.labels).includes("land") && !p.draft);
  const gateOk = new Set(landing.filter((p) => gateState(p.head.sha, request) === "success").map((p) => p.number));
  const { cars: cands, skipped } = carCandidates(open.rows, { exclude: hist.exclude, gateOk });
  const tipR = request(`branches/${encodeURIComponent(DEPLOY)}`);
  const tip = String(tipR.json?.commit?.sha || "").toLowerCase();
  if (!tip) return { error: `deploy tip: ${tipR.error || "no sha"}` };
  const git = gitIn(cwd);
  const f = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${DEPLOY}:refs/remotes/origin/${DEPLOY}`]);
  if (f.status !== 0) return { error: `fetch ${DEPLOY}: ${String(f.stderr || "").trim()}` };
  const ready = [];
  for (const c of cands) {
    if (ready.length >= hist.cap * 2) break; // enough spares for conflicts
    const v = carVerdict(evaluate({ pr: c.pr, sha: c.head, request, trusted: true }), c.head);
    log(`car #${c.pr} ${c.head.slice(0, 8)}: ${v.ok ? "ok" : v.why}`);
    if (!v.ok) { skipped.push({ pr: c.pr, why: v.why }); continue; }
    git(["fetch", "--quiet", "--no-tags", "origin", `+refs/pull/${c.pr}/head:refs/remotes/origin/pr/${c.pr}`]);
    ready.push(c);
  }
  const fold = foldCars({ base: tip, cars: ready, cwd, git, max: hist.cap, accept: acceptFor ? acceptFor(tip) : null });
  if (fold.error) return { error: fold.error };
  const min = hist.cap >= 2 ? 2 : 1;
  return { tip, cap: hist.cap, running: running.map((p) => p.number), cars: fold.cars, head: fold.head, dropped: [...fold.dropped, ...skipped], enough: fold.cars.length >= min };
}

/** The newest CI workflow run on a head ({ status, conclusion }) from an actions/workflows/ci.yml/runs page; null
 *  when there is none. Newest by run id: a re-run keeps its id, a new run on the same head gets a higher one. Pure. */
export function newestRun(json) {
  const runs = (json?.workflow_runs || []).filter((r) => r && Number.isFinite(Number(r.id)));
  if (!runs.length) return null;
  const r = runs.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  return { status: String(r.status || ""), conclusion: String(r.conclusion || "") };
}

/** Close an open train the builder can see is finished: a car moved (stale) or its CI/gate went red (red). Pure.
 *  `ciRun` is the head's newest CI workflow run, read when no `CI` check-run has completed (PR #5809: train #5814's
 *  run was cancelled at 01:33Z, no `CI` check ever completed, and the builder waited on it for an hour, holding every
 *  later train). A completed run that was cancelled closes the train `stale` (nothing failed, so no bisect); a
 *  failure, timeout or startup failure closes it `red`. */
export function trainDisposition({ manifest, cars, ciConclusion, gate, ciRun = null, stuck = null }) {
  if (!manifest) return { close: true, outcome: "stale", why: "no manifest" };
  const moved = manifest.cars.filter((c) => { const p = cars.get(c.pr); return !p || (!p.merged_at && (String(p.head?.sha || "").toLowerCase() !== c.head || !labelNames(p.labels).includes("land") || p.state !== "open")); });
  if (moved.length) return { close: true, outcome: "stale", why: `car${moved.length > 1 ? "s" : ""} ${moved.map((c) => `#${c.pr}`).join(" ")} moved, closed or lost land` };
  if (ciConclusion && ciConclusion !== "success") return { close: true, outcome: "red", why: `CI ${ciConclusion} on the train head` };
  if (!ciConclusion && ciRun?.status === "completed") {
    if (ciRun.conclusion === "cancelled") return { close: true, outcome: "stale", why: "the CI run on the train head was cancelled before its CI check completed" };
    if (["failure", "timed_out", "startup_failure"].includes(ciRun.conclusion)) return { close: true, outcome: "red", why: `the CI run on the train head ended ${ciRun.conclusion} before its CI check completed` };
  }
  if (gate === "failure") return { close: true, outcome: "red", why: "gate failure on the train head (gen, ratchets, retest or a car row)" };
  if (gate === "success" && stuck) return stuckGreen(stuck);
  return { close: false };
}

/** Minutes a train's `gate` success may stay unarmed before the builder closes it (about two train cycles). */
export const STUCK_GREEN_MIN = 15;
/** land.yml's RETRY_MAX: immediate re-gates per head (a test pins the two equal). */
export const RETRY_MAX = 3;
const RETRY_TITLE = /^Land retry pr=(\d+) head=([0-9a-f]{40}|-) attempt=(\d{1,3})$/;

/** The highest `attempt` land.yml's `retry` dispatched for this PR at this head, from a land.yml workflow_dispatch
 *  runs page (display_title `Land retry pr=<n> head=<sha> attempt=<a>`). 0 when none; null when unreadable. Pure. */
export function retryAttempts(json, pr, head) {
  if (!Array.isArray(json?.workflow_runs)) return null;
  let max = 0;
  for (const r of json.workflow_runs) {
    const m = RETRY_TITLE.exec(String(r?.display_title || ""));
    if (m && Number(m[1]) === pr && (m[2] === head || m[2] === "-")) max = Math.max(max, Number(m[3]));
  }
  return max;
}

/** T1 (train #6382, 2026-11-24): a `gate` success that never armed. Its arm job failed on a GitHub 503 at 22:55Z, the
 *  retry budget was spent, and the open train held every later train until a person closed it at 00:27Z. Close it
 *  `stale` (no bisect: the cars stay eligible) when the success is unarmed past STUCK_GREEN_MIN, or when the tip moved
 *  after it and the head has spent RETRY_MAX re-gates (nothing re-gates it again). An armed train is GitHub's to merge.
 *  `stuck`: { armed, gateAt, now, tipAt, attempts } (times in ms; tipAt and attempts null when not read). Pure. */
export function stuckGreen({ armed, gateAt, now, tipAt = null, attempts = null }) {
  if (armed || !Number.isFinite(gateAt) || !Number.isFinite(now)) return { close: false };
  const at = new Date(gateAt).toISOString();
  const min = Math.floor((now - gateAt) / 60_000);
  if (now - gateAt > STUCK_GREEN_MIN * 60_000) return { close: true, outcome: "stale", why: `gate success at ${at} is still unarmed after ${min} min` };
  if (Number.isFinite(tipAt) && tipAt > gateAt && attempts >= RETRY_MAX) return { close: true, outcome: "stale", why: `gate success at ${at} measured an older deploy tip and its head spent the retry budget (${attempts} of ${RETRY_MAX})` };
  return { close: false };
}

/** A red close on a red tip is not the cars' red (trains #5822–#5827, 2026-11-19: four reds while the tip itself failed
 *  the eagerBytes ratchet halved the cap to 1 and ~10 green cars never rode). `tip` is merge-gate's base-row view of
 *  the train's base (tipView: the newest completed pages.yml run, else the tip gate on that sha). Only a `code-red`
 *  base turns a red into `stale`; green, platform, none and unverified keep the bisect exactly as before. Pure. */
export function redOnRedTip(d, tip) {
  if (!d?.close || d.outcome !== "red" || tip?.state !== "code-red") return d;
  return { ...d, outcome: "stale", tipRed: true, why: `${d.why}, while the deploy tip was red (${String(tip.evidence || "code-red").slice(0, 300)}): not the cars' red, no bisect` };
}

const USAGE = `usage: node tools/ci/merge-train.mjs --plan|--screen --out <file>|--build [--screen-file <file>] [--max <n>]
  --plan   print the next train from live GitHub state (cars, dropped with why, bisect cap); writes nothing but git objects
  --screen land.yml's train-screen job (read-only token): fold the next train's candidates onto the tip, run merge-gate's
           ratchetsOnMerge on each cumulative fold (PR code), write the per-car verdicts to <file>
  --screen-file  with --build: only cars that file measured green at their head ride; a missing or invalid file
           opens no train (exit 1). Without the flag the build is unscreened.
  --build  land.yml's train job: close a finished train (red or stale), else push train/<stamp> and open its PR with
           \`land\` + \`${TRAIN_LABEL}\` (needs GH_TOKEN = LAND_TOKEN so CI runs on it). One open train at a time.`;

export async function main(argv, { request = api, cwd = ROOT, log = console.log, now = Date.now(), tipCheck = runTipGate } = {}) {
  if (argv.includes("--help") || argv.includes("-h") || !(argv.includes("--plan") || argv.includes("--build") || argv.includes("--screen"))) { log(USAGE); return argv.includes("--help") || argv.includes("-h") ? 0 : 1; }
  const i = argv.indexOf("--max");
  const max = i >= 0 ? Math.max(1, Math.min(10, Number(argv[i + 1]) || TRAIN_MAX)) : TRAIN_MAX;
  const build = argv.includes("--build");
  const argOf = (k) => { const j = argv.indexOf(k); return j >= 0 ? argv[j + 1] || "" : null; };
  if (argv.includes("--screen") && !build) return screenMain({ argv, out: argOf("--out"), request, cwd, log, now, max });
  const screenFile = argOf("--screen-file");
  if (build) {
    const open = listPulls(request, "open");
    if (open.error) { log(`= merge-train error — ${open.error}`); return 1; }
    const trains = open.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX));
    for (const t of trains) {
      const m = trainManifest(t.body);
      const cars = new Map();
      for (const c of m?.cars || []) { const r = request(`pulls/${c.pr}`); if (!r.error) cars.set(c.pr, r.json); }
      const runs = request(`commits/${t.head.sha}/check-runs?check_name=CI&per_page=20`);
      const ci = (runs.json?.check_runs || []).find((r) => r.app?.slug === "github-actions");
      const ciConclusion = ci?.status === "completed" ? ci.conclusion : "";
      let ciRun = null, runNote = "";
      if (!ciConclusion) {
        const wr = request(`actions/workflows/ci.yml/runs?head_sha=${t.head.sha}&per_page=20`);
        if (wr.error) runNote = ` (its CI run could not be read: ${wr.error})`;
        else ciRun = newestRun(wr.json);
      }
      const g = gateStatus(t.head.sha, request);
      let d = trainDisposition({ manifest: m, cars, ciConclusion, gate: g.state, ciRun, stuck: g.state === "success" ? stuckInputs(t, g, request, now) : null });
      if (!d.close) { log(`= merge-train waiting — train #${t.number} is still running${runNote}`); return 0; }
      if (d.outcome === "red" && m) { // the base row's own signal, on the sha the train was built on
        const pages = readDeployTip(DEPLOY, request);
        if (!pages.error) d = redOnRedTip(d, tipView(pages, { tipSha: m.base, tipAt: null, gate: () => tipCheck({ sha: m.base, base: DEPLOY, root: cwd }) }));
        else log(`  (deploy tip unread: ${pages.error}; the red stands)`);
      }
      const body = `${t.body || ""}\n<!-- merge-train-result ${JSON.stringify({ outcome: d.outcome, why: d.why })} -->`;
      for (const [p, b] of [[`pulls/${t.number}`, { body, state: "closed" }], [`issues/${t.number}/comments`, { body: `merge-train: closed (${d.outcome}) — ${d.why}. ${d.outcome === "red" ? "The next train takes half these cars (bisect); a car alone in a red train waits for a new head." : d.tipRed ? "The tip was red on the train's base, so these cars are not suspects: the next train is rebuilt at full size once the tip is fixed." : "The next train is rebuilt from the current state."}\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_` }]]) {
        const r = request(p, { method: p.endsWith("comments") ? "POST" : "PATCH", body: b });
        if (r.error) { log(`= merge-train error — ${p}: ${r.error}`); return 1; }
      }
      request(`git/refs/heads/${t.head.ref}`, { method: "DELETE" });
      log(`= merge-train closed #${t.number} (${d.outcome}): ${d.why}`);
    }
  }
  let screen = null;
  if (build && screenFile !== null) {
    let text = null;
    try { text = fs.readFileSync(screenFile, "utf8"); } catch { /* missing: refused below */ }
    screen = readScreen(text);
    if (!screen) { log(`= merge-train error — no valid screen verdict at ${screenFile || "(no path)"} (the train-screen job failed?): no train opened`); return 1; }
    if (screen.skip) { log(`= merge-train idle — the screen skipped (${screen.skip}); the next run screens and builds`); return 0; }
  }
  const plan = await planTrain({ request, cwd, max, now, log: build ? log : () => {}, acceptFor: screen ? () => screenAccept(screen) : null });
  if (plan.error) { log(`= merge-train error — ${plan.error}`); return 1; }
  for (const d of plan.dropped) log(`  - #${d.pr}: ${d.why}`);
  const line = `cars=${plan.cars.map((c) => `#${c.pr}`).join(",") || "none"} cap=${plan.cap} tip=${plan.tip.slice(0, 12)} head=${plan.head.slice(0, 12)}`;
  if (!build) { log(`= merge-train plan — ${line}${plan.running.length ? ` (train #${plan.running.join(",")} is open: --build waits for it)` : ""}${plan.enough ? "" : " (too few cars: no train)"}`); return 0; }
  if (!plan.enough) { log(`= merge-train idle — ${line}: too few cars`); return 0; }
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").slice(0, 13);
  const ref = `${TRAIN_PREFIX}${stamp}-${plan.cars.map((c) => c.pr).join("-")}`;
  const push = gitIn(cwd)(["push", "--quiet", "origin", `${plan.head}:refs/heads/${ref}`], { timeout: 300_000 });
  if (push.status !== 0) { log(`= merge-train error — push ${ref}: ${String(push.stderr || "").trim()}`); return 1; }
  const pr = request("pulls", { method: "POST", body: { title: `merge train: ${plan.cars.map((c) => `#${c.pr}`).join(" ")}`, head: ref, base: DEPLOY, body: trainBody({ base: plan.tip, cars: plan.cars, dropped: plan.dropped }) } });
  if (pr.error) { log(`= merge-train error — open PR: ${pr.error}`); return 1; }
  const lab = request(`issues/${pr.json.number}/labels`, { method: "POST", body: { labels: ["land", TRAIN_LABEL] } });
  if (lab.error) { log(`= merge-train error — labels on #${pr.json.number}: ${lab.error}`); return 1; }
  log(`= merge-train opened #${pr.json.number} — ${line}`);
  return 0;
}

/** `--screen`: the train-screen job. Skips (writes `{skip}`) while a train is open: the build closes it first and the
 *  next run screens. `check` defaults to merge-gate's ratchetsOnMerge, `gen` to gen:check (both run the fold's own scripts). Exit 0 with a file written, 1 on an error. */
export async function screenMain({ out, request = api, cwd = ROOT, log = console.log, now = Date.now(), max = TRAIN_MAX, check = null, gen = null, clock = Date.now }) {
  if (!out) { log(USAGE); return 1; }
  const write = (j) => { fs.mkdirSync(path.dirname(path.resolve(cwd, out)), { recursive: true }); fs.writeFileSync(path.resolve(cwd, out), `${JSON.stringify(j)}\n`); };
  const open = listPulls(request, "open");
  if (open.error) { log(`= merge-train error — ${open.error}`); return 1; }
  const trains = open.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX)).map((p) => p.number);
  if (trains.length) { write({ skip: `train #${trains.join(",")} is open` }); log(`= merge-train screen skipped — train #${trains.join(",")} is open`); return 0; }
  const gate = check ? null : await import("./merge-gate.mjs");
  const ratchets = check || gate.ratchetsOnMerge;
  const prepare = gen || (gate ? ({ cwd: wt }) => {
    const r = spawnSync("npm", ["run", "-s", "gen:check"], { cwd: wt, env: gate.untrustedEnv(), encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
    const tail = `${r.stdout || ""}\n${r.stderr || ""}`.split("\n").map((l) => l.trim()).filter((l) => l && !/^>|^npm /.test(l)).slice(-2).join(" | ");
    return r.status === 0 ? { ok: true } : { ok: false, evidence: `gen:check fails on the fold: ${tail || `exit ${r.status}`}` };
  } : null);
  const verdicts = [];
  let sf = null;
  const plan = await planTrain({ request, cwd, max, now, log, acceptFor: (tip) => (sf = screenFold({ tip, cwd, check: ratchets, prepare, out: verdicts, now: clock })).accept });
  sf?.cleanup();
  if (plan.error) { log(`= merge-train error — ${plan.error}`); return 1; }
  write({ tip: plan.tip, cars: verdicts });
  for (const v of verdicts) log(`  ${v.ok ? "ok  " : "RED "} #${v.pr} ${v.head.slice(0, 8)}${v.ok ? "" : `: ${v.why}`}`);
  log(`= merge-train screen — ${verdicts.filter((v) => v.ok).length} of ${verdicts.length} car(s) green on the fold onto ${plan.tip.slice(0, 12)}; cars=${plan.cars.map((c) => `#${c.pr}`).join(",") || "none"}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No top-level await: merge-gate imports this module, and a dynamic import of it from a module still awaiting its
  // own top level never settles (the entry would wait on itself).
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.log(`= merge-train error — ${e?.stack || e}`); process.exitCode = 1; });
}
