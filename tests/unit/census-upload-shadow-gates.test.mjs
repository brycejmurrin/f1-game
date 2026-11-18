/* census-upload-shadow-gates.test.mjs — #4783 rows 4 and 6 in the real-GPU verdict, and the analysers behind them.
 *
 * The uniform-group rates, pass count, program count and rUbo series are the ones game-webgpu-macos-latest.json of
 * gpu-census run 42943667972 (macos-latest, adapter vendor apple) reported. That build recorded no draw count and no
 * depth-target inventory, so `draws` and `depthTargets` here are written by hand in the shape the tools now emit.
 *
 * Run: node --test tests/unit/census-upload-shadow-gates.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadGate, shadowGate, legReport } from "../../tools/gfx/census-verdict.mjs";
import { analyseDepthTargets, analyseMirrorAllocs } from "../../tools/gfx/frame-hitch.mjs";

const UBO_KB = [81.3, 89.2, 89.9, 91, 91.7, 92.6, 93, 93.9, 93.9, 94.5, 96, 97.6, 97.8, 97.8, 97.8, 97.8, 98.2, 98.3, 96.3, 96.3];
const leg = (over = {}) => ({
  uploadGroups: [{ group: "render", nPerFrame: 54.71, kbPerFrame: 1.927, sizes: [[36, 20000]] }, { group: "object", nPerFrame: 33.66, kbPerFrame: 2.051, sizes: [[64, 12000], [48, 4000]] }],
  draws: { total: 58000, perFrame: 120.33 },
  passes: { medianPasses: 20, maxPasses: 24 },
  gpuWork: { "gpu.writeBuffer": 60538 },
  beats: UBO_KB.map((kb) => ({ ubo: { n: 390, kb }, mm: { progs: 50 } })),
  race: { drive: true },
  ...over,
});
const IND = " ".repeat(8);

test("row 4: the real run's uniform writes sit inside both bounds, and a driven window's rUbo growth is reported, not gated", () => {
  assert.deepEqual(uploadGate(leg(), { hardware: true }), { bad: [], rows: [
    `${IND}ubo-w: object 33.66/f 2.051KB vs draws 120.33/f (28%) strides 64Bx12000,48Bx4000`,
    `${IND}       render 54.71/f 1.927KB vs bound 1200 (50 programs x 24 passes) strides 36Bx20000`,
    `${IND}       rUbo 81.3 -> 96.3 KB over 20 beats, second half 96..98.3 KB  (driven window: reported, not gated; pass-census --park gates the parked frame)`,
  ] });
});

test("row 4: more object writes than draws, more render writes than programs x passes, and a parked rUbo that moves each fail on hardware only", () => {
  const over = leg({ draws: { perFrame: 30 }, passes: { maxPasses: 1 }, race: { drive: false } });
  assert.deepEqual(uploadGate(over, { hardware: true }).bad, [
    "object-group writes 33.66/f exceed draws 30/f — an object block is written more than once per draw",
    "render-group writes 54.71/f exceed 50 (50 programs x 1 passes) — the shared frame block is written more than once per program per pass",
    "rUboKB is not flat on a parked window: 96..98.3 KB over the second half of the beats",
  ]);
  assert.deepEqual(uploadGate(over, { hardware: false }).bad, []);
  const flat = leg({ race: { drive: false }, beats: [1, 2, 3, 4, 5, 6].map(() => ({ ubo: { kb: 96.3 }, mm: { progs: 50 } })) });
  assert.deepEqual(uploadGate(flat, { hardware: true }).bad, []);
});

test("row 4: an absent count fails beside counted writeBuffer calls and says NOT MEASURED on a leg with no WebGPU work", () => {
  assert.deepEqual(uploadGate(leg({ uploadGroups: { note: "no writeBuffer groups recorded" } }), { hardware: true }), {
    rows: [`${IND}ubo-w: NOT MEASURED — no writeBuffer groups recorded`],
    bad: ["NO writeBuffer groups recorded beside 60538 counted writeBuffer calls — the uniform-write gates would pass vacuously"] });
  assert.deepEqual(uploadGate({}, { hardware: true }), { rows: [`${IND}ubo-w: NOT MEASURED — the leg wrote no writeBuffer groups`], bad: [] });
  assert.deepEqual(uploadGate(leg({ draws: { note: "no WebGPU draw count on this leg" } }), { hardware: true }).bad,
    ["NO draw count recorded — the object-group write bound would pass vacuously"]);
  assert.deepEqual(uploadGate(leg({ passes: {} }), { hardware: true }).bad,
    ["NO program or pass count recorded — the render-group write bound would pass vacuously"]);
});

test("row 6: depth targets are split from their colour attachments, and a shadow map is a square depth attachment of side >= 256", () => {
  const dt = analyseDepthTargets([["1280x720/depth24plus | 1280x720/rgba16float:clear>store+1280x720/r16float:clear>store", 400],
    ["1024x1024/depth32float | none", 120], ["256x256/depth24plus | none", 60], ["64x64/depth24plus | 64x64/rgba16float:clear>store", 12], ["? | none", 1]], 200);
  assert.deepEqual(dt, { frames: 200, rows: [
    { depth: "1280x720/depth24plus", color: "1280x720/rgba16float:clear>store+1280x720/r16float:clear>store", n: 400, perFrame: 2, shadow: false },
    { depth: "1024x1024/depth32float", color: "none", n: 120, perFrame: 0.6, shadow: true },
    { depth: "256x256/depth24plus", color: "none", n: 60, perFrame: 0.3, shadow: true },
    { depth: "64x64/depth24plus", color: "64x64/rgba16float:clear>store", n: 12, perFrame: 0.06, shadow: false },
    { depth: "?", color: "none", n: 1, perFrame: 0.005, shadow: false },
  ] });
  assert.deepEqual(analyseDepthTargets([], 200), { note: "no pass with a depth attachment recorded (no WebGPU encoder on this leg, or the window drew none)" });
  assert.deepEqual(analyseDepthTargets([["a | none", 1]], 0), { note: "no window frames" });
  assert.deepEqual(shadowGate({ depthTargets: dt }, { hardware: true }), { bad: [],
    rows: [`${IND}shadow: 0.6/f 1024x1024/depth32float colour=none | 0.3/f 256x256/depth24plus colour=none`] });
});

test("row 6: a shadow pass that stores colour fails, a discarded colour passes, and an absent inventory beside a pass inventory fails", () => {
  const rows = (color) => ({ depthTargets: { frames: 100, rows: [{ depth: "1024x1024/depth24plus", color, n: 60, perFrame: 0.6, shadow: true }] } });
  assert.deepEqual(shadowGate(rows("1024x1024/r8unorm:clear>store"), { hardware: true }).bad,
    ["shadow-map pass 1024x1024/depth24plus stores a colour attachment (1024x1024/r8unorm:clear>store, 0.6/f) — nothing reads it on WebGPU"]);
  assert.deepEqual(shadowGate(rows("1024x1024/r8unorm:clear>discard"), { hardware: true }).bad, []);
  // Software legs report the same finding: a stored attachment is a fact about the passes, not about the adapter.
  assert.equal(shadowGate(rows("1024x1024/r8unorm:clear>store"), { hardware: false }).bad.length, 1);
  assert.deepEqual(shadowGate({ passOps: { rows: [] } }, { hardware: true }), { rows: [`${IND}shadow: NOT MEASURED — the leg wrote no depth-target inventory`],
    bad: ["NO depth-target inventory recorded beside a pass inventory — the shadow-target discard check would pass vacuously"] });
  assert.deepEqual(shadowGate({}, { hardware: true }).bad, []);
  assert.deepEqual(shadowGate({ depthTargets: { frames: 9, rows: [{ depth: "1280x720/depth24plus", color: "none", n: 9, perFrame: 1, shadow: false }] } }, { hardware: true }),
    { rows: [`${IND}shadow: no shadow-map pass in the window (1 depth-target kinds, none square >= 256)`], bad: [] });
});

test("the gates run on the TLX WebGPU leg only and carry the leg's name into the failure", () => {
  const g = { phase: "done", ok: true, gfx: { gpuErrors: 0, envState: { fail: 0 }, backendState: { softBlit: false } },
    ...leg({ draws: { perFrame: 30 } }), depthTargets: { frames: 100, rows: [{ depth: "512x512/depth24plus", color: "512x512/r8unorm:clear>store", n: 50, perFrame: 0.5, shadow: true }] } };
  assert.deepEqual(legReport("webgpu", g, { hardware: true }).bad, [
    "webgpu: object-group writes 33.66/f exceed draws 30/f — an object block is written more than once per draw",
    "webgpu: shadow-map pass 512x512/depth24plus stores a colour attachment (512x512/r8unorm:clear>store, 0.5/f) — nothing reads it on WebGPU",
  ]);
  assert.deepEqual(legReport("webgl2", g, { hardware: true }).bad, []);
});

test("#4710: mirror re-allocations are placed on the beat they happened and split by whether the target's size changed", () => {
  const beat = (s, allocs, w, h, mips, q) => ({ s, mir: { allocs, w, h, mips, q } });
  assert.deepEqual(analyseMirrorAllocs([beat(1, 2, 461, 132, 4, "full"), beat(2, 2, 461, 132, 4, "full"), beat(3, 3, 415, 118, 4, "full"), { s: 4, dead: "beat timeout" }, beat(5, 5, 415, 118, 4, "full")]), {
    beats: 4, allocs: 3, unexplained: 1, events: [
      { beat: 2, s: 3, allocs: 1, from: "461x132 mips4 full", to: "415x118 mips4 full", sizeChanged: true },
      { beat: 4, s: 5, allocs: 2, from: "415x118 mips4 full", to: "415x118 mips4 full", sizeChanged: false },
    ] });
  assert.deepEqual(analyseMirrorAllocs([beat(1, 2, 1, 1, 1)]), { note: "no per-beat mirror allocation count (no mirror pass, or fewer than 2 beats read it)" });
});
