/* THE GARAGE → FLYBY HAND-OFF (js/ui/loading-screen.js wipe, css/loading.css
 * #loading[data-wipe]). Leaving the garage shot for the card or the flyby opens
 * on one sweep of the player's team colour, so the sequence reads as one shot
 * rather than a hard cut. Checked here without a browser: WHEN it fires (only
 * the first phase after the garage, never prep, never a cold card), WHAT colour
 * (the team's, the second colour for a near-black livery), and that reduced
 * motion turns the sweep off in the stylesheet.
 *
 * Run: node --test tests/unit/loading-wipe.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

/** An element that accepts anything: every unknown member is a no-op function
 *  returning another such element, so paint()/drawMap() run without a DOM. */
function stubEl(extra = {}) {
  const props = { dataset: {}, style: { setProperty(k, v) { this[k] = v; } }, hidden: true, offsetWidth: 0, ...extra };
  return new Proxy(props, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === Symbol.toPrimitive || k === "then") return undefined;
      return () => stubEl();
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function boot(team) {
  const els = new Map();
  const $ = (id) => { if (!els.has(id)) els.set(id, stubEl()); return els.get(id); };
  const sb = { Math, JSON, Object, Array, Number, String, isFinite, Date, console,
    setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
    addEventListener() {}, removeEventListener() {},
    document: { getElementById: $, createElement: () => stubEl(), documentElement: stubEl() },
    navigator: { getGamepads: () => [] }, matchMedia: () => ({ matches: false }),
    Log: { info() {}, warn() {} },
    Teams: { LIST: [
      { color: [0.045, 0.055, 0.065], color2: [0.0, 0.706, 0.671] },   // a black car, teal second colour
      { color: [0.863, 0, 0], color2: [1, 1, 1] },
      { color: [1.0, 0.502, 0.0], color2: [0.122, 0.122, 0.122] },
    ] } };
  sb.window = sb;
  vm.runInNewContext(read("js/ui/loading-screen.js").replace(/^const\b/gm, "var"), sb, { filename: "js/ui/loading-screen.js" });
  const store = { get: (k, d) => (k === "team" ? team : d), set() {} };
  const screen = sb.LoadingScreen.create({ $, store,
    Tracks: { LIST: [] }, TrackMaps: { corners: () => [] }, Flags: { svg: () => "" } });
  return { screen, root: $("loading") };
}
const info = { track: { name: "Monza", country: "Italy", id: "monza" } };

test("leaving the garage for the card sweeps once in the player's team colour", () => {
  const { screen, root } = boot(2);
  screen.garage(info, () => {});
  assert.equal(root.dataset.phase, "garage");
  assert.equal("wipe" in root.dataset, false, "no sweep over the garage shot itself");
  screen.building(info);
  assert.equal(root.dataset.phase, "build");
  assert.equal("wipe" in root.dataset, true, "the first phase after the garage opens on the sweep");
  assert.equal(root.style["--ld-wipe"], "rgb(255,128,0)", "papaya: the player's team colour");
});

test("a near-black livery sweeps in its second colour", () => {
  const { screen, root } = boot(0);
  screen.garage(info, () => {});
  screen.building(info);
  assert.equal(root.style["--ld-wipe"], "rgb(0,180,171)");
});

test("no sweep without a garage shot before it, and none into prep", () => {
  const cold = boot(1);
  cold.screen.building(info);
  assert.equal("wipe" in cold.root.dataset, false, "a cold card (no garage) is not a hand-off");
  const prep = boot(1);
  prep.screen.garage(info, () => {});
  prep.screen.prep(info, () => {});
  assert.equal("wipe" in prep.root.dataset, false, "prep is not the flyby");
  prep.screen.building(info);
  assert.equal("wipe" in prep.root.dataset, false, "and the flag does not survive past the phase after the garage");
});

test("the stylesheet sweeps once over the scrim, and reduced motion (both forms) turns it off", () => {
  const css = read("css/loading.css");
  assert.match(css, /#loading\[data-wipe\] \{[^}]*var\(--ld-wipe\)[^}]*animation: ld-wipe 0\.9s[^}]*both;/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{ #loading\[data-wipe\] \{ animation: none;/);
  assert.match(css, /:root\[data-motion="reduce"\] #loading\[data-wipe\] \{ animation: none;/);
});
