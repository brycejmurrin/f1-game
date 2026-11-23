// #5201: the readers that size the race HUD and the full-screen FX layers take the LAYOUT viewport
// (documentElement.clientWidth/Height, the ICB CSS lays out in), never inner*. On an iPhone Home Screen landscape
// launch inner* can hold the portrait pair (393x852) with no resize to follow while CSS lays out 852x393.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const code = (s) => s.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");   // comment lines out

/** hud.js's viewport cache, lifted verbatim (VP_SETTLE_MS … vpH) and run against a stale-launch window. */
function hudVp({ icb, inner, events = true }) {
  const s = read("js/ui/hud.js");
  const a = s.indexOf("const VP_SETTLE_MS"), b = s.indexOf("\n", s.indexOf("const vpH =")) + 1;
  assert.ok(a > 0 && b > a, "the hud.js viewport cache block is where this test expects it");
  const win = { innerWidth: inner[0], innerHeight: inner[1] };
  if (events) win.addEventListener = () => {};
  const sb = { window: win, document: { documentElement: { clientWidth: icb[0], clientHeight: icb[1] } }, performance: { now: () => 0 }, Date };
  return vm.runInNewContext(s.slice(a, b).replace(/^const\b/gm, "var") + ";[vpW(), vpH()]", sb, { filename: absSrc("js/ui/hud.js") });
}

test("hud.js: the cached viewport is the ICB on a stale-inner launch, and inner* only without layout", () => {
  assert.deepEqual([...hudVp({ icb: [852, 393], inner: [393, 852] })], [852, 393], "ICB wins over the stale portrait inner*");
  assert.deepEqual([...hudVp({ icb: [852, 393], inner: [600, 277] })], [852, 393], "a pinch-zoomed visual viewport does not move the HUD budget");
  assert.deepEqual([...hudVp({ icb: [0, 0], inner: [844, 390], events: false })], [844, 390], "no layout (VM harness): inner* as before");
});

test("hud.js: no direct inner* read outside vpSync; the HUD's neighbours ask GameHud.vp()", () => {
  const hud = code(read("js/ui/hud.js"));
  const hits = hud.split("\n").filter((l) => /\binner(Width|Height)\b/.test(l));
  assert.equal(hits.length, 1, "one reader (vpSync's no-layout fallback):\n" + hits.join("\n"));
  assert.match(hits[0], /else \{ _vp\.w = window\.innerWidth; _vp\.h = window\.innerHeight; \}/);
  assert.match(hud, /vp: \(\) => \[vpW\(\), vpH\(\)\]/, "GameHud.vp is exported");
  assert.match(code(read("js/render/shared/mirror-pass.js")), /GameHud\.vp \? GameHud\.vp\(\)\[0\] - 10/, "the mirror's right edge is the layout viewport");
  assert.match(code(read("js/ui/hud-relative.js")), /GameHud\.vp \? GameHud\.vp\(\)\[0\]/, "the REL card's slide limit is the layout viewport");
});

test("fx layers and menu paging: ICB first, inner* as the no-layout fallback only", () => {
  for (const f of ["js/fx/visor-optics.js", "js/fx/droplets.js"]) {
    const s = code(read(f));
    const lines = s.split("\n").filter((l) => /\binner(Width|Height)\b/.test(l));
    assert.equal(lines.length, 1, f + ": one sizing line reads inner*");
    assert.match(lines[0], /box \? bw : window\.innerWidth/, f + ": inner* only when the ICB has no size");
    assert.match(s, /de \? de\.clientWidth \| 0 : 0/, f + ": reads documentElement.clientWidth");
  }
  const nav = code(read("js/ui/menu-nav.js"));
  for (const l of nav.split("\n").filter((x) => /\binner(Width|Height)\b/.test(x))) assert.match(l, /documentElement\.client(Width|Height) \|\| window\.inner/, "menu-nav: " + l.trim());
});
