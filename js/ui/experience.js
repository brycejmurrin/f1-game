/* Apex 26 — connected menu doors, race context and bounded live garage home. */
const UiExperience = (function () {
  "use strict";

  // Practice from the title door is a Time Trial under the hood. This flag is
  // the only way the picker and race-settings sheets can say PRACTICE instead
  // of TIME TRIAL. Cleared in capture on the other session doors so their
  // open handlers paint the right title.
  let practicePick = false;
  let hidePracticeBrief = () => {};
  function isPracticePick() { return practicePick; }
  function leavePracticePick() {
    practicePick = false;
    hidePracticeBrief();
  }

  function raceBrief(G) {
    const p = G.player, t = G.track && G.track.def;
    if (!p || !t) return { title: "SESSION PAUSED", detail: "Your session is held here." };
    const rank = (G.ranked || []).indexOf(p);
    const parts = [G.session === "tt" ? "TIME TRIAL" : G.session === "quali" ? "QUALIFYING" : "RACE"];
    if (rank >= 0 && !G.timeTrial) parts.push("P" + (rank + 1));
    parts.push("LAP " + Math.max(1, G.timeTrial ? (p.lap || 1) : Math.min(p.lap || 1, G.lapsTarget)) + (G.timeTrial ? "" : " / " + G.lapsTarget));
    if (G.practice) parts.push("PRACTICE");
    if (G.netPlay && G.netPlay.active()) parts.push("ONLINE · RACE CONTINUES");
    return { title: t.name || t.id, detail: parts.join(" · ") };
  }

  /* textContent on #mb-photo used to wipe the .mb-sub ("CAPTURE & BACKGROUNDS")
     and leave PHOTO STUDIO as a one-line leftover tile next to Garage. */
  function setDoorLabel(el, text) {
    const sub = el && el.querySelector(".mb-sub");
    const host = sub && sub.parentNode;
    // game-vm stubs querySelector() as a detached div (parentNode null). Keep
    // the subtitle in a real tree; fall back to textContent anywhere else.
    if (!host || !host.firstChild) { if (el) el.textContent = text; return; }
    while (host.firstChild && host.firstChild !== sub) host.removeChild(host.firstChild);
    if (host.firstChild !== sub) { el.textContent = text; return; }
    host.insertBefore(document.createTextNode(text + " "), sub);
  }

  function homeVariation(store) {
    const shots = ["hero", "front", "side", "rear"], environments = ["garage", "track", "night", "pitlane", "studio"];
    let visiting = false, index = 0;
    // Reused — enter/peek run every title Home frame; callers read fields sync.
    const _values = { mode: "garage", shot: "hero" };
    function values(mode, camera) {
      _values.mode = mode === "auto" ? environments[index % environments.length] : mode;
      _values.shot = shots.includes(camera) ? camera : shots[index % shots.length];
      return _values;
    }
    return {
      enter(mode, camera, retainScene = false) {
        if (!visiting && !retainScene) {
          const saved = store.get("homeVisit", 0);
          index = Number.isSafeInteger(saved) && saved >= 0 ? saved % 20 : 0;
          store.set("homeVisit", (index + 1) % 20); visiting = true;
        }
        return values(mode, camera);
      },
      peek: values,
      leave() { visiting = false; },
    };
  }

  function openPhoto(G, deps) {
    let source = deps.source;
    if (source === "home" && deps.trackHome) {
      if (deps.trackReady === false) { if (deps.onWaiting) deps.onWaiting(); return false; }
      source = "home-track";
    }
    const wasPaused = G.paused;
    const callers = [G.$("pmsettings"), G.$("carsetup")].filter((e) => e && !e.hidden);
    const unhide = () => {
      for (const e of callers) e.hidden = false;
      if (callers.length) G.$("pausemenu").hidden = true;
    };
    const restore = () => {
      if (source === "race" || source === "watch") deps.setPaused(wasPaused, "photo-done");
      unhide();
      if (deps.onDone) deps.onDone();
    };
    for (const e of callers) e.hidden = true;
    if (["race", "watch"].includes(source)) { deps.setPaused(true, "photo-studio"); G.$("pausemenu").hidden = true; }
    const team = Teams.LIST[G.teamIdx];
    const title = source === "home" || source === "garage" ? team.name : G.track && G.track.def.name;
    const subtitle = source === "home" || source === "garage" ? "GARAGE · " + team.name : "LAP " + Math.max(1, ((G.player && G.player.lap) || 1));
    // The Home door's SUBJECT row (js/ui/photo-studio.js): close, swap the Home
    // world for this visit (photoSubject), reopen through the door so trackHome
    // and trackReady are read again. The callers come back first so the
    // reopened studio hides and restores them itself on DONE.
    const fromHome = source === "home" || source === "home-track";
    const subject = fromHome && deps.photoSubject && deps.reopen ? (mode) => {
      deps.photoStudio.close(false); unhide();
      return Promise.resolve(deps.photoSubject(mode)).then((ok) => { if (!ok) deps.photoSubject(null); return deps.reopen(); });
    } : null;
    const opened = deps.photoStudio.open({ source, metadata: { title, subtitle }, back: restore, subject,
      view: source === "home-track" && deps.photoView ? deps.photoView() : null });
    if (!opened) restore();
    return opened;
  }

  function create(G, deps) {
    const { $ } = G;
    const overlay = $("overlay"), panel = $("menu-buttons");
    let home = false, signature = "", elapsed = 0, painted = false, failure = false, photoHomeCamera = null;
    // Photo Studio's SUBJECT for this visit: "track" or "garage" laid over the
    // stored Home scene while the studio is open (never written to the store).
    let photoScene = null, photoSwitching = false, photoSwitch = 0;
    // Scratch for photo-subject overlay + variation merge — renderHome used to
    // mint { ...selected, ...enter() } and a freePane host rect every title frame.
    const _sceneScratch = { mode: "", shot: "", motion: "" };
    const _hostRect = { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    const _worldView = { motion: "still", shot: "hero", viewKey: "0", pane: null };
    const selectedScene = () => {
      const s = AppearanceStudio.scene();
      if (!photoScene) return s;
      _sceneScratch.mode = photoScene;
      _sceneScratch.shot = s.shot;
      _sceneScratch.motion = s.motion;
      return _sceneScratch;
    };
    const variation = homeVariation(GameStore.store);
    const world = HomeWorld.create(G, { prepareTrack: deps.prepareTrack, worldReady: deps.trackReady,
      capture: deps.captureTrackCamera, restore: deps.restoreTrackCamera, contextKey: deps.trackKey,
      eligible: () => G.state === "menu" && !overlay.hidden && !document.hidden && !G.setupPreviewOn
        && (!overlay.inert || !$("photo-studio").hidden) });
    let wantedPractice = false;
    practicePick = false;
    const node = (tag, text, attrs) => {
      const el = document.createElement(tag);
      if (text) el.textContent = text;
      for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
      return el;
    };
    const SOLO_GOAL = Object.freeze({
      free: "FREE PRACTICE", sector: "SECTOR", corner: "CORNER", lap: "FULL LAP",
      braking: "BRAKING", trail: "TRAIL BRAKING", slalom: "SLALOM", launch: "LAUNCH",
    });
    function goalValues() {
      const out = [];
      for (const [id, label] of Object.entries(RaceInsights.DRILLS)) {
        if (RaceInsights.needsRivals(id)) continue;
        out.push([id, SOLO_GOAL[id] || String(label).toUpperCase()]);
      }
      return out;
    }
    function wire(id, fn) { const b = $(id); if (b) b.onclick = fn; }
    wire("mb-watch", deps.openWatch);
    wire("mb-practice", () => {
      wantedPractice = true;
      practicePick = true;
      deps.openPractice();
      showPractice();
    });
    wire("mb-photo", () => deps.openPhoto("home"));
    wire("pm-photo", () => deps.openPhoto("race"));
    wire("pm-strategy", () => deps.openSettingsPage("driving", "pm-pit-panel"));
    wire("pm-practice", () => deps.openSettingsPage("driving", "pm-practice-panel"));
    wire("pm-review", () => deps.openSettingsPage("driving", "pm-session-review"));
    const intro = $("practice-brief");
    let goal = $("practice-goal");
    function paintGoal() {
      if (!goal) return;
      const row = goal.closest && goal.closest(".set-row");
      if (row && typeof SettingRow !== "undefined") SettingRow.paint(row, deps.coach.practiceGoal());
      else goal.value = deps.coach.practiceGoal();
    }
    function showPractice() {
      if (!intro) return;
      intro.hidden = !wantedPractice;
      if (wantedPractice) {
        if (RaceInsights.needsRivals(deps.coach.practiceGoal())) deps.coach.setPracticeGoal("free");
        paintGoal();
        if (goal) goal.focus({ preventScroll: true });
      }
    }
    hidePracticeBrief = () => { wantedPractice = false; showPractice(); };
    if (goal) {
      const values = goalValues();
      // Built at runtime so the shell keeps its two Goal nodes (label + select)
      // and shellNodes does not grow. Same ‹ VALUE › contract as race settings.
      if (typeof SettingRow !== "undefined" && goal.closest && !goal.closest(".set-row")) {
        const built = SettingRow.build("practice-goal-row", "GOAL");
        built.sel.id = "practice-goal";
        built.sel.setAttribute("aria-labelledby", "practice-goal-label");
        const host = goal.parentNode;
        const oldLabel = intro && intro.querySelector('label[for="practice-goal"]');
        if (oldLabel) oldLabel.remove();
        host.replaceChild(built.row, goal);
        goal = built.sel;
      }
      const row = goal.closest && goal.closest(".set-row");
      if (row && typeof SettingRow !== "undefined") {
        SettingRow.wire(row, {
          values,
          read: () => deps.coach.practiceGoal(),
          write: (v) => { deps.coach.setPracticeGoal(v); },
        });
      } else {
        for (const [id, label] of values) {
          const o = node("option", label); o.value = id; goal.appendChild(o);
        }
        goal.onchange = () => { deps.coach.setPracticeGoal(goal.value); };
      }
    }
    // Capture: hide the brief BEFORE the other doors' open handlers paint
    // the picker, or Time Trial would inherit PRACTICE from the last visit.
    for (const id of ["mb-tt", "mb-race", "mb-daily", "mb-season", "mb-career", "mb-continue", "sel-back"]) {
      const b = $(id); if (b) b.addEventListener("click", () => {
        wantedPractice = false; practicePick = false; showPractice();
      }, true);
    }
    const context = $("pm-race-context");
    function refreshPause() {
      if (!context) return;
      deps.coach.paint();
      const info = raceBrief(G);
      context.replaceChildren(node("strong", info.title), node("span", info.detail));
      const strategy = $("pm-pit-estimate");
      const next = $("pm-pit-help");
      if (next && G.tyres.on()) context.appendChild(node("small", next.textContent.split("Drive into")[0]));
      if (strategy && G.tyres.on()) context.appendChild(node("small", strategy.textContent));
      const retry = $("pm-checkpoint-retry"), save = $("pm-checkpoint-save");
      if (retry) retry.disabled = !!$("pm-practice-retry").disabled;
      if (save) save.disabled = !!$("pm-practice-set").disabled;
      const rewind = $("pm-checkpoint-rewind"); if (rewind) rewind.disabled = !!$("pm-practice-rewind").disabled;
      const practice = $("pm-practice-state");
      const hint = $("pm-checkpoint-state");
      if (hint) hint.textContent = practice ? practice.textContent : "Open Practice to choose a goal.";
    }
    for (const [id, target] of [["pm-checkpoint-save", "pm-practice-set"], ["pm-checkpoint-retry", "pm-practice-retry"], ["pm-checkpoint-rewind", "pm-practice-rewind"]]) {
      wire(id, () => { const b = $(target); if (b && !b.disabled) b.click(); refreshPause(); });
    }
    const pm = $("pausemenu");
    if (pm) new MutationObserver(() => { if (!pm.hidden) refreshPause(); }).observe(pm, { attributes: true, attributeFilter: ["hidden"] });
    const toggle = $("home-motion");
    function scene() {
      const selected = typeof AppearanceStudio !== "undefined" ? selectedScene() : { mode: "static", motion: "still" };
      return { ...selected, ...variation.peek(selected.mode, AppearanceStudio.homeCamera()) };
    }
    function stamp() {
      const s = scene();
      document.documentElement.dataset.homeScene = s.mode;
      if (s.mode === "static") delete document.documentElement.dataset.homeLive;
      else document.documentElement.dataset.homeLive = "1";
      overlay.dataset.homeScene = s.mode;
      overlay.dataset.homeShot = s.shot;
      const photoButton = $("mb-photo"), waiting = ["track", "pitlane"].includes(s.mode) && !deps.trackReady();
      if (photoButton) { photoButton.disabled = waiting; setDoorLabel(photoButton, waiting ? "SCENE LOADING…" : "PHOTO STUDIO"); }
      const photo = typeof PhotoStudio !== "undefined" && PhotoStudio.background ? PhotoStudio.background() : null;
      overlay.style.setProperty("--home-scene-image", s.mode === "photo" && photo ? 'url("' + photo + '")' : "none");
      if (toggle) {
        toggle.hidden = !["garage", "night", "studio", "track", "pitlane"].includes(s.mode);
        const reduce = TitleFx.mode() === "reduce";
        toggle.textContent = reduce ? "BACKGROUND STILL · REDUCED MOTION" : s.motion === "ambient" ? "PAUSE BACKGROUND" : "ANIMATE BACKGROUND";
        toggle.setAttribute("aria-pressed", String(s.motion === "ambient" && !reduce));
        toggle.disabled = reduce;
      }
    }
    wire("home-motion", () => {
      const s = AppearanceStudio.scene(); AppearanceStudio.setScene(s.mode, s.motion === "ambient" ? "still" : "ambient"); stamp();
    });
    if (typeof AppearanceStudio !== "undefined") AppearanceStudio.onSceneChange(() => {
      failure = false; signature = ""; overlay.removeAttribute("data-home-ready"); stamp();
    });
    window.addEventListener("apex26:photo-background", stamp);
    stamp();
    function stopHome(preservePhoto = false) {
      // Clear FX/post `_last` ONLY when tearing down a live Home present.
      // renderHome() calls stopHome() every race frame once the overlay is
      // hidden; clearing then zeroes bloom/fxaa between presents and races any
      // probe that waitForFunction's then re-evaluates postState (Pages
      // 36966538881: M8 day wait saw fxaa, evaluate saw bloom false, diag later
      // saw bloom true). Track/pitlane Home uses world.active(), not `home`.
      const leaving = home || !!(world.active && world.active());
      if (!preservePhoto) photoHomeCamera = null;
      else if (home) photoHomeCamera = deps.setupCam.captureCamera();
      if (home) deps.setupCam.endHome();
      world.end();
      home = false; signature = ""; elapsed = 0; painted = false;
      overlay.removeAttribute("data-home-ready");
      // Home garage presents drawGlow with no blob shadows / car decals. While
      // TLX is still warming, render() can bail and leave that present's FX
      // counters in __tlx.fxState() — M6 on Metal then waited on glow alone and
      // passed on the stale garage frame (run 36951948980 / 36954047730). Clear
      // so a race probe cannot see Home leftovers — once, on leave, not every
      // idle stopHome during a race.
      if (leaving) {
        try {
          const t = G.gfx && G.gfx.__tlx;
          if (t && typeof t.clearFxState === "function") t.clearFxState();
        } catch (_) { /* probe hygiene — never block leaving Home */ }
      }
    }
    // Resize used to sit inside the Home signature (innerWidth/Height + pane),
    // so every narrow rotate tore down beginHome and blacks the canvas for
    // seconds while the garage rebuilds. Signature is scene-only; viewport
    // changes debounce to setSize/aspect (gfx.resize) + one forced present.
    const HOME_RESIZE_MS = 120;
    const PREVIEW_MAX_EDGE = 512;
    let homeViewGen = 0, resizeTimer = 0;
    let lastViewportW = window.innerWidth | 0, lastViewportH = window.innerHeight | 0;
    function settleHomeViewport() {
      resizeTimer = 0;
      homeViewGen++;
      painted = false;
      elapsed = 0;
      try { if (G.gfx && typeof G.gfx.resize === "function") G.gfx.resize(); } catch (_) { /* harness / pre-boot */ }
    }
    function onHomeViewportChange() {
      const w = window.innerWidth | 0, h = window.innerHeight | 0;
      if (w === lastViewportW && h === lastViewportH) return;
      lastViewportW = w; lastViewportH = h;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(settleHomeViewport, HOME_RESIZE_MS);
    }
    window.addEventListener("resize", onHomeViewportChange);
    window.addEventListener("orientationchange", onHomeViewportChange);
    function previewSoftGfx(gfx) {
      if (!gfx) return false;
      try { if (gfx.softPresent && gfx.softPresent()) return true; } catch (_) { /* no soft path */ }
      try {
        const bs = gfx.backendState && gfx.backendState();
        return !!(bs && (bs.softwareGL || bs.softAdapter));
      } catch (_) { return false; }
    }
    function downscalePreview(sourceW, sourceH, paintFull) {
      const scale = Math.min(1, PREVIEW_MAX_EDGE / Math.max(1, sourceW, sourceH));
      const dw = Math.max(1, Math.round(sourceW * scale));
      const dh = Math.max(1, Math.round(sourceH * scale));
      if (scale >= 1) {
        const image = document.createElement("canvas");
        image.width = dw; image.height = dh;
        paintFull(image.getContext("2d"));
        return image;
      }
      const full = document.createElement("canvas");
      full.width = sourceW; full.height = sourceH;
      paintFull(full.getContext("2d"));
      const image = document.createElement("canvas");
      image.width = dw; image.height = dh;
      image.getContext("2d").drawImage(full, 0, 0, dw, dh);
      return image;
    }
    function renderHome(dt) {
      if (previewBusy) return false;
      let s = scene();
      const photoOpen = $("photo-studio") && !$("photo-studio").hidden;
      if (!photoOpen) { photoHomeCamera = null; if (photoScene && !photoSwitching) photoScene = null; }
      const visible = G.state === "menu" && overlay && !overlay.hidden && !document.hidden
        && !G.setupPreviewOn && (["garage", "night", "studio", "track", "pitlane"].includes(s.mode) || photoOpen);
      // Only the title scene and its own photo dock can own this camera.
      const covered = overlay.inert && !photoOpen;
      if (!visible || covered || failure) { variation.leave(); stopHome(photoOpen && G.state === "menu" && !G.setupPreviewOn); return false; }
      const selected = selectedScene();
      const varied = variation.enter(selected.mode, AppearanceStudio.homeCamera(), photoOpen);
      s = _sceneScratch;
      s.mode = (varied && varied.mode) || selected.mode;
      s.shot = (varied && varied.shot) || selected.shot;
      // Motion is AppearanceStudio's alone — homeVariation._values is mode/shot
      // only. Never read varied.motion (a stale own-property would freeze ambient).
      s.motion = selected.motion;
      const motion = s.motion === "ambient" && TitleFx.mode() !== "reduce" && !photoOpen ? "ambient" : "still";
      // Scene ownership only — never viewport size or menu pane (those settle
      // via onHomeViewportChange → gfx.resize / homeViewGen).
      const sig = s.mode + ":" + s.shot + ":" + motion + ":" + photoOpen;
      const trackHome = s.mode === "track" || s.mode === "pitlane";
      // Pane + host rect only when the circuit Home actually needs them (not
      // every garage/night/studio title frame).
      let trackView = null;
      if (trackHome) {
        const rect = !photoOpen && ((window.CssZoom && CssZoom.viewportRect(panel)) || panel.getBoundingClientRect());
        _hostRect.right = innerWidth; _hostRect.bottom = innerHeight;
        _hostRect.width = innerWidth; _hostRect.height = innerHeight;
        _worldView.motion = motion; _worldView.shot = s.shot;
        _worldView.viewKey = String(homeViewGen);
        _worldView.pane = rect ? GarageExperience.freePane(rect, _hostRect) : null;
        trackView = _worldView;
      }
      if (signature !== sig) {
        stopHome(photoOpen); stamp();
        if (trackHome) {
          world.begin(s.mode, trackView); signature = sig;
        } else deps.setupCam.beginHome(["garage", "night", "studio"].includes(s.mode) ? s.mode : "garage", { motion, shot: s.shot, panel: photoOpen ? null : panel });
        home = !!deps.setupCam.homeState(); if (!home && !world.wantsTrack()) return false; signature = sig;
        // Layout refreshes borrow a new Home session, but a photo's shot belongs
        // to the player until DONE, including across a temporary hidden tab.
        if (home && photoOpen && photoHomeCamera) deps.setupCam.restoreCamera(photoHomeCamera);
        photoHomeCamera = null;
      }
      if (trackHome) {
        world.begin(s.mode, trackView);
        if (photoOpen && G.photoMode) deps.updateTrackPhoto(Math.min(dt || 0, 1 / 20));
        return !world.needsFrame(dt, { interactive: photoOpen, force: photoOpen && dt === 0 });
      }
      elapsed += Math.max(0, dt || 0);
      // setupCam session ended out-of-band (openGarage → resetSetupCam during
      // vt). Check before the painted/still throttle — under reduce-motion that
      // path returns true without calling renderHome, which used to freeze the bay.
      if (home && !deps.setupCam.homeState()) { home = false; signature = ""; return false; }
      if (painted && ((!photoOpen && motion === "still") || (dt !== 0 && elapsed < 1 / 24))) return true;
      try {
        const drew = deps.setupCam.renderHome(elapsed);
        if (drew) {
          painted = true; overlay.dataset.homeReady = "1";
          const c = $("game"), soft = $("game-soft"); c.style.visibility = ""; if (soft) soft.style.visibility = "";
          elapsed = 0;
          return true;
        }
        elapsed = 0;
        if (home && !deps.setupCam.homeState()) { home = false; signature = ""; }
        return false;
      } catch (e) {
        failure = true; stopHome(); Log.warn("ui", "Home garage unavailable; static menu retained", e);
        document.documentElement.dataset.homeScene = "static";
        delete document.documentElement.dataset.homeLive;
        overlay.dataset.homeScene = "static";
        return false;
      }
    }
    let previewGeneration = 0, previewBusy = false, previewMode = "", previewQueued = null;
    async function previewScene(preview) {
      preview = { ...preview, ...variation.peek(preview.mode, AppearanceStudio.homeCamera()) };
      if (["static", "photo"].includes(preview.mode)) { previewMode = ""; previewGeneration++; return; }
      if (previewBusy) { previewQueued = preview; previewGeneration++; return; }
      // Viewport size is not part of the key — a rotate must not re-capture.
      const previewKey = [preview.mode, preview.shot, G.teamIdx, GameStore.store.rev].join(":");
      if (!["garage", "night", "studio"].includes(preview.mode)) {
        previewMode = ""; const image = document.querySelector('[data-as="preview"]');
        if (image) image.style.removeProperty("--studio-scene-image"); return;
      }
      if (previewMode === previewKey || $("pmsettings").hidden || $("pm-panel-appearance").hidden) return;
      const generation = ++previewGeneration;
      if (G.state !== "menu" || G.setupPreviewOn || !["garage", "night", "studio"].includes(preview.mode)) return;
      // Yield two frames so Settings › Appearance can paint (and drop aria-busy)
      // before stopHome/beginHome take the main thread for a garage capture.
      const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
      await frame(); await frame();
      if (generation !== previewGeneration || G.state !== "menu" || $("pmsettings").hidden || $("pm-panel-appearance").hidden) return;
      const gfx = G.gfx;
      // Software GL (llvmpipe / SwiftShader) + soft-blit: a full garage capture
      // stalls the menu for seconds; keep the CSS scene fallback instead.
      if (previewSoftGfx(gfx)) { previewMode = previewKey; return; }
      // One real rendered garage frame inside the native settings preview. The
      // borrowed camera is restored even when capture fails or a race starts.
      previewBusy = true;
      try {
        stopHome();
        if (!deps.setupCam.beginHome(preview.mode, { motion: "still", shot: preview.shot, panel: null })) return;
        const readyUntil = performance.now() + 15000;
        while (performance.now() < readyUntil) {
          if (generation !== previewGeneration || G.state !== "menu" || $("pmsettings").hidden || $("pm-panel-appearance").hidden) return;
          if (!(gfx.warming && gfx.warming()) && deps.setupCam.renderHome(0)) break;
          await frame();
        }
        if (performance.now() >= readyUntil) return;
        if (gfx.invalidateSoftPresent && gfx.softPresent && gfx.softPresent()) gfx.invalidateSoftPresent();
        const pending = gfx.softPresent && gfx.softPresent() && gfx.awaitSoftPresent ? gfx.awaitSoftPresent(10000) : null;
        if (!deps.setupCam.renderHome(0)) { if (pending) pending.catch(() => {}); return; }
        const pixelsPromise = gfx.capturePixels ? gfx.capturePixels() : Promise.resolve(null);
        const pixels = pending ? (await Promise.all([pixelsPromise, pending]))[0] : await pixelsPromise;
        if (generation !== previewGeneration || G.state !== "menu" || $("pmsettings").hidden || $("pm-panel-appearance").hidden || scene().mode !== preview.mode || scene().shot !== preview.shot) return;
        let image;
        if (pixels && pixels.data) {
          image = downscalePreview(pixels.width, pixels.height, (ctx) => {
            ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels.data), pixels.width, pixels.height), 0, 0);
          });
        } else {
          const source = $("game-soft") || $("game");
          image = downscalePreview(source.width, source.height, (ctx) => ctx.drawImage(source, 0, 0));
        }
        AppearanceStudio.setPreviewFrame(image.toDataURL("image/jpeg", .75)); previewMode = previewKey;
      } catch (e) { Log.debug("ui", "Garage appearance preview unavailable: " + e.message); }
      finally { deps.setupCam.endHome(); previewBusy = false; if (previewQueued) { const latest = previewQueued; previewQueued = null; queueMicrotask(() => previewScene(latest)); } }
    }
    /** Photo Studio's SUBJECT: "circuit" / "garage" lays that scene over the
     *  stored one for this visit, null restores it. Resolves true once the
     *  swapped scene has rendered (and, for the circuit, its world is ready),
     *  false after 20 s, a race start or a newer pick. */
    function photoSubject(mode) {
      const want = mode === "circuit" ? "track" : mode === "garage" ? "garage" : null;
      const gen = ++photoSwitch;
      photoScene = want; photoSwitching = !!want; signature = "";
      delete overlay.dataset.homeReady; stamp();
      if (!want) return Promise.resolve(true);
      return new Promise((resolve) => {
        const t0 = Date.now();
        const done = (ok) => { if (gen === photoSwitch) photoSwitching = false; resolve(ok); };
        const tick = () => {
          if (gen !== photoSwitch || photoScene !== want || G.state !== "menu") { done(false); return; }
          if (overlay.dataset.homeReady === "1" && (want !== "track" || deps.trackReady())) { done(true); return; }
          if (Date.now() - t0 > 20000) { done(false); return; }
          setTimeout(tick, 100);
        };
        tick();
      });
    }
    function photoView() {
      const s = scene();
      if (G.state !== "menu" || !deps.trackReady() || !["track", "pitlane"].includes(s.mode)) return null;
      // Sample the prepared scene without borrowing the covered menu camera or
      // scheduling a world build. This controller owns no renderer resources.
      const view = HomeWorld.create(G, { eligible: () => true, worldReady: deps.trackReady, capture: () => null, restore: () => {} });
      view.begin(s.mode, { shot: s.shot, motion: "still" });
      const pose = view.camera(); view.end(); return pose;
    }
    return { renderHome, stopHome, refreshPause, previewScene, photoView, photoSubject, wantsTrack: world.wantsTrack, trackActive: world.active,
      trackCamera: world.camera, didRenderTrack: () => { if (!world.didRender()) return; overlay.dataset.homeReady = "1";
        const photoButton = $("mb-photo"); if (photoButton) { photoButton.disabled = false; setDoorLabel(photoButton, "PHOTO STUDIO"); }
        $("game").style.visibility = ""; const soft = $("game-soft"); if (soft) soft.style.visibility = ""; },
      state: () => ({ home, painted, failure, scene: scene(), world: world.state() }) };
  }
  return { create, raceBrief, openPhoto, homeVariation, isPracticePick, leavePracticePick };
})();
Object.freeze(UiExperience);
