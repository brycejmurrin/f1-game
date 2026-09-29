#!/usr/bin/env node
// @doc Stage the deployable site folder (Pages / Electron) from the shared allow-list; optional content-hash stamp.
// @skill check-changes
/**
 * stage.mjs — produce the same runtime tree pages.yml publishes.
 *
 *   node tools/desktop/stage.mjs --out _site
 *   node tools/desktop/stage.mjs --out desktop/dist-site --stamp
 *   node tools/desktop/stage.mjs --out _site --stamp --at 3695 --sha <hex>
 *
 * Without `--stamp`, tags stay `?v=dev` (matches a local serve of the repo).
 * With `--stamp`, runs `bump-cache.mjs --apply` so packaged shells are
 * content-addressed like the live site. `--at` defaults to version.json's
 * build; pages.yml still stamps with `2000 + rev-list` itself after staging.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STAGE_DIRS, STAGE_ROOT_FILES } from "./stage-files.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

/**
 * Copy the runtime allow-list into `outDir` (replaced if it exists).
 * @param {string} outDir absolute or repo-relative output directory
 * @param {{ root?: string }} [opts]
 * @returns {string} absolute output path
 */
export function stageSite(outDir, opts = {}) {
  const root = opts.root || ROOT;
  const dest = path.resolve(outDir);
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

/**
 * Content-hash stamp a staged tree (same tool pages.yml runs).
 * @param {string} stagedRoot
 * @param {{ at?: number, sha?: string }} [opts]
 */
export function stampStaged(stagedRoot, opts = {}) {
  const versionPath = path.join(stagedRoot, "version.json");
  let at = opts.at;
  if (at == null) {
    at = JSON.parse(fs.readFileSync(versionPath, "utf8")).build;
  }
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
  if (opts.sha) {
    const indexPath = path.join(stagedRoot, "index.html");
    let html = fs.readFileSync(indexPath, "utf8");
    if (!/name="apex-sha"/.test(html)) {
      html = html.replace(
        /(<meta\s+name="apex-build"\s+content="[^"]*"\s*\/?>)/,
        `$1\n<meta name="apex-sha" content="${opts.sha}">`,
      );
      fs.writeFileSync(indexPath, html);
    }
  }
  const check = spawnSync(process.execPath, [bump, "--check", "--json", "--root", stagedRoot], {
    encoding: "utf8",
  });
  if (check.status !== 0) {
    throw new Error(`bump-cache --check failed after stamp:\n${check.stderr || check.stdout}`);
  }
  return at;
}

/** Semver for electron-builder: 0.<version.json build>.0 */
export function desktopVersionFromBuild(build) {
  const n = Number(build);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`desktop version: build must be a positive integer, got ${build}`);
  }
  return `0.${n}.0`;
}

function usage() {
  console.log(`usage: node tools/desktop/stage.mjs --out <dir> [--stamp] [--at N] [--sha HEX]
  --out     destination folder (replaced)
  --stamp   run bump-cache --apply on the staged copy
  --at N    build number for the stamp (default: version.json build)
  --sha     optional commit hex for <meta name="apex-sha">`);
}

function main() {
  if (flag("--help") || flag("-h")) {
    usage();
    process.exit(0);
  }
  const out = opt("--out");
  if (!out) {
    usage();
    process.exit(2);
  }
  const dest = stageSite(path.isAbsolute(out) ? out : path.join(ROOT, out));
  let build = null;
  if (flag("--stamp")) {
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
