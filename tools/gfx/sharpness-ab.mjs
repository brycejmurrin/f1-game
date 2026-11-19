#!/usr/bin/env node
// sharpness-ab
// @doc Headless A/B of the phone-sharpness arms on TLX WebGPU: captures, 400% crop sheets, edge metrics.
//
//   node tools/gfx/sharpness-ab.mjs capture --name base
//   node tools/gfx/sharpness-ab.mjs capture --name sub50 --query "?lab=fxaaSub50"
//   node tools/gfx/sharpness-ab.mjs capture --name fixed --ls apex26.tlxFixedTargets=1
//   node tools/gfx/sharpness-ab.mjs capture --name sgsr  --ls apex26.spatialUpscale=1
//   node tools/gfx/sharpness-ab.mjs sheet [base,sub50,sub25,fixed,sgsr]
//
// capture: boots at the owner's phone viewport (852x368 CSS, DPR 3, forced mobile tier: a 959x414 buffer at
//   scale 0.75), parks the helmet camera, and saves the PRESENTED frame (GLX.capturePixels) plus the texCensus.
// sheet:   stretches each capture to the phone's 2556x1104 device pixels with a bilinear filter (a MODEL of the
//   browser compositor), crops three regions and writes them at 400% (nearest), with two edge metrics per crop:
//   lap = mean |Laplacian| of luma, g99 = 99th-percentile luma gradient, both in device pixels.
//
// Evidence class: SOFTWARE PIXELS. It ranks the arms for edge contrast and shows ringing; it does not prove what
// a phone shows (the compositor's real filter, the panel and the GPU's rasteriser are not here). One browser at
// a time (AGENTS.md rule 5); main session only. Output: artifacts/sharpness-ab/.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { launchChromium, startStaticServer, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV, WEBGPU_CENSUS_ARM, adapterMismatch, readWebgpuAdapter, sleep } from "../lib/harness.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const cmd = process.argv[2];
if (cmd === "capture") await capture();
else if (cmd === "sheet") await sheet();
else { console.error("usage: sharpness-ab.mjs capture --name <arm> [--query ?lab=…] [--ls k=v]… [--track id] [--at frac] | sheet [arms]"); process.exit(2); }

async function capture() {
const a = process.argv.slice(3), opt = { name: "base", query: "", ls: [], track: "monza", at: 0.12, out: "artifacts/sharpness-ab" };
for (let i = 0; i < a.length; i++) {
  if (a[i] === "--ls") opt.ls.push(a[++i]); else if (a[i].startsWith("--")) opt[a[i].slice(2)] = a[++i];
}
mkdirSync(opt.out, { recursive: true });
const srv = await startStaticServer(ROOT);
const browser = await launchChromium({ args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new"], env: { ...process.env, ...WEBGPU_LAVAPE_ENV } });
const t0 = Date.now(), log = (m) => console.error(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${m}`);
try {
  const page = await browser.newPage({ viewport: { width: 852, height: 368 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  page.on("pageerror", (e) => log("pageerror " + e.message));
  await page.addInitScript((ls) => {
    localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.tlxForceGL", "0");
    localStorage.setItem("apex26.forceMobileTier", "1"); sessionStorage.setItem("apex26.wgxCapture", "1");
    for (const kv of ls) { const i = kv.indexOf("="); if (i > 0) localStorage.setItem(kv.slice(0, i), kv.slice(i + 1)); }
  }, opt.ls);
  await page.goto(srv.url + "index.html" + opt.query, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 120000 });
  await page.evaluate(async () => { if (typeof Assets !== "undefined" && Assets.loadModels) { try { await Assets.loadModels(); } catch (_) { /* optional */ } } });
  log("apex live");
  const adapter = await readWebgpuAdapter(page), bad = adapterMismatch(adapter);   // #5450: filed under the adapter it ran on, or not at all
  if (bad) throw new Error(`this tool runs the ${WEBGPU_CENSUS_ARM} arm: ${bad}`);
  await page.evaluate((id) => { __apex.race(id); __apex.go(); }, opt.track);
  await page.waitForFunction(() => { try { return !!__apex.info().track; } catch { return false; } }, null, { polling: 200, timeout: 180000 });
  await sleep(2000);
  await page.evaluate((at) => { __apex.park(at); __apex.freeze(true); __apex.jump(at, 65); __apex.snapCam(); }, +opt.at);
  log("parked");
  await sleep(+(opt.settle || 20000));
  const res = await page.evaluate(async () => {
    const cap = await GLX.capturePixels();
    const cc = document.createElement("canvas"); cc.width = cap.width; cc.height = cap.height;
    cc.getContext("2d").putImageData(new ImageData(cap.data, cap.width, cap.height), 0, 0);
    cap.png = cc.toDataURL("image/png").split(",")[1];
    const c = typeof GLX.texCensus === "function" ? GLX.texCensus() : null, t = GLX.__tlx, cv = t.renderer.domElement;
    return { png: cap.png, w: cap.width, h: cap.height, canvas: [cv.width, cv.height], dpr: devicePixelRatio,
      post: (() => { try { const s = t.postState(); return { targets: s.targets, blocks: s.blocks, submitHold: s.submitHold }; } catch (e) { return String(e); } })(),
      census: c && { supported: c.supported, mb: c.mb, bytes: c.bytes, count: c.count, byKind: c.byKind, biggest: c.biggest, three: c.three, swap: c.swapchainEst, buffers: c.buffers,
        targets: c.targets.map((x) => [x.name, x.w, x.h, x.bpt, x.mips, x.samples, x.bytes]) },
      apex: (() => { const r = __apex.texCensus(); return { supported: r.supported, mb: r.mb }; })() };
  });
  writeFileSync(`${opt.out}/${opt.name}.png`, Buffer.from(res.png, "base64"));
  delete res.png;
  res.adapter = adapter;
  writeFileSync(`${opt.out}/${opt.name}.json`, JSON.stringify(res, null, 1));
  console.log(JSON.stringify(res));
} finally { await browser.close(); await srv.close(); }
}

async function sheet() {
const DIR = "artifacts/sharpness-ab", ARMS = (process.argv[3] || "base,sub50,sub25,fixed,sgsr").split(",");
const CROPS = [{ id: "dash", x: 0.43, y: 0.67, w: 0.14, h: 0.13 }, { id: "board", x: 0.255, y: 0.41, w: 0.14, h: 0.10 }, { id: "treeline", x: 0.565, y: 0.385, w: 0.14, h: 0.12 }];
const DW = 2556, DH = 1104, ZOOM = 4;
const browser = await launchChromium({ args: ["--headless=new", "--no-sandbox"] });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
  const imgs = Object.fromEntries(ARMS.map((a) => [a, "data:image/png;base64," + readFileSync(`${DIR}/${a}.png`).toString("base64")]));
  const out = await page.evaluate(async ({ imgs, CROPS, DW, DH, ZOOM }) => {
    const load = (src) => new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = src; });
    const arms = Object.keys(imgs), res = { metrics: {}, sheets: {} };
    const dev = {};
    for (const a of arms) {
      const im = await load(imgs[a]);
      const c = document.createElement("canvas"); c.width = DW; c.height = DH;
      const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "low";   // bilinear: the compositor's stretch
      g.drawImage(im, 0, 0, DW, DH); dev[a] = { c, g, src: [im.width, im.height] };
    }
    for (const cr of CROPS) {
      const sx = Math.round(cr.x * DW), sy = Math.round(cr.y * DH), sw = Math.round(cr.w * DW), sh = Math.round(cr.h * DH);
      const sheet = document.createElement("canvas"); sheet.width = sw * ZOOM / 2; sheet.height = arms.length * (sh * ZOOM / 2 + 28);
      const sg = sheet.getContext("2d"); sg.fillStyle = "#111"; sg.fillRect(0, 0, sheet.width, sheet.height); sg.imageSmoothingEnabled = false;
      sg.font = "18px monospace"; sg.fillStyle = "#fff";
      arms.forEach((a, i) => {
        const d = dev[a].g.getImageData(sx, sy, sw, sh).data;
        // edge energy: mean |Laplacian| of luma over the crop, in DEVICE pixels; p99 gradient as the "crispest edge".
        const L = new Float32Array(sw * sh);
        for (let p = 0; p < sw * sh; p++) L[p] = 0.299 * d[p * 4] + 0.587 * d[p * 4 + 1] + 0.114 * d[p * 4 + 2];
        let lap = 0, n = 0; const grads = [];
        for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
          const q = y * sw + x;
          lap += Math.abs(4 * L[q] - L[q - 1] - L[q + 1] - L[q - sw] - L[q + sw]); n++;
          grads.push(Math.hypot(L[q + 1] - L[q - 1], L[q + sw] - L[q - sw]) / 2);
        }
        grads.sort((p, q) => p - q);
        (res.metrics[cr.id] = res.metrics[cr.id] || {})[a] = { lap: +(lap / n).toFixed(3), g99: +grads[Math.floor(grads.length * 0.99)].toFixed(2), g50: +grads[Math.floor(grads.length * 0.5)].toFixed(3), src: dev[a].src.join("x") };
        // the sheet shows the middle half of the crop at ZOOM, nearest-neighbour (each device pixel is a 4x4 block)
        const hx = sx + Math.round(sw / 4), hy = sy + Math.round(sh / 4), hw = Math.round(sw / 2), hh = Math.round(sh / 2);
        sg.drawImage(dev[a].c, hx, hy, hw, hh, 0, i * (sh * ZOOM / 2 + 28) + 28, hw * ZOOM, hh * ZOOM);
        sg.fillText(`${a} (${dev[a].src.join("x")})`, 4, i * (sh * ZOOM / 2 + 28) + 20);
      });
      res.sheets[cr.id] = sheet.toDataURL("image/png").split(",")[1];
    }
    return res;
  }, { imgs, CROPS, DW, DH, ZOOM });
  for (const [id, b64] of Object.entries(out.sheets)) writeFileSync(`${DIR}/sheet-${id}.png`, Buffer.from(b64, "base64"));
  writeFileSync(`${DIR}/metrics.json`, JSON.stringify(out.metrics, null, 1));
  console.log(JSON.stringify(out.metrics, null, 1));
} finally { await browser.close(); }
}
