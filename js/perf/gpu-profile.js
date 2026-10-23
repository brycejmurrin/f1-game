/* Apex 26 — GpuProfile: pipeline/shader compile counter + per-pass GPU timing.
 *
 * Opt-in only (?apex in the URL). Zero cost when absent: every public entry
 * returns after one boolean check. Exposed as gfx.gpuProfile() from TLX
 * (js/render/three/tlx.js). __apex.gpuProfile()/diag() wiring waits on #3479
 * (js/agent/apex.js HELD) — call gfx.gpuProfile() directly until then.
 *
 * Counts createRenderPipeline / createComputePipeline / createShaderModule /
 * createProgram tagged by phase (menu-warm / loading / race). A create during
 * a race frame is flagged missedWarm. Per-pass CPU wall times for scene /
 * shadow / post / mirror feed the same snapshot. Buffer create tracking
 * (live bytes/count + failing descriptor size) and mirrorPrepare real elapsed
 * (vs the 30 s safety floor) land in the ring for the next iPhone 14 run.
 *
 * Global: GpuProfile. */
const GpuProfile = (() => {
  "use strict";

  const PHASES = { "menu-warm": 1, loading: 1, race: 1 };
  const PASS_NAMES = ["scene", "shadow", "post", "mirror"];
  const COMPILE_KINDS = ["renderPipeline", "computePipeline", "shaderModule", "program"];
  const RING = 32;
  const BUF_RING = 16;

  let _on = null;   // null until first enabled() probe
  let _phase = "menu-warm";
  let _compiles = [];
  let _compileCounts = Object.create(null);
  let _missedWarm = 0;
  let _passOpen = Object.create(null);
  let _passLast = Object.create(null);
  let _passSum = Object.create(null);
  let _passN = Object.create(null);
  let _passMax = Object.create(null);
  let _liveBufCount = 0;
  let _liveBufBytes = 0;
  let _bufFails = 0;
  let _bufFailRing = [];
  let _mirrorPrep = { lastElapsedMs: -1, timeoutHits: 0, lastTimedOut: false, samples: 0 };

  function now() {
    try { return performance.now(); } catch (_) { return Date.now(); }
  }

  function urlWantsApex() {
    try {
      const q = typeof location !== "undefined" && location.search ? String(location.search) : "";
      return /[?&](apex|debug|report)(=|&|$)/.test(q);
    } catch (_) { return false; }
  }

  function enabled() {
    if (_on === null) _on = urlWantsApex();
    return !!_on;
  }

  /** Test / probe override. Pass undefined to re-read the URL. */
  function setEnabled(v) {
    if (v === undefined) { _on = null; return enabled(); }
    _on = !!v;
    return _on;
  }

  function setPhase(p) {
    if (!PHASES[p]) return _phase;
    _phase = p;
    return _phase;
  }

  function phase() { return _phase; }

  /** Current phase. Callers (tlx / race entry) use setPhase — no bare G read
   * (global-registry: G is a game.js assign, not a manifest global). */
  function inferPhase() {
    return _phase;
  }

  function noteCompile(kind, ms) {
    if (!enabled()) return;
    const k = COMPILE_KINDS.indexOf(kind) >= 0 ? kind : "other";
    const ph = inferPhase();
    const missedWarm = ph === "race";
    if (missedWarm) _missedWarm++;
    _compileCounts[k] = (_compileCounts[k] || 0) + 1;
    _compileCounts[ph] = (_compileCounts[ph] || 0) + 1;
    if (_compiles.length >= RING) _compiles.shift();
    _compiles.push({
      kind: k,
      phase: ph,
      ms: ms == null ? -1 : +(+ms).toFixed(3),
      t: +now().toFixed(2),
      missedWarm: !!missedWarm,
    });
  }

  function wrapDevice(device) {
    if (!enabled() || !device || device.__apexGpuProfile) return false;
    const kinds = [
      ["createRenderPipeline", "renderPipeline"],
      ["createComputePipeline", "computePipeline"],
      ["createShaderModule", "shaderModule"],
    ];
    let any = false;
    for (let i = 0; i < kinds.length; i++) {
      const method = kinds[i][0], tag = kinds[i][1];
      if (typeof device[method] !== "function") continue;
      const orig = device[method].bind(device);
      device[method] = function () {
        const t0 = now();
        try { return orig.apply(device, arguments); }
        finally { noteCompile(tag, now() - t0); }
      };
      any = true;
    }
    if (any) device.__apexGpuProfile = true;
    return any;
  }

  function wrapGl(gl) {
    if (!enabled() || !gl || gl.__apexGpuProfile) return false;
    if (typeof gl.createProgram !== "function") return false;
    const orig = gl.createProgram.bind(gl);
    gl.createProgram = function () {
      const t0 = now();
      try { return orig.apply(gl, arguments); }
      finally { noteCompile("program", now() - t0); }
    };
    gl.__apexGpuProfile = true;
    return true;
  }

  function passBegin(name) {
    if (!enabled()) return;
    if (PASS_NAMES.indexOf(name) < 0) return;
    _passOpen[name] = now();
  }

  function passEnd(name) {
    if (!enabled()) return;
    const t0 = _passOpen[name];
    if (t0 == null || t0 < 0) return;
    const d = now() - t0;
    _passOpen[name] = -1;
    _passLast[name] = d;
    _passSum[name] = (_passSum[name] || 0) + d;
    _passN[name] = (_passN[name] || 0) + 1;
    if (!(_passMax[name] >= d)) _passMax[name] = d;
  }

  function noteBufferCreate(size) {
    if (!enabled()) return;
    const n = size | 0;
    if (n < 0) return;
    _liveBufCount++;
    _liveBufBytes += n;
  }

  function noteBufferFail(desc) {
    if (!enabled()) return;
    _bufFails++;
    const size = desc && typeof desc.size === "number" ? desc.size | 0 : -1;
    const row = {
      t: +now().toFixed(2),
      size: size,
      liveCount: _liveBufCount,
      liveBytes: _liveBufBytes,
      label: desc && desc.label ? String(desc.label).slice(0, 64) : "",
    };
    if (_bufFailRing.length >= BUF_RING) _bufFailRing.shift();
    _bufFailRing.push(row);
    try {
      if (typeof Log !== "undefined" && Log.warn) {
        Log.warn("gfx", "GpuProfile: createBuffer failed size=" + size
          + " live=" + _liveBufCount + "/" + _liveBufBytes + "B");
      }
    } catch (_) { /* Log optional */ }
  }

  function noteMirrorPrepare(info) {
    if (!enabled()) return;
    const elapsed = info && info.elapsedMs != null ? +info.elapsedMs : -1;
    const timedOut = !!(info && info.timedOut);
    _mirrorPrep.lastElapsedMs = elapsed;
    _mirrorPrep.lastTimedOut = timedOut;
    _mirrorPrep.samples++;
    if (timedOut) _mirrorPrep.timeoutHits++;
  }

  function passStats() {
    const out = Object.create(null);
    for (let i = 0; i < PASS_NAMES.length; i++) {
      const n = PASS_NAMES[i];
      const c = _passN[n] || 0;
      out[n] = {
        lastMs: _passLast[n] != null ? +(+_passLast[n]).toFixed(3) : -1,
        n: c,
        meanMs: c ? +((_passSum[n] / c).toFixed(3)) : -1,
        maxMs: _passMax[n] != null ? +(+_passMax[n]).toFixed(3) : -1,
      };
    }
    return out;
  }

  function snapshot() {
    return {
      on: enabled(),
      phase: _phase,
      compiles: {
        total: (_compileCounts.renderPipeline || 0)
          + (_compileCounts.computePipeline || 0)
          + (_compileCounts.shaderModule || 0)
          + (_compileCounts.program || 0),
        byKind: {
          renderPipeline: _compileCounts.renderPipeline || 0,
          computePipeline: _compileCounts.computePipeline || 0,
          shaderModule: _compileCounts.shaderModule || 0,
          program: _compileCounts.program || 0,
        },
        byPhase: {
          "menu-warm": _compileCounts["menu-warm"] || 0,
          loading: _compileCounts.loading || 0,
          race: _compileCounts.race || 0,
        },
        missedWarm: _missedWarm,
        recent: _compiles.slice(),
      },
      passes: passStats(),
      buffers: {
        liveCount: _liveBufCount,
        liveBytes: _liveBufBytes,
        failCount: _bufFails,
        failRing: _bufFailRing.slice(),
      },
      mirrorPrepare: {
        lastElapsedMs: _mirrorPrep.lastElapsedMs,
        timeoutHits: _mirrorPrep.timeoutHits,
        lastTimedOut: _mirrorPrep.lastTimedOut,
        samples: _mirrorPrep.samples,
      },
    };
  }

  function reset() {
    _compiles = [];
    _compileCounts = Object.create(null);
    _missedWarm = 0;
    _passOpen = Object.create(null);
    _passLast = Object.create(null);
    _passSum = Object.create(null);
    _passN = Object.create(null);
    _passMax = Object.create(null);
    _liveBufCount = 0;
    _liveBufBytes = 0;
    _bufFails = 0;
    _bufFailRing = [];
    _mirrorPrep = { lastElapsedMs: -1, timeoutHits: 0, lastTimedOut: false, samples: 0 };
  }

  return {
    enabled: enabled,
    setEnabled: setEnabled,
    setPhase: setPhase,
    phase: phase,
    inferPhase: inferPhase,
    noteCompile: noteCompile,
    wrapDevice: wrapDevice,
    wrapGl: wrapGl,
    passBegin: passBegin,
    passEnd: passEnd,
    noteBufferCreate: noteBufferCreate,
    noteBufferFail: noteBufferFail,
    noteMirrorPrepare: noteMirrorPrepare,
    snapshot: snapshot,
    reset: reset,
  };
})();

if (typeof window !== "undefined") window.GpuProfile = GpuProfile;
