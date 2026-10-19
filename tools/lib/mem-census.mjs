import { presentationDeadline, presentationDiagnostics, installPickerReceipt, pickerReceiptStatus } from "./presentation.mjs";
import { runtimeMemory } from "../perf/runtime-memory.mjs";
// mem-census.mjs — the page half of the memory census, shared by
// @doc Page-side memory census (track WeakRefs, decoded audio, render objects, forced GC) for the CLI and its spec.
// tools/gfx/mem-census.mjs (the CLI) and tests/specs/track-switch-memory.spec.js
// (the gate), so a number the spec asserts is the number the CLI prints.
//
// What it measures, and why each one:
//   - heapMB after forced GC: retained JS memory, the leak signal. Forced GC
//     comes from CDP (HeapProfiler.collectGarbage), so no --expose-gc launch
//     flag is needed and the Playwright suite can use it as-is.
//   - aliveTracks: a WeakRef to every track Tracks.build / buildPaced returned.
//     Observes successful public builds only; GC timing and partial builds are
//     outside this hook's coverage. Inspect owners when retired roots survive.
//   - three: renderer.info.memory plus the live RenderObject count — the cache
//     #773 found holding every freed track's geometry (TLX only; null on GLX).
//   - audioMB: decoded AudioBuffer PCM still reachable (length × channels × 4).
//     It is EXTERNAL memory: usedJSHeapSize never shows it, which is how ~90 MB
//     of decoded music per track went unseen (docs/plans/2026-10-03-perf-memory.md).

/** Init-script body (pass to addInitScript): wraps Tracks.build/buildPaced
 *  and decodeAudioData so the census can see what they produced. Idempotent. */
export function censusInitScript() {
  if (window.__memCensus) return;
  const C = window.__memCensus = { tracks: [], buffers: [], frames: 0, tracksReady: false };
  const tracksSeen = new WeakSet(), buffersSeen = new WeakSet();
  // A frame counter of our own: a reading taken before the new world has
  // drawn misses its render objects and shader states, and on a loaded
  // software-GL box that can be seconds after the build finishes.
  const tick = () => { C.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const wrapTracks = () => {
    const T = typeof Tracks !== "undefined" ? Tracks : null;
    if (!T || typeof T.build !== "function" || typeof T.buildPaced !== "function") return false;
    if (T.__memCensusWrapped) return C.tracksReady;
    T.__memCensusWrapped = true;
    const note = (t) => {
      if (t && !tracksSeen.has(t)) { tracksSeen.add(t); C.tracks.push([t.def && t.def.id, new WeakRef(t)]); }
      return t;
    };
    const b = T.build, p = T.buildPaced;
    T.build = function (...a) { return note(b.apply(this, a)); };
    T.buildPaced = async function (...a) { return note(await p.apply(this, a)); };
    C.tracksReady = true;
    return true;
  };
  // Tracks is a script-tag global that loads after this runs: poll briefly.
  if (!wrapTracks()) { const id = setInterval(() => { if (wrapTracks()) clearInterval(id); }, 20); }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && AC.prototype.decodeAudioData) {
    const d = AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData = function (ab, ok, err) {
      const keep = (buf) => {
        if (buf && !buffersSeen.has(buf)) { buffersSeen.add(buf); C.buffers.push(new WeakRef(buf)); }
        return buf;
      };
      const pr = d.call(this, ab, ok && ((buf) => ok(keep(buf))), err);
      return pr && pr.then ? pr.then(keep) : pr;
    };
  }
}

/** Page function (pass to page.evaluate) — read after a forced GC. */
export function readCensus() {
  const C = window.__memCensus || { tracks: [], buffers: [] };
  C.tracks = C.tracks.filter(([, r]) => r.deref());
  C.buffers = C.buffers.filter((r) => r.deref());
  const alive = C.tracks.map(([id]) => id);
  let audioBytes = 0, audioBuffers = 0;
  for (const r of C.buffers) {
    const b = r.deref();
    if (b) { audioBuffers++; audioBytes += b.length * b.numberOfChannels * 4; }
  }
  let three = null;
  let backend = { renderer: null, api: null };
  try {
    if (typeof GLX !== "undefined") {
      const api = GLX.backendState?.()?.api ?? null;
      // Native GLX has no backend label; deferred TLX/WGX install one.
      // Normalize only with a positive API observation, never the preference.
      backend = { renderer: GLX.backend ?? (api === "webgl2" ? "webgl2" : null), api };
    }
  } catch (_) { /* unavailable identity must not be inferred from the request */ }
  try {
    const r = window.renderer;
    if (r && r.info) {
      three = {
        geometries: r.info.memory.geometries, textures: r.info.memory.textures,
        renderObjects: r._objects && r._objects._renderObjects ? r._objects._renderObjects.size : null,
        programs: r.info.memory.programs ?? null,
        // Numeric primitive copy: resource bookkeeping, not physical GPU residency.
        memory: Object.fromEntries(Object.entries(r.info.memory).filter(([, v]) => typeof v === "number" && Number.isFinite(v) && v >= 0)),
      };
    }
  } catch (_) { three = null; }
  const pm = performance.memory;
  return {
    heapBytes: pm && Number.isFinite(pm.usedJSHeapSize) && pm.usedJSHeapSize >= 0 ? pm.usedJSHeapSize : null,
    heapMB: pm && Number.isFinite(pm.usedJSHeapSize) && pm.usedJSHeapSize >= 0 ? +(pm.usedJSHeapSize / 1048576).toFixed(1) : null,
    backend, instrumentation: { tracksReady: C.tracksReady === true },
    aliveTracks: alive,
    audioMB: +(audioBytes / 1048576).toFixed(1), audioBuffers,
    three,
  };
}

/** Force a full GC through CDP, twice (the second pass collects what the
 *  first one's finalizers released), then read the census. */
export async function censusAfterGc(page, cdp) {
  for (let i = 0; i < 2; i++) {
    await cdp.send("HeapProfiler.collectGarbage");
    await page.waitForTimeout(50);
  }
  const census = await page.evaluate(readCensus);
  return { ...census, runtimeMemory: await runtimeMemory(cdp) };
}

/** Growth evidence for forced-GC heap readings (MiB) from repeated visits to
 * one circuit. Exclude the first-visit warm-up interval. Median growth catches
 * repeated drift despite an occasional flat/negative interval; min is retained
 * for consumers of the old policy. A meaningful policy check needs five visits:
 * three post-warm-up intervals tolerate one measured late warm-up step.
 * Passing this sampled budget does not establish that the application is leak-free. */
export function sustainedGrowthMB(heaps) {
  if (!Array.isArray(heaps) || heaps.length < 3 || heaps.some((h) => typeof h !== "number" || !isFinite(h))) {
    throw new Error("sustainedGrowthMB needs >= 3 finite heap readings, got " + JSON.stringify(heaps));
  }
  const rawIntervals = [];
  for (let i = 2; i < heaps.length; i++) rawIntervals.push(heaps[i] - heaps[i - 1]);
  const intervals = rawIntervals.map((value) => +value.toFixed(1));
  const ordered = [...rawIntervals].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
  return { intervals, rawIntervals, min: Math.min(...intervals), median,
    netAfterWarmupMB: heaps.at(-1) - heaps[1], visits: heaps.length,
    policyReady: heaps.length >= 5 };
}

/** Wait for `n` animation callbacks, bounded by `timeoutMs`.
 *  This does not establish draw submission or visible presentation. */
export async function waitFrames(page, n = 15, timeoutMs = 120000) {
  const f0 = await page.evaluate(() => (window.__memCensus ? window.__memCensus.frames : 0));
  await page.waitForFunction(([f, k]) => window.__memCensus && window.__memCensus.frames >= f + k, [f0, n], { polling: 100, timeout: timeoutMs });
}

/** Wait for the pre-click receipt's final warm submission to complete for `id`.
 *  The "menu warm drawn <id>" record occurs BEFORE that draw, so it identifies
 *  the present to observe rather than proving successful display completion.
 *  The receipt freezes a scene-specific target; the paused picker may never
 *  submit another frame after its final warm draw.
 *  pickTrack returns at "build done"; the picker then prepares car assets
 *  (~5 s on software GL), waits MENU_IDLE_MS of quiet and only then arms two
 *  hidden warm frames. A fixed settle after the build log races that work —
 *  CI run 37274796306 censused visit 1 to monza at 10 RenderObjects — and a
 *  wait on the render-object count passes on the previous scene's objects
 *  before the new world drew (run 37330132243, 10 again with that wait in
 *  place). Reads the Log ring directly: no __apex call (lazyTrackEnsure). */
export async function waitUntilDrawn(page, id, timeoutMs = 180000) {
  const bounded = presentationDeadline(timeoutMs);
  let latest = null;
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      latest = await bounded("picker receipt status", () => page.evaluate(pickerReceiptStatus, id));
      if (Date.now() >= deadline) throw new Error("picker presentation deadline exceeded");
      if (latest.error) throw new Error(latest.error);
      if (latest.ok) return latest;
      await bounded("picker poll delay", () => page.waitForTimeout(Math.min(100, deadline - Date.now())));
    }
    throw new Error("picker presentation deadline exceeded");
  } catch (error) {
    error.presentation = { ok: false, receipt: latest };
    try { error.presentation.diagnostics = await presentationDeadline(1000)("failure diagnostics", () => page.evaluate(presentationDiagnostics)); } catch (_) { /* page may be blocked */ }
    throw error;
  } finally {
    // Do not let cleanup of a blocked page hide the bounded failure.
    try { await presentationDeadline(1000)("restore observer", () => page.evaluate(() => window.__pickerPresentation?.restore?.())); } catch (_) { /* best effort */ }
  }
}

/** Let the page run for `ms` of its own clock (the picker draws the world in
 *  warm frames over time, not in a fixed number of them). A condition wait on
 *  performance.now(), not a Node-side sleep, so a stalled page cannot pass it. */
export async function settle(page, ms) {
  const t0 = await page.evaluate(() => performance.now());
  await page.waitForFunction(([t, m]) => performance.now() >= t + m, [t0, ms], { polling: 100, timeout: ms + 60000 });
}

/** Pick a circuit on the RACE picker (the player's path: the picker pre-builds
 *  it through scheduleFlybyTrack → loadTrackStepped) and wait for that build.
 *  Opens the picker first when it is closed. Resolves when the newest
 *  "build done" log line is this circuit and the world is installed. */
export async function pickTrack(page, id, timeoutMs = 240000) {
  const bounded = presentationDeadline(timeoutMs);
  const rawPage = page;
  page = new Proxy(rawPage, { get(target, key) {
    const value = target[key];
    return typeof value === "function"
      ? (...args) => bounded("picker " + String(key), () => value.apply(target, args)) : value;
  } });
  const open = await page.evaluate(() => { const s = document.getElementById("select"); return !!s && !s.hidden; });
  if (!open) {
    await page.evaluate(() => document.getElementById("mb-race").click());
    await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 30000 });
  }
  const idx = await page.evaluate((tid) => Tracks.LIST.findIndex((t) => t.id === tid), id);
  if (idx < 0) throw new Error("unknown circuit " + id);
  await page.evaluate(installPickerReceipt, id);
  await page.evaluate((i) => {
    const row = document.querySelector('.track-row[data-track-idx="' + i + '"]');
    if (!row) throw new Error("no picker row for index " + i);
    row.click();
  }, idx);
  // NO __apex CALL WHILE THE NEW WORLD BUILDS. Every dev-API method is wrapped
  // to load a track synchronously when none is installed (apex.js
  // lazyTrackEnsure), and the picker drops the old world before the stepped
  // build lands — so polling __apex.info()/logs() in that gap built a BARE
  // circuit ("no scenery closure … building bare") on top of the picker's own
  // build. Read the Log ring directly: the stepped loader installs the world in
  // the same task that logs "build done", and waitUntilDrawn() follows anyway.
  await page.waitForFunction((tid) => {
    try {
      const done = Log.records().filter((r) => r.id > (window.__pickerPresentation?.after ?? Infinity) && String(r.msg).startsWith("build done "));
      return done.length > 0 && String(done[done.length - 1].msg).startsWith("build done " + tid + " ");
    } catch (_) { return false; }
  }, id, { polling: 100, timeout: timeoutMs });
}
