// gate-receipt.mjs — the receipt a gate writes and a hook reads (2026-10-19).
// @doc Gate receipts under artifacts/{merge,ready}-gate/<pr>.json: a gate writes one, github-mcp-guard.sh requires it.
// @skill agent-fleet
//
// Why: merging, arming and draft→ready were gated by a human word ("Level 3",
// a re-granted AskUserQuestion per orchestrator rotation) while no hook checked
// anything but the merge method. docs/plans/2026-10-19-fleet-redesign.md §2:
// gate, don't grant. A gate (`merge-gate.mjs`, `ready-gate.mjs --pr`) proves the
// PR's state and writes this receipt; the PreToolUse hook (10 s budget, no API)
// only has to read it: fresh, `ok`, the same PR, and for a merge the same head
// sha the call pins. `.claude/hooks/merge_policy.py` is the Python twin of
// `receiptVerdict` — keep the two in step (tests/unit/merge-gate.test.mjs).
import fs from "node:fs";
import path from "node:path";

export const KINDS = ["merge", "ready"];
/** A receipt older than this is stale: the tip, CI or the body may have moved. */
export const MAX_AGE_MIN = 30;

export const receiptDir = (root, kind) => path.join(root, "artifacts", `${kind}-gate`);
export const receiptPath = (root, kind, pr) => path.join(receiptDir(root, kind), `${Number(pr)}.json`);

/** Write `{ kind, pr, head, ok, at, ... }`; returns the path. */
export function writeReceipt(root, kind, data) {
  if (!KINDS.includes(kind)) throw new Error(`unknown receipt kind ${kind}`);
  const pr = Number(data.pr);
  if (!Number.isInteger(pr) || pr < 1) throw new Error(`receipt needs a PR number, got ${data.pr}`);
  const file = receiptPath(root, kind, pr);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ kind, ...data, pr, at: data.at || new Date().toISOString() }, null, 2) + "\n");
  return file;
}

/** The receipt for `pr`, or null when none is readable. */
export function readReceipt(root, kind, pr) {
  try { return JSON.parse(fs.readFileSync(receiptPath(root, kind, pr), "utf8")); } catch { return null; }
}

const hex = (s) => String(s || "").trim().toLowerCase();

/**
 * Does a receipt let this call through? Pure.
 * merge: needs `head` (the call's expectedHeadSha) equal to the gated head.
 * @returns {{ ok: boolean, why: string }}
 */
export function receiptVerdict(receipt, { kind, pr, head = "", now = Date.now(), maxAgeMin = MAX_AGE_MIN } = {}) {
  const tool = kind === "merge" ? "merge-gate" : "ready-gate";
  const n = Number(pr);
  if (!Number.isInteger(n) || n < 1) return { ok: false, why: "no PR number in the call" };
  if (!receipt) return { ok: false, why: `no ${tool} receipt for #${n}: run \`node tools/ci/${tool}.mjs --pr ${n}\` (exit 0) first` };
  if (receipt.kind !== kind || Number(receipt.pr) !== n) return { ok: false, why: `the receipt is for ${receipt.kind} #${receipt.pr}, not ${kind} #${n}` };
  if (!receipt.ok) return { ok: false, why: `the last ${tool} run on #${n} refused (${receipt.evidence || "see artifacts/" + tool + "/" + n + ".json"}); fix it and re-run the gate` };
  const at = Date.parse(receipt.at || "");
  if (!at) return { ok: false, why: `the ${tool} receipt for #${n} has no timestamp; re-run the gate` };
  const ageMin = (now - at) / 60000;
  if (ageMin > maxAgeMin) return { ok: false, why: `the ${tool} receipt for #${n} is ${Math.round(ageMin)} min old (max ${maxAgeMin}); re-run the gate on the current head` };
  if (kind === "merge") {
    if (!hex(head)) return { ok: false, why: `pin expectedHeadSha to the gated head ${hex(receipt.head).slice(0, 12)} (role-merge-holder.md: a merge is pinned to the sha the gate passed)` };
    const a = hex(head), b = hex(receipt.head);
    if (!(a.startsWith(b) || b.startsWith(a)) || Math.min(a.length, b.length) < 7) {
      return { ok: false, why: `expectedHeadSha ${a.slice(0, 12)} is not the gated head ${b.slice(0, 12)}; re-run merge-gate on the head you merge` };
    }
  }
  return { ok: true, why: "" };
}
