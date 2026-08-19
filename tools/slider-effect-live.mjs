/**
 * slider-effect --live — A/B (or N-shot ramp) LIGHTING TUNER knobs and
 * visually filter the pixels that moved.
 *
 * Uses Playwright (harness.mjs). Do NOT run while cdmcp-cli.py look-survey
 * is active — both own a Chromium process. Check: pgrep -a chromium
 *
 * Key design choices vs Chrome MCP / look-survey:
 *  - Owns its own browser: no external Chrome session required.
 *  - Camera is LOCKED between A and B with A.view({eye,target}) so a
 *    park() drift cannot shift the viewpoint between shots.
 *  - renderClock is pinned to 0 so sky/cloud animation doesn't move.
 *  - Per-knob RECIPE_BY_ID table picks the right condition (night for lamps,
 *    fog for fogWxMul, sky-camera for stars, …) so --all is a real sweep.
 *  - Bucket grouping: knobs sharing the same condition park ONCE together.
 *
 * Timing guidance:
 *  - per-frame knobs: ~20 s each (2 rAFs + settle steps)
 *  - build-only (rebuild:true): ~30 s each (loadTrack rebuilds lamp geometry)
 *  - --shots N>2: N × the per-frame cost; use for full-range ramps
 *
 * --shots N   linspace from→to (default 2 = A/B). Use 5 to see the ramp.
 *             Without --from/--to, N>2 samples the full TUNE_DEFS min→max.
 * --levels v,v,v   explicit values (wins over --shots / --from / --to).
 *
 * RECIPE_BY_ID overrides inferred recipes for knobs that a single global
 * Bahrain-night shot would false-dead (glareStr, fogWxMul, starBright, …).
 * Full reference: docs/LIGHTING-TUNER-SLIDERS.md
 */
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { launchChromium, shutdown, startStaticServer } from "./harness.mjs";

const VIEW = path.join(path.dirname(new URL(import.meta.url).pathname), "slider-effect-view.py");

const TODS = new Set(["dawn", "day", "dusk", "night"]);
const WXS = new Set(["dry", "wet", "rain", "fog", "overcast"]);
const CAMERAS = new Set(["chase", "sky", "horizon"]);

export const TRACK_FRAC = {
  bahrain: 0.12, monaco: 0.16, singapore: 0.55, vegas: 0.28, spa: 0.50,
};

/**
 * Documented capture recipes (LIGHTING-TUNER-SLIDERS.md). These win over
 * gate inference. Keep this table for the knobs a default night/Bahrain
 * shot is proven blind to — the rest fall through recipeFromGates().
 */
export const RECIPE_BY_ID = {
  fogWxMul: { weather: "fog", tod: "day", track: "monaco", why: "fog-only fogDensity" },
  overcastFogMul: { weather: "overcast", tod: "day", track: "monaco", why: "overcast-only fogDensity" },
  moonShadow: {
    weather: "wet", tod: "night", track: "bahrain",
    companions: { drizzleCount: 0, particleMul: 0, moonBright: 2 },
    verdict: "state",
    why: "moonGate stuck at 1 on dry night; state-level, not pixel MAD",
  },
  renderDistMul: {
    weather: "dry", tod: "day", track: "spa", frac: 0.50, camera: "chase",
    why: "far-clip + far scenery; Bahrain has ~70 props in the 900–1800 m band",
  },
  lampReach: {
    weather: "dry", tod: "night", track: "singapore", frac: 0.55,
    why: "lamp-saturated sightline; Vegas 0.05 gains 0 m",
  },
  starBright: {
    weather: "dry", tod: "night", track: "bahrain", camera: "sky",
    minDelta: 4, why: "sub-pixel stars; Vegas cityCov kills the field",
  },
  starDensity: { weather: "dry", tod: "night", track: "bahrain", camera: "sky", minDelta: 4 },
  starSize: { weather: "dry", tod: "night", track: "bahrain", camera: "sky", minDelta: 4 },
  starTwinkle: { weather: "dry", tod: "night", track: "bahrain", camera: "sky", minDelta: 4 },
  floodDay: { weather: "dry", tod: "day", track: "monaco", why: "daytime lamp pools; night already lights them" },
  sunElev: { weather: "dry", tod: "dawn", track: "monaco", why: "midday +elev is a clamp no-op past ~+45" },
  sunAzim: { weather: "dry", tod: "dawn", track: "monaco" },
  lampCull: {
    weather: "dry", tod: "night", track: "singapore", frac: 0.55, traffic: true,
    why: "lampCap ignores the knob when park() solos the field",
  },
  tailLightMul: {
    weather: "dry", tod: "night", track: "singapore", frac: 0.55, traffic: true,
    why: "appendCarTailLights needs cars inside tailRange; park() puts AI 600 m back",
  },
  brakeGlowMul: { weather: "dry", tod: "night", track: "singapore", frac: 0.55, traffic: true },
  tailRange: { weather: "dry", tod: "night", track: "singapore", frac: 0.55, traffic: true },
  tailFade: { weather: "dry", tod: "night", track: "singapore", frac: 0.55, traffic: true },
  drizzleCount: { weather: "wet", tod: "day", track: "monaco", why: "WET non-rain; rain weather is a different particle path" },
  drizzleLen: { weather: "wet", tod: "day", track: "monaco" },
  drizzleSpeed: { weather: "wet", tod: "day", track: "monaco" },
  sunShaftMul: { weather: "dry", tod: "day", track: "monaco", companions: { bloomMul: 1.5 }, why: "needs bloom + a bright midday sun" },
  sunShaftDecay: { weather: "dry", tod: "day", track: "monaco", companions: { bloomMul: 1.5 } },
  flareStreak2: { weather: "dry", tod: "day", track: "monaco", minDelta: 4, why: "3-pixel core streak; use p99/max" },
  cloudDef: {
    weather: "overcast", tod: "day", track: "monaco", camera: "horizon",
    companions: { cloudCover: 0.55 },
    why: "sky() ~58° pitch flattens the cloud noise plane; aim ~30°",
  },
  fogSunCore: { weather: "fog", tod: "dusk", track: "monaco", why: "low sun through fog" },
  carGlow: { weather: "wet", tod: "night", track: "bahrain", why: "night/wet liveries only" },
  bounceK: { weather: "wet", tod: "night", track: "bahrain" },
  cityGlowMul: { weather: "dry", tod: "night", track: "singapore" },
  cityGlowWarm: { weather: "dry", tod: "night", track: "singapore" },
  cityGlowTint: { weather: "dry", tod: "night", track: "singapore" },
  cityGlowReach: { weather: "dry", tod: "night", track: "singapore", camera: "sky" },
  twilightFloor: { weather: "dry", tod: "dusk", track: "bahrain" },
  twilightRamp: { weather: "dry", tod: "dusk", track: "bahrain" },
  twilightWarm: { weather: "dry", tod: "dusk", track: "bahrain" },
  weatherSunMute: { weather: "overcast", tod: "day", track: "monaco", why: "no-op in clear/dry" },
  speedBlur: { weather: "dry", tod: "day", track: "monaco", speed: 80, freeze: false, why: "radial blur is speed-gated" },
  moonBright: { weather: "dry", tod: "night", track: "bahrain", camera: "sky" },
  moonDiscSize: { weather: "dry", tod: "night", track: "bahrain", camera: "sky" },
  moonHalo: { weather: "dry", tod: "night", track: "bahrain", camera: "sky" },
  lampShadow: { weather: "dry", tod: "night", track: "bahrain" },
  // glareStr is a near-field billboard (fades beyond 170 m). The full range
  // is 0→0.3 (max=0.3 in TUNE_DEFS). Shoot from 0 to max so the halo
  // brightens visibly; the default 0.12→0.3 only moves sparse lamp pixels.
  glareStr: { weather: "dry", tod: "night", track: "bahrain", from: 0, to: 0.3,
    minDelta: 4, why: "near-field halo; full range 0→max needed to see change" },
  perChunkLights: { weather: "dry", tod: "night", track: "singapore", frac: 0.55, verdict: "inert" },
  roadChunkLamps: { weather: "dry", tod: "night", track: "singapore", frac: 0.55, verdict: "inert" },
  matTexMix: { weather: "dry", tod: "day", track: "monaco", verdict: "inert" },
};

function blankRecipe() {
  return {
    track: "monaco", tod: "day", weather: "dry", frac: 0.16,
    camera: "chase", traffic: false, minDelta: 10,
    companions: {}, settle: 20,     pinClock: true, freeze: true, speed: 0,
    snapCam: false, verdict: "auto", why: "gate default",
  };
}

function applyPatch(base, patch) {
  const out = { ...base, companions: { ...base.companions, ...(patch.companions || {}) } };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "companions") continue;
    out[k] = v;
  }
  if (out.frac == null) out.frac = TRACK_FRAC[out.track] ?? base.frac;
  if (out.camera === "sky" || out.camera === "horizon" || out.camera === "chase")
    out.snapCam = false;
  return out;
}

/** Infer a capture from catalog gates/tags when RECIPE_BY_ID has no row. */
export function recipeFromGates(knob) {
  const g = new Set(knob.gates || []);
  const tags = new Set(knob.tags || []);
  const id = knob.id;
  const group = knob.group || "";
  let r = blankRecipe();

  if (tags.has("wet-drizzle") || /^drizzle/i.test(id)) r.weather = "wet";
  else if (g.has("rain") && (/^rain|^lightning/i.test(id) || !g.has("wet"))) r.weather = "rain";
  else if (g.has("fog") && !g.has("overcast") && !g.has("rain")) r.weather = "fog";
  else if (g.has("overcast") && !g.has("fog") && !g.has("rain") && !g.has("wet")) r.weather = "overcast";
  else if (g.has("wet") && !g.has("rain")) r.weather = "wet";
  else if (g.has("fog")) r.weather = "fog";
  else if (g.has("overcast")) r.weather = "overcast";
  else if (g.has("rain")) r.weather = "rain";
  else if (g.has("wet")) r.weather = "wet";

  if (g.has("night") && !g.has("day")) r.tod = "night";
  else if (g.has("day") && !g.has("night")) r.tod = "day";
  else if (/twilight|godray|grMul|sunElev|sunAzim|cloudSilver|sunSquash|corona|sunDisc/i.test(id))
    r.tod = "dawn";
  else if (group === "LAMPS" || group === "NIGHT GLOW & BLOOM" || /^star|^moon/i.test(id))
    r.tod = "night";

  r.track = r.tod === "night" ? "bahrain" : "monaco";
  r.frac = TRACK_FRAC[r.track] ?? 0.16;
  r.why = g.size ? `gates ${[...g].join(",")}` : "ungated day dry";

  if (tags.has("traffic") || /^(lampCull|tailLight|tailRange|tailFade|brakeGlow)/i.test(id)) {
    r = applyPatch(r, { traffic: true, track: "singapore", tod: "night", frac: 0.55, why: "needs cars in frame" });
  }
  if (tags.has("far-scenery") || id === "renderDistMul") {
    r = applyPatch(r, { track: "spa", tod: "day", weather: "dry", frac: 0.50, why: "far scenery + chase" });
  }
  if (tags.has("bloom-tier") || /^sunShaft|^bloom|^threshOff|^flare/i.test(id)) {
    r.companions.bloomMul = Math.max(r.companions.bloomMul || 0, 1.5);
    if (/^sunShaft|^flare/i.test(id)) r.tod = "day";
  }
  if (tags.has("sparse-pixels") || /^star|^flareStreak2/i.test(id)) {
    r.minDelta = 4;
    if (/^star/i.test(id)) r = applyPatch(r, { track: "bahrain", tod: "night", camera: "sky" });
  }
  if (knob.rebuild || knob.reinitRain) r.settle = 40;
  if (knob.reinitRain && r.weather === "dry") {
    r.weather = tags.has("wet-drizzle") || /^drizzle/i.test(id) ? "wet" : "rain";
  }
  return r;
}

export function recipeForKnob(knob) {
  if (!knob || !knob.id) throw new Error("recipeForKnob needs a classified knob");
  const inferred = recipeFromGates(knob);
  const special = RECIPE_BY_ID[knob.id];
  const r = special ? applyPatch(inferred, special) : inferred;
  if (!TODS.has(r.tod)) throw new Error(`${knob.id}: bad tod ${r.tod}`);
  if (!WXS.has(r.weather)) throw new Error(`${knob.id}: bad weather ${r.weather}`);
  if (!CAMERAS.has(r.camera)) throw new Error(`${knob.id}: bad camera ${r.camera}`);
  if (!Number.isFinite(r.frac) || r.frac < 0 || r.frac >= 1)
    throw new Error(`${knob.id}: bad frac ${r.frac}`);
  return r;
}

/** Back-compat: track/tod/weather/frac only. */
export function defaultRecipe(knob) {
  const r = recipeForKnob(knob);
  return { track: r.track, tod: r.tod, weather: r.weather, frac: r.frac };
}

export function pickPush(def, fromVal) {
  if (fromVal != null && Number.isFinite(fromVal)) return fromVal;
  const lo = Number(def.min), hi = Number(def.max), mid = Number(def.def);
  const spanHi = Math.abs(hi - mid);
  const spanLo = Math.abs(mid - lo);
  return spanHi >= spanLo ? hi : lo;
}

function parseLevelList(raw) {
  const parts = Array.isArray(raw)
    ? raw
    : String(raw).split(",").map((s) => s.trim()).filter(Boolean);
  const levels = parts.map(Number);
  if (levels.length < 2 || levels.some((v) => !Number.isFinite(v))) {
    throw new Error(`--levels needs two or more comma-separated numbers, got ${raw}`);
  }
  return levels;
}

function linspace(from, to, n) {
  if (n === 2) return [from, to];
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = from + (to - from) * (i / (n - 1));
  return out;
}

/**
 * Which slider values to shoot. --levels wins. --shots N (default 2)
 * linspaces from→to. A 2-shot without --from/--to stays def→extreme
 * (the old A/B). --shots N>2 without ends samples the full min→max.
 */
export function sampleLevels(def, opts = {}) {
  if (opts.levels != null && opts.levels !== "") return parseLevelList(opts.levels);
  const n = opts.shots == null || opts.shots === "" ? 2 : Math.round(Number(opts.shots));
  if (!Number.isFinite(n) || n < 2) {
    throw new Error(`--shots must be an integer >= 2, got ${opts.shots}`);
  }
  const explicitEnds = opts.from != null || opts.to != null;
  const from = opts.from != null ? Number(opts.from)
    : (n > 2 && !explicitEnds ? Number(def.min) : Number(def.def));
  const to = opts.to != null ? Number(opts.to)
    : (n > 2 && !explicitEnds ? Number(def.max) : pickPush(def));
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    throw new Error(`bad from/to for ${def.id}: ${from} → ${to}`);
  }
  return linspace(from, to, n);
}

function stateDelta(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const k of keys) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out[k] = { a: a?.[k], b: b?.[k] };
  }
  return out;
}

export function condKey(recipe) {
  return [
    recipe.track, recipe.tod, recipe.weather,
    Number(recipe.frac).toFixed(3),
    recipe.camera || "chase",
    recipe.traffic ? "traffic" : "solo",
    recipe.speed ? `v${recipe.speed}` : "v0",
    recipe.freeze === false ? "live" : "freeze",
  ].join("|");
}

export function livePlan(opts, knob, def, root) {
  if (!knob) throw new Error(`unknown slider id: ${opts.id}`);
  if (!def) throw new Error(`no TUNE_DEFS entry for ${opts.id}`);
  const recipe = recipeForKnob(knob);
  const track = opts.track || recipe.track;
  const tod = opts.tod || recipe.tod;
  const weather = opts.weather || recipe.weather;
  const frac = opts.frac != null ? Number(opts.frac)
    : (opts.track && TRACK_FRAC[track] != null && opts.track !== recipe.track
      ? TRACK_FRAC[track]
      : recipe.frac);
  // Recipe can supply from/to overrides (e.g. glareStr full-range 0→max).
  // CLI opts win over recipe overrides; recipe overrides win over TUNE_DEFS defaults.
  const levelOpts = {
    from: opts.from != null ? opts.from : recipe.from,
    to:   opts.to   != null ? opts.to   : recipe.to,
    shots: opts.shots, levels: opts.levels,
  };
  const levels = sampleLevels(def, levelOpts);
  const from = levels[0];
  const to = levels[levels.length - 1];
  const out = opts.out || path.join(
    root, "artifacts/lighting/slider-effect",
    `${track}-${tod}-${weather}-${opts.id || knob.id}`,
  );
  const plan = {
    knob, def, track, tod, weather, frac, from, to,
    levels, shots: levels.length, out,
    camera: recipe.camera,
    traffic: !!recipe.traffic,
    minDelta: recipe.minDelta,
    companions: recipe.companions,
    settle: recipe.settle,
    pinClock: recipe.pinClock !== false,
    freeze: recipe.freeze !== false,
    speed: recipe.speed || 0,
    snapCam: recipe.snapCam !== false,
    verdict: recipe.verdict || "auto",
    why: recipe.why,
  };
  plan.bucket = condKey(plan);
  return plan;
}

export function summarizePlan(plan) {
  return {
    id: plan.knob.id,
    class: plan.knob.class,
    gates: plan.knob.gates,
    tags: plan.knob.tags,
    moves: plan.knob.moves,
    track: plan.track,
    tod: plan.tod,
    weather: plan.weather,
    frac: plan.frac,
    camera: plan.camera,
    traffic: plan.traffic,
    from: plan.from,
    to: plan.to,
    shots: plan.shots,
    levels: plan.levels,
    minDelta: plan.minDelta,
    companions: plan.companions,
    settle: plan.settle,
    freeze: plan.freeze,
    speed: plan.speed,
    snapCam: plan.snapCam,
    verdict: plan.verdict,
    why: plan.why,
    bucket: plan.bucket,
    out: plan.out,
  };
}

export function plansForKnobs(knobs, defs, opts, root) {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const plans = knobs.map((knob) => livePlan({ ...opts, id: knob.id, out: undefined }, knob, byId.get(knob.id), root));
  const buckets = new Map();
  for (const p of plans) {
    if (!buckets.has(p.bucket)) {
      buckets.set(p.bucket, {
        key: p.bucket, track: p.track, tod: p.tod, weather: p.weather,
        frac: p.frac, camera: p.camera, traffic: p.traffic,
        freeze: p.freeze, speed: p.speed, ids: [],
      });
    }
    buckets.get(p.bucket).ids.push(p.knob.id);
  }
  return { plans, buckets: [...buckets.values()] };
}

async function shotPng(page, { snapCam = true } = {}) {
  const b64 = await page.evaluate(async (doSnap) => {
    const A = window.__apex;
    if (doSnap) A.snapCam();
    if (A.renderClock) A.renderClock(0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cv = document.getElementById("game") || document.querySelector("canvas");
    if (!cv) throw new Error("no #game canvas");
    const t = document.createElement("canvas");
    t.width = cv.width;
    t.height = cv.height;
    t.getContext("2d").drawImage(cv, 0, 0);
    return t.toDataURL("image/png").split(",")[1];
  }, snapCam);
  return Buffer.from(b64, "base64");
}

async function setupCondition(page, plan) {
  await page.evaluate((t) => window.__apex.race(t), plan.track);
  await page.waitForFunction((t) => window.__apex.info().track === t, plan.track, {
    polling: 200, timeout: 300000,
  });
  return page.evaluate(async (c) => {
    const A = window.__apex;
    A.go();
    if (A.hud) A.hud(false);
    if (A.weather) A.weather(c.weather);
    if (A.setTimeOfDay) A.setTimeOfDay(c.tod);
    A.step(1 / 60, 120);
    if (A.renderClock) A.renderClock(0);

    if (c.camera === "sky") {
      A.sky(c.frac);
    } else {
      A.camera("chase");
      if (c.speed && !c.freeze) {
        A.jump(c.frac, c.speed);
        A.camera("chase");
        A.snapCam();
      } else {
        A.park(c.frac);
        if (c.traffic && A.rivals) {
          A.rivals([
            { dProg: 16, dx: 0.5 },
            { dProg: 28, dx: -0.6 },
            { dProg: 42, dx: 0.3 },
            { dProg: 58, dx: -0.4 },
          ]);
        }
        if (c.camera === "horizon") {
          const vs = A.viewState();
          const eye = (vs.eye || [0, 8, 0]).slice();
          eye[1] += 4;
          const tgt = vs.tgt || [eye[0], eye[1], eye[2] - 20];
          const yaw = Math.atan2(tgt[0] - eye[0], -(tgt[2] - eye[2])) * 180 / Math.PI;
          A.view({ eye, yaw, pitch: 28, fov: 62 });
        } else {
          // Settle chase once, then lock with view() so A/B cannot drift
          // (measured lampLevel eye delta 206 with snapCam on every shot).
          A.snapCam();
          A.step(1 / 60, 8);
          A.snapCam();
          const cs = A.camState();
          A.view({
            eye: Array.from(cs.eye),
            target: Array.from(cs.tgt),
            fov: cs.fov,
          });
        }
      }
    }
    if (c.freeze === false && A.freeze) A.freeze(false);
    A.step(1 / 60, 20);
    if (A.renderClock) A.renderClock(0);
    return { view: A.viewState(), info: A.info(), cars: (A.cars() || []).length };
  }, {
    track: plan.track, tod: plan.tod, weather: plan.weather, frac: plan.frac,
    camera: plan.camera, traffic: plan.traffic, freeze: plan.freeze,
    speed: plan.speed, snapCam: plan.snapCam,
  });
}

async function applyValue(page, plan, v) {
  return page.evaluate(async ({ id, v, companions, settle, pinClock }) => {
    const A = window.__apex;
    const patch = { [id]: v, ...(companions || {}) };
    A.lightTune(patch);
    A.step(1 / 60, settle || 20);
    if (pinClock && A.renderClock) A.renderClock(0);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return {
      stored: A.lightTune()[id],
      live: A.lightTune(),
      state: A.lightState(),
      eye: A.viewState().eye,
      tgt: A.viewState().tgt,
      dbgCamActive: A.viewState().dbgCamActive,
    };
  }, {
    id: plan.knob.id, v,
    companions: plan.companions,
    settle: plan.settle,
    pinClock: plan.pinClock,
  });
}

function viewArgs(plan, hudCrop) {
  return [
    "--hud-crop", String(hudCrop ?? 0.10),
    "--min-delta", String(plan.minDelta ?? 10),
  ];
}

function parseViewJson(stdout) {
  try { return JSON.parse(stdout.trim().split("\n")[0]); } catch { return {}; }
}

function writeView(plan, aPng, bPng, hudCrop) {
  const view = spawnSync("python3", [
    VIEW, aPng, bPng,
    "--out", plan.out,
    ...viewArgs(plan, hudCrop),
    "--label-a", `${plan.knob.id}=${fmtLevel(plan.from)}`,
    "--label-b", `${plan.knob.id}=${fmtLevel(plan.to)}`,
  ], { encoding: "utf8" });
  if (view.status !== 0) {
    throw new Error(`slider-effect-view.py failed:\n${view.stderr || view.stdout}`);
  }
  return parseViewJson(view.stdout);
}

function writeViewStats(plan, aPng, bPng, hudCrop) {
  const view = spawnSync("python3", [
    VIEW, aPng, bPng, "--stats-only",
    ...viewArgs(plan, hudCrop),
  ], { encoding: "utf8" });
  if (view.status !== 0) {
    throw new Error(`slider-effect-view.py --stats-only failed:\n${view.stderr || view.stdout}`);
  }
  return parseViewJson(view.stdout);
}

function writeRamp(plan, pngs, hudCrop) {
  const labels = plan.levels.map((v) => `${plan.knob.id}=${fmtLevel(v)}`);
  const view = spawnSync("python3", [
    VIEW, "--ramp", ...pngs,
    "--out", plan.out,
    "--labels", labels.join(","),
    ...viewArgs(plan, hudCrop),
  ], { encoding: "utf8" });
  if (view.status !== 0) {
    throw new Error(`slider-effect-view.py --ramp failed:\n${view.stderr || view.stdout}`);
  }
  return parseViewJson(view.stdout);
}

function fmtLevel(v) {
  if (!Number.isFinite(v)) return String(v);
  const t = Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(3);
  return t.replace(/\.?0+$/, "") || "0";
}

function packResult(plan, shotA, shotB, pixels, restoreTo, files, samples) {
  const stored = Number.isFinite(shotA.stored) && Number.isFinite(shotB.stored)
    && shotA.stored !== shotB.stored;
  const delta = stateDelta(shotA.state, shotB.state);
  const moved = Object.keys(delta).filter((f) => f !== "envProbe");
  const camDelta = Math.max(
    ...(shotA.eye || [0]).map((x, i) => Math.abs(x - (shotB.eye || [0])[i] || 0)),
    ...(shotA.tgt || [0]).map((x, i) => Math.abs(x - (shotB.tgt || [0])[i] || 0)),
  );
  return {
    id: plan.knob.id,
    class: plan.knob.class,
    track: plan.track, tod: plan.tod, weather: plan.weather, frac: plan.frac,
    camera: plan.camera, traffic: plan.traffic, why: plan.why, verdict: plan.verdict,
    from: plan.from, to: plan.to, shots: plan.shots, levels: plan.levels,
    stored: { a: shotA.stored, b: shotB.stored, ok: !!stored },
    samples,
    restored: restoreTo,
    state: delta,
    movedFields: moved,
    pixels,
    cam: {
      delta: camDelta,
      stable: plan.snapCam === false || camDelta <= 1e-3,
      dbgCamActive: shotA.dbgCamActive,
    },
    files,
  };
}

function printResult(result) {
  const levels = (result.levels || [result.from, result.to]).map(fmtLevel).join(", ");
  const n = result.shots || (result.levels ? result.levels.length : 2);
  process.stdout.write(
    `${result.id}  ${result.track} ${result.tod}|${result.weather}  ${n} shots  [${levels}]`
    + `  [${result.camera}${result.traffic ? "+traffic" : ""}]\n`
    + `store  ${result.stored.a} → ${result.stored.b}  ${result.stored.ok ? "ok" : "CLAMP/MISS"}\n`
    + `state  ${result.movedFields.length ? result.movedFields.join(", ") : "(no lightState field moved)"}\n`
    + `pixels (first→last) changed ${result.pixels.changedPct != null ? result.pixels.changedPct.toFixed(2) : "?"} %`
    + `  MAD ${result.pixels.mad != null ? Number(result.pixels.mad).toFixed(2) : "?"}`
    + `  p99 ${result.pixels.p99 != null ? Number(result.pixels.p99).toFixed(1) : "?"}`
    + `  max ${result.pixels.max != null ? result.pixels.max : "?"}\n`
    + (result.files.ramp ? `ramp   ${result.files.ramp}\n` : "")
    + `sheet  ${result.files.sheet}\n`
    + `filter ${result.files.filter}\n`
    + `diff   ${result.files.diff}\n`,
  );
}

async function capturePair(page, plan, opts) {
  mkdirSync(plan.out, { recursive: true });
  const levels = plan.levels && plan.levels.length >= 2 ? plan.levels : [plan.from, plan.to];
  const liveBefore = await page.evaluate((id) => window.__apex.lightTune()[id], plan.knob.id);
  const companionLive = await page.evaluate((ids) => {
    const live = window.__apex.lightTune();
    const out = {};
    for (const id of ids) if (live[id] != null) out[id] = live[id];
    return out;
  }, Object.keys(plan.companions || {}));

  const pngs = [];
  const raw = [];
  for (let i = 0; i < levels.length; i++) {
    const shot = await applyValue(page, plan, levels[i]);
    const png = path.join(plan.out, `v${i}.png`);
    writeFileSync(png, await shotPng(page, { snapCam: plan.snapCam }));
    pngs.push(png);
    raw.push({ i, value: levels[i], shot, png });
  }

  const aPng = path.join(plan.out, "a.png");
  const bPng = path.join(plan.out, "b.png");
  copyFileSync(pngs[0], aPng);
  copyFileSync(pngs[pngs.length - 1], bPng);

  const restoreTo = liveBefore;
  if (restoreTo != null) await applyValue(page, { ...plan, companions: companionLive }, restoreTo);

  const pixels = writeView(plan, aPng, bPng, opts.hudCrop);
  const files = {
    a: aPng, b: bPng,
    frames: pngs,
    filter: path.join(plan.out, "filter.png"),
    heat: path.join(plan.out, "heat.png"),
    diff: path.join(plan.out, "diff.png"),
    sheet: path.join(plan.out, "sheet.png"),
  };
  if (levels.length > 2) {
    writeRamp(plan, pngs, opts.hudCrop);
    files.ramp = path.join(plan.out, "ramp.png");
  }

  const samples = raw.map((row, i) => {
    const vsPrev = i === 0 ? null : writeViewStats(plan, pngs[i - 1], pngs[i], opts.hudCrop);
    return {
      i: row.i,
      value: row.value,
      stored: row.shot.stored,
      png: row.png,
      vsPrev,
    };
  });

  const result = packResult(plan, raw[0].shot, raw[raw.length - 1].shot, pixels, restoreTo, files, samples);
  writeFileSync(path.join(plan.out, "result.json"), JSON.stringify(result, null, 2) + "\n");
  return result;
}

export async function runLive(opts, root, ctx) {
  const plan = livePlan(opts, ctx.knob, ctx.def, root);
  const srv = await startStaticServer(root);
  try {
    const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => console.error("PAGEERR", e.message));
    await page.goto(srv.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 30000 });
    await setupCondition(page, plan);
    const result = await capturePair(page, plan, opts);
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else printResult(result);
    return 0;
  } finally {
    await shutdown();
  }
}

export async function runLiveBatch(opts, root, knobs, defs) {
  const { plans, buckets } = plansForKnobs(knobs, defs, opts, root);
  const srv = await startStaticServer(root);
  const results = [];
  try {
    const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => console.error("PAGEERR", e.message));
    await page.goto(srv.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 30000 });

    const byBucket = new Map();
    for (const p of plans) {
      if (!byBucket.has(p.bucket)) byBucket.set(p.bucket, []);
      byBucket.get(p.bucket).push(p);
    }
    process.stderr.write(
      `slider-effect --live batch: ${plans.length} knobs in ${buckets.length} conditions\n`,
    );
    for (const bucket of buckets) {
      const group = byBucket.get(bucket.key);
      process.stderr.write(`  ${bucket.key}  (${group.length} knobs)\n`);
      await setupCondition(page, group[0]);
      for (const plan of group) {
        const result = await capturePair(page, plan, opts);
        results.push(result);
        if (!opts.json) printResult(result);
      }
    }
    const index = path.join(root, "artifacts/lighting/slider-effect/batch.json");
    mkdirSync(path.dirname(index), { recursive: true });
    writeFileSync(index, JSON.stringify({ buckets, results }, null, 2) + "\n");
    if (opts.json) process.stdout.write(JSON.stringify({ buckets, results }, null, 2) + "\n");
    // Stitch batch summary sheet (one row per knob: id | A | diff | B | MAD bar)
    if (!opts.noSummary) {
      const summary = spawnSync("python3", [VIEW, "--batch-summary", index], { encoding: "utf8" });
      if (summary.status === 0) process.stderr.write(summary.stdout || "");
      else process.stderr.write(`[summary skipped: ${summary.stderr?.slice(0, 120) || "no python3/pillow"}]\n`);
    }
    return 0;
  } finally {
    await shutdown();
  }
}
