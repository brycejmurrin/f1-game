/**
 * slider-effect --live — A/B one LIGHTING TUNER knob and visually filter
 * the pixels that moved. Chase + park once (never orbit). Restore the
 * pre-push live value, never TUNE_DEFS.def.
 *
 * Do not run while Chrome DevTools MCP is driving the look-survey.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { launchChromium, shutdown, startStaticServer } from "./harness.mjs";

const VIEW = path.join(path.dirname(new URL(import.meta.url).pathname), "slider-effect-view.py");

const TRACK_FRAC = {
  bahrain: 0.12, monaco: 0.16, singapore: 0.55, vegas: 0.28, spa: 0.22,
};

export function defaultRecipe(knob) {
  const g = new Set(knob.gates || []);
  const night = g.has("night") && !g.has("day");
  let weather = "dry";
  if (g.has("overcast") && !g.has("fog") && !g.has("rain") && !g.has("wet")) weather = "overcast";
  else if (g.has("fog") && !g.has("overcast") && !g.has("rain")) weather = "fog";
  else if (g.has("rain") && !g.has("wet")) weather = "rain";
  else if (g.has("wet")) weather = "wet";
  const track = night ? "bahrain" : "monaco";
  const tod = night ? "night" : (g.has("day") || !g.has("night") ? "day" : "night");
  return { track, tod, weather, frac: TRACK_FRAC[track] ?? 0.16 };
}

export function pickPush(def, fromVal) {
  if (fromVal != null && Number.isFinite(fromVal)) return fromVal;
  const spanHi = Math.abs(def.max - def.def);
  const spanLo = Math.abs(def.def - def.min);
  return spanHi >= spanLo ? def.max : def.min;
}

function stateDelta(a, b) {
  const keys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  const out = {};
  for (const k of keys) {
    if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) out[k] = { a: a?.[k], b: b?.[k] };
  }
  return out;
}

export function livePlan(opts, knob, def, root) {
  if (!knob) throw new Error(`unknown slider id: ${opts.id}`);
  if (!def) throw new Error(`no TUNE_DEFS entry for ${opts.id}`);
  const recipe = defaultRecipe(knob);
  const track = opts.track || recipe.track;
  const tod = opts.tod || recipe.tod;
  const weather = opts.weather || recipe.weather;
  const frac = opts.frac != null ? Number(opts.frac) : (TRACK_FRAC[track] ?? recipe.frac);
  const from = opts.from != null ? Number(opts.from) : def.def;
  const to = opts.to != null ? Number(opts.to) : pickPush(def);
  const out = opts.out || path.join(
    root, "artifacts/lighting/slider-effect",
    `${track}-${tod}-${weather}-${opts.id}`,
  );
  return { knob, def, track, tod, weather, frac, from, to, out };
}

async function shotPng(page) {
  const b64 = await page.evaluate(async () => {
    const A = window.__apex;
    A.snapCam();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cv = document.getElementById("game") || document.querySelector("canvas");
    if (!cv) throw new Error("no #game canvas");
    const t = document.createElement("canvas");
    t.width = cv.width;
    t.height = cv.height;
    t.getContext("2d").drawImage(cv, 0, 0);
    return t.toDataURL("image/png").split(",")[1];
  });
  return Buffer.from(b64, "base64");
}

export async function runLive(opts, root, ctx) {
  const plan = livePlan(opts, ctx.knob, ctx.def, root);
  mkdirSync(plan.out, { recursive: true });
  const aPng = path.join(plan.out, "a.png");
  const bPng = path.join(plan.out, "b.png");

  const srv = await startStaticServer(root);
  try {
    const browser = await launchChromium({ args: ["--use-angle=swiftshader"] });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on("pageerror", (e) => console.error("PAGEERR", e.message));
    await page.goto(srv.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 30000 });

    await page.evaluate((t) => window.__apex.race(t), plan.track);
    await page.waitForFunction((t) => window.__apex.info().track === t, plan.track, {
      polling: 200, timeout: 300000,
    });

    const setup = await page.evaluate(async (c) => {
      const A = window.__apex;
      A.go();
      if (A.hud) A.hud(false);
      if (A.weather) A.weather(c.weather);
      if (A.setTimeOfDay) A.setTimeOfDay(c.tod);
      A.step(1 / 60, 120);
      A.camera("chase");
      A.park(c.frac);
      A.snapCam();
      A.step(1 / 60, 20);
      const live = A.lightTune()[c.id];
      return { live, view: A.viewState(), info: A.info() };
    }, { ...plan, id: plan.knob.id });

    const apply = async (v) => page.evaluate(async ({ id, v }) => {
      const A = window.__apex;
      A.lightTune({ [id]: v });
      A.step(1 / 60, 20);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return {
        stored: A.lightTune()[id],
        state: A.lightState(),
        eye: A.viewState().eye,
        tgt: A.viewState().tgt,
        dbgCamActive: A.viewState().dbgCamActive,
      };
    }, { id: plan.knob.id, v });

    const shotA = await apply(plan.from);
    writeFileSync(aPng, await shotPng(page));
    const shotB = await apply(plan.to);
    writeFileSync(bPng, await shotPng(page));

    const restoreTo = setup.live;
    if (restoreTo != null) await apply(restoreTo);

    const view = spawnSync("python3", [
      VIEW, aPng, bPng,
      "--out", plan.out,
      "--hud-crop", String(opts.hudCrop ?? 0.10),
      "--label-a", `${plan.knob.id}=${plan.from}`,
      "--label-b", `${plan.knob.id}=${plan.to}`,
    ], { encoding: "utf8" });
    if (view.status !== 0) {
      throw new Error(`slider-effect-view.py failed:\n${view.stderr || view.stdout}`);
    }
    let pixels = {};
    try { pixels = JSON.parse(view.stdout.trim().split("\n")[0]); } catch { /* printed paths */ }

    const stored = Number.isFinite(shotA.stored) && Number.isFinite(shotB.stored)
      && shotA.stored !== shotB.stored;
    const moved = plan.knob.moves.filter((f) => {
      const da = shotA.state?.[f], db = shotB.state?.[f];
      return JSON.stringify(da) !== JSON.stringify(db);
    });
    const camDelta = Math.max(
      ...(shotA.eye || [0]).map((x, i) => Math.abs(x - (shotB.eye || [0])[i] || 0)),
      ...(shotA.tgt || [0]).map((x, i) => Math.abs(x - (shotB.tgt || [0])[i] || 0)),
    );
    const result = {
      id: plan.knob.id,
      class: plan.knob.class,
      track: plan.track, tod: plan.tod, weather: plan.weather, frac: plan.frac,
      from: plan.from, to: plan.to,
      stored: { a: shotA.stored, b: shotB.stored, ok: !!stored },
      restored: restoreTo,
      state: stateDelta(shotA.state, shotB.state),
      movedFields: moved,
      pixels,
      camera: { delta: camDelta, stable: camDelta <= 1e-3, dbgCamActive: shotA.dbgCamActive },
      files: {
        a: aPng, b: bPng,
        filter: path.join(plan.out, "filter.png"),
        heat: path.join(plan.out, "heat.png"),
        sheet: path.join(plan.out, "sheet.png"),
      },
    };
    writeFileSync(path.join(plan.out, "result.json"), JSON.stringify(result, null, 2) + "\n");
    if (opts.json) process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    else {
      process.stdout.write(
        `${plan.knob.id}  ${plan.track} ${plan.tod}|${plan.weather}  ${plan.from} → ${plan.to}\n`
        + `store  ${result.stored.a} → ${result.stored.b}  ${result.stored.ok ? "ok" : "CLAMP/MISS"}\n`
        + `state  ${moved.length ? moved.join(", ") : "(no lightState field moved)"}\n`
        + `pixels changed ${pixels.changedPct != null ? pixels.changedPct.toFixed(2) : "?"} %`
        + `  MAD ${pixels.mad != null ? Number(pixels.mad).toFixed(2) : "?"}`
        + `  p99 ${pixels.p99 != null ? Number(pixels.p99).toFixed(1) : "?"}\n`
        + `sheet  ${result.files.sheet}\n`
        + `filter ${result.files.filter}\n`,
      );
    }
    return 0;
  } finally {
    await shutdown();
  }
}
