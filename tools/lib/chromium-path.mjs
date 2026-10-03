#!/usr/bin/env node
// @doc Derives the Chromium executable from playwright-core's browsers.json revision + the browsers root; run it to print.
// @skill playwright-probe
/**
 * chromium-path.mjs — ONE place that knows where Playwright's Chromium is.
 *
 *   node tools/lib/chromium-path.mjs          # print the path it resolves and why
 *   import { resolveChromium } from "./chromium-path.mjs";
 *
 * playwright.config.js and tools/lib/harness.mjs each used to pin a literal —
 * `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, and a stray
 * `/home/ubuntu/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` —
 * so every Playwright bump silently changed which browser the suite ran on
 * (or none: a pinned literal that no longer exists is `undefined`, and
 * Playwright then wants the revision its OWN browsers.json names, which the
 * sandbox may not have installed). The revision is READ here instead:
 *
 *   1. an explicit PW_CHROMIUM / CHROME wins, unchanged;
 *   2. `chromium-<rev>` where <rev> is playwright-core/browsers.json's chromium
 *      revision — the browser this Playwright expects — under each root;
 *   3. failing that, the NEWEST `chromium-*` under each root, so a sandbox whose
 *      preinstalled build lags the package (this container: chromium-1194 with
 *      playwright 1.63 → 1243) keeps working instead of failing to launch.
 *   4. a system Chromium/Chrome executable on PATH or a conventional path.
 *
 * Roots: PLAYWRIGHT_BROWSERS_PATH, then ~/.cache/ms-playwright (Linux) and
 * ~/Library/Caches/ms-playwright (macOS), then /opt/pw-browsers (the sandbox's
 * root when the env var is not exported into the shell). Layouts cover every
 * archive Playwright unpacks: chrome-linux, chrome-linux64, chrome-mac and
 * chrome-mac-arm64 (`Chromium.app/Contents/MacOS/Chromium`).
 *
 * Returns `undefined` when nothing is installed anywhere, which is the right
 * answer for a dev box that lets Playwright manage its own browser.
 */
import { accessSync, constants, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
export const SYSTEM_CHROMIUM_PATHS = [
  "/opt/pw-browsers/chromium", "/opt/google/chrome/chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];
const SYSTEM_CHROMIUM_COMMANDS = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "chrome"];

export function executableFile(file) {
  try { accessSync(file, constants.X_OK); return statSync(file).isFile(); }
  catch { return false; }
}

/** Inspect PATH and conventional locations without running a browser. */
export function systemChromium({ env = process.env, paths = SYSTEM_CHROMIUM_PATHS } = {}) {
  for (const dir of (env.PATH || "").split(path.delimiter).filter(Boolean)) {
    for (const name of SYSTEM_CHROMIUM_COMMANDS) {
      const exe = path.resolve(dir, name);
      if (executableFile(exe)) return { path: exe, source: `PATH:${name}` };
    }
  }
  for (const exe of paths) if (executableFile(exe)) return { path: exe, source: "system" };
  return undefined;
}

function writableAncestor(dir) {
  let current = path.resolve(dir);
  while (!existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
  try { accessSync(current, constants.W_OK); return statSync(current).isDirectory(); }
  catch { return false; }
}

/** Select a cache that can be created/written, without mkdir or sudo. */
export function browserCacheResolution({ env = process.env, writable = writableAncestor } = {}) {
  const home = env.HOME || os.homedir();
  const configured = env.PLAYWRIGHT_BROWSERS_PATH || "/opt/pw-browsers";
  const candidates = [configured, "/opt/pw-browsers",
    path.join(env.XDG_CACHE_HOME || path.join(home, ".cache"), "ms-playwright")];
  const selected = candidates.filter(Boolean).find((dir) => writable(dir));
  return { configured, configuredWritable: writable(configured), selected: selected || null, fallback: !!selected && selected !== configured };
}
export const browserCachePath = (opts) => browserCacheResolution(opts).selected || undefined;

/** Executable paths relative to a `chromium-<rev>/` directory, in probe order. */
export const CHROMIUM_LAYOUTS = [
  "chrome-linux/chrome",
  "chrome-linux64/chrome",
  "chrome-mac/Chromium.app/Contents/MacOS/Chromium",
  "chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium",
];

/** playwright-core/browsers.json's revision for `name`, or null when the package is absent. */
export function browsersJsonRevision(name = "chromium") {
  try {
    // browsers.json is not in playwright-core's `exports`; resolve the package
    // file that IS exported and read its sibling.
    const pkg = require.resolve("playwright-core/package.json");
    const doc = JSON.parse(readFileSync(path.join(path.dirname(pkg), "browsers.json"), "utf8"));
    const row = (doc.browsers || []).find((b) => b.name === name);
    return row ? String(row.revision) : null;
  } catch (_) {
    return null;
  }
}

/** The browser roots to probe, most specific first; only those that exist. */
export function browserRoots(env = process.env) {
  const home = env.HOME || os.homedir();
  const roots = [
    env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(home, ".cache/ms-playwright"),
    path.join(home, "Library/Caches/ms-playwright"),
    "/opt/pw-browsers",
  ];
  const seen = new Set();
  return roots.filter((r) => r && !seen.has(r) && seen.add(r) && existsSync(r));
}

const revOf = (dir) => Number(dir.slice("chromium-".length));
const isRevDir = (dir) => /^chromium-\d+$/.test(dir);

function exeIn(root, dir) {
  for (const rel of CHROMIUM_LAYOUTS) {
    const exe = path.join(root, dir, rel);
    if (executableFile(exe)) return exe;
  }
  return undefined;
}

/**
 * Resolve the Chromium executable. Returns `{ path, source }` — `source` says
 * which rung answered (`env:PW_CHROMIUM`, `browsers.json:<rev>`,
 * `newest:<rev>`, `PATH:<name>` or `system`).
 */
export function resolveChromium({ env = process.env, roots = browserRoots(env), systemPaths = SYSTEM_CHROMIUM_PATHS } = {}) {
  for (const key of ["PW_CHROMIUM", "CHROME"]) {
    if (env[key]) return { path: env[key], source: `env:${key}` };
  }
  const rev = browsersJsonRevision("chromium");
  if (rev) {
    for (const root of roots) {
      const exe = exeIn(root, `chromium-${rev}`);
      if (exe) return { path: exe, source: `browsers.json:${rev} under ${root}` };
    }
  }
  for (const root of roots) {
    let dirs;
    try { dirs = readdirSync(root).filter(isRevDir).sort((a, b) => revOf(b) - revOf(a)); }
    catch (_) { continue; }
    for (const d of dirs) {
      const exe = exeIn(root, d);
      if (exe) return { path: exe, source: `newest:${revOf(d)} under ${root}${rev ? ` (browsers.json wants ${rev}, not installed)` : ""}` };
    }
  }
  return systemChromium({ env, paths: systemPaths });
}

/** The path alone — what launchOptions.executablePath takes. */
export const chromiumPath = (opts) => resolveChromium(opts)?.path;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flag = process.argv[2];
  if (["--help", "-h"].includes(flag)) {
    console.log("Usage: node tools/lib/chromium-path.mjs [--path|--cache-path]\nRead-only executable/cache discovery; never launches a browser.");
    process.exit(0);
  }
  if (process.argv.length > 3 || (flag && !["--path", "--cache-path"].includes(flag))) {
    console.error("Unknown arguments; use --help"); process.exit(2);
  }
  if (flag === "--cache-path") {
    const cache = browserCachePath(); if (cache) console.log(cache); process.exit(cache ? 0 : 1);
  }
  const r = resolveChromium();
  if (flag === "--path") { if (r) console.log(r.path); process.exit(r ? 0 : 1); }
  console.log(`browsers.json chromium revision: ${browsersJsonRevision("chromium") || "(playwright-core not installed)"}`);
  console.log(`roots: ${browserRoots().join(", ") || "(none exist)"}`);
  console.log(r ? `chromium: ${r.path}\nvia:      ${r.source}` : "chromium: (none installed — Playwright's bundled default)");
  process.exit(r ? 0 : 1);
}
