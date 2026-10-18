#!/usr/bin/env node
/**
 * @doc Pixel A/B of TLX fixed render targets (tlxFixedTargets) vs legacy resize: noise floor, identity at 1.0, edge bleed.
 * @skill renderer-debug
 *
 * #2655. The flag moves a resolution step from "reallocate every post target" to
 * "draw into a sub-rect of fixed targets". This is the picture oracle for it:
 * one frozen spot, one fresh page per ARM (the flag is read at create), a
 * shot per arm, then
 *   - noise  = diff(arm0, arm1)   (run the same arm twice: what the picture does on its own)
 *   - effect = diff(arm0, armN)   for every later arm
 *   - edge   = the same diff inside a thin band on each border of the frame
 * An arm's frame is resampled (bilinear) to the largest arm's size first, because
 * the legacy path at a fractional scale presents a smaller canvas that the browser
 * upscales and the fixed path presents at full size.
 *
 *   node tools/gfx/res-scale-ab.mjs --track monza --scale 1 --arms off,off,on
 *   node tools/gfx/res-scale-ab.mjs --track monaco --scale 0.7 --arms off,on --tod day
 *   node tools/gfx/res-scale-ab.mjs --track vegas --tod night --scale 0.5 --arms off,on
 *
 * Exit 0 always unless boot fails (3): the verdict is the numbers; the caller
 * compares effect against noise (identity at 1.0) or inspects the PNGs (fractional).
 * Writes artifacts/res-scale-ab/<track>-<tod>-s<scale>/ (PNGs + verdict.json).
 * Browser tool: parent session only.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const PIXEL_DELTA = 12;   // |dR|+|dG|+|dB| over this = a changed pixel (knob-ab.mjs scale)

/** Percent of pixels changed, mean abs channel delta, over the whole frame and a border band. */
export function diffRaw(a, b, width, height, channels, band = 6) {
  const whole = { n: 0, changed: 0, sum: 0 }, edge = { n: 0, changed: 0, sum: 0 };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * channels;
      const d = Math.abs(a[k] - b[k]) + Math.abs(a[k + 1] - b[k + 1]) + Math.abs(a[k + 2] - b[k + 2]);
      const inEdge = x < band || y < band || x >= width - band || y >= height - band;
      for (const acc of inEdge ? [whole, edge] : [whole]) { acc.n++; acc.sum += d; if (d > PIXEL_DELTA) acc.changed++; }
    }
  }
  const f = (c) => ({ pct: +(100 * c.changed / Math.max(1, c.n)).toFixed(2), mean: +(c.sum / Math.max(1, c.n) / 3).toFixed(3) });
  return { whole: f(whole), edge: f(edge) };
}

export function parseArgs(argv) {
  const get = (name, def) => { const i = argv.indexOf(name); return i >= 0 && argv[i + 1] != null ? argv[i + 1] : def; };
  const o = {
    track: get("--track", "monza"), scale: Number(get("--scale", "1")), tod: get("--tod", "day"),
    weather: get("--weather", "dry"), frac: Number(get("--frac", "0.05")), cam: get("--cam", "chase"),
    arms: get("--arms", "off,off,on").split(",").map((s) => s.trim()).filter(Boolean),
    w: Number(get("--w", "960")), h: Number(get("--h", "540")), settle: Number(get("--settle", "2500")),
    steps: get("--steps", "").split(",").filter(Boolean).map(Number),   // scales to visit before the final one (hysteresis)
    ls: argv.reduce((m, v, i) => { if (v === "--ls" && argv[i + 1]) { const [k, x] = argv[i + 1].split("="); m[k] = x; } return m; }, {}),
  };
  if (!(o.scale >= 0.5 && o.scale <= 1)) throw new Error("--scale must be 0.5..1");
  if (o.arms.length < 2 || o.arms.some((a) => a !== "on" && a !== "off")) throw new Error("--arms needs >= 2 of on|off");
  return o;
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node tools/gfx/res-scale-ab.mjs [--track monza] [--scale 1] [--arms off,off,on] [--tod day] [--weather dry] [--frac 0.05] [--w 960 --h 540] [--steps 0.9,0.7] [--ls key=value]");
    return 0;
  }
  let o;
  try { o = parseArgs(argv); } catch (e) { console.error(`res-scale-ab: ${e.message}`); return 2; }
  const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
  const { launchChromium, shutdown, sleep, startStaticServer } = await import("../lib/harness.mjs");
  const { awaitPresentedFrame, screenshotPresentedCanvas } = await import("../shot/probe-page.mjs");
  const sharp = (await import("sharp")).default;
  const out = resolve(ROOT, "artifacts/res-scale-ab", `${o.track}-${o.tod}-s${o.scale}`);
  mkdirSync(out, { recursive: true });
  const srv = await startStaticServer(ROOT);
  const browser = await launchChromium({ args: ["--use-angle=swiftshader", "--no-sandbox"] });
  const shots = [], states = [], errs = [];
  try {
    for (let i = 0; i < o.arms.length; i++) {
      const arm = o.arms[i];
      const ctx = await browser.newContext({ viewport: { width: o.w, height: o.h } });
      const page = await ctx.newPage();
      page.on("pageerror", (e) => errs.push(`arm${i}: ${e.message}`));
      await page.addInitScript(([on, ls]) => {
        window.__TEST_MODE = true;
        try {
          localStorage.setItem("apex26.gfxBackend", "three");
          localStorage.setItem("apex26.tlxForceGL", "1");
          localStorage.setItem("apex26.tyreWear", JSON.stringify("off"));
          if (on) localStorage.setItem("apex26.tlxFixedTargets", "1"); else localStorage.removeItem("apex26.tlxFixedTargets");
          for (const k of Object.keys(ls)) localStorage.setItem(k.startsWith("apex26.") ? k : "apex26." + k, ls[k]);
        } catch (_) { /* no storage */ }
      }, [arm === "on", o.ls]);
      await page.goto(srv.url);
      await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 120_000 });
      await page.evaluate(async ([t, tod, w]) => { await window.__apex.race(t, tod, w); }, [o.track, o.tod, o.weather]);
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 200, timeout: 240_000 });
      await page.evaluate(([frac, cam]) => {
        const a = window.__apex; a.go(); a.govHold(true); a.park(frac); a.headless(false); a.camera(cam); a.snapCam();
      }, [o.frac, o.cam]);
      for (const s of [...o.steps, o.scale]) {
        await page.evaluate((v) => { window.__apex.renderScale(v); window.__apex.snapCam(); }, s);
        await sleep(o.settle);
      }
      await awaitPresentedFrame(page, 60_000);
      const path = resolve(out, `arm${i}-${arm}.png`);
      await screenshotPresentedCanvas(page, { path, skipAwait: true, timeout: 120_000 });
      states.push(await page.evaluate(() => {
        const t = window.GLX && window.GLX.__tlx, ps = t && t.postState ? t.postState() : null;
        return { post: ps ? { targets: ps.targets, rtResizes: ps.rtResizes, fixed: ps.fixed, blocks: ps.blocks } : null,
          canvas: [document.getElementById("game").width, document.getElementById("game").height], scale: window.__apex.renderScale().scale };
      }));
      shots.push(path);
      await ctx.close();
    }
    const raws = await Promise.all(shots.map((p) => sharp(p).metadata()));
    const W = Math.max(...raws.map((m) => m.width)), H = Math.max(...raws.map((m) => m.height));
    const buf = await Promise.all(shots.map((p) => sharp(p).removeAlpha().resize(W, H, { kernel: "linear", fit: "fill" }).raw().toBuffer()));
    const noise = diffRaw(buf[0], buf[1], W, H, 3);
    const effects = [];
    for (let i = 2; i < buf.length; i++) effects.push({ arm: `${i}-${o.arms[i]}`, ...diffRaw(buf[0], buf[i], W, H, 3) });
    const v = { ...o, size: [W, H], sizes: raws.map((m) => [m.width, m.height]), noise, effects, states, errs: errs.slice(0, 5), shots };
    writeFileSync(resolve(out, "verdict.json"), JSON.stringify(v, null, 2));
    console.log(`res-scale-ab: ${o.track} ${o.tod} scale ${o.scale} arms ${o.arms.join(",")} — ${out}`);
    console.log(`  sizes ${JSON.stringify(v.sizes)} canvases ${JSON.stringify(states.map((s) => s.canvas))}`);
    console.log(`  noise  (arm0 vs arm1)  whole ${noise.whole.pct}% mean ${noise.whole.mean}  edge ${noise.edge.pct}% mean ${noise.edge.mean}`);
    for (const e of effects) console.log(`  effect (arm0 vs arm${e.arm})  whole ${e.whole.pct}% mean ${e.whole.mean}  edge ${e.edge.pct}% mean ${e.edge.mean}`);
    for (let i = 0; i < states.length; i++) console.log(`  arm${i} ${o.arms[i]} post ${JSON.stringify(states[i].post)}`);
    if (errs.length) console.log(`  page errors: ${errs.slice(0, 3).join(" | ")}`);
    return 0;
  } catch (e) {
    console.error(`res-scale-ab: ${String(e.stack || e.message || e).slice(0, 500)}`);
    return 3;
  } finally {
    await browser.close();
    await shutdown(srv);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}
