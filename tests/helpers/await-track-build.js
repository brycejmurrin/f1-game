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

/** Wait for a track build, failing on a STALL rather than on a deadline. */
export async function awaitTrackBuild(page, stallMs = TRACK_STALL_MS, hardMs = TRACK_HARD_MS) {
  const started = Date.now();
  let lastSeen = -1, lastMoved = started;
  for (;;) {
    const s = await page.evaluate(() => {
      let n = 0;
      try { n = (window.__apex.logs && window.__apex.logs().length) || 0; } catch (_) { n = 0; }
      let ready = false;
      try { ready = window.__apex.info().track != null; } catch (_) { ready = false; }
      return { ready, n };
    });
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
