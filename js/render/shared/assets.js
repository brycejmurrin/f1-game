/* Apex 26 — Assets: the baked asset pack loader. Loads `assets/pack/manifest.json` and everything it references: the baked PBR MATERIAL ARRAYS (albedo+roughness, … */
"use strict";

const Assets = (function () {
  // Pack URLs carry no ?v= cache-bust (index.html's version guard only rewrites
  // the shell's own script/link tags), so these fetches use DEFAULT caching
  // rather than force-cache: force-cache would serve a stale pack out of the
  // HTTP cache indefinitely, and a rebaked pack would never reach anyone who
  // had already loaded the old one. sw.js serves assets/pack/ NETWORK-FIRST
  // (cache only as the offline / slow fallback), so normal revalidation is
  // what makes a rebake land — from the first boot after the deploy.
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
    // Material arrays and the first circuit's models can ask together. Cache
    // the pending request too, so they share both the fetch and its JSON parse.
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

  async function _fetchStrip(file) {
    const res = await fetch(PACK_DIR + file);
    if (!res.ok) throw new Error("fetch " + file);
    const blob = await res.blob();
    _bytes += blob.size;
    return blob;
  }

  // Every strip decode passes these. The albedo strip's ALPHA is roughness,
  // not coverage, so the bitmap must stay straight: `premultiplyAlpha:
  // "default"` is UA-chosen and Chromium premultiplies it (MEASURED 2026-10-04,
  // artifacts/probe/run-premul.mjs: layer 4 meanR 152.6 straight vs 61.5
  // default — the metal layer at 40 %). WebGL ignores UNPACK_PREMULTIPLY_ALPHA
  // for an ImageBitmap, so construction is the only place to say it. The PNG
  // is untagged; "none" keeps the bytes the bake wrote (GLX texSubImage3D,
  // TLX/WGX readLayerBytes all see the same values).
  // https://html.spec.whatwg.org/multipage/imagebitmap-and-animations.html#imagebitmapoptions
  const BITMAP_OPTS = Object.freeze({ premultiplyAlpha: "none", colorSpaceConversion: "none" });

  // Break strip decode into short tasks: 17× createImageBitmap on a ~1.6 MB
  // pack strip was one contiguous main-thread hitch during the title idle
  // Assets.load() kick. scheduler.yield when present; else a microtask / 0-ms
  // timer. VM unit harnesses often lack setTimeout — resolve immediately then.
  function _yieldDecode() {
    try {
      if (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function") {
        return scheduler.yield();
      }
    } catch (_) { /* fall through */ }
    if (typeof queueMicrotask === "function") {
      return new Promise((resolve) => { queueMicrotask(resolve); });
    }
    if (typeof setTimeout === "function") {
      return new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    return Promise.resolve();
  }

  async function _decodeStrip(blob, size, present) {
    const out = new Array(MAT_LAYERS);
    try {
      let n = 0;
      for (let i = 0; i < MAT_LAYERS; i++) {
        if (!present[i]) continue;
        if (n++) await _yieldDecode();
        out[i] = await createImageBitmap(blob, 0, i * size, size, size, BITMAP_OPTS);
      }
      return out;
    } catch (_) {
      // The cropping overload of createImageBitmap has a patchy history on
      // Safari with a Blob source. Fall back to one full-strip decode and crop
      // each layer out of that ImageBitmap — the same overload on an already
      // decoded source, with the same options. NOT a 2D canvas: a canvas
      // backing store is premultiplied (and colour-managed) in every engine,
      // so a drawImage crop quantises or darkens every low-alpha layer.
      _releaseStrip(out);
      const full = await createImageBitmap(blob, BITMAP_OPTS);
      const alt = new Array(MAT_LAYERS);
      try {
        let n = 0;
        for (let i = 0; i < MAT_LAYERS; i++) {
          if (!present[i]) continue;
          if (n++) await _yieldDecode();
          alt[i] = await createImageBitmap(full, 0, i * size, size, size, BITMAP_OPTS);
        }
        return alt;
      } catch (e) {
        _releaseStrip(alt);
        throw e;
      } finally {
        if (full.close) { try { full.close(); } catch { /* already closed/detached: nothing left to free */ } }
      }
    }
  }

  // Raw RGBA8 bytes of each layer, straight alpha, no colour management — the
  // bytes GLX's texSubImage3D samples. For backends that need pixels rather
  // than a TexImageSource (TLX's DataArrayTexture, WGX's writeTexture).
  // A 2D canvas cannot do this: drawImage()+getImageData() premultiplies
  // through the backing store and colour-manages (tlx.js createTextureArray
  // has the 2026-08-17 measurement). One session-scoped scratch WebGL2
  // context uploads each layer with every unpack conversion off and reads
  // it back from an FBO — creating/losing a context per pack was a multi-
  // second SwiftShader stall (static audit 2026-10-05 #5).
  // `data` holds n pages of size*size*4; returns the indices it wrote.
  let _scratchGl = null;   // { cv, gl, tex, fbo, size, view, page }
  function _ensureScratchGl(size) {
    const page = size * size * 4;
    if (_scratchGl && _scratchGl.gl && !_scratchGl.gl.isContextLost()) {
      if (_scratchGl.size !== size) {
        _scratchGl.cv.width = size;
        _scratchGl.cv.height = size;
        _scratchGl.size = size;
        _scratchGl.page = page;
        _scratchGl.view = null;
      }
      return _scratchGl;
    }
    let cv = null;
    try {
      cv = (typeof OffscreenCanvas !== "undefined")
        ? new OffscreenCanvas(size, size)
        : Object.assign(document.createElement("canvas"), { width: size, height: size });
    } catch (_) { return null; }
    const gl = cv.getContext("webgl2", { premultipliedAlpha: false, antialias: false });
    if (!gl) return null;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    _scratchGl = { cv, gl, tex, fbo, size, page, view: null };
    return _scratchGl;
  }
  function readLayerBytes(size, images, n, data) {
    const page = size * size * 4;
    const done = [];
    const pending = [];
    for (let i = 0; i < n; i++) {
      const img = images[i];
      if (!img) continue;
      // ArrayBuffer.isView, not instanceof: a byte layer may come from another realm.
      const raw = (ArrayBuffer.isView(img) && img.BYTES_PER_ELEMENT === 1) ? img
        : (typeof ImageData !== "undefined" && img instanceof ImageData) ? img.data : null;
      if (raw) {
        if (raw.length >= page) { data.set(raw.subarray(0, page), i * page); done.push(i); }
      } else pending.push(i);
    }
    if (!pending.length) return done;
    const scratch = _ensureScratchGl(size);
    if (!scratch) return done;
    const { gl, tex, fbo } = scratch;
    // One reusable view onto `data` (rebuilt when the destination buffer or
    // page size changes) — avoids a fresh Uint8Array wrapper per layer.
    let view = scratch.view;
    if (!view || view.buffer !== data.buffer || view.byteOffset !== data.byteOffset ||
        scratch.page !== page) {
      view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      scratch.view = view;
      scratch.page = page;
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (const i of pending) {
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) continue;
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE,
          view.subarray(i * page, i * page + page));
        done.push(i);
      } catch (_) { /* one bad layer must not sink the pack (GLX parity) */ }
    }
    return done.sort((a, b) => a - b);
  }

  function _releaseStrip(imgs) {
    if (!imgs) return;
    for (const b of imgs) { if (b && b.close) { try { b.close(); } catch { /* already closed/detached: nothing left to free */ } } }
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

  // ONE more try per session after a failed load. Boot asks once, at idle, so a
  // single dropped manifest/strip request used to leave every race of the
  // session on procedural materials. game.js calls this at race entry and never
  // awaits it. No retry for an unsupported backend ("backend"), after an
  // explicit unload(), while a load is in flight, or once the pack is up.
  let _retried = false;
  function retry() {
    if (_retried || _uploaded || _loadPromise || _tier !== "off" || !_err || _err === "backend") return false;
    _retried = true;
    Log.info("assets", "retrying the material pack after: " + _err);
    load();
    return true;
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
      // Start both downloads together; decode and upload remain sequential.
      // The NORMAL strip is optional: its fetch and decode fail on their own
      // (normal = null, albedo still ships) — sharing the albedo's Promise.all
      // let a missing normal strip discard the whole pack (_tier "off").
      const [albedoBlob, normalBlob] = await Promise.all([
        _fetchStrip(variant.albedo),
        variant.normal ? _fetchStrip(variant.normal).catch(() => null) : null,
      ]);
      if (generation !== _loadGeneration) return false;
      albedo = await _decodeStrip(albedoBlob, size, present);
      if (generation !== _loadGeneration) {
        _discardLoad(albedo, normal, albedoTex, normalTex);
        return false;
      }
      albedoTex = _gfx.createTextureArray(size, albedo, MAT_LAYERS);
      if (!albedoTex) throw new Error("albedo-upload");
      if (normalBlob) {
        try { normal = await _decodeStrip(normalBlob, size, present); }
        catch (_) { normal = null; }   // undecodable normal strip: albedo alone
        if (generation !== _loadGeneration) {
          _discardLoad(albedo, normal, albedoTex, normalTex);
          return false;
        }
        if (normal) normalTex = _gfx.createTextureArray(size, normal, MAT_LAYERS);
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
    _retried = true;   // an explicit off (__apex.assetLoad(false)) is never undone behind its back
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
  // 1.60 MB (each circuit's own set is fetched before its build: modelsReady
  // in js/core/lazy-bundles.js ensureScenery). The quantisation is chosen against what the models actually
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

  // Ids of pack models a scenery closure's SOURCE names as a quoted literal
  // ("kenney_ind_building-a"). Every bakedModel caller spells its ids that way
  // (the circuit files are data, served unminified), so scanning the closure's
  // own text is the per-circuit model list without a generated table to drift.
  // Over-inclusion only costs a fetch; a computed id would be missed and keep
  // its procedural fallback.
  function _idsNamedIn(m, src) {
    const out = [];
    if (!m || !m.models || !src) return out;
    const seen = Object.create(null);
    const re = /["'`]([^"'`\s\\]+)["'`]/g;
    let r;
    while ((r = re.exec(src)) !== null) {
      const id = r[1];
      if (!seen[id] && Object.prototype.hasOwnProperty.call(m.models, id)) { seen[id] = 1; out.push(id); }
    }
    return out;
  }

  // The same ids, synchronously, from the manifest already loaded (empty before
  // it lands): which of a circuit's models a build would stamp, compared BY ID
  // between the page and the build worker (js/track/build-client.js).
  function modelIds(src) { return _idsNamedIn(_manifest, src ? String(src) : ""); }

  // Fetch the models one scenery closure needs (src = its source text).
  // Resolves to how many of them are resident. No pack, or a closure that names
  // no model, resolves 0 without a model fetch.
  async function loadModelsFor(src) {
    if (!src) return 0;
    const m = await manifest();
    const ids = _idsNamedIn(m, String(src));
    if (!ids.length) return 0;
    // Fetch in parallel (shared model() memos), but parse/settle one at a time
    // with a yield so a multi-model scenery set does not glue one long task
    // onto race entry / flyby build.
    const pending = ids.map((id) => model(id));
    let n = 0;
    for (let i = 0; i < pending.length; i++) {
      if (i) await _yieldDecode();
      if (await pending[i]) n++;
    }
    return n;
  }

  // Prefetch EVERY model in the pack. Resolves to the number now resident.
  // The game no longer calls this (a build loads its own circuit's set through
  // modelsReady(ms, src)); tools/shot/* still do, to frame any baked model.
  // Memoised: one run, joined by every caller.
  let _modelsPromise = null;
  function loadModels() {
    if (_modelsPromise) return _modelsPromise;
    _modelsPromise = (async () => {
      const m = await manifest();
      if (!m || !m.models) return 0;
      await Promise.all(Object.keys(m.models).map((id) => model(id)));
      return Object.keys(_models).reduce((n, k) => n + (_models[k] ? 1 : 0), 0);
    })();
    return _modelsPromise;
  }

  // "The pack has landed, or we stopped waiting for it": the promise a track
  // build awaits before it places props. Prop placement is SYNCHRONOUS (the
  // circuit's scenery() callback calls bakedModel, which reads modelSync), so
  // until 2026-10-01 a build that ran before loadModels() settled got the box
  // fallback for every baked model, for the whole session — a service-worker
  // boot or a deep link reached the first build in well under the fetch time.
  // Never rejects; a missing or failing pack resolves 0 at once, a hanging
  // fetch resolves at the timeout so an offline boot still builds the track.
  // With `src` (a scenery closure's source text, see loadModelsFor) it waits on
  // only the models that closure names: 29 of 77 across five circuits, none
  // for the rest, which resolve at once. Without it, the whole pack.
  function modelsReady(timeoutMs, src) {
    if (src !== undefined && !src) return Promise.resolve(0);
    const run = (src !== undefined ? loadModelsFor(src) : loadModels()).catch(() => 0);
    const ms = timeoutMs > 0 ? timeoutMs : 4000;
    let timer = null;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(-1), ms); });
    return Promise.race([run, late]).then((n) => { clearTimeout(timer); return n; });
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

  return { init, supported, manifest, load, retry, unload, adopt, state, readLayerBytes,
           model, modelSync, models, modelIds, loadModels, loadModelsFor, modelsReady, env, credits, MAT_LAYERS };
})();

// No-build global export.
if (typeof window !== "undefined") window.Assets = Assets;
