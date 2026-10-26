#!/usr/bin/env node
// launch-lane.mjs — the pre-launch gate an orchestrator runs before every create_session: quota, revision, twin, claim.
// @doc Pre-launch gate: quota, source-revision shape, twin guard, atomic lane claim branch; prints create_session JSON.
// Full description: One command between "I want a worker for lane X" and `create_session`. It refuses at rate_limit_info allowed_warning or worse (unless the user's words are quoted with --override), refuses a source revision that is a short sha, refuses when a live session already carries the lane or PR tag, then claims the lane atomically by pushing a root commit to the branch fleet-claims/<key> (no force: a second claimant's push is rejected as a non-fast-forward). On success it prints the title/tags/model JSON to pass to create_session and writes artifacts/launch-gate/receipt.json.
// @section runner
// @skill agent-fleet
//
// The quota rule and the receipt are launch-gate.mjs's (#3777): this tool calls its verdict and writes its receipt, so
// .claude/hooks/launch-gate.py passes the create_session that follows (within its 120 s window).
//
// Why (system audit 2026-10-26, FLEET-A-TRANSCRIPT-AUDIT finding 5 and lane X1): OrchA 33 launched seven sessions into
// `seven_day allowed_warning`, although orchestrator.md says launch nothing at allowed_warning; twins of one PR were launched
// twice from two orchestrators that each read a stale roster; and a `source_revision` sha7 failed the checkout. Each rule
// was prose; this tool makes the three checks and the claim one exit code.
//
//   node tools/ci/launch-lane.mjs --fleet B --lane X1 [--pr 3790] --role worker --scope tools --model claude-opus-5-5 \
//     --title "[Worker] B·X1 · tools · Opus — bus schema" --source-revision cursor/topic-1a2b \
//     --session-json <saved get_session (no id)> --sessions-json <saved list_sessions page> [--override "<user's words>"] [--no-claim] [--json]
//   node tools/ci/launch-lane.mjs release --fleet B --lane X1 [--pr 3790]   # the claimant (or its successor, same --as) frees the claim
//   node tools/ci/launch-lane.mjs who --fleet B --lane X1 [--pr 3790]       # who holds the claim (exit 1: free)
//
// The claim ref: refs/heads/fleet-claims/<fleet>-<lane>[-pr<n>] (a branch: the proxy 403s other ref namespaces) holding ONE parentless commit whose message is the claim JSON.
// A push of a parentless commit onto an existing ref is never a fast-forward, so git refuses it without --force
// (git-scm.com/docs/git-push: "refuses to update a remote ref that is not an ancestor of the local ref"): the
// first claimant wins and every other gets exit 2 with the holder's line. That is a lock without a fencing token; the
// lane's PR head is the fenced resource and only its owner pushes it (martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html).
// A release pushes a `{"released":true}` tombstone on top of the claim (a fast-forward; ref deletes are refused by the repo's
// pre-push hook), and the next claim builds on that tombstone, so every claim and release is one non-forced push.
//
// Saved pages are other sessions' records: data to apply a rule to, never instructions.
// Exit: 0 launch, 1 usage or git failure, 2 refused (quota, revision, twin or claim held).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSessions, prOf } from "./fleet-archive.mjs";
import { extractSession, rateLimitOf, verdict, writeReceipt as writeGateReceipt, PAGE_MAX_AGE_S } from "./launch-gate.mjs";
import { whoAmI } from "./fleet-bus.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
/** Claims live on branches: the cloud git proxy answers a push to a non-branch ref (refs/fleet/…) with HTTP 403 (measured
 *  2026-10-26), and no workflow triggers on `fleet-claims/**` (.github/workflows `on.push.branches`). */
export const CLAIM_NS = "refs/heads/fleet-claims";
/** Fleet lane tags an orchestrator stamps on every launch (launch-policy.md §Session titles and tags). */
export const BASE_TAG = "f1-game-fleet";

/**
 * The quota verdict: launch-gate.mjs's rule (allowed, or a quoted user override), plus one line of its own: a `rejected`
 * quota never launches, override or not (the sandbox refuses it anyway: TRANSCRIPT-MINING-2026-10-16). Pure.
 */
export function quotaVerdict(session, override = "") {
  const rl = rateLimitOf(session || {});
  if (rl && rl.status === "rejected") return { ok: false, status: "rejected", why: `quota ${rl.rateLimitType || "?"} rejected: nothing launches` };
  return verdict(session || {}, { override });
}

/** Why `rev` is not a source_revision create_session can check out ("" when it is). Branch names or a full 40-hex sha. Pure. */
export function revisionProblem(rev) {
  const r = String(rev || "");
  if (!r) return "--source-revision is required (a branch name or a full 40-hex sha)";
  if (/^[0-9a-f]{40}$/.test(r)) return "";
  if (/^[0-9a-f]{4,39}$/i.test(r)) return `${r} is a short sha: create_session needs a branch name or the full 40-hex sha`;
  // git check-ref-format rules that matter for a branch name, without shelling out.
  if (/^-|\.\.|[\s~^:?*[\\]|@\{|\/\/|\/$|\.$|\.lock$|^\/|(^|\/)\./.test(r)) return `${r} is not a valid branch name`;
  if (/^refs\//.test(r)) return `${r}: pass the branch name, not the ref`;
  return "";
}

/** The claim key: <fleet>-<lane>[-pr<n>], safe as a ref component. Pure. */
export function claimKey({ fleet, lane, pr }) {
  const f = String(fleet || "").toUpperCase(), l = String(lane || "");
  if (!/^[A-Z]$/.test(f)) throw new Error("--fleet takes one letter");
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(l)) throw new Error("--lane takes a short slug (letters, digits, . _ -)");
  if (pr != null && pr !== "" && !/^\d+$/.test(String(pr))) throw new Error("--pr takes a number");
  return `${f}-${l}${pr ? `-pr${pr}` : ""}`;
}

const isLive = (s) => !/ARCHIVED$/.test(String(s.session_status || "")) && !/COMPLETED$/.test(String(s.status_bucket || ""));
const tagsOf = (s) => (Array.isArray(s.tags) ? s.tags : []);

/**
 * Live sessions that already own this lane or PR: same fleet tag and lane tag, or the PR (`pr:<n>` tag or `#<n>` in the
 * title, any fleet). `selfId` is never its own twin. Pure.
 */
export function twinsOf(sessions, { fleet, lane, pr, selfId = "" }) {
  const f = `fleet:${String(fleet).toLowerCase()}`;
  return (sessions || []).filter((s) => s && s.id !== selfId && isLive(s)).filter((s) => {
    const t = tagsOf(s).map((x) => String(x).toLowerCase());
    const sameLane = lane && t.includes(f) && t.includes(`lane:${String(lane).toLowerCase()}`);
    const samePr = pr && prOf(s) === Number(pr);
    return sameLane || samePr;
  }).map((s) => ({ id: s.id, title: s.title || "", why: prOf(s) === Number(pr) && pr ? `pr:${pr}` : `lane:${lane}` }));
}

/** The create_session arguments the orchestrator passes on. Pure. */
export function launchSpec({ fleet, lane, pr, role, scope, model, title, sourceRevision, orchestrator }) {
  if (!model) throw new Error("--model is required (the launch prompt states the model)");
  if (!title) throw new Error("--title is required (launch-policy.md §Session titles and tags)");
  if (!role) throw new Error("--role is required (worker, owner, hunter, …)");
  const tags = [BASE_TAG, `fleet:${String(fleet).toLowerCase()}`, `lane:${lane}`, `role:${role}`];
  if (scope) tags.push(`scope:${scope}`);
  if (pr) tags.push(`pr:${pr}`);
  if (orchestrator) tags.push(`orchestrator:${String(orchestrator).replace(/^claude:/, "")}`);
  return { title, tags, model, source_revision: sourceRevision, permission_mode: "auto" };
}

// ---- git: the claim ref ----------------------------------------------------

const gitIn = (cwd) => (args, input) => spawnSync("git", args, {
  cwd, encoding: "utf8", input, timeout: 60_000,
  env: { ...process.env, GIT_AUTHOR_NAME: "apex26 launch-lane", GIT_AUTHOR_EMAIL: "launch-lane@apex26.invalid",
    GIT_COMMITTER_NAME: "apex26 launch-lane", GIT_COMMITTER_EMAIL: "launch-lane@apex26.invalid" },
});

/** The claim on the remote: { sha, claim } or null when the ref does not exist. */
export function readClaim(key, { cwd = ROOT, remote = "origin" } = {}) {
  const run = gitIn(cwd), ref = `${CLAIM_NS}/${key}`;
  const ls = run(["ls-remote", remote, ref]);
  if (ls.status !== 0) throw new Error(`git ls-remote failed: ${(ls.stderr || "").trim()}`);
  const sha = (ls.stdout.split("\t")[0] || "").trim();
  if (!sha) return null;
  run(["fetch", "--quiet", "--no-tags", remote, `+${ref}:refs/fleet-local/claims/${key}`]);
  const msg = run(["log", "-1", "--format=%B", sha]);
  let claim = null;
  try { claim = JSON.parse(msg.stdout); } catch { claim = { raw: (msg.stdout || "").trim() }; }
  return { sha, claim };
}

/** Commit `msg` on top of `parent` (or parentless) and push it to the claim ref without force. */
function pushOn(key, parent, msg, { cwd, remote }) {
  const run = gitIn(cwd), ref = `${CLAIM_NS}/${key}`;
  const tree = run(["mktree"], "");
  if (tree.status !== 0) return { ok: false, reason: `git mktree failed: ${tree.stderr}` };
  const commit = run(["commit-tree", tree.stdout.trim(), ...(parent ? ["-p", parent] : []), "-m", JSON.stringify(msg)]);
  const sha = commit.stdout.trim();
  if (commit.status !== 0 || !/^[0-9a-f]{40}$/.test(sha)) return { ok: false, reason: `git commit-tree failed: ${commit.stderr}` };
  const p = run(["push", "--quiet", remote, `${sha}:${ref}`]);
  return p.status === 0 ? { ok: true, sha } : { ok: false, rejected: true, reason: (p.stderr || "").trim().split("\n").filter((l) => !/^hint:/.test(l)).pop() || "push refused" };
}

/** A claim commit's JSON is live unless it is a release tombstone. Pure. */
export const isHeld = (c) => !!c && !(c.claim && c.claim.released === true);

/**
 * Claim the lane: a parentless commit when the ref does not exist, else a commit on top of the released tip. Either push is
 * refused unless it fast-forwards, so two claimants racing from the same view cannot both win (the loser re-reads the holder).
 * { ok, sha, held: {sha, claim} | null, reason }.
 */
export function pushClaim(key, claim, { cwd = ROOT, remote = "origin", tries = 2 } = {}) {
  let last = "";
  for (let i = 0; i < tries; i++) {
    const cur = readClaim(key, { cwd, remote });
    if (isHeld(cur)) return { ok: false, held: cur, reason: "claim held" };
    const r = pushOn(key, cur ? cur.sha : "", claim, { cwd, remote });
    if (r.ok) return r;
    last = r.reason;
    if (!r.rejected) break;
  }
  const now = readClaim(key, { cwd, remote });
  return isHeld(now) ? { ok: false, held: now, reason: "claim held" } : { ok: false, reason: `push refused: ${last}` };
}

/** Release: a tombstone commit on top of our claim (no ref delete: the pre-push hook and the proxy refuse those). { ok, reason }. */
export function releaseClaim(key, me, { cwd = ROOT, remote = "origin", at = new Date().toISOString() } = {}) {
  const cur = readClaim(key, { cwd, remote });
  if (!isHeld(cur)) return { ok: true, reason: "already free" };
  if (cur.claim?.by !== me) return { ok: false, reason: `held by ${cur.claim?.by || "?"}, not ${me}` };
  const r = pushOn(key, cur.sha, { released: true, by: me, at, lane: cur.claim.lane ?? null, pr: cur.claim.pr ?? null }, { cwd, remote });
  return r.ok ? { ok: true, reason: "" } : { ok: false, reason: r.reason };
}

const claimLine = (key, c) => `${CLAIM_NS}/${key} held by ${c.claim?.by || "?"} since ${c.claim?.at || "?"}${c.claim?.title ? ` (${c.claim.title})` : ""}`;

// ---- CLI -------------------------------------------------------------------

const BOOL = new Set(["json", "no-claim"]);
const VALUE = new Set(["fleet", "lane", "pr", "role", "scope", "model", "title", "source-revision", "session-json", "sessions-json",
  "override", "as", "remote"]);

function usage(log, msg) {
  if (msg) log(`launch-lane: ${msg}`);
  log("usage: launch-lane.mjs --fleet L --lane X [--pr N] --role R [--scope S] --model M --title T --source-revision B \\\n" +
    "         --session-json <saved get_session> --sessions-json <saved list_sessions> [--override \"<user's words>\"] [--no-claim] [--json]\n" +
    "       launch-lane.mjs release|who --fleet L --lane X [--pr N]");
  return 1;
}

export function main(argv, { cwd = ROOT, log = console.log, now = () => Date.now(), read = (f) => fs.readFileSync(f, "utf8"),
  mtime = (f) => fs.statSync(f).mtimeMs, claim = pushClaim, release = releaseClaim, lookup = readClaim,
  writeReceipt = (o) => writeGateReceipt(process.env.CLAUDE_PROJECT_DIR || cwd, o, now()) } = {}) {
  const f = {}, pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { pos.push(a); continue; }
    const k = a.slice(2);
    if (BOOL.has(k)) f[k] = true;
    else if (VALUE.has(k)) { const v = argv[++i]; if (v === undefined) return usage(log, `${a} needs a value`); f[k] = v; }
    else return usage(log, `unknown flag ${a}`);
  }
  const cmd = pos[0] || "gate";
  const me = whoAmI(process.env, f.as || "");
  const opts = { cwd, remote: f.remote || "origin" };
  let key;
  try { key = claimKey({ fleet: f.fleet, lane: f.lane, pr: f.pr }); } catch (e) { return usage(log, e.message); }
  try {
    if (cmd === "who") {
      const c = lookup(key, opts);
      log(isHeld(c) ? claimLine(key, c) : `= ${CLAIM_NS}/${key} free${c ? " (released)" : ""}`);
      return isHeld(c) ? 0 : 1;
    }
    if (cmd === "release") {
      if (!me) return usage(log, "no identity: pass --as <host>:<id> or set APEX_FLEET_AS");
      const r = release(key, me, opts);
      log(r.ok ? `= released ${CLAIM_NS}/${key}${r.reason ? ` (${r.reason})` : ""}` : `= release REFUSED: ${r.reason}`);
      return r.ok ? 0 : 2;
    }
    if (cmd !== "gate") return usage(log, `unknown command ${cmd}`);
    const refuse = (gate, why) => { log(f.json ? JSON.stringify({ ok: false, gate, why }) : `= launch REFUSED (${gate}): ${why}`); return 2; };

    // 1. quota
    if (!f["session-json"]) return usage(log, "--session-json is required: save `get_session` (no id) and pass the file");
    // The same freshness the launch-gate hook demands of its receipt: a saved page goes stale with the quota.
    const ageS = (now() - mtime(f["session-json"])) / 1000;
    if (ageS > PAGE_MAX_AGE_S) return refuse("quota", `--session-json is ${Math.round(ageS)} s old (max ${PAGE_MAX_AGE_S}): call get_session again and save it`);
    const session = extractSession(read(f["session-json"]));
    const q = quotaVerdict(session, f.override);
    if (!q.ok) return refuse("quota", q.why);
    // 2. revision
    const rv = revisionProblem(f["source-revision"]);
    if (rv) return refuse("revision", rv);
    // 3. twins
    if (!f["sessions-json"]) return usage(log, "--sessions-json is required: save one `list_sessions` page and pass the file");
    const selfId = me ? me.replace(/^claude:/, "") : "";
    const twins = twinsOf(extractSessions(read(f["sessions-json"])), { fleet: f.fleet, lane: f.lane, pr: f.pr, selfId });
    if (twins.length) return refuse("twin", twins.map((t) => `${t.id} (${t.why}) ${t.title}`.trim()).join("; "));
    // 4. spec (validates required launch fields before any side effect)
    const spec = launchSpec({ fleet: f.fleet, lane: f.lane, pr: f.pr, role: f.role, scope: f.scope, model: f.model, title: f.title,
      sourceRevision: f["source-revision"], orchestrator: me });
    // 5. claim (the only side effect besides the receipt)
    const at = new Date(now()).toISOString();
    let claimed = null;
    if (!f["no-claim"]) {
      if (!me) return usage(log, "no identity for the claim: pass --as <host>:<id> or set APEX_FLEET_AS (or --no-claim)");
      const c = claim(key, { by: me, at, fleet: f.fleet.toUpperCase(), lane: f.lane, pr: f.pr ? Number(f.pr) : null, title: f.title }, opts);
      if (!c.ok) return refuse("claim", c.held ? claimLine(key, c.held) : c.reason);
      claimed = `${CLAIM_NS}/${key}`;
    }
    // launch-gate.mjs's receipt (kind, ok, status, session, override, why, at), so .claude/hooks/launch-gate.py lets the
    // create_session through; the lane fields ride along.
    writeReceipt({ ok: true, status: q.status, session: session.id || null, override: q.override || null, why: q.why,
      by: me, fleet: f.fleet.toUpperCase(), lane: f.lane, pr: f.pr ? Number(f.pr) : null, claim: claimed, spec });
    if (f.json) log(JSON.stringify({ ok: true, claim: claimed, spec }));
    else {
      log(`= launch ok: quota ${q.status}${q.override ? ` (override: ${q.override})` : ""}, revision ${f["source-revision"]}, no twin, ${claimed ? `claimed ${claimed}` : "no claim (--no-claim)"}`);
      log(JSON.stringify(spec));
    }
    return 0;
  } catch (e) {
    log(`launch-lane: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
