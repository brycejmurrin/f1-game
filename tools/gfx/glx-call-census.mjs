// @doc What does ONE GLX frame cost in GL calls? Wraps the live WebGL2 context mid-race; per-frame draw/bind/upload averages.
// @skill webgl-debug
/* glx-call-census.mjs — what does ONE GLX frame actually cost in GL calls?
 *
 * docs/PERF-FINDINGS.md §"COUNT THE WORK AVOIDED, DO NOT TIME IT": a
 * SwiftShader frame time is not evidence, but a call count is exact and
 * transfers to real hardware. This wraps the live WebGL2 context during a
 * RUNNING race with a full field — not a parked camera — and reports per-frame
 * averages, so a batching or elision change can be scored before and after.
 *
 * Run: node tools/gfx/glx-call-census.mjs [track] [night|day] [frames]
 */
import { startStaticServer, launchChromium, shutdown } from "../lib/harness.mjs";
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
  // race() THEN wait THEN go() — the three must not be one evaluate. startRace
  // is async now (it awaits ensureScenery for the split scenery files), so
  // race() returns before makeCars has staged the grid. Calling go() in that
  // window flipped state to "race" on a game with player === null, update()
  // threw on the first unguarded deref, and because the throw escapes tick()
  // before the rAF re-schedule the render loop died — this tool measured a
  // permanently blank canvas and reported it as an empty frame.
  await page.evaluate(([t, d]) => { __apex.race(t, d, "clear"); }, [TRACK, TOD]);
  await page.waitForFunction(() => { try { return !!__apex.info().track; } catch { return false; } },
    null, { polling: 100, timeout: 180000 });
  await page.evaluate(() => __apex.go());
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
    // The ORIGINAL fifteen. Kept as their own list and reported under `per` with
    // the same shape they always had, so a new run compares directly against
    // every number already written into docs/PERF-FINDINGS.md.
    const METHODS = ["drawElements", "drawArrays", "drawElementsInstanced",
                     "bindVertexArray", "useProgram", "bindTexture", "bindBuffer",
                     "bufferSubData", "uniform4fv", "uniformMatrix4fv", "uniform1i",
                     "uniform1f", "uniform3fv", "activeTexture", "bindFramebuffer"];
    // THE REST OF THE MUTATION SURFACE, previously invisible. Five rounds of GLX
    // work optimised against the fifteen above while the renderer also called
    // these every frame — §0 costed the cull toggles once, off to the side, and
    // they never entered a standing baseline. A call this tool cannot see is a
    // call nobody optimises.
    const STATE = ["uniform2f", "uniform3f", "uniform4f", "uniform1fv", "uniform2fv",
                   "uniform1iv", "uniformMatrix3fv", "enable", "disable", "blendFunc",
                   "blendFuncSeparate", "depthMask", "colorMask", "polygonOffset",
                   "depthFunc", "cullFace", "frontFace", "viewport", "scissor",
                   "clear", "texParameteri", "pixelStorei"];
    // enable/disable are useless as one number — CULL_FACE and
    // POLYGON_OFFSET_FILL have completely different stories. Bucket by the cap
    // enum, resolved off the context so the names cannot drift.
    const capName = new Map();
    for (const n of ["CULL_FACE", "BLEND", "DEPTH_TEST", "POLYGON_OFFSET_FILL",
                     "SCISSOR_TEST", "STENCIL_TEST", "DITHER", "RASTERIZER_DISCARD",
                     "SAMPLE_ALPHA_TO_COVERAGE"]) {
      if (gl[n] !== undefined) capName.set(gl[n], n);
    }
    const C = {}, caps = {}, orig = {};
    let subBytes = 0;
    for (const m of METHODS.concat(STATE)) {
      if (typeof gl[m] !== "function") continue;   // never invent a counter for a method this context lacks
      C[m] = 0; orig[m] = gl[m];
      gl[m] = function (...a) {
        C[m]++;
        if (m === "bufferSubData") {
          const src = a[2];
          if (src && src.BYTES_PER_ELEMENT) {
            const len = a[4] != null ? a[4] : src.length;
            subBytes += len * src.BYTES_PER_ELEMENT;
          }
        } else if (m === "enable" || m === "disable") {
          const k = m + ":" + (capName.get(a[0]) || ("0x" + Number(a[0]).toString(16)));
          caps[k] = (caps[k] || 0) + 1;
        }
        return orig[m].apply(this, a);
      };
    }
    await new Promise((res) => { let i = 0; const t = () => { if (++i >= F) return res(); requestAnimationFrame(t); }; requestAnimationFrame(t); });
    for (const m in orig) gl[m] = orig[m];
    const per = {}, state = {};
    for (const m of METHODS) if (C[m]) per[m] = +(C[m] / F).toFixed(1);
    for (const m of STATE) if (C[m]) state[m] = +(C[m] / F).toFixed(1);
    for (const k of Object.keys(caps).sort()) state[k] = +(caps[k] / F).toFixed(1);
    // How many cars actually SURVIVED the culls — without this the bind counts
    // cannot be read at all (a one-car frame makes any batching look useless).
    let drawn = null;
    try {
      const f = __apex.field ? __apex.field() : null;
      drawn = Array.isArray(f) ? f.length : (f && f.cars ? f.cars.length : null);
    } catch (_) { /* no field hook */ }
    return { per, state, bufferSubDataKiBPerFrame: +((subBytes / F) / 1024).toFixed(1),
             carsInField: drawn,
             preset: (__apex.lightState && __apex.lightState().preset) || null };
  }, FRAMES);
  console.log(JSON.stringify({ track: TRACK, tod: TOD, frames: FRAMES, flags: LS, ...out }, null, 1));
  // A CENSUS THAT MEASURED NOTHING MUST NOT EXIT 0. This tool printed `per: {}`
  // with a success code for an entire session after startRace went async: the
  // render loop was dead, every counter was zero, and "no calls" was
  // indistinguishable from "I counted no calls". That is the same
  // absence-reads-as-normal shape as the vacuous gpuErrors check (2g) and the
  // readdirSync harnesses that built circuits bare — both of which shipped
  // confident numbers about nothing. A frame with no drawElements is never a
  // real GLX frame, so say so and fail.
  if (out.err || !out.per || !(out.per.drawElements > 0)) {
    console.error("CENSUS MEASURED NOTHING — " + (out.err ||
      "0 drawElements a frame. The page rendered no geometry, so these counters " +
      "describe a dead render loop, not the renderer. Check for a page error " +
      "(scratch/r13-diag.mjs pattern: page.on('pageerror')) before trusting any " +
      "number here."));
    process.exitCode = 1;
  }
} finally { await browser.close(); await shutdown(); }
