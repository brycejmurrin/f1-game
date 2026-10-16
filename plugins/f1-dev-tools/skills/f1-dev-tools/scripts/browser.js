/* Load with a browser evaluate call on a local Apex 26 page. No network or storage writes. */
(() => {
  "use strict";
  const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
  function api() {
    const a = globalThis.__apex;
    if (!a || typeof a.agentHelp !== "function") throw new Error("Open the local F1 game and wait for __apex.");
    return a;
  }
  function optional(fn) {
    try { return clone(fn()); } catch (e) { return { unavailable: String(e.message || e) }; }
  }
  function replay() {
    return typeof RealRace !== "undefined" ? RealRace.replay() : null;
  }
  function inspect() {
    const a = api();
    return clone({
      schema: "f1-dev-inspection/v1",
      build: globalThis.document?.querySelector('meta[name="apex-build"]')?.content || null,
      viewport: { width: globalThis.innerWidth || null, height: globalThis.innerHeight || null,
        dpr: globalThis.devicePixelRatio || 1 },
      info: a.info(), camera: a.camera(), damping: a.cameraState(), frame: a.camState(),
      view: a.viewState(), renderer: optional(() => {
        const diag = a.diag(), env = diag.env, timer = a.gpuTimer();
        const device = diag.gl?.renderer || null;
        return { backend: env.backend, api: env.backendState?.api || null, device,
          software: /swiftshader|llvmpipe|lavapipe|softpipe/i.test(device || "") ? true : timer.software,
          scale: env.renderScale, tier: diag.perf?.tier };
      }),
      replay: optional(() => replay()?.status() || null),
      reducedMotion: globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? null,
    });
  }
  function diagnose() {
    const a = api();
    const sw = globalThis.navigator?.serviceWorker;
    let controller = null;
    try {
      controller = sw?.controller ? {
        scriptURL: sw.controller.scriptURL || null,
        state: sw.controller.state || null,
      } : null;
    } catch (e) {
      controller = { unavailable: String(e.message || e) };
    }
    let manifest;
    try {
      manifest = clone(a.agentHelp());
    } catch (e) {
      manifest = { unavailable: String(e.message || e) };
    }
    return clone({
      schema: "f1-dev-diagnostic/v1",
      capturedAt: new Date().toISOString(),
      page: {
        url: globalThis.location?.href || null,
        visibility: globalThis.document?.visibilityState || null,
        readyState: globalThis.document?.readyState || null,
        controller,
      },
      manifest,
      inspection: inspect(),
    });
  }
  function capture() {
    const a = api(), repro = a.repro();
    if (!repro.track || !repro.cars?.length) throw new Error("Enter a race before capturing a scene.");
    return { schema: "f1-dev-scene/v1", repro: clone(repro), inspection: inspect() };
  }
  async function restore(scene) {
    if (scene?.schema !== "f1-dev-scene/v1" || !scene.repro?.track) throw new Error("Invalid scene document.");
    const a = api(), b = scene.repro, current = a.repro();
    const fail = () => { throw new Error("Invalid scene document. No scene applied."); };
    if (b.v !== 1 || typeof b.track !== "string" || !Tracks.LIST.some(t => t.id === b.track) ||
        !Array.isArray(b.cars) || !b.cars.length || b.cars.filter(c => c?.me === true).length !== 1 ||
        !Number.isInteger(b.teamIdx) || b.teamIdx < 0 || typeof b.teamId !== "string" || typeof b.halo !== "boolean" ||
        !["default", "dawn", "day", "dusk", "night"].includes(b.tod) ||
        !WeatherArc.VALID.includes(b.wx)) fail();
    const indices = new Set();
    for (const c of b.cars) {
      if (!c || !Number.isInteger(c.i) || c.i < 0 || indices.has(c.i) || typeof c.me !== "boolean" ||
          typeof c.team !== "string" || ![c.s, c.x, c.prog, c.speed].every(Number.isFinite)) fail();
      indices.add(c.i);
    }
    if (b.cars.find(c => c.me).team !== b.teamId || !b.cam || !a.camera().modes.includes(b.cam.mode) ||
        !b.cam.tune || typeof b.cam.tune !== "object" || Array.isArray(b.cam.tune)) fail();
    const defs = a.camTune().defs;
    for (const [key, value] of Object.entries(b.cam.tune)) {
      const d = defs.find(def => def.id === key);
      if (!d || !Number.isFinite(value) || value < d.min || value > d.max) fail();
    }
    if (current.teamIdx !== b.teamIdx || current.halo !== b.halo) {
      throw new Error("Team/halo differ. In a disposable browser profile seed apex26.team and apex26.cockpitHalo from the scene, reload, then retry. No scene applied.");
    }
    const info = a.info();
    if (info.track !== b.track || !["race", "count"].includes(info.state)) {
      await a.race(b.track, b.tod, b.wx);
      a.go();
    }
    const result = a.repro(clone(b));
    if (!result?.restored || result.teamMatches === false || result.skipped) {
      throw new Error("Scene was only partly restored: " + JSON.stringify(result));
    }
    return { result, inspection: inspect() };
  }
  function sample(label) {
    const a = api(), damping = a.cameraState(), frame = a.camState();
    const validVector = v => Array.isArray(v) && v.length >= 3 && v.every(Number.isFinite);
    if (!validVector(damping.eye) || !validVector(damping.target) || !Number.isFinite(damping.fov)) {
      throw new Error("Non-finite camera state at " + label);
    }
    return clone({ label, wallTime: performance.now(), damping, frame,
      replay: replay()?.status() || null });
  }
  function traceSettings({ label = "trace", frames = 12, timeoutMs = 30000 } = {}) {
    if (!Number.isInteger(frames) || frames < 2 || frames > 240) throw new Error("frames must be 2..240");
    if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error("timeoutMs must be 100..120000");
    return { label, frames, timeoutMs };
  }
  async function trace(options = {}) {
    const { label, frames, timeoutMs } = traceSettings(options);
    const before = inspect(), samples = [];
    await new Promise((resolve, reject) => {
      let raf;
      const timer = setTimeout(() => { cancelAnimationFrame(raf); reject(new Error("Trace timed out before enough real render frames.")); }, timeoutMs);
      function next() {
        try {
          const s = sample(label);
          if (!samples.length || s.damping.renderFrame !== samples.at(-1).damping.renderFrame) samples.push(s);
          if (samples.length >= frames) { clearTimeout(timer); resolve(); }
          else raf = requestAnimationFrame(next);
        } catch (e) { clearTimeout(timer); reject(e); }
      }
      raf = requestAnimationFrame(next);
    });
    return { schema: "f1-dev-trace/v1", label, before, samples, after: inspect() };
  }
  async function replayCheck(actions, traceOptions = {}) {
    const r = replay();
    if (!r?.status()) throw new Error("Start Data Hub WATCH before checking replay transitions.");
    if (!Array.isArray(actions) || !actions.length || actions.length > 12) throw new Error("Supply 1..12 replay actions.");
    // Validate the whole batch before any replay mutation.
    const initial = r.status(), drivers = r.describe().drivers.map(d => d.code);
    const { timeoutMs } = traceSettings(traceOptions);
    if (initial.finished || initial.reel) throw new Error("Replay checks require an unfinished full replay, not a highlight reel.");
    let projectedT = initial.T, projectedSpeed = initial.speed, projectedPaused = initial.paused;
    for (const action of actions) {
      if (!action || Object.keys(action).length !== 1) throw new Error("Each action needs exactly one operation.");
      const [op, value] = Object.entries(action)[0];
      const valid = op === "seek" ? Number.isFinite(value) && value >= 0 && value <= initial.duration
        : op === "follow" ? drivers.includes(value)
        : op === "pause" ? typeof value === "boolean"
        : op === "speed" ? r.describe().speeds.includes(value) : false;
      if (!valid) throw new Error("Invalid replay action: " + op);
      if (op === "seek") projectedT = value;
      if (op === "speed") projectedSpeed = value;
      if (op === "pause") projectedPaused = value;
      // Normal page playback advances no faster than wall time * replay speed.
      // Keep one second of scheduling/fixed-step margin per action and stop
      // before duration, without relying on the native finish grace period.
      if (!projectedPaused) {
        projectedT += (timeoutMs / 1000 + 1) * projectedSpeed;
        if (projectedT >= initial.duration) throw new Error("Replay action budget could reach the finish. Pause first or use a shorter trace timeout.");
      }
    }
    const results = [];
    try {
      for (const action of actions) {
        const [op, value] = Object.entries(action)[0];
        if (op === "follow" && !r.describe()?.drivers.some(d => d.code === value && d.available)) {
          throw new Error("Replay driver is unavailable: " + value);
        }
        const before = sample("before-" + op);
        ({ seek: v => r.seek(v), follow: v => r.follow(v), pause: v => r.setPaused(v), speed: v => r.setSpeed(v) })[op](value);
        if (op === "follow" && r.status()?.follow !== value) throw new Error("Replay follow did not select: " + value);
        // Observe the production seek/follow path. Do not snap/reset camera history here.
        results.push({ action, before, trace: await trace({ ...traceOptions, label: op }) });
      }
      return { schema: "f1-dev-replay-check/v1", initial, results };
    } finally {
      r.seek(initial.T); r.follow(initial.follow); r.setSpeed(initial.speed); r.setPaused(initial.paused);
    }
  }
  function previewPreset(mode, values, { frac = 0.2, speed = 60, lateral = 0 } = {}) {
    const a = api();
    if (typeof CamTune === "undefined") throw new Error("This build has no camera tuner.");
    if (!a.camera().modes.includes(mode)) throw new Error("Unknown camera mode.");
    if (!values || typeof values !== "object" || Array.isArray(values)) throw new Error("Supply a knob/value object.");
    const registry = a.camTune().defs;
    for (const [key, value] of Object.entries(values)) {
      const d = registry.find(def => def.id === key);
      if (!d || !Number.isFinite(value) || value < d.min || value > d.max) throw new Error("Invalid tuner value: " + key);
    }
    if (![frac, speed, lateral].every(Number.isFinite) || frac < 0 || frac >= 1 || speed < 0) throw new Error("Invalid scene pose.");
    const saved = clone(CamTune.exportPack()), originalMode = a.camera().mode;
    const priorView = a.viewState();
    if (priorView.skyOverride || priorView.dbgCamActive || a.freeCam()?.open) throw new Error("Exit sky/free/debug camera before previewing a preset.");
    try {
      for (const [key, value] of Object.entries(values)) CamTune.set(mode, key, value);
      const preset = clone(CamTune.exportPack());
      const preview = a.previewCam(mode, frac, speed, lateral);
      if (!preview) throw new Error("Load a race track before previewing.");
      return { schema: "f1-dev-preset-preview/v1", mode, values: clone(values), preset, preview: clone(preview) };
    } finally {
      CamTune.importPack(saved); // restore raw overrides, including global/comfort inheritance; never persist
      a.view("chase"); // clear preview override without changing the saved driving camera
      if (a.camera().mode !== originalMode) throw new Error("Unexpected camera mode change during preview.");
    }
  }
  globalThis.F1Dev = Object.freeze({ diagnose, inspect, capture, restore, trace, replayCheck, previewPreset });
})();
