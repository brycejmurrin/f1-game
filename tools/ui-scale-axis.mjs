// ui-scale-axis — the SCALE axis shared by the three fit tools (layout-audit,
// @doc The `--scale=` axis (80–150 % interface size) shared by layout-audit, menu-fit and fit-audit.
// @skill survey-ui-matrix
// menu-fit, fit-audit).
//
// WHY. Those tools measure a matrix of screen x viewport, and that matrix
// answered the right question right up until the player got a size slider.
// SETTINGS > DISPLAY now runs UI SIZE and HUD SIZE from 40 % to 200 %, so
// "does this screen fit?" is no longer one question — it is one question per
// size, and a layer that fits at the default can lose its primary button two
// notches up. This axis turns each tool's matrix into screen x viewport x
// scale, which is the question the whole component restructure has to keep
// answering as it goes.
//
// ONE NUMBER DRIVES BOTH SLIDERS. The game keeps --ui-scale and --hud-scale
// independent on purpose, but no screen in these tools holds both a menu sheet
// and the in-race HUD at once, so crossing the two axes would double the matrix
// in order to measure pairs that never share a frame. Setting both to the same
// percentage covers every cell at half the cost.

export const SCALE_HELP =
  "--scale=40,50,100,130,150,200   also audit at each interface size (%, default: the device default alone)";

// No --scale= means "whatever this device defaults to", represented as `null`
// (not a hard-coded 100): leave nothing stored so first paint uses the CSS
// `:root` / `(pointer: coarse)` defaults — currently 100% on every pointer,
// but a future touch-only bump must not be silently overridden by the tools.
export function parseScales(argv) {
  const a = argv.find((x) => x.startsWith("--scale="));
  if (!a) return [null];
  const out = a.slice("--scale=".length).split(",").filter(Boolean).map((s) => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 40 || n > 200) {
      throw new Error(`--scale: "${s}" is not a percentage between 40 and 200`);
    }
    return n;
  });
  if (!out.length) throw new Error("--scale= needs at least one percentage");
  return out;
}

// Suffix for report keys, filenames and grid columns. Empty at the device
// default so an un-scaled run's output is byte-identical to what it was before
// this axis existed — a harness change that renamed every existing cell would
// make its own arrival look like a regression.
export const scaleTag = (pct) => (pct == null ? "" : `@${pct}`);

// Drive the REAL sliders rather than injecting CSS overrides. __apex.uiScale /
// hudScale go through the same store the pause menu writes, which buys two
// things: the size survives the page reloads these tools do to recover a wedged
// cell (localStorage outlives the document, an injected <style> does not), and
// if the shipping path ever breaks, the harness is what says so instead of
// cheerfully measuring a mechanism nobody uses.
export async function applyScale(page, pct) {
  if (pct == null) return;
  await page.evaluate((p) => {
    if (!window.__apex || !window.__apex.uiScale) throw new Error("__apex.uiScale missing");
    window.__apex.uiScale(p);
    window.__apex.hudScale(p);
  }, pct);
}
