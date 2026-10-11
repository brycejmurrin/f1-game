#!/usr/bin/env node
/**
 * Copy the stamped staged site into mobile/www, then `npx cap sync android`.
 *
 * Reuses tools/desktop/stage.mjs (the Electron/Pages stager) — do not add a
 * second allow-list. Unstamped `?v=dev` shells are refused unless --dev.
 * A ship-sync merge alone may not start draft CI (paths-ignore); keep this
 * script among the non-docs paths that force a synchronize gate.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { stageSite, stampStaged } from "../../tools/desktop/stage.mjs";

const { isCurrentStage, repoHead } = createRequire(import.meta.url)("../../desktop/lib/site.cjs");

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MOBILE = path.resolve(HERE, "..");
const ROOT = path.resolve(MOBILE, "..");
const WWW = path.join(MOBILE, "www");

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : null;
};

function hasDevTags(indexHtml) {
  return /\?v=dev\b/.test(indexHtml);
}

function copyTree(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
}

function copyIsolated(src, dest) {
  // Resolve the existing parent to catch paths routed back into src by symlinks.
  // Custom destinations are always NEW: never recursively delete caller paths.
  const target = path.join(fs.realpathSync(path.dirname(dest)), path.basename(dest));
  const relative = path.relative(fs.realpathSync(src), target);
  if (!relative || (relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative))) {
    throw new Error("sync-web: --out must not overlap the source tree");
  }
  fs.mkdirSync(target);   // exclusive reservation: EEXIST preserves any existing destination
  fs.cpSync(src, target, { recursive: true, dereference: true, force: false, errorOnExist: true });
}

/**
 * The staged tree to package. An explicit --src is the caller's word. Without
 * one, an earlier stage in artifacts/site or _site is reused ONLY when its
 * apex-sha is HEAD (2026-10-10, R3-ARCHITECTURE-11): artifacts/ is every
 * tool's regenerable-output dir, and reusing whatever sat there packaged an
 * APK of some earlier commit. null = stage fresh.
 * @param {{ root?: string, explicit?: string|null, head?: string|null }} [o]
 */
function resolveSrc(o = {}) {
  const root = o.root || ROOT;
  const explicit = o.explicit !== undefined ? o.explicit : opt("--src");
  if (explicit) {
    const abs = path.isAbsolute(explicit) ? explicit : path.join(root, explicit);
    if (!fs.existsSync(path.join(abs, "index.html"))) {
      throw new Error(`sync-web: --src has no index.html (${abs})`);
    }
    return abs;
  }
  const head = o.head !== undefined ? o.head : repoHead(root);
  for (const dir of [path.join(root, "artifacts", "site"), path.join(root, "_site")]) {
    if (isCurrentStage(dir, head)) return dir;
  }
  return null;
}

/**
 * @param {{ root?: string, explicit?: string|null, head?: string|null, dev?: boolean,
 *   stage?: typeof stageSite, stamp?: typeof stampStaged }} [o]  test seams; the CLI passes none
 */
function prepareSrc(o = {}) {
  const root = o.root || ROOT;
  const dev = o.dev !== undefined ? o.dev : flag("--dev");
  let src = resolveSrc(o);
  if (!src) {
    const artifacts = path.join(root, "artifacts", "site");
    fs.mkdirSync(path.dirname(artifacts), { recursive: true });
    (o.stage || stageSite)(artifacts, { root });
    if (!dev) (o.stamp || stampStaged)(artifacts, { root });
    src = artifacts;
  }
  const html = fs.readFileSync(path.join(src, "index.html"), "utf8");
  if (hasDevTags(html) && !dev) {
    throw new Error(
      "sync-web: refused unstamped ?v=dev shell (run with --dev for a local serve copy, or stamp via tools/desktop/stage.mjs --stamp)",
    );
  }
  return src;
}

function capSync() {
  const r = spawnSync("npx", ["cap", "sync", "android"], {
    cwd: MOBILE,
    encoding: "utf8",
    env: process.env,
  });
  if (r.status !== 0) {
    throw new Error(`cap sync android failed:\n${r.stderr || r.stdout || `exit ${r.status}`}`);
  }
  return r.stdout;
}

function usage() {
  console.log(`usage: node mobile/scripts/sync-web.mjs [--dev] [--src DIR] [--skip-sync] [--out DIR]
  copies a stamped staged site into mobile/www (Capacitor webDir)
  --dev        allow remaining ?v=dev cache tags
  --src DIR    use this staged folder (default: artifacts/site or _site when stamped from HEAD, else stage fresh)
  --out DIR    copy to a new isolated destination with an existing parent (requires --skip-sync)
  --skip-sync  copy only; do not run npx cap sync android`);
}

function main() {
  if (flag("--help") || flag("-h")) {
    usage();
    process.exit(0);
  }
  const out = opt("--out");
  if (flag("--out") && (!out || out.startsWith("--") || !flag("--skip-sync"))) {
    throw new Error("sync-web: --out requires a directory and --skip-sync (Capacitor uses mobile/www)");
  }
  const www = out ? path.resolve(ROOT, out) : WWW;
  const src = prepareSrc();
  if (out) copyIsolated(src, www);
  else copyTree(src, www);
  let syncOut = null;
  if (!flag("--skip-sync")) syncOut = capSync();
  const html = fs.readFileSync(path.join(www, "index.html"), "utf8");
  console.log(JSON.stringify({
    ok: true,
    src,
    www,
    stamped: !hasDevTags(html),
    synced: !flag("--skip-sync"),
    cap: syncOut ? "ok" : null,
  }));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try { main(); } catch (e) {
    console.error(e && e.message ? e.message : e);
    process.exit(1);
  }
}

export { hasDevTags, copyTree, WWW, prepareSrc, resolveSrc };
