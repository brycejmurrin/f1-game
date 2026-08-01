/*
 * Apex 26 — IN-BROWSER material baker (dev tool, loaded on demand).
 *
 * Pulls real CC0 PBR scans from Poly Haven, composites them into the 17-layer
 * filmstrips js/render/assets.js expects, uploads them live so you can see the
 * result immediately, and downloads the finished PNGs so they can be committed.
 *
 * WHY THIS EXISTS. The offline baker (tools/assets.mjs) needs a shell and
 * network. Two things made that a dead end in practice:
 *   - the authoring sandbox's egress proxy 403s every asset CDN, and
 *   - the person doing the tuning may only have a DevTools console.
 * Probed live from a browser: api.polyhaven.com allows CORS, dl.polyhaven.org
 * allows cross-origin canvas READS (so getImageData does not taint), and
 * ambientCG blocks both. That makes Poly Haven the one source a browser can
 * actually bake from, and makes this file the only working route to real
 * scanned materials for a shell-less setup.
 *
 * NOT part of the game. It lives under assets/ (which the Pages workflow stages)
 * rather than js/ (whose every file must appear in tools/manifest.cjs and in a
 * <script> tag). index.html never references it, so it costs nothing at runtime
 * and is fetched only when you ask for it:
 *
 *   var s=document.createElement('script'); s.src='assets/pack/webbake.js'; document.head.appendChild(s)
 *
 * Then:
 *   WebBake.list()                     // suggested Poly Haven id per MAT slot
 *   await WebBake.run()                // bake the defaults, upload, download PNGs
 *   await WebBake.run({16:'asphalt_track'}, {size:512, download:false})
 *
 * "use strict" IIFE assigning one global, same as every other file here.
 */
"use strict";

const WebBake = (function () {
  const API = "https://api.polyhaven.com";
  const LAYERS = 17;                       // MAT.FLAT(0) … MAT.ASPHALT(16)

  // MAT id -> a Poly Haven asset that reads as that material. Chosen from the
  // live catalogue; every one is CC0. GLASS(3), FLAG(15) and FLAT(0) are
  // deliberately absent — see tools/assets.mjs SCALES for why.
  const DEFAULTS = {
    1:  "concrete_floor_02",      2:  "red_brick",
    4:  "metal_plate",            5:  "wood_planks",
    6:  "leafy_grass",            7:  "fabric_pattern_07",
    8:  "coast_sand_01",          9:  "sparse_grass",
    10: "rock_ground",            11: "snow_02",
    12: "clay_roof_tiles",        13: "castle_brick_02_red",
    14: "rusty_metal",            16: "asphalt_track",
  };

  // World metres per tile — MUST match tools/assets.mjs SCALES, or a browser
  // bake and an offline bake of the same material would tile differently.
  const SCALES = {
    1: 4.0, 2: 2.4, 4: 2.0, 5: 2.2, 6: 3.0, 7: 1.5, 8: 6.0,
    9: 3.0, 10: 5.0, 11: 6.0, 12: 2.0, 13: 3.0, 14: 2.0, 16: 4.0,
  };

  const NAMES = { 0:"FLAT",1:"CONCRETE",2:"BRICK",3:"GLASS",4:"METAL",5:"WOOD",6:"FOLIAGE",
                  7:"FABRIC",8:"SAND",9:"GRASS",10:"ROCK",11:"SNOW",12:"ROOF",13:"STONE",
                  14:"RUST",15:"FLAG",16:"ASPHALT" };

  const log = (...a) => console.log("[webbake]", ...a);

  // ── Poly Haven file resolution ─────────────────────────────────────────────
  // Verified shape: body[MAP][RES][FORMAT] = {size, md5, url}.
  // nor_gl NOT nor_dx — DirectX has an inverted green channel and would invert
  // every bump in the game. `arm` packs AO/roughness/metalness into RGB.
  function pick(body, map, res, fmt) {
    const m = body && body[map];
    if (!m) return null;
    for (const r of [res, "1k", "2k"]) {
      const slot = m[r];
      if (!slot) continue;
      for (const f of [fmt, "jpg", "png"]) if (slot[f] && slot[f].url) return slot[f].url;
    }
    return null;
  }

  async function bitmap(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
    return createImageBitmap(await r.blob());
  }

  function scratch(size) {
    const c = (typeof OffscreenCanvas !== "undefined")
      ? new OffscreenCanvas(size, size)
      : Object.assign(document.createElement("canvas"), { width: size, height: size });
    return { c, x: c.getContext("2d", { willReadFrequently: true }) };
  }

  // Draw an ImageBitmap scaled to size×size and read it back.
  function rasterise(img, size, s) {
    s.x.clearRect(0, 0, size, size);
    s.x.drawImage(img, 0, 0, size, size);
    return s.x.getImageData(0, 0, size, size).data;
  }

  // ── one material layer ─────────────────────────────────────────────────────
  // Returns {albedo: ImageData, normal: ImageData} in the packing the shader
  // reads: albedo = RGB reflectance + A roughness, normal = RG tangent + B AO.
  async function layer(phId, size, s) {
    const res = await fetch(`${API}/files/${encodeURIComponent(phId)}`);
    if (!res.ok) throw new Error(`files/${phId} -> HTTP ${res.status}`);
    const body = await res.json();
    const uDiff = pick(body, "Diffuse", "1k", "jpg");
    const uNorm = pick(body, "nor_gl", "1k", "jpg");
    const uArm  = pick(body, "arm", "1k", "jpg");
    if (!uDiff) throw new Error(`${phId}: no Diffuse map`);

    const dif = rasterise(await bitmap(uDiff), size, s);
    const nrm = uNorm ? rasterise(await bitmap(uNorm), size, s) : null;
    const arm = uArm ? rasterise(await bitmap(uArm), size, s) : null;

    // NORMALISE THE ALBEDO TO ITS OWN MEAN. This is the step that makes a real
    // scan usable here at all. The shader multiplies: albedo * tex.rgb * 2.0,
    // which is a no-op only for a map centred on 0.5. A scan is absolute
    // reflectance — asphalt sits near 0.12 — so feeding it in raw would
    // multiply every surface by ~0.24 and crush the whole game to black.
    // Dividing by the mean turns the scan into a pure VARIATION map: the
    // per-track tarmac tint, racing-line rubber wear and per-vertex grain all
    // survive, and only the scan's detail is added. It is also what makes one
    // material's brightness independent of which scan you happened to pick.
    let mr = 0, mg = 0, mb = 0;
    for (let i = 0; i < dif.length; i += 4) { mr += dif[i]; mg += dif[i + 1]; mb += dif[i + 2]; }
    const px = dif.length / 4;
    mr = Math.max(1, mr / px); mg = Math.max(1, mg / px); mb = Math.max(1, mb / px);

    const alb = new ImageData(size, size);
    const nor = new ImageData(size, size);
    for (let i = 0; i < dif.length; i += 4) {
      // 128 = the shader's neutral point (128/255 * 2 ≈ 1.0).
      alb.data[i]     = Math.min(255, dif[i]     / mr * 128);
      alb.data[i + 1] = Math.min(255, dif[i + 1] / mg * 128);
      alb.data[i + 2] = Math.min(255, dif[i + 2] / mb * 128);
      // ARM: R = ambient occlusion, G = roughness, B = metalness.
      alb.data[i + 3] = arm ? arm[i + 1] : 220;          // roughness
      nor.data[i]     = nrm ? nrm[i]     : 128;          // tangent normal x
      nor.data[i + 1] = nrm ? nrm[i + 1] : 128;          // tangent normal y
      nor.data[i + 2] = arm ? arm[i]     : 255;          // AO
      nor.data[i + 3] = 255;
    }
    return { albedo: alb, normal: nor, source: `polyhaven:${phId}` };
  }

  // ── the whole pack ─────────────────────────────────────────────────────────
  async function run(overrides, opts) {
    const o = opts || {};
    const size = o.size || 512;
    const want = Object.assign({}, DEFAULTS, overrides || {});
    const s = scratch(size);

    const albStrip = scratch(size); albStrip.c.width = size; albStrip.c.height = size * LAYERS;
    const norStrip = scratch(size); norStrip.c.width = size; norStrip.c.height = size * LAYERS;
    const aX = albStrip.c.getContext("2d"), nX = norStrip.c.getContext("2d");
    // Neutral fill so an un-baked slot is a no-op if it is ever sampled.
    aX.fillStyle = "rgb(128,128,128)"; aX.fillRect(0, 0, size, size * LAYERS);
    nX.fillStyle = "rgb(128,128,255)"; nX.fillRect(0, 0, size, size * LAYERS);

    const albImgs = new Array(LAYERS), norImgs = new Array(LAYERS);
    const scales = new Array(LAYERS).fill(0);
    const credits = [];
    const failed = [];

    for (const key of Object.keys(want)) {
      const mat = +key;
      if (!(mat > 0 && mat < LAYERS)) continue;
      const id = want[key];
      if (!id) continue;
      try {
        log(`${NAMES[mat]} (${mat}) <- ${id} …`);
        const L = await layer(id, size, s);
        aX.putImageData(L.albedo, 0, mat * size);
        nX.putImageData(L.normal, 0, mat * size);
        albImgs[mat] = L.albedo; norImgs[mat] = L.normal;
        scales[mat] = SCALES[mat] || 4;
        credits.push({ kind: "material", id: NAMES[mat].toLowerCase(), mat,
                       author: "Poly Haven contributors", licence: "CC0", source: L.source });
      } catch (e) {
        // One unavailable asset must not sink the bake — that slot simply keeps
        // its procedural look, which is a valid state everywhere downstream.
        failed.push(`${NAMES[mat]}: ${e.message}`);
        console.warn("[webbake]", NAMES[mat], "skipped —", e.message);
      }
    }

    const ok = scales.filter((v) => v > 0).length;
    log(`baked ${ok} layer(s) at ${size}px` + (failed.length ? `, ${failed.length} skipped` : ""));
    if (failed.length) log("skipped:", failed);
    if (!ok) { log("nothing baked — aborting"); return null; }

    // Live upload, so the result is on screen before anything is downloaded.
    let state = null;
    if (o.upload !== false && typeof Assets !== "undefined" && Assets.adopt) {
      state = Assets.adopt(size, albImgs, norImgs, scales);
      log("uploaded:", state);
      if (typeof __apex !== "undefined" && __apex.matTex && __apex.matTex() === 0) {
        log('materials are live but the blend is 0 — run  __apex.matTex(1)  to see them');
      }
    }

    const manifest = {
      version: 1,
      materials: {
        size,
        albedo: `mat-albedo-${size}.png`,
        normal: `mat-normal-${size}.png`,
        layers: scales.map((sc, mat) => sc > 0 ? {
          mat, id: NAMES[mat].toLowerCase(), scale: sc,
          source: (credits.find((c) => c.mat === mat) || {}).source,
          licence: "CC0", author: "Poly Haven contributors",
        } : null).filter(Boolean),
      },
      models: {}, env: {}, credits,
    };

    if (o.download !== false) {
      await save(albStrip.c, `mat-albedo-${size}.png`);
      await save(norStrip.c, `mat-normal-${size}.png`);
      dl(new Blob([JSON.stringify(manifest, null, 2) + "\n"], { type: "application/json" }), "manifest.json");
      log("downloaded 3 files — hand them over to be committed into assets/pack/");
    }
    return { manifest, state, failed };
  }

  function dl(blob, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  async function save(canvas, name) {
    const blob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: "image/png" })                       // OffscreenCanvas
      : await new Promise((r) => canvas.toBlob(r, "image/png"));
    dl(blob, name);
  }

  function list() {
    const rows = Object.keys(DEFAULTS).map((k) => ({
      mat: +k, name: NAMES[k], polyhaven: DEFAULTS[k], tileMetres: SCALES[k],
    }));
    console.table(rows);
    return rows;
  }

  // Search the live catalogue, so a bad default can be replaced without leaving
  // the console: WebBake.search("asphalt") -> ids you can pass to run().
  async function search(q) {
    const r = await fetch(`${API}/assets?type=textures`);
    const j = await r.json();
    const hit = Object.keys(j).filter((k) => k.toLowerCase().includes(String(q).toLowerCase()));
    console.log(hit.join("\n"));
    return hit;
  }

  return { run, list, search, layer, DEFAULTS, SCALES, NAMES };
})();

if (typeof window !== "undefined") window.WebBake = WebBake;
