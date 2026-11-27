// lease.mjs — the PR owner lease (skill `steward` §Lane 3): the Hand-off `owner:` grammar and the lease states.
// @doc The Hand-off `owner:` lease: its parser, the seven lease states and the adopted-unleased check.
//
// Grammar of the ```handoff block's `owner:` line (#5847, #6887 phases 3 and 4):
//   owner: <host>:<session> until <ISO UTC>    a live lease (at most 4 h ahead)
//   owner: landing <host>:<session>            the owner added `land` and ended (steward §Land 4): GitHub lands it
//   owner: released <host>:<session>          the owner handed it back with a `releases PR #<n>` comment
//   owner: none                                 nobody holds it
// A PR body written before the two new words still reads right: a `releases PR #<n>` comment newer than every
// `adopts PR #<n>` comment is `released`; else a PR carrying `land` is `landing` (11-26 fixture, #7050).
// ADOPTED-UNLEASED (#6887 phase 4): the newest `adopts PR #<n>` comment names a session the owner line does not, and
// no `releases PR #<n>` came after it: the adopter has not written its lease, so its push is refused (ship-pr).
import { ADOPT_RE, RELEASE_RE } from "./gh-rows.mjs";

/** Hours a PARKED lease outlives its until-time (skill `steward` §Lane 3). */
export const PARK_GRACE_HOURS = 24;
/** Labels that park a PR: it waits on Bryce or on another PR. */
export const PARK_LABELS = ["needs-decision", "blocked"];
/** Every lease state, for a reader's table. */
export const LEASE_STATES = ["none", "open", "live", "parked", "lapsed", "landing", "released"];
const STATE_WORD = /^(landing|released)\b\s*/i;

/** The `owner:` line of the body's ```handoff block split into the owner and the lease's `until <ISO>`:
 *  { owner: "-" | text, until: ISO | null }. The owner keeps a `landing`/`released` word (leaseWord reads it), so a
 *  reader still finds the session id in it. Pure. */
export function handoffLease(body) {
  const m = /```handoff\n([\s\S]*?)```/.exec(String(body || ""));
  const line = m && /^owner:\s*(.+)$/m.exec(m[1]);
  if (!line) return { owner: "-", until: null };
  const u = /\s+until\s+(\S+)\s*$/.exec(line[1]);
  const until = u && Number.isFinite(Date.parse(u[1])) ? u[1] : null;
  return { owner: (u ? line[1].slice(0, u.index) : line[1]).trim() || "-", until };
}
/** `landing` | `released` when the owner value starts with that word, else null. Pure. */
export const leaseWord = (owner) => STATE_WORD.exec(String(owner || ""))?.[1]?.toLowerCase() || null;

const byTime = (comments) => [...(comments || [])].sort((a, b) => Date.parse(a?.created_at || 0) - Date.parse(b?.created_at || 0));

/** The owner-change comments on PR `number`, oldest first: { kind: "adopt" | "release", session, at }. Pure. */
export function ownerEvents(comments, number) {
  const out = [];
  for (const c of byTime(comments)) {
    const body = String(c?.body || "");
    const a = ADOPT_RE.exec(body);
    if (a && Number(a[1]) === Number(number)) { out.push({ kind: "adopt", session: a[2], at: c.created_at || null }); continue; }
    const r = RELEASE_RE.exec(body);
    if (r && Number(r[1]) === Number(number)) out.push({ kind: "release", session: null, at: c.created_at || null });
  }
  return out;
}

/** The lease state for an owner line, the PR's labels and (optional) its comments. Pure. First match wins:
 *  the `landing`/`released` word → it; no owner → none (or released when the newest owner act is a release);
 *  newest owner act a release → released; `land` label → landing; no until-time → open; a park label → parked
 *  (up to PARK_GRACE_HOURS past the until-time) or lapsed; else live until the until-time, then lapsed. */
export function leaseState({ owner, until, labels = [], comments = null, number = null }, now = Date.now()) {
  const w = leaseWord(owner);
  if (w) return w;
  const evs = comments && number != null ? ownerEvents(comments, number) : [];
  if (evs.length && evs[evs.length - 1].kind === "release") return "released";
  if (labels.includes("land")) return "landing";
  if (!owner || owner === "-" || /^none\b/i.test(owner)) return "none";
  if (!until) return "open";
  const end = Date.parse(until);
  if (labels.some((l) => PARK_LABELS.includes(l))) return now < end + PARK_GRACE_HOURS * 3600e3 ? "parked" : "lapsed";
  return now < end ? "live" : "lapsed";
}

/** ADOPTED-UNLEASED: { session, at } of the newest adoption when the owner line does not name its session and no
 *  release followed it, else null. The session matches by its id after the host (`claude:session_x` ~ `session_x`). Pure. */
export function adoptedUnleased(body, comments, number) {
  const evs = ownerEvents(comments, number);
  const last = evs[evs.length - 1];
  if (!last || last.kind !== "adopt") return null;
  const id = String(last.session || "").replace(/^[^:]*:/, "");
  const { owner } = handoffLease(body);
  return id && String(owner).includes(id) ? null : { session: last.session, at: last.at };
}
