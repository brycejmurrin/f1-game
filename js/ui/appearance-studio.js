/* AppearanceStudio — visual presets, named profiles and a readable preview.
   Only VISUAL_KEYS cross the save/apply boundary; driving and career state never do.
   The existing Appearance folds remain the advanced controls for every screen. */
const AppearanceStudio = (function () {
  "use strict";
  const store = GameStore.store;
  const PROFILE_KEY = "appearanceProfiles";
  const ENUMS = {
    uiTheme: ["dark", "light", "system"], menuAccent: ["brand", "team", "ember", "amber", "cyan", "violet", "lime", "custom"],
    hudAccent: ["brand", "team", "ember", "amber", "cyan", "violet", "lime", "custom"], textSize: ["normal", "large", "larger"],
    uiContrast: ["off", "high"], cvdMode: ["off", "deutan", "protan", "tritan"], speedUnits: ["kmh", "mph"], menuHelp: ["on", "off"], motion: ["on", "reduce"],
    titleIntro: ["full", "quick", "off"], menuWash: ["full", "soft", "off"], titleArt: ["on", "soft", "off"],
    pauseLayout: ["grid", "list", "compact", "wide", "sidebar"], pauseSide: ["centre", "left", "right"], pauseDim: ["full", "soft", "off"],
    hudProfile: ["minimal", "standard", "broadcast"], hudMetricsLayout: ["auto", "full", "timing", "driver", "compact"],
    hudMapVis: ["auto", "on", "off"], hudGapsVis: ["auto", "on", "off"], hudMirror: ["auto", "on", "off"],
    homeScene: ["auto", "garage", "night", "studio", "track", "pitlane", "static", "photo"], backgroundMotion: ["still", "ambient"],
    homeCamera: ["auto", "hero", "front", "side", "rear"],
  };
  // Visual RESET SCOPE writes this snapshot. Prefer SettingsDefaults when a key
  // is listed there so RESET restores the same shipped prefs a fresh install gets.
  const shipped = (k, d) => (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(k))
    ? SettingsDefaults.get(k) : d;
  const DEFAULTS = Object.freeze({ uiTheme: "dark", menuAccent: shipped("menuAccent", "ember"), hudAccent: "team", menuAccentHex: "#e10600", hudAccentHex: "#e10600",
    textSize: shipped("textSize", "large"), uiContrast: shipped("uiContrast", "high"), cvdMode: "off", speedUnits: "kmh", menuHelp: "on", motion: null, uiScale: null,
    hudScale: null, hudBtnScale: null, hudBtnOpacity: null, hudPanelOpacity: null,
    titleIntro: "full", menuWash: "full", titleArt: "on", titleLayout: null,
    pauseLayout: "grid", pauseSide: "centre", pauseDim: "full",
    hudProfile: "standard", hudMetricsLayout: "full", hudMapVis: "on", hudGapsVis: "on", hudMirror: shipped("hudMirror", "auto"),
    lookPause: null, lookDatahub: null, lookSelect: null, lookRace: null, lookCareer: null, lookGarage: null, lookPopups: null,
    homeScene: shipped("homeScene", "photo"), backgroundMotion: shipped("backgroundMotion", "ambient"), homeCamera: shipped("homeCamera", "side") });
  // motion is NULLABLE: unset = follow the OS / touch auto comfort (CamComfort,
  // TitleFx); an explicit "on" would override both, so the Studio never pins it.
  const VISUAL_KEYS = Object.freeze(Object.keys(DEFAULTS));
  const LOOKS = { lookPause: "pause", lookDatahub: "datahub", lookSelect: "select", lookRace: "race", lookCareer: "career", lookGarage: "garage", lookPopups: "popups" };
  const SCREEN_KEYS = Object.freeze({ home: ["titleIntro", "menuWash", "titleArt", "titleLayout", "homeScene", "backgroundMotion", "homeCamera"],
    career: ["lookCareer"], race: ["lookRace"], hud: ["hudProfile", "hudMetricsLayout", "hudMapVis", "hudGapsVis", "hudMirror", "hudScale", "hudBtnScale", "hudBtnOpacity", "hudPanelOpacity", "hudAccent", "hudAccentHex"],
    popups: ["lookPopups"] });
  const PRESETS = Object.freeze([
    { id: "classic", name: "CLASSIC", note: "Original motorsport style", values: { homeScene: "static" } },
    { id: "paddock", name: "TEAM PADDOCK", note: "Your team, your garage", values: { menuAccent: "team", hudAccent: "team", homeScene: "garage", backgroundMotion: "ambient", lookCareer: { density: "roomy" } } },
    { id: "broadcast", name: "BROADCAST", note: "Timing and race context", values: { menuAccent: "cyan", hudAccent: "cyan", hudProfile: "broadcast", homeScene: "night", backgroundMotion: "still", lookDatahub: { tabs: "underline", stripes: "on" } } },
    { id: "focus", name: "FOCUS", note: "Quiet menus, clear track", values: { homeScene: "static", hudProfile: "minimal", hudMetricsLayout: "compact", hudMapVis: "auto", hudGapsVis: "auto", motion: "reduce", titleIntro: "off", menuWash: "soft", titleArt: "soft" } },
    { id: "sunlight", name: "SUNLIGHT", note: "Bright, solid and readable", values: { homeScene: "static", uiTheme: "light", uiContrast: "high", textSize: "large", lookPopups: { dim: "solid" }, lookRace: { dim: "solid" }, lookCareer: { dim: "solid" } } },
  ]);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const isObject = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  function normalizeSnapshot(input) {
    const src = isObject(input) ? input : {}, out = {};
    for (const k of VISUAL_KEYS) {
      const v = src[k];
      if (ENUMS[k]) out[k] = ENUMS[k].includes(v) ? v : DEFAULTS[k];
      else if (k.endsWith("Hex")) out[k] = /^#[0-9a-f]{6}$/i.test(v || "") ? v.toLowerCase() : DEFAULTS[k];
      else if (k.endsWith("Scale") || k.endsWith("Opacity")) {
        const lo = k.endsWith("Opacity") ? 20 : k === "hudScale" ? 70 : 40, hi = k.endsWith("Opacity") ? 100 : k === "hudBtnScale" ? 300 : 200;
        out[k] = typeof v === "number" && Number.isFinite(v) ? Math.round(Math.max(lo, Math.min(hi, v)) * 4) / 4 : null;
      } else if (LOOKS[k]) out[k] = isObject(v) && typeof ScreenLooks !== "undefined" ? ScreenLooks.normalize(LOOKS[k], v) : null;
      else if (k === "titleLayout") out[k] = isObject(v) && typeof TitleLayout !== "undefined"
        ? { v: 2, wide: TitleLayout.normalize(v.wide || (v.v === 2 ? null : v)), tall: TitleLayout.normalize(v.tall || (v.v === 2 ? null : v)) } : null;
    }
    return out;
  }
  function snapshot() { const out = {}; for (const k of VISUAL_KEYS) out[k] = store.get(k, DEFAULTS[k]); return normalizeSnapshot(out); }
  let hooks = {}, ui = null, previewPage = "home", previewShape = "desktop", scope = "global", selectedProfile = "", activePreset = "";
  let muted = false, pending = 0, last = snapshot(), previewSceneKey = "";
  const undoStack = [], sceneListeners = [];
  function say(message) { if (ui) ui.status.textContent = message; }
  function invoke(name, ...args) { try { if (typeof hooks[name] === "function") return hooks[name](...args); } catch (e) { Log.warn("ui", "Appearance " + name + ": " + e.message); say("Your appearance is saved; the scene preview could not refresh. Try another scene."); } }
  function scene() { const mode = store.get("homeScene", "photo"), motion = store.get("backgroundMotion", "ambient"); return { mode: ENUMS.homeScene.includes(mode) ? mode : "photo", motion: motion === "ambient" ? "ambient" : "still" }; }
  function homeCamera() { const value = store.get("homeCamera", "side"); return ENUMS.homeCamera.includes(value) ? value : "side"; }
  function setHomeCamera(value) { const next = snapshot(); next.homeCamera = value; return applySnapshot(next); }
  function effectiveSceneMotion() {
    const s = scene();
    const os = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return s.motion === "ambient" && !os && (typeof TitleFx === "undefined" || TitleFx.mode() !== "reduce") ? "ambient" : "still";
  }
  function sceneChanged(force = false) {
    const value = scene(), key = value.mode + ":" + value.motion + ":" + effectiveSceneMotion() + ":" + homeCamera();
    if (!force && key === previewSceneKey) return;
    previewSceneKey = key;
    for (const fn of sceneListeners) { try { fn(value); } catch (e) { Log.warn("ui", "Appearance scene listener: " + e.message); } }
    if (ui) { if (["static", "photo"].includes(value.mode)) ui.preview.style.removeProperty("--studio-scene-image"); invoke("previewScene", value, ui.preview); }
  }
  function onSceneChange(fn) { if (typeof fn !== "function") return () => {}; sceneListeners.push(fn); return () => { const i = sceneListeners.indexOf(fn); if (i >= 0) sceneListeners.splice(i, 1); }; }
  function remember(before) { if (JSON.stringify(before) === JSON.stringify(snapshot())) return; undoStack.push(clone(before)); if (undoStack.length > 30) undoStack.shift(); activePreset = ""; last = snapshot(); render(); }
  function refreshOwners(values) {
    if (typeof AppearanceOpts !== "undefined" && AppearanceOpts.restore) AppearanceOpts.restore(values);
    if (typeof TitleFx !== "undefined") { TitleFx.apply(); TitleFx.wireRows(); }
    if (typeof TitleLayout !== "undefined") { TitleLayout.apply(); TitleLayout.build(); }
    if (typeof PauseOpts !== "undefined") { PauseOpts.apply(); PauseOpts.wireRows(); }
    if (typeof ScreenLooks !== "undefined") { ScreenLooks.apply(); ScreenLooks.refresh(); }
    invoke("applyVisuals", values);
    sceneChanged();
  }
  function keysFor(chosenScope) { return chosenScope === "screen" ? SCREEN_KEYS[previewPage] : VISUAL_KEYS; }
  function applySnapshot(value, options = {}) {
    const next = normalizeSnapshot(value), before = snapshot(), keys = keysFor(options.scope || "global");
    let durable = true;
    clearTimeout(pending); muted = true;
    // Only keys whose value actually changes are written: an untouched key stays
    // unset (it keeps following SettingsDefaults), and a null motion REMOVES the
    // key instead of pinning "on".
    try {
      for (const k of keys) {
        if (JSON.stringify(before[k]) === JSON.stringify(next[k])) continue;
        if (store.set(k, k === "motion" && next[k] === null ? undefined : clone(next[k])) === false) durable = false;
      }
      refreshOwners(snapshot());
    }
    finally { muted = false; }
    if (options.history !== false) remember(before);
    last = snapshot(); render();
    return { ok: true, durable };
  }
  function applyPreset(id, chosenScope = scope) {
    const p = PRESETS.find((v) => v.id === id); if (!p) return false;
    const result = applySnapshot(Object.assign({}, DEFAULTS, p.values), { scope: chosenScope });
    activePreset = id; render(); say(p.name + " applied to " + (chosenScope === "screen" ? pageLabel() : "all visual settings") + (result.durable ? "." : " for this session; browser storage is unavailable.")); return true;
  }
  function setScene(mode, motion) {
    const next = snapshot(); if (mode !== undefined) next.homeScene = mode; if (motion !== undefined) next.backgroundMotion = motion;
    return applySnapshot(next);
  }
  function durabilityNote(result) { return result.durable ? "." : " for this session; browser storage is unavailable."; }
  function undo() { const previous = undoStack.pop(); if (!previous) return false; const result = applySnapshot(previous, { history: false }); activePreset = ""; say("Previous visual settings restored" + durabilityNote(result)); return true; }
  function reset(chosenScope = scope) { const result = applySnapshot(DEFAULTS, { scope: chosenScope }); activePreset = ""; render(); say((chosenScope === "screen" ? pageLabel() : "All visual settings") + " reset" + durabilityNote(result) + " Undo restores your previous choices."); }
  function normalizeProfiles(raw) {
    if (!Array.isArray(raw)) return [];
    const ids = new Set();
    return raw.slice(0, 12).filter((p) => isObject(p) && typeof p.id === "string" && /^[a-z0-9-]{1,64}$/i.test(p.id) && typeof p.name === "string" && p.name.trim() && !ids.has(p.id) && ids.add(p.id))
      .map((p) => ({ id: p.id, name: p.name.trim().slice(0, 40), values: normalizeSnapshot(p.values) }));
  }
  function profiles() { return normalizeProfiles(store.get(PROFILE_KEY, [])); }
  function writeProfiles(rows) {
    const result = store.write ? store.write(PROFILE_KEY, rows) : { ok: true, durable: store.set(PROFILE_KEY, rows) !== false };
    say(result.durable ? "Appearance profile saved." : "Profile saved for this session. Browser storage could not save it for your next visit."); render(); return result;
  }
  function saveProfile(name, id) {
    const label = String(name || "").trim().slice(0, 40); if (!label) { say("Give your profile a name first."); return { ok: false, reason: "name" }; }
    const rows = profiles(), at = rows.findIndex((p) => p.id === id);
    if (at < 0 && rows.length >= 12) { say("You have 12 profiles. Select one to update, or delete one first."); return { ok: false, reason: "limit" }; }
    let newId = id; if (at < 0) { let n = 1; while (rows.some((p) => p.id === "profile-" + n)) n++; newId = "profile-" + n; }
    const row = { id: newId, name: label, values: snapshot() }; if (at < 0) rows.push(row); else rows[at] = row;
    selectedProfile = newId; return writeProfiles(rows);
  }
  function loadProfile(id) { const p = profiles().find((r) => r.id === id); if (!p) return false; selectedProfile = id; const result = applySnapshot(p.values); say(p.name + " applied to all visual settings" + durabilityNote(result)); return true; }
  function deleteProfile(id) { const rows = profiles(); if (!rows.some((p) => p.id === id)) return false; selectedProfile = ""; const result = writeProfiles(rows.filter((p) => p.id !== id)); say(result.durable ? "Profile deleted. Your current appearance stays in place." : "Profile deleted for this session. Browser storage could not save that change for your next visit."); return true; }
  function attach(value) { hooks = value || {}; invoke("applyVisuals", snapshot()); sceneChanged(); }
  function setPreviewFrame(url) {
    if (!ui || typeof url !== "string" || !/^(data:image\/(png|jpeg|webp);base64,|blob:)/.test(url)) return false;
    ui.preview.style.setProperty("--studio-scene-image", 'url("' + url.replace(/["\\\n\r]/g, "") + '")'); return true;
  }
  const pageLabel = () => ({ home: "Home", career: "Career", race: "Race Setup", hud: "HUD", popups: "Popup" })[previewPage];
  function node(tag, cls, text) { const e = document.createElement(tag); if (cls) e.dataset.as = cls.replace(/^as-/, ""); if (text != null) e.textContent = text; return e; }
  function button(text, fn, cls) { const e = node("button", cls, text); e.type = "button"; e.addEventListener("click", fn); return e; }
  function group(host, title) { const box = node("section", "as-box"); box.appendChild(node("h3", "as-heading", title)); host.appendChild(box); return box; }
  function choice(host, label, key, values) {
    const row = node("div", "as-row"), text = node("span", "as-label", label), controls = node("div", "as-segment");
    const list = []; controls.setAttribute("role", "group"); controls.setAttribute("aria-label", label);
    for (const [id, name] of values) { const b = button(name, () => { const v = snapshot(); v[key] = id; applySnapshot(v); }); controls.appendChild(b); list.push({ id, b }); }
    row.append(text, controls); host.appendChild(row); ui.choices.push({ key, list }); return row;
  }
  function colour(host, label, key, hexKey) {
    choice(host, label, key, [["brand", "Brand"], ["team", "Team"], ["ember", "Ember"], ["amber", "Amber"], ["cyan", "Cyan"], ["violet", "Violet"], ["lime", "Lime"], ["custom", "Custom"]]);
    const row = node("label", "as-row"), input = node("input"), name = node("span", "as-label", "Custom colour"); input.type = "color"; input.setAttribute("aria-label", label + " custom colour");
    input.addEventListener("change", () => { const v = snapshot(); v[key] = "custom"; v[hexKey] = input.value; applySnapshot(v); }); row.append(name, input); host.appendChild(row); ui.colours.push({ key, hexKey, row, input });
  }
  function range(host, label, key, lo, hi) {
    const row = node("label", "as-row"), name = node("span", "as-label", label), input = node("input"), out = node("output"); input.type = "range"; input.min = lo; input.max = hi; input.step = .25; input.setAttribute("aria-label", label);
    let before = null; input.addEventListener("pointerdown", () => { before = snapshot(); });
    input.addEventListener("input", () => { if (!before) before = snapshot(); const v = snapshot(); v[key] = Number(input.value); applySnapshot(v, { history: false }); });
    input.addEventListener("change", () => { if (before) { remember(before); before = null; } }); row.append(name, input, out); host.appendChild(row); ui.ranges.push({ key, input, out });
  }
  function previewContent(s) {
    const body = ui.preview; body.replaceChildren();
    body.appendChild(node("div", "as-preview-brand", "APEX 26"));
    const plate = node("div", "as-preview-content");
    if (previewPage === "home") { for (const name of ["RACE", "WATCH REAL RACES", "GARAGE", "SETTINGS"]) plate.appendChild(node("div", "as-preview-door", name)); }
    else if (previewPage === "career") { plate.append(node("h3", "", "DRIVER CAREER"), node("p", "", "NEXT RACE · MONZA"), node("div", "as-preview-door", "CONTINUE WEEKEND"), node("p", "", "DEVELOPMENT     TEAM     SEASON")); }
    else if (previewPage === "race") { plate.append(node("h3", "", "RACE SETTINGS"), node("p", "", "MONZA · GRAND PRIX")); for (const name of ["WEEKEND     RACE", "WEATHER     DRY", "LAPS     12", "START RACE"]) plate.appendChild(node("div", "as-preview-door", name)); }
    else if (previewPage === "hud") {
      plate.append(node("h3", "", s.hudProfile.toUpperCase() + " HUD"), node("div", "as-preview-door", "P3     LAP 4 / 12"), node("div", "as-preview-speed", "287 " + (s.speedUnits === "mph" ? "KM/H → 178 MPH" : "KM/H")));
      if (s.hudGapsVis !== "off" && s.hudProfile !== "minimal") plate.appendChild(node("p", "", "P2 NOR +1.2     P4 LEC −0.8"));
      if (s.hudMetricsLayout !== "compact") plate.appendChild(node("p", "", s.hudMetricsLayout === "timing" ? "S1 28.412     S2 31.090" : "TYRES 82%     ENERGY 64%"));
    } else { plate.append(node("h3", "", "RACE RESULTS")); for (const name of ["1   NORRIS", "2   VERSTAPPEN", "3   YOU · +8 POSITIONS"]) plate.appendChild(node("div", "as-preview-door", name)); plate.appendChild(node("p", "", "CONTINUE")); }
    body.appendChild(plate); body.dataset.screen = previewPage;
    const lookKey = ({ career: "lookCareer", race: "lookRace", popups: "lookPopups" })[previewPage], look = lookKey && s[lookKey];
    plate.style.borderRadius = look && look.corners === "sharp" ? "0" : look && look.corners === "pill" ? "var(--r-lg)" : "var(--r-md)";
    plate.style.textAlign = look && look.head === "centre" ? "center" : "left";
    plate.style.setProperty("--preview-density", look && look.density === "tight" ? ".7" : look && look.density === "roomy" ? "1.3" : "1");
    body.dataset.scene = s.homeScene; body.dataset.motion = effectiveSceneMotion();
    body.style.setProperty("--preview-panel-opacity", s.uiContrast === "high" ? 1 : (s.hudPanelOpacity || 100) / 100);
    body.style.setProperty("--preview-hud-accent", typeof getComputedStyle === "function" ? getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "var(--accent)" : "var(--accent)");
  }
  function render() {
    if (!ui) return; const s = snapshot();
    for (const c of ui.choices) for (const { id, b } of c.list) b.setAttribute("aria-pressed", String((s[c.key] == null && c.key === "motion" ? "on" : s[c.key]) === id));
    for (const c of ui.colours) { c.row.hidden = s[c.key] !== "custom"; c.input.value = s[c.hexKey]; }
    for (const r of ui.ranges) { const v = s[r.key] || (r.key === "uiScale" && typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? 109 : 100); r.input.value = v; r.out.textContent = v + "%"; }
    for (const { id, b } of ui.presets) b.setAttribute("aria-pressed", String(activePreset === id));
    for (const { id, b } of ui.pages) b.setAttribute("aria-pressed", String(previewPage === id));
    for (const { id, b } of ui.shapes) b.setAttribute("aria-pressed", String(previewShape === id));
    ui.previewWrap.dataset.shape = previewShape;
    ui.undo.disabled = !undoStack.length; ui.delete.disabled = !selectedProfile; ui.load.disabled = !selectedProfile;
    ui.scopeGlobal.setAttribute("aria-pressed", String(scope === "global")); ui.scopeScreen.setAttribute("aria-pressed", String(scope === "screen"));
    ui.scopeNote.textContent = scope === "global" ? "Presets and reset apply across menus, HUD and scene. Driving settings stay as they are." : "Presets and reset affect " + pageLabel() + " only. Global colours and other screens stay as they are.";
    const rows = profiles(); ui.profileSelect.replaceChildren(); const empty = node("option", "", "New profile"); empty.value = ""; ui.profileSelect.appendChild(empty);
    for (const row of rows) { const opt = node("option", "", row.name); opt.value = row.id; ui.profileSelect.appendChild(opt); }
    ui.profileSelect.value = selectedProfile;
    ui.sceneNote.textContent = s.backgroundMotion === "ambient" && effectiveSceneMotion() === "still" ? "Background motion is paused by reduced motion. Your ambient preference is saved." : "Background motion is separate from menu transitions. Auto camera and mixed environments vary between Home visits. Static and photo backgrounds remain still.";
    previewContent(s);
  }
  function initUI() {
    if (ui || typeof document === "undefined") return;
    const panel = document.getElementById("pm-panel-appearance"); if (!panel) return;
    Log.info("ui", "AppearanceStudio.initUI");
    ui = { choices: [], colours: [], ranges: [], presets: [], pages: [], shapes: [] };
    const studio = node("div", "as-studio"), controls = node("div", "as-controls"), previewSide = node("section", "as-preview-side");
    studio.id = "appearance-studio"; studio.append(controls, previewSide); panel.prepend(studio); panel.dataset.appearanceStudio = "on";
    const gallery = group(controls, "PREVIEW PRESET"), presets = node("div", "as-preset-list"); gallery.appendChild(presets);
    for (const p of PRESETS) { const b = button("", () => applyPreset(p.id)); b.dataset.preset = p.id; b.append(node("span", "as-preset-art"), node("strong", "", p.name)); b.title = p.note; presets.appendChild(b); ui.presets.push({ id: p.id, b }); }
    const profile = group(controls, "APPEARANCE PROFILE"), names = node("div", "as-profile-row"); ui.profileSelect = node("select"); ui.profileSelect.setAttribute("aria-label", "Saved appearance profiles"); ui.name = node("input"); ui.name.type = "text"; ui.name.maxLength = 40; ui.name.placeholder = "Name your appearance"; ui.name.setAttribute("aria-label", "Appearance profile name");
    ui.profileSelect.addEventListener("change", () => { selectedProfile = ui.profileSelect.value; const p = profiles().find((r) => r.id === selectedProfile); ui.name.value = p ? p.name : ""; render(); });
    ui.load = button("APPLY", () => loadProfile(selectedProfile)); const save = button("SAVE PROFILE", () => saveProfile(ui.name.value, selectedProfile)); const newProfile = button("SAVE AS NEW", () => saveProfile(ui.name.value)); ui.delete = button("DELETE", () => deleteProfile(selectedProfile)); names.append(ui.profileSelect, ui.name, ui.load, save, newProfile, ui.delete); profile.appendChild(names);
    const scopeRow = node("div", "as-profile-row"); ui.scopeGlobal = button("GLOBAL", () => { scope = "global"; render(); }); ui.scopeScreen = button("THIS SCREEN", () => { scope = "screen"; render(); }); ui.undo = button("UNDO", undo); scopeRow.append(ui.scopeGlobal, ui.scopeScreen, ui.undo, button("RESET SCOPE", () => reset())); profile.appendChild(scopeRow); ui.scopeNote = node("p", "as-note"); profile.appendChild(ui.scopeNote);
    const menu = group(controls, "MENU · GLOBAL"); choice(menu, "Theme", "uiTheme", [["dark", "Dark"], ["light", "Light"], ["system", "System"]]); colour(menu, "Accent colour", "menuAccent", "menuAccentHex"); choice(menu, "Text size", "textSize", [["normal", "Normal"], ["large", "Large"], ["larger", "Larger"]]); range(menu, "UI size", "uiScale", 40, 200); choice(menu, "Menu motion", "motion", [["reduce", "Reduced"], ["on", "Functional"]]); choice(menu, "High contrast", "uiContrast", [["off", "Off"], ["high", "On"]]);
    const hud = group(controls, "RACE HUD"); choice(hud, "Style", "hudProfile", [["minimal", "Minimal"], ["standard", "Standard"], ["broadcast", "Broadcast"]]); colour(hud, "Accent colour", "hudAccent", "hudAccentHex"); range(hud, "HUD size", "hudScale", 70, 200); choice(hud, "Layout", "hudMetricsLayout", [["auto", "Auto"], ["full", "Full"], ["timing", "Timing"], ["driver", "Driver"], ["compact", "Compact"]]); hud.appendChild(button("ALL HUD & DISPLAY OPTIONS", () => { if (hooks.openDisplay) hooks.openDisplay(); else say("Open Settings → Display for all HUD options."); }));
    const sceneBox = group(controls, "SCENE · HOME"); choice(sceneBox, "Scene", "homeScene", [["auto", "Mix environments"], ["garage", "Garage"], ["night", "Night garage"], ["studio", "Studio"], ["track", "Circuit"], ["pitlane", "Pit lane"], ["static", "Static"], ["photo", "My photo"]]); choice(sceneBox, "Home camera", "homeCamera", [["auto", "Auto"], ["hero", "Hero"], ["front", "Front"], ["side", "Side"], ["rear", "Rear"]]); choice(sceneBox, "Background motion", "backgroundMotion", [["still", "Off"], ["ambient", "On"]]); ui.sceneNote = node("p", "as-note"); sceneBox.append(ui.sceneNote, button("PHOTO STUDIO & MY BACKGROUND", () => { if (hooks.openPhoto) hooks.openPhoto(); else say("Photo Studio becomes available after the game finishes loading."); }));
    const tools = node("div", "as-preview-toolbar"), pages = node("div", "as-segment"); pages.setAttribute("role", "group"); pages.setAttribute("aria-label", "Preview screen");
    for (const [id, name] of [["home", "HOME"], ["career", "CAREER"], ["race", "RACE SETUP"], ["hud", "HUD"], ["popups", "POPUP"]]) { const b = button(name, () => { previewPage = id; render(); }); pages.appendChild(b); ui.pages.push({ id, b }); }
    const shapes = node("div", "as-segment"); shapes.setAttribute("role", "group"); shapes.setAttribute("aria-label", "Preview device"); for (const [id, name] of [["desktop", "Desktop"], ["phone", "Phone"]]) { const b = button(name, () => { previewShape = id; render(); }); shapes.appendChild(b); ui.shapes.push({ id, b }); }
    tools.append(pages, shapes); ui.previewWrap = node("div", "as-preview-wrap"); ui.preview = node("div", "as-preview"); ui.preview.setAttribute("aria-label", "Illustrative appearance preview"); ui.previewWrap.appendChild(ui.preview); previewSide.append(tools, ui.previewWrap, node("p", "as-note", "Representative preview. Use the advanced screen controls below for exact layout and the real-screen preview."));
    ui.status = node("p", "as-status"); ui.status.setAttribute("role", "status"); ui.status.setAttribute("aria-live", "polite"); controls.appendChild(ui.status);
    const advanced = node("details", "as-advanced"), sum = node("summary", "", "ADVANCED · GLOBAL & PER-SCREEN CUSTOMISATION"), body = node("div"); advanced.append(sum, body); panel.appendChild(advanced);
    for (const child of [...panel.children]) if (child !== studio && child !== advanced) body.appendChild(child);
    panel.addEventListener("input", (e) => { if (studio.contains(e.target)) return; clearTimeout(pending); pending = setTimeout(() => { remember(last); last = snapshot(); }, 350); });
    panel.addEventListener("click", (e) => { if (studio.contains(e.target)) return; queueMicrotask(() => { remember(last); last = snapshot(); }); });
    if (store.subscribe) store.subscribe((change) => { if (!muted && VISUAL_KEYS.includes(change.key)) { clearTimeout(pending); pending = setTimeout(() => { remember(last); last = snapshot(); render(); if (["homeScene", "homeCamera", "backgroundMotion", "motion"].includes(change.key)) sceneChanged(); }, 80); } });
    if (typeof MutationObserver !== "undefined") {
      const settings = document.getElementById("pmsettings");
      let openGen = 0;
      // Defer render + garage preview off the click stack: sceneChanged →
      // previewScene used to call stopHome/beginHome synchronously and freeze
      // the tab before the Appearance sheet could paint.
      const raf = typeof requestAnimationFrame === "function" ? requestAnimationFrame
        : (fn) => setTimeout(fn, 0);
      const visible = () => {
        if (panel.hidden) {
          openGen++;
          panel.removeAttribute("aria-busy");
          if (typeof ScreenLooks !== "undefined") ScreenLooks.endPeek();
          return;
        }
        if (!settings || settings.hidden) return;
        const gen = ++openGen;
        panel.setAttribute("aria-busy", "true");
        raf(() => raf(() => {
          if (gen !== openGen || panel.hidden || settings.hidden) return;
          try { render(); sceneChanged(true); }
          finally { if (gen === openGen) panel.removeAttribute("aria-busy"); }
        }));
      };
      const observer = new MutationObserver(visible); observer.observe(panel, { attributes: true, attributeFilter: ["hidden"] });
      if (settings) observer.observe(settings, { attributes: true, attributeFilter: ["hidden"] });
    }
    render();
  }
  // Same readyState rule as SettingsExport.mount: deferred scripts run at
  // "interactive", after DOMContentLoaded would already have missed a late listen.
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }
  return Object.freeze({ PROFILE_KEY, DEFAULTS, VISUAL_KEYS, SCREEN_KEYS, PRESETS, normalizeSnapshot, snapshot, scene, homeCamera, setHomeCamera, effectiveSceneMotion, setScene, onSceneChange,
    applySnapshot, applyPreset, undo, reset, profiles, normalizeProfiles, saveProfile, loadProfile, deleteProfile, attach, setPreviewFrame, notify: say, initUI });
})();
