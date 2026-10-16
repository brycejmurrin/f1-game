#!/usr/bin/env node
// @doc Desktop pack dry-run: stage + stamp to a temp dir, check every electron-builder input, build no installer.
// @skill check-changes
/**
 * pack-dry-run.mjs — smoke-check desktop.yml's packaging inputs in seconds.
 *
 *   node tools/desktop/pack-dry-run.mjs --dry-run          (human line + JSON)
 *   node tools/desktop/pack-dry-run.mjs --dry-run --json
 *
 * desktop.yml's `npm run pack:test` = stage → sync-version → prebuild →
 * `electron-builder --dir`. The last step needs the Electron binary and a
 * runner; the first three plus the config's file references are plain Node.
 * This runs those against a TEMP stage (never `desktop/dist-site`,
 * `desktop/package.json` or `desktop/build/THIRD-PARTY-NOTICES.txt`) and checks
 * that every path electron-builder will read exists: `files`, `extraResources`,
 * icons, entitlements, notice sources, the staged site, the derived version.
 * It does NOT prove electron-builder accepts the config or that the app boots;
 * Pack smoke on CI still owns that. Flag semantics follow
 * https://www.electron.build/docs/cli/ (`--dir` = unpacked, no installers).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { headSha, stageSite, stampStaged } from "./stage.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DESKTOP = path.join(ROOT, "desktop");

/**
 * @param {{ root?: string, at?: number, sha?: string }} [opts]
 * @returns {Promise<{ ok: boolean, problems: string[], checked: number, version: string, site: string }>}
 */
export async function packDryRun(opts = {}) {
  const root = opts.root || ROOT;
  const desktop = path.join(root, "desktop");
  const problems = [];
  let checked = 0;
  const need = (cond, msg) => { checked++; if (!cond) problems.push(msg); };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-pack-dry-"));
  const site = path.join(tmp, "site");
  const prior = process.env.APEX_SITE_DIR;
  let version = "";
  try {
    // 1. stage + stamp (what `npm run stage` does) into the temp dir.
    stageSite(site, { root });
    const at = opts.at != null ? opts.at : 4242;   // explicit: the default build refuses a shallow clone
    stampStaged(site, { at, sha: opts.sha || headSha({ root }), root });
    const siteVer = JSON.parse(fs.readFileSync(path.join(site, "version.json"), "utf8"));
    need(Number.isInteger(siteVer.build) && siteVer.build > 0, "staged version.json has no positive integer build");
    need(fs.existsSync(path.join(site, "index.html")), "staged site has no index.html");

    // 2. version (set-version.mjs's formula) and the config as the builder loads it.
    const pkg = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf8"));
    const { appVersionFrom, readApexVersion } = require(path.join(desktop, "lib/version.cjs"));
    version = appVersionFrom({ apexVersion: readApexVersion(pkg), build: siteVer.build });
    process.env.APEX_SITE_DIR = site;
    const cfgPath = path.join(desktop, "electron-builder.config.cjs");
    delete require.cache[require.resolve(cfgPath)];
    const cfg = require(cfgPath);

    // 3. app code in the asar: every literal `files` entry exists, every glob has a base dir.
    need(typeof pkg.main === "string" && fs.existsSync(path.join(desktop, pkg.main)), `package.json main ${pkg.main} missing`);
    for (const f of cfg.files) {
      const base = f.includes("*") ? f.split("*")[0].replace(/\/$/, "") : f;
      need(fs.existsSync(path.join(desktop, base)), `config files: ${f} -> ${base || "."} missing under desktop/`);
    }

    // 4. extraResources: the staged site, and the notices file (built in memory, not written).
    const siteRes = cfg.extraResources.find((r) => r.to === "site");
    need(siteRes && path.resolve(desktop, siteRes.from) === path.resolve(site), "extraResources site does not resolve to the staged dir");
    const { buildNoticesText } = await import(pathToFileURL(path.join(desktop, "scripts/notices.mjs")).href);
    try { need(buildNoticesText(root).length > 200, "notices text is empty"); } catch (e) { need(false, e.message); }
    const noticeRes = cfg.extraResources.find((r) => r.to === "THIRD-PARTY-NOTICES.txt");
    need(noticeRes && noticeRes.from === "build/THIRD-PARTY-NOTICES.txt", "extraResources notices entry changed (prebuild writes build/THIRD-PARTY-NOTICES.txt)");

    // 5. build resources per platform.
    for (const [label, rel] of [
      ["win.icon", cfg.win.icon], ["mac.icon", cfg.mac.icon], ["linux.icon", cfg.linux.icon],
      ["mac.entitlements", cfg.mac.entitlements], ["mac.entitlementsInherit", cfg.mac.entitlementsInherit],
    ]) need(rel && fs.existsSync(path.join(desktop, rel)), `${label} ${rel} missing under desktop/`);

    // 6. the workflow still runs the steps this dry-run mirrors.
    const wf = fs.readFileSync(path.join(root, ".github/workflows/desktop.yml"), "utf8");
    need(/npm run pack:test/.test(wf), "desktop.yml no longer runs `npm run pack:test`");
    need(/pack:test"?:\s*"npm run stage && npm run sync-version && npm run prebuild && electron-builder/.test(
      fs.readFileSync(path.join(desktop, "package.json"), "utf8")), "pack:test no longer chains stage -> sync-version -> prebuild -> electron-builder");
  } finally {
    if (prior === undefined) delete process.env.APEX_SITE_DIR; else process.env.APEX_SITE_DIR = prior;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: problems.length === 0, problems, checked, version, site: "(temp stage, removed)" };
}

const isMain = process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h") || !argv.includes("--dry-run")) {
    console.log("usage: node tools/desktop/pack-dry-run.mjs --dry-run [--json]\n  stages to a temp dir and checks every electron-builder input; builds no installer, writes nothing in the repo");
    process.exit(argv.includes("--dry-run") || argv.includes("--help") || argv.includes("-h") ? 0 : 2);
  }
  const r = await packDryRun();
  if (argv.includes("--json")) console.log(JSON.stringify(r));
  else {
    for (const p of r.problems) console.error(`pack-dry-run: ${p}`);
    console.log(`= pack dry-run ${r.ok ? "ok" : "FAILED"}: ${r.checked} checks, desktop version ${r.version}`);
  }
  process.exit(r.ok ? 0 : 1);
}
