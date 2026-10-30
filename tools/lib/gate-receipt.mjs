// gate-receipt.mjs — the receipt a gate writes and a hook reads (2026-10-19).
// @doc Gate receipts under artifacts/{merge,ready}-gate/<pr>.json: a gate writes one, github-mcp-guard.sh requires it.
// @skill steward
//
// Why: merging, arming and draft→ready were gated by a human word ("Level 3",
// a re-granted AskUserQuestion per orchestrator rotation) while no hook checked
// anything but the merge method. docs/plans/2026-10-19-fleet-redesign.md §2:
// gate, don't grant. A gate (`merge-gate.mjs`, `ready-gate.mjs --pr`) proves the
// PR's state and writes this receipt; the PreToolUse hook (10 s budget, no API)
// only has to read it: fresh, `ok`, the same PR, and for a merge the same head
// sha the call pins. `.claude/hooks/merge_policy.py` is the Python twin of
// `receiptVerdict` — keep the two in step (tests/unit/merge-gate.test.mjs).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Receipt kinds the READERS understand (receiptVerdict, merge_policy.py): an old merge receipt still parses. */
export const KINDS = ["merge", "ready"];
/** Receipt kinds a tool may WRITE. Not "merge": a session never merges (land.yml arms, the ruleset merges), so the
 *  hooks' merge door stays shut — `node -e "…writeReceipt(…,'merge',{ok:true})"` was a live bypass of the `hold`
 *  veto (review M2, 2026-10-27). */
export const WRITABLE_KINDS = Object.freeze(["ready"]);
/** A receipt older than this is stale: the tip, CI or the body may have moved. 10 min (was 30, 2026-10-21 defect hunt rows 2+3): the hook has no API, so a MERGE-HOLD added after the gate, or a push after a ready-gate, is only caught by the receipt aging out. */
export const MAX_AGE_MIN = 10;
/** A ready receipt the hook can tie to the PR's LIVE head AND the hash of its Plan section (`planHash`, written by
 *  ready-gate) stays valid while both are unchanged: a push or a Plan edit invalidates it, so the clock is only a
 *  backstop (24 h). One worker's flip was denied at 11 min on an unchanged head (efficiency review 2026-10-30 #6).
 *  Without a live head or Plan hash the receipt cannot be tied to anything, so MAX_AGE_MIN still applies. */
export const BOUND_MAX_AGE_MIN = 24 * 60;
/** A receipt dated further ahead than this is refused (audit 4 redteam-gates G5/G7, redteam-hooks R3: one dated 2099
 *  never aged out). Clock skew between a gate and its hook is seconds; launch-gate.py already allows the same 60 s. */
export const MAX_FUTURE_S = 60;

export const receiptDir = (root, kind) => path.join(root, "artifacts", `${kind}-gate`);
export const receiptPath = (root, kind, pr) => path.join(receiptDir(root, kind), `${Number(pr)}.json`);

/**
 * The main checkout of `root`'s repository, or null when `root` is the main checkout (or not a git tree).
 * A gate run from a linked worktree (`git worktree add`, EnterWorktree) must also leave its receipt there:
 * the hooks read CLAUDE_PROJECT_DIR, the main checkout (2026-10-19: a ready-gate run in a worktree passed,
 * and the draft→ready hook still refused #3131).
 */
export function mainCheckout(root) {
  const r = spawnSync("git", ["rev-parse", "--path-format=absolute", "--show-toplevel", "--git-common-dir"], { cwd: root, encoding: "utf8" });
  if (r.status !== 0) return null;
  const [top, common] = r.stdout.trim().split("\n");
  // Only a linked worktree's own top level mirrors: a scratch dir inside a checkout is not a checkout.
  if (!top || !common || path.resolve(top) !== path.resolve(root)) return null;
  const main = path.dirname(common);
  return path.resolve(main) === path.resolve(root) ? null : main;
}

/**
 * The gate's own code (2026-10-26 system audit §10, the O23 incident of 2026-10-20: `merge-gate --pacing-override`
 * existed only as an UNCOMMITTED edit of merge-gate.mjs, the edited gate wrote an ok receipt and the merge went
 * through). Every receipt records the sha256 of the gate's files as the running gate saw them; the hook
 * (`.claude/hooks/merge_policy.py` `gate_files_check`) recomputes them in the checkout it guards and refuses a receipt
 * whose gate files differ from that checkout's committed tree. It stops an edited gate, not a forger: any session can
 * Write a receipt by hand, so branch protection stays the real backstop (docs/notes/HOOKS-SECURITY-2026-10-26.md).
 * GATE_FILES are the SEEDS; the hashed set is their static import closure (gateClosure: pr-board, fleet-bus, deploy,
 * github-api, … — 21 files at audit 4 §1 #2, 18 of them unhashed before), recorded in the receipt as `gateClosure` so
 * the Python twin can verify the same set.
 */
export const GATE_FILES = Object.freeze(["tools/ci/merge-gate.mjs", "tools/ci/ready-gate.mjs", "tools/lib/gate-receipt.mjs"]);
/** The checkout this module runs from: the gate files hashed are the ones actually executing. */
export const GATE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Relative static import / re-export specifiers of one module's source (`import … from "./x.mjs"`, `import "./x.mjs"`,
 *  `export { a } from "../y.mjs"`, `export * from …`). Clause characters only, so a `from "…"` inside a string or a
 *  function body is not an import. Pure. */
export function staticImports(src) {
  const out = [];
  const re = /^[ \t]*(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/gm;
  for (let m; (m = re.exec(String(src || ""))); ) out.push(m[1]);
  return out;
}

/** The repo-relative files GATE_FILES statically import under `root`, transitively, seeds included; sorted. A missing
 *  file stays in the list (its hash is null, so a verdict refuses it). */
export function gateClosure(root = GATE_ROOT) {
  const seen = new Set();
  const todo = [...GATE_FILES];
  while (todo.length) {
    const f = todo.pop();
    if (seen.has(f)) continue;
    seen.add(f);
    let src = "";
    try { src = fs.readFileSync(path.join(root, f), "utf8"); } catch { continue; }
    for (const spec of staticImports(src)) {
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(f), spec));
      if (!rel.startsWith("../") && !seen.has(rel)) todo.push(rel);
    }
  }
  return [...seen].sort();
}

/** { path: sha256 hex | null (missing) } for `files` (default: the gate closure) under `root`. */
export function gateFileHashes(root = GATE_ROOT, files = gateClosure(root)) {
  const out = {};
  for (const f of files) {
    try { out[f] = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, f))).digest("hex"); } catch { out[f] = null; }
  }
  return out;
}

/** Write `{ kind, pr, head, ok, at, ... }` under `root` (and the main checkout, from a worktree); returns the path. */
export function writeReceipt(root, kind, data, { main = mainCheckout(root), gateRoot = GATE_ROOT } = {}) {
  if (kind === "merge") throw new Error("no tool writes a merge receipt: sessions never merge (land.yml arms, the branch ruleset merges)");
  if (!WRITABLE_KINDS.includes(kind)) throw new Error(`unknown receipt kind ${kind}`);
  const pr = Number(data.pr);
  if (!Number.isInteger(pr) || pr < 1) throw new Error(`receipt needs a PR number, got ${data.pr}`);
  // gateFiles/gateRoot last, so a caller's data cannot overwrite what the running gate hashed.
  const closure = gateClosure(gateRoot);
  const body = JSON.stringify({ kind, ...data, pr, at: data.at || new Date().toISOString(),
    gateRoot, gateClosure: closure, gateFiles: gateFileHashes(gateRoot, closure) }, null, 2) + "\n";
  const file = receiptPath(root, kind, pr);
  for (const f of main ? [file, receiptPath(main, kind, pr)] : [file]) {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, body);
  }
  return file;
}

/** The receipt for `pr`, or null when none is readable. */
export function readReceipt(root, kind, pr) {
  try { return JSON.parse(fs.readFileSync(receiptPath(root, kind, pr), "utf8")); } catch { return null; }
}

const hex = (s) => String(s || "").trim().toLowerCase();

/**
 * Does a receipt let this call through? Pure.
 * merge: needs `head` (the call's expectedHeadSha) equal to the gated head. ready: when the caller knows the PR's
 * current head (`head`), the receipt must be for it (G7: a push after the gate must not ride the old receipt).
 * Either kind: `at` no more than MAX_FUTURE_S ahead of `now`.
 * @returns {{ ok: boolean, why: string }}
 */
export function receiptVerdict(receipt, { kind, pr, head = "", plan = "", now = Date.now(), maxAgeMin = MAX_AGE_MIN } = {}) {
  const tool = kind === "merge" ? "merge-gate" : "ready-gate";
  const n = Number(pr);
  if (!Number.isInteger(n) || n < 1) return { ok: false, why: "no PR number in the call" };
  if (!receipt) return { ok: false, why: `no ${tool} receipt for #${n}: run \`node tools/ci/${tool}.mjs --pr ${n}\` (exit 0) first` };
  if (receipt.kind !== kind || Number(receipt.pr) !== n) return { ok: false, why: `the receipt is for ${receipt.kind} #${receipt.pr}, not ${kind} #${n}` };
  if (!receipt.ok) return { ok: false, why: `the last ${tool} run on #${n} refused (${receipt.evidence || "see artifacts/" + tool + "/" + n + ".json"}); fix it and re-run the gate` };
  const at = Date.parse(receipt.at || "");
  if (!at) return { ok: false, why: `the ${tool} receipt for #${n} has no timestamp; re-run the gate` };
  if (at - now > MAX_FUTURE_S * 1000) return { ok: false, why: `the ${tool} receipt for #${n} is dated ${Math.round((at - now) / 1000)} s in the future (max ${MAX_FUTURE_S}): a receipt is written by the gate, never by hand; re-run the gate` };
  // A ready receipt is tied to the live head and Plan (`plan` = planHash of the PR body now): which of head / Plan /
  // age failed is named, in that order.
  const pin = headPinProblem(head, receipt.head);
  if (kind === "ready" && hex(head) && pin) return { ok: false, why: `the PR head is ${hex(head).slice(0, 12)}, but ready-gate passed on ${hex(receipt.head).slice(0, 12)}: re-run ready-gate on the current head` };
  const live = hex(plan);
  const bound = kind === "ready" && hex(head) && live && receipt.planHash;
  if (kind === "ready" && hex(head) && live) {
    if (!receipt.planHash) return { ok: false, why: `the ready-gate receipt for #${n} records no Plan hash (written by an older gate): re-run ready-gate` };
    if (hex(receipt.planHash) !== live) return { ok: false, why: `the PR's Plan section changed since ready-gate passed on it (Plan ${hex(receipt.planHash).slice(0, 12)} then, ${live.slice(0, 12)} now): re-run ready-gate` };
  }
  const limit = bound ? BOUND_MAX_AGE_MIN : maxAgeMin;
  const ageMin = (now - at) / 60000;
  if (ageMin > limit) return { ok: false, why: `the ${tool} receipt for #${n} is ${Math.round(ageMin)} min old (max ${limit}${bound ? ", the backstop for an unchanged head and Plan" : ""}); re-run the gate on the current head` };
  if (kind === "merge") {
    if (!hex(head)) return { ok: false, why: `pin expectedHeadSha to the gated head ${hex(receipt.head).slice(0, 12)} (a merge is pinned to the sha the gate passed)` };
    if (pin) return { ok: false, why: `expectedHeadSha ${hex(head).slice(0, 12)} is not the gated head ${hex(receipt.head).slice(0, 12)}; re-run merge-gate on the head you merge` };
  }
  return { ok: true, why: "" };
}

/** "" when `a` and `b` name the same commit (either a prefix of the other, at least 7 hex), else a reason. Pure. */
export function headPinProblem(a, b) {
  const x = hex(a), y = hex(b);
  if (!/^[0-9a-f]{7,40}$/.test(x) || !/^[0-9a-f]{7,40}$/.test(y)) return "not a 7-40 hex sha";
  return x.startsWith(y) || y.startsWith(x) ? "" : "different commits";
}

/**
 * Was this receipt written by the committed gate? (Python twin: merge_policy.gate_files_check.) Pure apart from
 * reading `root` (the checkout the hook guards) and the receipt's own `gateRoot`: every file of the gate's import
 * closure there (gateClosure) and every GATE_FILES seed must be recorded, equal the file's sha256, be tracked by git
 * and match HEAD (`git diff --quiet HEAD`). A different gateRoot (a gate run from a linked worktree) must pass the same
 * test. The Python twin reads the recorded set from `gateClosure` (else the keys of `gateFiles`).
 * @returns {{ ok: boolean, why: string }}
 */
export function gateFilesVerdict(root, receipt, { run = spawnSync } = {}) {
  const rec = (receipt && receipt.gateFiles) || null;
  if (!rec) return { ok: false, why: "the receipt records no gate-file hashes (written by an older gate): re-run the gate" };
  const roots = [root];
  if (receipt.gateRoot && path.resolve(receipt.gateRoot) !== path.resolve(root) && fs.existsSync(receipt.gateRoot)) roots.push(receipt.gateRoot);
  for (const r of roots) {
    const files = [...new Set([...GATE_FILES, ...gateClosure(r)])].sort();
    const unrecorded = files.filter((f) => !(f in rec));
    if (unrecorded.length) return { ok: false, why: `the receipt does not record ${unrecorded.slice(0, 4).join(", ")}${unrecorded.length > 4 ? ", ..." : ""} of the gate's import closure in ${r} (an older gate or an edited import): re-run the gate` };
    const now = gateFileHashes(r, files);
    for (const f of files) {
      if (!now[f]) return { ok: false, why: `${f} is missing in ${r}` };
      if (rec[f] !== now[f]) return { ok: false, why: `${f} in ${r} is not the file that wrote this receipt: re-run the gate from this checkout` };
    }
    const tracked = run("git", ["-C", r, "ls-files", "--error-unmatch", "--", ...files], { encoding: "utf8" });
    if (tracked.status !== 0) return { ok: false, why: `the gate files are not tracked in ${r}` };
    const clean = run("git", ["-C", r, "diff", "--quiet", "HEAD", "--", ...files], { encoding: "utf8" });
    if (clean.status !== 0) return { ok: false, why: `the gate files in ${r} differ from HEAD (an uncommitted gate edit, the 2026-10-20 O23 incident): commit or revert, then re-run the gate` };
  }
  return { ok: true, why: "" };
}
