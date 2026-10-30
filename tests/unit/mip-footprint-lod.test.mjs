// PostCommon.mipFootprintLod (perf hunt 5 F1): the bound TLX uses to size the cockpit glass's mirror mip
// chain instead of latching all 9 levels. Behavioural: the bound must never sit below the LOD a GPU
// derives from the perspective-correct uv (brute-forced here by central differences inside each
// triangle), must equal it for a screen-parallel quad, and must refuse (Infinity) a vertex behind the eye.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const src = readFileSync(new URL("../../js/render/shared/post-common.js", import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(src + "\n;globalThis.PostCommon = PostCommon;", ctx, { filename: absSrc("js/render/shared/post-common.js") });
const lod = ctx.PostCommon.mipFootprintLod;

// Column-major perspective (GL clip) and a model matrix.
function persp(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
  return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
const rotY = (t) => [Math.cos(t), 0, -Math.sin(t), 0, 0, 1, 0, 0, Math.sin(t), 0, Math.cos(t), 0, 0, 0, 0, 1];
const rotX = (t) => [1, 0, 0, 0, 0, Math.cos(t), Math.sin(t), 0, 0, -Math.sin(t), Math.cos(t), 0, 0, 0, 0, 1];
const trans = (x, y, z) => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

// A lens-shaped quad (0.191 x 0.051 m, the glass) with the glass's uv span.
const POS = [-0.0955, -0.0255, 0, 0.0955, -0.0255, 0, 0.0955, 0.0255, 0, -0.0955, 0.0255, 0];
const UV = [0.4, 0.22, 1.0, 0.22, 1.0, 0.78, 0.4, 0.78];
const IDX = [0, 1, 2, 0, 2, 3];

// Ground truth: the LOD a GPU computes (max of the two derivative lengths) at many interior pixels.
function bruteLod(model, vp, W, H, tw, th) {
  const clip = (i) => {
    const x = POS[3 * i], y = POS[3 * i + 1], z = POS[3 * i + 2], m = mul(vp, model);
    const c = [0, 1, 2, 3].map((r) => m[r] * x + m[4 + r] * y + m[8 + r] * z + m[12 + r]);
    return { sx: c[0] / c[3] * 0.5 * W, sy: c[1] / c[3] * 0.5 * H, w: c[3], u: UV[2 * i] * tw, v: UV[2 * i + 1] * th };
  };
  let worst = -Infinity;
  for (let t = 0; t < IDX.length; t += 3) {
    const [a, b, c] = [clip(IDX[t]), clip(IDX[t + 1]), clip(IDX[t + 2])];
    const det = (b.sx - a.sx) * (c.sy - a.sy) - (b.sy - a.sy) * (c.sx - a.sx);
    const at = (px, py) => {   // perspective-correct uv at a screen point
      const l1 = ((px - a.sx) * (c.sy - a.sy) - (py - a.sy) * (c.sx - a.sx)) / det;
      const l2 = ((b.sx - a.sx) * (py - a.sy) - (b.sy - a.sy) * (px - a.sx)) / det, l0 = 1 - l1 - l2;
      const D = l0 / a.w + l1 / b.w + l2 / c.w;
      return [(l0 * a.u / a.w + l1 * b.u / b.w + l2 * c.u / c.w) / D, (l0 * a.v / a.w + l1 * b.v / b.w + l2 * c.v / c.w) / D];
    };
    for (let i = 1; i < 40; i++) for (let j = 1; i + j < 40; j++) {
      const l1 = i / 40, l2 = j / 40, px = a.sx + l1 * (b.sx - a.sx) + l2 * (c.sx - a.sx), py = a.sy + l1 * (b.sy - a.sy) + l2 * (c.sy - a.sy);
      const h = 1e-3, x0 = at(px - h, py), x1 = at(px + h, py), y0 = at(px, py - h), y1 = at(px, py + h);
      const dx = Math.hypot(x1[0] - x0[0], x1[1] - x0[1]) / (2 * h), dy = Math.hypot(y1[0] - y0[0], y1[1] - y0[1]) / (2 * h);
      worst = Math.max(worst, Math.log2(Math.max(dx, dy)));
    }
  }
  return worst;
}

test("screen-parallel quad: the bound is the exact texel/pixel ratio", () => {
  const W = 1152, H = 648, vp = persp(1.2, W / H, 0.05, 500), model = trans(0, 0, -0.6);
  const got = lod(POS, UV, IDX, model, vp, W, H, 830, 236);
  const truth = bruteLod(model, vp, W, H, 830, 236);
  assert.ok(got >= truth - 1e-9, `bound ${got} >= truth ${truth}`);
  // axis-aligned: each derivative has one non-zero component, so |du| + |dv| is the length itself and
  // the bound sits exactly the spec's sqrt2 (0.5 LOD) above the exact hypot
  assert.ok(Math.abs(got - truth - 0.5) < 1e-3, `tight: ${got} vs ${truth}`);
});

test("foreshortened and rolled glass (cockpit poses): bound >= brute force everywhere", () => {
  const W = 1266, H = 585;
  for (const [ry, rx, x, y, z] of [[1.1, 0.2, -0.35, -0.05, -0.55], [-1.25, -0.3, 0.38, 0.02, -0.5], [1.45, 0.6, -0.4, 0.1, -0.3], [0.3, 1.2, 0.0, -0.2, -0.4]]) {
    const model = mul(trans(x, y, z), mul(rotY(ry), rotX(rx))), vp = persp(1.3, W / H, 0.05, 500);
    const got = lod(POS, UV, IDX, model, vp, W, H, 336, 96), truth = bruteLod(model, vp, W, H, 336, 96);
    assert.ok(got >= truth - 1e-9, `pose ${ry},${rx}: bound ${got} >= truth ${truth}`);
    assert.ok(got - truth < 2, `pose ${ry},${rx}: not degenerate (${got} vs ${truth})`);
  }
});

test("a triangle straddling the eye plane refuses: Infinity means the full chain", () => {
  const W = 800, H = 400, vp = persp(1.2, 2, 0.05, 500);
  assert.equal(lod(POS, UV, IDX, mul(trans(0, 0, 0.01), rotY(1.4)), vp, W, H, 256, 64), Infinity);
});

test("a glass wholly behind the eye, or wholly off one side, draws no fragment: no bound (-Infinity)", () => {
  const W = 800, H = 400, vp = persp(1.2, 2, 0.05, 500);
  assert.equal(lod(POS, UV, IDX, trans(0, 0, 3), vp, W, H, 256, 64), -Infinity, "behind");
  assert.equal(lod(POS, UV, IDX, trans(5, 0, -1), vp, W, H, 256, 64), -Infinity, "off the right edge");
  // one quad on screen, the other behind: the bound is the visible one's
  const both = [...POS, ...POS.map((v, i) => (i % 3 === 2 ? v + 3.6 : v))], uv2 = [...UV, ...UV], idx2 = [...IDX, ...IDX.map((i) => i + 4)];
  const one = lod(POS, UV, IDX, trans(0, 0, -0.6), vp, W, H, 256, 64);
  assert.equal(lod(both, uv2, idx2, trans(0, 0, -0.6), vp, W, H, 256, 64), one);
});

test("more texels per pixel raises the bound by exactly log2 of the ratio", () => {
  const W = 1000, H = 500, vp = persp(1.2, 2, 0.05, 500), model = mul(trans(0.2, 0, -0.5), rotY(0.9));
  const a = lod(POS, UV, IDX, model, vp, W, H, 200, 50), b = lod(POS, UV, IDX, model, vp, W, H, 400, 100);
  assert.ok(Math.abs(b - a - 1) < 1e-9, `${a} -> ${b}`);
});
