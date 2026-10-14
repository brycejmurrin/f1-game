/* Wait until the agent world view describes the scene the test just set up.
 *
 * Its own module, like await-track-build.js: fixtures.js imports Playwright's
 * `test`, and this has no reason to drag the runner in.
 *
 * WHY NOT A FIXED NUMBER OF rAF FRAMES. Three readers in agentview.js read
 * state that only a real render() writes:
 *   - atmosphere().lights.active counts frame.lights, filled by the night
 *     flood branch of render(). setTimeOfDay() rebuilds the track
 *     synchronously, so the night lamps exist at once but are not in the
 *     frame until a render runs on the new world.
 *   - scene({visible}) and the live render({what:"view"}) project through
 *     frame.viewProj, recomputed only by render(). snapCam()/jump() move the
 *     live camera at once and leave viewProj on the last drawn frame.
 * The game's tick returns WITHOUT rendering while the backend is warming
 * shaders or the mirror pass is preparing — exactly what a rebuild or a race
 * start triggers — so a rAF tick is not a rendered frame. On a slow CI runner
 * two or ten ticks went by with no render (nightly 38392542652: lights.active
 * 0, coveragePct.road undefined, player inFrame false; each passed on retry).
 *
 * This waits on the readiness itself, polled from Node. It is a precondition,
 * not the assertion: each spec still asserts its own thresholds on a fresh
 * read afterwards, and a wait that never comes true throws with the state it
 * last saw instead of letting a timing gap pose as a contract failure.
 */

export const AGENT_VIEW_READY_MS = 60_000;

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ lights?: boolean, camera?: boolean, timeout?: number }} [opts]
 *   lights — a dark session reports its lamps in the rendered frame.
 *   camera — the last rendered frame was drawn from the live camera: the
 *            player car projects into it and the live view raster has road.
 */
export async function waitAgentViewReady(page, { lights = false, camera = false, timeout = AGENT_VIEW_READY_MS } = {}) {
  const want = { lights, camera };
  try {
    await page.waitForFunction(readyPredicate, want, { polling: 100, timeout });
  } catch (e) {
    const seen = await page.evaluate(readyState, want).catch((err) => ({ evaluateFailed: String(err && err.message) }));
    throw new Error(`waitAgentViewReady(${JSON.stringify(want)}) not ready after ${timeout} ms; last state ` +
      `${JSON.stringify(seen)} (${e && e.message ? e.message.split("\n")[0] : e})`);
  }
}

// Both run in the page: Playwright serialises them to source, so they must be
// self-contained (no closure over this module).
function readyState(want) {
  const a = window.__apex;
  if (!a) return { apex: false };
  const out = { track: !!(a.info() && a.info().track) };
  const w = a.world({ detail: "brief" });
  out.placed = !!(w && w.ok !== false);
  if (!out.placed) out.worldError = w && w.error;
  if (want.lights) {
    const at = a.atmosphere();
    out.dark = !!(at && at.dark);
    out.lightsActive = at && at.lights ? at.lights.active : null;
    out.builtForNight = !!(at && at.lights && at.lights.builtForNight);
  }
  if (want.camera) {
    const v = a.scene({ visible: true });
    const me = v && v.cars ? v.cars.find((c) => c.isPlayer) : null;
    out.playerInFrame = !!(me && me.inFrame);
    out.playerDistM = me ? me.distM : null;
    const f = a.render({ what: "view", cols: 24, rows: 8 });
    out.roadPct = f && f.coveragePct ? f.coveragePct.road : null;
    out.viewError = f && f.ok === false ? f.error : undefined;
  }
  return out;
}

function readyPredicate(want) {
  const a = window.__apex;
  if (!a || !a.info() || !a.info().track) return false;
  const w = a.world({ detail: "brief" });
  if (!w || w.ok === false) return false;
  if (want.lights) {
    const at = a.atmosphere();
    if (!at || at.ok === false) return false;
    if (at.dark && !(at.lights && at.lights.builtForNight && at.lights.active > 0)) return false;
  }
  if (want.camera) {
    const v = a.scene({ visible: true });
    if (!v || v.ok === false || v.framePending) return false;
    const me = v.cars && v.cars.find((c) => c.isPlayer);
    if (!me || !me.inFrame) return false;
    const f = a.render({ what: "view", cols: 24, rows: 8 });
    if (!f || f.ok === false || !f.coveragePct || f.coveragePct.road == null) return false;
  }
  return true;
}
