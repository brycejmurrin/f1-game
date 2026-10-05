/* Apex 26 — the GARAGE pre-built while the title or race settings sits idle.

   WHY. The garage's first frame builds the room (GarageScene rebuild: shell,
   props, the live and dress atlases), the player's car (Car3D.build into the
   six-slot preview LRU) and compiles their programs, synchronously, ON THE TAP:
   1.3-1.8 s of frozen screen under SwiftShader. Race settings already drew two
   hidden garage frames once its circuit was done (the RACE! drive-out opens on
   the garage); the title did nothing, so GARAGE from the title paid it all.

   WHAT. One sequence, three steps, each its own task behind the menu's own idle
   gate (game.js menuIdle/menuSlice, the gate the circuit warm uses):
     1. the car  — setupCam.prebuild("car"): the preview mesh for the CURRENT
        team/parts/seat, through the same LRU the garage uses (never a new slot
        type; the LRU stays at six);
     2. the room — setupCam.prebuild("room"): GarageScene.prepare, built with the
        SETUP garage's ctx, so the tap's first draw() hits its cache;
     3. the programs — two hidden setup-garage frames (render()'s
        `_menuGate.garageWarm` branch) after one gfx.warm() request per session.
   What the title is DRAWING decides which steps may run (plan()): the Home
   garage already draws the room, car and programs every frame, so building the
   setup ctx's room there would only be undone by the next Home frame; a circuit
   Home shows on the canvas, so no hidden frame can be drawn over it.

   KEYED, NOT ONE-SHOT. `_menuGate.garageKey` is setupCam.prebuildKey() (team,
   parts, seat, and the room's ctx); a team pick, a seat, a part or the circuit
   moves it, and a livery edit busts the mesh key (setup-sheet.js
   G._spMeshKey = "") — either re-arms the prebuild on the next idle title.

   DRAWN, NOT JUST BUILT. `_menuGate.garageReady` means the setup garage DREW
   for that key (render() sets it: the hidden warm frames or a visible garage
   frame) — it compiled the programs. A frameless plan (a circuit or garage Home)
   only records `prepped` (car, and the room when the plan built it): enough for
   the title's poll to stop, never for race settings, whose RACE! drive-out
   would otherwise compile on the tap. Settings then skips what is prepped and
   draws the frames.

   NEVER: during a race start (loading card or the drive-out studio), with the
   garage open, behind a hidden tab, during the title intro, before the menu
   world's own hidden frames have drawn, or — on the title, where it is
   speculative — under Save-Data / prefers-reduced-data or before the material
   pack has settled (the garage samples it; drawn before it lands, the programs
   compile again). Race settings keeps its old gates: RACE! needs that garage.

   OFF SWITCH (the before/after on one tree): apex26.garagePrewarm = "off" at
   boot, or __apex.garagePrewarm(false); tools/shot/garage-tap.mjs runs both.
   READ IT: __apex.garagePrebuild() (state()); Log "garage prewarm …" and
   "garage first frame …" (tap to first drawn garage frame, in ms). */
const GaragePrebuild = (function () {
  "use strict";

  const POLL_MS = 1000;      // the title's idle check: a few property reads
  const GIVE_UP_MS = 30000;  // a hidden frame withheld this long (a TLX compile) is logged as pending

  // Settled = uploaded, failed or unsupported (js/render/shared/assets.js state()).
  function packSettled(s) {
    return !s || s.supported === false || !!s.uploaded || !!s.error || s.tier === "off";
  }

  // The Save-Data client hint (NetworkInformation.saveData) or the
  // prefers-reduced-data media feature; either one means "no speculative work".
  function saveData(nav, matchMedia) {
    try {
      if (nav && nav.connection && nav.connection.saveData === true) return true;
      return !!(matchMedia && matchMedia("(prefers-reduced-data: reduce)").matches);
    } catch (_) { return false; }
  }

  // What the title draws under its buttons (UiExperience.state()).
  function homeKind(st) {
    if (!st) return "none";
    if (st.world && st.world.active) return "track";
    if (st.home) return st.scene && st.scene.mode === "studio" ? "studio" : "garage";
    return "none";
  }

  // Which steps may run without stealing a visible frame or thrashing the room.
  function plan(want, kind) {
    if (want === "settings" || kind === "none") return { car: true, room: true, frames: true };
    if (kind === "track") return { car: true, room: true, frames: false };
    return { car: true, room: false, frames: false };   // garage/studio Home draws them itself
  }

  // Why the prebuild may not start now; [] means go. `e` is a plain snapshot.
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
      if (!e.packSettled) out.push("pack");
      if (e.kind === "track" && !e.worldReady) out.push("world-build");
      if (e.kind === "garage" && !e.homePainted) out.push("home-unpainted");
    }
    if (e.worldWarm || e.warming) out.push("world-warm");
    return out;
  }

  // THE A/B SWITCH: localStorage apex26.garagePrewarm = "off" (read at boot) or
  // __apex.garagePrewarm(false) turns the TITLE prebuild off — the tip's behaviour,
  // so one tree measures both. Race settings' prewarm (older, RACE!'s) stays on.
  function readSwitch(storage) {
    try {
      const v = storage && storage.getItem("apex26.garagePrewarm");
      return !(v === "off" || v === '"off"' || v === "0" || v === "false");
    } catch (_) { return true; }
  }

  function create(G, d) {
    const gate = d.gate, cam = d.setupCam, $ = G.$;
    const now = () => performance.now(), ms = (t) => Math.round(t);
    let enabled = readSwitch(typeof localStorage !== "undefined" ? localStorage : null);
    let running = false, warmed = false, last = null, open = null, firstFrame = null, timer = 0, visits = 0;
    let prepped = null;   // { key, room }: built on the CPU by a frameless plan, frames NOT drawn
    const ui = () => { const u = d.ui(); return u && u.state ? u.state() : null; };
    const kind = () => homeKind(ui());
    function surface() {
      const rs = $("race-settings"), ov = $("overlay");
      if (rs && !rs.hidden) return "settings";
      return ov && !ov.hidden && !ov.inert ? "title" : "";
    }
    const starting = () => !!(G.loadingScreen && G.loadingScreen.active()) || !!d.studio();
    function env(want) {
      const ov = $("overlay"), st = ui(), k = homeKind(st);
      return {
        want, kind: k, off: !enabled, state: G.state, setupOpen: !!G.setupPreviewOn, starting: starting(),
        tabHidden: typeof document !== "undefined" && !!document.hidden, headless: !!G.headlessMode,
        surface: surface(), intro: !!(ov && ov.hasAttribute("data-intro")),
        saveData: saveData(typeof navigator !== "undefined" ? navigator : null,
          typeof matchMedia === "function" ? matchMedia : null),
        packSettled: packSettled(typeof Assets !== "undefined" && Assets.state ? Assets.state() : null),
        worldReady: !!d.worldReady(), homePainted: !!(st && st.painted),
        worldWarm: gate.warm > 0, warming: !!(G.gfx && G.gfx.warming && G.gfx.warming()),
      };
    }
    // Ready = drawn for THIS key (or, for the title only, built as far as the
    // current Home's plan allows), and the car under that key still cached.
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
    // The sequence. `current` is the caller's ownership test (the circuit
    // build's, or the title's); false at any await abandons the rest.
    async function run(current, want) {
      if (running || ready(want)) return false;
      // The menu world's warm is WAITED for below, not refused: menuFinish queues
      // it right before the circuit build's tail calls this.
      if (blockers(env(want)).some((r) => r !== "world-warm")) return false;
      running = true;
      try {
        if (!(await d.menuIdle(current))) return false;
        // The menu world's own hidden frames (and any compile they started) first.
        const until = now() + GIVE_UP_MS;
        while ((gate.warm > 0 || (G.gfx.warming && G.gfx.warming())) && current() && now() < until) await d.menuSlice();
        if (!current() || blockers(env(want)).length) return false;
        const k = kind(), p = plan(want, k);
        const rec = { want, kind: k, key: cam.prebuildKey(), t0: now(), carMs: 0, roomMs: 0, frameMs: 0, room: p.room, frames: p.frames };
        // What a frameless run already built for this key is not built again.
        const had = prepped && prepped.key === rec.key ? prepped : null;
        if (!had) prepped = null;
        gate.garageReady = false; gate.garageKey = rec.key;
        let t = now();
        if (!had || cam.meshKey !== cam.previewKey()) {
          cam.prebuild("car"); rec.carMs = ms(now() - t);
          await d.menuSlice();
          if (!current()) return finish(rec, "superseded");
        }
        if (p.room && !(had && had.room)) {
          t = now(); cam.prebuild("room"); rec.roomMs = ms(now() - t);
          await d.menuSlice();
          if (!current()) return finish(rec, "superseded");
        }
        if (!p.frames) { prepped = { key: rec.key, room: p.room || !!(had && had.room) }; return finish(rec, "ready"); }
        // TLX compiles the next present's programs once warm() is asked; one
        // request per session — a repeat links nothing yet holds presents.
        if (!warmed && G.gfx.warm) { G.gfx.warm(); warmed = true; }
        t = now(); gate.garageWarm = 2;
        while (!gate.garageReady && current() && now() - t < GIVE_UP_MS) await d.menuSlice();
        rec.frameMs = ms(now() - t);
        if (gate.garageReady) return finish(rec, "ready");
        if (!current()) { gate.garageWarm = 0; return finish(rec, "superseded"); }
        return finish(rec, "pending");   // still armed: render() flips garageReady when it draws
      } finally { running = false; }
    }
    const titleCurrent = () => G.state === "menu" && !G.setupPreviewOn && surface() === "title" && !starting();
    function tick() {
      timer = setTimeout(tick, POLL_MS);
      if (running || G.state !== "menu" || ready("title")) return;
      run(titleCurrent, "title").catch((e) => Log.warn("game", "garage prewarm failed", e));
    }
    function start() { if (!timer) timer = setTimeout(tick, POLL_MS); }
    function stop() { clearTimeout(timer); timer = 0; }
    // THE MEASURE: tap (markOpen, in openGarage) to the first garage frame that
    // DREW, plus the time spent inside the frame calls on the way.
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
        previewMeshes: dbg ? dbg.previewMeshes : null, last, firstFrame };
    }
    // true also RE-ARMS: readiness and the last run are forgotten, so the next idle
    // title runs a fresh cycle (a spec on a shared page never reads a stale one).
    function setEnabled(on) {
      if (on !== undefined) enabled = !!on;
      if (on === true) { gate.garageReady = false; gate.garageKey = ""; last = null; prepped = null; }
      return enabled;
    }
    _instance = { run, start, stop, markOpen, timed, state, setEnabled };
    return _instance;
  }
  // The page's one instance, for __apex.garagePrebuild() (the MirrorPass.instance() idiom: no G member).
  let _instance = null;

  return { create, instance: () => _instance, readSwitch, blockers, plan, homeKind, packSettled, saveData, POLL_MS, GIVE_UP_MS };
})();
Object.freeze(GaragePrebuild);
