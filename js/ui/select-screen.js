const Menus = (function () {
  "use strict";

function create(G) {
Log.info("ui", "Menus.create");
if (typeof GfxEscalation !== "undefined" && GfxEscalation.noteCleanMenuBoot) GfxEscalation.noteCleanMenuBoot();
const { $, els, store, cssCol, fmtTime, ttBoard, scheduleFlybyTrack } = G;
const liveBoard = (t) => typeof Ghost === "undefined" ? ttBoard(t.id)
  : ttBoard(t.id).filter((e) => Ghost.layoutRevision(e.context) === (t.revision || 1));

const saveWarning = $("save-warning");
const saveWarningDetail = $("save-warning-detail");
const saveDismiss = $("save-dismiss");
const writeFailed = () => (store.writeFailed ? store.writeFailed() : store.broken);
let saveSpoken = false;
const sayOnce = (text) => {
  const live = $("announce-live");
  if (saveSpoken || !live) return;
  saveSpoken = true;
  if (typeof LiveRegion !== "undefined") LiveRegion.say(text, "save");
  else live.textContent = text;
};
const setSaveCollapsed = (on) => {
  if (!saveWarning) return;
  if (on) saveWarning.dataset.collapsed = ""; else delete saveWarning.dataset.collapsed;
  if (saveDismiss) {
    saveDismiss.setAttribute("aria-expanded", on ? "false" : "true");
    saveDismiss.textContent = on ? "NOT SAVING" : "DISMISS";
  }
};
const showSaveWarning = (reason) => {
  if (!saveWarning) return;
  saveWarning.hidden = false;
  saveWarningDetail.textContent = "Progress will be lost when this page closes or reloads"
    + (reason ? " (" + reason + ")." : ".");
  sayOnce("Saving unavailable. Progress will be lost when this page closes or reloads.");
};
const hideSaveWarning = () => {
  if (!saveWarning) return;
  saveWarning.hidden = true;
  setSaveCollapsed(false);
  saveSpoken = false;
};
if (saveDismiss) saveDismiss.onclick = () => setSaveCollapsed(saveDismiss.getAttribute("aria-expanded") === "true");
if (writeFailed()) showSaveWarning(writeFailed());
store.subscribe((change) => {
  if (change && change.local && change.durable === false) showSaveWarning(change.reason);
});

const retrySave = () => {
  const results = [];
  if (typeof Career !== "undefined" && Career.data && Career.data() &&
      (!store.careerWriteStatus || store.careerWriteStatus().ok)) {
    Career.save(); results.push(Career.saveStatus());
  }
  if (G.season && !(typeof Career !== "undefined" && Career.inCareer && Career.inCareer()))
    results.push(SeasonCal.save(G.season));
  const rest = store.retryFailed();
  if (rest.retried) results.push(rest);
  if (!results.length) results.push(store.write("saveProbe", { at: Date.now() }));
  const durable = results.every((r) => r && r.durable);
  if (durable) {
    store.broken = null;
    hideSaveWarning();
    if (G.announce) G.announce("SAVE RESTORED");
  } else showSaveWarning((results.find((r) => r && r.reason) || {}).reason || store.broken);
};
let recoveryExporting = false;
const exportRecovery = async () => {
  if (recoveryExporting) return;
  recoveryExporting = true;
  const button = $("save-export");
  if (button) button.disabled = true;
  try {
    const payload = {
      format: "apex26-recovery-v1",
      exportedAt: new Date().toISOString(),
      build: (window.__APEX_BUILD || null),
      career: typeof Career !== "undefined" && Career.data ? Career.data() : null,
      season: G.season || null,
      persistence: { durable: false, reason: writeFailed() || store.broken || "unknown" },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const name = "apex26-recovery-" + Date.now() + ".json";
    if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
      await NativeDownload.saveBlob(blob, name);
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
    if (G.announce) G.announce("RECOVERY EXPORTED");
  } catch (e) {
    if (G.announce) G.announce(typeof NativeDownload !== "undefined" && NativeDownload.isCancelled(e) ? "RECOVERY EXPORT CANCELLED" : "RECOVERY EXPORT FAILED");
  } finally {
    recoveryExporting = false;
    if (button) button.disabled = false;
  }
};
if ($("save-retry")) $("save-retry").onclick = retrySave;
if ($("save-export")) $("save-export").onclick = exportRecovery;
if (typeof SaveHealth !== "undefined" && saveWarning) SaveHealth.mount(saveWarning, { store });

const CTX_LOST_NOTICE_KEY = "apex26.ctxLostNotice";
const CTX_LOST_NEED_RELOAD_KEY = "apex26.ctxLostNeedReload";
const CTX_LOST_EXHAUSTED_KEY = "apex26.ctxLostExhausted";
const CTX_LOST_NOTICE_MSG = "Graphics reset — retrying with lighter settings";
const CTX_LOST_EXHAUSTED_MSG = "Graphics keep resetting — reload or pick another RENDERER";
let ctxLostNotice = $("ctx-lost-notice");
if (!ctxLostNotice) {
  ctxLostNotice = document.createElement("aside");
  ctxLostNotice.id = "ctx-lost-notice";
  ctxLostNotice.hidden = true;
  ctxLostNotice.setAttribute("role", "status");
  ctxLostNotice.setAttribute("aria-labelledby", "ctx-lost-notice-title");
  const title = document.createElement("strong");
  title.id = "ctx-lost-notice-title";
  title.textContent = "GRAPHICS RESET";
  const detail = document.createElement("span");
  detail.id = "ctx-lost-notice-detail";
  detail.textContent = CTX_LOST_NOTICE_MSG;
  const retry = document.createElement("button");
  retry.id = "ctx-lost-retry";
  retry.type = "button";
  retry.textContent = "RETRY";
  const dismiss = document.createElement("button");
  dismiss.id = "ctx-lost-dismiss";
  dismiss.type = "button";
  dismiss.textContent = "DISMISS";
  dismiss.setAttribute("aria-expanded", "true");
  ctxLostNotice.append(title, detail, retry, dismiss);
  document.body.appendChild(ctxLostNotice);
  Object.assign(ctxLostNotice.style, {
    position: "fixed", zIndex: "8500", top: "max(8px, env(safe-area-inset-top, 0px))", left: "50%",
    transform: "translateX(-50%)", width: "min(48rem, calc(100vw - 16px))", display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto auto", gap: "8px", padding: "8px",
    border: "1px solid rgba(255, 209, 128, 0.72)", borderRadius: "8px",
    background: "rgba(25, 18, 8, 0.96)", color: "#fff3d6", fontSize: "12px",
  });
  for (const btn of ctxLostNotice.querySelectorAll("button")) {
    Object.assign(btn.style, {
      minHeight: "44px", padding: "0 8px", border: "1px solid rgba(255,255,255,.2)",
      borderRadius: "999px", background: "rgba(255,255,255,.08)", color: "#fff", fontWeight: "800",
    });
  }
}
let ctxLostSpoken = false;
const hideCtxLostNotice = () => {
  if (!ctxLostNotice) return;
  ctxLostNotice.hidden = true;
  delete ctxLostNotice.dataset.collapsed;
  if ($("ctx-lost-dismiss")) {
    $("ctx-lost-dismiss").setAttribute("aria-expanded", "true");
    $("ctx-lost-dismiss").textContent = "DISMISS";
  }
  ctxLostSpoken = false;
};
const showCtxLostNotice = () => {
  let pending = false;
  try {
    pending = sessionStorage.getItem(CTX_LOST_NOTICE_KEY) === "1";
    if (pending) sessionStorage.removeItem(CTX_LOST_NOTICE_KEY);
  } catch (_) {  pending = true; }
  if (!pending || !ctxLostNotice || G.state !== "menu") return;
  ctxLostNotice.hidden = false;
  let exhausted = false;
  try { exhausted = sessionStorage.getItem(CTX_LOST_EXHAUSTED_KEY) === "1"; } catch (_) {  }
  if (exhausted) try { sessionStorage.removeItem(CTX_LOST_EXHAUSTED_KEY); } catch (_) {  }
  const msg = exhausted ? CTX_LOST_EXHAUSTED_MSG : CTX_LOST_NOTICE_MSG;
  const detail = $("ctx-lost-notice-detail");
  if (detail) detail.textContent = msg;
  if (!ctxLostSpoken) {
    ctxLostSpoken = true;
    const said = msg + ". Press Retry to start again.";
    if (typeof LiveRegion !== "undefined") LiveRegion.say(said, "save");
    else if ($("announce-live")) $("announce-live").textContent = said;
  }
  if (G.announce) G.announce(msg, 5, "info");
};
if ($("ctx-lost-dismiss")) $("ctx-lost-dismiss").onclick = () => hideCtxLostNotice();
if ($("ctx-lost-retry")) $("ctx-lost-retry").onclick = () => {
  let needReload = false;
  try { needReload = sessionStorage.getItem(CTX_LOST_NEED_RELOAD_KEY) === "1"; } catch (_) {  }
  if (needReload) {
    try { sessionStorage.setItem(CTX_LOST_NOTICE_KEY, "1"); } catch (_) {  }
    try { sessionStorage.removeItem(CTX_LOST_NEED_RELOAD_KEY); } catch (_) {  }
    hideCtxLostNotice();
    try { location.reload(); } catch (_) {  }
    return;
  }
  hideCtxLostNotice();
  if (G.startRace) G.startRace();
};
const bindCtxLostNoticeOnMenuExit = () => {
  if (G.startRace) {
    const raceStart = G.startRace;
    Object.defineProperty(G, "startRace", {
      configurable: true,
      enumerable: true,
      value(...args) {
        hideCtxLostNotice();
        return raceStart.apply(G, args);
      },
    });
  }
  const stateDesc = Object.getOwnPropertyDescriptor(G, "state");
  if (stateDesc && stateDesc.get && stateDesc.set) {
    Object.defineProperty(G, "state", {
      configurable: true,
      enumerable: stateDesc.enumerable,
      get() { return stateDesc.get.call(G); },
      set(v) {
        const wasMenu = stateDesc.get.call(G) === "menu";
        stateDesc.set.call(G, v);
        if (wasMenu && v !== "menu") hideCtxLostNotice();
      },
    });
  }
};
bindCtxLostNoticeOnMenuExit();
showCtxLostNotice();

const restoreMenuAfterGraphicsReset = () => {
  const closeDialog = (el) => {
    if (!el) return;
    el.hidden = true;
    try { if (el.open && typeof el.close === "function") el.close(); } catch (_) {  }
  };
  closeDialog($("race-settings"));
  closeDialog($("loading"));
  if (els.select) els.select.hidden = true;
  if (els.overlay) {
    els.overlay.hidden = false;
    if ("inert" in els.overlay) els.overlay.inert = false;
    els.overlay.removeAttribute("aria-hidden");
    delete els.overlay.dataset.homeReady;
  }
  if (typeof TopModal !== "undefined" && TopModal.syncMenuIsolation) TopModal.syncMenuIsolation();
  if (typeof TitleMenu !== "undefined" && TitleMenu.repairDestinations) TitleMenu.repairDestinations(document);
  if (typeof document !== "undefined" && document.documentElement) {
    delete document.documentElement.dataset.homeLive;
    document.documentElement.dataset.homeScene = "static";
  }
  if (els.overlay) els.overlay.dataset.homeScene = "static";
  try { if (G.gfx && G.gfx.invalidateSoftPresent) G.gfx.invalidateSoftPresent(); } catch (_) {  }
  if (G.scheduleFlybyTrack) G.scheduleFlybyTrack(true);
};

const vtReduce = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
const vtPhone = window.matchMedia
  ? (window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(hover: none)").matches)
  : false;
const SHOWN = "#overlay:not([hidden]), .screen:not([hidden])";
const fadeIn = (fn) => {
  const before = new Set(document.querySelectorAll(SHOWN));
  fn();
  for (const s of document.querySelectorAll(SHOWN)) {
    if (!before.has(s) && s.animate) s.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: "cubic-bezier(0, 0, 0.2, 1)" });
  }
};
const vt = (fn) => {
  if (!document.startViewTransition || vtReduce.matches
    || document.documentElement.dataset.motion === "reduce") { fn(); return; }
  if (vtPhone) { fadeIn(fn); return; }
  let applied = false;
  const run = () => { if (applied) return; applied = true; fn(); };
  try {
    const t = document.startViewTransition(run);
    if (t) for (const p of [t.ready, t.finished, t.updateCallbackDone]) if (p) p.catch(() => {});
  } catch (_) { run(); return; }
  setTimeout(run, 60);
};

const teamPicker = () => $("teampicker");
const afterMirror = (fn) => (typeof queueMicrotask === "function" ? queueMicrotask(fn) : Promise.resolve().then(fn));
let previewOpenRaf = 0;

function fittedLivery(t) {
  const id = G.getLiveryId(t.id);
  const list = G.getLiveries(t);
  return list.find((l) => l.id === id) || list[0] || null;
}

function driverLabel(d, placeholderNum) {
  const last = d.name.split(" ").pop();
  return (placeholderNum && !(d.num > 1)) ? last : "#" + d.num + " " + last;
}

function swatchPx(dpr) {
  const d = +dpr > 0 ? +dpr : 1;
  return Math.max(48, Math.min(128, Math.round(32 * 1.5 * d)));
}
function teamSwatch(t) {
  const sw = document.createElement("span");
  sw.className = "tm-colour";
  const liv = fittedLivery(t);
  const crestId = t.crest || t.id;
  const c1 = (liv && liv.c1) || t.color;
  const c2 = (liv && liv.c2) || t.color2 || t.color;
  if (typeof LiveryTex !== "undefined" && LiveryTex.paintSwatch) {
    const c = document.createElement("canvas");
    c.width = c.height = swatchPx(typeof window !== "undefined" ? window.devicePixelRatio : 1);
    c.setAttribute("aria-hidden", "true");
    LiveryTex.paintSwatch(c.getContext("2d"), crestId, liv || { c1, c2 }, c.width, c.height);
    sw.appendChild(c);
  } else {
    sw.style.background = "linear-gradient(135deg," + cssCol(c1) + " 62%," + cssCol(c2) + " 62%)";
  }
  sw.setAttribute("aria-hidden", "true");
  return sw;
}

function setTeamPicker(open) {
  Log.info("ui", "Menus.setTeamPicker " + (open ? "open" : "close"));
  if (open) buildTeamPicker();
  teamPicker().hidden = !open;
  if (open) {
    ScrollFadeRefresh();
    afterMirror(() => {
      const target = els.selTeams.querySelector(".team-tile.active");
      if (target && !teamPicker().hidden) target.focus();
    });
  }
}

function buildTeamPicker() {
  els.selTeams.textContent = "";
  Teams.LIST.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = "team-tile" + (i === G.teamIdx ? " active" : "");
    b.setAttribute("role", "option");
    b.setAttribute("aria-selected", i === G.teamIdx ? "true" : "false");
    const body = document.createElement("span");
    body.className = "tm-body";
    const name = document.createElement("span");
    name.className = "tm-name"; name.textContent = t.name;
    const sub = document.createElement("span");
    sub.className = "tm-sub";
    const taken = G.peerSeats ? G.peerSeats() : [];
    const isTaken = (si) => taken.some((s) => s.team === t.id && s.driver === si);
    const seatName = (d, si) => driverLabel(d, !!t.legends) + (isTaken(si) ? " (TAKEN)" : "");
    if (t.legends) {
      const seat = Math.min(Math.max(G.teamIdx === i ? (G.driverIdx | 0) : 0, 0), t.drivers.length - 1);
      const d = t.drivers[seat];
      sub.textContent = d ? seatName(d, seat) + "  ·  " + (t.engine || "") : "";
    } else {
      sub.textContent = t.drivers.map(seatName).join("  ·  ");
    }
    body.append(name, sub);
    b.append(teamSwatch(t), body);
    b.onclick = () => {
      if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
      if (i === G.teamIdx) { setTeamPicker(false); return; }
      let seat = 0;
      while (seat < t.drivers.length - 1 && isTaken(seat)) seat++;
      G.teamIdx = i; G.driverIdx = seat; store.set("team", i);
      try { document.documentElement.dataset.team = t.id; } catch (_) {  }
      try { if (typeof AppearanceOpts !== "undefined" && AppearanceOpts.applyAll) AppearanceOpts.applyAll(); } catch (_) {  }
      store.set("driver", seat);
      setTeamPicker(false);
      G.buildSetup();
      afterMirror(() => {
        const card = $("cs-team-card");
        if (card && card.isConnected && !card.disabled && teamPicker().hidden) card.focus();
      });
    };
    els.selTeams.appendChild(b);
  });
}

let detailRO = null;

const ScrollFadeRefresh = () => { if (window.ScrollFade) window.ScrollFade.refresh(); };

const favList = () => {
  const v = store.get("favTracks", null);
  return Array.isArray(v) ? v.filter((id) => Tracks.LIST.some((t) => t.id === id)) : [];
};
let trackFilter = store.get("trackFilter", "all");
if (trackFilter !== "all" && trackFilter !== "season" && trackFilter !== "classic" && trackFilter !== "daily-open" && trackFilter !== "custom" && trackFilter !== "fav") trackFilter = "all";
const trackFilters = [["all", "ALL"], ["season", "SEASON"], ["classic", "CLASSICS"], ["custom", "MY CIRCUITS"], ["fav", "♥ FAVOURITES"], ["daily-open", "DAILY OPEN"]];
let trackQuery = "";
const hasCustom = () => Tracks.LIST.some((t) => t.custom);
const practicePick = () => typeof UiExperience !== "undefined" && UiExperience.isPracticePick && UiExperience.isPracticePick();
const leavePracticePick = () => {
  if (typeof UiExperience !== "undefined" && UiExperience.leavePracticePick) UiExperience.leavePracticePick();
};
const ttChrome = () => G.timeTrial && !practicePick();
let keepActiveId = null;
const pinnedActive = (t) => !!t && t.id === keepActiveId && Tracks.LIST[G.trackIdx] === t;
const visibleTrackFilter = () => {
  if (((!G.timeTrial || practicePick()) && trackFilter === "daily-open") || (trackFilter === "fav" && !favList().length) || (trackFilter === "custom" && !hasCustom())) return "all";
  const cur = Tracks.LIST[G.trackIdx];
  if (cur && cur.custom && trackFilter !== "all" && trackFilter !== "custom") return "all";
  return trackFilter;
};

function toggleFav(id) {
  const list = favList();
  const on = !list.includes(id);
  const next = on ? list.concat(id) : list.filter((x) => x !== id);
  const cur = Tracks.LIST[G.trackIdx];
  if (!on && cur && cur.id === id) keepActiveId = id;
  if (next.length) store.set("favTracks", next);
  else {
    store.set("favTracks", undefined);
    if (trackFilter === "fav") { trackFilter = "all"; store.set("trackFilter", "all"); }
  }
  if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
  if (els.select && !els.select.hidden) buildSelect();
  return on;
}

els.selTracks.addEventListener("keydown", (e) => {
  if ((e.key !== "f" && e.key !== "F") || e.ctrlKey || e.metaKey || e.altKey) return;
  const row = e.target && e.target.closest ? e.target.closest(".track-row") : null;
  if (!row || row.tagName !== "BUTTON" || els.selTracks.dataset.mode === "season") return;
  const t = Tracks.LIST[+row.dataset.trackIdx];
  if (!t) return;
  e.preventDefault();
  if (e.repeat) return;
  const on = toggleFav(t.id);
  if (G.announce) G.announce(on ? t.name.toUpperCase() + " ♥ FAVOURITE" : t.name.toUpperCase() + " REMOVED FROM FAVOURITES");
  const again = els.selTracks.querySelector('.track-row[data-track-idx="' + row.dataset.trackIdx + '"]')
    || els.selTracks.querySelector(".track-row");
  if (again) again.focus();
});

window.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || e.isComposing || e.defaultPrevented) return;
  const t = e.target;
  if (!t || t.id !== "sel-track-search" || !t.value) return;
  t.value = "";
  applyTrackSearch("");
  e.preventDefault();
  e.stopPropagation();
}, true);

function applyTrackSearch(value, pick) {
  trackQuery = String(value || "").trim().toLocaleLowerCase();
  const rows = Array.from(els.selTracks.querySelectorAll(".track-row"));
  for (const row of rows) row.hidden = !!trackQuery && !row.dataset.search.includes(trackQuery);
  for (const head of els.selTracks.querySelectorAll(".track-group-head")) {
    let live = false;
    for (let el = head.nextElementSibling; el && !el.classList.contains("track-group-head"); el = el.nextElementSibling) {
      if (el.classList.contains("track-row") && !el.hidden) { live = true; break; }
    }
    head.hidden = !live;
  }
  const empty = document.getElementById("sel-track-empty");
  if (empty) empty.hidden = rows.some((row) => !row.hidden);
  if (pick && trackQuery) {
    const active = rows.find((row) => row.classList.contains("active"));
    if (!active || active.hidden) { const first = rows.find((row) => !row.hidden); if (first) first.click(); }
  }
  ScrollFadeRefresh();
}

const seasonIds = () => calendarIdSet(typeof SeasonCal !== "undefined" ? SeasonCal : null);
const classicBadge = (t, ids) => !!t.classic && calendarGroup(t, ids) === "classic";

function trackInFilter(t, filter, favs, ids) {
  if (!t) return false;
  if (filter === "season" || filter === "classic") return calendarGroup(t, ids === undefined ? seasonIds() : ids) === filter;
  if (filter === "custom") return !!t.custom;
  if (filter === "fav") return (favs || favList()).includes(t.id);
  if (filter === "daily-open") return !!(G.daily && t.id === G.daily.plan().trackId);
  return true;
}

function snapTrackToFilter(filter = visibleTrackFilter()) {
  const favs = favList();
  const ids = seasonIds();
  const cur = Tracks.LIST[G.trackIdx];
  if (keepActiveId && !pinnedActive(cur)) keepActiveId = null;
  if (trackInFilter(cur, filter, favs, ids) || pinnedActive(cur)) return;
  const i = Tracks.LIST.findIndex((t) => trackInFilter(t, filter, favs, ids));
  if (i < 0) return;
  G.trackIdx = i;
  store.set("trackId", Tracks.LIST[i].id);
  store.set("track", i);
}

function setTrackFilter(id, focus, keepDaily) {
  trackFilter = id;
  keepActiveId = null;
  if (id !== "daily-open") store.set("trackFilter", id);
  if (!keepDaily && G.daily && G.daily.isActive()) G.daily.stop();
  if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
  snapTrackToFilter(id);
  updateTrackPreview();
  buildSelect({ inPlace: true });
  if (focus) mountedToolbar()?.querySelector('[data-filter="' + id + '"]')?.focus();
}

function trackFilterBar() {
  const bar = document.createElement("div");
  bar.id = "sel-track-filter";
  bar.className = "sel-chip-row";
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "Circuit list controls");
  const hasFav = favList().length > 0;
  const filters = trackFilters.filter(([id]) => (id !== "daily-open" || ttChrome()) && (id !== "fav" || hasFav) && (id !== "custom" || hasCustom()));
  filters.forEach(([id, label], index) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sel-chip" + (visibleTrackFilter() === id ? " active" : "");
    b.dataset.filter = id;
    b.setAttribute("data-filter", id);
    b.setAttribute("aria-pressed", visibleTrackFilter() === id ? "true" : "false");
    b.tabIndex = visibleTrackFilter() === id ? 0 : -1;
    b.textContent = label;
    b.onclick = (e) => {
      e.stopPropagation();
      if (id === "daily-open") {
        G.daily.select(undefined, "open");
        leavePracticePick();
        setTrackFilter(id, true, true);
      } else setTrackFilter(id, true, false);
    };
    b.onkeydown = (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = (index + 1) % filters.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + filters.length) % filters.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = filters.length - 1;
      if (next == null) return;
      e.preventDefault(); e.stopPropagation();
      const nextId = filters[next][0];
      if (nextId === "daily-open") {
        G.daily.select(undefined, "open");
        leavePracticePick();
        setTrackFilter(nextId, true, true);
      } else setTrackFilter(nextId, true, false);
    };
    bar.appendChild(b);
  });
  if (ttChrome() && G.daily) {
    const p = G.daily.plan();
    const done = G.daily.today();
    const b = document.createElement("button");
    b.type = "button";
    const current = G.daily.current();
    const selected = !!current && current.day === p.day && current.class === "standard";
    b.className = "sel-chip" + (selected ? " active" : "");
    b.id = "sel-daily";
    const extraBits = [p.weather.toUpperCase(), p.tod.toUpperCase()];
    if (done && done.best != null) extraBits.push("ALL SETUPS ★ " + fmtTime(done.best));
    b.textContent = (selected ? "DAILY STANDARD" : "TODAY'S CHALLENGE") + " · " + p.trackName.toUpperCase();
    const extra = document.createElement("span");
    extra.textContent = " · " + extraBits.join(" · ");
    b.appendChild(extra);
    b.setAttribute("aria-label", "Today: " + p.trackName + " · " + extraBits.join(" · "));
    b.setAttribute("aria-pressed", selected ? "true" : "false");
    b.title = "Today's challenge (" + p.day + " UTC): fixed McLaren works build and physics; input assists are recorded separately";
    b.onclick = (e) => {
      e.stopPropagation();
      trackQuery = "";
      G.daily.select();
      leavePracticePick();
      setTrackFilter("all", false, true);
    };
    bar.insertBefore(b, bar.firstChild);
  }
  const search = document.createElement("input");
  search.id = "sel-track-search";
  search.type = "search";
  search.value = trackQuery;
  search.placeholder = "Search circuit";
  search.setAttribute("aria-label", "Search circuits");
  search.autocomplete = "off";
  search.oninput = () => applyTrackSearch(search.value, true);
  bar.appendChild(search);
  return bar;
}

const tileCache = { sig: "", rows: null };

function trackTile(t, i, opts) {
  const classic = classicBadge(t, opts && opts.calIds !== undefined ? opts.calIds : seasonIds());
  const row = document.createElement(opts && opts.readOnly ? "div" : "button");
  if (!(opts && opts.readOnly)) row.type = "button";
  row.className = "track-row" + (opts && opts.active ? " active" : "");
  row.dataset.trackIdx = String(i);
  row.dataset.kind = t.custom ? "custom" : classic ? "classic" : t.night ? "night" : t.street ? "street" : "season";
  row.setAttribute("aria-label", t.name);
  const tip = t.name + (t.country ? " · " + t.country : "");
  if (opts && opts.readOnly) row.dataset.tip = tip;
  else row.title = tip;
  const fl = document.createElement("span");
  fl.className = "track-row-meta";
  fl.innerHTML = Flags.svg(t.country);
  if (typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn()
      && typeof Flags !== "undefined" && Flags.code) {
    const cc = Flags.code(t.country);
    if (cc) {
      const lab = document.createElement("span");
      lab.className = "track-row-cc";
      lab.textContent = String(cc).toUpperCase();
      fl.appendChild(lab);
    }
  }
  row.appendChild(fl);
  const nm = document.createElement("span");
  nm.className = "track-row-name";
  nm.textContent = t.name;
  if (t.night) { const b = document.createElement("span"); b.className = "trb trb-night"; b.textContent = "NIGHT"; nm.appendChild(b); }
  if (t.street) { const b = document.createElement("span"); b.className = "trb trb-street"; b.textContent = "STREET"; nm.appendChild(b); }
  if (classic) { const b = document.createElement("span"); b.className = "trb trb-classic"; b.textContent = "CLASSIC"; nm.appendChild(b); }
  if (t.custom) { const b = document.createElement("span"); b.className = "trb trb-custom"; b.textContent = "CUSTOM"; nm.appendChild(b); }
  row.appendChild(nm);
  return row;
}

function mountedToolbar() {
  return els.selTracks.parentNode.querySelector("#sel-track-filter");
}

function mountToolbar(bar) {
  const shelf = els.selTracks.parentNode;
  const old = shelf.querySelector("#sel-track-filter");
  if (old) old.remove();
  if (bar) shelf.insertBefore(bar, els.selTracks);
}

function revealActiveTile() {
  const on = els.selTracks.querySelector(".track-row.active");
  if (on && on.scrollIntoView) on.scrollIntoView({ inline: "center", block: "nearest" });
}

function buildSelect(opts) {
  const inPlace = !!(opts && opts.inPlace);
  if (!inPlace && els.overlay && !els.overlay.hidden) trackQuery = "";
  const room = !!G.netRoom;
  const seasonComplete = !room && G.seasonMode && G.season && !SeasonCal.canRace(G.season);
  const practice = practicePick();
  els.selGo.textContent = seasonComplete ? "VIEW FINAL STANDINGS"
    : practice ? "PRACTICE SETUP"
    : G.timeTrial ? "SESSION SETUP"
    : "RACE SETUP";
  els.selGo.dataset.seasonComplete = seasonComplete ? "1" : "";
  const selCar = $("sel-car");
  if (selCar) {
    selCar.hidden = seasonComplete || room;
    const current = $("sel-car-current"), team = Teams.LIST[G.teamIdx];
    if (current) current.textContent = team ? team.name.toUpperCase() : "CURRENT CAR";
    selCar.setAttribute("aria-label", "Change car" + (team ? ": " + team.name : ""));
  }
  const count = $("sel-track-count");
  if (count) count.textContent = G.seasonMode ? "SWIPE ROUNDS →" : Tracks.LIST.length + " CIRCUITS · MORE →";
  els.selTitle.textContent = room ? "THE RACE"
    : seasonComplete ? "SEASON COMPLETE"
    : G.seasonMode ? "SEASON — ROUND " + ((G.season && G.season.round || 0) + 1)
    : practice ? "PRACTICE"
    : G.timeTrial ? "TIME TRIAL" : "GRAND PRIX";
  els.selTrackSection.hidden = false;
  if (els.selCircuitLabel) els.selCircuitLabel.textContent = G.seasonMode ? "NEXT RACE" : "CIRCUIT";
  els.selTracks.textContent = "";
  els.selTracks.dataset.mode = G.seasonMode ? "season" : "pick";
  if (G.seasonMode) {
    const bar = document.createElement("div");
    bar.id = "sel-track-filter";
    bar.className = "sel-chip-row";
    bar.setAttribute("role", "group");
    bar.setAttribute("aria-label", "Season controls");
    if (seasonComplete) {
      const done = document.createElement("div");
      done.className = "season-upcoming-head";
      done.textContent = "ALL " + SeasonCal.rounds() + " ROUNDS COMPLETE";
      bar.appendChild(done);
    }
    const custom = document.createElement("button");
    custom.id = "sel-customise";
    custom.className = "sel-chip";
    custom.type = "button";
    custom.textContent = seasonComplete ? "START NEW SEASON" : "CUSTOMISE SEASON";
    custom.onclick = (e) => { e.stopPropagation(); G.openSeasonSetup(); };
    bar.appendChild(custom);
    mountToolbar(bar);
    const rnd = (G.season && G.season.round || 0);
    for (let r = 0; r < SeasonCal.rounds(); r++) {
      const t = SeasonCal.track(r);
      if (!t) continue;
      const i = Tracks.LIST.indexOf(t);
      const row = trackTile(t, i, { readOnly: true, active: !seasonComplete && r === rnd });
      if (r < rnd || seasonComplete) row.dataset.done = "1";
      if (!seasonComplete && r === rnd) row.setAttribute("aria-current", "step");
      const rn = document.createElement("span");
      rn.className = "sur-rnd";
      rn.textContent = "R" + (r + 1);
      row.insertBefore(rn, row.firstChild);
      els.selTracks.appendChild(row);
    }
    updateTrackPreview();
  } else {
    if (inPlace && mountedToolbar() && !mountedToolbar().querySelector("#sel-daily")) {
      const vis = visibleTrackFilter();
      mountedToolbar().querySelectorAll("[data-filter]").forEach((b) => {
        const on = b.dataset.filter === vis;
        b.classList.toggle("active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
    } else mountToolbar(trackFilterBar());
    snapTrackToFilter();
    const favs = favList();
    const filter = visibleTrackFilter();
    const calIds = seasonIds();
    const ttc = ttChrome(), cues = !!(typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn());
    const shown = [];
    Tracks.LIST.forEach((t, i) => { if (trackInFilter(t, filter, favs, calIds) || (i === G.trackIdx && pinnedActive(t))) shown.push(i); });
    const sig = [+ttc, +cues, calIds ? Array.from(calIds).join(",") : "-", shown.map((i) => {
      const t = Tracks.LIST[i], bd = ttc ? liveBoard(t) : [];
      return [i, t.id, t.name, t.country, +!!t.night, +!!t.street, +!!t.custom, +favs.includes(t.id), bd.length ? bd[0].t : "-"].join(":");
    }).join("|")].join("#");
    if (tileCache.sig === sig && tileCache.rows) {
      for (const row of tileCache.rows) {
        const on = row.dataset.trackIdx === String(G.trackIdx);
        row.classList.toggle("active", on);
        row.setAttribute("aria-pressed", on ? "true" : "false");
        row.hidden = false;
        els.selTracks.appendChild(row);
      }
    } else tileCache.rows = shown.map((i) => {
      const t = Tracks.LIST[i];
      const grp = calendarGroup(t, calIds);
      const g = grp === "custom" ? "MY CIRCUITS" : grp === "classic" ? "CLASSIC CIRCUITS" : "CURRENT SEASON";
      const row = trackTile(t, i, { active: i === G.trackIdx, calIds });
      row.dataset.trackGroup = g;
      row.dataset.search = [t.name, t.country, grp === "custom" ? "custom mine" : grp, t.street ? "street" : "", t.night ? "night" : ""]
        .filter(Boolean).join(" ").toLocaleLowerCase();
      row.setAttribute("aria-pressed", i === G.trackIdx ? "true" : "false");
      if (favs.includes(t.id)) row.dataset.fav = "1";
      if (ttc) {
        const board = liveBoard(t);
        const rec = board.length ? board[0].t : Infinity;
        const recEl = document.createElement("span");
        recEl.className = "track-row-rec"; recEl.title = "Best across setups and conditions";
        recEl.textContent = isFinite(rec) ? "★ " + fmtTime(rec) : "—";
        row.appendChild(recEl);
      }
      row.onclick = () => {
        if (G.soundOn && (typeof GameAudio !== "undefined")) GameAudio.uiSelect();
        const armedDaily = G.daily && G.daily.current();
        if (armedDaily && armedDaily.trackId !== t.id) {
          G.daily.stop();
          const dailyChip = mountedToolbar() && mountedToolbar().querySelector("#sel-daily");
          if (dailyChip) {
            dailyChip.classList.remove("active");
            dailyChip.setAttribute("aria-pressed", "false");
            dailyChip.firstChild.nodeValue = "TODAY'S CHALLENGE · " + G.daily.plan().trackName.toUpperCase();
          }
        }
        G.trackIdx = i;
        store.set("trackId", t.id);
        store.set("track", i);
        els.selTracks.querySelectorAll(".track-row").forEach((r) => {
          const on = r.dataset.trackIdx === String(i);
          r.classList.toggle("active", on);
          r.setAttribute("aria-pressed", on ? "true" : "false");
        });
        updateTrackPreview();
        scheduleFlybyTrack(true);
      };
      els.selTracks.appendChild(row);
      return row;
    });
    tileCache.sig = sig;
    const empty = document.createElement("p");
    empty.id = "sel-track-empty";
    empty.className = "season-upcoming-head";
    empty.textContent = "NO CIRCUITS MATCH";
    empty.hidden = true;
    els.selTracks.appendChild(empty);
    applyTrackSearch(trackQuery);
    updateTrackPreview();
  }
  if (!seasonComplete && !inPlace) scheduleFlybyTrack(true);
  setTimeout(() => { if (els.select && !els.select.hidden) { updateTrackPreview(); revealActiveTile(); } }, 0);
  if (previewOpenRaf) cancelAnimationFrame(previewOpenRaf);
  previewOpenRaf = requestAnimationFrame(() => {
    previewOpenRaf = requestAnimationFrame(() => {
      previewOpenRaf = 0;
      if (els.select && !els.select.hidden) { updateTrackPreview(); revealActiveTile(); }
    });
  });
}

function drawElevProfile(cv, t, showEl) {
  const target = showEl || cv;
  if (!cv || !target) return false;
  const py = TrackMaps.elevProfile(t);
  if (!(py && py.length > 2 && TrackMaps.elevRange(t) > 2)) { target.hidden = true; return false; }
  let boxW = cv.clientWidth, boxH = cv.clientHeight;
  if (!(boxW > 0 && boxH > 0)) {
    target.hidden = false;
    boxW = cv.clientWidth; boxH = cv.clientHeight;
    if (!(boxW > 0 && boxH > 0)) return false;
  }
  const ratio = Math.min(3, 4096 / boxW, 4096 / boxH, Math.max(1, (cv.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
  const bw = Math.max(1, Math.round(boxW * ratio)), bh = Math.max(1, Math.round(boxH * ratio));
  if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
  const ew = boxW, eh = boxH;
  const eg = cv.getContext ? cv.getContext("2d") : null;
  if (!eg) { target.hidden = true; return false; }
  target.hidden = false;
  eg.setTransform(ratio, 0, 0, ratio, 0, 0);
  eg.clearRect(0, 0, ew, eh);
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < py.length; i++) { if (py[i] < mn) mn = py[i]; if (py[i] > mx) mx = py[i]; }
  const span = mx - mn || 1;
  const pad = 3;
  const lo = Math.round(mn), hi = Math.round(mx);
  const fmtElev = (v) => (v > 0 ? "+" : "") + v + "m";
  const topLbl = fmtElev(hi), botLbl = fmtElev(lo);
  eg.font = "8px monospace";
  const gutter = Math.min(ew * 0.42, Math.max(28, Math.ceil(Math.max(
    eg.measureText(topLbl).width, eg.measureText(botLbl).width)) + 6));
  const plotW = Math.max(1, ew - gutter);
  const yNorm = (v) => eh - pad - ((v - mn) / span) * (eh - 2 * pad);
  const trace = () => {
    eg.beginPath();
    for (let i = 0; i <= py.length; i++) {
      const ex = (i / py.length) * plotW;
      i === 0 ? eg.moveTo(ex, yNorm(py[0])) : eg.lineTo(ex, yNorm(py[i % py.length]));
    }
  };
  trace();
  eg.lineTo(plotW, eh); eg.lineTo(0, eh); eg.closePath();
  eg.fillStyle = "rgba(57,183,240,0.18)"; eg.fill();
  eg.strokeStyle = "rgba(57,183,240,0.7)"; eg.lineWidth = 1.5;
  trace();
  eg.stroke();
  eg.fillStyle = "rgba(57,183,240,0.75)"; eg.textAlign = "right";
  if (eh < 28) eg.fillText(topLbl + " / " + botLbl, ew - 2, Math.max(9, eh - 2));
  else {
    eg.fillText(topLbl, ew - 2, 9);
    eg.fillText(botLbl, ew - 2, eh - 1);
  }
  return true;
}

let previewRo = null, previewHeroBox = "";
function watchHero(hero) {
  if (!hero || typeof ResizeObserver !== "function" || previewRo) return;
  previewRo = new ResizeObserver(() => {
    if (!els.select || els.select.hidden) return;
    const w = hero.clientWidth, h = hero.clientHeight;
    if (w <= 0 || h <= 0) return;
    const key = w + "x" + h;
    if (key === previewHeroBox) return;
    previewHeroBox = key;
    updateTrackPreview();
  });
  previewRo.observe(hero);
}
watchHero(document.getElementById("sel-hero"));

let stillToken = 0;
const STILL_SIZES = "100vw";
const STILL_1X_ONLY = [];
function stillSrcset(id, conn) {
  if (STILL_1X_ONLY.includes(id) || (conn && (conn.saveData || /2g$/.test(conn.effectiveType || "")))) return "";
  const base = "assets/stills/" + id;
  return base + ".webp 800w, " + base + "-1600.webp 1600w";
}
function showStill(t) {
  const img = document.getElementById("sel-still");
  if (!img) return;
  if (t.custom) { img.hidden = true; img.dataset.id = t.id; stillToken++; return; }
  const src = "assets/stills/" + t.id + ".webp";
  if (img.dataset.id === t.id && !img.hidden) return;
  const token = ++stillToken;
  img.hidden = true;
  img.dataset.id = t.id;
  img.onload = () => { if (token === stillToken) img.hidden = false; };
  img.onerror = () => {
    if (token !== stillToken) return;
    if (img.getAttribute("srcset")) { img.removeAttribute("srcset"); img.removeAttribute("sizes"); img.src = src; return; }
    img.hidden = true;
  };
  const set = stillSrcset(t.id, typeof navigator !== "undefined" ? navigator.connection : null);
  if (set) { img.sizes = STILL_SIZES; img.srcset = set; }
  else { img.removeAttribute("srcset"); img.removeAttribute("sizes"); }
  img.src = src;
}

let previewMapsTok = 0, previewMapsIdle = 0;
function previewMapsCached(t) {
  if (!t || !t.id || typeof TrackMaps === "undefined" || !TrackMaps.cachedIds) return false;
  try { return TrackMaps.cachedIds().indexOf(t.id) >= 0; } catch (_) { return false; }
}
function previewPathReady(t) {
  return !!(t && !t._metaOnly && t.path && t.path.pts && t.path.pts.length);
}
function whenCircuit(t, fn) {
  if (previewPathReady(t) || !G.ensureCircuit) return;
  const idx = G.trackIdx;
  G.ensureCircuit(idx).then(() => { if (G.trackIdx === idx && previewPathReady(Tracks.LIST[idx])) fn(); })
    .catch((e) => Log.warn("track", "could not load circuit " + idx + ": " + ((e && e.message) || e)));
}
function fillPreviewMeta(t, crns, dir, elev, dz) {
  const turns = crns && crns.length;
  const km = t.lengthKm || 0;
  const selInner = document.getElementById("sel-inner") || {};
  const narrowLen = ((selInner.dataset || {}).density === "compact") || ((selInner.clientWidth || 0) > 0 && selInner.clientWidth <= 520);
  const rows = [
    ["LOCATION", t.country || "—"],
    ["TURNS", turns ? String(turns) : "—"],
    ["CIRCUIT LENGTH", !km ? "—"
      : narrowLen
        ? km.toFixed(3) + " km"
        : km.toFixed(3) + " km / " + (km * 0.621371).toFixed(3) + " mi"],
    ["DIRECTION", dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "—"],
    ["ELEVATION", elev > 2 ? "+" + elev + " m" : (elev == null ? "—" : "Flat")],
    ["AERO ZONES", dz ? (dz.length ? String(dz.length) : "None") : "—"],
  ];
  if (crns && crns.length) {
    const slowest = crns.reduce(function (a, b) { return b.v > a.v ? b : a; });
    rows.push(["SLOWEST CORNER", "T" + slowest.n]);
  }
  els.selPreviewMeta.textContent = "";
  for (const [k, v] of rows) {
    const pair = document.createElement("div");
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    pair.append(dt, dd);
    els.selPreviewMeta.appendChild(pair);
  }
}
function previewMapSlot(hero, sheet, map) {
  const compact = !!(sheet && sheet.dataset.density === "compact");
  let slotH = hero.clientHeight * (compact ? 0.6 : 0.64);
  const btn = map && map.parentElement;
  if (btn && btn.clientHeight > 0) {
    fitPreviewMapBand(btn);
    const bs = getComputedStyle(btn);
    const room = btn.clientHeight - (parseFloat(bs.paddingTop) || 0) - (parseFloat(bs.paddingBottom) || 0);
    if (room > 0) slotH = Math.min(slotH, room);
  }
  return { slotW: hero.clientWidth * 0.62, slotH };
}
function fitPreviewMapBand(btn) {
  const br = btn.getBoundingClientRect();
  if (!(br.height > 0) || !(btn.offsetHeight > 0)) return;
  const k = br.height / btn.offsetHeight;
  const over = [];
  for (const e of [document.getElementById("sel-hero-cap"), document.getElementById("sel-preview-facts"), document.getElementById("sel-preview-info")]) {
    if (e) over.push(e.getBoundingClientRect());
  }
  const band = previewMapBand(br, over, Math.round(br.height * 0.025));
  btn.style.alignItems = "center";
  btn.style.paddingTop = (band.top / k).toFixed(2) + "px";
  btn.style.paddingBottom = (band.bottom / k).toFixed(2) + "px";
}
function sizePreviewMapBox(t) {
  if (!els.selPreviewMap || !t) return;
  const hero = document.getElementById("sel-hero");
  const sheet = hero && hero.closest(".sheet");
  if (!hero || hero.clientWidth <= 0 || hero.clientHeight <= 0) return;
  const map = els.selPreviewMap;
  const { slotW, slotH } = previewMapSlot(hero, sheet, map);
  let a = 520 / 300;
  if (previewMapsCached(t) && typeof TrackMaps !== "undefined" && TrackMaps.aspect) {
    try { a = TrackMaps.aspect(t) || a; } catch (_) {  }
  }
  a = Math.max(0.5, Math.min(2.5, a));
  let boxW = Math.max(40, Math.floor(slotW || 1));
  let boxH = Math.max(40, Math.floor(slotH || 1));
  let w = boxW, h = Math.round(w / a);
  if (h > boxH) { h = boxH; w = Math.round(h * a); }
  w = Math.max(1, w); h = Math.max(1, h);
  map.width = w;
  map.height = h;
  map.style.aspectRatio = String(a);
  map.style.width = w + "px";
  map.style.height = h + "px";
  map.style.maxWidth = "";
  map.style.maxHeight = "";
}
function paintTrackPreviewMaps(t) {
  if (!els.selPreviewMap || Tracks.LIST[G.trackIdx] !== t) return;
  const crns = TrackMaps.corners(t);
  const dir = TrackMaps.direction(t);
  const elev = TrackMaps.elevRange(t);
  const dz = TrackMaps.drsZones(t);
  fillPreviewMeta(t, crns, dir, elev, dz);
  const hero = document.getElementById("sel-hero");
  const sheet = hero && hero.closest(".sheet");
  if (!hero || hero.clientWidth <= 0 || hero.clientHeight <= 0) return;
  drawElevProfile(document.getElementById("sel-preview-elev"), t);
  const map = els.selPreviewMap;
  const { slotW, slotH } = previewMapSlot(hero, sheet, map);
  const fit = TrackMaps.fitCanvas(map, slotW, slotH, t, true);
  const ratio = Math.min(3, Math.max(1, (map.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
  if (ratio > 1.01) {
    map.width = Math.round(fit.w * ratio);
    map.height = Math.round(fit.h * ratio);
  }
  const br = fit.w ? (map.width / fit.w) : 1;
  const lw = Math.max(2, Math.round(Math.min(fit.w, fit.h) / 42));
  TrackMaps.draw(map, t, {
    color: "#ffffff", casing: "rgba(0,0,0,0.55)", startColor: "#e10600",
    width: lw * br, pad: Math.round(lw * 1.5) * br,
    corners: false, sectors: false, drs: false
  });
  map.dataset.drawn = "";
}
function scheduleTrackPreviewMaps(t) {
  const tok = ++previewMapsTok;
  if (previewMapsIdle) {
    try { clearTimeout(previewMapsIdle); } catch (_) {  }
    previewMapsIdle = 0;
  }
  const run = () => {
    previewMapsIdle = 0;
    if (tok !== previewMapsTok || Tracks.LIST[G.trackIdx] !== t) return;
    const finish = () => {
      if (tok !== previewMapsTok || Tracks.LIST[G.trackIdx] !== t) return;
      paintTrackPreviewMaps(t);
    };
    const client = typeof TrackBuildClient !== "undefined" ? TrackBuildClient : null;
    if (client && typeof client.previewMap === "function" && client.enabled && client.enabled() && !t.custom) {
      Promise.resolve(client.previewMap(t)).then(finish, finish);
    } else {
      finish();
    }
  };
  if (typeof requestIdleCallback === "function") {
    previewMapsIdle = requestIdleCallback(run, { timeout: 180 });
  } else {
    previewMapsIdle = setTimeout(run, 0);
  }
}

function updateTrackPreview() {
  if (!els.selPreviewMap) return;
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  whenCircuit(t, updateTrackPreview);
  const flagEl = document.getElementById("sel-preview-flag");
  if (flagEl) {
    flagEl.innerHTML = Flags.svg(t.country);
    if (typeof A11yOpts !== "undefined" && A11yOpts.cuesOn && A11yOpts.cuesOn()
        && typeof Flags !== "undefined" && Flags.code) {
      const cc = Flags.code(t.country);
      if (cc) {
        const lab = document.createElement("span");
        lab.className = "track-row-cc";
        lab.textContent = String(cc).toUpperCase();
        flagEl.appendChild(lab);
      }
    }
  }
  els.selPreviewName.textContent = t.name + (t.night ? " ☾" : "");
  els.selPreviewGp.textContent = t.gp || "";
  const factsEl = document.getElementById("sel-preview-facts");
  if (factsEl) {
    const kinds = [];
    if (t.night) kinds.push(["trb trb-night", "NIGHT RACE"]);
    if (t.street) kinds.push(["trb trb-street", "STREET CIRCUIT"]);
    if (classicBadge(t, seasonIds())) kinds.push(["trb trb-classic", "CLASSIC"]);
    if (t.custom) kinds.push(["trb trb-custom", "CUSTOM CIRCUIT"]);
    const why = t.custom && typeof CustomTracks !== "undefined" && CustomTracks.badge(t.id, () => { if (Tracks.LIST[G.trackIdx] === t) updateTrackPreview(); });
    if (why) kinds.push(["trb", "BREAKS TODAY'S RULES", why]);
    if (t.banked) kinds.push(["trb", "BANKED"]);
    factsEl.textContent = "";
    for (const [cls, label, why] of kinds) {
      const b = document.createElement("span"); b.className = cls; b.textContent = label; if (why) b.dataset.stale = b.title = why; factsEl.appendChild(b);
    }
  }
  const detail = document.getElementById("sel-detail-chip");
  let edit = document.getElementById("sel-edit-chip");
  if (detail && t.custom) {
    if (!edit) {
      edit = document.createElement("button"); edit.id = "sel-edit-chip"; edit.type = "button"; edit.className = "sel-chip"; edit.textContent = "EDIT";
      detail.after(edit);
    }
    edit.setAttribute("aria-label", "Edit " + t.name + " in the track designer");
    edit.onclick = () => {
      if (G.soundOn) GameAudio.uiSelect();
      CustomTracks.ensureEditor().then((ok) => { if (ok && typeof TrackDesigner !== "undefined") TrackDesigner.open({ design: CustomTracks.get(t.id), originId: t.id }); });
    };
  } else if (edit) edit.remove();
  if (G.seasonMode) {
    els.selPreviewRec.textContent = G.season && !SeasonCal.canRace(G.season)
      ? "Final standings · " + SeasonCal.rounds() + " rounds"
      : "Round " + ((G.season && G.season.round || 0) + 1) + " of " + SeasonCal.rounds();
  } else {
    const board = liveBoard(t);
    const rec = board.length ? board[0].t : Infinity;
    els.selPreviewRec.textContent = isFinite(rec) ? "Best across setups  ★ " + fmtTime(rec)
      : ttChrome() ? "No time set" : "";
  }
  showStill(t);
  if (!previewPathReady(t)) {
    fillPreviewMeta(t, null, null, null, null);
    return;
  }
  if (previewMapsCached(t)) {
    paintTrackPreviewMaps(t);
    return;
  }
  fillPreviewMeta(t, null, null, null, null);
  sizePreviewMapBox(t);
  scheduleTrackPreviewMaps(t);
}

function drsZoneWraps(z) {
  return !!(z.wrap || z.b > 1 || z.b < z.a);
}
function drsZoneLapMetre(frac, trackLenM) {
  const m = Math.round(frac * trackLenM);
  return m > trackLenM ? m - trackLenM : m;
}
function drsZoneRangeHtml(z, trackLenM) {
  const a = drsZoneLapMetre(z.a, trackLenM);
  const b = drsZoneLapMetre(z.b, trackLenM);
  if (drsZoneWraps(z)) {
    return a + " m <span aria-label=\"crossing start/finish\">&rarr; S/F &rarr;</span> " + b + " m";
  }
  return a + " m &ndash; " + b + " m";
}

function openTrackDetail() {
  const t = Tracks.LIST[G.trackIdx];
  if (!t) return;
  const modal = document.getElementById("track-detail");
  if (!modal) return;
  whenCircuit(t, () => { if (!modal.hidden) openTrackDetail(); });
  const crns = TrackMaps.corners(t);
  document.getElementById("track-detail-name").textContent = t.name + (t.gp ? "  ·  " + t.gp : "");
  const mapCanvas = document.getElementById("track-detail-canvas");
  if (mapCanvas) mapCanvas.setAttribute("aria-label", t.name + " circuit layout diagram");
  const elevCanvas = document.getElementById("track-detail-elev");
  if (elevCanvas) elevCanvas.setAttribute("aria-label", t.name + " elevation profile");
  const dz = TrackMaps.drsZones(t);
  const dir = TrackMaps.direction(t);
  const elev = TrackMaps.elevRange(t);
  const meta = [
    t.country,
    t.lengthKm ? t.lengthKm.toFixed(1) + " km" : "",
    crns.length + " turns",
    dir ? (dir === "CW" ? "Clockwise" : "Anti-clockwise") : "",
    elev > 2 ? "+" + elev + " m elev" : "",
    dz && dz.length ? dz.length + (dz.length === 1 ? " aero zone" : " aero zones") : ""
  ].filter(Boolean).join("  ·  ");
  document.getElementById("track-detail-meta").textContent = meta;

  const nightEl = document.getElementById("tdf-night");
  const streetEl = document.getElementById("tdf-street");
  const bankedEl = document.getElementById("tdf-banked");
  if (nightEl) nightEl.hidden = !t.night;
  if (streetEl) streetEl.hidden = !t.street;
  if (bankedEl) bankedEl.hidden = !t.banked;

  const panel = document.getElementById("track-detail-panel");
  let fav = panel && panel.querySelector("#track-detail-fav");
  if (!fav && panel) {
    fav = document.createElement("button");
    fav.type = "button";
    fav.id = "track-detail-fav";
    fav.className = "sel-chip";
    panel.insertBefore(fav, document.getElementById("track-detail-flags"));
  }
  if (fav) {
    const paintFav = () => {
      const on = favList().includes(t.id);
      fav.textContent = on ? "★ FAVOURITE" : "☆ FAVOURITE";
      fav.classList.toggle("active", on);
      fav.setAttribute("aria-pressed", on ? "true" : "false");
    };
    fav.onclick = () => { toggleFav(t.id); paintFav(); };
    paintFav();
  }

  const wrap = document.getElementById("track-detail-canvas-wrap");
  let legend = document.getElementById("track-detail-legend");
  if (!legend && wrap) {
    legend = document.createElement("ul");
    legend.id = "track-detail-legend";
    legend.setAttribute("aria-label", "Circuit map colours");
    const items = [
      ["tdc-fast", "Fastest"],
      ["tdc-medium", "Medium"],
      ["tdc-slow", "Slow"],
      ["tdc-hairpin", "Hairpin"],
      ["", "Sector"]
    ];
    for (let i = 0; i < items.length; i++) {
      const li = document.createElement("li");
      const sw = document.createElement("i");
      if (items[i][0]) sw.className = items[i][0];
      else li.setAttribute("data-leg", "sector");
      li.appendChild(sw);
      li.appendChild(document.createTextNode(" " + items[i][1]));
      legend.appendChild(li);
    }
    wrap.appendChild(legend);
  }

  drawElevProfile(document.getElementById("track-detail-elev"), t,
                  document.getElementById("track-detail-elev-wrap"));

  const drsWrap = document.getElementById("track-detail-drs-wrap");
  const drsList = document.getElementById("track-detail-drs-list");
  if (drsWrap && drsList) {
    if (dz && dz.length) {
      const trackLen = (t.lengthKm || 5) * 1000;
      drsList.innerHTML = dz.map(function (z, i) {
        return '<div class="tdd-zone">Zone ' + (i + 1) + ": " + drsZoneRangeHtml(z, trackLen) + "</div>";
      }).join("");
      drsWrap.hidden = false;
    } else {
      drsWrap.hidden = true;
    }
  }

  const TDC_CLS = {
    HAIRPIN: "tdc-hairpin",
    SLOW: "tdc-slow",
    MEDIUM: "tdc-medium",
    FAST: "tdc-fast"
  };
  const list = document.getElementById("track-detail-list");
  list.innerHTML = crns.map(function (c) {
    const lbl = c.cls || "MEDIUM";
    const cls = TDC_CLS[lbl] || "tdc-medium";
    return '<div class="tdc-corner"><span class="tdc-num">T' + c.n + '</span><span class="' + cls + '">' + lbl + '</span></div>';
  }).join("");

  Log.info("ui", "Menus.open track-detail");
  vt(() => { modal.hidden = false; });
  const cv = document.getElementById("track-detail-canvas");
  modal.setAttribute("data-map-tall", TrackMaps.aspect(t) < 1 ? "1" : "0");
  let lastFit = "";
  const drawDetail = function () {
    if (modal.hidden) return;
    drawElevProfile(document.getElementById("track-detail-elev"), t, document.getElementById("track-detail-elev-wrap"));
    const wrapW = wrap ? wrap.clientWidth : (window.innerWidth - 24);
    const legendH = legend ? legend.offsetHeight : 0;
    const wrapH = wrap ? Math.max(0, wrap.clientHeight - legendH) : (window.innerHeight - 80);
    const maxW = wrapW > 0 ? wrapW : Math.max(200, Math.min(window.innerWidth - 24, 600));
    const maxH = wrapH > 0 ? wrapH : Math.max(150, Math.round(maxW / 1.2));
    const ratio = Math.min(3, Math.max(1,
      (cv.currentCSSZoom || 1) * (window.devicePixelRatio || 1)));
    const key = maxW + "x" + maxH + "@" + ratio.toFixed(2);
    if (key === lastFit) return;
    lastFit = key;
    const fit = TrackMaps.fitCanvas(cv, maxW, maxH, t, true);
    if (ratio > 1.01) {
      cv.width = Math.round(fit.w * ratio);
      cv.height = Math.round(fit.h * ratio);
    }
    const mk = Math.min(1, fit.w / 520, fit.h / 300);
    const br = fit.w ? (cv.width / fit.w) : 1;
    TrackMaps.draw(cv, t, {
      color: TrackMaps.themeColor(t), startColor: "#e10600",
      width: Math.max(2 * br, Math.round(5 * mk * br)), pad: Math.max(12 * br, Math.round(42 * mk * br)),
      corners: true, cornerR: Math.max(4 * br, Math.round(6 * mk * br)), cornerFont: Math.max(8 * br, Math.round(12 * mk * br)),
      sectors: true, drs: true, legend: false
    });
  };
  requestAnimationFrame(drawDetail);
  if (wrap && typeof ResizeObserver === "function") {
    if (detailRO) detailRO.disconnect();
    detailRO = new ResizeObserver(drawDetail);
    detailRO.observe(wrap);
  }
}
function closeTrackDetail() {
  const modal = document.getElementById("track-detail");
  if (modal) modal.hidden = true;
  if (detailRO) detailRO.disconnect();
  detailRO = null;
}
return {
  buildSelect, updateTrackPreview, openTrackDetail, closeTrackDetail, setTeamPicker, teamSwatch, vt,
  drsZoneWraps, drsZoneLapMetre, drsZoneRangeHtml, showCtxLostNotice, restoreMenuAfterGraphicsReset,
};
}

function calendarIdSet(cal) {
  if (!cal || typeof cal.list !== "function") return null;
  let l;
  try { l = cal.list(); } catch (_) { return null; }
  if (!Array.isArray(l) || !l.length) return null;
  const ids = new Set();
  for (const t of l) if (t && typeof t.id === "string") ids.add(t.id);
  return ids.size ? ids : null;
}
function previewMapBand(box, over, margin) {
  const mid = (box.top + box.bottom) / 2;
  let top = box.top, bot = box.bottom;
  for (const r of over || []) {
    if (!r || !(r.bottom > r.top) || !(r.right > r.left)) continue;
    if (r.bottom <= box.top || r.top >= box.bottom || r.right <= box.left || r.left >= box.right) continue;
    if ((r.top + r.bottom) / 2 < mid) top = Math.max(top, r.bottom);
    else bot = Math.min(bot, r.top);
  }
  const m = Math.max(0, +margin || 0);
  return { top: top - box.top + m, bottom: box.bottom - bot + m };
}
function calendarGroup(t, ids) {
  if (!t) return null;
  if (t.custom) return "custom";
  if (ids) return ids.has(t.id) ? "season" : "classic";
  return t.classic ? "classic" : "season";
}

return { create, calendarIdSet, calendarGroup, previewMapBand };
})();
Object.freeze(Menus);
