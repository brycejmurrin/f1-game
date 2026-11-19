const GaragePrebuild = (function () {
  "use strict";

  const POLL_MS = 1000;
  const QUIET_MS = 3000;
  const GIVE_UP_MS = 30000;

  function packSettled(s) {
    return !s || s.supported === false || !!s.uploaded || !!s.error || s.tier === "off";
  }

  function saveData(nav, matchMedia) {
    try {
      if (nav && nav.connection && nav.connection.saveData === true) return true;
      return !!(matchMedia && matchMedia("(prefers-reduced-data: reduce)").matches);
    } catch (_) { return false; }
  }

  function phoneHold(nav, hint) {
    try {
      if (hint && (hint.isMobile || hint.mobileTier)) return true;
      if (nav && typeof nav.deviceMemory === "number" && nav.deviceMemory > 0 && nav.deviceMemory < 4) return true;
    } catch (_) {  }
    return false;
  }

  function homeKind(st) {
    if (!st) return "none";
    if (st.world && st.world.active) return "track";
    if (st.home) return st.scene && st.scene.mode === "studio" ? "studio" : "garage";
    return "none";
  }

  function plan(want, kind) {
    if (want === "settings" || kind === "none") return { car: true, room: true, frames: true };
    if (kind === "track") return { car: true, room: true, frames: false };
    return { car: true, room: false, frames: false };
  }

  function blockers(e) {
    const out = [];
    if (e.state !== "menu") out.push("state");
    if (e.setupOpen) out.push("garage-open");
    if (e.starting) out.push("race-start");
    if (e.tabHidden) out.push("tab-hidden");
    if (e.headless) out.push("headless");
    if (e.surface !== e.want) out.push("surface");
    if (e.want === "title") {
      if (e.off) out.push("off");
      if (e.intro) out.push("title-intro");
      if (e.saveData) out.push("save-data");
      if (e.phoneHold) out.push("phone-hold");
      if (e.quietMs < QUIET_MS) out.push("input-recent");
      if (e.sheetOpen) out.push("menu-sheet");
      if (e.kind === "track" && !e.worldReady) out.push("world-build");
      if (e.kind === "garage" && !e.homePainted) out.push("home-unpainted");
    }
    if (e.worldWarm || e.warming) out.push("world-warm");
    return out;
  }

  function sheetOpenNow() {
    return typeof MenuSheetGate !== "undefined" && MenuSheetGate.open && MenuSheetGate.open();
  }
  const sheetBlocks = (want) => want === "title" && sheetOpenNow();
  const packNow = () => packSettled(typeof Assets !== "undefined" && Assets.state ? Assets.state() : null);

  function readSwitch(storage) {
    try {
      const disk = storage === undefined ? (typeof localStorage !== "undefined" ? localStorage : null) : storage;
      const v = disk && disk.getItem("apex26.garagePrewarm");
      return !(v === "off" || v === '"off"' || v === "0" || v === "false");
    } catch (_) { return true; }
  }

  function create(G, d) {
    const gate = d.gate, cam = d.setupCam, $ = G.$;
    const now = () => performance.now(), ms = (t) => Math.round(t);
    let enabled = readSwitch();
    let running = false, warmed = false, last = null, open = null, firstFrame = null, timer = 0, visits = 0;
    let prepped = null;
    let quietSince = null;
    const noisy = () => { quietSince = now(); };
    const quietMs = () => { if (quietSince === null) quietSince = now(); return now() - quietSince; };
    if (typeof addEventListener === "function") {
      for (const ev of ["pointerdown", "keydown", "wheel", "touchstart", "visibilitychange"]) {
        addEventListener(ev, noisy, { capture: true, passive: true });
      }
    }
    const ui = () => { const u = d.ui(); return u && u.state ? u.state() : null; };
    const kind = () => homeKind(ui());
    const gfxWarming = () => !!(G.gfx.warming && G.gfx.warming());
    const stillOn = (current, want) => current() && !sheetBlocks(want);
    function surface() {
      const rs = $("race-settings"), ov = $("overlay");
      if (rs && !rs.hidden) return "settings";
      return ov && !ov.hidden && !ov.inert ? "title" : "";
    }
    const starting = () => !!(G.loadingScreen && G.loadingScreen.active()) || !!d.studio();
    function env(want) {
      const ov = $("overlay"), st = ui(), k = homeKind(st);
      const nav = typeof navigator !== "undefined" ? navigator : null;
      const gfx = G.gfx;
      const hint = (gfx && (gfx.isMobile || gfx.mobileTier)) ? gfx
        : (typeof GLX !== "undefined" && GLX && (GLX.isMobile || GLX.mobileTier)) ? GLX
          : (gfx || null);
      return {
        want, kind: k, off: !enabled, state: G.state, setupOpen: !!G.setupPreviewOn, starting: starting(),
        tabHidden: typeof document !== "undefined" && !!document.hidden, headless: !!G.headlessMode,
        surface: surface(), intro: !!(ov && ov.hasAttribute("data-intro")),
        saveData: saveData(nav, typeof matchMedia === "function" ? matchMedia : null),
        phoneHold: phoneHold(nav, hint),
        packSettled: packNow(),
        worldReady: !!d.worldReady(), homePainted: !!(st && st.painted),
        worldWarm: gate.warm > 0, warming: !!(G.gfx && G.gfx.warming && G.gfx.warming()),
        quietMs: quietMs(), sheetOpen: sheetOpenNow(),
      };
    }
    async function yieldBeforeHeavy(current, want) {
      if (typeof MenuSheetGate === "undefined" || !MenuSheetGate.open) return !!current();
      await d.menuSlice();
      if (!stillOn(current, want)) return false;
      await d.menuSlice();
      return !!stillOn(current, want);
    }
    function ready(want = "title") {
      if (gate.garageKey !== cam.prebuildKey() || cam.meshKey !== cam.previewKey()) return false;
      if (gate.garageReady) return true;
      return want === "title" && !!prepped && prepped.key === gate.garageKey && !plan(want, kind()).frames;
    }
    function finish(rec, result) {
      rec.result = result; rec.ms = ms(now() - rec.t0); delete rec.t0;
      last = rec;
      Log.info("game", `garage prewarm ${result} in ${rec.ms} ms (${rec.want}, home ${rec.kind}: car ${rec.carMs} ms, ` +
        `room ${rec.room ? rec.roomMs + " ms" : "skipped"}, frames ${rec.frames ? rec.frameMs + " ms" : "skipped"})`);
      return result === "ready";
    }
    async function run(current, want) {
      if (running || ready(want)) return false;
      if (blockers(env(want)).some((r) => r !== "world-warm")) return false;
      running = true;
      try {
        if (!(await d.menuIdle(current))) return false;
        const until = now() + GIVE_UP_MS;
        while ((gate.warm > 0 || gfxWarming()) && current() && now() < until) await d.menuSlice();
        if (!current() || blockers(env(want)).length) return false;
        const k = kind(), p = plan(want, k);
        const rec = { want, kind: k, key: cam.prebuildKey(), t0: now(), carMs: 0, roomMs: 0, frameMs: 0, room: p.room, frames: p.frames };
        const had = prepped && prepped.key === rec.key ? prepped : null;
        if (!had) prepped = null;
        gate.garageReady = false; gate.garageKey = rec.key;
        let t = now();
        if (!had || cam.meshKey !== cam.previewKey()) {
          if (!(await yieldBeforeHeavy(current, want))) return finish(rec, "superseded");
          cam.prebuild("car"); rec.carMs = ms(now() - t);
          await d.menuSlice();
          if (!stillOn(current, want)) return finish(rec, "superseded");
        }
        if (p.room && !(had && had.room)) {
          if (!(await yieldBeforeHeavy(current, want))) return finish(rec, "superseded");
          t = now(); cam.prebuild("room"); rec.roomMs = ms(now() - t);
          await d.menuSlice();
          if (!stillOn(current, want)) return finish(rec, "superseded");
        }
        if (!p.frames) { prepped = { key: rec.key, room: p.room || !!(had && had.room) }; return finish(rec, "ready"); }
        const packUntil = now() + GIVE_UP_MS;
        while (!packNow() && current() && now() < packUntil) await d.menuSlice();
        if (!stillOn(current, want)) return finish(rec, "superseded");
        if (!packNow()) {
          prepped = { key: rec.key, room: true };
          return finish(rec, "pending");
        }
        if (sheetBlocks(want)) return finish(rec, "superseded");
        if (!warmed && G.gfx.warm) { G.gfx.warm(); warmed = true; }
        t = now(); gate.garageWarm = 2;
        while (!gate.garageReady && current() && now() - t < GIVE_UP_MS) {
          if (sheetBlocks(want)) { gate.garageWarm = 0; return finish(rec, "superseded"); }
          if (gate.garageWarm <= 0 && !gfxWarming()) break;
          await d.menuSlice();
        }
        rec.frameMs = ms(now() - t);
        if (gate.garageReady) return finish(rec, "ready");
        if (!current()) { gate.garageWarm = 0; return finish(rec, "superseded"); }
        return finish(rec, "pending");
      } finally { running = false; }
    }
    const titleCurrent = () => G.state === "menu" && !G.setupPreviewOn && surface() === "title" && !starting()
      && quietMs() >= QUIET_MS && !sheetOpenNow();
    let unwatch = () => {};
    if (typeof MenuSheetGate !== "undefined" && MenuSheetGate.watch) {
      unwatch = MenuSheetGate.watch(gate, { noisy }) || unwatch;
    }
    let away = false;
    function tick() {
      timer = setTimeout(tick, POLL_MS);
      if (G.state !== "menu") { if (!away) { away = true; noisy(); } return; }
      if (away) { away = false; noisy(); }
      if (surface() !== "title" || sheetOpenNow()) noisy();
      if (running || sheetOpenNow()) return;
      if (env("title").phoneHold) {
        if (prepped || gate.garageReady || gate.garageKey) release();
        return;
      }
      if (ready("title")) return;
      run(titleCurrent, "title").catch((e) => Log.warn("game", "garage prewarm failed", e));
    }
    function start() { if (!timer) timer = setTimeout(tick, POLL_MS); }
    function stop() { clearTimeout(timer); timer = 0; try { unwatch(); } catch (_) {  } unwatch = () => {}; }
    function markOpen(from) { open = { from, visit: ++visits, at: now(), work: 0, calls: 0, prebuilt: ready() }; }
    function timed(fn) {
      return function (dt, hold) {
        const t = now(), ok = fn(dt, hold);
        if (open && G.setupPreviewOn) {
          open.work += now() - t; open.calls++;
          if (ok) {
            firstFrame = { from: open.from, visit: open.visit, tapMs: ms(now() - open.at), workMs: ms(open.work), calls: open.calls, prebuilt: open.prebuilt };
            open = null;
            Log.info("game", `garage first frame ${firstFrame.tapMs} ms after the tap (${firstFrame.workMs} ms in ${firstFrame.calls} frame call(s), prebuilt ${firstFrame.prebuilt})`);
          }
        }
        return ok;
      };
    }
    function state() {
      const dbg = typeof GarageScene !== "undefined" && GarageScene.debug ? GarageScene.debug() : null;
      return { enabled, ready: ready(), garageReady: !!gate.garageReady, prepped: !!prepped, garageWarm: gate.garageWarm, key: gate.garageKey || "",
        running, kind: kind(), blockers: blockers(env("title")), programsWarm: warmed, room: !!cam.roomReady(),
        previewMeshes: dbg ? dbg.previewMeshes : null, exterior: cam.exteriorState ? cam.exteriorState() : null, last, firstFrame };
    }
    function setEnabled(on) {
      if (on !== undefined) enabled = !!on;
      if (on === true) { gate.garageReady = false; gate.garageKey = ""; last = null; prepped = null; }
      return enabled;
    }
    function release() {
      if (!cam.release || !cam.release()) return false;
      prepped = null;
      gate.garageReady = false; gate.garageKey = ""; gate.garageWarm = 0;
      Log.info("game", "garage released for the race");
      return true;
    }
    const prewarmExterior = () => { if (cam.prewarmExterior) cam.prewarmExterior(); };
    _instance = { run, start, stop, markOpen, timed, state, setEnabled, release, prewarmExterior };
    return _instance;
  }
  let _instance = null;

  return { create, instance: () => _instance, readSwitch, blockers, plan, homeKind, packSettled, saveData, phoneHold, sheetOpenNow, QUIET_MS };
})();
Object.freeze(GaragePrebuild);
