#!/usr/bin/env node
// fleet-bus.mjs — the host-neutral merge lease and message bus: one git branch every host can push.
// @doc Merge lease (one holder, expiry, refusal) and typed fleet bus on the claude/fleet-bus branch, any host.
// Full description: The cross-host fleet channel. The claude/fleet-bus branch's TREE holds the merge lease (lease.json) and its COMMIT LOG is the message bus (one typed line per commit subject). Every write is a fast-forward push, so a lease acquire is compare-and-swap: two hosts racing for it cannot both win. `lease acquire|renew|release|break|check` and `send`/`read` (cursor reads, only new lines).
// @section runner
// @skill agent-fleet
//
// docs/notes/FLEET-BUS-2026-10-19.md is the design and the per-host recipe.
// Why a branch: on 2026-10-19 Cursor's DAD and a Claude ORCH merged
// independently, each pacing "one merge per green Pages run" alone, because
// "the merge holder" was named as a host (Grok Bot) that was not running. The
// only channel Claude, Cursor, Codex and Grok all share is GitHub, and the only
// GitHub write all of them have is `git push` (the cloud containers' proxy
// refuses most of the REST API; who-is-on-it.mjs records the 403s). A branch
// push is refused unless it fast-forwards (git-scm.com/docs/git-push, PUSH
// RULES), so "fetch, decide on the fetched lease, commit on top, push" is an
// atomic compare-and-swap: the loser's push is rejected, it refetches and
// decides again on the winner's lease. An issue comment or a label has no such
// precondition. A host with only the GitHub MCP gets the same swap from the
// Contents API, whose update must name the blob sha it replaces.
//
//   node tools/ci/fleet-bus.mjs lease                                  # who holds it, until when
//   node tools/ci/fleet-bus.mjs lease acquire [--ttl 60] [--note "…"]  # exit 2 = held by someone else
//   node tools/ci/fleet-bus.mjs lease renew | release
//   node tools/ci/fleet-bus.mjs lease check                            # exit 0 only if YOU hold a live lease
//   node tools/ci/fleet-bus.mjs lease break --grant "<the user's words>"   # take a live lease on a user grant
//   node tools/ci/fleet-bus.mjs send READY --to orchestrator "#2990 abc1234 ready-gate 0"
//   node tools/ci/fleet-bus.mjs read [--to merge-holder --to '#2990'] [--since <sha>] [--last 20] [--json]
//
// Identity: --as <host>:<id>, else APEX_FLEET_AS, else claude:<CLAUDE_CODE_SESSION_ID>
// or codex:<CODEX_THREAD_ID>. Exit: 0 ok, 1 usage or git failure, 2 refused.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
export const BUS_BRANCH = "claude/fleet-bus";
export const TYPES = ["READY", "GREEN", "BLOCKED", "HANDOFF", "DONE", "INCIDENT", "LEASE"];
export const DEFAULT_TTL_MIN = 60;
/** A lease longer than this outlives the Pages p90 (73 min) three times over: a dead holder would block for hours. */
export const MAX_TTL_MIN = 240;
const LEASE_FILE = "lease.json";
const LAST_FILE = "last";
const CURSOR_DIR = path.join(ROOT, "artifacts", "fleet-bus");

/** `<host>:<id>`; null when nothing identifies this session. */
export function whoAmI(env = process.env, flag = "") {
  if (flag) return flag;
  if (env.APEX_FLEET_AS) return env.APEX_FLEET_AS;
  if (env.CLAUDE_CODE_SESSION_ID) return `claude:${env.CLAUDE_CODE_SESSION_ID}`;
  if (env.CODEX_THREAD_ID) return `codex:${env.CODEX_THREAD_ID}`;
  return null;
}

/** One bus line. Pure; throws on an unknown type or an empty address. */
export function formatLine(type, to, from, text = "") {
  if (!TYPES.includes(type)) throw new Error(`unknown type ${type} (one of ${TYPES.join(" ")})`);
  if (!to || /\s/.test(to)) throw new Error("--to needs one address: a role, #<PR>, <host>:<id> or *");
  return `${type} to:${to} from:${from} ${String(text).replace(/\s+/g, " ").trim()}`.trim();
}

/** A commit subject -> { type, to, from, text }, or null when it is not a bus line. Pure. */
export function parseLine(subject) {
  const m = /^([A-Z]+) to:(\S+) from:(\S+)(?: (.*))?$/.exec(String(subject).trim());
  if (!m || !TYPES.includes(m[1])) return null;
  return { type: m[1], to: m[2], from: m[3], text: m[4] || "" };
}

/** Does a line addressed `to` reach a reader listening on `addrs`? `*` reaches everyone; no filter reads all. Pure. */
export const addressed = (to, addrs = []) => !addrs.length || to === "*" || addrs.includes(to);

/** lease.json text -> the lease, or null when free/unreadable. Pure. */
export function parseLease(text) {
  try {
    const l = JSON.parse(text);
    return l && typeof l.holder === "string" && l.holder && Number.isFinite(l.expires) ? l : null;
  } catch { return null; }
}

/** The lease as of `now` (unix s): { free, holder, expired, leftMin }. An expired lease is free to take. Pure. */
export function leaseState(lease, now) {
  if (!lease) return { free: true, holder: null, expired: false, leftMin: 0 };
  const expired = now >= lease.expires;
  return { free: expired, holder: lease.holder, expired, leftMin: Math.max(0, Math.ceil((lease.expires - now) / 60)) };
}

/**
 * The lease decision, made on the lease as just FETCHED (the push that follows is the swap). Pure.
 * op: acquire | renew | release | break. Returns { ok, lease (next lease.json object, null = free), verb, reason }.
 */
export function decide(op, lease, me, now, { ttlMin = DEFAULT_TTL_MIN, note = "", grant = "" } = {}) {
  const st = leaseState(lease, now);
  const mine = st.holder === me;
  const ttl = Math.min(Math.max(1, Math.round(Number(ttlMin) || DEFAULT_TTL_MIN)), MAX_TTL_MIN);
  const take = (verb) => ({ ok: true, verb, reason: "",
    lease: { holder: me, since: mine && !st.expired ? lease.since : now, expires: now + ttl * 60, ttlMin: ttl, note: note || (mine ? lease.note || "" : "") } });
  const held = `held by ${st.holder} for ${st.leftMin} more min`;
  switch (op) {
    case "acquire":
      return st.free || mine ? take(mine && !st.expired ? "renew" : "acquire") : { ok: false, reason: held };
    case "renew":
      return mine ? take("renew") : { ok: false, reason: st.holder ? `not yours: ${st.free ? "lapsed lease of " + st.holder : held}` : "no lease to renew (acquire)" };
    case "release":
      if (!st.holder) return { ok: false, reason: "no lease to release" };
      if (!mine && !st.expired) return { ok: false, reason: held };
      return { ok: true, verb: mine ? "release" : `clear lapsed ${st.holder}`, reason: "", lease: null };
    case "break":
      if (!String(grant).trim()) return { ok: false, reason: "break needs --grant with the user's words (authority.md)" };
      return { ...take("break"), verb: `break ${st.holder || "(free)"} grant="${String(grant).replace(/"/g, "'").trim()}"` };
    default:
      return { ok: false, reason: `unknown lease op ${op}` };
  }
}

/** The LEASE bus line a decision writes. Pure. */
export function leaseLine(d, me, now) {
  const until = d.lease ? ` ttl=${d.lease.ttlMin}m until=${new Date(d.lease.expires * 1000).toISOString().slice(0, 16)}Z` : "";
  return formatLine("LEASE", "*", me, `${d.verb}${until}${d.lease && d.lease.note ? " " + d.lease.note : ""}`);
}

/** `git log --format=%H%x09%ct%x09%s` lines -> bus entries (non-bus commits dropped). Pure. */
export function parseLog(text) {
  return String(text).split("\n").filter(Boolean).map((l) => {
    const [sha, t, ...s] = l.split("\t");
    const line = parseLine(s.join("\t"));
    return line ? { sha, at: Number(t), ...line } : null;
  }).filter(Boolean);
}

// ---- git -------------------------------------------------------------------

const gitIn = (cwd) => (args, input) => spawnSync("git", args, { cwd, encoding: "utf8", input, env: identityEnv(cwd), timeout: 60_000 });

/** An unconfigured box still signs (the bus line carries the real `from:`). */
function identityEnv(cwd) {
  const env = { ...process.env };
  const has = spawnSync("git", ["config", "user.email"], { cwd, encoding: "utf8" }).stdout.trim();
  if (!has) {
    env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = "apex26 fleet-bus";
    env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = "fleet-bus@apex26.invalid";
  }
  return env;
}

const tracking = (remote) => `refs/remotes/${remote}/${BUS_BRANCH}`;

/** Fetch the bus; returns the tip sha ("" when the branch does not exist yet). */
export function fetchBus({ cwd = ROOT, remote = "origin" } = {}) {
  const run = gitIn(cwd);
  run(["fetch", "--quiet", "--no-tags", remote, `+refs/heads/${BUS_BRANCH}:${tracking(remote)}`]);
  return run(["rev-parse", "--verify", "--quiet", tracking(remote) + "^{commit}"]).stdout.trim();
}

const readFileAt = (run, rev, file) => {
  const r = run(["show", `${rev}:${file}`]);
  return r.status === 0 ? r.stdout : "";
};

/**
 * One write: fetch, let `plan(lease)` decide on the fetched lease, commit on top of the fetched tip, push as a
 * fast-forward. A rejected push means another host wrote first: refetch and decide again (that is the CAS).
 * plan returns { ok, lease?, line, reason } — `lease: undefined` keeps lease.json as it is.
 */
export function writeBus(plan, { cwd = ROOT, remote = "origin", tries = 5 } = {}) {
  const run = gitIn(cwd);
  const step = (a, input) => {
    const r = run(a, input);
    const out = (r.stdout || "").trim();
    // An empty object id would make the refspec `:refs/heads/<bus>`, which DELETES the branch.
    if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(out)) throw new Error(`git ${a[0]} failed (status ${r.status}): ${(r.stderr || "").trim() || "no object id"}`);
    return out;
  };
  let err = "";
  for (let i = 0; i < tries; i++) {
    const tip = fetchBus({ cwd, remote });
    const leaseText = tip ? readFileAt(run, tip, LEASE_FILE) : "";
    const d = plan(parseLease(leaseText));
    if (!d.ok) return { ok: false, refused: true, reason: d.reason, sha: "" };
    let commit;
    try {
      const nextLease = d.lease === undefined ? leaseText : d.lease ? JSON.stringify(d.lease) + "\n" : "{}\n";
      const files = [[LAST_FILE, d.line + "\n"], [LEASE_FILE, nextLease || "{}\n"]];
      const rows = files.map(([name, body]) => `100644 blob ${step(["hash-object", "-w", "--stdin"], body)}\t${name}`);
      commit = step(["commit-tree", step(["mktree"], rows.join("\n") + "\n"), ...(tip ? ["-p", tip] : []), "-m", d.line]);
    } catch (e) { return { ok: false, refused: false, reason: e.message, sha: "" }; }
    const r = run(["push", "--quiet", remote, `${commit}:refs/heads/${BUS_BRANCH}`]);
    if (r.status === 0) { run(["update-ref", tracking(remote), commit]); return { ok: true, sha: commit.slice(0, 7), line: d.line, lease: d.lease }; }
    err = (r.stderr || "").trim().split("\n").filter((l) => !/^remote:|^To |^\s*$/.test(l)).join(" ");
  }
  return { ok: false, refused: false, reason: `push kept losing the race: ${err}`, sha: "" };
}

/** The current lease (after a fetch). */
export function readLease({ cwd = ROOT, remote = "origin", fetch = true } = {}) {
  const run = gitIn(cwd);
  const tip = fetch ? fetchBus({ cwd, remote }) : run(["rev-parse", "--verify", "--quiet", tracking(remote)]).stdout.trim();
  return tip ? parseLease(readFileAt(run, tip, LEASE_FILE)) : null;
}

/** Bus entries after `since` (oldest first); with no usable cursor, the last `last` entries. */
export function readBus({ cwd = ROOT, remote = "origin", since = "", last = 20, fetch = true } = {}) {
  const run = gitIn(cwd);
  const tip = fetch ? fetchBus({ cwd, remote }) : run(["rev-parse", "--verify", "--quiet", tracking(remote)]).stdout.trim();
  if (!tip) return { tip: "", entries: [], reset: false };
  const fmt = "--format=%H%x09%ct%x09%s";
  const known = since && run(["merge-base", "--is-ancestor", since, tip]).status === 0;
  const out = known
    ? run(["log", "--reverse", fmt, `${since}..${tip}`]).stdout
    : run(["log", "--reverse", fmt, `-${last}`, tip]).stdout;
  return { tip, entries: parseLog(out), reset: !!since && !known };
}

// ---- CLI -------------------------------------------------------------------

const cursorFile = (me) => path.join(CURSOR_DIR, `cursor-${String(me).replace(/[^\w.-]+/g, "_")}.txt`);

function usage(msg) {
  if (msg) console.error(`fleet-bus: ${msg}`);
  console.error("usage: fleet-bus.mjs lease [acquire|renew|release|check|break] [--ttl MIN] [--note T] [--grant T]\n" +
    "       fleet-bus.mjs send <TYPE> --to <role|#PR|host:id|*> \"<text>\"\n" +
    "       fleet-bus.mjs read [--to ADDR ...] [--since SHA] [--last N] [--json]\n" +
    "       common: --as <host>:<id>   types: " + TYPES.join(" "));
  return 1;
}

export function main(argv, { cwd = ROOT, now = () => Math.floor(Date.now() / 1000), log = console.log } = {}) {
  const flags = {}, multi = { to: [] }, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") flags.json = true;
    else if (a.startsWith("--")) {
      const k = a.slice(2), v = argv[++i];
      if (v === undefined) return usage(`${a} needs a value`);
      if (k === "to") multi.to.push(v); else flags[k] = v;
    } else pos.push(a);
  }
  const [cmd, sub] = pos;
  const me = whoAmI(process.env, flags.as);
  const needMe = () => { if (!me) throw new Error("no identity: pass --as <host>:<id> or set APEX_FLEET_AS"); };
  try {
    if (cmd === "lease") {
      if (!sub) {
        const l = readLease({ cwd }), st = leaseState(l, now());
        if (flags.json) log(JSON.stringify({ lease: l, ...st }));
        else log(st.holder && !st.expired ? `= lease held by ${st.holder} for ${st.leftMin} more min${l.note ? " — " + l.note : ""}`
          : `= lease free${st.expired ? ` (lapsed: ${st.holder})` : ""}`);
        return 0;
      }
      needMe();
      if (sub === "check") {
        const st = leaseState(readLease({ cwd }), now());
        const ok = st.holder === me && !st.expired;
        log(ok ? `= lease yours for ${st.leftMin} more min` : `= lease NOT yours: ${st.holder && !st.expired ? `held by ${st.holder}` : "free — acquire first"}`);
        return ok ? 0 : 2;
      }
      if (!["acquire", "renew", "release", "break"].includes(sub)) return usage(`unknown lease op ${sub}`);
      const r = writeBus((lease) => {
        const t = now();
        const d = decide(sub, lease, me, t, { ttlMin: flags.ttl, note: flags.note, grant: flags.grant });
        return d.ok ? { ...d, line: leaseLine(d, me, t) } : d;
      }, { cwd });
      if (r.ok) { log(`= lease ${sub} ok ${r.sha}: ${r.line}`); return 0; }
      log(`= lease ${sub} ${r.refused ? "REFUSED" : "FAILED"}: ${r.reason}`);
      return r.refused ? 2 : 1;
    }
    if (cmd === "send") {
      needMe();
      if (!sub) return usage("send needs a TYPE");
      if (sub === "LEASE") return usage("LEASE lines are written by `lease …`, never sent by hand");
      if (multi.to.length !== 1) return usage("send needs exactly one --to");
      const line = formatLine(sub, multi.to[0], me, pos.slice(2).join(" "));
      const r = writeBus(() => ({ ok: true, line, lease: undefined }), { cwd });
      log(r.ok ? `= sent ${r.sha}: ${line}` : `= send FAILED: ${r.reason}`);
      return r.ok ? 0 : 1;
    }
    if (cmd === "read") {
      const file = me ? cursorFile(me) : "";
      let since = flags.since || "";
      if (!since && file) try { since = fs.readFileSync(file, "utf8").trim(); } catch { /* first read */ }
      const r = readBus({ cwd, since, last: Number(flags.last) || 20 });
      const shown = r.entries.filter((e) => addressed(e.to, multi.to));
      if (flags.json) log(JSON.stringify({ tip: r.tip, reset: r.reset, entries: shown }));
      else for (const e of shown) log(`${new Date(e.at * 1000).toISOString().slice(11, 16)}Z ${e.sha.slice(0, 7)} ${e.type} to:${e.to} from:${e.from} ${e.text}`.trimEnd());
      if (file && r.tip) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, r.tip + "\n"); }
      if (!flags.json) log(`= bus ${shown.length} new${r.reset ? " (cursor unknown: last " + (Number(flags.last) || 20) + ")" : ""}, cursor ${r.tip ? r.tip.slice(0, 7) : "none"}`);
      return 0;
    }
    return usage(cmd ? `unknown command ${cmd}` : "");
  } catch (e) {
    console.error(`fleet-bus: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
