"use strict";
const LoadingScreen = (function () {
  const {
    FLY_MS, isAutomation, CARD_MS, SHORT_FLY_MS, SKIP_GRACE_MS, SKIP_STREAK, FLY_MAX_MS,
    flyMsFor, packSettled, warmPresentReady, metaRows, nextSkips,
    CARD, CARD_KEYS, clampCard, cardPristine, cardVars,
    isGridShot, gridField, gridLayout, gridColour, gridInk, GRID_ROW_MIN,
  } = LoadingCard;

  function fitCard(byId) {
    if (typeof byId !== "function") return;
    const c = byId("ld-card"), r = byId("loading");
    if (!c || !c.style || typeof c.style.setProperty !== "function" || !r || r.hidden) return;
    if (typeof getComputedStyle !== "function" || typeof c.offsetHeight !== "number") return;
    c.style.setProperty("--ld-fit", "1");
    const cap = parseFloat(getComputedStyle(c).maxHeight);
    c.style.maxHeight = "none";
    const natural = c.offsetHeight;
    c.style.maxHeight = "";
    if (!(cap > 0) || !(natural > cap + 0.5)) return;
    c.style.setProperty("--ld-fit", (cap / natural).toFixed(3));
  }

  function create(hooks) {
    const { $, Tracks, TrackMaps, Flags, store } = hooks;
    const ann = () => {
      const a = typeof hooks.announcer === "function" ? hooks.announcer() : hooks.announcer;
      return a && typeof a.play === "function" ? a : null;
    };

    const radio = () => {
      const r = typeof hooks.radio === "function" ? hooks.radio() : hooks.radio;
      return r && typeof r.sayPreRace === "function" ? r : null;
    };

    let timer = 0, phase = "", build = null, el = null, flyT0 = 0, flyMs = FLY_MS, skipCb = null;
    let fromGarage = false, wipeTimer = 0;
    const WIPE_MS = 900;
    let garageRadioT = 0;
    let cur = null, view = "map", radioState = "", mapBox = null, markN = 0;

    function readSkips() {
      try { return store && store.get ? store.get("flySkips", 0) : 0; } catch (_) { return 0; }
    }
    function noteFlyby(skipped) {
      if (phase !== "run") return;
      try { if (store && store.set) store.set("flySkips", nextSkips(readSkips(), skipped)); }
      catch (_) {  }
    }

    const MAP_W = 210, MAP_H = 150;

    let geom = null;
    function cardGeom() {
      if (geom) return geom;
      let saved = null;
      try { saved = store && store.get ? store.get("ldCard", null) : null; } catch (_) { saved = null; }
      geom = clampCard(saved);
      return geom;
    }
    function setCardGeom(patch) {
      geom = clampCard(Object.assign({}, cardGeom(), patch));
      try { if (store && store.set) store.set("ldCard", cardPristine(geom) ? null : geom); }
      catch (e) { Log.warn("game", "loading card geometry did not save", e); }
      applyCard();
      return Object.assign({}, geom);
    }
    function applyCard() {
      const c = $("ld-card");
      if (!c || !c.style || typeof c.style.setProperty !== "function") return;
      const vars = cardVars(cardGeom());
      for (const k in vars) c.style.setProperty(k, vars[k]);
      fitCard($);
    }

    function root() { return el || (el = $("loading")); }
    if (typeof addEventListener === "function") addEventListener("resize", () => { if (phase) fitCard($); });

    function paint(info) {
      const t = info.track;
      if (!t) return;
      $("ld-flag").innerHTML = Flags.svg(t.country);
      const tod = info.tod || "default";
      $("ld-name").textContent = t.name + (tod === "night" || (tod === "default" && t.night) ? " ☾" : "");
      $("ld-gp").textContent = info.gp || t.gp || t.country || "";
      const rows = metaRows(info, TrackMaps.corners(t).length);
      drawMap(t);
      const meta = $("ld-meta");
      if (typeof meta.replaceChildren === "function") meta.replaceChildren(); else meta.textContent = "";
      for (const [k, v] of rows) {
        const pair = document.createElement("div");
        const dt = document.createElement("dt"); dt.textContent = k;
        const dd = document.createElement("dd"); dd.textContent = v;
        pair.append(dt, dd);
        meta.appendChild(pair);
      }
    }

    function drawMap(t, mark) {
      const cv = $("ld-map");
      if (!cv || !TrackMaps || typeof TrackMaps.draw !== "function") return;
      try {
        const fit = TrackMaps.fitCanvas(cv, MAP_W, MAP_H, t, true);
        mapBox = { w: fit.w, h: fit.h };
        markN = mark > 0 ? mark | 0 : 0;
        if (cv.dataset) cv.dataset.turn = markN ? String(markN) : "";
        setView(cv, "map", markN ? "Circuit layout, turn " + markN + " on camera" : "Circuit layout");
        const ratio = Math.min(3, Math.max(1, (window.devicePixelRatio || 1) * cardGeom().scale));
        if (ratio > 1.01) {
          cv.width = Math.round(fit.w * ratio);
          cv.height = Math.round(fit.h * ratio);
        }
        const br = fit.w ? (cv.width / fit.w) : 1;
        const lw = Math.max(2, Math.round(Math.min(fit.w, fit.h) / 42));
        TrackMaps.draw(cv, t, {
          color: "#ffffff", casing: "rgba(0,0,0,0.55)", startColor: "#e10600",
          width: lw * br, pad: Math.round(lw * 1.5) * br,
          corners: false, sectors: false, drs: false, mark: markN, markFont: Math.round(11 * br),
        });
      } catch (_) {  }
    }

    function flyU() {
      if (phase !== "run" || !flyT0) return 0;
      return Math.max(0, Math.min(1, (Date.now() - flyT0) / flyMs));
    }

    function setView(cv, v, label) {
      view = v;
      if (cv.dataset) cv.dataset.view = v;
      if (typeof cv.setAttribute === "function") cv.setAttribute("aria-label", label);
    }

    function drawGrid(field) {
      const cv = $("ld-map");
      if (!cv || !mapBox || typeof cv.getContext !== "function") return false;
      try {
        const ctx = cv.getContext("2d");
        if (!ctx) return false;
        const shown = cv.clientWidth > 0 ? cv.clientWidth / mapBox.w : 1;
        const w = mapBox.w * shown, h = mapBox.h * shown;
        const me = field.findIndex((c) => c.isPlayer);
        const L = gridLayout(field, w, h, me);
        const k = cv.width / w;
        ctx.setTransform(k, 0, 0, k, 0, 0);
        ctx.clearRect(0, 0, w, h);
        if (L.cells.length) {
          const c0 = L.cells[0], c1 = L.cells[Math.min(1, L.cells.length - 1)];
          ctx.fillStyle = "#e10600";
          ctx.fillRect(c0.x, 1, c1.x + c1.w - c0.x, 2);
        }
        ctx.textBaseline = "middle";
        for (const c of L.cells) {
          const team = gridColour(c.colour);
          ctx.fillStyle = c.isPlayer ? team : "rgba(0,0,0,0.55)";
          ctx.fillRect(c.x, c.y, c.w, c.h);
          ctx.fillStyle = team;
          ctx.fillRect(c.x, c.y, 3, c.h);
          if (c.isPlayer) {
            ctx.strokeStyle = "#ffffff"; ctx.lineWidth = 1.5;
            ctx.strokeRect(c.x + 0.75, c.y + 0.75, c.w - 1.5, c.h - 1.5);
          }
          const mid = c.y + c.h / 2;
          if (L.showPos) {
            ctx.font = "600 " + Math.round(L.font * 0.8) + "px system-ui, sans-serif";
            ctx.fillStyle = c.isPlayer ? gridInk(c.colour) : "rgba(255,255,255,0.7)";
            ctx.fillText(String(c.pos), c.x + 6, mid);
          }
          if (c.code) {
            ctx.font = "700 " + L.font + "px system-ui, sans-serif";
            ctx.fillStyle = c.isPlayer ? gridInk(c.colour) : "#ffffff";
            ctx.fillText(c.code, c.x + 6 + (L.showPos ? L.font * 1.35 : 0), mid);
          }
        }
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        setView(cv, "grid", "Starting grid, you start P" + (me + 1));
        return true;
      } catch (_) { return false; }
    }

    function watchShot() {
      if (phase !== "run" || !build || !cur || typeof FlybySeq === "undefined" || !FlybySeq.shotAt) return;
      let id = "";
      try { id = FlybySeq.shotAt(flyU(), cur.shots).id; } catch (_) { return; }
      const field = gridField(cur.grid);
      const want = field && isGridShot(id) ? "grid" : "map";
      let turn = 0;
      if (want === "map" && typeof FlybySeq.airCorner === "function") { try { turn = FlybySeq.airCorner() | 0; } catch (_) { turn = 0; } }
      if (want !== view || (want === "map" && turn !== markN)) {
        if (want === "map") drawMap(cur.track, turn);
        else if (!drawGrid(field)) cur.grid = null;
      }
      if (id === "grid-mine" && !radioState) radioCheck(field);
    }

    const RADIO_MIN_S = 2.2;
    function cutRadio() {
      if (radioState !== "live") return;
      radioState = "done";
      const r = radio();
      if (r) { try { r.stop(); } catch (_) {  } }
    }
    function annLife(info, life) {
      const r = radio();
      let chat = "normal";
      try { chat = store && store.get ? store.get("radioChat", "normal") : "normal"; } catch (_) { chat = "normal"; }
      let on = false;
      try { on = !!(r && r.debug && r.debug().enabled); } catch (_) { on = false; }
      if (!on || (chat !== "normal" && chat !== "chatty")) return life;
      if (!gridField(info && info.grid)) return life;
      const list = info && info.shots && info.shots.length ? info.shots : null;
      if (!list) return life;
      let total = 0, before = -1;
      for (const sh of list) { if (sh.id === "grid-mine" && before < 0) before = total; total += sh.dur || 0; }
      if (before < 0 || !(total > 0)) return life;
      if (life * (total - before) / total < RADIO_MIN_S * 1000) return life;
      const share = life * before / total - 150;
      return share > 0 ? Math.min(life, share) : -1;
    }
    function radioCheck(field) {
      const r = radio();
      const left = (flyMs - (Date.now() - flyT0)) / 1000;
      let chat = "normal";
      try { chat = store && store.get ? store.get("radioChat", "normal") : "normal"; } catch (_) { chat = "normal"; }
      const me = field ? field.findIndex((c) => c.isPlayer) : -1;
      if (!r || me < 0 || (chat !== "normal" && chat !== "chatty") || !(left >= RADIO_MIN_S)
        || typeof RadioLines === "undefined") { radioState = "done"; return; }
      const a = ann();
      if (a && typeof a.speaking === "function" && a.speaking()) return;
      radioState = "done";
      const text = RadioLines.create((flyT0 >>> 0) || 1).pick("eng.grid", { pos: me + 1 });
      if (!text) return;
      const lead = typeof GameAudio !== "undefined" && GameAudio.radioLeadS ? GameAudio.radioLeadS("radio") : 0;
      try {
        const secs = r.sayPreRace(text, left, lead);
        if (!secs) return;
        radioState = "live";
        const hold = typeof secs === "number" ? Math.min(left, secs + 0.6) : left;
        if (typeof GameAudio !== "undefined" && GameAudio.radioSting) GameAudio.radioSting("radio", hold);
      } catch (e) { Log.warn("audio", "radio check failed", e); }
    }

    function setPhase(p) {
      phase = p;
      const r = root();
      if (r) r.dataset.phase = p;
      fitCard($);
      if (fromGarage && p !== "garage" && p !== "prep") wipe(r);
      fromGarage = false;
    }
    function teamWipe() {
      try {
        const t = typeof Teams !== "undefined" && Teams.LIST && Teams.LIST[store && store.get ? store.get("team", 2) : 2];
        if (!t || !Array.isArray(t.color)) return null;
        const lum = 0.2126 * t.color[0] + 0.7152 * t.color[1] + 0.0722 * t.color[2];
        return gridColour(lum < 0.18 && Array.isArray(t.color2) ? t.color2 : t.color);
      } catch (_) { return null; }
    }
    function wipe(r) {
      const c = r && r.style ? teamWipe() : null;
      if (!c) return;
      r.style.setProperty("--ld-wipe", c);
      delete r.dataset.wipe;
      void r.offsetWidth;
      r.dataset.wipe = "";
      clearTimeout(wipeTimer);
      wipeTimer = setTimeout(() => { delete r.dataset.wipe; }, WIPE_MS);
    }

    function fire() {
      clearTimeout(timer);
      timer = 0;
      const go = build;
      build = null;
      if (go) go();
    }

    function onSkip(e) {
      if (e && e.type === "keydown" && e.repeat) return;
      if (phase === "garage" || ((phase === "build" || phase === "prep") && skipCb)) {
        if (!skipCb || Date.now() - flyT0 < SKIP_GRACE_MS) return;
        if (e) { if (e.cancelable && e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
        const cb = skipCb; skipCb = null;
        cb();
        return;
      }
      if (!(phase && build) || Date.now() - flyT0 < SKIP_GRACE_MS) return;
      if (e) { if (e.cancelable && e.preventDefault) e.preventDefault(); if (e.stopPropagation) e.stopPropagation(); }
      noteFlyby(true); cutRadio();
      const a = ann();
      if (a) { try { a.stop(); } catch (_) {  } }
      fire();
    }
    let padTimer = 0;
    const padHeld = new Set();
    function padButtons(fn) {
      let pads = [];
      try { pads = (typeof navigator !== "undefined" && navigator.getGamepads && navigator.getGamepads()) || []; } catch (_) { pads = []; }
      for (const p of pads) {
        if (!p || !p.buttons) continue;
        for (let i = 0; i < p.buttons.length; i++) fn(p.index + ":" + i, !!(p.buttons[i] && p.buttons[i].pressed));
      }
    }
    function pollPad() {
      let fresh = false;
      padButtons((k, down) => {
        if (!down) padHeld.delete(k);
        else if (!padHeld.has(k)) { padHeld.add(k); fresh = true; }
      });
      if (fresh) onSkip();
    }

    function run(info, go) {
      stop();
      build = typeof go === "function" ? go : null;
      cur = info; view = "map"; radioState = "";
      const r = root();
      if (!r) { fire(); return; }
      paint(info);
      applyCard();
      r.hidden = false;
      const fly = !!info.hasWorld && !isAutomation() && !(typeof document !== "undefined" && document.hidden);
      addEventListener("pointerdown", onSkip, true);
      addEventListener("keydown", onSkip, true);
      padHeld.clear();
      padButtons((k, down) => { if (down) padHeld.add(k); });
      if (typeof setInterval === "function") padTimer = setInterval(() => { pollPad(); watchShot(); }, 100);
      flyT0 = Date.now();
      setPhase(fly ? "run" : "card");
      const life = fly ? flyMsFor(readSkips(), info.readMs, info.warmReady) : CARD_MS;
      flyMs = fly ? life : FLY_MS;
      if (r.style && typeof r.style.setProperty === "function") r.style.setProperty("--ld-fly", life + "ms");
      timer = setTimeout(() => { noteFlyby(false); fire(); }, life);
      if (fly) {
        const a = ann();
        if (a) { try { a.play(info, annLife(info, life)); } catch (e) { Log.warn("audio", "announcer failed", e); } }
      }
    }

    function stop() {
      clearTimeout(timer);
      timer = 0;
      build = null; skipCb = null;
      fromGarage = phase === "garage";
      if (garageRadioT) { clearTimeout(garageRadioT); garageRadioT = 0; }
      phase = "";
      const a = ann();
      if (a) { try { a.stop(); } catch (_) {  } }
      cutRadio();
      cur = null;
      removeEventListener("pointerdown", onSkip, true);
      removeEventListener("keydown", onSkip, true);
      if (padTimer) { clearInterval(padTimer); padTimer = 0; }
      const r = root();
      if (r) { r.hidden = true; r.dataset.phase = ""; }
    }

    function hold(info) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      paint(info);
      applyCard();
      r.hidden = false;
      setPhase("hold");
      return true;
    }

    function building(info, onSkipCb) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("build");
      armSkip(onSkipCb);
      return true;
    }

    function prep(info, onSkipCb) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("prep");
      armSkip(onSkipCb);
      return true;
    }

    function garage(info, onSkipCb) {
      stop();
      const r = root();
      if (!r || !info || !info.track) return false;
      cur = info; paint(info);
      applyCard();
      r.hidden = false;
      setPhase("garage");
      armSkip(onSkipCb);
      garageRadioT = setTimeout(garageRadio, GARAGE_RADIO_MS);
      return true;
    }
    const PIT_CLEAR = ["Box clear. Go, go, go.", "Lane's clear. Off you go.", "You're clear. Limiter on."];
    const GARAGE_RADIO_MS = 2600, GARAGE_RADIO_LIFE_S = 4;
    function garageRadio() {
      garageRadioT = 0;
      if (phase !== "garage") return;
      const r = radio();
      let chat = "normal";
      try { chat = store && store.get ? store.get("radioChat", "normal") : "normal"; } catch (_) { chat = "normal"; }
      if (!r || typeof r.sayPreRace !== "function" || (chat !== "normal" && chat !== "chatty")) return;
      const a = ann();
      if (a && typeof a.speaking === "function" && a.speaking()) return;
      const lead = typeof GameAudio !== "undefined" && GameAudio.radioLeadS ? GameAudio.radioLeadS("radio") : 0;
      try {
        const secs = r.sayPreRace(PIT_CLEAR[(Date.now() >>> 10) % PIT_CLEAR.length], GARAGE_RADIO_LIFE_S, lead);
        if (secs && typeof GameAudio !== "undefined" && GameAudio.radioSting)
          GameAudio.radioSting("radio", Math.min(GARAGE_RADIO_LIFE_S, (typeof secs === "number" ? secs : 2) + 0.6));
      } catch (e) { Log.warn("audio", "garage radio failed", e); }
    }
    function armSkip(onSkipCb) {
      skipCb = typeof onSkipCb === "function" ? onSkipCb : null;
      if (skipCb) {
        flyT0 = Date.now();
        addEventListener("pointerdown", onSkip, true);
        addEventListener("keydown", onSkip, true);
        padHeld.clear();
        padButtons((k, down) => { if (down) padHeld.add(k); });
        if (typeof setInterval === "function") padTimer = setInterval(pollPad, 100);
      }
    }

    function handoff() {
      stop();
      const r = root();
      if (!r) return false;
      r.hidden = false;
      setPhase("handoff");
      return true;
    }

    function lowerWaitPlate() {
      if (phase === "handoff" || phase === "busy" || phase === "build" || phase === "garage" || phase === "prep") stop();
    }

    function busy(label) {
      if (phase === "run" || phase === "card" || phase === "build" || phase === "handoff"
        || phase === "garage" || phase === "busy" || phase === "prep") return true;
      const r = root();
      if (!r) return false;
      const title = (typeof label === "string" && label.trim()) ? label.trim() : "Loading";
      applyCard();
      r.hidden = false;
      if (typeof r.setAttribute === "function") r.setAttribute("aria-label", title);
      const name = $("ld-name"); if (name) name.textContent = title.toUpperCase();
      const gp = $("ld-gp"); if (gp) gp.textContent = "Please wait";
      const meta = $("ld-meta");
      if (meta) { if (typeof meta.replaceChildren === "function") meta.replaceChildren(); else meta.textContent = ""; }
      const flag = $("ld-flag"); if (flag) flag.innerHTML = "";
      setPhase("busy");
      return true;
    }

    return {
      run, stop, hold, building, prep, garage, handoff, busy, lowerWaitPlate,
      packSettled, warmPresentReady,
      nextFlyMs: (wantMs, warmReady) => flyMsFor(readSkips(), wantMs, warmReady),
      card: () => Object.assign({}, cardGeom()),
      setCard: (patch) => setCardGeom(patch),
      resetCard() { geom = clampCard(null); return setCardGeom({}); },
      progress: () => flyU(),
      active() { return phase === "run" || phase === "card"; },
      phase() { return phase; },
    };
  }

  const SLOW_TEXT = "SLOW CONNECTION — still loading…";
  function slowNotice() {
    if (typeof document === "undefined" || !document.getElementById) return false;
    const r = document.getElementById("loading"), gp = document.getElementById("ld-gp");
    if (!r || r.hidden || !gp) return false;
    gp.textContent = SLOW_TEXT;
    return true;
  }

  const FAIL_TEXT = "COULD NOT LOAD — check your connection";
  function failed() {
    const r = typeof document !== "undefined" && document.getElementById ? document.getElementById("loading") : null;
    const gp = r && document.getElementById("ld-gp"), host = r && document.getElementById("ld-text");
    if (!r || r.hidden || !gp || !host) return Promise.resolve("back");
    gp.textContent = FAIL_TEXT;
    return new Promise((resolve) => {
      const row = document.createElement("div");
      row.id = "ld-fail";
      const add = (label, choice) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "opt-btn"; b.textContent = label;
        b.addEventListener("click", () => { row.remove(); if (choice === "retry") gp.textContent = "Please wait"; resolve(choice); });
        row.appendChild(b);
      };
      add("Retry", "retry"); add("Back to menu", "back");
      host.appendChild(row);
    });
  }

  return { create, slowNotice, failed, SLOW_TEXT, FAIL_TEXT, isAutomation, FLY_MS, SHORT_FLY_MS, FLY_MAX_MS, SKIP_GRACE_MS, SKIP_STREAK, flyMsFor, metaRows, nextSkips, CARD_MS, CARD, CARD_KEYS, clampCard, cardPristine, cardVars, fitCard,
    packSettled, warmPresentReady,
    gridLayout, gridField, gridColour, gridInk, isGridShot, GRID_ROW_MIN };
})();
Object.freeze(LoadingScreen);
