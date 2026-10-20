// Local repro: phone-tier TLX-WebGPU race start -> which createTexture fails validation.
import { startStaticServer, launchChromium, WEBGPU_LAVAPE_CHROMIUM_ARGS, WEBGPU_LAVAPE_ENV } from "../tools/lib/harness.mjs";
import { gotoGame } from "../tools/shot/probe-page.mjs";
const MOBILE = process.env.H7_MOBILE !== "0", VP = process.env.H7_VP || (MOBILE ? "phone" : "desk");
const server = await startStaticServer(process.cwd());
const browser = await launchChromium({ args: [...WEBGPU_LAVAPE_CHROMIUM_ARGS, "--headless=new", ...(process.env.H7_LOG ? ["--enable-logging=stderr", "--v=0"] : [])], env: { ...process.env, ...(WEBGPU_LAVAPE_ENV || {}) } });
const ctx = await browser.newContext({ viewport: VP === "phone" ? { width: 844, height: 390 } : { width: 1280, height: 720 }, deviceScaleFactor: VP === "phone" ? 3 : 1, hasTouch: VP === "phone" });
const page = await ctx.newPage();
const t0 = Date.now();
page.on("console", (m) => { const t = m.text(); console.log(((Date.now() - t0) / 1000).toFixed(1), m.type(), t.replace(/\n/g, " ").slice(0, 500)); });
page.on("framenavigated", (f) => { if (f === page.mainFrame()) console.log(((Date.now() - t0) / 1000).toFixed(1), "NAV"); });
await page.addInitScript((nolp) => { window.__H7_NOLP = nolp; }, !!process.env.H7_NOLP);
await page.addInitScript((mobile) => {
  window.__TEST_MODE = true;
  localStorage.setItem("apex26.gfxBackend", "three"); localStorage.setItem("apex26.tlxForceGL", "0"); localStorage.setItem("apex26.wgxCapture", "0");
  if (mobile) localStorage.setItem("apex26.forceMobileTier", "1");
  try { for (const C of [WebGL2RenderingContext, WebGLRenderingContext]) { const ge = C.prototype.getExtension; C.prototype.getExtension = function (n) { const x = ge.call(this, n); if (x && n === "WEBGL_lose_context" && !x.__h7) { x.__h7 = 1; const lc0 = x.loseContext; x.loseContext = function () { console.log("H7LOSE " + new Error().stack.split("\n").slice(1, 12).map((y) => y.trim()).join(" | ")); return lc0.call(this); }; } return x; }; } } catch (e) { console.log("H7LOSE patch failed " + e.message); }
  if (0) try { const lc = 0; WebGLLoseContext.prototype.loseContext = function () { console.log("H7LOSE " + new Error().stack.split("\n").slice(1, 12).map((x) => x.trim()).join(" | ")); return lc.call(this); }; } catch (e) { console.log("H7LOSE patch failed " + e.message); }
  try { const dd = GPUDevice.prototype.destroy; GPUDevice.prototype.destroy = function () { console.log("H7DESTROY " + new Error().stack.split("\n").slice(1, 12).map((x) => x.trim()).join(" | ")); return dd.call(this); }; } catch (_) {}
  if (window.__H7_NOLP) { const ra = GPU.prototype.requestAdapter; GPU.prototype.requestAdapter = function (o) { const q = Object.assign({}, o || {}); console.log("H7RA " + JSON.stringify(q)); delete q.powerPreference; return ra.call(this, q); }; }
  else { const ra = GPU.prototype.requestAdapter; GPU.prototype.requestAdapter = function (o) { console.log("H7RA " + JSON.stringify(o || {})); return ra.call(this, o); }; }
  const ct = GPUDevice.prototype.createTexture;
  GPUDevice.prototype.createTexture = function (d) {
    this.pushErrorScope("validation");
    const tex = ct.call(this, d);
    const stack = new Error().stack.split("\n").slice(2, 9).map((s) => s.trim()).join(" | ");
    this.popErrorScope().then((e) => { if (e) console.error("H7TEX createTexture FAILED " + e.message.replace(/\n/g, " ") + " desc=" + JSON.stringify(d) + " stack=" + stack); });
    return tex;
  };
  const dump = (o) => Object.keys(o).filter((k) => /apex26/.test(k) && !/lightTune|settings|career|garage|save/i.test(k)).map((k) => k + "=" + String(o.getItem(k)).slice(0, 80)).join(" ");
  console.log("H7LOAD session: " + dump(sessionStorage) + " || local: " + dump(localStorage) + " || name=" + window.name);
  addEventListener("pagehide", () => console.log("H7HIDE session: " + dump(sessionStorage) + " || local: " + dump(localStorage)));
}, MOBILE);
await gotoGame(page, server.url, 180000);
await page.evaluate(async () => { await window.__apex.race("monaco"); window.__apex.go(); });
for (let i = 0; i < 6; i++) { await page.waitForTimeout(5000); const s = await page.evaluate(() => { const i = window.__apex && window.__apex.info(); return i ? i.state + ":" + i.track : "noapex"; }).catch((e) => "ERR"); console.log(((Date.now() - t0) / 1000).toFixed(1), "state", s); }
process.exit(0);
