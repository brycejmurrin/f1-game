#!/usr/bin/env node
// who-is-on-it.mjs — who pushed what, recently, and who has CLAIMED what, before you fix a red you did not cause.
// @doc Recent pushes per branch, who touched your paths, live claims on the `claude/claims-board` branch: the check before fixing a shared red.
// Full description: Recent pushes per remote branch, which touched the paths you name, and the live claims on the claude/claims-board branch (plus any legacy claude/claims/* branches) — the claim check before fixing a shared red.
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
// CLAIMS live on ONE branch, claude/claims-board (since 2026-10-03): its tree
// holds one file per live claim, named by claimSlug and carrying
// `<unix time>\t<who>\t<text>`. `--claim "<text>"` commits that file on top
// of the board's tip and pushes (a plain fast-forward; on a race it refetches
// and retries); `--release` commits the file's removal. Every write also drops
// claims older than BOARD_MAX_MIN, so the board cleans itself. Before that,
// every claim was its own claude/claims/<slug> branch, and because an agent
// cannot delete a ref (below) 182, then 73 of them piled up in the branch
// list; those legacy branches are still read until prune-branches ages them
// out. Every run lists the live claims with their age, so "I am on the autopilot red" is
// visible to the next session BEFORE it starts, with no commit on any working
// branch (the objection the coordination note records against claim files).
// A claim older than STALE_MIN prints as stale: it informs, nothing enforces
// it, and a session that forgot to release blocks nobody.
//
// Why a claude/* branch and a removal COMMIT, not a ref namespace and a
// delete: measured 2026-09-22, the remote containers' git proxy accepts a push
// to refs/heads/claude/* only (refs/claims/* → 403) and refuses ref deletion
// over both git and the REST API (403), so "released" has to be a state, not
// an absence — on the board, a commit that removes the file.
//
//   node tools/ci/who-is-on-it.mjs                      # every branch, last 6 h, every live claim
//   node tools/ci/who-is-on-it.mjs --hours 24 js/game.js tests/specs/autopilot.spec.js
//   node tools/ci/who-is-on-it.mjs --claim "fixing the autopilot red on the deploy tip"
//   node tools/ci/who-is-on-it.mjs --release
//   node tools/ci/who-is-on-it.mjs --no-fetch --json
//
// Read-only listing exits 0 (it informs); invalid claim/CLI arguments exit 1. A branch is "live" when
// its tip is inside the window; the deploy branch is always listed; claims
// branches are never listed as branches.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEPLOY = "claude/f1-game-project-26h3ng";
export const CLAIMS_PREFIX = "claude/claims/";
export const RELEASED = "released";
export const STALE_MIN = 120;
export const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
export const CLAIMS_BOARD = "claude/claims-board";
export const BOARD_MAX_MIN = 24 * 60;

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
};

/** The session this process belongs to, short and filename-safe. */
export const sessionId = (env = process.env) => {
  const id = env.APEX_SESSION_ID || env.CODEX_THREAD_ID || env.CLAUDE_CODE_SESSION_ID || env.CLAUDE_SESSION_ID;
  return id ? createHash("sha256").update(String(id)).digest("hex").slice(0, 24) : null;
};

/** `claude/fix-autopilot` + session -> `fix-autopilot-ab12cd34ef56`.
 *
 *  THE SESSION IS PART OF THE REF, not decoration. Keying on the branch alone
 *  was worse than having no tool: AGENTS.md says other sessions develop
 *  DIRECTLY on the deploy branch, so every one of them resolved to the single
 *  ref `claude/claims/f1-game-project-26h3ng`, and pushClaim force-pushes — so
 *  session B's claim silently erased session A's, and A's `--release` then
 *  tombstoned B's live claim. A tool that exists to stop two sessions
 *  colliding must not make them collide. The `--` slash folding had the same
 *  shape on its own: `claude/a/b` and `claude/a--b` are different branches
 *  that produced one ref. */
export const claimSlug = (branch, session = sessionId()) => {
  if (!session) throw new Error("Claim slug requires a session identifier");
  return `${branch.replace(/^claude\//, "").replace(/\//g, "--")}-${session}`;
};

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
    // A TOMBSTONE is the message this tool writes for --release and nothing
    // else. `startsWith("released")` read a perfectly live claim worded
    // "released the c1Pileup lock, now on the autopilot red" as a release, so
    // it vanished from the listing for every session including its own author.
    // The text part is everything before the `  [branch; session …]` tag.
    const body = msg.replace(/\s\s\[[^\]]*\]\s*$/, "");
    return { slug, who, text: msg, at, ageMin, stale: ageMin > STALE_MIN, released: body === RELEASED };
  }).sort((a, b) => b.at - a.at);
}

/** The commit a claim branch points at: the empty tree, the text as the message. */
export function claimCommit(text, branch, session) {
  const tag = [branch, session ? `session ${session}` : ""].filter(Boolean).join("; ");
  const msg = tag ? `${text}  [${tag}]` : text;
  // A claim records WHO, so the configured identity is used whenever there is
  // one. Where there is none — a CI runner, a fresh container before any
  // `git config` — `commit-tree` dies with "Author identity unknown" (it took
  // this file's own unit test red on CI run 4651), and a coordination tool
  // that refuses to run on an unconfigured box is worse than one that signs
  // the claim "unknown". So: fall back, never fail.
  const r = spawnSync("git", ["commit-tree", EMPTY_TREE, "-m", msg], { cwd: ROOT, encoding: "utf8", env: identityEnv(ROOT) });
  if (r.status !== 0) throw new Error("commit-tree failed: " + r.stderr);
  return r.stdout.trim();
}

function identityEnv(cwd) {
  const env = { ...process.env };
  if (!spawnSync("git", ["config", "user.email"], { cwd, encoding: "utf8" }).stdout.trim()) {
    env.GIT_AUTHOR_NAME = env.GIT_COMMITTER_NAME = "apex26 claim";
    env.GIT_AUTHOR_EMAIL = env.GIT_COMMITTER_EMAIL = "claim@apex26.invalid";
  }
  return env;
}

/** Board files -> claims, the same shape parseClaims returns. Pure.
 *  files: [{ slug, content: "<unix>\t<who>\t<text>" }]. */
export function parseBoard(files, now = Math.floor(Date.now() / 1000)) {
  return files.map(({ slug, content }) => {
    const [t, who, ...s] = String(content).replace(/\n$/, "").split("\t");
    const at = Number(t) || 0;
    const ageMin = Math.max(0, Math.round((now - at) / 60));
    return { slug, who: who || "", text: s.join("\t"), at, ageMin, stale: ageMin > STALE_MIN, released: false };
  }).sort((a, b) => b.at - a.at);
}

/** The board after one write. Pure: drops `slug` (a release, or the claim
 *  being replaced), drops claims older than BOARD_MAX_MIN, adds `content`. */
export function nextBoard(files, slug, content, now = Math.floor(Date.now() / 1000)) {
  const keep = files.filter((f) => f.slug !== slug && parseBoard([f], now)[0].ageMin <= BOARD_MAX_MIN);
  if (content != null) keep.push({ slug, content });
  return keep.sort((a, b) => (a.slug < b.slug ? -1 : 1));
}

/** The board's files at `rev` ([] when the board does not exist yet). */
export function readBoard(rev, cwd = ROOT) {
  const run = (...a) => spawnSync("git", a, { cwd, encoding: "utf8" });
  if (run("rev-parse", "--verify", "--quiet", rev + "^{commit}").status !== 0) return [];
  return run("ls-tree", rev).stdout.split("\n").filter(Boolean).map((l) => {
    const [meta, slug] = l.split("\t");
    return { slug, content: run("cat-file", "blob", meta.split(" ")[2]).stdout };
  });
}

/** Commit the board with `slug` set to `content` (null = removed) and push it
 *  as a fast-forward; a lost race refetches and retries. */
export function pushBoard(slug, content, { cwd = ROOT, remote = "origin", message = "claims", tries = 5 } = {}) {
  const run = (a, input) => spawnSync("git", a, { cwd, encoding: "utf8", input, env: identityEnv(cwd), timeout: 60_000 });
  const tracking = `refs/remotes/${remote}/${CLAIMS_BOARD}`;
  let err = "";
  for (let i = 0; i < tries; i++) {
    run(["fetch", "--quiet", remote, `+refs/heads/${CLAIMS_BOARD}:${tracking}`]);
    const tip = run(["rev-parse", "--verify", "--quiet", tracking]).stdout.trim();
    const files = nextBoard(readBoard(tracking, cwd), slug, content);
    const lines = files.map((f) => `100644 blob ${run(["hash-object", "-w", "--stdin"], f.content).stdout.trim()}\t${f.slug}`);
    const tree = run(["mktree"], lines.length ? lines.join("\n") + "\n" : "").stdout.trim();
    const commit = run(["commit-tree", tree, ...(tip ? ["-p", tip] : []), "-m", message]).stdout.trim();
    const r = run(["push", "--quiet", remote, `${commit}:refs/heads/${CLAIMS_BOARD}`]);
    if (r.status === 0) { run(["update-ref", tracking, commit]); return { ok: true, ref: CLAIMS_BOARD + ":" + slug, sha: commit.slice(0, 7), err: "" }; }
    err = (r.stderr || "").trim().split("\n").filter((l) => !/^remote:|^To |^\s*$/.test(l)).join(" ");
  }
  return { ok: false, ref: CLAIMS_BOARD + ":" + slug, sha: "", err };
}

export function currentBranch() {
  return git("rev-parse", "--abbrev-ref", "HEAD").trim();
}

function pushClaim(text, branch, session) {
  const slug = claimSlug(branch, session);
  const who = git("config", "user.name").trim() || "apex26 claim";
  const tag = `  [${branch}; session ${session}]`;
  const content = text === RELEASED ? null : `${Math.floor(Date.now() / 1000)}\t${who}\t${text}${tag}\n`;
  return pushBoard(slug, content, { message: `${text === RELEASED ? "release" : "claim"} ${slug}` });
}

export function main(argv = process.argv.slice(2)) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log('usage: node tools/ci/who-is-on-it.mjs [--hours N] [--session ID] [--no-fetch] [--json] [--claim "<text>" | --release] [path ...]');
    return 0;
  }
  const opt = (name, dflt) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
  };
  const known = new Set(["--hours", "--session", "--claim", "--release", "--no-fetch", "--json"]);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("-") && !known.has(argv[i])) { console.error(`Unknown option: ${argv[i]}`); return 1; }
    if (["--hours", "--session", "--claim"].includes(argv[i])) {
      if (!argv[i + 1] || argv[i + 1].startsWith("-")) { console.error(`${argv[i]} requires a value`); return 1; }
      i++;
    }
  }
  const hours = Number(opt("--hours", "6"));
  if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) { console.error("--hours must be in (0, 8760]"); return 1; }
  const session = argv.includes("--session") ? sessionId({ APEX_SESSION_ID: opt("--session") }) : sessionId();
  const json = argv.includes("--json");
  const noFetch = argv.includes("--no-fetch");
  const claim = opt("--claim", "");
  const release = argv.includes("--release");
  const paths = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--hours" && argv[i - 1] !== "--claim" && argv[i - 1] !== "--session");

  if ((claim || release) && !session) { console.error("Claim/release requires --session ID or APEX_SESSION_ID/CODEX_THREAD_ID/Claude session id. Reuse the same ID to release."); return 1; }
  if (claim && release) { console.error("Choose --claim or --release"); return 1; }

  // Claim / release first, so the listing that follows shows the result.
  const branch = currentBranch();
  let claimed = null;
  if (claim || release) {
    if (!branch || branch === "HEAD") { console.error("who-is-on-it: not on a branch, nothing to claim"); return 0; }
    claimed = { action: release ? "release" : "claim", ...pushClaim(release ? RELEASED : claim, branch, session) };
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
    .filter((r) => r.ref !== "HEAD" && !r.ref.startsWith(CLAIMS_PREFIX) && r.ref !== CLAIMS_BOARD);
  const live = refs.filter((r) => r.t >= since || r.ref === DEPLOY);
  // The board, plus legacy claude/claims/* branches until they are pruned.
  const claims = [...parseBoard(readBoard(`refs/remotes/origin/${CLAIMS_BOARD}`)),
    ...parseClaims(git("for-each-ref", "--format=%(committerdate:unix)%09%(refname)%09%(authorname)%09%(subject)",
      `refs/remotes/origin/${CLAIMS_PREFIX}`))].sort((a, b) => b.at - a.at);
  const active = claims.filter((c) => !c.released);

  // One row per commit: a commit on the deploy branch is reachable from every
  // topic branch cut from it, so a per-branch log listed it once per branch.
  // `branch` prefers the deploy branch; `branches` names every one carrying it.
  const touchedBy = new Map();
  if (paths.length) {
    for (const r of [...live].sort((a, b) => (b.ref === DEPLOY) - (a.ref === DEPLOY))) {
      const log = git("log", `--since=${hours} hours ago`, "--format=%h%x09%an%x09%ar%x09%s", `origin/${r.ref}`, "--", ...paths);
      for (const line of log.split("\n").filter(Boolean)) {
        const [sha, author, when, ...s] = line.split("\t");
        const seen = touchedBy.get(sha);
        if (seen) { if (!seen.branches.includes(r.ref)) seen.branches.push(r.ref); continue; }
        touchedBy.set(sha, { branch: r.ref, branches: [r.ref], sha, author, when, subject: s.join("\t") });
      }
    }
  }
  const touched = [...touchedBy.values()];

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
  console.log(`\n# claims (${CLAIMS_BOARD}; stale after ${STALE_MIN} min — informs, never blocks)`);
  // "No claims" and "could not look" are OPPOSITE answers and must never print
  // the same. A failed fetch reads every list here off stale local refs, and
  // this tool exists precisely so a session does not start fixing what someone
  // else already claimed — so say the list is UNTRUSTWORTHY, not empty.
  if (!fetched) console.log("  !! FETCH FAILED (or --no-fetch): every list below is stale local state.");
  if (!fetched) console.log("     An empty claim list here means NOTHING WAS READ, not that nobody is on it.");
  if (!active.length) {
    console.log(fetched
      ? '(none — nobody has claimed anything; --claim "<text>" to say what you are on)'
      : "(no claims in stale local refs — re-run with the network up before trusting this)");
  }
  const mine = session ? claimSlug(branch, session) : null;
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
