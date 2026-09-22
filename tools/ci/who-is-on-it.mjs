#!/usr/bin/env node
// who-is-on-it.mjs — who pushed what, recently, and who has CLAIMED what, before you fix a red you did not cause.
// @doc Recent pushes per remote branch, which touched the paths you name, and the live claims under claude/claims/* — the claim check before fixing a shared red.
// @skill check-changes
//
// docs/notes/SHARED-BRANCH-COORDINATION.md: three sessions fixed one bug on
// 2026-09-18 and one reverted the other two, because nothing mechanical said
// "someone is already on it". This is that check, in two halves:
//
// PUSHES. It fetches, lists every remote branch with a commit inside the
// window (newest first, author and subject), and when you name paths it lists
// the commits inside the window that touched them — a fix that already landed
// shows up here before you write it again.
//
// CLAIMS. `--claim "<text>"` pushes ONE tiny branch, claude/claims/<slug of
// your branch>, whose tip is an empty-tree commit carrying the text and your
// git identity; `--release` overwrites it with a "released" tombstone. Every
// run lists the live claims with their age, so "I am on the autopilot red" is
// visible to the next session BEFORE it starts, with no commit on any working
// branch (the objection the coordination note records against claim files).
// A claim older than STALE_MIN prints as stale: it informs, nothing enforces
// it, and a session that forgot to release blocks nobody.
//
// Why a branch and a tombstone, not a ref namespace and a delete: measured
// 2026-09-22, the remote containers' git proxy accepts a push to refs/heads/
// claude/* only (refs/claims/* → 403) and refuses ref deletion over both git
// and the REST API (403), so "released" has to be a state, not an absence.
// Delete a tombstoned claims branch by hand from a machine that may.
//
//   node tools/ci/who-is-on-it.mjs                      # every branch, last 6 h, every live claim
//   node tools/ci/who-is-on-it.mjs --hours 24 js/game.js tests/specs/autopilot.spec.js
//   node tools/ci/who-is-on-it.mjs --claim "fixing the autopilot red on the deploy tip"
//   node tools/ci/who-is-on-it.mjs --release
//   node tools/ci/who-is-on-it.mjs --no-fetch --json
//
// Exit 0 always (it informs; the reading is yours). A branch is "live" when
// its tip is inside the window; the deploy branch is always listed; claims
// branches are never listed as branches.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEPLOY = "claude/f1-game-project-26h3ng";
export const CLAIMS_PREFIX = "claude/claims/";
export const RELEASED = "released";
export const STALE_MIN = 120;
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
};

/** `claude/fix-autopilot` -> `fix-autopilot`; any other slash becomes `--`. */
export const claimSlug = (branch) => branch.replace(/^claude\//, "").replace(/\//g, "--");

/** for-each-ref lines for the claims branches -> claims with age. Pure: `now`
 *  is unix seconds. Line shape:
 *  `<committerdate:unix>\t<refname>\t<authorname>\t<subject>`, refname being
 *  refs/remotes/origin/claude/claims/<slug> (or the bare branch name). */
export function parseClaims(text, now = Math.floor(Date.now() / 1000)) {
  return text.split("\n").filter(Boolean).map((l) => {
    const [t, ref, who, ...s] = l.split("\t");
    const at = Number(t) || 0;
    const ageMin = Math.max(0, Math.round((now - at) / 60));
    const slug = ref.replace(/^refs\/remotes\/origin\//, "").replace(/^refs\/heads\//, "").replace(CLAIMS_PREFIX, "");
    const msg = s.join("\t");
    return { slug, who, text: msg, at, ageMin, stale: ageMin > STALE_MIN, released: msg.startsWith(RELEASED) };
  }).sort((a, b) => b.at - a.at);
}

/** The commit a claim branch points at: the empty tree, the text as the message. */
export function claimCommit(text, branch, session) {
  const tag = [branch, session ? `session ${session}` : ""].filter(Boolean).join("; ");
  const msg = tag ? `${text}  [${tag}]` : text;
  const r = spawnSync("git", ["commit-tree", EMPTY_TREE, "-m", msg], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) throw new Error("commit-tree failed: " + r.stderr);
  return r.stdout.trim();
}

export function currentBranch() {
  return git("rev-parse", "--abbrev-ref", "HEAD").trim();
}

function pushClaim(text, branch) {
  const session = (process.env.CLAUDE_CODE_SESSION_ID || process.env.CLAUDE_SESSION_ID || "").slice(0, 12);
  const sha = claimCommit(text, branch, session);
  const ref = `refs/heads/${CLAIMS_PREFIX}${claimSlug(branch)}`;
  // `+` because every claim commit is parentless: the update is never a fast-forward.
  const r = spawnSync("git", ["push", "--quiet", "origin", `+${sha}:${ref}`], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
  if (r.status === 0) spawnSync("git", ["update-ref", `refs/remotes/origin/${CLAIMS_PREFIX}${claimSlug(branch)}`, sha], { cwd: ROOT });
  return { ok: r.status === 0, ref, sha: sha.slice(0, 7), err: (r.stderr || "").trim().split("\n").filter((l) => !/^remote:|^To |^\s*$/.test(l)).join(" ") };
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log('usage: node tools/ci/who-is-on-it.mjs [--hours N] [--no-fetch] [--json] [--claim "<text>" | --release] [path ...]');
    return 0;
  }
  const opt = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const hours = Number(opt("--hours", "6")) || 6;
  const json = argv.includes("--json");
  const noFetch = argv.includes("--no-fetch");
  const claim = opt("--claim", "");
  const release = argv.includes("--release");
  const paths = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--hours" && argv[i - 1] !== "--claim");

  // Claim / release first, so the listing that follows shows the result.
  const branch = currentBranch();
  let claimed = null;
  if (claim || release) {
    if (!branch || branch === "HEAD") { console.error("who-is-on-it: not on a branch, nothing to claim"); return 0; }
    claimed = { action: release ? "release" : "claim", ...pushClaim(release ? RELEASED : claim, branch) };
  }

  let fetched = false;
  if (!noFetch) {
    const r = spawnSync("git", ["fetch", "--prune", "--quiet", "origin"], { cwd: ROOT, encoding: "utf8", timeout: 60_000 });
    fetched = r.status === 0;
  }
  const since = Math.floor(Date.now() / 1000) - hours * 3600;
  const refs = git("for-each-ref", "--sort=-committerdate",
    "--format=%(committerdate:unix)%09%(refname:short)%09%(authorname)%09%(objectname:short)%09%(subject)",
    "refs/remotes/origin")
    .split("\n").filter(Boolean)
    .map((l) => { const [t, ref, author, sha, ...s] = l.split("\t"); return { t: Number(t), ref: ref.replace(/^origin\//, ""), author, sha, subject: s.join("\t") }; })
    .filter((r) => r.ref !== "HEAD" && !r.ref.startsWith(CLAIMS_PREFIX));
  const live = refs.filter((r) => r.t >= since || r.ref === DEPLOY);
  const claims = parseClaims(git("for-each-ref", "--format=%(committerdate:unix)%09%(refname)%09%(authorname)%09%(subject)",
    `refs/remotes/origin/${CLAIMS_PREFIX}`));
  const active = claims.filter((c) => !c.released);

  const touched = [];
  if (paths.length) {
    for (const r of live) {
      const log = git("log", `--since=${hours} hours ago`, "--format=%h%x09%an%x09%ar%x09%s", `origin/${r.ref}`, "--", ...paths);
      for (const line of log.split("\n").filter(Boolean)) {
        const [sha, author, when, ...s] = line.split("\t");
        touched.push({ branch: r.ref, sha, author, when, subject: s.join("\t") });
      }
    }
  }

  const ago = (min) => min < 90 ? `${min} min` : `${Math.round(min / 60)} h`;
  if (json) {
    console.log(JSON.stringify({ hours, fetched, branch, claimed, live, claims, touched }, null, 2));
    return 0;
  }
  if (claimed) {
    console.log(claimed.ok ? `# ${claimed.action === "release" ? "released" : "claimed"} ${claimed.ref} @ ${claimed.sha}`
                           : `# ${claimed.action} FAILED for ${claimed.ref}: ${claimed.err}`);
  }
  console.log(`# who is on it — remote branches with a commit in the last ${hours} h${fetched ? "" : " (NOT fetched: --no-fetch or offline)"}`);
  if (!live.length) console.log("(none)");
  for (const r of live) console.log(`${ago(Math.round((Date.now() / 1000 - r.t) / 60)).padStart(7)} ago  ${r.sha}  ${r.ref}${r.ref === DEPLOY ? "  [deploy]" : ""}  — ${r.author}: ${r.subject}`);
  console.log(`\n# claims (${CLAIMS_PREFIX}*; stale after ${STALE_MIN} min — informs, never blocks)`);
  if (!active.length) console.log('(none — nobody has claimed anything; --claim "<text>" to say what you are on)');
  const mine = claimSlug(branch);
  for (const c of active) console.log(`${ago(c.ageMin).padStart(7)} ago  ${c.stale ? "STALE " : "      "}${c.slug}${c.slug === mine ? "  [you]" : ""}  — ${c.who}: ${c.text}`);
  if (paths.length) {
    console.log(`\n# commits in the window that touched: ${paths.join(" ")}`);
    if (!touched.length) console.log("(none — nobody has pushed a change to these paths in the window)");
    const seen = new Set();
    for (const c of touched) {
      const k = c.sha; if (seen.has(k)) continue; seen.add(k);
      console.log(`${c.sha}  ${c.when.padEnd(14)} ${c.branch}  — ${c.author}: ${c.subject}`);
    }
  }
  console.log("\nA fix already here, a live claim on it, or a branch on these paths minutes ago, means stand down or coordinate — not a second fix.");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
