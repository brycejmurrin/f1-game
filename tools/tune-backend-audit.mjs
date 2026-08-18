#!/usr/bin/env node
/**
 * tune-backend-audit — every TUNE_DEFS slider vs GLX / WGX / TLX.
 *
 * A knob is "seen" on a backend when that backend's tree reads the id
 * (T.id / k("id") / gk("id") / sky.id / frame.id) or its GLSL `u` name.
 * CPU-only knobs (no `u`) are live on every backend if game.js / atmosphere
 * / lighting.js apply them into frame.* / frameSky.* / lights.
 *
 *   node tools/tune-backend-audit.mjs
 *   node tools/tune-backend-audit.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../tests/helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const GLX_ONLY = new Set([
  "perChunkLights",   // documented: WebGL2 only
  "roadChunkLamps",   // documented: needs perChunkLights
]);

// Extra numeric fallbacks that are gates, not shipped defaults.
// carEnvCube → 0 while the cube is not live / frame.noEnv.
const FALLBACK_GATE = { carEnvCube: [0] };

const TREES = {
  glx: [
    "js/render/glx.js",
    "js/render/glx/post.js",
    "js/render/glx/shadow.js",
    "js/render/shaders/lit.js",
    "js/render/shaders/post.js",
    "js/render/shaders/sky.js",
    "js/render/shaders/fx.js",
  ],
  wgx: [
    "js/render/webgpu/wgx.js",
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
  ],
  tlx: [
    "js/render/three/tlx.js",
    "js/render/three/tlx-post.js",
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
  ],
  cpu: [
    "js/game.js",
    "js/game/atmosphere.js",
    "js/game/lighting.js",
    "js/game/particles.js",
    "js/game/light-store.js",
  ],
};

function tuneDefs() {
  const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(read("js/game/lighting.js").replace(/^const\b/gm, "var"), sandbox);
  return sandbox.LightTune.TUNE_DEFS;
}

function stripDefs(src) {
  const a = src.indexOf("const TUNE_DEFS = [");
  if (a < 0) return src;
  let i = src.indexOf("[", a), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  return src.slice(0, a) + src.slice(end + 1);
}

function loadTree(files) {
  return files.map((f) => {
    let s = read(f);
    if (f.endsWith("lighting.js")) s = stripDefs(s);
    return s.replace(/^[ \t]*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  }).join("\n");
}

function fallbacks(src, id) {
  const out = [];
  const patterns = [
    new RegExp(`(?:k|gk)\\(\\s*["']${id}["']\\s*,\\s*(-?[0-9.]+)`, "g"),
    new RegExp(`T\\.${id}\\s*!=\\s*null\\s*\\?\\s*T\\.${id}\\s*:\\s*(-?[0-9.]+)`, "g"),
    new RegExp(`T\\s*&&\\s*T\\.${id}\\s*!=\\s*null\\s*\\?\\s*T\\.${id}\\s*:\\s*(-?[0-9.]+)`, "g"),
    new RegExp(`\\(\\s*T\\s*&&\\s*T\\.${id}\\s*!=\\s*null\\s*\\)\\s*\\?\\s*T\\.${id}\\s*:\\s*(-?[0-9.]+)`, "g"),
    new RegExp(`CT\\.${id}\\s*!=\\s*null\\s*\\?\\s*CT\\.${id}\\s*:\\s*(-?[0-9.]+)`, "g"),
    new RegExp(`GT\\.${id}\\s*!=\\s*null\\s*\\?\\s*GT\\.${id}\\s*:\\s*(-?[0-9.]+)`, "g"),
    new RegExp(`opts\\.tune\\.${id}\\s*!=\\s*null\\s*\\?\\s*opts\\.tune\\.${id}\\s*:\\s*(-?[0-9.]+)`, "g"),
  ];
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(src))) out.push(Number(m[1]));
  }
  return out;
}

function seen(src, id, u) {
  const idRe = new RegExp(
    `(?:\\.|\\[")${id}\\b|` +
    `(?:k|gk)\\(\\s*["']${id}["']|` +
    `tune\\.${id}\\b|` +
    `LT\\.${id}\\b|` +
    `sky\\.${id}\\b|` +
    `frame\\.${id}\\b|` +
    `frameSky\\.${id}\\b`,
  );
  if (idRe.test(src)) return true;
  if (u && src.includes(u)) return true;
  return false;
}

const defs = tuneDefs();
const srcs = Object.fromEntries(Object.entries(TREES).map(([k, files]) => [k, loadTree(files)]));

const rows = defs.map((d) => {
  const glx = seen(srcs.glx, d.id, d.u);
  const wgx = seen(srcs.wgx, d.id, d.u);
  const tlx = seen(srcs.tlx, d.id, d.u);
  const cpu = seen(srcs.cpu, d.id, d.u);
  const kind = d.u ? "uniform" : "cpu";
  const gap = [];
  if (kind === "uniform") {
    if (!glx) gap.push("glx");
    if (!wgx && !GLX_ONLY.has(d.id)) gap.push("wgx");
    if (!tlx && !GLX_ONLY.has(d.id)) gap.push("tlx");
  } else if (!cpu && !glx) {
    gap.push("cpu");
  }
  const def = typeof d.def === "number" ? d.def : null;
  const fb = {
    glx: fallbacks(srcs.glx, d.id),
    wgx: fallbacks(srcs.wgx, d.id),
    tlx: fallbacks(srcs.tlx, d.id),
  };
  const fbMiss = [];
  if (def != null) {
    for (const [be, vals] of Object.entries(fb)) {
      const gate = FALLBACK_GATE[d.id] || [];
      const bad = vals.filter((v) =>
        Math.abs(v - def) > 1e-6 && !gate.some((g) => Math.abs(v - g) < 1e-6));
      if (bad.length) fbMiss.push(`${be}:${bad.join("/")}`);
    }
  }
  return {
    id: d.id, label: d.label, group: d.group, u: d.u || "",
    kind, glx, wgx, tlx, cpu,
    glxOnly: GLX_ONLY.has(d.id),
    gap, def, fb, fbMiss,
  };
});

const gaps = rows.filter((r) => r.gap.length);
const fbGaps = rows.filter((r) => r.fbMiss.length);
const byGroup = {};
for (const r of rows) {
  (byGroup[r.group] ||= { n: 0, gaps: 0 }).n++;
  if (r.gap.length) byGroup[r.group].gaps++;
}

function report(json) {
  if (json) {
    process.stdout.write(JSON.stringify({ total: rows.length, gaps, fbGaps, rows }, null, 2) + "\n");
    return;
  }
  console.log(`TUNE_DEFS ${rows.length}  uniform ${rows.filter((r) => r.kind === "uniform").length}  cpu ${rows.filter((r) => r.kind === "cpu").length}`);
  console.log(`gaps ${gaps.length}  fallback-miss ${fbGaps.length}  (GLX-only: ${[...GLX_ONLY].join(", ")})`);
  console.log("");
  for (const [g, s] of Object.entries(byGroup)) {
    console.log(`  ${g.padEnd(22)} ${String(s.n).padStart(3)} knobs  ${s.gaps ? s.gaps + " gap" : "ok"}`);
  }
  if (gaps.length) {
    console.log("\nGAPS (portable knob missing on a deferred backend):");
    for (const r of gaps) {
      console.log(`  ${r.id.padEnd(18)} ${r.kind.padEnd(8)} missing ${r.gap.join(",")}  u=${r.u || "—"}  [${r.group}]`);
    }
  }
  if (fbGaps.length) {
    console.log("\nFALLBACK ≠ TUNE_DEFS.def (missing-tune path reads a different number):");
    for (const r of fbGaps) {
      console.log(`  ${r.id.padEnd(18)} def=${r.def}  ${r.fbMiss.join("  ")}`);
    }
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  report(process.argv.includes("--json"));
  if (gaps.length || fbGaps.length) process.exitCode = 1;
}

export { defs, rows, gaps, fbGaps, GLX_ONLY, FALLBACK_GATE };
