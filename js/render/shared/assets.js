"use strict";

const Assets = (function () {
  const PACK_DIR = "assets/pack/";
  const MANIFEST = PACK_DIR + "manifest.json";
  const MAT_LAYERS = 17;

  let _gfx = null;
  let _manifest = null;
  let _manifestPromise = null;
  let _loadPromise = null;
  let _loadGeneration = 0;
  let _uploaded = false;
  let _err = null;
  let _bytes = 0;
  let _tier = null;
  const _models = Object.create(null);
  const _modelPromises = Object.create(null);
  const _requests = new Set();
  const TIMED_OUT = "timed out";
  const REQUEST_MS = 15000;

  function _request(url, body) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    let timer = null, cancel;
    const deadline = new Promise((_, reject) => {
      cancel = (why) => { if (controller) controller.abort(); reject(new Error("asset request " + (why === TIMED_OUT ? why : "canceled") + ": " + url)); };
      if (typeof setTimeout === "function" && typeof clearTimeout === "function") timer = setTimeout(() => cancel(TIMED_OUT), REQUEST_MS);
    });
    _requests.add(cancel);
    const work = (async () => {
      const res = await fetch(url, controller ? { signal: controller.signal } : {});
      if (!res.ok) throw new Error("fetch " + url);
      return res[body]();
    })();
    let settled = false;
    const raced = Promise.race([work, deadline]).finally(() => {
      settled = true;
      if (timer !== null) clearTimeout(timer);
      _requests.delete(cancel);
    });
    raced.cancel = () => { if (!settled) cancel(); };
    return raced;
  }

  function init(gfx) { _gfx = gfx || null; }

  function supported() {
    return !!(_gfx && typeof _gfx.createTextureArray === "function" &&
              typeof _gfx.setMaterialMaps === "function");
  }


  function manifest() {
    if (_manifest !== null) return Promise.resolve(_manifest);
    if (!_manifestPromise) {
      const generation = _loadGeneration;
      const request = _fetchManifest(generation);
      const tracked = request.finally(() => {
        if (_manifestPromise === tracked) _manifestPromise = null;
      });
      _manifestPromise = tracked;
    }
    return _manifestPromise;
  }

  function _packUrl(file, md5) {
    return PACK_DIR + file + (typeof md5 === "string" && /^[0-9a-f]{32}$/.test(md5) ? "?h=" + md5 : "");
  }

  async function _fetchManifest(generation) {
    try {
      const j = await _request(MANIFEST, "json");
      if (generation !== _loadGeneration) return false;
      if (!j || typeof j !== "object") { _err = "bad-manifest"; return false; }
      _manifest = j;
      rememberPack(j);
      return j;
    } catch (e) {
      if (generation === _loadGeneration) _err = "no-pack";
      return false;
    }
  }


  async function _fetchStrip(file, md5, generation) {
    const blob = await _request(_packUrl(file, md5), "blob");
    if (generation !== _loadGeneration) return null;
    _bytes += blob.size;
    return blob;
  }

  const BITMAP_OPTS = Object.freeze({ premultiplyAlpha: "none", colorSpaceConversion: "none" });

  function _yieldDecode() {
    try {
      if (typeof scheduler !== "undefined" && scheduler && typeof scheduler.yield === "function") {
        return scheduler.yield();
      }
    } catch (_) {  }
    if (typeof setTimeout === "function") {
      return new Promise((resolve) => { setTimeout(resolve, 0); });
    }
    return Promise.resolve();
  }

  const DECODE_CANCELED = Symbol("asset decode canceled");

  async function _inflate(parts, needed) {
    const out = new Uint8Array(needed);
    const ds = new DecompressionStream("deflate");
    const w = ds.writable.getWriter();
    const wrote = (async () => { for (const p of parts) await w.write(p); await w.close(); })();
    wrote.catch(() => {});
    let n = 0;
    const r = ds.readable.getReader();
    for (;;) {
      const { done, value } = await r.read();
      if (done) break;
      const take = Math.min(value.length, needed - n);
      if (take > 0) { out.set(value.subarray(0, take), n); n += take; }
    }
    await wrote;
    return n === needed ? out : out.subarray(0, n);
  }
  function _unfilterRows(raw, out, stride, r0, r1) {
    for (let r = r0; r < r1; r++) {
      const ft = raw[r * (stride + 1)], s = r * (stride + 1) + 1, o = r * stride, u = o - stride;
      if (ft === 0 || (ft === 2 && r === 0)) { out.set(raw.subarray(s, s + stride), o); continue; }
      if (ft === 1) {
        for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + (x >= 4 ? out[o + x - 4] : 0);
      } else if (ft === 2) {
        for (let x = 0; x < stride; x++) out[o + x] = raw[s + x] + out[u + x];
      } else if (ft === 3) {
        for (let x = 0; x < stride; x++) {
          const a = x >= 4 ? out[o + x - 4] : 0, b = r ? out[u + x] : 0;
          out[o + x] = raw[s + x] + ((a + b) >> 1);
        }
      } else if (ft === 4) {
        for (let x = 0; x < stride; x++) {
          const a = x >= 4 ? out[o + x - 4] : 0, b = r ? out[u + x] : 0, c = x >= 4 && r ? out[u + x - 4] : 0;
          const p = a + b - c, pa = p > a ? p - a : a - p, pb = p > b ? p - b : b - p, pc = p > c ? p - c : c - p;
          out[o + x] = raw[s + x] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
      } else throw new Error("png filter " + ft);
    }
  }
  async function _decodeStripBytes(blob, size, present, check) {
    if (typeof DecompressionStream !== "function" || !blob || typeof blob.arrayBuffer !== "function") return null;
    const png = new Uint8Array(await blob.arrayBuffer());
    check();
    const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (png[i] !== SIG[i]) return null;
    const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
    let w = 0, h = 0, ok = false;
    const idat = [];
    for (let p = 8; p + 8 <= png.length;) {
      const len = dv.getUint32(p), d = p + 8;
      const type = String.fromCharCode(png[p + 4], png[p + 5], png[p + 6], png[p + 7]);
      if (d + len > png.length) return null;
      if (type === "IHDR") {
        w = dv.getUint32(d); h = dv.getUint32(d + 4);
        ok = png[d + 8] === 8 && png[d + 9] === 6 && png[d + 10] === 0 && png[d + 11] === 0 && png[d + 12] === 0;
      } else if (type === "IDAT") idat.push(png.subarray(d, d + len));
      else if (type === "IEND") break;
      else if (!(png[p + 4] & 0x20) || type === "iCCP" || type === "sRGB" || type === "gAMA" || type === "cHRM") return null;
      p = d + len + 4;
    }
    let last = -1;
    for (let i = 0; i < MAT_LAYERS; i++) if (present[i]) last = i;
    if (!ok || w !== size || !idat.length || last < 0 || h < (last + 1) * size) return null;
    const raw = await _inflate(idat, (last + 1) * size * (w * 4 + 1));
    check();
    const stride = w * 4, rows = (last + 1) * size;
    if (raw.length < rows * (stride + 1)) return null;
    const pix = new Uint8Array(rows * stride);
    const out = new Array(MAT_LAYERS);
    for (let i = 0; i <= last; i++) {
      if (i) { await _yieldDecode(); check(); }
      _unfilterRows(raw, pix, stride, i * size, (i + 1) * size);
      if (present[i]) out[i] = pix.subarray(i * size * stride, (i + 1) * size * stride);
    }
    return out;
  }

  async function _decodeStrip(blob, size, present, current) {
    const check = () => { if (current && !current()) throw DECODE_CANCELED; };
    let bytes = null;
    try { if (typeof BitmapDecode !== "undefined" && BitmapDecode.stripEnabled()) { bytes = await BitmapDecode.strip(blob, size, present); check(); } }
    catch (error) { if (error === DECODE_CANCELED) throw error; bytes = null; }
    if (!bytes) try { bytes = await _decodeStripBytes(blob, size, present, check); }
    catch (error) { if (error === DECODE_CANCELED) throw error; bytes = null; }
    if (bytes) return bytes;
    const out = new Array(MAT_LAYERS);
    try {
      let n = 0;
      for (let i = 0; i < MAT_LAYERS; i++) {
        if (!present[i]) continue;
        check();
        if (n++) await _yieldDecode();
        check();
        out[i] = await createImageBitmap(blob, 0, i * size, size, size, BITMAP_OPTS);
        check();
      }
      return out;
    } catch (error) {
      _releaseStrip(out);
      if (error === DECODE_CANCELED) throw error;
      check();
      const full = await createImageBitmap(blob, BITMAP_OPTS);
      const alt = new Array(MAT_LAYERS);
      try {
        check();
        let n = 0;
        for (let i = 0; i < MAT_LAYERS; i++) {
          if (!present[i]) continue;
          check();
          if (n++) await _yieldDecode();
          check();
          alt[i] = await createImageBitmap(full, 0, i * size, size, size, BITMAP_OPTS);
          check();
        }
        return alt;
      } catch (e) {
        _releaseStrip(alt);
        throw e;
      } finally {
        if (full.close) { try { full.close(); } catch {  } }
      }
    }
  }

  let _scratchGl = null;
  function _ensureScratchGl(size) {
    if (_scratchGl && _scratchGl.gl && !_scratchGl.gl.isContextLost()) {
      if (_scratchGl.size !== size) {
        _scratchGl.cv.width = size;
        _scratchGl.cv.height = size;
        _scratchGl.size = size;
      }
      return _scratchGl;
    }
    const attrs = { premultipliedAlpha: false, antialias: false };
    const tryCanvas = (make) => {
      try { const c = make(); const g = c && c.getContext("webgl2", attrs); return g ? { cv: c, gl: g } : null; }
      catch (_) { return null; }
    };
    const got = (typeof OffscreenCanvas !== "undefined" && tryCanvas(() => new OffscreenCanvas(size, size)))
      || (typeof document !== "undefined" && tryCanvas(() => Object.assign(document.createElement("canvas"), { width: size, height: size })));
    if (!got) return null;
    const { cv, gl } = got;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    const tex = gl.createTexture();
    const fbo = gl.createFramebuffer();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    _scratchGl = { cv, gl, tex, fbo, size };
    return _scratchGl;
  }
  function deferScratchReadback() {
    try {
      if (typeof PerfGov !== "undefined" && PerfGov.softwareGlUiReadbackDefer) return PerfGov.softwareGlUiReadbackDefer();
    } catch (_) {  }
    return false;
  }
  function readLayerBytes(size, images, n, data) {
    const page = size * size * 4;
    const done = [];
    const pending = [];
    for (let i = 0; i < n; i++) {
      const img = images[i];
      if (!img) continue;
      const raw = (ArrayBuffer.isView(img) && img.BYTES_PER_ELEMENT === 1) ? img
        : (typeof ImageData !== "undefined" && img instanceof ImageData) ? img.data : null;
      if (raw) {
        if (raw.length >= page) { data.set(raw.subarray(0, page), i * page); done.push(i); }
      } else pending.push(i);
    }
    if (!pending.length) return done;
    if (deferScratchReadback()) return done;
    const scratch = _ensureScratchGl(size);
    if (!scratch) return done;
    const { gl, tex, fbo } = scratch;
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const scratchErrors = () => {
      let failed = false;
      if (typeof gl.getError === "function") {
        for (let i = 0; i < 16 && gl.getError(); i++) failed = true;
      }
      return failed;
    };
    scratchErrors();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    for (const i of pending) {
      if (gl.isContextLost()) break;
      let copied = false;
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
          gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE,
            view.subarray(i * page, i * page + page));
          copied = true;
        }
      } catch (_) {  }
      const failed = scratchErrors() || gl.isContextLost();
      if (copied && !failed) done.push(i);
    }
    return done.sort((a, b) => a - b);
  }

  function readLayerBytesAsync(size, images, n, data, onLayer) {
    if (deferScratchReadback()) return null;
    const page = size * size * 4;
    const raws = [];
    const pending = [];
    for (let i = 0; i < n; i++) {
      const img = images[i];
      if (!img) continue;
      const raw = (ArrayBuffer.isView(img) && img.BYTES_PER_ELEMENT === 1) ? img
        : (typeof ImageData !== "undefined" && img instanceof ImageData) ? img.data : null;
      if (raw) { if (raw.length >= page) raws.push([i, raw]); } else pending.push(i);
    }
    const scratch = pending.length ? _ensureScratchGl(size) : null;
    const gl = scratch && scratch.gl;
    if (pending.length && (!gl || typeof gl.fenceSync !== "function" || typeof gl.clientWaitSync !== "function" ||
        typeof gl.getBufferSubData !== "function")) return null;
    const notifyLayer = (i, bytes) => {
      if (onLayer) { try { onLayer(i, bytes); } catch (_) {  } }
    };
    const done = [];
    for (const [i, raw] of raws) {
      data.set(raw.subarray(0, page), i * page); done.push(i);
      notifyLayer(i, data.subarray(i * page, (i + 1) * page));
    }
    if (!pending.length) return Promise.resolve(done);
    const { tex, fbo } = scratch;
    const view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const scratchErrors = () => {
      let failed = false;
      if (typeof gl.getError === "function") {
        for (let i = 0; i < 16 && gl.getError(); i++) failed = true;
      }
      return failed;
    };
    const slots = [];
    let sync = null;
    const freeAll = () => {
      try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } catch (_) {  }
      for (const s of slots) { try { gl.deleteBuffer(s.pbo); } catch (_) {  } }
      if (sync) { try { gl.deleteSync(sync); } catch (_) {  } }
    };
    const queueLayer = (i, checked) => {
      let pbo = null;
      if (checked) scratchErrors();
      try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          notifyLayer(i, null);
          return;
        }
        pbo = gl.createBuffer();
        if (!pbo) throw new Error("createBuffer");
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.bufferData(gl.PIXEL_PACK_BUFFER, page, gl.STREAM_READ);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, 0);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        if (checked && (scratchErrors() || gl.isContextLost())) throw new Error("readPixels");
        slots.push({ i, pbo });
      } catch (_) {
        try { gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); } catch (_) {  }
        if (pbo) { try { gl.deleteBuffer(pbo); } catch (_) {  } }
        notifyLayer(i, null);
      }
    };
    try {
      scratchErrors();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      for (const i of pending) queueLayer(i, false);
      if (scratchErrors() || gl.isContextLost()) {
        const retry = slots.splice(0);
        for (const { pbo } of retry) { try { gl.deleteBuffer(pbo); } catch (_) {  } }
        for (const { i } of retry) queueLayer(i, true);
      }
      sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      if (!sync) throw new Error("fenceSync");
    } catch (_) {
      freeAll();
      return null;
    }
    return new Promise((resolve) => {
      const ASYNC_WAIT_MS = 8000, POLL_MS = 10;
      let waited = 0;
      const finish = () => { freeAll(); resolve(done.sort((a, b) => a - b)); };
      const poll = () => {
        let r;
        try { r = gl.clientWaitSync(sync, 0, 0); } catch (_) { r = gl.WAIT_FAILED; }
        if (r === gl.TIMEOUT_EXPIRED && waited < ASYNC_WAIT_MS && !gl.isContextLost()) {
          waited += POLL_MS; setTimeout(poll, POLL_MS); return;
        }
        if (r === gl.ALREADY_SIGNALED || r === gl.CONDITION_SATISFIED) {
          scratchErrors();
          let failed = false;
          for (const { i, pbo } of slots) {
            try {
              gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
              gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, view, i * page, page);
            } catch (_) { failed = true; }
          }
          failed = scratchErrors() || gl.isContextLost() || failed;
          for (const { i, pbo } of slots) {
            if (failed) {
              scratchErrors();
              try {
                gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
                gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, view, i * page, page);
                if (scratchErrors() || gl.isContextLost()) continue;
              } catch (_) { continue; }
            }
            done.push(i);
            notifyLayer(i, view.subarray(i * page, (i + 1) * page));
          }
        }
        finish();
      };
      poll();
    });
  }

  function _releaseStrip(imgs) {
    if (!imgs) return;
    for (const b of imgs) { if (b && b.close) { try { b.close(); } catch {  } } }
  }

  function _freeTexture(t) {
    if (t && _gfx && _gfx.freeTexture) _gfx.freeTexture(t);
  }

  function _discardLoad(albedo, normal, albedoTex, normalTex) {
    _freeTexture(albedoTex); _freeTexture(normalTex);
    _releaseStrip(albedo); _releaseStrip(normal);
  }

  function _lowDataLink() {
    const c = typeof navigator !== "undefined" ? navigator.connection : null;
    return !!(c && (c.saveData || /2g$/.test(c.effectiveType || "")));
  }

  function _phoneLowPreset() {
    if (!(_gfx.isMobile || _gfx.mobileTier)) return false;
    try {
      return !(typeof GfxQuality !== "undefined" && GfxQuality.current() !== "low");
    } catch (_) { return true; }
  }

  function load(opts) {
    if (_loadPromise) return _loadPromise;
    const generation = _loadGeneration;
    const work = _load(opts || {}, generation).catch((e) => {
      if (generation === _loadGeneration) _err = (e && e.message) || "load-failed";
      return false;
    });
    _loadPromise = work.then((ok) => {
      if (!ok && generation === _loadGeneration) _loadPromise = null;
      return ok;
    });
    return _loadPromise;
  }

  let _retried = false;
  function retry() {
    if (_retried || _uploaded || _loadPromise || _tier !== "off" || !_err || _err === "backend") return false;
    _retried = true;
    Log.info("assets", "retrying the material pack after: " + _err);
    load(_err.indexOf("asset request " + TIMED_OUT) === 0 ? { tier: "low" } : undefined);
    return true;
  }

  async function _load(opts, generation) {
    if (!supported()) { _err = "backend"; _tier = "off"; return false; }
    const m = await manifest();
    if (generation !== _loadGeneration) return false;
    if (!m || !m.materials) { _tier = "off"; return false; }
    const mats = m.materials;

    const wantLow = opts.tier ? opts.tier === "low"
                              : !!(_phoneLowPreset() || _lowDataLink());
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
      const [albedoBlob, normalBlob] = await Promise.all([
        _fetchStrip(variant.albedo, variant.albedoMd5, generation),
        variant.normal ? _fetchStrip(variant.normal, variant.normalMd5, generation).catch(() => null) : null,
      ]);
      if (generation !== _loadGeneration || !albedoBlob) return false;
      albedo = await _decodeStrip(albedoBlob, size, present, () => generation === _loadGeneration);
      if (generation !== _loadGeneration) {
        _discardLoad(albedo, normal, albedoTex, normalTex);
        return false;
      }
      let normalP = null;
      if (normalBlob) {
        normalP = _decodeStrip(normalBlob, size, present, () => generation === _loadGeneration)
          .then((v) => v, (error) => { if (error === DECODE_CANCELED) throw error; return null; });
      }
      const quietNormal = () => { if (normalP) normalP.then(() => {}, () => {}); };
      albedoTex = _gfx.createTextureArray(size, albedo, MAT_LAYERS);
      if (!albedoTex) { quietNormal(); throw new Error("albedo-upload"); }
      if (albedoTex.ready && !(await albedoTex.ready)) { quietNormal(); throw new Error("albedo-upload"); }
      if (normalP) {
        normal = await normalP;
        if (generation !== _loadGeneration) {
          _discardLoad(albedo, normal, albedoTex, normalTex);
          return false;
        }
        if (normal) normalTex = _gfx.createTextureArray(size, normal, MAT_LAYERS);
      }
      if (normalTex && normalTex.ready && !(await normalTex.ready)) { _freeTexture(normalTex); normalTex = null; }
      if (generation !== _loadGeneration) {
        _discardLoad(albedo, normal, albedoTex, normalTex);
        return false;
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

  function adopt(size, albedoImgs, normalImgs, scales) {
    if (!supported() || !size || !albedoImgs) { _err = "adopt-unsupported"; return state(); }
    _loadGeneration++;
    for (const cancel of _requests) cancel();
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
    for (const cancel of _requests) cancel();
    _retried = true;
    if (_gfx && _gfx.setMaterialMaps) _gfx.setMaterialMaps(null);
    _manifest = null;
    _manifestPromise = null;
    _modelsPromise = null;
    for (const id of Object.keys(_models)) delete _models[id];
    for (const id of Object.keys(_modelPromises)) delete _modelPromises[id];
    _bytes = 0;
    _uploaded = false;
    _tier = "off";
    _loadPromise = null;
  }


  const SWAY_FRAC = 0.45;
  function _parseModel(buf) {
    const dv = new DataView(buf);
    if (dv.byteLength < 20) return null;
    if (dv.getUint8(0) !== 0x41 || dv.getUint8(1) !== 0x58 ||
        dv.getUint8(2) !== 0x32 || dv.getUint8(3) !== 0x36) return null;
    const ver = dv.getUint32(4, true);
    if (ver !== 1 && ver !== 2 && ver !== 3) return null;
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
    const need = o + nv * 12 + nv * 6 + nv * 3 + nv + ni * 2 + (ver === 3 ? nv : 0);
    if (dv.byteLength < need) return null;
    const pos = new Float32Array(buf, o, nv * 3).slice(); o += nv * 12;
    const qn = new Int16Array(buf, o, nv * 3);     o += nv * 6;
    const qc = new Uint8Array(buf, o, nv * 3);     o += nv * 3;
    const qm = new Uint8Array(buf, o, nv);         o += nv;
    const idx = new Uint16Array(buf, o, ni).slice(); o += ni * 2;
    const nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3);
    const mat = new Float32Array(nv);
    for (let i = 0; i < nv * 3; i++) { nrm[i] = qn[i] / 32767; col[i] = qc[i] / 255; }
    if (ver === 3) {
      const sway = new Uint8Array(buf, o, nv);
      for (let i = 0; i < nv; i++) mat[i] = qm[i] + (sway[i] / 255) * SWAY_FRAC;
    } else {
      for (let i = 0; i < nv; i++) mat[i] = qm[i];
    }
    return { pos, nrm, col, mat, idx };
  }

  let _modelDecodeTail = Promise.resolve();
  function _decodeModel(buf, generation) {
    const job = _modelDecodeTail.then(async () => {
      if (generation !== _loadGeneration) return null;
      await _yieldDecode();
      if (generation !== _loadGeneration) return null;
      const parsed = _parseModel(buf);
      return generation === _loadGeneration ? parsed : null;
    });
    _modelDecodeTail = job.then(() => null, () => null);
    return job;
  }

  let _packIndex;
  function packIndex() {
    if (_packIndex !== undefined) return _packIndex;
    _packIndex = null;
    try {
      const j = JSON.parse(localStorage.getItem("apex26.packIndex") || "null");
      if (j && j.models && typeof j.models === "object") _packIndex = j;
    } catch (e) {  }
    return _packIndex;
  }
  function rememberPack(m) {
    if (!m) return;
    const models = {}, live = m.models || {};
    for (const id in live) {
      const rec = live[id];
      if (!rec || typeof rec.file !== "string" || !/^[0-9a-f]{32}$/.test(rec.md5 || "")) continue;
      models[id] = { file: rec.file, md5: rec.md5 };
    }
    _packIndex = { models };
    try { localStorage.setItem("apex26.packIndex", JSON.stringify(_packIndex)); }
    catch (e) {  }
  }
  function model(id) {
    if (id in _models) return Promise.resolve(_models[id]);
    if (_modelPromises[id]) return _modelPromises[id];
    const generation = _loadGeneration;
    const hinted = packIndex();
    const guess = hinted && hinted.models && hinted.models[id];
    let early = null;
    if (guess && guess.file) {
      early = _request(_packUrl(guess.file, guess.md5), "arrayBuffer");
      early.catch(() => {});
      early.file = guess.file; early.md5 = guess.md5;
    }
    const promise = (async () => {
      try {
        const m = await manifest();
        if (generation !== _loadGeneration) { if (early) early.cancel(); return null; }
        const rec = m && m.models && m.models[id];
        if (!rec || !rec.file) { if (early) early.cancel(); if (m) _models[id] = null; return null; }
        let body = null;
        if (early && early.file === rec.file && early.md5 === rec.md5) {
          try { body = await early; } catch (e) { body = null; }
        } else if (early) early.cancel();
        if (!body) body = await _request(_packUrl(rec.file, rec.md5), "arrayBuffer");
        if (generation !== _loadGeneration) return null;
        const parsed = await _decodeModel(body, generation);
        if (parsed && generation === _loadGeneration) _models[id] = parsed;
        return parsed;
      } catch (_) {
        return null;
      } finally {
        if (_modelPromises[id] === promise) delete _modelPromises[id];
      }
    })();
    _modelPromises[id] = promise;
    return promise;
  }

  function models() {
    return _manifest && _manifest.models ? Object.keys(_manifest.models) : [];
  }

  function modelSync(id) { return _models[id] || null; }

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

  function modelIds(src) { return _idsNamedIn(_manifest, src ? String(src) : ""); }

  async function loadModelsFor(src) {
    if (!src) return 0;
    const generation = _loadGeneration;
    const text = String(src);
    const hinted = _idsNamedIn(packIndex(), text);
    for (let i = 0; i < hinted.length; i++) model(hinted[i]);
    const m = await manifest();
    if (generation !== _loadGeneration) return 0;
    const ids = _idsNamedIn(m, text);
    if (!ids.length) return 0;
    const pending = ids.map((id) => model(id));
    let n = 0;
    for (let i = 0; i < pending.length; i++) {
      if (await pending[i]) n++;
    }
    return generation === _loadGeneration ? n : 0;
  }

  let _modelsPromise = null;
  function loadModels() {
    if (_modelsPromise) return _modelsPromise;
    const generation = _loadGeneration;
    const work = (async () => {
      const m = await manifest();
      if (generation !== _loadGeneration || !m || !m.models) return 0;
      await Promise.all(Object.keys(m.models).map((id) => model(id)));
      if (generation !== _loadGeneration) return 0;
      return Object.keys(_models).reduce((n, k) => n + (_models[k] ? 1 : 0), 0);
    })();
    const tracked = work.finally(() => { if (_modelsPromise === tracked) _modelsPromise = null; });
    _modelsPromise = tracked;
    return _modelsPromise;
  }

  function modelsReady(timeoutMs, src) {
    if (src !== undefined && !src) return Promise.resolve(0);
    const run = (src !== undefined ? loadModelsFor(src) : loadModels()).catch(() => 0);
    const ms = timeoutMs > 0 ? timeoutMs : 4000;
    let timer = null;
    const late = new Promise((resolve) => { timer = setTimeout(() => resolve(-1), ms); });
    return Promise.race([run, late]).then((n) => { clearTimeout(timer); return n; });
  }


  function env(trackId, tod) {
    const m = _manifest;
    if (!m || !m.env) return null;
    return m.env[trackId + "|" + tod] || m.env["*|" + tod] || null;
  }


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

  return { init, supported, manifest, load, retry, unload, adopt, state, readLayerBytes, readLayerBytesAsync,
           model, modelSync, models, modelIds, loadModels, loadModelsFor, modelsReady, env, credits, MAT_LAYERS };
})();

if (typeof window !== "undefined") window.Assets = Assets;
