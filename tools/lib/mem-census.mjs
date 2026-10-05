// mem-census.mjs — the page half of the memory census, shared by
// @doc Page-side memory census (WeakRef track census, decoded-audio bytes, three render objects, forced-GC read) for mem-census.mjs and its spec.
// tools/gfx/mem-census.mjs (the CLI) and tests/specs/track-switch-memory.spec.js
// (the gate), so a number the spec asserts is the number the CLI prints.
//
// What it measures, and why each one:
//   - heapMB after forced GC: retained JS memory, the leak signal. Forced GC
//     comes from CDP (HeapProfiler.collectGarbage), so no --expose-gc launch
//     flag is needed and the Playwright suite can use it as-is.
//   - aliveTracks: a WeakRef to every track Tracks.build / buildPaced returned.
//     After GC exactly one should deref — the world on screen. More than one is
//     the #773 class of leak (the track itself pinned), exact and noise-free.
//   - three: renderer.info.memory plus the live RenderObject count — the cache
//     #773 found holding every freed track's geometry (TLX only; null on GLX).
//   - audioMB: decoded AudioBuffer PCM still reachable (length × channels × 4).
//     It is EXTERNAL memory: usedJSHeapSize never shows it, which is how ~90 MB
//     of decoded music per track went unseen (docs/plans/2026-10-03-perf-memory.md).

/** Init-script body (pass to addInitScript): wraps Tracks.build/buildPaced
 *  and decodeAudioData so the census can see what they produced. Idempotent. */
export function censusInitScript() {
  if (window.__memCensus) return;
  const C = window.__memCensus = { tracks: [], buffers: [], frames: 0 };
  // A frame counter of our own: a reading taken before the new world has
  // drawn misses its render objects and shader states, and on a loaded
  // software-GL box that can be seconds after the build finishes.
  const tick = () => { C.frames++; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const wrapTracks = () => {
    const T = typeof Tracks !== "undefined" ? Tracks : null;
    if (!T || T.__memCensusWrapped) return !!T;
    T.__memCensusWrapped = true;
    const note = (t) => { if (t) C.tracks.push([t.def && t.def.id, new WeakRef(t)]); return t; };
    const b = T.build, p = T.buildPaced;
    T.build = function (...a) { return note(b.apply(this, a)); };
    T.buildPaced = async function (...a) { return note(await p.apply(this, a)); };
    return true;
  };
  // Tracks is a script-tag global that loads after this runs: poll briefly.
  if (!wrapTracks()) { const id = setInterval(() => { if (wrapTracks()) clearInterval(id); }, 20); }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC && AC.prototype.decodeAudioData) {
    const d = AC.prototype.decodeAudioData;
    AC.prototype.decodeAudioData = function (ab, ok, err) {
      const keep = (buf) => { if (buf) C.buffers.push(new WeakRef(buf)); return buf; };
      const pr = d.call(this, ab, ok && ((buf) => ok(keep(buf))), err);
      return pr && pr.then ? pr.then(keep) : pr;
    };
  }
}

/** Page function (pass to page.evaluate) — read after a forced GC. */
export function readCensus() {
  const C = window.__memCensus || { tracks: [], buffers: [] };
  const alive = C.tracks.map(([id, r]) => (r.deref() ? id : null)).filter(Boolean);
  let audioBytes = 0, audioBuffers = 0;
  for (const r of C.buffers) {
    const b = r.deref();
    if (b) { audioBuffers++; audioBytes += b.length * b.numberOfChannels * 4; }
  }
  let three = null;
  try {
    const r = window.renderer;
    if (r && r.info) {
      three = {
        geometries: r.info.memory.geometries, textures: r.info.memory.textures,
        renderObjects: r._objects && r._objects._renderObjects ? r._objects._renderObjects.size : null,
      };
    }
  } catch (_) { three = null; }
  const pm = performance.memory;
  return {
    heapMB: pm ? +(pm.usedJSHeapSize / 1048576).toFixed(1) : null,
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
  return page.evaluate(readCensus);
}

/** Wait until the page has drawn `n` more animation frames (the new world is
 *  on screen and its programs built), bounded by `timeoutMs`. */
export async function waitFrames(page, n = 15, timeoutMs = 120000) {
  const f0 = await page.evaluate(() => (window.__memCensus ? window.__memCensus.frames : 0));
  await page.waitForFunction(([f, k]) => window.__memCensus && window.__memCensus.frames >= f + k, [f0, n], { polling: 100, timeout: timeoutMs });
}

/** Wait until the picker's hidden warm frames have drawn circuit `id`: the
 *  "menu warm drawn <id>" Log record game.js writes when the last of them
 *  renders, newer than the "build done <id>" record pickTrack returned on.
 *  pickTrack returns at "build done"; the picker then prepares car assets
 *  (~5 s on software GL), waits MENU_IDLE_MS of quiet and only then arms two
 *  hidden warm frames. A fixed settle after the build log races that work —
 *  CI run 37274796306 censused visit 1 to monza at 10 RenderObjects — and a
 *  wait on the render-object count can pass on the previous scene's objects
 *  before the new world drew (run 37330132243, 10 again with floor 20). Reads
 *  the Log ring directly: no __apex call (lazyTrackEnsure). */
export async function waitUntilDrawn(page, id, timeoutMs = 180000) {
  await page.waitForFunction((tid) => {
    try {
      const recs = Log.records();
      let built = -1;
      for (let i = recs.length - 1; i >= 0; i--) if (String(recs[i].msg).startsWith("build done " + tid + " ")) { built = recs[i].id; break; }
      if (built < 0) return false;
      return recs.some((r) => r.id > built && r.msg === "menu warm drawn " + tid);
    } catch (_) { return false; }
  }, id, { polling: 100, timeout: timeoutMs });
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
  const open = await page.evaluate(() => { const s = document.getElementById("select"); return !!s && !s.hidden; });
  if (!open) {
    await page.evaluate(() => document.getElementById("mb-race").click());
    await page.waitForFunction(() => !document.getElementById("select").hidden, null, { polling: 100, timeout: 30000 });
  }
  const idx = await page.evaluate((tid) => Tracks.LIST.findIndex((t) => t.id === tid), id);
  if (idx < 0) throw new Error("unknown circuit " + id);
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
      const done = Log.records().filter((r) => String(r.msg).startsWith("build done "));
      return done.length > 0 && String(done[done.length - 1].msg).startsWith("build done " + tid + " ");
    } catch (_) { return false; }
  }, id, { polling: 100, timeout: timeoutMs });
}
