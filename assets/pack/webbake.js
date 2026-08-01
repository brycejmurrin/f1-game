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

  const NAMES_TO_MAT = Object.fromEntries(Object.entries(NAMES).map(([k, v]) => [v, +k]));
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

  // ── 3D models ──────────────────────────────────────────────────────────────
  //
  // Same transport as the materials (api.polyhaven.com + dl.polyhaven.org, both
  // CORS-open), but one format problem in the way: js/render/gltf.js is GLB-only
  // and explicitly refuses external .bin URIs, while Poly Haven ships .gltf with
  // a sidecar .bin. So we re-pack the two into a GLB in memory and hand that to
  // the game's OWN loader — if it survives GLTF.toMesh here it will survive it
  // at runtime, and the two can never disagree about what is supported.
  //
  // WHAT IS LOST: textures. The lit path is vertex-colour only (no UV channel
  // anywhere), so a photoscanned prop arrives as flat baseColorFactor and will
  // usually look WORSE than the procedural geometry it replaces. Models whose
  // colour lives in a flat palette rather than a texture (the low-poly CC0
  // packs) are the ones worth importing. modelReport() below prints what you
  // need to judge that before committing anything.

  // Re-pack a .gltf + .bin pair into a GLB buffer.
  function toGLB(json, bin) {
    const j = JSON.parse(JSON.stringify(json));
    // The GLB spec requires buffer 0 to have no uri — it IS the BIN chunk.
    if (j.buffers && j.buffers[0]) { delete j.buffers[0].uri; j.buffers[0].byteLength = bin.byteLength; }
    // Images referencing external files cannot survive; drop them rather than
    // emit a GLB that points at nothing. Materials keep their baseColorFactor.
    if (j.images) delete j.images;
    if (j.textures) delete j.textures;
    if (j.materials) for (const m of j.materials) {
      if (m.pbrMetallicRoughness) {
        delete m.pbrMetallicRoughness.baseColorTexture;
        delete m.pbrMetallicRoughness.metallicRoughnessTexture;
      }
      delete m.normalTexture; delete m.occlusionTexture; delete m.emissiveTexture;
    }
    const enc = new TextEncoder();
    let jb = enc.encode(JSON.stringify(j));
    const jpad = (4 - (jb.length % 4)) % 4;
    if (jpad) { const t = new Uint8Array(jb.length + jpad); t.set(jb); t.fill(0x20, jb.length); jb = t; }
    const bb = new Uint8Array(bin);
    const bpad = (4 - (bb.length % 4)) % 4;
    const total = 12 + 8 + jb.length + 8 + bb.length + bpad;
    const out = new ArrayBuffer(total);
    const dv = new DataView(out), u8 = new Uint8Array(out);
    dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
    dv.setUint32(12, jb.length, true); dv.setUint32(16, 0x4e4f534a, true);
    u8.set(jb, 20);
    const bo = 20 + jb.length;
    dv.setUint32(bo, bb.length + bpad, true); dv.setUint32(bo + 4, 0x004e4942, true);
    u8.set(bb, bo + 8);
    return out;
  }

  // Fetch a Poly Haven model, re-pack it, and run it through the game's loader.
  // Returns {mesh, report} without downloading anything — inspect first.
  async function modelReport(phId, opts) {
    const o = opts || {};
    const res = await fetch(`${API}/files/${encodeURIComponent(phId)}`);
    if (!res.ok) throw new Error(`files/${phId} -> HTTP ${res.status}`);
    const body = await res.json();
    const g = body.gltf;
    if (!g) throw new Error(`${phId}: no gltf format published`);
    const resKey = o.res || Object.keys(g)[0];
    const entry = g[resKey] && g[resKey].gltf;
    if (!entry || !entry.url) throw new Error(`${phId}: no gltf at ${resKey}`);

    const gj = await (await fetch(entry.url)).json();
    // The sidecar .bin is listed in `include`, keyed by its relative path.
    const binKey = Object.keys(entry.include || {}).find((k) => k.endsWith(".bin"));
    if (!binKey) throw new Error(`${phId}: gltf has no .bin in include`);
    const bin = await (await fetch(entry.include[binKey].url)).arrayBuffer();

    const glb = toGLB(gj, bin);
    if (typeof GLTF === "undefined") throw new Error("GLTF loader not on the page");
    const mesh = GLTF.toMesh(glb, { scale: o.scale != null ? o.scale : 1 });

    let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
    for (let i = 0; i < mesh.pos.length; i += 3) {
      mnx = Math.min(mnx, mesh.pos[i]); mxx = Math.max(mxx, mesh.pos[i]);
      mny = Math.min(mny, mesh.pos[i + 1]); mxy = Math.max(mxy, mesh.pos[i + 1]);
      mnz = Math.min(mnz, mesh.pos[i + 2]); mxz = Math.max(mxz, mesh.pos[i + 2]);
    }
    const verts = mesh.pos.length / 3, tris = mesh.idx.length / 3;
    const report = {
      id: phId, res: resKey, verts, tris,
      sizeMetres: [+(mxx - mnx).toFixed(2), +(mxy - mny).toFixed(2), +(mxz - mnz).toFixed(2)],
      bytesAX26: 20 + verts * 40 + mesh.idx.length * 4,
      // Vegas already carries ~1.8M prop verts. A prop placed 20x around a
      // circuit multiplies by 20 — that is the number that decides whether an
      // asset is usable, not the download size.
      vertsIfPlaced20x: verts * 20,
      hadTextures: !!(gj.images && gj.images.length),
      verdict: verts * 20 > 300000 ? "TOO HEAVY for repeated placement"
             : verts * 20 > 80000 ? "heavy — use sparingly"
             : "fine",
    };
    console.table([report]);
    if (report.hadTextures)
      console.warn("[webbake] textures dropped — the lit path is vertex-colour only. " +
                   "Expect this to look flatter than the source render.");
    return { mesh, report, glb };
  }

  // Bake a model to the game's AX26 vertex format and download it, ready to be
  // committed into assets/pack/models/ and placed with api.bakedModel().
  // Layout mirrors js/render/assets.js _parseModel exactly.
  async function model(phId, matName, opts) {
    const o = opts || {};
    const { mesh, report } = await modelReport(phId, o);
    const mat = NAMES_TO_MAT[(matName || "CONCRETE").toUpperCase()];
    if (mat === undefined) throw new Error(`unknown MAT "${matName}"`);
    const nv = mesh.pos.length / 3, ni = mesh.idx.length;
    const buf = new ArrayBuffer(20 + nv * 36 + nv * 4 + ni * 4);
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    u8[0] = 0x41; u8[1] = 0x58; u8[2] = 0x32; u8[3] = 0x36;      // "AX26"
    dv.setUint32(4, 1, true); dv.setUint32(8, nv, true);
    dv.setUint32(12, ni, true); dv.setUint32(16, 0, true);
    let off = 20;
    new Float32Array(buf, off, nv * 3).set(mesh.pos); off += nv * 12;
    new Float32Array(buf, off, nv * 3).set(mesh.nrm && mesh.nrm.length === nv * 3 ? mesh.nrm : new Float32Array(nv * 3));
    off += nv * 12;
    new Float32Array(buf, off, nv * 3).set(mesh.col && mesh.col.length === nv * 3 ? mesh.col : new Float32Array(nv * 3).fill(0.7));
    off += nv * 12;
    new Float32Array(buf, off, nv).fill(mat); off += nv * 4;
    new Uint32Array(buf, off, ni).set(mesh.idx);
    const name = (o.name || phId) + ".bin";
    dl(new Blob([buf], { type: "application/octet-stream" }), name);
    log(`downloaded ${name} — ${nv} verts, MAT.${matName || "CONCRETE"}`, report.verdict);
    return report;
  }


  // What models does Poly Haven actually publish?
  async function models(q) {
    const r = await fetch(`${API}/assets?type=models`);
    const j = await r.json();
    const hit = Object.keys(j).filter((k) => !q || k.toLowerCase().includes(String(q).toLowerCase()));
    console.log(`${hit.length} model(s):\n` + hit.join("\n"));
    return hit;
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

  return { run, list, search, layer,
           models, modelReport, model, toGLB,
           DEFAULTS, SCALES, NAMES };
})();

if (typeof window !== "undefined") window.WebBake = WebBake;
