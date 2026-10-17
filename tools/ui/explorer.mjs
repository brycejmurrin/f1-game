#!/usr/bin/env node
// @doc UI exploration: missions, navigation atlas, filmstrips, phone/fault/a11y probes, replay reduction, scene reports.
// @skill survey-ui-matrix
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { makeFlags } from "../lib/cli-args.mjs";
import { launchChromium, shutdown, startStaticServer } from "../lib/harness.mjs";
import { chromiumArgsForBackend } from "../shot/probe-page.mjs";
import { SCREENS } from "./menu-screens.mjs";
import { validateScenario } from "./explorer/core.mjs";
import { MODE_TITLES, MISSIONS, missionBrief } from "./explorer/catalog.mjs";
import { explore } from "./explorer/modes.mjs";
import { writeReport } from "./explorer/report.mjs";
import { openSession } from "./explorer/browser.mjs";
import { inspectPage, inspectResponsive, installInspector } from "./explorer/inspector.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HELP = `UI explorer — one Chromium, bounded captures, offline HTML evidence.
  node tools/ui/explorer.mjs all [--out DIR] [--max-shots 25]
  node tools/ui/explorer.mjs missions|atlas|transitions|responsive|faults|accessibility|scene
  node tools/ui/explorer.mjs replay scenario.json [--url http://127.0.0.1:3456/]
  node tools/ui/explorer.mjs minimize scenario.json [--max-attempts 8]
  node tools/ui/explorer.mjs scene --repro scene.repro.json [--reference image.jpg]
  node tools/ui/explorer.mjs brief --url <reachable-preview> [--mission first-race]
  node tools/ui/explorer.mjs report <report.json> --out DIR
  node tools/ui/explorer.mjs inspect --screen settingsappearance [--selector '#pmsettings'] [--styles '#as-uiScale']
    [--viewports 390x844,844x390,1280x800]   # 1..8 bounded sizes; restores the original viewport
  node tools/ui/explorer.mjs --list|--help
Flags: --url URL --out DIR --modes a,b --scenario FILE --max-shots 0..25
       --max-attempts 1..30 --track ID --frac 0..1 --repro FILE --reference IMAGE
       --scene-views original,45,225 --scene-backend webgl2|three
Browser-free commands: --help, --list, brief, report. Native motion; isolated saves.
Reports distinguish guided missions from exported blind Browser Use briefs.
Exit 0: probes completed (inspect advisories); 1: failed probe; 2: invalid invocation.
`;
const FLAGS = ["--out", "--url", "--modes", "--scenario", "--max-shots", "--max-attempts", "--track", "--frac", "--repro", "--reference", "--mission", "--scene-views", "--scene-backend", "--screen", "--selector", "--styles", "--viewports", "--list", "--help"];

export function parseOptions(argv) {
  const f = makeFlags(argv, FLAGS);
  // The shared reader treats leading '-' as a flag. Preserve numeric negatives
  // here so invalid budgets are rejected rather than silently using defaults.
  const flag = (name, fallback) => {
    const equal = argv.find((a) => a.startsWith(name + "="));
    if (equal !== undefined) return equal.slice(name.length + 1);
    const i = argv.indexOf(name); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback;
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      if (!a.includes("=") && !["--help", "--list"].includes(a)) {
        if (!argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${a} requires a value`);
        i++;
      }
    } else positional.push(a);
  }
  const command = positional[0] || "all";
  if (!["all", "replay", "brief", "report", "inspect", ...Object.keys(MODE_TITLES)].includes(command)) throw new Error(`Unknown command ${command}`);
  if (positional.length > (["replay", "minimize", "report"].includes(command) ? 2 : 1)) throw new Error("Unexpected positional argument");
  if (f.has("--scenario") && !["all", "missions", "replay", "minimize"].includes(command)) throw new Error("--scenario is supported by missions, replay, minimize or all");
  const numeric = (name, fallback, min, max, integer = false) => {
    const raw = flag(name, String(fallback)), n = Number(raw);
    if (!raw.trim() || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw new Error(`${name} must be ${min}..${max}${integer ? " integer" : ""}`);
    return n;
  };
  const modes = String(flag("--modes", command === "all" ? Object.keys(MODE_TITLES).join(",") : command === "replay" ? "missions" : command)).split(",").map((v) => v.trim()).filter(Boolean);
  if (!f.has("--help") && !f.has("--list") && !["brief", "report", "inspect"].includes(command) && (!modes.length || modes.some((m) => !MODE_TITLES[m]))) throw new Error("Unknown or empty --modes");
  const screen = flag("--screen", "title"), selector = flag("--selector", null), styles = flag("--styles", null);
  if (!SCREENS.some(s => s.id === screen)) throw new Error("Unknown --screen; use --list");
  if (command !== "inspect" && ["--screen", "--selector", "--styles", "--viewports"].some(k => f.has(k))) throw new Error("--screen/--selector/--styles/--viewports require inspect");
  const viewportText = flag("--viewports", null);
  const viewports = viewportText === null ? null : viewportText.split(",").map(size => {
    if (!/^\d+x\d+$/.test(size)) throw new Error("--viewports requires sizes such as 390x844,844x390");
    const [width, height] = size.split("x").map(Number);
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 240 || width > 3840 || height < 240 || height > 2160) throw new Error("--viewports: width 240..3840, height 240..2160");
    return { width, height };
  });
  if (viewports && (viewports.length < 1 || viewports.length > 8)) throw new Error("--viewports accepts 1..8 sizes");
  for (const s of [selector, styles]) if (s !== null && (!s.trim() || s.length > 512)) throw new Error("Selectors must contain 1..512 characters");
  const url = flag("--url", null);
  if (url) { const u = new URL(url); if (!["http:", "https:"].includes(u.protocol) || u.username || u.password) throw new Error("--url requires http(s) without embedded credentials"); }
  const track = flag("--track", "monaco"); if (!/^[a-z0-9_-]+$/i.test(track)) throw new Error("Invalid --track");
  const sceneViews = String(flag("--scene-views", "original,45,225")).split(",").map((v) => v === "original" ? null : v.trim() ? Number(v) : NaN);
  if (!sceneViews.length || sceneViews.length > 8 || sceneViews.some((v) => v !== null && (!Number.isFinite(v) || Math.abs(v) > 360))) throw new Error("--scene-views requires original or angles -360..360 (max8)");
  const sceneBackend = flag("--scene-backend", "webgl2");
  if (!["three", "webgl2"].includes(sceneBackend)) throw new Error("--scene-backend must be webgl2 or three");
  const outDir = path.resolve(flag("--out", path.join(ROOT, "artifacts/ui-explorer")));
  const relative = path.relative(ROOT, outDir);
  const outside = relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative);
  if (!outside && !/^(artifacts|scratch)([\\/]|$)/.test(relative)) throw new Error("Inside the repository, --out must be under artifacts/ or scratch/");
  return { command, file: positional[1] || flag("--scenario", null), help: f.has("--help"), list: f.has("--list"), modes: [...new Set(modes)], url, screen, selector, styles, viewports,
    outDir, maxShots: numeric("--max-shots", 25, 0, 25, true), maxAttempts: numeric("--max-attempts", 8, 1, 30, true),
    track, sceneViews, sceneBackend, frac: numeric("--frac", 0.4, 0, 1), repro: flag("--repro", null), reference: flag("--reference", null), mission: flag("--mission", "first-race") };
}

function readJSON(file) {
  if (fs.statSync(file).size > 5 * 1024 * 1024) throw new Error("Input JSON exceeds 5 MiB");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export async function main(argv = process.argv.slice(2)) {
  let opts;
  try { opts = parseOptions(argv); } catch (e) { console.error(e.message); return 2; }
  if (opts.help) { console.log(HELP); return 0; }
  if (opts.list) { console.log(JSON.stringify({ modes: MODE_TITLES, missions: MISSIONS.map(({ id, goal }) => ({ id, goal })), screens: SCREENS.map(({ id, root }) => ({ id, root })) }, null, 2)); return 0; }
  if (opts.command === "brief") {
    if (!opts.url) throw new Error("brief requires --url reachable from the hosted browser; localhost is not shared automatically");
    const mission = MISSIONS.find((m) => m.id === opts.mission); if (!mission) throw new Error("Unknown --mission");
    console.log(JSON.stringify(missionBrief(mission, opts.url), null, 2)); return 0;
  }
  if (opts.command === "report") {
    if (!opts.file) throw new Error("report requires report.json");
    const source = path.resolve(opts.file);
    if (path.dirname(source) !== opts.outDir) throw new Error("Rebuild reports beside their evidence: --out must be the input report.json directory");
    console.log(await writeReport(readJSON(source), opts.outDir)); return 0;
  }
  if (["replay", "minimize"].includes(opts.command) && !opts.file) throw new Error(`${opts.command} requires a scenario JSON file`);
  const scenario = opts.file ? validateScenario(readJSON(opts.file)) : null;
  const blob = opts.repro ? readJSON(opts.repro) : null;
  const sceneRepro = blob?.repro || blob;
  if (sceneRepro && (typeof sceneRepro !== "object" || Array.isArray(sceneRepro))) throw new Error("--repro must contain an __apex.repro() object");
  if (os.loadavg()[0] >= 3) throw new Error("Browser deferred: load average is >=3; do not start another software-rendered run");
  const { acquireLock, releaseLock } = await import("../mcp/apex-tools-mcp.mjs");
  const refused = acquireLock("ui-explorer"); if (refused) throw new Error(`Browser occupied: ${JSON.stringify(refused)}`);
  let browser;
  try {
    const server = opts.url ? null : await startStaticServer(ROOT);
    const url = opts.url || server.url;
    browser = await launchChromium({ args: chromiumArgsForBackend("three") });
    let gitHead = "unknown"; try { gitHead = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(); } catch { /* metadata only */ }
    if (opts.command === "inspect") {
      const s = await openSession(browser, url);
      try {
        const screen = SCREENS.find(v => v.id === opts.screen);
        await screen.open(s.page);
        await installInspector(s.page);
        const inspect = opts.viewports ? inspectResponsive : inspectPage;
        const report = await inspect(s.page, { root: opts.selector || screen.root, styles: opts.styles, viewports: opts.viewports });
        report.provenance = { sha: gitHead, screen: opts.screen, route: "catalog setup; use replay for real interaction proof" };
        report.errors = s.logs.errors; report.requests = s.logs.requests;
        fs.mkdirSync(opts.outDir, { recursive: true });
        fs.writeFileSync(path.join(opts.outDir, "inspection.json"), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
        return s.logs.errors.some(e => e.kind === "pageerror") ? 1 : 0;
      } finally { await s.context.close(); }
    }
    if (opts.reference) {
      const ext = path.extname(opts.reference).toLowerCase();
      if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext) || fs.statSync(opts.reference).size > 10 * 1024 * 1024) throw new Error("Reference must be an image <=10 MiB");
      fs.mkdirSync(path.join(opts.outDir, "evidence"), { recursive: true });
      opts.referenceName = `evidence/reference${ext}`; fs.copyFileSync(opts.reference, path.join(opts.outDir, opts.referenceName));
    }
    const bundle = await explore(browser, url, { ...opts, gitHead, catalog: SCREENS, sceneRepro,
      scenarios: ["replay", "missions", "all"].includes(opts.command) && scenario ? [scenario] : undefined,
      minimizeScenario: ["minimize", "all"].includes(opts.command) ? scenario : undefined });
    const html = await writeReport(bundle, opts.outDir);
    console.log(JSON.stringify({ report: html, screenshots: bundle.meta.screenshots, findings: bundle.findings.length, capabilities: bundle.capabilities.map(({ id, status, reason }) => ({ id, status, reason })) }, null, 2));
    return bundle.capabilities.some((c) => c.status === "failed") ? 1 : 0;
  } finally { if (browser) await browser.close().catch(() => {}); await shutdown(); releaseLock(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().then((code) => { process.exitCode = code; }).catch((e) => { console.error(e.message); process.exitCode = 1; });
