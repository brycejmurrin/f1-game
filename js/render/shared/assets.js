/* Apex 26 — Assets: the baked asset pack loader. Loads `assets/pack/manifest.json` and everything it references: the baked PBR MATERIAL ARRAYS (albedo+roughness, … */
"use strict";

const Assets = (function () {
  // Pack URLs carry no ?v= cache-bust (index.html's version guard only rewrites
  // the shell's own script/link tags), so these fetches use DEFAULT caching
  // rather than force-cache: force-cache would serve a stale pack out of the
  // HTTP cache indefinitely, and a rebaked pack would never reach anyone who
  // had already loaded the old one. Normal revalidation plus sw.js's
  // build-numbered cache generation is what makes a rebake actually land.
  const PACK_DIR = "assets/pack/";
  const MANIFEST = PACK_DIR + "manifest.json";
  const MAT_LAYERS = 17;                 // MAT.FLAT(0) … MAT.ASPHALT(16)

  let _gfx = null;
  let _manifest = null;
  let _manifestPromise = null;
  let _loadPromise = null;
  let _loadGeneration = 0;                 // unload/adopt invalidate older async uploads
  let _uploaded = false;
  let _err = null;                       // last failure reason, for __apex.assets()
  let _bytes = 0;                        // bytes fetched for the material arrays
  let _tier = null;                      // "high" | "low" | "off"
  const _models = Object.create(null);   // id -> {pos,nrm,col,mat,idx} | null (miss)
  const _modelPromises = Object.create(null);

  function init(gfx) { _gfx = gfx || null; }

  function supported() {
    return !!(_gfx && typeof _gfx.createTextureArray === "function" &&
              typeof _gfx.setMaterialMaps === "function");
  }

  // ── manifest ───────────────────────────────────────────────────────────────

  function manifest() {
    if (_manifest !== null) return Promise.resolve(_manifest);
    // Material arrays and model prefetch start together at boot. Cache the
    // pending request too, so they share both the fetch and its JSON parse.
    if (!_manifestPromise) _manifestPromise = _fetchManifest().finally(() => { _manifestPromise = null; });
    return _manifestPromise;
  }

  async function _fetchManifest() {
    try {
      const res = await fetch(MANIFEST);
      if (!res.ok) { _err = "no-pack"; return false; }
      const j = await res.json();
      if (!j || typeof j !== "object") { _err = "bad-manifest"; return false; }
      _manifest = j;
      return j;
    } catch (e) {
      _err = "no-pack";
      return false;
    }
  }

  // ── material arrays ────────────────────────────────────────────────────────

  async function _decodeStrip(file, size, present) {
    const res = await fetch(PACK_DIR + file);
    if (!res.ok) throw new Error("fetch " + file);
    const blob = await res.blob();
    _bytes += blob.size;
    const out = new Array(MAT_LAYERS);
    try {
      for (let i = 0; i < MAT_LAYERS; i++) {
        if (!present[i]) continue;
        out[i] = await createImageBitmap(blob, 0, i * size, size, size);
      }
      return out;
    } catch (_) {
      // The cropping overload of createImageBitmap has a patchy history on
      // Safari. Fall back to one full-strip decode plus canvas crops, which
      // every engine supports — slower and it allocates, but it is the
      // difference between iOS getting baked materials and not.
      _releaseStrip(out);
      const full = await createImageBitmap(blob);
      const alt = new Array(MAT_LAYERS);
      try {
        const cv = (typeof OffscreenCanvas !== "undefined")
          ? new OffscreenCanvas(size, size)
          : Object.assign(document.createElement("canvas"), { width: size, height: size });
        const c2d = cv.getContext("2d");
        if (!c2d) throw new Error("no-2d-context");
        for (let i = 0; i < MAT_LAYERS; i++) {
          if (!present[i]) continue;
          c2d.clearRect(0, 0, size, size);
          c2d.drawImage(full, 0, i * size, size, size, 0, 0, size, size);
          alt[i] = await createImageBitmap(cv);
        }
        return alt;
      } catch (e) {
        _releaseStrip(alt);
        throw e;
      } finally {
        if (full.close) { try { full.close(); } catch (__) {} }
      }
    }
  }

  function _releaseStrip(imgs) {
    if (!imgs) return;
    for (const b of imgs) { if (b && b.close) { try { b.close(); } catch (_) {} } }
  }

  function _freeTexture(t) {
    if (t && _gfx && _gfx.freeTexture) _gfx.freeTexture(t);
  }

  function _discardLoad(albedo, normal, albedoTex, normalTex) {
    _freeTexture(albedoTex); _freeTexture(normalTex);
    _releaseStrip(albedo); _releaseStrip(normal);
  }

  // Load + upload the baked material arrays. Resolves to true only when the
  // arrays are actually live on the GPU; false (never a rejection) otherwise.
  // Safe to call repeatedly — concurrent calls share one in-flight promise.
  function load(opts) {
    if (_loadPromise) return _loadPromise;
    const generation = _loadGeneration;
    const work = _load(opts || {}, generation).catch((e) => {
      if (generation === _loadGeneration) _err = (e && e.message) || "load-failed";
      return false;
    });
    _loadPromise = work.then((ok) => {
      // Missing manifests / partial downloads can recover in this same tab;
      // retain only a completed upload. A concurrent caller shares work.
      if (!ok && generation === _loadGeneration) _loadPromise = null;
      return ok;
    });
    return _loadPromise;
  }

  async function _load(opts, generation) {
    if (!supported()) { _err = "backend"; _tier = "off"; return false; }
    const m = await manifest();
    if (generation !== _loadGeneration) return false;
    if (!m || !m.materials) { _tier = "off"; return false; }
    const mats = m.materials;

    const wantLow = opts.tier ? opts.tier === "low"
                              : !!(_gfx.isMobile || _gfx.mobileTier);
    const variant = (wantLow && mats.low) ? mats.low : mats;
    const size = variant.size | 0;
    if (!size || !variant.albedo) { _err = "bad-materials"; _tier = "off"; return false; }

    const present = new Array(MAT_LAYERS).fill(false);
    const scales = new Float32Array(MAT_LAYERS);
    for (const L of (variant.layers || [])) {
      const id = L.mat | 0;
      if (id <= 0 || id >= MAT_LAYERS) continue;
      if (!(L.scale > 0)) continue;
      present[id] = true;
      scales[id] = L.scale;
    }
    if (!present.some(Boolean)) { _err = "no-layers"; _tier = "off"; return false; }

    let albedo = null, normal = null, albedoTex = null, normalTex = null;
    try {
      albedo = await _decodeStrip(variant.albedo, size, present);
      if (generation !== _loadGeneration) {
        _discardLoad(albedo, normal, albedoTex, normalTex);
        return false;
      }
      albedoTex = _gfx.createTextureArray(size, albedo, MAT_LAYERS);
      if (!albedoTex) throw new Error("albedo-upload");
      if (variant.normal) {
        normal = await _decodeStrip(variant.normal, size, present);
        if (generation !== _loadGeneration) {
          _discardLoad(albedo, normal, albedoTex, normalTex);
          return false;
        }
        normalTex = _gfx.createTextureArray(size, normal, MAT_LAYERS);
        // A missing normal array is survivable — albedo alone still helps.
      }
    } catch (e) {
      _discardLoad(albedo, normal, albedoTex, normalTex);
      if (generation === _loadGeneration) {
        _err = (e && e.message) || "decode-failed";
        _tier = "off";
      }
      return false;
    }
    _releaseStrip(albedo); _releaseStrip(normal);
    if (generation !== _loadGeneration) {
      _freeTexture(albedoTex); _freeTexture(normalTex);
      return false;
    }

    _gfx.setMaterialMaps({ albedo: albedoTex, normal: normalTex, scales: scales });
    _uploaded = true;
    _tier = wantLow && mats.low ? "low" : "high";
    _err = null;
    let n = 0;
    for (let i = 0; i < present.length; i++) if (present[i]) n++;
    Log.info("assets", "pack loaded layers=" + n);
    return true;
  }

  // Adopt material layers built in the BROWSER rather than fetched from a pack.
  // `albedoImgs`/`normalImgs` are sparse arrays indexed by MAT id holding
  // anything createTextureArray accepts (ImageBitmap / canvas / ImageData).
  //
  // This exists for assets/pack/webbake.js, the in-browser baker: Poly Haven's
  // API and CDN both allow cross-origin canvas reads, so a browser can pull real
  // CC0 scans, composite them and preview them live — which is the only route to
  // real materials for anyone without a shell. Returns the new state(); never
  // throws, and a failure leaves the previous arrays untouched.
  function adopt(size, albedoImgs, normalImgs, scales) {
    if (!supported() || !size || !albedoImgs) { _err = "adopt-unsupported"; return state(); }
    // A browser bake is a new owner, even if its upload fails: an older pack
    // load must not finish later and silently replace the requested result.
    _loadGeneration++;
    _loadPromise = null;
    let a = null, n = null;
    try {
      a = _gfx.createTextureArray(size, albedoImgs, MAT_LAYERS);
      if (!a) throw new Error("albedo-upload");
      if (normalImgs) n = _gfx.createTextureArray(size, normalImgs, MAT_LAYERS);
    } catch (e) {
      if (a && _gfx.freeTexture) _gfx.freeTexture(a);
      if (n && _gfx.freeTexture) _gfx.freeTexture(n);
      _err = (e && e.message) || "adopt-failed";
      return state();
    }
    const sc = new Float32Array(MAT_LAYERS);
    for (let i = 0; i < MAT_LAYERS; i++) sc[i] = scales && scales[i] > 0 ? scales[i] : 0;
    _gfx.setMaterialMaps({ albedo: a, normal: n, scales: sc });
    _uploaded = true; _tier = "browser-bake"; _err = null;
    return state();
  }

  function unload() {
    _loadGeneration++;
    if (_gfx && _gfx.setMaterialMaps) _gfx.setMaterialMaps(null);
    _uploaded = false;
    _tier = "off";
    _loadPromise = null;
  }

  // ── baked models ───────────────────────────────────────────────────────────

  // Two on-disk layouts, both written by tools/gen/assets.mjs writeAX26():
  //
  //   v1  pos/nrm/col f32x3, mat f32, idx u32       — 40 B a vertex + 4 B an index
  //   v2  pos f32x3, nrm i16x3, col u8x3, mat u8,
  //       idx u16                                    — 22 B a vertex + 2 B an index
  //
  // v2 is what the shipped pack uses: the 36 baked models went from 2.95 MB to
  // 1.60 MB, and every one of them is fetched at boot (loadModels() in
  // js/game.js). The quantisation is chosen against what the models actually
  // contain, not against the format's limits — measured over the whole pack,
  // colours live in [0.1, 1] and are palette-derived so a byte is within half a
  // display level; normals are unit, so a signed short is 0.001° off; material
  // ids are whole numbers under 15; and the largest model is 6816 vertices, an
  // order of magnitude under what a u16 index can address.
  //
  // v1 is still READ, and the writer still falls back to it for anything that
  // does not fit (an emissive colour past 1.0, a non-integer or >255 material,
  // more than 65535 vertices) — an imported CC0 pack is not bound by what the
  // procedural catalogue happens to contain. Both decode to the same
  // {pos,nrm,col,mat,idx} Float32Arrays, so nothing downstream can tell.
  //
  // v2 COPIES where v1 returned views onto the fetched buffer. That is the
  // trade: the 1.35 MB saving is on the wire and the decoded arrays are the
  // same size either way, since the consumers need float32.
  function _parseModel(buf) {
    const dv = new DataView(buf);
    if (dv.byteLength < 20) return null;
    // "AX26" as four bytes, checked individually so endianness cannot bite.
    if (dv.getUint8(0) !== 0x41 || dv.getUint8(1) !== 0x58 ||
        dv.getUint8(2) !== 0x32 || dv.getUint8(3) !== 0x36) return null;
    const ver = dv.getUint32(4, true);
    if (ver !== 1 && ver !== 2) return null;
    const nv = dv.getUint32(8, true), ni = dv.getUint32(12, true);
    if (!nv || !ni) return null;
    let o = 20;
    if (ver === 1) {
      const need = o + nv * 3 * 4 * 3 + nv * 4 + ni * 4;
      if (dv.byteLength < need) return null;
      const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
      const nrm = new Float32Array(buf, o, nv * 3); o += nv * 12;
      const col = new Float32Array(buf, o, nv * 3); o += nv * 12;
      const mat = new Float32Array(buf, o, nv);     o += nv * 4;
      const idx = new Uint32Array(buf, o, ni);
      return { pos, nrm, col, mat, idx };
    }
    const need = o + nv * 12 + nv * 6 + nv * 3 + nv + ni * 2;
    if (dv.byteLength < need) return null;
    const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const qn = new Int16Array(buf, o, nv * 3);     o += nv * 6;
    const qc = new Uint8Array(buf, o, nv * 3);     o += nv * 3;
    const qm = new Uint8Array(buf, o, nv);         o += nv;
    const idx = new Uint16Array(buf, o, ni);
    const nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const mat = new Float32Array(nv);
    for (let i = 0; i < nv * 3; i++) { nrm[i] = qn[i] / 32767; col[i] = qc[i] / 255; }
    for (let i = 0; i < nv; i++) mat[i] = qm[i];
    return { pos, nrm, col, mat, idx };
  }

  function model(id) {
    if (id in _models) return Promise.resolve(_models[id]);
    if (_modelPromises[id]) return _modelPromises[id];
    _modelPromises[id] = (async () => {
      try {
        const m = await manifest();
        const rec = m && m.models && m.models[id];
        if (!rec || !rec.file) { if (m) _models[id] = null; return null; }
        const res = await fetch(PACK_DIR + rec.file);
        if (!res.ok) return null;
        const parsed = _parseModel(await res.arrayBuffer());
        if (parsed) _models[id] = parsed;
        return parsed;
      } catch (_) {
        return null;
      } finally {
        delete _modelPromises[id];
      }
    })();
    return _modelPromises[id];
  }

  // Ids of every baked model in the pack (empty without a pack).
  function models() {
    return _manifest && _manifest.models ? Object.keys(_manifest.models) : [];
  }

  function modelSync(id) { return _models[id] || null; }

  // Prefetch every model in the pack. Resolves to the number now resident.
  // Cheap by construction: `tools/gen/assets.mjs verify` caps the whole pack at
  // 8 MB, so this is never a large download.
  async function loadModels() {
    const m = await manifest();
    if (!m || !m.models) return 0;
    await Promise.all(Object.keys(m.models).map((id) => model(id)));
    return Object.keys(_models).reduce((n, k) => n + (_models[k] ? 1 : 0), 0);
  }

  // ── baked environment (HDRI-derived ambient) ───────────────────────────────

  // Returns {ambientSky, ambientGround, skyZenith?, skyHorizon?} for a
  // "<track>|<tod>" key, falling back to "*|<tod>" then null. These are values
  // applyRaceSettings already consumes, so an HDRI bake needs no shader change
  // at all — it just replaces hand-picked hemisphere colours with measured ones.
  function env(trackId, tod) {
    const m = _manifest;
    if (!m || !m.env) return null;
    return m.env[trackId + "|" + tod] || m.env["*|" + tod] || null;
  }

  // ── introspection ──────────────────────────────────────────────────────────

  function state() {
    const gs = (_gfx && _gfx.materialMapState) ? _gfx.materialMapState() : null;
    return {
      supported: supported(),
      pack: !!_manifest,
      uploaded: _uploaded,
      tier: _tier,
      layers: gs ? gs.layers : 0,
      normal: gs ? gs.normal : false,
      scales: gs ? gs.scales : null,
      bytes: _bytes,
      models: models().length,
      error: _err,
    };
  }

  function credits() {
    return (_manifest && _manifest.credits) ? _manifest.credits.slice() : [];
  }

  return { init, supported, manifest, load, unload, adopt, state,
           model, modelSync, models, loadModels, env, credits, MAT_LAYERS };
})();

// No-build global export.
if (typeof window !== "undefined") window.Assets = Assets;
