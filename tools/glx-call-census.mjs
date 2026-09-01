/* glx-call-census.mjs — what does ONE GLX frame actually cost in GL calls?
 *
 * docs/PERF-FINDINGS.md §"COUNT THE WORK AVOIDED, DO NOT TIME IT": a
 * SwiftShader frame time is not evidence, but a call count is exact and
 * transfers to real hardware. This wraps the live WebGL2 context during a
 * RUNNING race with a full field — not a parked camera — and reports per-frame
 * averages, so a batching or elision change can be scored before and after.
 *
 * Run: node tools/glx-call-census.mjs [track] [night|day] [frames]
 */
import { startStaticServer, launchChromium, shutdown } from "./harness.mjs";
const TRACK = process.argv[2] || "vegas";
const TOD = process.argv[3] || "night";
const FRAMES = +(process.argv[4] || 40);
const srv = await startStaticServer(process.cwd());
const browser = await launchChromium();
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
  // Optional localStorage flags, e.g. --ls apex26.instCellCache=1 — the same
  // escape-hatch shape gfx-probe uses, so an opt-in renderer path can be A/B'd
  // without a rebuild.
  const LS = process.argv.filter((a) => a.startsWith("apex26."));
  await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  if (LS.length) {
    await page.evaluate((pairs) => {
      for (const p of pairs) { const i = p.indexOf("="); localStorage.setItem(p.slice(0, i), p.slice(i + 1)); }
    }, LS);
    await page.goto(srv.url + "index.html", { waitUntil: "domcontentloaded", timeout: 90000 });
  }
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 90000 });
  await page.evaluate(async ([t, d]) => { await __apex.race(t, d, "clear"); __apex.go(); }, [TRACK, TOD]);
  await page.waitForFunction(() => { try { return !!__apex.info().track; } catch { return false; } },
    null, { polling: 100, timeout: 180000 });
  await new Promise((r) => setTimeout(r, 4000));
  // Drive, don't park: the batching questions are about the FIELD being drawn,
  // and a parked camera can sit where half of it is culled. PACK matters even
  // more — jump(0.30) puts the player alone on track, where a per-car batching
  // change has exactly one car to batch and measures nothing. `pack` keeps the
  // field bunched at the start so the per-car draws are actually there.
  const WHERE = process.argv.includes("pack") ? 0.002 : 0.30;
  await page.evaluate((w) => { __apex.jump(w); __apex.snapCam(); }, WHERE);
  await new Promise((r) => setTimeout(r, 1500));

  const out = await page.evaluate(async (F) => {
    const gl = document.getElementById("game").getContext("webgl2");
    if (!gl) return { err: "not GLX — no webgl2 context on #game" };
    const METHODS = ["drawElements", "drawArrays", "drawElementsInstanced",
                     "bindVertexArray", "useProgram", "bindTexture", "bindBuffer",
                     "bufferSubData", "uniform4fv", "uniformMatrix4fv", "uniform1i",
                     "uniform1f", "uniform3fv", "activeTexture", "bindFramebuffer"];
    const C = {}, orig = {};
    let subBytes = 0;
    for (const m of METHODS) {
      C[m] = 0; orig[m] = gl[m];
      gl[m] = function (...a) {
        C[m]++;
        if (m === "bufferSubData") {
          const src = a[2];
          if (src && src.BYTES_PER_ELEMENT) {
            const len = a[4] != null ? a[4] : src.length;
            subBytes += len * src.BYTES_PER_ELEMENT;
          }
        }
        return orig[m].apply(this, a);
      };
    }
    await new Promise((res) => { let i = 0; const t = () => { if (++i >= F) return res(); requestAnimationFrame(t); }; requestAnimationFrame(t); });
    for (const m of METHODS) gl[m] = orig[m];
    const per = {};
    for (const m of METHODS) if (C[m]) per[m] = +(C[m] / F).toFixed(1);
    // How many cars actually SURVIVED the culls — without this the bind counts
    // cannot be read at all (a one-car frame makes any batching look useless).
    let drawn = null;
    try {
      const f = __apex.field ? __apex.field() : null;
      drawn = Array.isArray(f) ? f.length : (f && f.cars ? f.cars.length : null);
    } catch (_) { /* no field hook */ }
    return { per, bufferSubDataKiBPerFrame: +((subBytes / F) / 1024).toFixed(1),
             carsInField: drawn,
             preset: (__apex.lightState && __apex.lightState().preset) || null };
  }, FRAMES);
  console.log(JSON.stringify({ track: TRACK, tod: TOD, frames: FRAMES, flags: LS, ...out }, null, 1));
} finally { await browser.close(); await shutdown(); }
