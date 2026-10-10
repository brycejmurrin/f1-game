#!/usr/bin/env node
// @doc Stage the deployable site folder (Pages / Electron) from the shared allow-list; optional content-hash stamp.
// @skill check-changes
/**
 * stage.mjs — produce the same runtime tree pages.yml publishes.
 *
 *   node tools/desktop/stage.mjs --out _site
 *   node tools/desktop/stage.mjs --out desktop/dist-site --stamp
 *   node tools/desktop/stage.mjs --out _site --stamp --at 3695 --sha <hex>
 *   node tools/desktop/stage.mjs --out _site --stamp-only --sha "$GITHUB_SHA"   (pages.yml)
 *
 * Without `--stamp`, tags stay `?v=dev` (matches a local serve of the repo).
 * With `--stamp`, runs `bump-cache.mjs --apply` so packaged shells are
 * content-addressed like the live site. `--stamp-only` stamps the tree already
 * staged at `--out` without re-copying it.
 *
 * THE BUILD FORMULA LIVES HERE (2026-10-10, R3-ARCHITECTURE-10). `--at`
 * defaults to `pagesBuild()` = 2000 + `git rev-list --count HEAD` and `--sha`
 * to HEAD — the numbers pages.yml stamps at this commit. The default used to be
 * the committed version.json build, which has been frozen at 1695 since Pages
 * stopped committing builds (2026-09-01), so every desktop/Android package was
 * v1.0.1695 with no apex-sha whatever commit it came from.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import { STAGE_DIRS, STAGE_ROOT_FILES } from "./stage-files.mjs";

const require = createRequire(import.meta.url);
const { appVersionFrom, readApexVersion } = require("../../desktop/lib/version.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

/**
 * Refuse a destination `stageSite` must never delete (2026-10-10, S1). The
 * stage REPLACES `dest` with a recursive rmSync, and `--out .`, `--out ..`,
 * `--out ~` or a forgotten value (`--out --stamp`) used to resolve to the
 * working tree, its parent or a home directory. Allowed: a path that does not
 * exist, an empty directory, or the product of an earlier stage (it holds
 * index.html and version.json and none of .git, tools, tests, package.json,
 * node_modules). Never the checkout root, an ancestor of it, or anything in
 * .git or a source directory the stage copies from.
 * @param {string} dest absolute destination
 * @param {string} root the checkout being staged
 */
export function assertStageDest(dest, root) {
  const rel = path.relative(dest, root);   // "" = dest is root; no ".." = dest is an ancestor of root
  if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) {
    throw new Error(`stage: refusing --out ${dest}: it is the checkout (${root}) or contains it`);
  }
  const inside = path.relative(root, dest).split(path.sep);
  if (inside[0] === ".git" || STAGE_DIRS.includes(inside[0])) {
    throw new Error(`stage: refusing --out ${dest}: it is inside ${inside[0]}/, which the stage reads or git owns`);
  }
  if (dest === path.parse(dest).root || dest === os.homedir()) {
    throw new Error(`stage: refusing --out ${dest}: a filesystem or home root`);
  }
  if (!fs.existsSync(dest)) return;
  if (!fs.statSync(dest).isDirectory()) throw new Error(`stage: --out ${dest} exists and is not a directory`);
  const names = fs.readdirSync(dest);
  if (names.length === 0) return;
  const prior = names.includes("index.html") && names.includes("version.json")
    && !names.some((n) => [".git", "tools", "tests", "package.json", "node_modules"].includes(n));
  if (!prior) {
    throw new Error(`stage: refusing --out ${dest}: it is not empty and does not look like an earlier stage `
      + `(no index.html + version.json, or it holds .git/tools/tests/package.json). Remove it by hand if you mean it.`);
  }
}

/**
 * Copy the runtime allow-list into `outDir` (replaced if it exists).
 * @param {string} outDir absolute or repo-relative output directory
 * @param {{ root?: string }} [opts]
 * @returns {string} absolute output path
 */
export function stageSite(outDir, opts = {}) {
  const root = opts.root || ROOT;
  const dest = path.resolve(outDir);
  assertStageDest(dest, path.resolve(root));
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });

  for (const name of STAGE_ROOT_FILES) {
    const src = path.join(root, name);
    if (!fs.existsSync(src)) {
      throw new Error(`stage: missing root file ${name} (expected at ${src})`);
    }
    fs.copyFileSync(src, path.join(dest, name));
  }
  for (const name of STAGE_DIRS) {
    const src = path.join(root, name);
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) {
      throw new Error(`stage: missing directory ${name}/ (expected at ${src})`);
    }
    fs.cpSync(src, path.join(dest, name), { recursive: true, dereference: true });
  }
  return dest;
}

/** `git <args>` in `root`, trimmed stdout; throws on a non-zero exit. */
function gitOut(args, root) {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (r.status !== 0) throw new Error(`stage: git ${args.join(" ")} failed: ${(r.stderr || "").trim() || `exit ${r.status}`}`);
  return r.stdout.trim();
}

/**
 * The shell generation Pages stamps at HEAD: 2000 + the commit count. The 2000
 * offset keeps every stamped build above the last COMMITTED one (1689), so no
 * client is told a lower number (pages.yml "Stamp the shell generation").
 * Refuses a shallow clone, whose count is its depth, not the history.
 * @param {{ root?: string, git?: (args: string[]) => string }} [opts]
 */
export function pagesBuild(opts = {}) {
  const git = opts.git || ((args) => gitOut(args, opts.root || ROOT));
  if (git(["rev-parse", "--is-shallow-repository"]) === "true") {
    throw new Error("stage: refusing to compute the build on a shallow clone (rev-list counts the depth); "
      + "fetch full history (`git fetch --unshallow`) or pass --at N");
  }
  const n = Number(git(["rev-list", "--count", "HEAD"]));
  if (!Number.isInteger(n) || n < 1) throw new Error(`stage: bad commit count ${n}`);
  return 2000 + n;
}

/** The commit a stamp records as apex-sha: `git rev-parse HEAD`. */
export function headSha(opts = {}) {
  const git = opts.git || ((args) => gitOut(args, opts.root || ROOT));
  const sha = git(["rev-parse", "HEAD"]);
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`stage: HEAD is not a commit sha: ${sha}`);
  return sha;
}

/**
 * Content-hash stamp a staged tree (same tool pages.yml runs). `at` defaults
 * to `pagesBuild()` and `sha` to `headSha()` of `root` (this checkout).
 * @param {string} stagedRoot
 * @param {{ at?: number, sha?: string, root?: string, git?: (args: string[]) => string }} [opts]
 */
export function stampStaged(stagedRoot, opts = {}) {
  const at = opts.at != null ? opts.at : pagesBuild(opts);
  const sha = opts.sha || headSha(opts);
  if (!Number.isInteger(at) || at < 1) {
    throw new Error(`stage: refuse to stamp with non-positive build ${at}`);
  }
  const bump = path.join(ROOT, "tools/ci/bump-cache.mjs");
  const r = spawnSync(process.execPath, [bump, "--apply", "--at", String(at), "--root", stagedRoot], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    throw new Error(`bump-cache failed:\n${r.stderr || r.stdout || `exit ${r.status}`}`);
  }
  // <meta name="apex-sha"> is provenance AND the input to pages-publishable.sh's
  // monotonic check, so a stamp that cannot place it fails.
  const indexPath = path.join(stagedRoot, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  if (!/name="apex-sha"/.test(html)) {
    html = html.replace(
      /(<meta\s+name="apex-build"\s+content="[^"]*"\s*\/?>)/,
      `$1\n<meta name="apex-sha" content="${sha}">`,
    );
    fs.writeFileSync(indexPath, html);
  }
  const placed = html.match(/<meta name="apex-sha" content="([^"]*)">/);
  if (!placed || placed[1] !== sha) {
    throw new Error(`stage: index.html does not carry <meta name="apex-sha" content="${sha}"> after the stamp`);
  }
  const check = spawnSync(process.execPath, [bump, "--check", "--json", "--root", stagedRoot], {
    encoding: "utf8",
  });
  if (check.status !== 0) {
    throw new Error(`bump-cache --check failed after stamp:\n${check.stderr || check.stdout}`);
  }
  return at;
}

/** Semver for electron-builder: <apexVersion>.<version.json build> (default 1.0.N). */
export function desktopVersionFromBuild(build, apexVersion) {
  let mm = apexVersion;
  if (mm == null) {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "desktop/package.json"), "utf8"));
    mm = readApexVersion(pkg);
  }
  return appVersionFrom({ apexVersion: mm, build });
}

function usage() {
  console.log(`usage: node tools/desktop/stage.mjs --out <dir> [--stamp] [--at N] [--sha HEX]
  --out     destination folder (replaced)
  --stamp       run bump-cache --apply on the staged copy
  --stamp-only  stamp the tree already staged at --out (no re-copy)
  --at N        build number for the stamp (default: 2000 + git rev-list --count HEAD; refuses a shallow clone)
  --sha HEX     commit for <meta name="apex-sha"> (default: git rev-parse HEAD)`);
}

function main() {
  if (flag("--help") || flag("-h")) {
    usage();
    process.exit(0);
  }
  const out = opt("--out");
  if (!out || out.startsWith("-")) {   // `--out --stamp` would name a directory "--stamp"
    usage();
    process.exit(2);
  }
  const outAbs = path.isAbsolute(out) ? out : path.join(ROOT, out);
  let dest;
  if (flag("--stamp-only")) {
    assertStageDest(outAbs, ROOT);
    if (!fs.existsSync(path.join(outAbs, "index.html"))) throw new Error(`stage: --stamp-only: nothing staged at ${outAbs}`);
    dest = outAbs;
  } else {
    dest = stageSite(outAbs);
  }
  let build = null;
  if (flag("--stamp") || flag("--stamp-only")) {
    const atRaw = opt("--at");
    build = stampStaged(dest, {
      at: atRaw != null ? Number(atRaw) : undefined,
      sha: opt("--sha") || undefined,
    });
  }
  const ver = JSON.parse(fs.readFileSync(path.join(dest, "version.json"), "utf8"));
  console.log(JSON.stringify({
    ok: true,
    out: dest,
    files: STAGE_ROOT_FILES.length,
    dirs: STAGE_DIRS.length,
    build: ver.build,
    stamped: build,
    desktopVersion: desktopVersionFromBuild(ver.build),
  }));
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) main();
