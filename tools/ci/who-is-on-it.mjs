#!/usr/bin/env node
// who-is-on-it.mjs — who pushed what, recently, before you fix a red you did not cause.
// @doc Recent pushes per remote branch and which touched the paths you name — the claim check before fixing a shared red.
// @skill check-changes
//
// docs/notes/SHARED-BRANCH-COORDINATION.md: three sessions fixed one bug on
// 2026-09-18 and one reverted the other two, because nothing mechanical said
// "someone is already on it". This is that check. It fetches, lists every
// remote branch with a commit inside the window (newest first, author and
// subject), and when you name paths it lists the commits inside the window
// that touched them — a fix that already landed shows up here before you
// write it again. It writes nothing and never pushes.
//
//   node tools/ci/who-is-on-it.mjs                      # every branch, last 6 h
//   node tools/ci/who-is-on-it.mjs --hours 24 js/game.js tests/specs/autopilot.spec.js
//   node tools/ci/who-is-on-it.mjs --no-fetch --json
//
// Exit 0 always (it informs; the reading is yours). A branch is "live" when
// its tip is inside the window; the deploy branch is always listed.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const DEPLOY = "claude/f1-game-project-26h3ng";
const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("usage: node tools/ci/who-is-on-it.mjs [--hours N] [--no-fetch] [--json] [path ...]");
  process.exit(0);
}
const opt = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const hours = Number(opt("--hours", "6")) || 6;
const json = argv.includes("--json");
const noFetch = argv.includes("--no-fetch");
const paths = argv.filter((a, i) => !a.startsWith("--") && argv[i - 1] !== "--hours");

const git = (...args) => {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return r.status === 0 ? r.stdout : "";
};

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
  .filter((r) => r.ref !== "HEAD");
const live = refs.filter((r) => r.t >= since || r.ref === DEPLOY);

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

const ago = (t) => { const m = Math.round((Date.now() / 1000 - t) / 60); return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`; };
if (json) {
  console.log(JSON.stringify({ hours, fetched, live, touched }, null, 2));
} else {
  console.log(`# who is on it — remote branches with a commit in the last ${hours} h${fetched ? "" : " (NOT fetched: --no-fetch or offline)"}`);
  if (!live.length) console.log("(none)");
  for (const r of live) console.log(`${ago(r.t).padStart(7)} ago  ${r.sha}  ${r.ref}${r.ref === DEPLOY ? "  [deploy]" : ""}  — ${r.author}: ${r.subject}`);
  if (paths.length) {
    console.log(`\n# commits in the window that touched: ${paths.join(" ")}`);
    if (!touched.length) console.log("(none — nobody has pushed a change to these paths in the window)");
    const seen = new Set();
    for (const c of touched) {
      const k = c.sha; if (seen.has(k)) continue; seen.add(k);
      console.log(`${c.sha}  ${c.when.padEnd(14)} ${c.branch}  — ${c.author}: ${c.subject}`);
    }
  }
  console.log("\nA fix already here, or a branch on these paths minutes ago, means stand down or coordinate — not a second fix.");
}
