#!/usr/bin/env node
/**
 * @doc Publish review screenshots to a shots/<topic> evidence branch cut from the ship tip, touching no PR branch.
 * @section runner
 * @skill steward
 *
 * Why: pushing PNGs for review took four attempts (orphan branch fails test:guards; hooks inspect the
 * commit before the command runs; a bare worktree has no node_modules). This is the working recipe,
 * in one command:
 *
 *   node tools/ci/publish-shots.mjs <topic> <png...> [--readme "file.png=what it proves" ...]
 *                                   [--map shots.json] [--append] [--dry-run] [--message "subject"]
 *
 * It fetches the ship branch, cuts `shots/<topic>` from the fresh tip in a TEMPORARY WORKTREE under
 * artifacts/publish-shots/ (outside the working tree's tracked files), copies the PNGs to
 * shots/<topic>/, writes shots/<topic>/README.md (one line per file saying what it proves), links
 * node_modules into the worktree as its own step, `git add -f shots`, commits through the repo hooks
 * (a normal commit on ship, so test:guards passes), pushes plain (never force), prints the branch,
 * commit sha and raw URLs, then removes the worktree and the local branch.
 *
 *   - node_modules MUST exist in the checkout you run it from: the commit hook needs the repo tools.
 *   - Only PNGs, each at most 400 KB (downscale first; the refusal names the file).
 *   - A topic already on origin is refused unless --append (fetch, add on top, fast-forward push).
 *   - It can never push to a branch that is not named shots/<name>.
 *   - --dry-run does everything except commit and push, prints the plan, and cleans up.
 *   - --map is a JSON object {"file.png": "what it proves"}; --readme entries win over it.
 *
 * Exit: 0 published (or dry run), 1 refused or failed.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const DEPLOY = "claude/f1-game-project-26h3ng";
export const REMOTE = "origin";
export const MAX_BYTES = 400 * 1024;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const TOPIC_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BRANCH_RE = /^shots\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.png$/i;

export const HELP = `usage: node tools/ci/publish-shots.mjs <topic> <png...> [options]

Publishes screenshots to branch shots/<topic>, cut from origin/${DEPLOY} in a
temporary worktree under artifacts/publish-shots/. No PR branch is touched and
nothing but shots/* is ever pushed.

  --readme "file.png=what it proves"   one README line per file (repeatable)
  --map <json>                         {"file.png": "what it proves"}
  --append                             topic already on origin: add a commit on top (plain push)
  --dry-run                            do everything except commit/push; print the plan
  --message "subject"                  commit subject (default: shots: <topic>)
  --help

Requirements: node_modules must exist in this checkout. The commit goes through the
repo hooks (test:guards), which need the repo tools; the tool symlinks node_modules into
the temp worktree as a separate step BEFORE invoking git commit. PNGs only, each <= 400 KB.`;

export class Refusal extends Error {}
const refuse = (m) => { throw new Refusal(m); };

/** The one push guard: anything but shots/<name> throws, so no code path can reach another branch. */
export function assertShotsBranch(branch) {
  if (typeof branch !== "string" || !BRANCH_RE.test(branch) || branch.includes("..")) {
    refuse(`refusing to touch branch ${JSON.stringify(branch)}: only shots/<name> is allowed`);
  }
  return branch;
}

export function parseArgs(argv) {
  const o = { positional: [], readme: [], map: null, append: false, dryRun: false, message: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.startsWith("--") && a.includes("=") ? a.indexOf("=") : -1;
    const name = eq > 0 ? a.slice(0, eq) : a;
    const inline = eq > 0 ? a.slice(eq + 1) : undefined;
    const take = () => (inline !== undefined ? inline : argv[++i] === undefined ? refuse(`${name} needs a value`) : argv[i]);
    if (a === "--help" || a === "-h" || a === "help") o.help = true;
    else if (name === "--readme") o.readme.push(take());
    else if (name === "--map") o.map = take();
    else if (name === "--message") o.message = take();
    else if (a === "--append") o.append = true;
    else if (a === "--dry-run") o.dryRun = true;
    else if (a.startsWith("--")) refuse(`unknown flag ${name}\n${HELP}`);
    else o.positional.push(a);
  }
  return o;
}

/** "shots/foo" and "foo" both name the topic; any other prefix or odd character is refused. */
export function normalizeTopic(raw) {
  const t = raw && raw.startsWith("shots/") ? raw.slice("shots/".length) : raw;
  if (!t || !TOPIC_RE.test(t) || t.includes("..") || t.endsWith(".lock")) {
    refuse(`bad topic ${JSON.stringify(raw)}: use a plain name ([A-Za-z0-9._-]), the branch becomes shots/<topic>`);
  }
  return t;
}

/** Every file must be a real PNG (extension AND signature) of at most MAX_BYTES; one report for all. */
export function validateFiles(files) {
  const bad = [];
  const out = [];
  const seen = new Set();
  for (const f of files) {
    const name = path.basename(f);
    let st;
    try { st = fs.statSync(f); } catch { bad.push(`${f}: not found`); continue; }
    if (!st.isFile()) { bad.push(`${f}: not a regular file`); continue; }
    if (!/\.png$/i.test(name) || !NAME_RE.test(name)) {
      bad.push(`${name}: not a PNG (need a .png file with a plain name; no JPEG/GIF/WebP)`);
      continue;
    }
    const head = Buffer.alloc(8);
    const fd = fs.openSync(f, "r");
    try { fs.readSync(fd, head, 0, 8, 0); } finally { fs.closeSync(fd); }
    if (!head.equals(PNG_MAGIC)) { bad.push(`${name}: not a PNG (bad signature)`); continue; }
    if (st.size > MAX_BYTES) {
      bad.push(`${name}: ${(st.size / 1024).toFixed(0)} KB is over the 400 KB limit — downscale it first `
        + `(e.g. \`convert in.png -resize 50% out.png\` or re-capture smaller)`);
      continue;
    }
    if (seen.has(name)) { bad.push(`${name}: listed twice`); continue; }
    seen.add(name);
    out.push({ src: path.resolve(f), name, bytes: st.size });
  }
  if (bad.length) refuse(`refusing ${bad.length} file(s):\n  - ${bad.join("\n  - ")}`);
  if (!out.length) refuse("no PNG files given: pass at least one .png after the topic");
  return out;
}

/** README descriptions from --readme "file=text" (wins) and --map json; unknown names are an error. */
export function collectNotes(readmeArgs, mapPath, files) {
  const notes = {};
  if (mapPath) {
    let j;
    try { j = JSON.parse(fs.readFileSync(mapPath, "utf8")); } catch (e) { refuse(`--map ${mapPath}: ${e.message}`); }
    if (!j || typeof j !== "object" || Array.isArray(j)) refuse(`--map ${mapPath}: expected a JSON object {"file.png": "text"}`);
    for (const [k, v] of Object.entries(j)) notes[path.basename(k)] = String(v);
  }
  for (const r of readmeArgs) {
    const i = r.indexOf("=");
    if (i <= 0) refuse(`--readme ${JSON.stringify(r)}: expected "file.png=what it proves"`);
    notes[path.basename(r.slice(0, i).trim())] = r.slice(i + 1).trim();
  }
  const names = new Set(files.map((f) => f.name));
  const stray = Object.keys(notes).filter((k) => !names.has(k));
  if (stray.length) refuse(`README text given for file(s) not in the list: ${stray.join(", ")}`);
  return notes;
}

export function readmeLine(name, text) {
  return `- \`${name}\` — ${(text || "(no description given)").replace(/\s*\n\s*/g, " ")}`;
}

/** https://raw.githubusercontent.com URLs when the remote is a GitHub repo, else null. */
export function rawBase(remoteUrl, branch) {
  const m = /github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(remoteUrl || "");
  return m ? `https://raw.githubusercontent.com/${m[1]}/${m[2]}/refs/heads/${branch}` : null;
}

function makeGit(cwd) {
  return (args, { ok = [0] } = {}) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (!ok.includes(r.status)) {
      refuse(`git ${args.join(" ")} failed (exit ${r.status}):\n${(r.stdout || "") + (r.stderr || "")}`.trimEnd());
    }
    return (r.stdout || "").trim();
  };
}

/** The checkout's own node_modules, else the main checkout's (linked worktrees share it). */
function findNodeModules(top, git) {
  const here = path.join(top, "node_modules");
  if (fs.existsSync(here)) return fs.realpathSync(here);
  const common = git(["rev-parse", "--path-format=absolute", "--git-common-dir"]);
  const main = path.join(path.dirname(common), "node_modules");
  if (fs.existsSync(main)) return fs.realpathSync(main);
  return null;
}

export function publish(opts, cwd = process.cwd(), log = console.log) {
  const topic = normalizeTopic(opts.positional[0]);
  const branch = assertShotsBranch(`shots/${topic}`);
  const files = validateFiles(opts.positional.slice(1));
  const notes = collectNotes(opts.readme, opts.map, files);

  const git0 = makeGit(cwd);
  const top = git0(["rev-parse", "--show-toplevel"]);
  const git = makeGit(top);
  const nm = findNodeModules(top, git);
  if (!nm) {
    refuse("node_modules not found: run `npm install` first — the commit goes through the repo hooks "
      + "(test:guards) and they need the repo tools");
  }

  // Remote state, read-only.
  const remoteUrl = git(["remote", "get-url", REMOTE]);
  const onRemote = git(["ls-remote", "--heads", REMOTE, `refs/heads/${branch}`]) !== "";
  if (onRemote && !opts.append) {
    refuse(`${branch} already exists on ${REMOTE}; pass --append to add a commit on top, or pick another topic`);
  }
  if (!onRemote && opts.append) refuse(`--append: ${branch} does not exist on ${REMOTE} yet; drop --append to create it`);
  if (git(["branch", "--list", branch]) !== "") {
    refuse(`a local branch ${branch} already exists in this checkout; delete it (git branch -D ${branch}) or pick another topic`);
  }

  git(["fetch", "--quiet", REMOTE, `+refs/heads/${DEPLOY}:refs/remotes/${REMOTE}/${DEPLOY}`]);
  if (onRemote) git(["fetch", "--quiet", REMOTE, `+refs/heads/${branch}:refs/remotes/${REMOTE}/${branch}`]);
  const from = onRemote ? `${REMOTE}/${branch}` : `${REMOTE}/${DEPLOY}`;
  const fromSha = git(["rev-parse", from]);

  const parent = path.join(top, "artifacts", "publish-shots");
  const dir = path.join(parent, `${topic}-${process.pid}`);
  fs.mkdirSync(parent, { recursive: true });

  log(`${opts.dryRun ? "DRY RUN — plan" : "plan"}: ${onRemote ? "append to" : "create"} ${branch} from ${from} (${fromSha.slice(0, 9)})`);
  for (const f of files) log(`  + shots/${topic}/${f.name}  ${(f.bytes / 1024).toFixed(1)} KB  ${notes[f.name] || "(no description given)"}`);
  log(`  worktree ${path.relative(top, dir)} (removed afterwards), node_modules -> ${nm}`);

  let created = false;
  try {
    git(["worktree", "add", "-q", "-b", branch, dir, from]);
    created = true;
    const wt = makeGit(dir);

    const out = path.join(dir, "shots", topic);
    fs.mkdirSync(out, { recursive: true });
    for (const f of files) {
      if (fs.existsSync(path.join(out, f.name))) {
        refuse(`${f.name} is already on ${branch}; rename the new file (nothing is overwritten)`);
      }
    }
    for (const f of files) fs.copyFileSync(f.src, path.join(out, f.name));
    const readmePath = path.join(out, "README.md");
    const lines = files.map((f) => readmeLine(f.name, notes[f.name]));
    const prior = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8").replace(/\s+$/, "") + "\n" : `# shots/${topic}\n\n`;
    fs.writeFileSync(readmePath, prior + lines.join("\n") + "\n");

    // Step: node_modules link, before git runs a commit (the hook sees the tree it will run in).
    fs.symlinkSync(nm, path.join(dir, "node_modules"), "dir");

    wt(["add", "-f", "shots"]);
    if (opts.dryRun) {
      log("dry run: staged in the temporary worktree; no commit, no push. Removing it.");
      return { dryRun: true, branch };
    }
    wt(["commit", "-q", "-m", opts.message || `shots: ${topic}`]);
    const sha = wt(["rev-parse", "HEAD"]);

    assertShotsBranch(branch);
    wt(["push", "-q", "-u", REMOTE, `refs/heads/${branch}:refs/heads/${branch}`]);

    const base = rawBase(remoteUrl, branch);
    log(`published ${branch} @ ${sha}`);
    for (const f of files) log(`  ${base ? `${base}/shots/${topic}/${f.name}` : `shots/${topic}/${f.name}`}`);
    if (!base) log(`  (remote ${remoteUrl} is not a GitHub URL: paths shown instead of raw URLs)`);
    return { branch, sha, files: files.map((f) => f.name) };
  } finally {
    if (created) {
      spawnSync("git", ["worktree", "remove", "--force", dir], { cwd: top });
      spawnSync("git", ["branch", "-D", branch], { cwd: top });
    }
    fs.rmSync(dir, { recursive: true, force: true });
    spawnSync("git", ["worktree", "prune"], { cwd: top });
  }
}

function main() {
  try {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.help) { console.log(HELP); return; }
    publish(opts);
  } catch (e) {
    if (!(e instanceof Refusal)) throw e;
    console.error(e.message);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
