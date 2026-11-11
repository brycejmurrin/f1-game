"use strict";
/* Photo Studio captures only the renderer, then composes a cropped image.
 * Camera ownership is borrowed from FreeCam or the garage and always returned.
 * Canvas API: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob
 * Persistence: https://developer.mozilla.org/en-US/docs/Web/API/IDBObjectStore/put */
const PhotoStudio = (function () {
const KEY = "apex26.photoBackground", DB = "apex26.photoLibrary", LIMIT = 6;
const ASPECTS = { scene: 0, wide: 16 / 9, square: 1, portrait: 4 / 5 };
// TIME and WEATHER are the engine's own discrete sets (js/race/weather-arc.js VALID, setTimeOfDay): no continuous clock exists.
const TODS = [["dawn", "Dawn"], ["day", "Day"], ["dusk", "Dusk"], ["night", "Night"], ["default", "Track default"]];
const WXS = [["dry", "Dry"], ["overcast", "Overcast"], ["fog", "Fog"], ["wet", "Wet"], ["rain", "Rain"], ["storm", "Storm"]];
let live = null;
const text = (v, max) => String(v || "").replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, max || 80);
function filename(label) { return "apex26-" + (text(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "photo") + ".png"; }
function crop(width, height, aspect) {
  const w = Math.max(1, Math.round(width)), h = Math.max(1, Math.round(height)), r = ASPECTS[aspect] || w / h;
  const cw = Math.min(w, h * r), ch = Math.min(h, w / r);
  return { x: (w - cw) / 2, y: (h - ch) / 2, width: cw, height: ch };
}
function background() {
  try { const v = localStorage.getItem(KEY); return v && /^data:image\/(jpeg|png);base64,/.test(v) && v.length < 240000 ? v : ""; } catch (_) { return ""; }
}
function setBackground(value) {
  if (value && (!/^data:image\/(jpeg|png);base64,/.test(value) || value.length >= 240000)) return false;
  try {
    if (value) localStorage.setItem(KEY, value); else localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("apex26:photo-background", { detail: { available: !!value } }));
    return true;
  } catch (_) { return false; }
}
function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") { reject(new Error("Photo storage unavailable")); return; }
    const req = indexedDB.open(DB, 1); let abandoned = false;
    req.onupgradeneeded = () => req.result.createObjectStore("photos", { keyPath: "id" });
    req.onerror = () => reject(req.error || new Error("Photo storage unavailable"));
    req.onsuccess = () => { if (abandoned) req.result.close(); else resolve(req.result); };
    req.onblocked = () => { abandoned = true; reject(new Error("Close another game tab to open photo storage")); };
  });
}
async function library(action, value) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("photos", action === "list" ? "readonly" : "readwrite"), store = tx.objectStore("photos");
      let result = null, failure = null;
      const req = action === "delete" ? store.delete(value) : store.getAll();
      req.onsuccess = () => {
        if (action !== "save") { result = req.result; return; }
        // Queue every mutation in this active request callback. Readwrite
        // transactions on the same store serialize across tabs; an await here
        // would let this transaction become inactive and lose that isolation.
        try {
          const photos = req.result.filter((p) => p.id !== value.id).concat(value)
            .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
          const keep = photos.slice(0, LIMIT);
          for (const old of photos.slice(LIMIT)) if (old.id !== value.id) store.delete(old.id);
          if (keep.some((p) => p.id === value.id)) {
            const put = store.put(value); put.onsuccess = () => { result = put.result; };
          }
        } catch (e) { failure = e; tx.abort(); }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = (e) => { failure = failure || (e && e.target && e.target.error) || tx.error; };
      // Reject only once abort has finished rolling back the whole write.
      tx.onabort = () => reject(failure || tx.error || new Error("Photo storage is full or unavailable"));
    });
  } finally { db.close(); }
}
function blobOf(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    try { canvas.toBlob((b) => b ? resolve(b) : reject(new Error("The image could not be encoded")), type || "image/png", quality); }
    catch (e) { reject(e); }
  });
}
async function download(blob, name) {
  if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
    await NativeDownload.saveBlob(blob, name);
    return;
  }
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function create(G, deps) {
  deps = deps || {};
  const root = G.$("photo-studio");
  if (!root) return null;
  // Prefer deps.ltStore.set (or deps.ltSet) so Photo Studio never trips setLightTune's
  // renderer-recovery latch clears; fall back only when neither dep is present.
  const ltWrite = (id, v) => {
    if (deps.ltStore && typeof deps.ltStore.set === "function") return deps.ltStore.set(id, v);
    if (typeof deps.ltSet === "function") return deps.ltSet(id, v);
    if (typeof G.setLightTune === "function") return G.setLightTune(id, v);
    return false;
  };
  const ltApply = () => {
    if (typeof deps.ltApply === "function") deps.ltApply();
    else if (typeof LightStore !== "undefined" && LightStore.reapply) LightStore.reapply();
  };
  // Photo looks belong to the free-camera visit, not to the lighting profile.
  // Writes stay live-only; the observer restores the exact pre-visit values
  // whenever FreeCam hides its panel, including Escape and teardown.
  if (typeof PhotoKit !== "undefined" && typeof LightTune !== "undefined" && LightTune.LT) {
    const freeRows = G.$("fc-rows"), freeRoot = G.$("freecam");
    if (freeRows && freeRoot && !G.$("fc-looks")) {
      const lookSession = PhotoKit.createLookSession((id) => LightTune.LT[id], ltWrite);
      const lookControls = PhotoKit.mountLookControls(freeRows, lookSession, document);
      if (lookControls && typeof MutationObserver !== "undefined") {
        new MutationObserver(() => {
          if (!freeRoot.hidden) return;
          if (lookSession.end()) {
            for (const button of lookControls.children) button.setAttribute("aria-pressed", "false");
          }
        }).observe(freeRoot, { attributes: true, attributeFilter: ["hidden"] });
      }
    }
  }
  const st = { open: false, source: "race", aspect: "wide", grid: "thirds", postcard: false, busy: false, closing: false, metadata: {}, back: null, snapshot: null, borrowed: null, generation: 0, subject: null };
  const E = {}, session = [];
  let last = null, raw = null, capturedOptions = null, focus = null, libraryPaint = 0, releaseCar = null, downloading = false;
  const mk = (tag, props, kids) => {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === "attrs") { for (const a in props[k]) el.setAttribute(a, props[k][a]); } else el[k] = props[k];
    }
    if (props && props.id) E[props.id] = el;
    if (kids) for (const c of kids) el.appendChild(c);
    return el;
  };
  const button = (label, run, id) => {
    const b = mk("button", { type: "button", textContent: label, id: id || "" });
    b.addEventListener("click", run); return b;
  };
  const select = (label, list, read, run, id) => {
    const row = SettingRow.build(id + "-row", label, list);
    row.sel.id = id; E[id] = row.sel;
    SettingRow.wire(row.row, { read, write: run }); return row.row;
  };
  const shots = mk("div", { id: "ps-shots", className: "balanced-row", attrs: { role: "group", "aria-label": "Shot presets" } });
  const guide = mk("div", { id: "ps-guide", attrs: { "aria-hidden": "true" } }, [mk("div", { id: "ps-grid" })]);
  const importFile = mk("input", { id: "ps-import", type: "file", accept: "image/png,image/jpeg,image/webp", attrs: { "aria-label": "Import a personal photo" } });
  importFile.addEventListener("change", () => importPhoto(importFile.files && importFile.files[0]));
  const group = (title, kids) => mk("section", { attrs: { "aria-label": title } }, [mk("h3", { className: "adv-sec", textContent: title }), ...kids]);
  const captureButton = button("CAPTURE", capture, "ps-capture"), done = button("DONE", () => close(true), "ps-close");
  captureButton.className = "bigbtn"; done.className = "bigbtn alt";
  // SUBJECT: the Home door opens on whatever the Home scene shows, and the
  // default scene is the garage, so the circuit shoot (free camera over the
  // track) was reachable only by changing Appearance › Scene · Home first.
  // The row hands the pick to the door (opts.subject), which swaps the Home
  // world for this visit and reopens the studio; the stored scene is untouched.
  const subjectValue = () => (isGarage() ? "garage" : "circuit");
  const subjectRow = select("Subject", [["garage", "Garage"], ["circuit", "Circuit"]], subjectValue,
    (v) => { if (st.subject && !st.busy && v !== subjectValue()) st.subject(v); }, "ps-subject");
  const subjectGroup = group("SUBJECT", [subjectRow,
    mk("p", { className: "adv-help", textContent: "Your car in the garage or on the circuit. Your Home scene stays as it is." })]);
  // CONDITIONS: the SESSION's time of day and weather through the lighting tuner's own seam (G.setTimeOfDay /
  // G.weather → Atmosphere.applyRaceSettings). A preview only: open() records what the session had, RESET and
  // every close put it back, so a photo never leaks into a race, a career or a result (the race is paused and the
  // Home car is a fresh borrowed one while the studio is open).
  const cond = { tod: null, wx: null, arc: null, touched: false };
  const pick = (label, list, read, run, id) => select(label, list, read, (v) => { run(v); paintCond(); }, id);
  const setTod = (v) => { if (st.busy || st.closing || isGarage()) return; cond.touched = true; G.setTimeOfDay(v); };
  const setWx = (v) => { if (st.busy || st.closing || isGarage()) return; cond.touched = true; G.weather(v); };
  const todRow = pick("Time of day", TODS, () => G.setTimeOfDay(), setTod, "ps-tod");
  const wxRow = pick("Weather", WXS, () => G.weather(), setWx, "ps-weather");
  const condReset = button("RESET CONDITIONS", () => resetCond(), "ps-cond-reset");
  const condGroup = group("TIME & WEATHER", [todRow, wxRow, condReset,
    mk("p", { className: "adv-help", textContent: "Changes the light and weather for this photo only. Your race and results stay as they were." })]);
  // DRIVING LINE: show or hide the suggested-line ribbon for this photo only (DrivingLine.setPhoto), put back on close.
  const lineRow = select("Driving line", [["on", "Shown"], ["off", "Hidden"]], () => (DrivingLine.shown() ? "on" : "off"),
    (v) => { if (st.busy || st.closing || isGarage()) return; DrivingLine.setPhoto(v === "on"); }, "ps-line");
  const lineGroup = group("DRIVING LINE", [lineRow,
    mk("p", { className: "adv-help", textContent: "Shows or hides the racing line for this photo only. Your DRIVING LINE setting stays as it is." })]);
  function paintCond() {
    for (const [id, row, v] of [["ps-tod", todRow, G.setTimeOfDay()], ["ps-weather", wxRow, G.weather()]]) {
      SettingRow.paint(row, v);
    }
    E["ps-cond-reset"].disabled = st.busy || !(G.setTimeOfDay() !== cond.tod || G.weather() !== cond.wx);
  }
  function resetCond() {
    if (cond.tod == null) return;
    if (G.setTimeOfDay() !== cond.tod) G.setTimeOfDay(cond.tod);
    if (G.weather() !== cond.wx || cond.touched) { G.weather(cond.wx); }
    if (cond.touched) G.weatherArc = cond.arc;   // a MIXED race's arc, dropped by weather()
    cond.touched = false;
    if (st.open) paintCond();
  }
  // GARAGE LOOKS: in the garage the bay's own room, crew and lighting stand in for TIME & WEATHER. The rows are the
  // TEAM tab's GARAGE / CREW / LIGHTING pickers (deps.garage.looks = SetupUI's lookRowSpecs, one table) and call the
  // same setters, so a pick here applies live and is saved exactly as there (apex26.garageLook / crewLook /
  // garageMood) — no reset on close. LIGHTING carries the hour: NIGHT, DAYLIGHT, SHOWROOM…
  const looksGroup = group("GARAGE & LIGHTING", [mk("p", { className: "adv-help", textContent: "Room, crew and lighting for your garage. Saved like the Team tab." })]);
  const lookRows = {};
  let looksChanged = false;
  const lookSpecs = () => (deps.garage && deps.garage.looks ? deps.garage.looks() || [] : []);
  const lookSpec = (key) => lookSpecs().find((s) => s.key === key) || null;
  const lookTitle = (label) => label.charAt(0) + label.slice(1).toLowerCase();
  function paintLooks() {
    const specs = isGarage() ? lookSpecs() : [];
    for (const s of specs) {
      if (!lookRows[s.key]) {
        const read = () => { const now = lookSpec(s.key); return now ? now.cur : ""; };
        lookRows[s.key] = select(lookTitle(s.label), s.ids.map((id) => [id, s.name(id)]), read, (v) => {
          const now = lookSpec(s.key);
          if (st.busy || st.closing || !isGarage() || !now || v === now.cur) return;
          now.apply(v); looksChanged = true;
        }, "ps-look-" + s.key);
        looksGroup.appendChild(lookRows[s.key]);
      }
      SettingRow.paint(lookRows[s.key], s.cur);
    }
    looksGroup.hidden = !specs.length;
  }
  // PHOTO LIGHTING: lazy controls from LightTune.TUNE_DEFS (~191 knobs). Open clones
  // G._ltStore into an isolated map; close restores the exact original reference
  // (never persist). Circuit / race shoots only — the garage uses GARAGE & LIGHTING.
  const lightSess = { saved: null, clone: null, snap: null, active: false, built: false, tab: null };
  const fmtPsTune = (d, v) => {
    if (d.fmt === "auto" && v < 0) return "AUTO";
    const dec = (String(d.step).split(".")[1] || "").length;
    const s = (+v).toFixed(Math.min(dec, 5));
    return (d.fmt === "signed" && v > 0 ? "+" + s : s);
  };
  const ltSlug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const ltTabs = mk("div", { id: "ps-lt-tabs", attrs: { role: "tablist", "aria-label": "Lighting groups" } });
  const ltRows = mk("div", { id: "ps-lt-rows" });
  const ltReset = button("RESET LIGHTING", () => resetLight(), "ps-lt-reset");
  const lightGroup = group("PHOTO LIGHTING", [
    mk("p", { className: "adv-help", textContent: "Full lighting knobs for this photo only. Closing restores the race lighting exactly." }),
    ltTabs, ltRows, ltReset,
  ]);
  lightGroup.hidden = true;
  function setLtTab(name, focus) {
    lightSess.tab = name;
    for (const g of ltRows.children) {
      const on = g.getAttribute("data-group") === name;
      g.classList.toggle("active", on); g.hidden = !on;
    }
    for (const t of ltTabs.children) {
      const on = t.getAttribute("data-group") === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    }
  }
  function buildLight() {
    if (lightSess.built || typeof LightTune === "undefined" || !LightTune.TUNE_DEFS || !LightTune.LT) return false;
    lightSess.built = true;
    const defs = LightTune.TUNE_DEFS, LT = LightTune.LT, groups = [];
    let cur = null, section = null, wrap = null;
    for (const d of defs) {
      if (d.group !== cur) {
        cur = d.group; groups.push(cur); section = null;
        const slug = ltSlug(cur);
        wrap = mk("div", { id: "ps-lt-panel-" + slug,
          attrs: { "data-group": cur, role: "tabpanel", "aria-labelledby": "ps-lt-tab-" + slug } });
        wrap.appendChild(mk("h3", { className: "adv-sec", textContent: cur }));
        wrap.hidden = true; ltRows.appendChild(wrap);
      }
      if (d.section && d.section !== section) {
        section = d.section;
        wrap.appendChild(mk("h4", { textContent: section }));
      }
      const out = mk("b", { id: "ps-lt-v-" + d.id });
      const lab = mk("span", { className: "tune-label", textContent: d.label + " " });
      lab.appendChild(out);
      const inp = mk("input", { id: "ps-lt-in-" + d.id, type: "range", min: String(d.min), max: String(d.max),
        step: String(d.step), value: String(LT[d.id]), attrs: { "aria-label": d.label } });
      if (d.desktopOnly && typeof GLX !== "undefined" && GLX.isMobile) {
        inp.disabled = true;
        lab.appendChild(mk("span", { textContent: " (DESKTOP ONLY)" }));
        inp.setAttribute("aria-label", d.label + " (desktop only)");
      }
      inp.addEventListener("input", () => {
        if (st.busy || st.closing || !lightSess.active) return;
        if (!ltWrite(d.id, parseFloat(inp.value))) return;
        out.textContent = fmtPsTune(d, LightTune.LT[d.id]);
        paintLtReset();
      });
      const item = mk("div", { className: "adv-item" }, [mk("label", { className: "tune-row" }, [lab, inp])]);
      if (d.help) item.appendChild(mk("p", { className: "adv-help", textContent: d.help }));
      wrap.appendChild(item);
    }
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i], slug = ltSlug(g);
      const t = mk("button", { type: "button", id: "ps-lt-tab-" + slug, textContent: g,
        attrs: { role: "tab", "data-group": g, "aria-controls": "ps-lt-panel-" + slug } });
      t.addEventListener("click", () => setLtTab(g));
      t.addEventListener("keydown", (e) => {
        let next = null;
        if (e.key === "ArrowRight") next = (i + 1) % groups.length;
        else if (e.key === "ArrowLeft") next = (i - 1 + groups.length) % groups.length;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = groups.length - 1;
        if (next == null) return;
        e.preventDefault(); setLtTab(groups[next], true);
      });
      ltTabs.appendChild(t);
    }
    setLtTab(groups[0] || null);
    return true;
  }
  function paintLight() {
    if (!lightSess.built || typeof LightTune === "undefined" || !LightTune.TUNE_DEFS) return;
    for (const d of LightTune.TUNE_DEFS) {
      const inp = E["ps-lt-in-" + d.id] || G.$("ps-lt-in-" + d.id);
      const out = E["ps-lt-v-" + d.id] || G.$("ps-lt-v-" + d.id);
      if (inp) inp.value = String(LightTune.LT[d.id]);
      if (out) out.textContent = fmtPsTune(d, LightTune.LT[d.id]);
    }
    paintLtReset();
  }
  function paintLtReset() {
    if (!E["ps-lt-reset"]) return;
    let dirty = false;
    if (lightSess.active && lightSess.clone && lightSess.snap) {
      dirty = JSON.stringify(lightSess.clone) !== JSON.stringify(lightSess.snap);
    }
    E["ps-lt-reset"].disabled = st.busy || !dirty;
  }
  function beginLight() {
    if (lightSess.active) endLight();
    if (!buildLight()) { lightGroup.hidden = true; return; }
    let saved;
    try { saved = G._ltStore; } catch (_) { saved = null; }
    if (saved == null || typeof saved !== "object") { lightGroup.hidden = true; return; }
    try {
      lightSess.saved = saved;
      lightSess.snap = JSON.parse(JSON.stringify(saved));
      lightSess.clone = JSON.parse(JSON.stringify(saved));
      G._ltStore = lightSess.clone;
      lightSess.active = true;
      lightGroup.hidden = false;
      setLtTab(lightSess.tab || (LightTune.TUNE_DEFS[0] && LightTune.TUNE_DEFS[0].group));
      paintLight();
    } catch (_) {
      lightSess.saved = lightSess.clone = lightSess.snap = null;
      lightSess.active = false; lightGroup.hidden = true;
    }
  }
  function resetLight() {
    if (!lightSess.active || !lightSess.clone || !lightSess.snap) return;
    for (const k of Object.keys(lightSess.clone)) delete lightSess.clone[k];
    Object.assign(lightSess.clone, JSON.parse(JSON.stringify(lightSess.snap)));
    ltApply();
    paintLight();
  }
  function endLight() {
    if (!lightSess.active) { lightGroup.hidden = true; return; }
    G._ltStore = lightSess.saved;
    lightSess.active = false;
    lightSess.saved = lightSess.clone = lightSess.snap = null;
    ltApply();
    lightGroup.hidden = true;
  }
  const placement = (label, id, min, max, step, unit) => {
    const out = mk("output", { id: id + "-value", textContent: "0" + unit });
    const input = mk("input", { id, type: "range", min: String(min), max: String(max), step: String(step), value: "0" });
    input.addEventListener("input", () => { out.textContent = input.value + unit; placeCar(id !== "ps-car-rotation"); });
    return mk("label", { className: "tune-row" }, [mk("span", { className: "tune-label", textContent: label }), input, out]);
  };
  const carGroup = group("PLACE YOUR CAR", [
    placement("Circuit position", "ps-car-position", 0, 100, .1, "%"),
    placement("Sideways", "ps-car-offset", -20, 20, .1, " m"),
    placement("Rotation", "ps-car-rotation", -180, 180, 1, "°"),
    button("FRAME CAR", () => setShot("car"), "ps-car-frame"),
  ]);
  const panel = mk("section", { id: "ps-panel", className: "sheet", attrs: { "aria-label": "Photo Studio" } }, [
    mk("header", { className: "sheet-head" }, [mk("h2", { textContent: "PHOTO STUDIO" })]),
    mk("div", { id: "ps-body", className: "sheet-body pane" }, [
      mk("p", { id: "ps-context", className: "adv-help" }),
      subjectGroup,
      carGroup,
      condGroup,
      lineGroup,
      lightGroup,
      looksGroup,
      group("COMPOSITION", [
        select("Frame", [["scene", "Full scene"], ["wide", "16:9"], ["square", "1:1"], ["portrait", "4:5"]], () => st.aspect, (v) => { st.aspect = v; guides(); if (!st.busy) recompose(); }, "ps-aspect"),
        select("Guide", [["off", "Off"], ["thirds", "Thirds"], ["centre", "Centre"]], () => st.grid, (v) => { st.grid = v; guides(); }, "ps-grid-select"),
        shots, mk("p", { id: "ps-help", className: "adv-help" }),
        coaching(),
        select("Caption", [["off", "Off"], ["on", "Postcard"]], () => st.postcard ? "on" : "off", (v) => { st.postcard = v === "on"; if (!st.busy) recompose(); }, "ps-postcard"),
      ]),
      group("YOUR PHOTO", [
        mk("img", { id: "ps-preview", alt: "Captured photo preview", hidden: true }),
        mk("div", { className: "balanced-row" }, [button("DOWNLOAD PNG", exportPhoto, "ps-export"), button("SAVE PHOTO", savePhoto, "ps-save")]),
        mk("div", { className: "balanced-row" }, [button("USE AS MENU BACKGROUND", useBackground, "ps-background"), button("CLEAR BACKGROUND", () => say(setBackground("") ? "Menu background cleared." : "Background could not be cleared."))]),
        mk("label", { className: "tune-row" }, [mk("span", { className: "tune-label", textContent: "Import your photo" }), importFile]),
      ]),
      mk("details", {}, [mk("summary", { textContent: "MY PHOTOS · up to 6" }), mk("div", { id: "ps-library" })]),
      mk("p", { id: "ps-message", attrs: { "aria-live": "polite", role: "status" } }),
    ]),
    mk("footer", { className: "sheet-foot" }, [captureButton, done]),
  ]);
  root.appendChild(guide); root.appendChild(panel);
  root.setAttribute("aria-label", "Photo Studio");
  root.setAttribute("data-esc-close", "ps-close");
  const say = (s) => { E["ps-message"].textContent = s; };
  function busy(value) {
    st.busy = value;
    const closing = !!st.closing;
    panel.setAttribute("aria-busy", value || closing ? "true" : "false");
    root.setAttribute("aria-busy", value || closing ? "true" : "false");
    // Keep #ps-close enabled: it is the data-esc-close / Start door. close()
    // already no-ops while st.closing, and TopModal.onEscape skips a disabled
    // door — so disabling DONE during CAPTURE/CLOSING trapped Escape until the
    // async restore finished (~10s on software GL).
    for (const id of ["ps-capture", "ps-export", "ps-save", "ps-background"]) {
      E[id].disabled = value || closing || (id !== "ps-capture" && !last);
    }
    E["ps-close"].disabled = false;
    E["ps-capture"].textContent = value && !closing ? "CAPTURING…" : "CAPTURE";
    E["ps-close"].textContent = closing ? "CLOSING…" : "DONE";
  }
  function guides() { root.dataset.aspect = st.aspect; root.dataset.grid = st.grid; }
  function camera() { return deps.freeCam || (typeof FreeCam !== "undefined" ? FreeCam : null); }
  function isGarage() { return st.source === "home" || st.source === "garage"; }
  function hasCar() { return st.open && !!releaseCar; }
  function placeCar(reframe = true) {
    if (!hasCar() || !G.player || !G.track) return;
    const c = G.player, sample = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
    c.s = (+E["ps-car-position"].value % 100) * G.track.total / 100;
    c.x = c.xVis = +E["ps-car-offset"].value;
    Tracks.sample(G.track, c.s, sample);
    const len = Math.hypot(sample.r[0], sample.r[2]) || 1; // horizontal metres, as worldFromTrack
    c.px = sample.p[0] + sample.r[0] / len * c.x;
    c.pz = sample.p[2] + sample.r[2] / len * c.x;
    c.yawVis = +E["ps-car-rotation"].value * Math.PI / 180;
    c.head = Math.atan2(sample.t[0], sample.t[2]) - c.yawVis;
    c.rPrevS = c.s; c.rPrevX = c.x; c.rPrevPx = c.px; c.rPrevPz = c.pz;
    c.rPrevHead = c.head; c.rPrevYawVis = c.yawVis; c.speed = 0;
    if (reframe) setShot("car");
  }
  function setShot(id) {
    if (st.busy || st.closing) return;
    if (isGarage()) { if (deps.garage && deps.garage.shot) deps.garage.shot(id); }
    else {
      const fc = camera(); if (!fc || !fc.cmd) return;
      const fov = id === "detail" ? 35 : id === "wide" ? 80 : 60;
      if (hasCar() && G.player && id !== "corner") {
        // Keep the subject above the phone sticks and left of the studio sheet.
        const c = G.player, sample = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0] };
        Tracks.sample(G.track, c.s, sample);
        const bank = Tracks.banking ? Tracks.banking(G.track, c.s, c.x) : null;
        const y = sample.p[1] + (bank ? bank.dy : 0), fx = Math.sin(c.head), fz = Math.cos(c.head);
        fc.cmd({ eye: [c.px - fx * 9, y + 3.2, c.pz - fz * 9],
          target: [c.px - fz * 3, y + .5, c.pz + fx * 3], fov });
      } else fc.cmd(id === "corner" ? { snap: "corner" } : { snap: "car", fov });
    }
  }
  function open(opts) {
    opts = opts || {};
    if (st.open) close(false);
    last = null; raw = null; capturedOptions = null; E["ps-preview"].hidden = true;
    st.source = opts.source || "race"; st.metadata = opts.metadata || {}; st.back = typeof opts.back === "function" ? opts.back : null;
    st.subject = typeof opts.subject === "function" ? opts.subject : null;
    focus = document.activeElement;
    if (isGarage()) {
      if (!deps.garage) return false;
      st.snapshot = deps.garage.snapshot ? deps.garage.snapshot() : null;
    } else {
      const fc = camera();
      const prior = fc && (fc.state ? fc.state() : fc.cmd ? fc.cmd() : null);
      st.borrowed = { open: prior && prior.open, state: prior, photo: !!G.photoMode,
        pose: G.photoCam ? { pos: G.photoCam.pos.slice(), yaw: G.photoCam.yaw, pitch: G.photoCam.pitch, fov: G.photoCam.fov } : null };
      if (!fc || !fc.enterFrom || !fc.enterFrom({})) return false;
      if (opts.view && fc.cmd) fc.cmd({ eye: opts.view.eye, target: opts.view.tgt, fov: opts.view.fov });
      const p = fc.panel ? fc.panel() : G.$("freecam-inner"); if (p) p.hidden = true;
      if (fc.setOverlaysVisible) fc.setOverlaysVisible(false);
    }
    if (st.source === "home-track" && deps.borrowCar) releaseCar = deps.borrowCar();
    st.open = true; st.generation++; root.hidden = false;
    carGroup.hidden = !hasCar();
    for (const [id, unit] of [["ps-car-position", "%"], ["ps-car-offset", " m"], ["ps-car-rotation", "°"]]) {
      E[id].value = "0"; E[id + "-value"].textContent = "0" + unit;
    }
    placeCar();
    condGroup.hidden = isGarage(); lineGroup.hidden = isGarage();
    if (!isGarage()) SettingRow.paint(lineRow, DrivingLine.shown() ? "on" : "off");
    looksChanged = false; paintLooks();
    if (!isGarage()) {
      cond.tod = G.setTimeOfDay(); cond.wx = G.weather(); cond.arc = G.weatherArc; cond.touched = false; paintCond();
      beginLight();
    } else { endLight(); }
    subjectGroup.hidden = !st.subject;
    if (st.subject) SettingRow.paint(subjectRow, subjectValue());
    document.body.classList.add("photo-studio-open");
    E["ps-context"].textContent = text(st.metadata.title || (isGarage() ? "Your garage" : G.track && (G.track.name || G.track.id)) || "Race photo");
    E["ps-help"].textContent = isGarage() ? "Choose a shot or drag the scene to orbit. Guides stay out of the exported photo." : "WASD move · drag to look · R/F height · Shift boost. Guides and HUD stay out of the photo.";
    shots.replaceChildren();
    const list = isGarage() ? [["hero", "HERO"], ["front", "FRONT"], ["side", "SIDE"], ["rear", "REAR"], ["top", "TOP"]] : [["car", "CHASE"], ["wide", "WIDE"], ["detail", "DETAIL"], ["corner", "CORNER"]];
    for (const [id, label] of list) shots.appendChild(button(label, () => setShot(id)));
    st.closing = false; guides(); busy(false); say("Capture the frame, then save or download it. Frame and Caption recrop your photo; moving the camera leaves it unchanged until CAPTURE."); paintLibrary(); E["ps-close"].focus();
    return true;
  }
  function close(back) {
    if (!st.open) return;
    if (back) {
      if (st.closing) return;
      st.closing = true;
      const gen = st.generation;
      busy(true);
      say("Restoring the scene…");
      // Paint CLOSING… before garage/home restore takes the main thread (~10s
      // on software GL). Lifecycle teardown (back=false) stays synchronous.
      const go = () => { if (st.generation === gen && st.closing) finishClose(true); };
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(go);
      else go();
      return;
    }
    finishClose(false);
  }
  function finishClose(back) {
    if (!st.open && !st.closing) return;
    if (!isGarage() && cond.tod != null) { resetCond(); cond.tod = null; }
    if (!isGarage()) DrivingLine.setPhoto(null);
    endLight();
    const returnTo = st.back; st.generation++; st.open = false; st.back = null; st.closing = false;
    if (releaseCar) { releaseCar(); releaseCar = null; }
    if (isGarage()) { if (deps.garage && deps.garage.restore && st.snapshot) deps.garage.restore(st.snapshot); st.snapshot = null; }
    else {
      const fc = camera(), prior = st.borrowed;
      if (back && prior && prior.open && fc && fc.cmd) {
        fc.cmd(prior.state); if (fc.setOverlaysVisible) fc.setOverlaysVisible(true); const p = fc.panel ? fc.panel() : G.$("freecam-inner"); if (p) p.hidden = false;
      } else {
        if (fc && fc.close) fc.close(false, !!(back && prior && prior.photo)); else if (fc && fc.cmd) fc.cmd(false);
        if (back && prior && prior.photo && prior.pose && G.photoCam) {
          G.photoCam.pos.splice(0, 3, ...prior.pose.pos); G.photoCam.yaw = prior.pose.yaw; G.photoCam.pitch = prior.pose.pitch; G.photoCam.fov = prior.pose.fov;
        }
      }
      st.borrowed = null;
    }
    if (deps.onClose) deps.onClose({ restoredPhoto: !!G.photoMode });
    // Hide before returnTo(): body.photo-studio-open forces #rotate-device
    // display:none, so setPaused → syncRotateBlocker would miss the portrait
    // gate and leave the pause card up (photo-studio.spec.js race close).
    const target = focus, generation = st.generation;
    // Release the composed canvas (up to 2048 px, ~17 MB RGBA) and its preview data URL; open() rebuilds both.
    last = null; raw = null; capturedOptions = null; E["ps-preview"].removeAttribute("src"); E["ps-preview"].hidden = true;
    // ...and the library rows: each held a thumbnail data URL and a DOWNLOAD closure over its photo blob. open() repaints them.
    if (E["ps-library"]) E["ps-library"].replaceChildren();
    root.hidden = true; document.body.classList.remove("photo-studio-open");
    busy(false);
    if (back && returnTo) returnTo();
    // A look picked here repaints the Team tab the studio was opened over (it reads the scene modules on build).
    if (looksChanged && deps.garage && deps.garage.looked) deps.garage.looked();
    looksChanged = false;
    // Let the caller paint its restored visibility after modal isolation settles.
    if (back && target && target.focus) requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!st.open && st.generation === generation && target.isConnected) target.focus();
    }));
  }
  async function frame() {
    const gfx = G.gfx;
    if (gfx && gfx.invalidateSoftPresent && gfx.softPresent && gfx.softPresent()) gfx.invalidateSoftPresent();
    const pending = gfx && gfx.softPresent && gfx.softPresent() && gfx.awaitSoftPresent ? gfx.awaitSoftPresent(15000) : null;
    if (deps.renderFrame) deps.renderFrame();
    // Read WebGL before yielding: its unpreserved backbuffer is cleared after compositing.
    let pixels = null;
    if (gfx && gfx.capturePixels) {
      let read;
      try { read = gfx.capturePixels(); } catch (e) { read = Promise.reject(e); }
      // Observe both immediately, even when one rejects before the other is
      // ready. The raw pixels are captured now; software presentation may finish later.
      const [presented, captured] = await Promise.allSettled([pending || Promise.resolve(), read]);
      if (presented.status === "rejected") throw presented.reason;
      if (captured.status === "fulfilled") pixels = captured.value;
      else {
        // Native WebGPU canvases can compose directly even when a backend has
        // no readback render target. Draw and copy in this same task instead.
        Log.warn("ui", "backend readback unavailable; copying the scene canvas", captured.reason);
      }
    } else if (pending) await pending;
    if (!pixels && !pending && deps.renderFrame) {
      // Repaint immediately before a native canvas copy; no await may come
      // between this draw and drawImage below.
      deps.renderFrame();
    }
    const canvas = mk("canvas");
    if (pixels && pixels.data && pixels.width && pixels.height) {
      canvas.width = pixels.width; canvas.height = pixels.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Image composition is unavailable");
      const image = ctx.createImageData(pixels.width, pixels.height); image.data.set(pixels.data); ctx.putImageData(image, 0, 0);
    } else {
      const soft = document.getElementById("game-soft"), source = pending && soft ? soft : G.canvas || G.$("game");
      if (!source || !source.width || !source.height) throw new Error("No rendered scene is ready");
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("Image composition is unavailable"); ctx.drawImage(source, 0, 0);
    }
    return canvas;
  }
  function options() { return { aspect: st.aspect, postcard: st.postcard, metadata: { title: st.metadata.title || G.track && G.track.name || "GARAGE", subtitle: st.metadata.subtitle || (isGarage() ? "PERSONAL PHOTO" : "RACE MOMENT") } }; }
  function recompose() {
    if (!raw || !capturedOptions) return;
    last = compose(raw, { ...capturedOptions, aspect: st.aspect, postcard: st.postcard });
    E["ps-preview"].src = thumbnail(last); E["ps-preview"].hidden = false;
  }
  function keepSource(source, opts) {
    const scale = Math.min(1, 2048 / source.width, 2048 / source.height), copy = mk("canvas");
    copy.width = Math.max(1, Math.round(source.width * scale)); copy.height = Math.max(1, Math.round(source.height * scale));
    copy.getContext("2d").drawImage(source, 0, 0, copy.width, copy.height); raw = copy; capturedOptions = opts;
  }
  function coaching() {
    const box = mk("details", { id: "ps-coach" }, [mk("summary", { textContent: "COMPOSITION TIPS" })]);
    for (const [label, shot, tip] of [["Car detail", "detail", "Use a narrow lens to make one car detail the subject."], ["Corner story", "corner", "Include the entry and exit so the corner tells a story."], ["Space ahead", "wide", "Leave room in the direction the car is travelling."]]) {
      box.appendChild(mk("p", { className: "adv-help", textContent: tip }));
      box.appendChild(button(label, () => { if (st.busy) return; setShot(isGarage() ? ({ detail: "front", corner: "side", wide: "hero" })[shot] : shot); st.grid = "thirds"; E["ps-grid-select"].value = "thirds"; guides(); }));
    }
    box.appendChild(button("DISMISS TIPS", () => { box.hidden = true; })); return box;
  }
  function compose(source, opts = options()) {
    const box = crop(source.width, source.height, opts.aspect), scale = Math.min(1, 2048 / box.width, 2048 / box.height), out = mk("canvas");
    out.width = Math.round(box.width * scale); out.height = Math.round(box.height * scale);
    const ctx = out.getContext("2d"); if (!ctx) throw new Error("Image composition is unavailable");
    ctx.drawImage(source, box.x, box.y, box.width, box.height, 0, 0, out.width, out.height);
    if (opts.postcard) {
      const h = Math.max(54, out.height * 0.11), pad = Math.max(16, out.width * 0.025);
      ctx.fillStyle = "rgba(12,12,20,0.9)"; ctx.fillRect(0, out.height - h, out.width, h);
      ctx.fillStyle = "#f6f6f9"; ctx.font = "bold " + Math.round(h * 0.32) + "px sans-serif";
      ctx.fillText("APEX 26 · " + text(opts.metadata.title, 70), pad, out.height - h * 0.5, out.width - pad * 2);
      ctx.font = Math.round(h * 0.22) + "px sans-serif";
      ctx.fillText(text(opts.metadata.subtitle, 90), pad, out.height - h * 0.18, out.width - pad * 2);
    }
    return out;
  }
  function thumbnail(canvas) {
    const thumb = mk("canvas"), scale = Math.min(1, 640 / canvas.width, 360 / canvas.height);
    thumb.width = Math.max(1, Math.round(canvas.width * scale)); thumb.height = Math.max(1, Math.round(canvas.height * scale));
    thumb.getContext("2d").drawImage(canvas, 0, 0, thumb.width, thumb.height);
    return thumb.toDataURL("image/jpeg", 0.7);
  }
  // #3656: the live view may run below native resolution (the governor, a
  // phone's title scene), and the photo copied that backing store: 217 x 122 px
  // on an iPhone 14. The shot renders at renderScale 1 (the native backing
  // size, still under the backend's DPR cap and texture limit; keepSource and
  // compose bound it at 2048 px), then the live scale comes back unchanged.
  async function fullRes(run) {
    const gfx = G.gfx, prev = gfx && gfx.getRenderScale && gfx.setRenderScale ? gfx.getRenderScale() : 1;
    const raised = prev < 1 && !!gfx.setRenderScale(1);
    try { return await run(); } finally { if (raised) gfx.setRenderScale(prev); }
  }
  async function capture() {
    if (!st.open || st.busy) return false;
    const gen = st.generation, opts = options(); busy(true); say("Capturing the rendered scene…");
    try {
      const source = await fullRes(frame); if (gen !== st.generation) return false;
      keepSource(source, opts); last = compose(raw, opts); E["ps-preview"].src = thumbnail(last); E["ps-preview"].hidden = false;
      say("Captured " + last.width + " × " + last.height + ". Ready to download or save."); return true;
    } catch (e) { Log.warn("ui", "capture failed", e); if (gen === st.generation) say("Capture failed: " + text(e.message, 120) + ". Try again once the scene is ready."); return false; }
    finally { if (gen === st.generation) busy(false); }
  }
  async function exportPhoto() {
    if (!st.open || !last || st.busy || downloading) return;
    downloading = true;
    const gen = st.generation, name = filename(st.metadata.title || "photo"), canvas = last;
    try { await download(await blobOf(canvas), name); if (gen === st.generation) say("PNG download requested."); }
    catch (e) { if (gen === st.generation) say("Download failed: " + text(e.message)); }
    finally { downloading = false; }
  }
  async function savePhoto() {
    if (!st.open || !last || st.busy) return;
    const gen = st.generation, canvas = last, title = text(st.metadata.title || "Photo");
    busy(true);
    try {
      const blob = await blobOf(canvas, "image/jpeg", 0.88);
      if (blob.size > 3 * 1024 * 1024) throw new Error("This photo is too large. Download the PNG instead");
      const entry = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 7), at: Date.now(), title, blob, thumb: thumbnail(canvas) };
      try {
        await library("save", entry);
        if (gen === st.generation) say("Saved to My Photos on this device.");
      } catch (_) { session.unshift(entry); session.splice(LIMIT); if (gen === st.generation) say("Device storage is unavailable. Saved for this visit; download to keep it."); }
      if (gen === st.generation) await paintLibrary();
    } catch (e) { if (gen === st.generation) say("Save failed: " + text(e.message)); }
    finally { if (gen === st.generation) busy(false); }
  }
  function sceneIsPhoto() {
    return typeof GameStore !== "undefined" && GameStore.store
      ? GameStore.store.get("homeScene", "photo") === "photo" : true;
  }
  function useBackground() {
    if (!last) return;
    if (!sceneIsPhoto()) { say("Set Appearance Scene to My photo first."); return; }
    say(setBackground(thumbnail(last)) ? "Personal photo set as menu background." : "Device storage is full. Download the photo to keep it.");
  }
  async function paintLibrary() {
    const gen = st.generation, paint = ++libraryPaint;
    let photos; try { photos = await library("list"); } catch (_) { photos = []; }
    if (!st.open || gen !== st.generation || paint !== libraryPaint) return;
    const box = E["ps-library"];
    // DELETE repaints the list under the focused button; keepFocus lands on the
    // same slot in the new list instead of dropping focus to <body>.
    const render = () => { box.replaceChildren(); paintPhotos(box, photos); };
    if (typeof TopModal !== "undefined" && TopModal.keepFocus) TopModal.keepFocus(box, render); else render();
  }
  function paintPhotos(box, photos) {
    photos = photos.concat(session).sort((a, b) => b.at - a.at).slice(0, LIMIT);
    if (!photos.length) { box.appendChild(mk("p", { className: "adv-help", textContent: "Capture a frame and save it here. Photos stay on this device." })); return; }
    const bgOk = sceneIsPhoto();
    for (const p of photos) {
      const bg = button("MENU BACKGROUND", () => {
        if (!sceneIsPhoto()) { say("Set Appearance Scene to My photo first."); return; }
        say(setBackground(p.thumb) ? "Personal menu background selected." : "Device storage is unavailable.");
      });
      bg.classList.add("ps-use-bg");
      bg.disabled = !bgOk;
      if (!bgOk) bg.setAttribute("aria-disabled", "true");
      const row = mk("div", { className: "pane" }, [mk("img", { src: p.thumb, alt: p.title || "Saved photo" }), mk("span", { textContent: p.title || "Photo" }),
        button("DOWNLOAD", async () => {
          if (downloading) return;
          downloading = true;
          const gen = st.generation;
          try { await download(p.blob, filename(p.title).replace(/\.png$/, ".jpg")); if (gen === st.generation) say("Photo download requested."); }
          catch (e) { if (gen === st.generation) say("Download failed: " + text(e.message)); }
          finally { downloading = false; }
        }),
        bg,
        button("DELETE", async () => { const i = session.findIndex((x) => x.id === p.id); if (i >= 0) session.splice(i, 1); else try { await library("delete", p.id); } catch (_) { say("Photo could not be deleted."); return; } paintLibrary(); }),
      ]);
      box.appendChild(row);
    }
  }
  async function importPhoto(file) {
    if (!file || !st.open || st.busy) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 12 * 1024 * 1024) { say("Choose a PNG, JPEG or WebP photo under 12 MB."); return; }
    const gen = st.generation, opts = options(); busy(true);
    try {
      // Decode at native size; keepSource already downscales (never upscales). A forced
      // resizeWidth:1024 used to enlarge small personal photos (hunt F4).
      const image = await createImageBitmap(file);
      try {
        if (gen !== st.generation) return;
        if (image.width > 8192 || image.height > 8192) throw new Error("Choose a photo with a less extreme aspect ratio");
        keepSource(image, opts); last = compose(raw, opts); E["ps-preview"].src = thumbnail(last); E["ps-preview"].hidden = false; say("Personal photo imported. Save it or use it as your menu background.");
      }
      finally { image.close(); }
    } catch (e) { if (gen === st.generation) say("This photo could not be opened: " + text(e.message)); }
    finally { if (gen === st.generation) { busy(false); importFile.value = ""; } }
  }
  function state() { return { open: st.open, generation: st.generation, source: st.source, subject: !!st.subject, aspect: st.aspect, grid: st.grid, postcard: st.postcard, busy: st.busy, captured: !!last, width: last ? last.width : 0, height: last ? last.height : 0, background: !!background() }; }
  async function album() {
    let photos;
    try { photos = await library("list"); } catch (e) { if (!session.length) throw e; photos = []; }
    const seen = new Set();
    return photos.concat(session).sort((a, b) => b.at - a.at || String(a.id).localeCompare(String(b.id)))
      .filter((p) => { if (seen.has(p.id)) return false; seen.add(p.id); return /^data:image\/(jpeg|png);base64,/.test(p.thumb || "") && p.thumb.length < 240000; })
      .slice(0, LIMIT).map((p) => Object.freeze({ id: String(p.id), title: text(p.title || "Photo"), thumb: p.thumb, at: +p.at || 0 }));
  }
  async function contactSheet(times, seek, cancelled) {
    const out = mk("canvas"); out.width = 1536; out.height = 342;
    const ctx = out.getContext("2d"); if (!ctx) throw new Error("Image composition is unavailable");
    for (let i = 0; i < times.length; i++) {
      if (cancelled()) throw new Error("Contact sheet cancelled");
      seek(times[i]); const image = await frame();
      if (cancelled()) throw new Error("Contact sheet cancelled");
      const box = crop(image.width, image.height, "wide");
      ctx.drawImage(image, box.x, box.y, box.width, box.height, i * 512, 0, 512, 288);
      ctx.fillStyle = "#0c0c14"; ctx.fillRect(i * 512, 288, 512, 54); ctx.fillStyle = "#f6f6f9"; ctx.font = "18px sans-serif";
      ctx.fillText(["BEFORE", "MOMENT", "AFTER"][i] + " · " + times[i].toFixed(2) + "s", i * 512 + 16, 322);
    }
    const blob = await blobOf(out); if (cancelled()) throw new Error("Contact sheet cancelled");
    await download(blob, "apex26-replay-moment.png"); return true;
  }
  const api = { open, close, capture, state, contactSheet, album, background, setBackground, exportPhoto, savePhoto, hasCar };
  live = api; busy(false); return api;
}
// ASPECTS / LIMIT stay module-private (crop + library only); no external callers.
return Object.freeze({ create, background, setBackground, crop, filename, album: () => live ? live.album() : Promise.reject(new Error("Photo library unavailable")), contactSheet: (times, seek, cancelled) => live ? live.contactSheet(times, seek, cancelled) : Promise.reject(new Error("Photo capture unavailable")), state: () => live ? live.state() : { open: false } });
})();
