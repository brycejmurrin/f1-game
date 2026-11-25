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
// it was built on) is itself red is `stale` too (redOnRedTip): its cars were never the suspects. One train PR is open at a time;
// the next one is built on its head meanwhile as a bare `train-next/` ref (TWO TRAINS IN FLIGHT, #6584), whose CI runs
// early on a speculative PR without `land` (SPECULATIVE CI). A car merged outside an open train closes it `stale` (#6667).
//
// ORPHANS AND THE DEFAULT LANE (#6528, 2026-11-25; Bryce ~07:00Z "1 + 2 + 4 now"): a car whose own `gate` reads success
// used to be skipped as "it arms alone". #6444 (gate success 05:20Z) lost all three arms to a moving tip, land.yml's
// retry budget was spent ("the next train re-gates"), and train #6524 then skipped it the same way: orphaned ~1h20m
// (#6451 too). Now only a PR that IS landing alone is left out: auto-merge armed, or a land run for it still queued or
// running (landRunsInFlight). Every other green `land` PR boards, so with 2 or more of them a train is the lane, and a
// lone orphan rides a 1-car train instead of waiting for a push.
//
// FRAGMENT RE-SNAP (#6528: #6522 and #6421 went red after another PR merged, js/game.js codeLines/lines over by 1–2).
// A topic branch's tests/data/ratchets.d fragment is snapped against ITS base: a touched file's ceiling is set to its
// value, so a LOOSE base ceiling is folded into the delta. Once a sibling spends that slack, the merge is over by the
// slack, though neither branch grew past its own budget. resnapTree re-snaps such a row on the fold the way
// `ratchets.mjs --update` would on the car's own branch (mergeFragment: delta += value − ceiling), bounded so that a
// genuine overage still fails: only a line-count row (AUTO_RAISE_METRICS) of a file the car itself changed, never on a
// row the fold was already over before the car, within the commit hook's own auto-raise (autoRaiseBlockReason), and
// never past the car's own growth since its merge base (the re-snapped delta ≤ that growth, i.e. the car gets back
// exactly the slack its own snap counted on). Pure git + JSON: no PR code, so the build job may run it, and verifyTrain
// re-derives it, so a train head is still a proof. Tree metrics need PR code (boot wall) or are diff-relative already
// (pin counters): the screen and the gate measure those as before.
//
// Exit: 0 done (or nothing to do), 1 usage, API or git error.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api, DEPLOY, REPO } from "./github-api.mjs";
import { readDeployTip } from "./lib/deploy-tip.mjs";
import { runTipGate, tipView } from "./lib/tip-gate.mjs";
import { applyFragments, AUTO_RAISE_METRICS, autoRaiseBlockReason, entry as ratchetEntry, fragmentName, mergeFragment, METRICS } from "../check/ratchets.mjs";
import { stableStringify } from "../check/merge-hygiene.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
/** A train PR's head branch prefix: merge-gate treats only these as trains. */
export const TRAIN_PREFIX = "train/";
/** The label the builder adds to a train PR (with `land`), so boards and the dispatcher can tell it apart. */
export const TRAIN_LABEL = "train";
/** Cars per train (Bryce: "about 5 PRs at a time"; 2026-11-18 ~19:50Z "Bigger trains 5→10"; #6528 10→12: once trains
 *  are the default lane the cap can bind, and the 41 trains since the screen (2026-11-20..25) fit a per-car red rate
 *  of about 0.105, optimum ~9 cars per shot, ~11–12 once the base-moved fragment reds are re-snapped. Note
 *  docs/notes/MERGE-TRAIN-2026-11-18.md §Cap). */
export const TRAIN_MAX = 12;
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
  const onto = Number.isInteger(j.onto) && j.onto > 0 ? { onto: j.onto } : {};
  return j.rebased === true ? { base, cars, rebased: true, ...onto } : { base, cars, ...onto };
}

/** `rebased`: a stacked train rebuilt on the tip after the train under it closed unmerged (TWO TRAINS IN FLIGHT).
 *  `onto`: the open train a SPECULATIVE stacked PR sits on (SPECULATIVE CI below); promoting it drops the field. */
export const renderManifest = ({ base, cars, rebased = false, onto = 0 }) =>
  `<!-- merge-train ${JSON.stringify({ base, cars: cars.map(({ pr, head, ref }) => ({ pr, head, ref })), ...(rebased ? { rebased: true } : {}), ...(onto ? { onto } : {}) })} -->`;

/** A closed train's recorded outcome; null when none. Pure. */
export function trainResult(body) {
  const m = RESULT_MARK.exec(String(body || ""));
  if (!m) return null;
  try { const j = JSON.parse(m[1]); return j?.outcome === "red" || j?.outcome === "stale" ? { outcome: j.outcome, why: String(j.why || "") } : null; } catch { return null; }
}

/** The train PR body: Goal, a closed Plan (the gate's plan row) with the gate-exempt `land:` item, the manifest. Pure. */
export function trainBody({ base, cars, dropped = [], rebased = false, note = "", onto = 0 }) {
  const lines = [
    "## Goal", "",
    `Merge train (docs/notes/MERGE-TRAIN-2026-11-18.md): ${cars.length} green \`land\` PR${cars.length === 1 ? "" : "s"} merged onto the deploy tip \`${base.slice(0, 12)}\` with merge commits, so one CI run and one \`gate\` land them all. Each car's own rows (hold, plan, ci, config, raise) are re-read by the gate.`, "",
    ...(note ? [note, ""] : []),
    "## Plan", "",
    ...cars.map((c) => `- [x] #${c.pr} \`${c.head.slice(0, 12)}\` merged clean${c.resnapped?.length ? ` (ratchets re-snapped on the fold: ${c.resnapped.map(resnapLine).join(", ")})` : ""}`),
    "- [ ] land: CI green on this head, then `gate` (each car's own rows) arms it", "",
  ];
  if (dropped.length) lines.push("## Not in this train", "", ...dropped.map((d) => `- #${d.pr}: ${d.why}`), "");
  lines.push("Built by `tools/ci/merge-train.mjs --build`; nobody pushes to this branch.", "", renderManifest({ base, cars, rebased, onto }));
  return lines.join("\n");
}

// ---- picking --------------------------------------------------------------------------------------------

/** Candidate cars from open PRs (pulls list rows), in landing order: `priority` first, then oldest. `solo` maps a PR
 *  number to why it is landing alone (soloLane); nothing else keeps a green car off the train. Pure. */
export function carCandidates(pulls, { exclude = new Set(), solo = new Map() } = {}) {
  const out = [], skipped = [];
  for (const p of pulls || []) {
    const n = p?.number, names = labelNames(p?.labels), head = String(p?.head?.sha || "").toLowerCase(), ref = String(p?.head?.ref || "");
    if (!names.includes("land")) continue;
    const why = p.state !== "open" ? "not open" : p.draft ? "draft" : names.includes("hold") ? "hold" : ref.startsWith(TRAIN_PREFIX) ? "a train itself"
      : p.head?.repo?.full_name && p.base?.repo?.full_name && p.head.repo.full_name !== p.base.repo.full_name ? "a fork"
      : p.base?.ref && p.base.ref !== DEPLOY ? `base is ${p.base.ref}` : exclude.has(`${n}@${head}`) ? "alone in a red train at this head"
      : solo.get(n) || "";
    if (why) skipped.push({ pr: n, why }); else out.push({ pr: n, head, ref, priority: names.includes("priority"), created: String(p.created_at || "") });
  }
  out.sort((a, b) => (b.priority - a.priority) || a.created.localeCompare(b.created) || a.pr - b.pr);
  return { cars: out.map(({ pr, head, ref }) => ({ pr, head, ref })), skipped };
}

/** Land runs still queued or running for one PR (#6528), from actions/workflows/land.yml/runs pages: a
 *  pull_request_target run names its PR in `pull_requests`, a retry dispatch in its title (`Land retry pr=<n> …`),
 *  and a `workflow_run` re-gate after a PR's CI (whose `pull_requests` can be empty, and whose run-name is '') carries
 *  that PR's head as `head_sha` / `head_branch` (`heads`: [{number, head:{sha, ref}}], the landing PRs; PR #6561 review).
 *  Deploy-branch runs (sweep, Pages, schedule) name no PR and do not count, nor does `selfRun`, the run building
 *  the train. → Map(pr → run id). Pure. */
/** Pages of 100 read per run status before the builder refuses (landRunsInFlight). */
export const LAND_RUN_PAGES = 5;
export const LIVE_RUN = new Set(["queued", "in_progress", "waiting", "requested", "pending"]);
export function landRunsInFlight(pages, { selfRun = "", heads = [] } = {}) {
  const out = new Map();
  for (const page of pages || []) for (const r of page?.workflow_runs || []) {
    if (!r || !LIVE_RUN.has(String(r.status || "")) || String(r.id) === String(selfRun)) continue;
    const prs = (r.pull_requests || []).map((p) => Number(p?.number)).filter(Number.isInteger);
    const m = /^Land retry pr=(\d+)\b/.exec(String(r.display_title || ""));
    if (m) prs.push(Number(m[1]));
    const sha = String(r.head_sha || "").toLowerCase(), branch = String(r.head_branch || "");
    for (const p of heads) {
      const h = String(p?.head?.sha || "").toLowerCase(), ref = String(p?.head?.ref || "");
      if ((h && h === sha) || (ref && branch !== DEPLOY && ref === branch)) prs.push(p.number);
    }
    for (const n of prs) if (!out.has(n)) out.set(n, r.id);
  }
  return out;
}

/** Which green `land` PRs are landing alone (#6528) → Map(pr → why). Armed (auto-merge on): GitHub merges it. Gate
 *  success with a land run still in flight: that run may arm it, unless `trainOpen` (a train is in flight:
 *  trainInFlight): land.yml post then answers "waiting — train #N" and arms only a `deploy:red` fixer, so the PR stays a car
 *  (trains as default, 2026-11-25). Gate success, unarmed, no run: an ORPHAN (its arms lost to the tip, the retry
 *  budget is spent) and a train candidate, never "arms alone". Pure. */
const FIXER_LABEL = "deploy:red"; // merge-gate FIXER_LABEL (imported lazily there, so not imported here)
// `tipRed` (#6686 finding 4): post exempts only the red-tip fixer (its base row passed as the fixer), so a `deploy:red`
// label counts here only while the deploy tip is red; a stale label on a green tip boards like any car.
export function soloLane(landing, { gate = () => "", runs = new Map(), trainOpen = false, tipRed = true } = {}) {
  const solo = new Map(), orphans = new Set();
  for (const p of landing || []) {
    const n = p?.number;
    if (p?.auto_merge) { solo.set(n, "armed: auto-merge is on (it lands alone)"); continue; }
    if (gate(p) !== "success") continue;
    if (runs.has(n) && trainOpen && !(tipRed && labelNames(p.labels).includes(FIXER_LABEL))) continue;
    if (runs.has(n)) solo.set(n, `its own gate passed and land run ${runs.get(n)} is still in flight (it may arm alone)`);
    else orphans.add(n);
  }
  return { solo, orphans };
}

/** A train in flight, as land.yml's post, retry and sweep count one (#6686 finding 4): an open, ready `train/` PR of
 *  this repository with `train` + `land` and no `hold`. A draft, held, unlabelled or fork `train/` PR, and a
 *  speculative stacked PR (no `land`), are not. Pure. */
export function trainInFlight(p) {
  const names = labelNames(p?.labels);
  return p?.state === "open" && !p.draft && String(p.head?.ref || "").startsWith(TRAIN_PREFIX)
    && !(p.head?.repo?.full_name && p.base?.repo?.full_name && p.head.repo.full_name !== p.base.repo.full_name)
    && names.includes(TRAIN_LABEL) && names.includes("land") && !names.includes("hold");
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
  // A stale train ends the previous bisection. Keep exclusions tied to proven red car heads. A REBASED train (a stacked
  // train rebuilt on the tip after the one under it closed: none of its cars were suspects) that merges does not end it:
  // the train after it still takes half the red train's cars.
  const last = recent.find((t) => ["red", "stale"].includes(t.outcome) || (t.outcome === "merged" && !t.rebased));
  const cap = last?.outcome === "red" ? Math.max(1, Math.floor(last.cars.length / 2)) : max;
  return { cap: Math.min(cap, max), exclude };
}

// ---- git: fold and verify -------------------------------------------------------------------------------

/** The commit message of one car's merge, as GitHub writes it. Pure. */
export const carMessage = (c, owner = REPO.split("/")[0]) => `Merge pull request #${c.pr} from ${owner}/${c.ref || `pr-${c.pr}`}\n\nmerge-train car #${c.pr}`;

// ---- ratchet fragment re-snap (#6528; FRAGMENT RE-SNAP in the header) ------------------------------------

export const RATCHETS_JSON = "tests/data/ratchets.json";
export const FRAG_DIR_REL = "tests/data/ratchets.d";
const resnapLine = (r) => `${r.file} ${r.metric} ${r.over > 0 ? "+" : ""}${r.over}`;

/** One over row on the fold after a car's merge → { ok, why }. `over` = value − effective ceiling on the fold,
 *  `parentOver` = the same row before this car, `own` = the car's own growth of the row since its merge base (null:
 *  unmeasurable), `delta` = what the car's fragment already carries for it, `baseSlack` = ceiling − value of the row at
 *  the car's merge base (the room its own snap counted on), `slackMax` = the entry's slack rule. The room is
 *  min(own − delta, baseSlack): own − delta past baseSlack means the car was over its own ceiling at its head. Pure. */
export function resnapVerdict({ file, metric, over, parentOver = 0, own, delta = 0, baseSlack, slackMax }) {
  if (!(over > 0)) return { ok: false, why: "not over" };
  if (parentOver > 0) return { ok: false, why: `the fold was already over by ${parentOver} before this car: not its overage` };
  const hook = autoRaiseBlockReason({ file, metric, over, slackMax, tree: false });
  if (hook) return { ok: false, why: hook };
  if (!Number.isFinite(own) || !Number.isFinite(baseSlack)) return { ok: false, why: "its own growth since its merge base is unmeasurable" };
  const room = Math.max(0, Math.min(own - delta, baseSlack));
  if (over > room) return { ok: false, why: `over by ${over}, but the car grows it by ${own} since its merge base (slack ${baseSlack} there) and its fragment carries ${delta}: growth past its own budget` };
  return { ok: true, why: "" };
}

/** Re-snap `car`'s fragment on `tree` (the clean merge of the car onto `parent`). Writes only git objects (a blob and
 *  a tree, through a private index file). Deterministic in its inputs, so verifyTrain re-derives it.
 *  → { tree, resnapped: [{file, metric, over}], refused: [{file, metric, over, why}] }. */
export function resnapTree({ tree, parent, car, base, git }) {
  const out = { tree, resnapped: [], refused: [] };
  const name = fragmentName(car?.ref || "");
  if (!name) return out;
  const blob = (rev, p) => { const r = git(["cat-file", "blob", `${rev}:${p}`], { maxBuffer: 64 << 20 }); return r.status === 0 ? r.stdout : null; };
  const effective = (rev) => {
    const raw = blob(rev, RATCHETS_JSON);
    if (raw === null) return null;
    const ls = git(["ls-tree", "--name-only", `${rev}:${FRAG_DIR_REL}`]);
    const frags = (ls.status === 0 ? ls.stdout.split("\n").filter((f) => f.endsWith(".json")).sort() : [])
      .map((f) => ({ name: f, data: JSON.parse(blob(rev, `${FRAG_DIR_REL}/${f}`) || "{}") }));
    return { data: applyFragments(JSON.parse(raw), frags), frag: frags.find((f) => f.name === name)?.data || null };
  };
  const mbR = git(["merge-base", car.head, base]);
  if (mbR.status !== 0) return out;
  const mb = mbR.stdout.trim();
  const touched = new Set(git(["diff", "--name-only", "--no-renames", mb, car.head]).stdout.split("\n").filter(Boolean));
  let now, before, atMb;
  try { now = effective(tree); before = effective(parent); atMb = effective(mb); } catch { return out; }
  if (!now) return out;
  const measure = (rev, file, metric) => { const t = blob(rev, file); return t === null ? null : METRICS[metric](file, t); };
  const rows = [];
  try {
    for (const [file, metrics] of Object.entries(now.data.files || {})) {
      if (!touched.has(file)) continue;
      for (const [metric, raw] of Object.entries(metrics)) {
        if (!AUTO_RAISE_METRICS.has(metric)) continue;
        const value = measure(tree, file, metric);
        if (value === null) continue;
        const { ceiling, slackMax } = ratchetEntry(raw, `${file} ${metric}`);
        const over = value - ceiling;
        if (over <= 0) continue;
        const pRaw = before?.data.files?.[file]?.[metric], pValue = measure(parent, file, metric);
        const parentOver = pRaw === undefined || pValue === null ? 0 : Math.max(0, pValue - ratchetEntry(pRaw, file).ceiling);
        const atHead = measure(car.head, file, metric), atBase = measure(mb, file, metric);
        const own = atHead === null ? null : atHead - (atBase ?? 0);
        const mbRaw = atMb?.data.files?.[file]?.[metric];
        const baseSlack = mbRaw === undefined || atBase === null ? 0 : ratchetEntry(mbRaw, file).ceiling - atBase;
        const delta = now.frag?.files?.[file]?.[metric] || 0;
        const v = resnapVerdict({ file, metric, over, parentOver, own, delta, baseSlack, slackMax });
        if (v.ok) rows.push({ file, metric, value, ceiling, over });
        else out.refused.push({ file, metric, over, why: v.why });
      }
    }
  } catch { return { tree, resnapped: [], refused: [] }; /* a malformed ceiling: no re-snap; the screen and gate judge it */ }
  if (!rows.length) return out;
  const frag = mergeFragment(JSON.parse(JSON.stringify(now.frag || {})), rows);
  const empty = !Object.keys(frag.files || {}).length && !Object.keys(frag.tree || {}).length;
  const fpath = `${FRAG_DIR_REL}/${name}`;
  const gd = git(["rev-parse", "--absolute-git-dir"]);
  if (gd.status !== 0) return out;
  const env = { ...process.env, GIT_INDEX_FILE: path.join(gd.stdout.trim(), `apex-resnap-${process.pid}.index`) };
  try {
    if (git(["read-tree", tree], { env }).status !== 0) return out;
    if (empty) { if (git(["update-index", "--force-remove", fpath], { env }).status !== 0) return out; }
    else {
      const h = git(["hash-object", "-w", "--stdin"], { input: stableStringify(frag) });
      if (h.status !== 0 || git(["update-index", "--add", "--cacheinfo", `100644,${h.stdout.trim()},${fpath}`], { env }).status !== 0) return out;
    }
    const wt = git(["write-tree"], { env });
    if (wt.status !== 0) return out;
    return { tree: wt.stdout.trim(), resnapped: rows.map(({ file, metric, over }) => ({ file, metric, over })), refused: out.refused };
  } finally { fs.rmSync(env.GIT_INDEX_FILE, { force: true }); }
}

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
    // A stale line-count fragment is re-snapped on the fold before the screen measures it (resnapTree).
    const rs = resnapTree({ tree: String(mt.stdout).split("\n")[0].trim(), parent: cur, car: c, base, git });
    const tree = rs.tree;
    // The screen (screenFold on the tokenless screen job, screenAccept on the build): a car whose merge turns the fold
    // red is left out and the fold stays where it was, so the next car is measured without it.
    const a = accept ? accept({ car: c, tree, parent: cur, kept: kept.length }) : { ok: true };
    if (!a?.ok) { dropped.push({ pr: c.pr, why: String(a?.why || "refused by the screen") }); continue; }
    const msg = carMessage(c) + (rs.resnapped.length ? `\n\nratchets re-snapped on the fold: ${rs.resnapped.map(resnapLine).join(", ")}` : "");
    const ct = git(["commit-tree", tree, "-p", cur, "-p", c.head, "-m", msg], { env: cenv });
    if (ct.status !== 0) return { error: `commit-tree for #${c.pr} failed: ${String(ct.stderr || "").trim()}` };
    cur = ct.stdout.trim();
    kept.push(rs.resnapped.length ? { ...c, resnapped: rs.resnapped } : c);
  }
  return { head: cur, cars: kept, dropped };
}

/** The gate's purity check: `head` is exactly the fold of `cars` onto `base` (each tree the clean merge of its parents,
 *  re-snapped by resnapTree exactly as the build does), and `base` is on `tip`. git only. */
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
    if (mt.status !== 0 || resnapTree({ tree: mt.stdout.split("\n")[0].trim(), parent: p1, car: cars[i], base, git }).tree !== tree) return { ok: false, why: `commit ${sha.slice(0, 8)} (#${cars[i].pr}) is not the clean merge of its parents` };
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
export const SCREEN_BUDGET_MS = 16 * 60_000;   // 12 until #6528: the 9-car screen of 2026-11-25 01:37Z took 653 s (~70 s a car); TRAIN_MAX 12 needs ~14 min
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
  let stack = null;
  if (j.stack != null) {
    const pr = Number(j.stack?.pr), head = String(j.stack?.head || "").toLowerCase();
    if (!Number.isInteger(pr) || pr < 1 || head !== tip) return null;
    stack = { pr, head };
  }
  const cars = [];
  for (const c of j.cars) {
    const pr = Number(c?.pr), head = String(c?.head || "").toLowerCase();
    if (!Number.isInteger(pr) || pr < 1 || !SHA.test(head) || typeof c.ok !== "boolean") return null;
    cars.push({ pr, head, ok: c.ok, why: plainWhy(c.why) });
  }
  return stack ? { tip, skip: "", cars, stack } : { tip, skip: "", cars };
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
export function screenFold({ tip, cwd = ROOT, git = gitIn(cwd), check, prepare = null, out = [], now = Date.now, budgetMs = SCREEN_BUDGET_MS, fsx = fs, retest = null }) {
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
  const accept = ({ car, tree, kept = 0 }) => {
    const record = (ok, why) => { out.push({ pr: car.pr, head: car.head, ok, why: plainWhy(why) }); return { ok, why }; };
    if (now() - started > budgetMs) return { ok: false, why: "not screened (screen time budget spent)" };
    // The car cap by retest seconds (retestBudget), before the ratchets: a car it refuses costs no screen time.
    const rb = retest ? retest({ tree, kept }) : null;
    if (rb && !rb.ok) return record(false, rb.why);
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

/* CAR CAP BY RETEST SECONDS (#6686 finding 5; #6610, #6538 and #6662 refused retest=FAIL retest-broad, ~458 s, at
 * 18:26–18:30Z 2026-11-25). A train whose retest row refuses for breadth closes `stale` and is rebuilt from the same
 * cars, so a fold too broad to re-test could loop. The screen now stops adding cars once the fold's own retest bound
 * (merge-gate retestBound: the gate's own selection and committed timings, the tip side read as reaching everything)
 * passes the gate's own refusal line (RETEST_REFUSE_MS, 336 s). No new number: the line is the gate's. The first car
 * always rides (a 1-car train re-tests no more than that PR would alone); a refused car rides a later train. */

/** The screen's retest budget for folds onto `base`: `bound(paths)` → { ms, files, how } | { error }; `limitMs` the
 *  gate's line. Every doubt (a diff or bound that cannot be read or throws, no estimate) accepts: the train's own retest row
 *  still measures it, as before. → ({ tree, kept }) → { ok, why?, ms? }. */
export function retestBudget({ base, cwd = ROOT, git = gitIn(cwd), bound, limitMs, log = () => {} }) {
  return ({ tree, kept = 0 }) => {
    if (!kept) return { ok: true };
    const d = git(["diff", "--name-only", base, tree]);
    if (d.status !== 0) return { ok: true };
    let b;
    // A throw (an unreadable timings file, say) must not fail the screen job and stop every train (#6692 finding 4).
    try { b = bound(String(d.stdout || "").split("\n").map((l) => l.trim()).filter(Boolean)); } catch (e) {
      log(`  (retest bound threw: ${String(e?.message || e).split("\n")[0]}; the car is accepted and the gate's retest row still measures it)`);
      return { ok: true, ms: null };
    }
    if (!b || b.error || !Number.isFinite(b.ms) || b.ms <= limitMs) return { ok: true, ms: b?.ms ?? null };
    return { ok: false, ms: b.ms, why: `retest bound ~${Math.round(b.ms / 1000)} s with this car (${b.files.length} unit file(s), ${b.how}), over the gate's ${Math.round(limitMs / 1000)} s line: it rides a later train` };
  };
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
  return { state: g?.state || "", at: Date.parse(g?.created_at || ""), why: String(g?.description || "") };
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

/** The next train from live state. Reads GitHub and fetches car heads into `cwd`; writes only git objects. `onto`: the
 *  open train to stack on ({ number, head: { sha }, body }): the fold's base is its head and its cars are left out
 *  (TWO TRAINS IN FLIGHT); null folds onto the deploy tip as before. */
export async function planTrain({ request = api, cwd = ROOT, max = TRAIN_MAX, now = Date.now(), log = () => {}, acceptFor = null, onto = null, carGate = null } = {}) {
  const { evaluate } = await import("./merge-gate.mjs");
  const gateOf = carGate || ((pr, sha) => evaluate({ pr, sha, request, trusted: true }));
  const open = listPulls(request, "open");
  if (open.error) return { error: `open PRs: ${open.error}` };
  const running = open.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX) && !isStackPr(p));
  const closed = listPulls(request, "closed");
  if (closed.error) return { error: `closed PRs: ${closed.error}` };
  // A speculative stacked PR closed unpromoted never ran as a train: it neither ends nor feeds a bisect.
  const past = closed.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX) && p.closed_at && !isStackPr(p)).map((p) => {
    const m = trainManifest(p.body);
    return m && { cars: m.cars, closed: p.closed_at, rebased: Boolean(m.rebased), outcome: p.merged_at ? "merged" : trainResult(p.body)?.outcome || "red" };
  }).filter(Boolean);
  const hist = trainHistory(past, { now, max });
  const landing = open.rows.filter((p) => labelNames(p.labels).includes("land") && !p.draft);
  const pages = [];
  // Every page: a truncated list would read a mid-arm PR as an orphan (PR #6561 review), so a full last page refuses.
  for (const st of ["queued", "in_progress", "waiting"]) {
    for (let page = 1; ; page++) {
      const r = request(`actions/workflows/land.yml/runs?status=${st}&per_page=100&page=${page}`);
      if (r.error) return { error: `land runs (${st}): ${r.error}` };
      pages.push(r.json);
      if ((r.json?.workflow_runs || []).length < 100) break;
      if (page === LAND_RUN_PAGES) return { error: `land runs (${st}): more than ${LAND_RUN_PAGES * 100}, refusing to judge orphans on a partial list` };
    }
  }
  // The fixer exemption needs a red tip (soloLane `tipRed`): read only when a landing PR carries the label; an
  // unreadable tip keeps the exemption (as before).
  const tipRed = landing.some((p) => labelNames(p.labels).includes(FIXER_LABEL)) ? (() => { const t = readDeployTip(DEPLOY, request); return Boolean(t.error) || t.state === "code-red"; })() : false;
  const trainOpen = open.rows.some(trainInFlight);
  const { solo, orphans } = soloLane(landing, { gate: (p) => gateState(p.head.sha, request), runs: landRunsInFlight(pages, { selfRun: process.env.GITHUB_RUN_ID || "", heads: landing }), trainOpen, tipRed });
  const { cars: all, skipped } = carCandidates(open.rows, { exclude: hist.exclude, solo });
  const under = new Set((onto ? trainManifest(onto.body)?.cars || [] : []).map((c) => c.pr));
  const cands = all.filter((c) => !under.has(c.pr));
  for (const c of all) if (under.has(c.pr)) skipped.push({ pr: c.pr, why: `rides train #${onto.number}, the one this train is stacked on` });
  const tipR = request(`branches/${encodeURIComponent(DEPLOY)}`);
  const tip = String(tipR.json?.commit?.sha || "").toLowerCase();
  if (!tip) return { error: `deploy tip: ${tipR.error || "no sha"}` };
  const git = gitIn(cwd);
  const f = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/heads/${DEPLOY}:refs/remotes/origin/${DEPLOY}`]);
  if (f.status !== 0) return { error: `fetch ${DEPLOY}: ${String(f.stderr || "").trim()}` };
  const base = onto ? String(onto.head?.sha || "").toLowerCase() : tip;
  if (onto) {
    if (!SHA.test(base) || !under.size) return { error: `train #${onto.number}: no head or no manifest to stack on` };
    const fo = git(["fetch", "--quiet", "--no-tags", "origin", `+refs/pull/${onto.number}/head:refs/remotes/origin/pr/${onto.number}`]);
    if (fo.status !== 0 || git(["cat-file", "-e", `${base}^{commit}`]).status !== 0) return { error: `fetch train #${onto.number}: ${String(fo.stderr || "").trim() || "head not fetched"}` };
  }
  const ready = [];
  for (const c of cands) {
    if (ready.length >= hist.cap * 2) break; // enough spares for conflicts
    const v = carVerdict(gateOf(c.pr, c.head), c.head);
    log(`car #${c.pr} ${c.head.slice(0, 8)}: ${v.ok ? "ok" : v.why}`);
    if (!v.ok) { skipped.push({ pr: c.pr, why: v.why }); continue; }
    git(["fetch", "--quiet", "--no-tags", "origin", `+refs/pull/${c.pr}/head:refs/remotes/origin/pr/${c.pr}`]);
    ready.push(c);
  }
  const fold = foldCars({ base, cars: ready, cwd, git, max: hist.cap, accept: acceptFor ? acceptFor(base) : null });
  if (fold.error) return { error: fold.error };
  // A lone ORPHAN (green gate, unarmed, no land run: soloLane) rides a 1-car train; nothing else would land it (#6528).
  const min = hist.cap >= 2 ? 2 : 1;
  const enough = fold.cars.length >= min || (fold.cars.length === 1 && orphans.has(fold.cars[0].pr));
  return { tip, base, cap: hist.cap, running: running.map((p) => p.number), cars: fold.cars, head: fold.head, dropped: [...fold.dropped, ...skipped], enough };
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
 *  failure, timeout or startup failure closes it `red`.
 *  #6667 (train #6580 sat ~6 h, 2026-11-25): a car that MERGED outside the train (on its own, or in another train)
 *  closes it `stale` too: the train's merge result grows with every later tip move, so each re-gate re-tests more
 *  until the retest row refuses for breadth. Its other cars ride the next fold onto the tip. So does a `gate` failure
 *  whose only refused row is a retest too broad to run (`gateWhy` carries merge-gate's RETEST_BROAD word): a base too
 *  old to re-test is not the cars' red, and re-gating it can only grow the breadth. */
export function trainDisposition({ manifest, cars, ciConclusion, gate, ciRun = null, stuck = null, gateWhy = "" }) {
  if (!manifest) return { close: true, outcome: "stale", why: "no manifest" };
  const moved = manifest.cars.filter((c) => { const p = cars.get(c.pr); return !p || (!p.merged_at && (String(p.head?.sha || "").toLowerCase() !== c.head || !labelNames(p.labels).includes("land") || p.state !== "open")); });
  if (moved.length) return { close: true, outcome: "stale", why: `car${moved.length > 1 ? "s" : ""} ${moved.map((c) => `#${c.pr}`).join(" ")} moved, closed or lost land` };
  const merged = manifest.cars.filter((c) => cars.get(c.pr)?.merged_at);
  if (merged.length) return { close: true, outcome: "stale", why: `car${merged.length > 1 ? "s" : ""} ${merged.map((c) => `#${c.pr}`).join(" ")} merged outside the train: the rest ride the next fold onto the tip`, outside: true };
  if (ciConclusion && ciConclusion !== "success") return { close: true, outcome: "red", why: `CI ${ciConclusion} on the train head` };
  if (!ciConclusion && ciRun?.status === "completed") {
    if (ciRun.conclusion === "cancelled") return { close: true, outcome: "stale", why: "the CI run on the train head was cancelled before its CI check completed" };
    if (["failure", "timed_out", "startup_failure"].includes(ciRun.conclusion)) return { close: true, outcome: "red", why: `the CI run on the train head ended ${ciRun.conclusion} before its CI check completed` };
  }
  if (gate === "failure" && broadRetest(gateWhy)) return { close: true, outcome: "stale", why: "the gate refused only its retest row, as too broad to re-test (a base too old): no bisect, the cars ride the next fold onto the tip" };
  if (gate === "failure") return { close: true, outcome: "red", why: "gate failure on the train head (gen, ratchets, retest or a car row)" };
  if (gate === "success" && stuck) return stuckGreen(stuck);
  return { close: false };
}

/** The word merge-gate's summary line (rowLines) carries when its retest row refused for breadth alone (#6667). */
export const RETEST_BROAD = "retest-broad";
/** A `gate` description (merge-gate's summary line, as land.yml posts it) refusing ONLY the retest row, for breadth:
 *  `retest=FAIL` and RETEST_BROAD, and no other `<row>=FAIL` or `=WAIT`. Pure. */
export function broadRetest(desc) {
  const d = String(desc || "");
  if (!d.startsWith("= merge-gate refused — ")) return false;
  const words = d.split(/\s+/);
  const bad = words.filter((w) => /^[a-z]+=(?:FAIL|WAIT)$/.test(w));
  return words.includes(RETEST_BROAD) && bad.length === 1 && bad[0] === "retest=FAIL";
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

// ---- two trains in flight (#6584) ------------------------------------------------------------------------

/* WHY (#6584; Bryce ~10:15Z 2026-11-25 "Two trains in flight", from the orchestrator's 49 h throughput study): the serial
 * merge is the bottleneck, not runners. With one train open at a time the next one was screened (~70 s a car) and
 * built only after the last one merged and Pages went green, so a cycle was CI + gate + arm + Pages + screen + build.
 * Now, while train N runs, the screen folds the next candidates (none of N's cars) onto N's HEAD and the build pushes
 * that fold as a bare ref `train-next/<N's head>-<cars>`. A bare ref, not a PR: ci.yml has no push trigger, so N+1
 * runs no CI and holds no runner, and land.yml still sees ONE open train (resolve, T3 and the retry budget are
 * unchanged). Its manifest is the fold itself (readStack: one merge-train car commit per car on the first-parent line
 * down to N's head), so nothing else has to be stored. On a later build:
 *   N still running, N+1 intact              → wait;
 *   N still running, an N+1 car moved/held   → restack the rest on N's head (the moved car rides a later train);
 *   N merged (its head is on the tip)        → promote: open N+1's `train/*` PR from the very fold. Its base, N's head,
 *                                              is on the deploy branch, so the gate's verifyTrain proves it as usual;
 *   N red, stale or closed (head not on tip) → rebase: refold N+1's cars, without N's, on the tip and open that,
 *                                              marked `rebased` so its merge keeps N's bisect for the train after it.
 * Merges stay in order: N+1 has no PR, so no CI, gate or arm, until N has merged or closed. */

/** The ref prefix of a stacked train (no PR, no CI). */
export const STACK_PREFIX = "train-next/";
const STACK_REF = /^(?:refs\/heads\/)?train-next\/([0-9a-f]{40})-(\d+(?:-\d+)*)$/;
/** The stacked train's ref: its base (the open train's head) and its cars in order. Pure. */
export const stackRef = (base, cars) => `${STACK_PREFIX}${base}-${cars.map((c) => c.pr).join("-")}`;
/** → { ref, base, prs } or null. Pure. */
export function parseStackRef(ref) {
  const m = STACK_REF.exec(String(ref || ""));
  return m ? { ref: String(ref).replace(/^refs\/heads\//, ""), base: m[1], prs: m[2].split("-").map(Number) } : null;
}

/** The stacked train's manifest, read back from its fold: the first-parent chain from `head` down to `base`, each a
 *  two-parent `merge-train car #<n>` commit for the next car its ref names. `refOf(pr)` is the car's branch (resnapTree
 *  needs it). → { base, head, cars } or { error }. git only. */
export function readStack({ base, head, prs, refOf = () => "", git }) {
  const rl = git(["rev-list", "--first-parent", "--parents", head, `^${base}`]);
  if (rl.status !== 0) return { error: `rev-list failed: ${String(rl.stderr || "").trim().split("\n")[0]}` };
  const chain = rl.stdout.trim().split("\n").filter(Boolean).map((l) => l.split(" ")).reverse();
  if (chain.length !== prs.length) return { error: `${chain.length} commit(s) past its base, its ref names ${prs.length} car(s)` };
  const cars = [];
  let prev = base;
  for (let i = 0; i < chain.length; i++) {
    const [sha, p1, p2, extra] = chain[i];
    const msg = String(git(["log", "-1", "--format=%B", sha]).stdout || "");
    if (p1 !== prev || !p2 || extra || !new RegExp(`^merge-train car #${prs[i]}$`, "m").test(msg)) return { error: `commit ${sha.slice(0, 8)} is not the merge-train car #${prs[i]} onto ${prev.slice(0, 8)}` };
    cars.push({ pr: prs[i], head: p2, ref: String(refOf(prs[i]) || "") });
    prev = sha;
  }
  return { base, head, cars };
}

/** What the build does with a stacked train (the table in the WHY above). `stack` { base, cars }; `running` the open
 *  train still running, null when none; `onTip` whether `stack.base` is on the deploy branch (the train under it
 *  merged); `cars` Map(pr → pulls/<n> row); `bad` Map(pr → why) for cars whose own trusted rows fail (read only when
 *  no train runs). → { act: "wait" | "restack" | "drop" | "promote" | "rebase", keep, why }. Pure. */
export function stackPlan({ stack, running, onTip, cars, bad = new Map() }) {
  const off = (c) => {
    const p = cars.get(c.pr);
    if (!p) return "unreadable";
    // #6667: a car merged on its own leaves the stack (a train holding it would close stale at once); an empty stack drops.
    if (p.merged_at) return "merged outside the train";
    const names = labelNames(p.labels), now = String(p.head?.sha || "").toLowerCase();
    return p.state !== "open" ? "closed" : now !== c.head ? `head moved to ${now.slice(0, 8)}` : !names.includes("land") ? "lost land"
      : names.includes("hold") ? "hold" : bad.get(c.pr) || "";
  };
  const out = [], keep = [];
  for (const c of stack.cars) { const w = off(c); if (w) out.push(`#${c.pr} ${w}`); else keep.push(c); }
  if (running) {
    const head = String(running.head?.sha || "").toLowerCase();
    if (head !== stack.base) return { act: "drop", keep: [], why: `its base ${stack.base.slice(0, 8)} is not the head of open train #${running.number}` };
    if (!out.length) return { act: "wait", keep, why: `stacked on train #${running.number}, still running` };
    return { act: keep.length ? "restack" : "drop", keep, why: out.join(", ") };
  }
  if (onTip && !out.length) return { act: "promote", keep, why: "the train under it merged" };
  if (!keep.length) return { act: "drop", keep, why: out.join(", ") || "no car left" };
  return { act: "rebase", keep, why: onTip ? `the train under it merged, but ${out.join(", ")}` : `the train under it closed unmerged (red, stale or by hand)${out.length ? `; ${out.join(", ")}` : ""}` };
}

/** Push `head` as train/<stamp>-<cars> and open its PR with `land` + `train`; with `onto`, the SPECULATIVE stacked PR
 *  (train/<stamp>-<cars>-on<N>, `train` only, no `land`). → { number, ref } or { error }. */
function openTrain({ request, cwd, now, head, base, cars, dropped = [], rebased = false, note = "", onto = 0 }) {
  const stamp = new Date(now).toISOString().replace(/[-:]/g, "").slice(0, 13);
  const ref = `${TRAIN_PREFIX}${stamp}-${cars.map((c) => c.pr).join("-")}${onto ? `-on${onto}` : ""}`;
  const push = gitIn(cwd)(["push", "--quiet", "origin", `${head}:refs/heads/${ref}`], { timeout: 300_000 });
  if (push.status !== 0) return { error: `push ${ref}: ${String(push.stderr || "").trim()}` };
  const title = `merge train${onto ? ` (stacked on #${onto}, CI only until it merges)` : ""}: ${cars.map((c) => `#${c.pr}`).join(" ")}`;
  const pr = request("pulls", { method: "POST", body: { title, head: ref, base: DEPLOY, body: trainBody({ base, cars, dropped, rebased, note, onto }) } });
  if (pr.error) return { error: `open PR: ${pr.error}` };
  const lab = request(`issues/${pr.json.number}/labels`, { method: "POST", body: { labels: onto ? [TRAIN_LABEL] : ["land", TRAIN_LABEL] } });
  if (lab.error) return { error: `labels on #${pr.json.number}: ${lab.error}` };
  return { number: pr.json.number, ref };
}

/* SPECULATIVE CI (#6584 follow-up; Bryce ~17:45Z 2026-11-25 "Yes, one PR"). The bare stacked ref ran no CI, so the two
 * trains overlapped only the screen and build, and a promoted N+1 then waited a whole CI run (~16 min median) on its
 * new PR. Now the build also opens the stack as a PR of its own: the same fold commit on a `train/…-on<N>` branch,
 * manifest `onto: N`, label `train` and NO `land`. Without `land` it is not a train to land.yml (resolve, the arm, the
 * sweep and the boarded-car reads all need `train` + `land`), nor to this builder (isStackPr), nor to the bisect
 * history; it only gets `pull_request` CI, the same full tier a train PR gets, on the same commit. PROMOTE (N merged,
 * the stack unchanged) adds `land` to THAT PR and rewrites its body without `onto`: no new PR, no new CI run. The gate
 * is unchanged: its ci row reads this PR's own CI on this very head, verifyTrain proves the fold onto N's head (now on
 * the tip), every car's own rows are re-read, and the retest row re-tests the tip merges since that run unless the
 * run's recorded merge tree is the gate's own merge tree byte for byte (merge-gate retestOnMerge). Restack, rebase and
 * drop close the speculative PR and delete its branch. COST: at most one run per stacked ref (opened once, never
 * pushed to), none while N is red (trainRedNow, read before it opens; unreadable counts as red), and on the merged
 * path none extra: it is the run the promoted PR would have started anyway. A stack closed after its run started
 * wastes that one run (~117 runner-min, THROUGHPUT 2026-11-25). TRUST: the same LAND_TOKEN PR open as a train's; no
 * job runs PR code with a write token or a secret. */

/** A speculative stacked PR: a `train/` head, a manifest with `onto`, no `land`. Pure. */
export function isStackPr(p) {
  return String(p?.head?.ref || "").startsWith(TRAIN_PREFIX) && !labelNames(p?.labels).includes("land") && Boolean(trainManifest(p?.body)?.onto);
}

/** Train N is red, or may be, right now: its CI check-run or newest ci.yml run ended other than success, a job of
 *  that run already failed, or a read failed. A speculative run is opened only when this is false. */
function trainRedNow(request, t) {
  const sha = String(t?.head?.sha || "").toLowerCase();
  const runs = request(`commits/${sha}/check-runs?check_name=CI&per_page=20`);
  if (runs.error) return `its CI check is unreadable (${runs.error})`;
  const ci = (runs.json?.check_runs || []).find((r) => r.app?.slug === "github-actions");
  if (ci?.status === "completed") return ci.conclusion === "success" ? "" : `CI ${ci.conclusion}`;
  const wr = request(`actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`);
  if (wr.error) return `its CI run is unreadable (${wr.error})`;
  const list = (wr.json?.workflow_runs || []).filter((r) => r && Number.isFinite(Number(r.id)));
  if (!list.length) return "";
  const run = list.reduce((a, b) => (Number(b.id) > Number(a.id) ? b : a));
  if (run.status === "completed" && run.conclusion !== "success") return `its CI run ended ${run.conclusion}`;
  const jobs = request(`actions/runs/${run.id}/jobs?per_page=100`);
  if (jobs.error) return `its CI jobs are unreadable (${jobs.error})`;
  const bad = (jobs.json?.jobs || []).filter((j) => ["failure", "timed_out", "cancelled"].includes(j?.conclusion));
  return bad.length ? `CI job ${bad[0].name} ${bad[0].conclusion}` : "";
}

/** Open the speculative PR for the stacked fold `x` ({ sha, base }) on running train `running`, unless N is red. */
function openSpec({ request, cwd, now, log, running, x, cars }) {
  const red = trainRedNow(request, running);
  if (red) { log(`  no speculative CI for the stack on #${running.number}: ${red}`); return null; }
  const note = `Two trains in flight (#6584), SPECULATIVE CI: stacked on \`${x.base.slice(0, 12)}\`, the head of open train #${running.number}. No \`land\` until #${running.number} merges; then the build adds it and this run's CI is the one the gate reads.`;
  const o = openTrain({ request, cwd, now, head: x.sha, base: x.base, cars, note, onto: running.number });
  log(o.error ? `  (speculative PR not opened: ${o.error})` : `  opened speculative #${o.number} for the stack on #${running.number}: its CI runs now`);
  return o.error ? null : o;
}

/** Close a speculative PR and delete its branch (restack, rebase, drop, or an orphan). */
function closeSpec(request, log, p, why) {
  const body = `${p.body || ""}\n<!-- merge-train-result ${JSON.stringify({ outcome: "stale", why: `speculative stack closed: ${why}` })} -->`;
  const r = request(`pulls/${p.number}`, { method: "PATCH", body: { body, state: "closed" } });
  if (r.error) { log(`  (speculative #${p.number} not closed: ${r.error})`); return; }
  const d = request(`git/refs/heads/${p.head.ref}`, { method: "DELETE" });
  log(`  closed speculative #${p.number}: ${why}${d.error ? ` (branch not deleted: ${d.error})` : ""}`);
}

/** The train/ and train-next/ branch names on the remote (`git/matching-refs`); [] when unreadable (logged). */
function listTrainRefs(request, log) {
  const out = [];
  for (const prefix of [TRAIN_PREFIX, STACK_PREFIX]) {
    const r = request(`git/matching-refs/heads/${prefix}`);
    // An unread train-next/ list is stackStep's to report (FALLBACK); either way nothing is swept this run.
    if (r.error) { if (prefix === TRAIN_PREFIX) log(`  (${prefix}* refs unread: ${r.error}; no branch sweep this run)`); return []; }
    for (const x of r.json || []) out.push(String(x?.ref || "").replace(/^refs\/heads\//, ""));
  }
  return out;
}

/** Branch cleanup (#6667 part 3; 7 closed trains' branches lingered 2026-11-19..25, one from a hand close): the
 *  train/ branches no open PR has as its head (merged, closed by the build or by hand, or a push whose PR never
 *  opened), and the train-next/ refs whose name does not parse (stackStep owns the rest). Car work is never lost: a
 *  train is a fold of car heads that live on their own branches. `open`: the open pulls rows. Pure. */
export function strayTrainRefs({ refs, open }) {
  const heads = new Set((open || []).map((p) => String(p?.head?.ref || "")));
  return (refs || []).filter((r) => (r.startsWith(TRAIN_PREFIX) && !heads.has(r)) || (r.startsWith(STACK_PREFIX) && !parseStackRef(r)));
}

/** The open stacked refs (`git/matching-refs`), parsed. → { refs } or { error }. */
function listStacks(request) {
  const r = request(`git/matching-refs/heads/${STACK_PREFIX}`);
  if (r.error) return { error: `stacked trains: ${r.error}` };
  return { refs: (r.json || []).map((x) => ({ ...parseStackRef(x?.ref), sha: String(x?.object?.sha || "").toLowerCase() })).filter((x) => x.base && SHA.test(x.sha)) };
}

/** The one line a stacking failure logs (FALLBACK). Exported for the test. */
export const stackSkipped = (why) => `= merge-train stack skipped — ${why}: one train at a time this run`;

/** The build's stacked-train step (stackPlan, then act). null: no stack is left and the build goes on as before;
 *  { code, msg }: this run is done; { degraded }: stacking failed (a refs read, a fetch, a car read), logged once, and
 *  the build goes on exactly as with ONE train at a time (FALLBACK: a LAND_TOKEN that may not create train-next/*, or
 *  any other stacking error, never fails the run, the open train or its merge). */
async function stackStep({ request, cwd, log, running, now, carGate = null, open = [] }) {
  const degraded = (why) => { log(stackSkipped(why)); return { degraded: true }; };
  const ls = listStacks(request);
  if (ls.error) return degraded(ls.error);
  const specs = open.filter(isStackPr);
  if (!ls.refs.length) { for (const p of specs) closeSpec(request, log, p, "no stacked train is left"); return null; }
  const git = gitIn(cwd);
  const del = (x) => request(`git/refs/heads/${x.ref}`, { method: "DELETE" });
  const runHead = String(running?.head?.sha || "").toLowerCase();
  const [x, ...extra] = [...ls.refs].sort((a, b) => (b.base === runHead) - (a.base === runHead) || a.ref.localeCompare(b.ref));
  for (const e of extra) { del(e); log(`  deleted ${e.ref}: one stacked train at a time`); }
  // The speculative PR of this very fold (SPECULATIVE CI); any other is an orphan.
  const spec = specs.find((p) => String(p.head?.sha || "").toLowerCase() === x.sha && trainManifest(p.body)?.base === x.base) || null;
  for (const p of specs) if (p !== spec) closeSpec(request, log, p, `its fold is not the stacked train ${x.ref}`);
  for (const spec of [`+refs/heads/${x.ref}:refs/remotes/origin/${x.ref}`, `+refs/heads/${DEPLOY}:refs/remotes/origin/${DEPLOY}`]) {
    const f = git(["fetch", "--quiet", "--no-tags", "origin", spec]);
    if (f.status !== 0) return degraded(`fetch ${spec.split(":")[0].slice(1)}: ${String(f.stderr || "").trim()}`);
  }
  const cars = new Map();
  for (const pr of x.prs) {
    const q = request(`pulls/${pr}`);
    if (q.error) return degraded(`pulls/${pr}: ${q.error}`);
    cars.set(pr, q.json);
  }
  const stack = readStack({ base: x.base, head: x.sha, prs: x.prs, refOf: (n) => cars.get(n)?.head?.ref, git });
  if (stack.error) { del(x); log(`= merge-train dropped ${x.ref}: ${stack.error}`); return null; }
  const tipR = request(`branches/${encodeURIComponent(DEPLOY)}`);
  const tip = String(tipR.json?.commit?.sha || "").toLowerCase();
  if (!tip) return degraded(`deploy tip: ${tipR.error || "no sha"}`);
  const onTip = git(["merge-base", "--is-ancestor", x.base, tip]).status === 0;
  const bad = new Map();
  if (!running) {
    const gateOf = carGate || (await import("./merge-gate.mjs").then(({ evaluate }) => (pr, sha) => evaluate({ pr, sha, request, trusted: true })));
    for (const c of stack.cars) {
      const p = cars.get(c.pr);
      if (!p || p.merged_at || String(p.head?.sha || "").toLowerCase() !== c.head) continue;
      const v = carVerdict(gateOf(c.pr, c.head), c.head);
      if (!v.ok) bad.set(c.pr, v.why);
    }
  }
  const plan = stackPlan({ stack, running, onTip, cars, bad });
  const names = (cs) => cs.map((c) => `#${c.pr}`).join(",");
  // No speculative PR is opened while waiting: one per stacked ref, at the push that made it (cost bound).
  if (plan.act === "wait") return { code: 0, msg: `= merge-train waiting — train #${running.number} is still running; ${names(stack.cars)} stacked on it (${x.ref}${spec ? `, speculative #${spec.number}` : ""})` };
  if (spec && plan.act !== "promote") closeSpec(request, log, spec, `the stack was ${plan.act === "drop" ? "dropped" : plan.act === "restack" ? "restacked" : "rebased onto the tip"} (${plan.why})`);
  if (plan.act === "drop") { del(x); log(`= merge-train dropped ${x.ref}: ${plan.why}`); return null; }
  if (plan.act === "restack") {
    const f = foldCars({ base: x.base, cars: plan.keep, cwd, git });
    if (f.error || !f.cars.length) { del(x); log(`= merge-train dropped ${x.ref}: ${f.error || "no car folds"}`); return null; }
    const ref = stackRef(x.base, f.cars);
    const push = git(["push", "--quiet", "origin", `${f.head}:refs/heads/${ref}`], { timeout: 300_000 });
    if (push.status !== 0) return { code: 0, msg: stackSkipped(`push ${ref}: ${String(push.stderr || "").trim().split("\n")[0]}`) };
    if (ref !== x.ref) del(x);
    openSpec({ request, cwd, now, log, running, x: { sha: f.head, base: x.base }, cars: f.cars });
    return { code: 0, msg: `= merge-train restacked ${names(f.cars)} on train #${running.number} (${plan.why})` };
  }
  if (plan.act === "promote" && spec) {
    // SPECULATIVE CI: the stack's own PR becomes the train. `land` first, so a failed body edit still leaves a train
    // (a `land` PR is never isStackPr); the gate then reads the CI this PR already ran on this head.
    const lab = request(`issues/${spec.number}/labels`, { method: "POST", body: { labels: ["land", TRAIN_LABEL] } });
    if (lab.error) return { code: 1, msg: `= merge-train error — labels on speculative #${spec.number}: ${lab.error}` };
    const body = `${String(spec.body || "").replace(TRAIN_MARK, renderManifest({ base: x.base, cars: stack.cars }))}\n\nPromoted by the build: the train under it merged, so \`land\` is on and the gate reads the CI this PR already ran.`;
    const ed = request(`pulls/${spec.number}`, { method: "PATCH", body: { title: `merge train: ${stack.cars.map((c) => `#${c.pr}`).join(" ")}`, body } });
    if (ed.error) log(`  (body of #${spec.number} not rewritten: ${ed.error}; its manifest still names the cars and base)`);
    del(x);
    return { code: 0, msg: `= merge-train promoted #${spec.number} — ${names(stack.cars)} (${plan.why}; its CI already ran on this head)` };
  }
  let head = x.sha, base = x.base, kept = stack.cars, dropped = [];
  if (plan.act === "rebase") {
    const f = foldCars({ base: tip, cars: plan.keep, cwd, git });
    if (f.error || !f.cars.length) { del(x); log(`= merge-train dropped ${x.ref}: ${f.error || "no car folds onto the tip"}`); return null; }
    ({ head, cars: kept, dropped } = f); base = tip;
  }
  const rebased = plan.act === "rebase" && !onTip;
  const note = plan.act === "promote"
    ? `Two trains in flight (#6584): built on \`${x.base.slice(0, 12)}\`, the head of the train before it, while that one ran CI; promoted once it merged.`
    : `Two trains in flight (#6584): stacked on \`${x.base.slice(0, 12)}\`, rebuilt on the tip because ${plan.why}.`;
  const o = openTrain({ request, cwd, now, head, base, cars: kept, dropped, rebased, note });
  if (o.error) return { code: 1, msg: `= merge-train error — ${o.error}` };
  del(x);
  return { code: 0, msg: `= merge-train opened #${o.number} — ${plan.act === "promote" ? "promoted" : rebased ? "rebased" : "rebuilt"} ${names(kept)} (${plan.why})` };
}

const USAGE = `usage: node tools/ci/merge-train.mjs --plan|--screen --out <file>|--build [--screen-file <file>] [--max <n>]
  --plan   print the next train from live GitHub state (cars, dropped with why, bisect cap); writes nothing but git objects
  --screen land.yml's train-screen job (read-only token): fold the next train's candidates onto the tip, run merge-gate's
           ratchetsOnMerge on each cumulative fold (PR code), write the per-car verdicts to <file>
  --screen-file  with --build: only cars that file measured green at their head ride; a missing or invalid file
           opens no train (exit 1). Without the flag the build is unscreened.
  --build  land.yml's train job: close a finished train (red or stale), else push train/<stamp> and open its PR with
           \`land\` + \`${TRAIN_LABEL}\` (needs GH_TOKEN = LAND_TOKEN so CI runs on it). One open train PR at a time; while
           it runs, the next is pushed as a bare train-next/ ref on its head and opened once it merges (#6584).`;

export async function main(argv, { request = api, cwd = ROOT, log = console.log, now = Date.now(), tipCheck = runTipGate, carGate = null } = {}) {
  if (argv.includes("--help") || argv.includes("-h") || !(argv.includes("--plan") || argv.includes("--build") || argv.includes("--screen"))) { log(USAGE); return argv.includes("--help") || argv.includes("-h") ? 0 : 1; }
  const i = argv.indexOf("--max");
  const max = i >= 0 ? Math.max(1, Math.min(TRAIN_MAX, Number(argv[i + 1]) || TRAIN_MAX)) : TRAIN_MAX;
  const build = argv.includes("--build");
  const argOf = (k) => { const j = argv.indexOf(k); return j >= 0 ? argv[j + 1] || "" : null; };
  if (argv.includes("--screen") && !build) return screenMain({ argv, out: argOf("--out"), request, cwd, log, now, max });
  const screenFile = argOf("--screen-file");
  let running = null, runNoteOf = "";
  if (build) {
    const open = listPulls(request, "open");
    if (open.error) { log(`= merge-train error — ${open.error}`); return 1; }
    for (const ref of strayTrainRefs({ refs: listTrainRefs(request, log), open: open.rows })) {
      const r = request(`git/refs/heads/${ref}`, { method: "DELETE" });
      log(r.error ? `  (stray ${ref} not deleted: ${r.error})` : `  deleted stray ${ref}: no open PR has it as its head`);
    }
    const trains = open.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX) && !isStackPr(p));
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
      let d = trainDisposition({ manifest: m, cars, ciConclusion, gate: g.state, gateWhy: g.why, ciRun, stuck: g.state === "success" ? stuckInputs(t, g, request, now) : null });
      if (!d.close) { if (!running) { running = t; runNoteOf = runNote; } continue; }
      // The open list is a snapshot: a train that merged since reads its cars merged too, and is not closed.
      if (d.outside) {
        const fresh = request(`pulls/${t.number}`);
        if (fresh.error || fresh.json?.merged_at || fresh.json?.state !== "open") { log(`= merge-train left #${t.number} alone: ${fresh.error ? `unreadable (${fresh.error})` : "it merged or closed since the list was read"}`); continue; }
        delete d.outside;
      }
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
      const dr = request(`git/refs/heads/${t.head.ref}`, { method: "DELETE" });
      log(`= merge-train closed #${t.number} (${d.outcome}): ${d.why}${dr.error ? ` (branch ${t.head.ref} not deleted: ${dr.error}; the next build sweeps it)` : ""}`);
    }
    const st = await stackStep({ request, cwd, log, running, now, carGate, open: open.rows });
    if (st?.degraded) { if (running) { log(`= merge-train waiting — train #${running.number} is still running${runNoteOf}`); return 0; } }
    else if (st) { log(st.msg); return st.code; }
    if (running) return stackBuild({ request, cwd, log, now, max, running, screenFile, note: runNoteOf, carGate });
  }
  let screen = null;
  if (build && screenFile !== null) {
    let text = null;
    try { text = fs.readFileSync(screenFile, "utf8"); } catch { /* missing: refused below */ }
    screen = readScreen(text);
    if (!screen) { log(`= merge-train error — no valid screen verdict at ${screenFile || "(no path)"} (the train-screen job failed?): no train opened`); return 1; }
    if (screen.skip) { log(`= merge-train idle — the screen skipped (${screen.skip}); the next run screens and builds`); return 0; }
    if (screen.stack) { log(`= merge-train idle — the screen was stacked on train #${screen.stack.pr}, which is no longer running; the next run screens onto the tip`); return 0; }
  }
  const plan = await planTrain({ request, cwd, max, now, log: build ? log : () => {}, carGate, acceptFor: screen ? () => screenAccept(screen) : null });
  if (plan.error) { log(`= merge-train error — ${plan.error}`); return 1; }
  for (const d of plan.dropped) log(`  - #${d.pr}: ${d.why}`);
  const line = `cars=${plan.cars.map((c) => `#${c.pr}`).join(",") || "none"} cap=${plan.cap} tip=${plan.tip.slice(0, 12)} head=${plan.head.slice(0, 12)}`;
  if (!build) { log(`= merge-train plan — ${line}${plan.running.length ? ` (train #${plan.running.join(",")} is open: --build waits for it)` : ""}${plan.enough ? "" : " (too few cars: no train)"}`); return 0; }
  if (!plan.enough) { log(`= merge-train idle — ${line}: too few cars`); return 0; }
  const o = openTrain({ request, cwd, now, head: plan.head, base: plan.tip, cars: plan.cars, dropped: plan.dropped });
  if (o.error) { log(`= merge-train error — ${o.error}`); return 1; }
  log(`= merge-train opened #${o.number} — ${line}`);
  return 0;
}

/** The build while train `running` is still running and nothing is stacked on it: fold the cars a screen measured on
 *  its head and push them as the stacked ref (no PR: no CI until `running` merges). Without --screen-file, or with a
 *  screen that was not stacked on this very head, it waits as before. */
async function stackBuild({ request, cwd, log, now, max, running, screenFile, note = "", carGate = null }) {
  const head = String(running.head?.sha || "").toLowerCase();
  const wait = (why = "") => { log(`= merge-train waiting — train #${running.number} is still running${note}${why}`); return 0; };
  if (screenFile === null) return wait();
  let text = null;
  try { text = fs.readFileSync(screenFile, "utf8"); } catch { /* missing: wait */ }
  const screen = readScreen(text);
  if (!screen) return wait(`; no valid screen verdict at ${screenFile || "(no path)"}, nothing stacked`);
  if (screen.skip) return wait(`; the screen skipped (${screen.skip})`);
  if (screen.stack?.pr !== running.number || screen.stack?.head !== head) return wait(`; the screen was not stacked on its head ${head.slice(0, 8)}, nothing stacked`);
  const plan = await planTrain({ request, cwd, max, now, log, onto: running, carGate, acceptFor: () => screenAccept(screen) });
  if (plan.error) { log(`= merge-train error — ${plan.error}`); return 1; }
  for (const d of plan.dropped) log(`  - #${d.pr}: ${d.why}`);
  const line = `cars=${plan.cars.map((c) => `#${c.pr}`).join(",") || "none"} cap=${plan.cap} base=${plan.base.slice(0, 12)} head=${plan.head.slice(0, 12)}`;
  if (!plan.enough) return wait(`; too few cars to stack (${line})`);
  const ref = stackRef(plan.base, plan.cars);
  const push = gitIn(cwd)(["push", "--quiet", "origin", `${plan.head}:refs/heads/${ref}`], { timeout: 300_000 });
  // FALLBACK: a refused push (LAND_TOKEN may not create train-next/*) is one logged line; train #running is untouched.
  if (push.status !== 0) { log(stackSkipped(`push ${ref}: ${String(push.stderr || "").trim().split("\n")[0]}`)); return 0; }
  log(`= merge-train stacked ${ref.slice(0, STACK_PREFIX.length + 12)}… on train #${running.number} — ${line}`);
  openSpec({ request, cwd, now, log, running, x: { sha: plan.head, base: plan.base }, cars: plan.cars });
  return 0;
}

/** `--screen`: the train-screen job. Skips (writes `{skip}`) while a train is open: the build closes it first and the
 *  next run screens. `check` defaults to merge-gate's ratchetsOnMerge, `gen` to gen:check (both run the fold's own scripts). Exit 0 with a file written, 1 on an error. */
export async function screenMain({ out, request = api, cwd = ROOT, log = console.log, now = Date.now(), max = TRAIN_MAX, check = null, gen = null, clock = Date.now, carGate = null, bound = null, limitMs = null }) {
  if (!out) { log(USAGE); return 1; }
  const write = (j) => { fs.mkdirSync(path.dirname(path.resolve(cwd, out)), { recursive: true }); fs.writeFileSync(path.resolve(cwd, out), `${JSON.stringify(j)}\n`); };
  const open = listPulls(request, "open");
  if (open.error) { log(`= merge-train error — ${open.error}`); return 1; }
  const trains = open.rows.filter((p) => String(p.head?.ref || "").startsWith(TRAIN_PREFIX) && !isStackPr(p));
  const skip = (why) => { write({ skip: why }); log(`= merge-train screen skipped — ${why}`); return 0; };
  if (trains.length > 1) return skip(`trains ${trains.map((p) => `#${p.number}`).join(",")} are open`);
  // Two trains in flight (#6584): one open train → screen the next onto its head; a stacked train → the build acts on it.
  const ls = listStacks(request);
  // FALLBACK: refs unreadable → never stack this run (one open train: skip as before; none: screen onto the tip).
  if (ls.error) { log(stackSkipped(ls.error)); if (trains.length) return skip(`train #${trains[0].number} is open (stacked refs unreadable)`); }
  else if (ls.refs.length) return skip(`train ${ls.refs[0].prs.map((n) => `#${n}`).join(",")} is stacked${trains.length ? ` on #${trains[0].number}` : ""}: the build promotes, restacks or rebases it`);
  const onto = trains[0] || null;
  const gate = check ? null : await import("./merge-gate.mjs");
  const ratchets = check || gate.ratchetsOnMerge;
  const prepare = gen || (gate ? ({ cwd: wt }) => {
    const r = spawnSync("npm", ["run", "-s", "gen:check"], { cwd: wt, env: gate.untrustedEnv(), encoding: "utf8", timeout: 600_000, maxBuffer: 16 << 20 });
    const tail = `${r.stdout || ""}\n${r.stderr || ""}`.split("\n").map((l) => l.trim()).filter((l) => l && !/^>|^npm /.test(l)).slice(-2).join(" | ");
    return r.status === 0 ? { ok: true } : { ok: false, evidence: `gen:check fails on the fold: ${tail || `exit ${r.status}`}` };
  } : null);
  const verdicts = [];
  let sf = null;
  const boundOf = bound || (gate ? (p) => gate.retestBound(p) : null);
  const line = limitMs ?? gate?.RETEST_REFUSE_MS ?? null;
  const retestFor = (tip) => (boundOf && Number.isFinite(line) ? retestBudget({ base: tip, cwd, bound: boundOf, limitMs: line, log }) : null);
  const plan = await planTrain({ request, cwd, max, now, log, onto, carGate, acceptFor: (tip) => (sf = screenFold({ tip, cwd, check: ratchets, prepare, out: verdicts, now: clock, retest: retestFor(tip) })).accept });
  sf?.cleanup();
  if (plan.error) { log(`= merge-train error — ${plan.error}`); return 1; }
  write({ tip: plan.base, ...(onto ? { stack: { pr: onto.number, head: plan.base } } : {}), cars: verdicts });
  for (const v of verdicts) log(`  ${v.ok ? "ok  " : "RED "} #${v.pr} ${v.head.slice(0, 8)}${v.ok ? "" : `: ${v.why}`}`);
  log(`= merge-train screen — ${verdicts.filter((v) => v.ok).length} of ${verdicts.length} car(s) green on the fold onto ${plan.base.slice(0, 12)}${onto ? ` (train #${onto.number}'s head)` : ""}; cars=${plan.cars.map((c) => `#${c.pr}`).join(",") || "none"}`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // No top-level await: merge-gate imports this module, and a dynamic import of it from a module still awaiting its
  // own top level never settles (the entry would wait on itself).
  main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.log(`= merge-train error — ${e?.stack || e}`); process.exitCode = 1; });
}
