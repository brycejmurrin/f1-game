/* A transient contour of the cover pixels controlled by one livery tint.
 * Probe atlases use private paint copies, never the draft or its live texture.
 * Existing decal UV geometry places the contour on the actual styled body. */
const GarageSurfaceOutline = (() => {
  "use strict";
  const FIELDS = Object.freeze(["spineTint", "saddleTint", "sideTint", "bandTint2", "plateTint"]);
  const REGIONS = ["crest", "tail", "spineSide", "spineSideL"];
  const OPTS = Object.freeze({ glow: 0.7 });

  function contour(a, b, width, height, regions, atlasWidth, atlasHeight) {
    const n = width * height, allowed = new Uint8Array(n), mask = new Uint8Array(n), edge = new Uint8Array(n);
    for (const r of regions) {
      const x0 = Math.max(0, Math.floor(r.x * width / atlasWidth)), x1 = Math.min(width, Math.ceil((r.x + r.w) * width / atlasWidth));
      const y0 = Math.max(0, Math.floor(r.y * height / atlasHeight)), y1 = Math.min(height, Math.ceil((r.y + r.h) * height / atlasHeight));
      for (let y = y0; y < y1; y++) allowed.fill(1, y * width + x0, y * width + x1);
    }
    for (let i = 0; i < n; i++) {
      const p = i * 4;
      // Both probes are dark, nearby hues: adaptive text normally keeps its
      // ink. Count only small positive RGB movement of the selected fill,
      // excluding an automatic dark/light lettering flip and transparent RGB.
      const dr = b[p] - a[p], dg = b[p + 1] - a[p + 1], db = b[p + 2] - a[p + 2];
      if (allowed[i] && (a[p + 3] || b[p + 3]) && Math.min(dr, dg, db) >= 3 && Math.max(dr, dg, db) <= 28) mask[i] = 1;
    }
    let any = false;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] && (x === 0 || y === 0 || x === width - 1 || y === height - 1 ||
          !mask[i - 1] || !mask[i + 1] || !mask[i - width] || !mask[i + width])) { edge[i] = 1; any = true; }
    }
    if (!any) return null;
    const pixels = new Uint8ClampedArray(n * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!allowed[i]) continue;
      if (edge[i]) { pixels.set([255, 255, 255, 255], i * 4); continue; }
      // One dark keyline around the white contour, never a filled overlay.
      if ((x > 0 && edge[i - 1]) || (x + 1 < width && edge[i + 1]) ||
          (y > 0 && edge[i - width]) || (y + 1 < height && edge[i + width])) pixels[i * 4 + 3] = 235;
    }
    return pixels;
  }

  function create(gfx) {
    let texture = null, field = null;
    function clear() {
      const old = texture; texture = null; field = null;
      if (old && gfx.freeTexture) { try { gfx.freeTexture(old); } catch (_) { /* device loss: logical ownership still ends */ } }
    }
    function set(next, team, liv, number) {
      clear();
      if (!FIELDS.includes(next) || typeof LiveryTex === "undefined" || !LiveryTex.buildAtlas ||
          LiveryTex.fillInert(next, liv) || !gfx.createTexture || !gfx.drawDecal) return false;
      try {
        const probe = (color) => {
          const colors = Object.assign({}, liv, { [next]: color });
          // AI preview tier bounds this explicit-click work to 512px wide.
          const canvas = LiveryTex.buildAtlas(team.id, colors, number, false, false);
          return { width: canvas.width, height: canvas.height,
            data: canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data };
        };
        // getImageData copies before the second call: mobile atlases reuse a
        // scratch canvas. No source bitmap or canvas is retained by the mask.
        const a = probe([0.12, 0.16, 0.20]), b = probe([0.22, 0.26, 0.30]);
        if (a.width !== b.width || a.height !== b.height) return false;
        const regions = REGIONS.map((key) => LiveryTex.REGIONS[key]).filter(Boolean);
        const pixels = contour(a.data, b.data, a.width, a.height, regions, LiveryTex.SIZE, LiveryTex.SIZE_H);
        if (!pixels) return false;
        const canvas = document.createElement("canvas"); canvas.width = a.width; canvas.height = a.height;
        const ctx = canvas.getContext("2d"), image = ctx.getImageData(0, 0, a.width, a.height);
        image.data.set(pixels); ctx.putImageData(image, 0, 0);
        texture = gfx.createTexture(canvas);
        if (!texture) return false;
        field = next; return true;
      } catch (_) { clear(); return false; }   // tainted/unsupported canvas: honest camera-only fallback
    }
    function draw(mesh, model) {
      if (!texture || !mesh || !model) return false;
      // The borrowed decal mesh is already proud of the body, depth tested,
      // alpha blended with depth writes disabled by every drawDecal backend.
      // Drawing after its live atlas preserves body/fin occlusion. No material
      // or texture-node mutation, no whole-car scale/outline or depth override.
      try { gfx.drawDecal(mesh, model, texture, OPTS); return true; }
      catch (_) { clear(); return false; }
    }
    return { set, clear, draw, active: () => field };
  }
  return Object.freeze({ FIELDS, contour, create });
})();
Object.freeze(GarageSurfaceOutline);
