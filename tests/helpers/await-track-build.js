/* Wait for a track build on PROGRESS, not on a wall-clock deadline.
 *
 * Its OWN module, deliberately: tests/helpers/fixtures.js imports Playwright's
 * `test`, so anything living there drags the whole runner in and cannot be
 * driven from a node unit test. The stall path is the half that has to be
 * proven — a detector that never fires is worse than the deadline it replaced,
 * because a wedged build would then hang the worker instead of failing with a
 * reason — so it lives where tests/unit/track-build-wait.test.mjs can reach it.
 */

/**
 * The track build waits on PROGRESS, not on a wall-clock guess.
 *
 * TRACK_MS was a fixed 45 s that had to cover every machine this suite runs
 * on, and on a cold CI runner — one that had just downloaded 291 MB of
 * browser — a monaco build blew through it while still emitting scenery lines,
 * failing a deploy on a spec that had nothing to do with the change
 * (2026-09-02, run 1881). AGENTS.md already says it: "a timeout on a busy box
 * measures the machine, not the code".
 *
 * So: a slow machine is not a failure, a STUCK build is. Poll for the track,
 * and treat the Log ring buffer growing as proof the build is still working.
 * No growth for TRACK_STALL_MS and it is genuinely wedged — which this reports
 * FASTER than the old deadline did, and with a message that says which of the
 * two happened instead of a bare "timeout".
 *
 * This is NOT a widened tolerance. The old number said "a build may take 45 s";
 * the new pair says "a build may take as long as it needs while it is visibly
 * working, and 20 idle seconds means it never will". Playwright's own test
 * timeout stays the outer backstop, so a build that progresses forever still
 * fails the test rather than hanging the suite.
 */
export const TRACK_STALL_MS = 20000;
// Belt to the stall check's braces. The stall detector is the useful signal,
// but it is a CONDITION, and a condition can be broken by a future edit —
// deleting it made this helper loop forever, which hangs a worker instead of
// failing it. A hard cap cannot be conditioned away: whatever else is wrong,
// the wait ends. Set far above any legitimate build (the slowest measured is a
// cold-runner monaco at ~60 s) so it never pre-empts the stall message.
export const TRACK_HARD_MS = 300000;

/** Wait for a track build, failing on a STALL rather than on a deadline.
 *
 * `opts.raceFlag` names a window property the caller set to "pending" and then
 * to "ok" / "err:<message>" from __apex.race()'s thenable. With it the build is
 * ready only once THAT start settled: on a reused page `info().track` is the
 * PREVIOUS world and is non-null at once (bug hunt 3 X1). Without it, the old
 * predicate. */
export async function awaitTrackBuild(page, stallMs = TRACK_STALL_MS, hardMs = TRACK_HARD_MS, opts = {}) {
  const started = Date.now();
  let lastSeen = -1, lastMoved = started;
  const raceFlag = opts.raceFlag || null;
  for (;;) {
    const s = await page.evaluate((flag) => {
      let n = 0;
      try { n = (window.__apex.logs && window.__apex.logs().length) || 0; } catch (_) { n = 0; }
      let ready = false;
      try { ready = window.__apex.info().track != null; } catch (_) { ready = false; }
      const done = flag ? window[flag] : "ok";
      const err = typeof done === "string" && done.startsWith("err:") ? done.slice(4) : null;
      return { ready: ready && done === "ok", n, err };
    }, raceFlag);
    if (s.err) throw new Error(`race start failed before the grid: ${s.err}`);
    if (s.ready) return;
    const now = Date.now();
    if (s.n !== lastSeen) { lastSeen = s.n; lastMoved = now; }
    else if (now - lastMoved > stallMs) {
      throw new Error(
        `track build STALLED: no Log activity for ${stallMs}ms and info().track is still null ` +
        `(${s.n} records). This is a wedged build, not a slow box.`);
    }
    if (now - started > hardMs) {
      throw new Error(
        `track build exceeded the ${hardMs}ms hard cap while still reporting progress ` +
        `(${s.n} records). Not a stall — something is building without ever finishing.`);
    }
    await page.waitForTimeout(100);
  }
}

/* The same trade for the BOOT wait: `window.__apex != null` behind a fixed
 * BOOT_MS. hud-layout's speed-readouts test went red on Pages 38660546141
 * (2026-10-15, oversize-hud-layout, 2 workers on llvmpipe): the first goto's
 * 45 s wait expired while the page was still logging its build at 53 s. A busy
 * box, not a dead boot (#1956).
 *
 * The stall window IS the old deadline (45 s, fixtures.js BOOT_MS; a literal
 * here because fixtures.js imports this module). A boot that goes quiet for
 * that long still fails, with the same budget as before. Only a boot that keeps
 * fetching scripts or logging may run past it, up to the hard cap. Progress is
 * the newest Log record id plus the resource-timing count, which also covers
 * the script-fetch phase before the first Log line. */
export const BOOT_STALL_MS = 45000;

const nodeDelay = (ms) => new Promise((r) => setTimeout(r, ms));

/** Wait for `window.__apex` to bind, failing on a STALL rather than on a deadline.
 * The pause between polls is a Node timer (`opts.delay`, injectable for the
 * unit test), not page.waitForTimeout: that call is a shrink-only tree ratchet. */
export async function awaitApexBoot(page, stallMs = BOOT_STALL_MS, hardMs = TRACK_HARD_MS, opts = {}) {
  const delay = opts.delay || nodeDelay;
  const started = Date.now();
  let lastSeen = -1, lastMoved = started;
  for (;;) {
    let s;
    try {
      s = await page.evaluate(() => {
        let id = 0, res = 0;
        // Log is a top-level const in a classic script: a lexical global, not window.Log.
        try { const r = Log.records({ limit: 1 }); id = (r.length && r[0].id) || 0; } catch (_) { id = 0; }
        try { res = performance.getEntriesByType("resource").length; } catch (_) { res = 0; }
        return { ready: window.__apex != null, n: id + res };
      });
    } catch (_) {
      // A navigation in flight destroys the execution context: that is progress.
      s = { ready: false, n: lastSeen + 1 };
    }
    if (s.ready) return;
    const now = Date.now();
    if (s.n !== lastSeen) { lastSeen = s.n; lastMoved = now; }
    else if (now - lastMoved > stallMs) {
      throw new Error(
        `boot STALLED: window.__apex still null after ${stallMs}ms with no new Log record or ` +
        `resource fetch (progress ${s.n}). A dead boot, not a slow box.`);
    }
    if (now - started > hardMs) {
      throw new Error(
        `boot exceeded the ${hardMs}ms hard cap while still reporting progress ` +
        `(progress ${s.n}). Not a stall: something is booting without ever binding __apex.`);
    }
    await delay(100);
  }
}
