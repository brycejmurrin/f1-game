#!/usr/bin/env node
/**
 * tune-backend-audit — every TUNE_DEFS slider vs GLX / WGX / TLX.
 *
 * Pass 1 — name + fallback: a knob is "seen" when that backend's tree reads
 * the id (T.id / k("id") / gk("id") / sky.id / frame.id) or its GLSL `u`
 * name. CPU-only knobs (no `u`) are live on every backend if game.js /
 * atmosphere / lighting.js apply them into frame.* / frameSky.* / lights.
 *
 * Pass 2 — shader consume: each uniform must appear as a LIVE identifier in
 * the backend's shader tree (comment-stripped). Packed WGX/TLX locals that
 * rename the GLSL `u` live in SHADER_ALIAS. CPU_FOLD knobs are multiplied
 * into another uploaded field in the packer and never named in WGSL/TSL.
 *
 * Pass 2 also checks SETTINGS look steppers (GRAPHICS / RESOLUTION /
 * RENDERER / THREE PATH / SCREENSHOTS) and that GRAPHICS feature-shed
 * fields (po.reflect / carReflect / bloom / ssao / godray / contact /
 * lampVol) are read on every present() path.
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

// Shader trees only. JS packers can mention a knob in a comment and still
// leave the WGSL/TSL reading a constant — consume ignores packer files.
const SHADERS = {
  glx: [
    "js/render/shaders/lit.js",
    "js/render/shaders/post.js",
    "js/render/shaders/sky.js",
    "js/render/shaders/fx.js",
  ],
  wgx: [
    "js/render/webgpu/wgsl-chunks.js",
    "js/render/webgpu/wgsl-post.js",
    "js/render/webgpu/wgsl-fx.js",
  ],
  tlx: [
    "js/render/three/tsl-lit.js",
    "js/render/three/tsl-post.js",
    "js/render/three/tsl-sky.js",
    "js/render/three/tsl-fx.js",
  ],
};

// Live identifiers that are not the TUNE_DEFS id / GLSL `u`. Backend omitted
// when id or `u` already appears in that shader tree.
const SHADER_ALIAS = {
  sunShaftDecay: { wgx: ["shaftDecay"], tlx: ["shaftDecay"] },
  ssaoRadius:    { wgx: ["U.p1.x"], tlx: ["ssaoU.radius"] },
  bloomSpread:   { wgx: ["U.spread"], tlx: ["spread"] },
  vignetteSoft:  { tlx: ["vigSoft"] },
  shadowStr:     { wgx: ["F.params2.y"] },
  ssrThick:      { wgx: ["let thick"] },
  carGloss:      { wgx: ["U.gloss"] },
  acesA:         { wgx: ["U.aces"] },
  acesB:         { wgx: ["U.aces"] },
  acesC:         { wgx: ["U.aces"] },
  acesD:         { wgx: ["U.aces"] },
  acesE:         { wgx: ["U.tuneFx.z"] },
};

// Slider is multiplied into another uploaded field in the packer (WGX
// fogDensity / groundMist). The shader never sees the slider name.
const CPU_FOLD = new Set(["fogDensityMul", "mistDensity"]);

// Honest no-ops. Not gaps — the next survey should not "fix" these.
const RECORDED_NOOP = [
  { id: "perChunkLights", where: "wgx+tlx", note: "WebGL2 chunked lamp upload only" },
  { id: "roadChunkLamps", where: "wgx+tlx", note: "needs perChunkLights" },
  { id: "pcssPen", where: "tlx-gles", note: "fixed-radius kernel on phone/software GL; live on TLX desktop WebGL2 + WebGPU + GLX + WGX" },
];

// SETTINGS look steppers (not TUNE_DEFS). Camera-tuner / audio / steer
// sliders are CPU-only and backend-agnostic — they are not in this list.
const SETTINGS_LOOK = [
  { id: "gfxPreset", label: "GRAPHICS", backends: "glx wgx tlx", via: "PerfGov.setUserTier → po.*" },
  { id: "resMode", label: "RESOLUTION", backends: "glx wgx tlx", via: "gfx.setRenderScale" },
  { id: "gfxBackend", label: "RENDERER", backends: "glx wgx tlx", via: "apex26.gfxBackend" },
  { id: "threePath", label: "THREE PATH", backends: "tlx", via: "apex26.tlxForceGL / THREE PATH" },
  { id: "screenshots", label: "SCREENSHOTS", backends: "wgx tlx-webgpu", via: "apex26.wgxCapture" },
];

const SHED_OPTS = ["reflect", "carReflect", "bloom", "ssao", "godray", "contact", "lampVol"];
const PRESENT = {
  glx: ["js/render/glx/post.js"],
  wgx: ["js/render/webgpu/wgx.js"],
  tlx: ["js/render/three/tlx-post.js"],
};
const SCALE_FILES = {
  glx: "js/render/glx.js",
  wgx: "js/render/webgpu/wgx.js",
  tlx: "js/render/three/tlx.js",
};

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
const shaderSrcs = Object.fromEntries(Object.entries(SHADERS).map(([k, files]) => [k, loadTree(files)]));
const presentSrcs = Object.fromEntries(Object.entries(PRESENT).map(([k, files]) => [k, loadTree(files)]));
const scaleSrcs = Object.fromEntries(Object.entries(SCALE_FILES).map(([k, f]) => [k, loadTree([f])]));

function consumeHit(be, id, u) {
  const src = shaderSrcs[be];
  if (seen(src, id, u)) return true;
  // WGSL/TSL often bind the slider to a local (`let carReflect = U.upVS.w`)
  // with no `T.` / `k()` prefix — that is still a live consume.
  if (new RegExp(`\\b${id}\\b`).test(src)) return true;
  const aliases = (SHADER_ALIAS[id] && SHADER_ALIAS[id][be]) || [];
  return aliases.some((a) => a && src.includes(a));
}

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
  const consume = { glx: true, wgx: true, tlx: true };
  const consumeMiss = [];
  if (kind === "uniform" && !CPU_FOLD.has(d.id)) {
    for (const be of ["glx", "wgx", "tlx"]) {
      if (GLX_ONLY.has(d.id) && be !== "glx") continue;
      const ok = consumeHit(be, d.id, d.u);
      consume[be] = ok;
      if (!ok) consumeMiss.push(be);
    }
  }
  return {
    id: d.id, label: d.label, group: d.group, u: d.u || "",
    kind, glx, wgx, tlx, cpu,
    glxOnly: GLX_ONLY.has(d.id),
    cpuFold: CPU_FOLD.has(d.id),
    consume, consumeMiss,
    gap, def, fb, fbMiss,
  };
});

const gaps = rows.filter((r) => r.gap.length);
const fbGaps = rows.filter((r) => r.fbMiss.length);
const consumeGaps = rows.filter((r) => r.consumeMiss.length);

const shedMiss = [];
for (const be of ["glx", "wgx", "tlx"]) {
  const src = presentSrcs[be];
  for (const k of SHED_OPTS) {
    const re = new RegExp(`(?:opts|o)\\.${k}\\b`);
    if (!re.test(src)) shedMiss.push(`${be}.${k}`);
  }
}
const scaleMiss = Object.entries(scaleSrcs)
  .filter(([, src]) => !src.includes("setRenderScale"))
  .map(([be]) => be);
const byGroup = {};
for (const r of rows) {
  (byGroup[r.group] ||= { n: 0, gaps: 0 }).n++;
  if (r.gap.length) byGroup[r.group].gaps++;
}

function report(json) {
  if (json) {
    process.stdout.write(JSON.stringify({
      total: rows.length, gaps, fbGaps, consumeGaps, shedMiss, scaleMiss,
      SETTINGS_LOOK, RECORDED_NOOP, rows,
    }, null, 2) + "\n");
    return;
  }
  console.log(`TUNE_DEFS ${rows.length}  uniform ${rows.filter((r) => r.kind === "uniform").length}  cpu ${rows.filter((r) => r.kind === "cpu").length}`);
  console.log(`gaps ${gaps.length}  fallback-miss ${fbGaps.length}  consume-miss ${consumeGaps.length}  (GLX-only: ${[...GLX_ONLY].join(", ")})`);
  console.log(`GRAPHICS shed ${shedMiss.length ? shedMiss.join(", ") : "ok"}  RESOLUTION setRenderScale ${scaleMiss.length ? "missing " + scaleMiss.join(",") : "ok"}`);
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
  if (consumeGaps.length) {
    console.log("\nCONSUME (uniform packed in JS but no live identifier in the shader tree):");
    for (const r of consumeGaps) {
      console.log(`  ${r.id.padEnd(18)} missing ${r.consumeMiss.join(",")}  u=${r.u || "—"}  [${r.group}]`);
    }
  }
  console.log("\nSETTINGS look steppers:");
  for (const s of SETTINGS_LOOK) {
    console.log(`  ${s.label.padEnd(14)} ${s.backends.padEnd(22)} via ${s.via}`);
  }
  console.log("\nRecorded no-ops (not gaps):");
  for (const n of RECORDED_NOOP) {
    console.log(`  ${n.id.padEnd(18)} ${n.where.padEnd(12)} ${n.note}`);
  }
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  report(process.argv.includes("--json"));
  if (gaps.length || fbGaps.length || consumeGaps.length || shedMiss.length || scaleMiss.length) {
    process.exitCode = 1;
  }
}

export {
  defs, rows, gaps, fbGaps, consumeGaps, shedMiss, scaleMiss,
  GLX_ONLY, FALLBACK_GATE, CPU_FOLD, SHADER_ALIAS, RECORDED_NOOP, SETTINGS_LOOK, SHED_OPTS,
};
