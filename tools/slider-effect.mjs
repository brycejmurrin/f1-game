#!/usr/bin/env node
/**
 * slider-effect.mjs — classify how effective each LIGHTING TUNER slider is.
 *
 * NO BROWSER. Pixel mean-abs-diff is the WRONG instrument for many knobs
 * (nightAmbLift ×4 ambient moved 0.37/255). Prefer consumer + gates + which
 * lightState fields SHOULD move. Does NOT wrap tools/lighting-tuner-sweep.mjs.
 *
 * Failure modes — "this slider does nothing" is NEVER unwired
 * (docs/LIGHTING-TUNER-SLIDERS.md, "Every slider is wired" table):
 *   not stored | not re-applied (APPLY_RACE_IDS) | not rebuilt (rebuild:true)
 *   | inert (gated consumer) | conditional (wrong tod/wx)
 *
 *   node tools/slider-effect.mjs
 *   node tools/slider-effect.mjs --group LAMPS
 *   node tools/slider-effect.mjs --class apply-only
 *   node tools/slider-effect.mjs --gate night
 *   node tools/slider-effect.mjs --risk inert|conditional|reapply|rebuild
 *   node tools/slider-effect.mjs --tag saturate|chunk-lamps|sparse-pixels
 *   node tools/slider-effect.mjs --live lampLevel --from 0 --to 0.55
 *   node tools/slider-effect.mjs --live lampLevel --shots 5
 *   node tools/slider-effect.mjs --live lampLevel --levels 0,0.13,0.26,0.55,0.687
 *   node tools/slider-effect.mjs --filter --a a.png --b b.png --out dir
 *   node tools/slider-effect.mjs --json
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const HELP = `slider-effect.mjs — classify LIGHTING TUNER slider effectiveness (no browser)

"This slider does nothing" is NEVER unwired. Failure modes (see the table in
docs/LIGHTING-TUNER-SLIDERS.md):
  not stored | not re-applied (APPLY_RACE_IDS) | not rebuilt (rebuild:true)
  | inert (gated consumer) | conditional (wrong tod/wx)

Pixel mean-abs-diff is the WRONG instrument for many knobs (nightAmbLift ×4
ambient moved 0.37/255). This tool classifies by consumer + gates + which
lightState fields SHOULD move. It does NOT wrap tools/lighting-tuner-sweep.mjs.

Usage:
  node tools/slider-effect.mjs
  node tools/slider-effect.mjs --group LAMPS
  node tools/slider-effect.mjs --class apply-only
  node tools/slider-effect.mjs --gate night
  node tools/slider-effect.mjs --risk inert|conditional|reapply|rebuild
  node tools/slider-effect.mjs --tag saturate|chunk-lamps|sparse-pixels
  node tools/slider-effect.mjs --live lampLevel --from 0 --to 0.55
  node tools/slider-effect.mjs --live lampLevel --shots 5
  node tools/slider-effect.mjs --live lampLevel --levels 0,0.13,0.26,0.55,0.687
  node tools/slider-effect.mjs --live lampLevel --dry-run
  node tools/slider-effect.mjs --live --all --dry-run
  node tools/slider-effect.mjs --live --group LAMPS --dry-run
  node tools/slider-effect.mjs --filter --a a.png --b b.png --out dir
  node tools/slider-effect.mjs --json
  node tools/slider-effect.mjs --help

Filters (no browser):
  --group NAME   TUNE_DEFS group (substring, case-insensitive)
  --class NAME   apply-only | per-frame | uniform | build-only
  --gate NAME    night | wet | rain | fog | overcast | day
  --risk NAME    inert | conditional | reapply | rebuild
  --tag NAME     night-only | overcast-only | fog-only | rain-only | wet-drizzle
                 | traffic | far-scenery | bloom-tier | chunk-lamps | saturate
                 | sparse-pixels
  --json         JSON on stdout (knobs + counts)

Visual A/B (Playwright via tools/harness.mjs — NOT Chrome MCP):
  --live ID      boot Playwright, chase+park at the knob's recipe, write
                 v0.png… / a.png / b.png / filter.png / heat.png / sheet.png
                 (ramp.png when N>2). filter.png shows ONLY the changed pixels
                 (B value), everything else crushed to black.
  --live --all   every TUNE_DEFS knob; ONE park per shared condition bucket
  --live --group NAME   same, but only that TUNE_DEFS group
  --live --ids a,b,c    same batch, but only those ids
  --shots N      frames to capture (default 2 = A/B only). Use --shots 5 to
                 see the full min→max ramp and discover mid-range behaviour.
                 N>2 without --from/--to samples full TUNE_DEFS min→max;
                 with ends, linspaces those ends.
  --levels v,v,v explicit slider values (wins over --shots / --from / --to)
  --from N --to N   slider endpoints (2-shot default: shipped def → extreme)
  --track --tod --weather --frac   override the capture recipe (auto-selected
                 from the knob's gates + RECIPE_BY_ID in slider-effect-live.mjs:
                 glareStr→night frac=0.12 full-range, fogWxMul→monaco fog day,
                 renderDistMul→spa day 0.50, starBright→bahrain sky, …)
  --out DIR      default artifacts/lighting/slider-effect/<track>-<tod>-<wx>-<id>
  --dry-run      print the recipe(s) without launching a browser
  --filter --a PNG --b PNG --out DIR
                 run the visual filter on two existing PNGs, no game needed

  Timing: per-frame knobs ~20 s each; build-only (rebuild:true) ~30 s each.
  Batching (--ids / --group / --all) amortises the setup: knobs that share a
  condition bucket (same track/tod/weather/frac/camera) park ONCE together.

  Do NOT run --live while cdmcp-cli.py look-survey is running — both launch
  Playwright/Chrome. Check first: pgrep -a chromium | head -3

  Restore the PRE-PUSH live value on exit (never TUNE_DEFS.def). One global
  Bahrain-night recipe false-deads weather/fog/star/traffic knobs — --all
  uses per-id RECIPE_BY_ID entries. Full reference: docs/LIGHTING-TUNER-SLIDERS.md
`;

const APPLY_ONLY_FILES = ["js/game/atmosphere.js"];
const SCAN_FILES = [
  "js/game/lighting.js",
  "js/game.js",
  "js/game/atmosphere.js",
  "js/game/particles.js",
  "js/render/glx.js",
  "js/render/glx/post.js",
  "js/render/glx/shadow.js",
];
const BUILD_FNS = ["buildTrackLights", "floodColor", "applyLampDensity", "lampDensityFactor", "lampStrideNodes", "lampStrideM"];
const FRAME_FNS = ["setFrameLights", "appendCarTailLights", "lampCap", "capRadius2"];
const LIGHT_STATE = [
  "ambientSky", "ambientGround", "sunColor", "exposure", "fogDensity", "fogColor",
  "skyHorizon", "skySunColor", "skyStars", "skyMoon", "cullDist", "moonK", "moonGate",
  "meanLampRGB", "bakedLights", "lampPosts", "numLights", "sunY", "floodEmit",
];
const WEATHER_GATES = new Set(["wet", "rain", "fog", "overcast"]);
const CLASSES = new Set(["apply-only", "per-frame", "uniform", "build-only"]);
const RISKS = new Set(["inert", "conditional", "reapply", "rebuild"]);
const GATES = new Set(["night", "wet", "rain", "fog", "overcast", "day"]);
const TAGS = new Set([
  "night-only", "overcast-only", "fog-only", "rain-only", "wet-drizzle",
  "traffic", "far-scenery", "bloom-tier", "chunk-lamps", "saturate", "sparse-pixels",
]);
const TAG_BY_ID = {
  lampCull: "traffic",
  renderDistMul: "far-scenery",
  perChunkLights: "chunk-lamps",
  roadChunkLamps: "chunk-lamps",
  lampFogBase: "saturate",
  vignetteSoft: "saturate",
  godrayAniso: "saturate",
  carGloss: "saturate",
  starBright: "sparse-pixels",
  flareStreak2: "sparse-pixels",
};

const read = (root, p) => readFileSync(path.join(root, p), "utf8");

function extractFn(src, name) {
  const a = src.indexOf(`function ${name}(`);
  if (a < 0) return null;
  let i = src.indexOf("{", a), depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { if (--depth === 0) return src.slice(a, i + 1); }
  }
  return null;
}

function stripTuneDefs(src) {
  const a = src.indexOf("const TUNE_DEFS = [");
  if (a < 0) return src;
  let i = src.indexOf("[", a), depth = 0, end = -1;
  for (; i < src.length; i++) {
    if (src[i] === "[") depth++;
    else if (src[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  return end < 0 ? src : src.slice(0, a) + src.slice(end);
}

function seedLog(root, ctx) {
  vm.runInContext(read(root, "js/log.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/log.js" });
}

export function loadTuneDefs(root) {
  const sandbox = { console: { log() {}, warn() {}, error() {} }, Math, JSON, Object, Array };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(root, sandbox);
  vm.runInContext(read(root, "js/game/lighting.js").replace(/^const\b/gm, "var"), sandbox);
  return sandbox.LightTune.TUNE_DEFS;
}

function applyRaceIds(root) {
  const src = read(root, "js/game/light-store.js");
  const m = src.match(/APPLY_RACE_IDS\s*=\s*new Set\(\[([\s\S]*?)\]\)/);
  if (!m) throw new Error("could not find APPLY_RACE_IDS in js/game/light-store.js");
  return new Set([...m[1].matchAll(/"([A-Za-z0-9_]+)"/g)].map((x) => x[1]));
}

function qualifiedRead(src, id) {
  return new RegExp(`[A-Za-z_$][A-Za-z0-9_$]*\\.${id}\\b`).test(src);
}

function windowsAround(src, id) {
  const needle = `.${id}`;
  const out = [];
  let i = 0;
  while ((i = src.indexOf(needle, i)) >= 0) {
    const beforeCh = i > 0 ? src[i - 1] : "";
    const afterCh = src[i + needle.length] || "";
    if (/[A-Za-z0-9_$]/.test(beforeCh) && !/[A-Za-z0-9_$]/.test(afterCh)) {
      out.push({
        // Gates live in the controlling `if` ABOVE the read — looking past it
        // picks up the next weather/tod branch (fogWxMul after overcastFogMul).
        before: src.slice(Math.max(0, i - 700), i),
        around: src.slice(Math.max(0, i - 120), Math.min(src.length, i + needle.length + 220)),
      });
    }
    i += needle.length;
  }
  return out;
}

function gatesFromHelp(d) {
  const text = `${d.label || ""} ${d.help || ""}`;
  const gates = new Set();
  if (/only affects night|night sessions|after dark\b|night ambient|moody-night|clear moon|night star|night buildings|night circuits|night\/wet liveries|NIGHT AMBIENT|NIGHT SHEEN|CITY SKYGLOW/i.test(text)
      || /\bNIGHT\b/.test(d.label || ""))
    gates.add("night");
  if (/only affects overcast|overcast sessions/i.test(text))
    gates.add("overcast");
  if (/only affects fog(?: |$)|fog sessions/i.test(text))
    gates.add("fog");
  if (/no effect in clear\/dry|wet\/rain\/overcast\/fog/i.test(text)) {
    gates.add("wet"); gates.add("rain"); gates.add("overcast"); gates.add("fog");
  }
  if (/day-only|daytime|DAY sessions|day tarmac|daytime sky|DAY SKY|DAY SHEEN|DAYTIME LAMPS/i.test(text)
      || /\bDAY\b/.test(d.label || ""))
    gates.add("day");
  if (/only affects WET|DRIZZLE|\bWET\b \(non-raining\)|wet-road|wet asphalt|wet mirror|WET HAZE|WET ROAD|WETNESS/i.test(text)
      || /WET MIRROR|WET ROAD DARKEN/i.test(d.label || ""))
    gates.add("wet");
  if (/\bstorm\b|downpour|RAIN INTENSITY|RAIN STREAK|RAIN FALL|RAIN OPACITY|RAIN WIND|LIGHTNING/i.test(text)
      || /^rain/i.test(d.id) || /^lightning/i.test(d.id))
    gates.add("rain");
  if (d.group === "LAMPS" && d.id !== "floodDay") gates.add("night");
  if (d.group === "NIGHT GLOW & BLOOM") gates.add("night");
  if (/^star/i.test(d.id) || /^moon/i.test(d.id) || d.id === "lampShadow") gates.add("night");
  if (d.id === "floodDay" || d.id === "ssrDryDay" || d.id === "daySkyBlue" || d.id === "windowSunFlash")
    gates.add("day");
  return gates;
}

function nearestGuard(before) {
  let search = before;
  while (search.length) {
    const a = search.lastIndexOf("else if (");
    const b = search.lastIndexOf("if (");
    const idx = Math.max(a, b);
    if (idx < 0) return "";
    const brace = search.indexOf("{", idx);
    const semi = search.indexOf(";", idx);
    // One-liner `if (cond) stmt;` does not wrap a later LT read.
    if (semi >= 0 && (brace < 0 || semi < brace)) {
      search = search.slice(0, idx);
      continue;
    }
    if (brace < 0) return "";
    if (search.length - brace > 480) {
      search = search.slice(0, idx);
      continue;
    }
    return search.slice(idx, brace);
  }
  return "";
}

function gatesFromSnippet(before) {
  const snip = nearestGuard(before);
  const gates = new Set();
  if (/isNightSession|raceTimeOfDay === "night"|_nightAmbientBand/.test(snip)) gates.add("night");
  if (/raceWeather === "overcast"/.test(snip)) gates.add("overcast");
  if (/raceWeather === "fog"/.test(snip)) gates.add("fog");
  if (/isWetRoad\(/.test(snip)) gates.add("wet");
  if (/isRaining\(|raceWeather === "rain"/.test(snip)) gates.add("rain");
  if (/raceTimeOfDay === "day"/.test(snip)) gates.add("day");
  return gates;
}

function movesFromSnippet(snip) {
  const moves = [];
  for (const f of LIGHT_STATE) if (snip.includes(f)) moves.push(f);
  return moves;
}

function inferConsumer(d, moves, klass) {
  if (moves.includes("ambientSky") || moves.includes("ambientGround")
      || /Amb/.test(d.id) || (d.group || "").includes("AMBIENT"))
    return "ambient";
  if (moves.includes("fogDensity") || moves.includes("fogColor")
      || /fog|mist|haze|overcastFog/i.test(d.id))
    return "fog";
  if (moves.includes("sunColor") || moves.includes("sunY")
      || /^(sun|keyMul|weatherSunMute|moonBright)/.test(d.id))
    return "sun";
  if (moves.includes("bakedLights") || moves.includes("lampPosts") || moves.includes("meanLampRGB")
      || d.group === "LAMPS" || /^(lamp|pool|bleed|beam|flood|glare)/i.test(d.id))
    return "lamps";
  if (klass === "uniform") return "shader";
  if (d.group === "IMAGE & COLOUR") return "image";
  if (d.group === "CAR") return "car";
  if (d.group === "SKY & WEATHER") return "sky";
  return "other";
}

function inertFromHelp(d) {
  const h = d.help || "";
  return /needs .+ on to do anything/i.test(h)
    || /does nothing when no /i.test(h)
    || /Held off automatically/i.test(h);
}

function tagsFromKnob(d, gates) {
  const tags = new Set();
  if (gates.length === 1) {
    const only = `${gates[0]}-only`;
    if (TAGS.has(only)) tags.add(only);
  }
  if (/^drizzle/i.test(d.id)) tags.add("wet-drizzle");
  if (/^(bloom|sunShaft)/i.test(d.id)) tags.add("bloom-tier");
  if (TAG_BY_ID[d.id]) tags.add(TAG_BY_ID[d.id]);
  return [...tags].sort();
}

/**
 * Classify every TUNE_DEFS knob. Pure source reads — no browser.
 * @param {string} [root]
 */
export function classifyKnobs(root = ROOT) {
  const defs = loadTuneDefs(root);
  const registered = applyRaceIds(root);
  const lighting = read(root, "js/game/lighting.js");
  const lightingBody = stripTuneDefs(lighting);
  const sources = new Map(SCAN_FILES.map((f) => [
    f, f === "js/game/lighting.js" ? lightingBody : read(root, f),
  ]));
  const gsrc = sources.get("js/game.js");
  const nightBand = extractFn(gsrc, "_nightAmbientBand") || "";
  const buildSrc = BUILD_FNS.map((n) => extractFn(lighting, n) || "").join("\n");
  const frameSrc = FRAME_FNS.map((n) => extractFn(lighting, n) || "").join("\n");

  const knobs = [];
  for (const d of defs) {
    const re = () => new RegExp(`\\bLT\\.${d.id}\\b`);
    const inBuild = re().test(buildSrc);
    const inFrame = re().test(frameSrc);
    const where = [];
    const snippets = [];
    for (const [file, src] of sources) {
      if (qualifiedRead(src, d.id)) {
        where.push(file);
        snippets.push(...windowsAround(src, d.id));
      }
    }
    const applyOnly = where.length > 0 && where.every((f) => APPLY_ONLY_FILES.includes(f));
    const nightBandOnly = where.length === 1 && where[0] === "js/game.js"
      && qualifiedRead(nightBand, d.id);
    const isApply = applyOnly || nightBandOnly || registered.has(d.id) && !inFrame && !d.u && !d.rebuild;

    let klass;
    if (d.u) klass = "uniform";
    else if (d.rebuild || (inBuild && !inFrame)) klass = "build-only";
    else if (isApply && !inFrame) klass = "apply-only";
    else klass = "per-frame";

    // APPLY_RACE membership is the live-via path for apply-only knobs, even
    // when a read also lives in _nightAmbientBand (game.js).
    if ((applyOnly || nightBandOnly) && !d.u && !d.rebuild) klass = "apply-only";

    const gates = gatesFromHelp(d);
    for (const snip of snippets) for (const g of gatesFromSnippet(snip.before)) gates.add(g);
    if (nightBandOnly || qualifiedRead(nightBand, d.id)) gates.add("night");

    const moves = new Set();
    for (const snip of snippets) for (const f of movesFromSnippet(snip.around)) moves.add(f);
    if (qualifiedRead(nightBand, d.id)) {
      moves.add("ambientSky");
      moves.add("ambientGround");
    }

    const risks = [];
    if ((applyOnly || nightBandOnly) && !registered.has(d.id)) risks.push("reapply");
    if (inBuild && !inFrame && !d.rebuild) risks.push("rebuild");
    if (gates.size) risks.push("conditional");
    if (!where.length || inertFromHelp(d)) risks.push("inert");

    const gateList = [...gates].sort();
    const moveList = [...moves];
    knobs.push({
      id: d.id,
      label: d.label || d.id,
      group: d.group || "",
      section: d.section || null,
      class: klass,
      rebuild: !!d.rebuild,
      reinitRain: !!d.reinitRain,
      applyRace: registered.has(d.id),
      uniform: d.u || null,
      gates: gateList,
      tags: tagsFromKnob(d, gateList),
      weatherGated: gateList.some((g) => WEATHER_GATES.has(g)),
      consumer: inferConsumer(d, moveList, klass),
      moves: moveList,
      risks,
      files: where,
    });
  }
  return knobs;
}

export function filterKnobs(knobs, opts = {}) {
  let out = knobs;
  if (opts.group) {
    const g = String(opts.group).toUpperCase();
    out = out.filter((k) => (k.group || "").toUpperCase().includes(g));
  }
  if (opts.class) {
    const c = String(opts.class).toLowerCase();
    out = out.filter((k) => k.class === c);
  }
  if (opts.gate) {
    const g = String(opts.gate).toLowerCase();
    out = out.filter((k) => k.gates.includes(g));
  }
  if (opts.risk) {
    const r = String(opts.risk).toLowerCase();
    out = out.filter((k) => k.risks.includes(r));
  }
  if (opts.tag) {
    const t = String(opts.tag).toLowerCase();
    out = out.filter((k) => k.tags.includes(t));
  }
  return out;
}

export function countRisks(knobs) {
  const byClass = { "per-frame": 0, uniform: 0, "apply-only": 0, "build-only": 0 };
  const byRisk = { reapply: 0, rebuild: 0, conditional: 0, inert: 0 };
  for (const k of knobs) {
    if (byClass[k.class] != null) byClass[k.class]++;
    for (const r of k.risks) if (byRisk[r] != null) byRisk[r]++;
  }
  return { total: knobs.length, byClass, byRisk };
}

function pad(s, n) {
  s = String(s);
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

export function formatTable(knobs, counts) {
  const lines = [
    pad("ID", 18) + pad("GROUP", 20) + pad("CLASS", 12) + pad("GATES", 28)
      + pad("RISK", 22) + "CONSUMER  MOVES",
    "-".repeat(118),
  ];
  for (const k of knobs) {
    lines.push(
      pad(k.id, 18)
      + pad(k.group, 20)
      + pad(k.class, 12)
      + pad(k.gates.join(",") || "—", 28)
      + pad(k.risks.join(",") || "—", 22)
      + pad(k.consumer, 10)
      + (k.moves.join(",") || "—"),
    );
  }
  lines.push("");
  lines.push(`${counts.total} knobs   class: per-frame ${counts.byClass["per-frame"]}, uniform ${counts.byClass.uniform}, apply-only ${counts.byClass["apply-only"]}, build-only ${counts.byClass["build-only"]}`);
  lines.push(`risk: reapply ${counts.byRisk.reapply}, rebuild ${counts.byRisk.rebuild}, conditional ${counts.byRisk.conditional}, inert ${counts.byRisk.inert}`);
  return lines.join("\n");
}

export function parseArgs(argv) {
  const opts = { json: false, help: false, live: false, filter: false, dryRun: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = (name) => {
      if (a === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("-")) {
        opts[name] = argv[++i]; return true;
      }
      if (a.startsWith(`--${name}=`)) { opts[name] = a.slice(name.length + 3); return true; }
      return false;
    };
    if (a === "--help" || a === "-h") opts.help = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--filter") opts.filter = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--all") opts.all = true;
    else if (a === "--live") {
      opts.live = true;
      if (argv[i + 1] && !argv[i + 1].startsWith("-")) opts.id = argv[++i];
    }
    else if (eq("group") || eq("class") || eq("gate") || eq("risk") || eq("tag")
      || eq("id") || eq("ids") || eq("track") || eq("tod") || eq("weather") || eq("out")
      || eq("a") || eq("b") || eq("from") || eq("to") || eq("frac") || eq("hud-crop")
      || eq("shots") || eq("levels"))
      continue;
    else if (a.startsWith("-")) throw new Error(`unknown flag: ${a}\n${HELP}`);
  }
  if (opts["hud-crop"] != null) opts.hudCrop = Number(opts["hud-crop"]);
  if (opts.from != null) opts.from = Number(opts.from);
  if (opts.to != null) opts.to = Number(opts.to);
  if (opts.frac != null) opts.frac = Number(opts.frac);
  if (opts.shots != null) opts.shots = Number(opts.shots);
  if (opts.class && !CLASSES.has(opts.class))
    throw new Error(`--class must be one of ${[...CLASSES].join("|")}`);
  if (opts.risk && !RISKS.has(opts.risk))
    throw new Error(`--risk must be one of ${[...RISKS].join("|")}`);
  if (opts.gate && !GATES.has(opts.gate))
    throw new Error(`--gate must be one of ${[...GATES].join("|")}`);
  if (opts.tag && !TAGS.has(opts.tag))
    throw new Error(`--tag must be one of ${[...TAGS].join("|")}`);
  return opts;
}

const VIEW_PY = path.join(ROOT, "tools/slider-effect-view.py");

export async function main(argv = process.argv.slice(2), root = ROOT) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }
  if (opts.filter || opts.a || opts.b) {
    if (!opts.a || !opts.b) throw new Error("--filter needs --a PNG and --b PNG");
    const out = opts.out || path.join(root, "artifacts/lighting/slider-effect/filter");
    const r = spawnSync("python3", [
      VIEW_PY, opts.a, opts.b, "--out", out,
      "--hud-crop", String(opts.hudCrop ?? 0.10),
    ], { encoding: "utf8" });
    process.stdout.write(r.stdout || "");
    if (r.status) process.stderr.write(r.stderr || "");
    return r.status ?? 2;
  }
  if (opts.live) {
    if (opts.ids) {
      opts.idList = String(opts.ids).split(",").map((s) => s.trim()).filter(Boolean);
    }
    const batch = opts.all || (!opts.id && !!opts.group) || !!opts.idList;
    if (!opts.id && !batch) {
      throw new Error("usage: --live <id> | --live --all | --live --group NAME | --live --ids a,b   e.g. --live lampLevel --from 0 --to 0.55");
    }
    const all = classifyKnobs(root);
    const defs = loadTuneDefs(root);
    const {
      livePlan, runLive, runLiveBatch, plansForKnobs, summarizePlan,
    } = await import("./slider-effect-live.mjs");
    if (batch) {
      let knobs = filterKnobs(all, opts);
      if (opts.idList) {
        const want = new Set(opts.idList);
        knobs = knobs.filter((k) => want.has(k.id));
        const missing = opts.idList.filter((id) => !knobs.some((k) => k.id === id));
        if (missing.length) throw new Error(`unknown slider id(s): ${missing.join(", ")}`);
      }
      if (!knobs.length) throw new Error("no knobs matched the live filter");
      const packed = plansForKnobs(knobs, defs, opts, root);
      if (opts.dryRun) {
        process.stdout.write(JSON.stringify({
          count: packed.plans.length,
          bucketCount: packed.buckets.length,
          buckets: packed.buckets,
          plans: packed.plans.map(summarizePlan),
        }, null, 2) + "\n");
        return 0;
      }
      return runLiveBatch(opts, root, knobs, defs);
    }
    const knob = all.find((k) => k.id === opts.id);
    const def = defs.find((d) => d.id === opts.id);
    const plan = livePlan(opts, knob, def, root);
    if (opts.dryRun) {
      process.stdout.write(JSON.stringify(summarizePlan(plan), null, 2) + "\n");
      return 0;
    }
    return runLive(opts, root, { knob, def });
  }
  const all = classifyKnobs(root);
  const knobs = filterKnobs(all, opts);
  const counts = countRisks(knobs);
  const payload = { knobs, counts, filtered: knobs.length, total: all.length };
  if (opts.json) process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
  else process.stdout.write(formatTable(knobs, counts) + "\n");
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => { process.exitCode = code; }).catch((e) => {
    process.stderr.write(String(e.message || e) + "\n");
    process.exitCode = 2;
  });
}
