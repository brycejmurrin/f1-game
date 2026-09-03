#!/usr/bin/env node
// One screenshot of the GARAGE 3D scene — the setup-preview turntable, its
// @doc Garage 3D screenshot: `--backend`, `--compare`, in-page nav; skips view-transition overlay trap.
// lightbox crest, boards and props — not the DOM panel in front of it.
//
// Why this exists: nothing could photograph the garage. layout-audit --screen=
// captures menus with the CANVAS HIDDEN (that is the point of it), and
// capture/shot.mjs frames a car on a TRACK via __apex camera hooks, which the
// garage has none of. So a change to js/game/garage-scene.js or to the crest
// lightbox could only be reasoned about, never looked at — and reasoning about
// what a scene looks like is how a rendering defect survives review.
//
// Usage:
//   node tools/capture/garage-shot.mjs [out.png] [--backend webgl2|webgpu|three]
//     [--team N] [--viewport WxH] [--compare] [--json manifest.json] [--wait SEC]
//
// --compare runs webgl2 + webgpu into the output directory with a manifest.
// Starts its own static server (harness); PORT env overrides only when using
// an external server via --port (legacy: set PORT=3456 and pass --port 3456).
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  launchChromium,
  shutdown,
  sleep,
  startStaticServer,
} from "../harness.mjs";
import { assertSafePathToken, resolveRepoDefault } from "../output-paths.mjs";
import {
  chromiumArgsForBackend,
  garageDiagnostics,
  gotoGame,
  installProbeInit,
  openGarage,
  screenshotGameCanvas,
  settleGarage,
} from "./probe-page.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");

function flag(argv, name, fallback) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}
function has(argv, name) { return argv.includes(name); }

const argv = process.argv.slice(2);
const positionals = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) {
    if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) i++;
    continue;
  }
  positionals.push(argv[i]);
}

const outArg = positionals[0] || null;
const teamArg = flag(argv, "--team", null);
const backend = flag(argv, "--backend", "webgl2");
const compare = has(argv, "--compare");
const jsonOut = flag(argv, "--json", null);
const waitSec = Math.max(30, parseFloat(flag(argv, "--wait", "120")) || 120);
const waitMs = waitSec * 1000;
const extPort = flag(argv, "--port", process.env.PORT || null);

const vpStr = flag(argv, "--viewport", "1280x720");
const vpMatch = /^(\d+)x(\d+)$/.exec(vpStr);
if (!vpMatch) {
  console.error("garage-shot: --viewport must be WxH, got " + vpStr);
  process.exit(1);
}
const viewport = { width: +vpMatch[1], height: +vpMatch[2] };

const backends = compare ? ["webgl2", "webgpu"] : [backend];
for (const be of backends) {
  if (!["webgl2", "webgpu", "three"].includes(be)) {
    console.error("garage-shot: unknown backend " + be);
    process.exit(1);
  }
}

const team = teamArg != null ? parseInt(teamArg, 10) : 2;
const defaultOut = resolveRepoDefault(ROOT, "scratch", "captures", "garage", "garage.png");
const baseOut = outArg ? resolve(outArg) : defaultOut;

let srv = null;
let ownServer = false;
if (extPort) {
  srv = { url: `http://127.0.0.1:${extPort}/`, close: async () => {} };
} else {
  srv = await startStaticServer(ROOT);
  ownServer = true;
}

async function captureOne(be, outPath) {
  const browser = await launchChromium({ args: chromiumArgsForBackend(be) });
  const consoleLines = [];
  try {
    const page = await browser.newPage({ viewport });
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") consoleLines.push(`[${t}] ${m.text()}`);
    });
    await installProbeInit(page, { backend: be, team });
    await gotoGame(page, srv.url, waitMs);
    await openGarage(page, { team, waitMs });
    await settleGarage(page, { frames: 90, sleepFn: sleep });
    const diag = await garageDiagnostics(page);
    mkdirSync(dirname(outPath), { recursive: true });
    const shot = await screenshotGameCanvas(page, outPath);
    if (diag.overlay) {
      console.warn(`  ${be}: error overlay present — ${diag.overlay.split("\n")[0]}`);
    }
    if (shot.bytes < 8000) {
      console.warn(`  ${be}: screenshot only ${shot.bytes} bytes — likely blank`);
    }
    console.log(`  ${be}: ${outPath} (${(shot.bytes / 1024).toFixed(1)} KB) bound=${diag.backend} centerPx=${diag.centerPx}`);
    return { backend: be, path: outPath, ...shot, diag, consoleLines };
  } finally {
    await browser.close();
  }
}

const results = [];
try {
  console.log(`garage-shot: viewport=${vpStr} team=${team} → ${compare ? dirname(baseOut) : baseOut}`);
  for (const be of backends) {
    const path = compare
      ? resolve(dirname(baseOut), `garage-${be}.png`)
      : baseOut;
    results.push(await captureOne(be, path));
  }

  const manifest = {
    viewport,
    team,
    shots: results.map((r) => ({
      backend: r.backend,
      path: r.path,
      bytes: r.bytes,
      diag: r.diag,
      consoleErrors: r.consoleLines.filter((l) => l.startsWith("[error]")),
    })),
  };
  if (compare && results.length === 2) {
    const a = results[0].diag.centerPx;
    const b = results[1].diag.centerPx;
    if (a && b) {
      manifest.centerRgbDelta = a.slice(0, 3).map((v, i) => Math.abs(v - b[i]));
    }
  }

  const manifestPath = jsonOut
    ? resolve(jsonOut)
    : compare
      ? resolve(dirname(baseOut), "garage-manifest.json")
      : null;
  if (manifestPath) {
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log("wrote " + manifestPath);
  }

  const failed = results.some((r) => r.diag.overlay || r.bytes < 8000);
  if (failed) process.exitCode = 1;
} catch (err) {
  console.error("garage-shot failed:", err && err.stack || err);
  process.exitCode = 1;
} finally {
  if (ownServer) await srv.close();
  await shutdown();
}
