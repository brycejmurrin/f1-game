/* Apex 26 — CockpitOpts: player-facing options for the first-person view. WHEEL, SEAT, INTERIOR and HALO dress the cockpit view (all inside the same F1 car); TURN CHASING is how far the cockpit aim leaves the nose for a point 30 m down the road (0..1). Its own file, like GameMetrics, so the SETTINGS controls inject without growing index.html. */
const CockpitOpts = (function () {
  "use strict";

const KEY = "apex26.cockpitHalo";
const KEY_TC = "apex26.cockpitTurnChase";         // legacy "1" / "0"
const KEY_LEAD = "apex26.cockpitTurnChaseLead";   // 0..1, the live value
// The shipped amount and the legacy ON amount differ: a stored
// "1" from the old switch keeps the 0.35 it meant, an untouched install gets 0.4.
const LEAD_DEFAULT = 0.4;
const LEGACY_ON_LEAD = 0.35;
const LEAD_MAX = 1;
// COCKPIT CHOICES: wheel, seat, interior and halo options, all inside the same
// F1 car; each stored raw under its own apex26.* key and read once (URL overrides
// for shots: ?ckwheel= ?ckseat= ?ckint= ?halo=).
//   WHEEL     the steering wheel (car-mesh.js getCockpitWheel). A wheel with no
//             screen cannot carry gear and speed, so the HUD shows them instead
//             (mode-switch.js keeps body.cockpit-cam off for it).
//   SEAT      where the driver sits: eye offsets from STANDARD, car-local metres
//             (fwd, up). The wheel mount moves with the seat, so the rim keeps its
//             distance from the eye (the cockpit near plane is 0.30 m).
//   INTERIOR  the trim car-mesh.js builds inside the tub (getCockpitCabin).
//   HALO      OFF / SLIM / STANDARD / THICK / FAIRED: the hoop's tube (car3d.js, halo size).
const CHOICES = {
  helmetEye: { key: "apex26.helmetEye", url: "helmeteye", values: ["standard", "tucked", "upright", "forward", "back", "high", "low"],
              labels: { standard: "STANDARD", tucked: "TUCKED", upright: "UPRIGHT", forward: "FORWARD", back: "BACK", high: "HIGH", low: "LOW" } },
  helmetMount: { key: "apex26.helmetMount", url: "helmetmount", values: ["center", "left", "right"],
                labels: { center: "CENTER", left: "LEFT EYE", right: "RIGHT EYE" } },
  helmetShake: { key: "apex26.helmetShake", url: "helmetshake", values: ["normal", "medium", "soft", "off"],
              labels: { normal: "NORMAL", medium: "MEDIUM", soft: "SOFT", off: "OFF" } },
  visorShape: { key: "apex26.helmetVisorShape", url: "visorshape", values: ["standard", "panoramic", "slit", "rounded", "square"],
              labels: { standard: "STANDARD", panoramic: "PANORAMIC", slit: "NARROW", rounded: "ROUNDED", square: "SQUARE" } },
  visor:    { key: "apex26.helmetVisor", url: "helmetvisor", values: ["off", "clear", "smoke"],
              labels: { off: "OFF", clear: "CLEAR", smoke: "TINTED" } },
  visorColor: { key: "apex26.helmetVisorColor", url: "visorcolor", def: "amber", values: ["neutral", "amber", "ice", "rose", "green", "violet", "copper"],
              labels: { neutral: "NEUTRAL", amber: "AMBER", ice: "ICE BLUE", rose: "ROSE", green: "RACING GREEN", violet: "VIOLET", copper: "COPPER" } },
  visorIntensity: { key: "apex26.helmetVisorIntensity", url: "visorintensity", def: "medium", values: ["trace", "light", "medium", "strong", "deep"],
              labels: { trace: "TRACE", light: "LIGHT", medium: "MEDIUM", strong: "STRONG", deep: "DEEP" } },
  visorRefraction: { key: "apex26.helmetVisorRefraction", url: "visorrefraction", values: ["off", "light", "medium", "strong"],
              labels: { off: "OFF", light: "LIGHT", medium: "MEDIUM", strong: "STRONG" } },
  visorReflections: { key: "apex26.helmetVisorReflections", url: "visorreflections", values: ["light", "off", "medium", "strong"],
              labels: { light: "LIGHT", off: "OFF", medium: "MEDIUM", strong: "STRONG" } },
  visorQuality: { key: "apex26.helmetVisorQuality", url: "visorquality", values: ["auto", "low", "high"],
              labels: { auto: "AUTO", low: "LOW", high: "HIGH" } },
  visorLightStyle: { key: "apex26.helmetVisorLightStyle", url: "visorlightstyle", values: ["classic", "compact", "scratches"],
              labels: { classic: "CLASSIC", compact: "COMPACT", scratches: "SHORT RAYS" } },
  visorRain: { key: "apex26.helmetVisorRain", url: "visorrain", values: ["normal", "off", "light", "heavy"],
              labels: { normal: "NORMAL", off: "OFF", light: "LIGHT", heavy: "HEAVY" } },
  visorRunoff: { key: "apex26.helmetVisorRunoff", url: "visorrunoff", values: ["normal", "slow", "fast"],
              labels: { normal: "NATURAL", slow: "SLOW", fast: "FAST" } },
  wheel:    { key: "apex26.cockpitWheel", url: "ckwheel", values: ["f1", "gt", "butterfly", "yoke", "endurance", "retro", "round", "none"],
              labels: { f1: "F1 2026", gt: "GT RIM", butterfly: "BUTTERFLY", yoke: "OPEN YOKE", endurance: "ENDURANCE", retro: "2000s", round: "CLASSIC", none: "NONE" } },
  body:     { key: "apex26.cockpitBody", url: "ckbody", values: ["standard", "sculpted", "wide", "tapered", "stepped"],
              labels: { standard: "STANDARD", sculpted: "SCULPTED", wide: "WIDE", tapered: "TAPERED", stepped: "STEPPED" } },
  seat:     { key: "apex26.cockpitSeat", url: "ckseat", def: "fwd", values: ["std", "low", "high", "fwd"],
              labels: { std: "STANDARD", low: "LOW", high: "HIGH", fwd: "FORWARD" } },
  interior: { key: "apex26.cockpitInterior", url: "ckint", values: ["carbon", "team", "suede", "ribbed", "classic"],
              labels: { carbon: "CARBON", team: "TEAM", suede: "SUEDE", ribbed: "RIBBED", classic: "CLASSIC" } },
};
const SHAKE_SCALE = { normal: 1, medium: 0.7, soft: 0.4, off: 0 };
const KEY_WHEEL = CHOICES.wheel.key, WHEELS = CHOICES.wheel.values;
const SCREEN_WHEELS = { f1: true, gt: true, butterfly: true, yoke: true, endurance: true, retro: true };
// STANDARD's eye is vantage.js COCKPIT_EYE_FWD / COCKPIT_EYE_UP; a seat moves it.
const EYE_F = -0.20, EYE_U = 0.82;
const SEATS = { std: [0, 0], low: [0, -0.06], high: [0, 0.08], fwd: [0.12, -0.02] };
// The wheel mount at STANDARD: hub (y, z) and scale, car-local, per wheel.
const MOUNTS = { f1: [0.70, 0.26, 0.80], gt: [0.70, 0.26, 0.80], butterfly: [0.70, 0.26, 0.80], yoke: [0.70, 0.26, 0.80], endurance: [0.70, 0.26, 0.80], retro: [0.70, 0.26, 0.80], round: [0.73, 0.28, 0.92], none: [0.70, 0.26, 0.80] };
// Halo, stored "0" / "slim" / "1" / "thick" ("1" and "0" are the old ON/OFF switch).
const HALO_VALUES = ["0", "slim", "1", "thick", "fairing"];
const HALO_LABELS = { "0": "OFF", slim: "SLIM", "1": "STANDARD", thick: "THICK", fairing: "FAIRED" };

let haloVal = null;
let lead = readLead();
const picked = {};
const listeners = [];

// VISOR BEAMS: a 0..2 factor (the slider shows 0–200 %) on the streaks the HELMET shield adds — each lamp's beam
// along its aim, a low sun's god rays, the star flares (js/fx/visor-optics.js). 1 is the shipped look; 0 keeps
// the glints alone. Stored as a percent string; the URL takes `visorbeams=<percent>` or a legacy level word.
const BEAMS_KEY = "apex26.helmetVisorBeams";
const BEAMS_DEFAULT = 1;
const BEAMS_MAX = 2;
const BEAMS_LEVELS = { off: 0, light: 0.6, medium: 1, strong: 1.6 };
let beams = null;
const DROP_SIZE_KEY = "apex26.helmetVisorDropSize";
let dropSize = null;
function clampDropSize(v) {
  return (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(+v) ? Math.max(0.5, Math.min(2, +v)) : 1;
}
function visorDropSize() {
  if (dropSize === null) { const v = GameStore.store.raw(DROP_SIZE_KEY); dropSize = clampDropSize((typeof v === "number" || (typeof v === "string" && v.trim() !== "")) ? Number(v) / 100 : null); }
  return dropSize;
}
function setVisorDropSize(v) {
  dropSize = clampDropSize(v);
  GameStore.store.rawSet(DROP_SIZE_KEY, String(Math.round(dropSize * 100)));
  for (const fn of listeners) fn("visorDropSize", dropSize);
  return dropSize;
}

function clampBeams(raw) {
  if (typeof raw === "string" && BEAMS_LEVELS[raw.toLowerCase()] != null) return BEAMS_LEVELS[raw.toLowerCase()];
  let n = +raw;
  if (!isFinite(n)) return BEAMS_DEFAULT;
  if (n > BEAMS_MAX) n = n / 100;                       // "160" is a percent; 1.6 is the factor
  return Math.max(0, Math.min(BEAMS_MAX, n));
}

function readBeams() {
  try {
    const q = /[?&]visorbeams=([^&]*)/i.exec(location.search);
    if (q && q[1] !== "") return clampBeams(decodeURIComponent(q[1]));
  } catch (_) { /* no location in a headless VM: the stored value stands */ }
  const stored = GameStore.store.raw(BEAMS_KEY);
  return stored == null || stored === "" ? BEAMS_DEFAULT : clampBeams(stored);
}

function visorBeams() {
  if (beams === null) beams = readBeams();
  return beams;
}

function setVisorBeams(v) {
  beams = clampBeams(v);
  GameStore.store.rawSet(BEAMS_KEY, String(Math.round(beams * 100)));
  paintVisor();
  for (const fn of listeners) fn("visorBeams", beams);
  return beams;
}

function clampLead(raw) {
  let n = +raw;
  if (!isFinite(n)) return LEAD_DEFAULT;
  if (n > LEAD_MAX) n = n / 100;
  return Math.max(0, Math.min(LEAD_MAX, n));
}

function parseLead(raw, urlVal) {
  if (urlVal != null && urlVal !== "") {
    if (/^(on|true)$/i.test(urlVal)) return LEGACY_ON_LEAD;
    if (/^(off|false)$/i.test(urlVal)) return 0;
    // Bare "1" on the URL is the old ON flag, not 100 %. Use 100 or 0.8 for an amount.
    if (urlVal === "1") return LEGACY_ON_LEAD;
    if (urlVal === "0") return 0;
    return clampLead(urlVal);
  }
  if (raw == null || raw === "") return null;
  return clampLead(raw);
}

function urlTurnChase() {
  try {
    const q = /[?&]turnchase=([^&]*)/i.exec(location.search);
    return q ? decodeURIComponent(q[1]) : null;
  } catch (_) { return null; /* no location, or a malformed escape */ }
}

function readLead() {
  const store = GameStore.store;
  let stored = parseLead(store.raw(KEY_LEAD), null);
  if (stored === null) {
    const legacy = store.raw(KEY_TC);
    if (legacy === "0" || legacy === "1") {
      stored = legacy === "1" ? LEGACY_ON_LEAD : 0;
      store.rawSet(KEY_LEAD, String(stored));
    }
  }
  // The shot's URL overrides the view, never the preference a backup records.
  return parseLead(null, urlTurnChase()) ?? stored ?? LEAD_DEFAULT;
}

function haloSetting() {
  if (haloVal === null) {
    let v = GameStore.store.raw(KEY);
    try {
      const q = /[?&]halo=([a-z0-9]+)/i.exec(location.search);
      if (q) v = /^(1|on|true)$/i.test(q[1]) ? "1" : /^(0|off|false)$/i.test(q[1]) ? "0" : q[1].toLowerCase();
    } catch (_) { /* no location in a headless VM: the stored value stands */ }
    haloVal = HALO_VALUES.includes(v) ? v : "1";
  }
  return haloVal;
}

// 0 OFF, 1 SLIM, 2 STANDARD, 3 THICK, 4 FAIRED.
function haloSize() { return HALO_VALUES.indexOf(haloSetting()); }

function halo() { return haloSize() > 0; }

// A boolean (the old switch) or a stored value.
function setHalo(v) {
  haloVal = v === true ? "1" : v === false ? "0" : HALO_VALUES.includes(v) ? v : "1";
  GameStore.store.rawSet(KEY, haloVal);
  for (const fn of listeners) fn("halo", haloVal);
  return halo();
}

function choice(name) {
  if (picked[name] === undefined) {
    const C = CHOICES[name];
    let v = GameStore.store.raw(C.key);
    try {
      const q = new RegExp("[?&]" + C.url + "=([a-z0-9]+)", "i").exec(location.search);
      if (q) v = q[1].toLowerCase();
    } catch (_) { /* no location in a headless VM: the stored value stands */ }
    picked[name] = C.values.includes(v) ? v : (C.def || C.values[0]);
  }
  return picked[name];
}

function setChoice(name, v) {
  const C = CHOICES[name];
  picked[name] = C.values.includes(v) ? v : (C.def || C.values[0]);
  GameStore.store.rawSet(C.key, picked[name]);
  if (name.startsWith("visor")) paintVisor();
  for (const fn of listeners) fn(name, picked[name]);
  return picked[name];
}

function wheel() { return choice("wheel"); }
function setWheel(v) { return setChoice("wheel", v); }
function body() { return choice("body"); }
function setBody(v) { return setChoice("body", v); }
function seat() { return choice("seat"); }
function setSeat(v) { return setChoice("seat", v); }
function interior() { return choice("interior"); }
function setInterior(v) { return setChoice("interior", v); }
function visor() { return choice("visor"); }
function setVisor(v) { return setChoice("visor", v); }
function visorShape() { return choice("visorShape"); }
function setVisorShape(v) { return setChoice("visorShape", v); }
function helmetMount() { return choice("helmetMount"); }
function helmetEye() { return choice("helmetEye"); }
function setHelmetEye(v) { return setChoice("helmetEye", v); }
function helmetShake() { return choice("helmetShake"); }
function setHelmetShake(v) {
  motionCache.helmetShake = SHAKE_SCALE[v] ?? 1;
  return setChoice("helmetShake", v);
}

// Percentages are cached as factors for the camera. Legacy shake preset names still load from saves and shot URLs.
const motionCache = Object.create(null);
function motionAmount(key) {
  if (motionCache[key] === undefined) {
    let raw = GameStore.store.raw("apex26." + key);
    if (key === "helmetShake" && typeof location !== "undefined") {
      const query = /[?&]helmetshake=([a-z0-9]+)/i.exec(location.search);
      if (query) raw = query[1].toLowerCase();
    }
    const preset = key === "helmetShake" && Object.hasOwn(SHAKE_SCALE, raw) ? SHAKE_SCALE[raw] : null;
    motionCache[key] = preset ?? (typeof raw === "string" && /^\d{1,3}$/.test(raw) ? Math.min(+raw, key === "helmetShake" ? 150 : 100) / 100 : 1);
  }
  return motionCache[key];
}
function setMotionAmount(key, value) {
  const pct = Math.round(Math.max(0, Math.min(key === "helmetShake" ? 150 : 100, value * 100)));
  if (!Number.isFinite(pct)) return;
  motionCache[key] = pct / 100;
  GameStore.store.rawSet("apex26." + key, String(pct));
}
function shakeScale(mode, source) {
  if (mode !== "helmet") return 1;
  return motionAmount("helmetShake") * (source ? motionAmount(source) : 1);
}
function visorColor() { return choice("visorColor"); }
function setVisorColor(v) { return setChoice("visorColor", v); }
function visorIntensity() { return choice("visorIntensity"); }
function setVisorIntensity(v) { return setChoice("visorIntensity", v); }
function visorRefraction() { return choice("visorRefraction"); }
function setVisorRefraction(v) { return setChoice("visorRefraction", v); }
function visorReflections() { return choice("visorReflections"); }
function setVisorReflections(v) { return setChoice("visorReflections", v); }
function visorQuality() { return choice("visorQuality"); }
function setVisorQuality(v) { return setChoice("visorQuality", v); }
function visorLightStyle() { return choice("visorLightStyle"); }
function setVisorLightStyle(v) { return setChoice("visorLightStyle", v); }
function visorRain() { return choice("visorRain"); }
function setVisorRain(v) { return setChoice("visorRain", v); }
function visorRunoff() { return choice("visorRunoff"); }
function setVisorRunoff(v) { return setChoice("visorRunoff", v); }
function paintVisor() {
  if (typeof document === "undefined" || !document.body) return;
  document.body.setAttribute("data-helmet-visor", visor());
  document.body.setAttribute("data-helmet-visor-color", visorColor());
  document.body.setAttribute("data-helmet-visor-intensity", visorIntensity());
  document.body.setAttribute("data-helmet-visor-refraction", visorRefraction());
  document.body.setAttribute("data-helmet-visor-reflections", visorReflections());
  document.body.setAttribute("data-helmet-visor-light-style", visorLightStyle());
  document.body.setAttribute("data-helmet-visor-quality", visorQuality());
  document.body.setAttribute("data-helmet-visor-beams", String(Math.round(visorBeams() * 100)));
  document.body.setAttribute("data-helmet-visor-rain", visorRain());
  document.body.setAttribute("data-helmet-visor-runoff", visorRunoff());
}

// Does this wheel (default: the chosen one) carry the gear/speed LCD?
function wheelHasScreen(style) { return !!SCREEN_WHEELS[style || wheel()]; }

// The eye and the wheel mount for a wheel and a seat (default: the chosen ones).
// Frozen and cached per pair: vantage() and the rig draw read it every frame.
const _layouts = {};   // wheel -> seat -> layout: two lookups, no key string per frame
function layout(w, s) {
  const wk = MOUNTS[w] ? w : wheel(), sk = SEATS[s] ? s : seat();
  const byW = _layouts[wk] || (_layouts[wk] = {});
  if (!byW[sk]) {
    const st = SEATS[sk], m = MOUNTS[wk];
    byW[sk] = Object.freeze({ eyeF: EYE_F + st[0], eyeU: EYE_U + st[1], wheelY: m[0] + st[1], wheelZ: m[1] + st[0], wheelS: m[2] });
  }
  return byW[sk];
}

// A cockpit-view consumer that must follow a change made mid-race.
function onWheel(fn) { listeners.push(fn); }

function turnChaseLead() {
  return lead;
}

function setTurnChaseLead(v) {
  lead = clampLead(v);
  GameStore.store.rawSet(KEY_LEAD, String(Math.round(lead * 100) / 100));
  return lead;
}

function turnChase() { return turnChaseLead() > 0; }

function setTurnChase(on) {
  return setTurnChaseLead(on ? LEAD_DEFAULT : 0);
}

// Presets apply only when explicitly selected; custom combinations remain saved.
const PRESETS = {
  modern: { body:"sculpted",interior:"carbon",wheel:"f1",seat:"std",halo:"fairing" },
  historic: { body:"tapered",interior:"classic",wheel:"round",seat:"std",halo:"0" },
};
function preset() {
  for(const [id,p] of Object.entries(PRESETS)) if(Object.entries(p).every(([k,v])=>k==='halo'?haloSetting()===v:choice(k)===v))return id;
  return "custom";
}
function setPreset(id) {
  const p=PRESETS[id];if(!p)return preset();
  for(const [k,v] of Object.entries(p))if(k==='halo')setHalo(v);else setChoice(k,v);
  return preset();
}

function initUI() {
  Log.info("game", "CockpitOpts.initUI");
  if (typeof document === "undefined") return;
  paintVisor();
  const panel = document.getElementById("pm-panel-display");
  const host = panel || (document.getElementById("pm-res") && document.getElementById("pm-res").parentNode);
  if (!host || document.getElementById("pm-halo")) return;

  // A FOLD like METRICS / RENDERER / ADVANCED VISUALS beside it: five rows of
  // cockpit dressing are a page of their own, and a player who never drives
  // from the cockpit should not have to scroll past them. The closed summary
  // carries the wheel, so the fold reads without opening.
  const fold = document.createElement("details");
  fold.id = "pm-cockpit";
  fold.className = "pm-renderer-sub";
  const sum = document.createElement("summary");
  sum.className = "adv-more-btn";
  sum.id = "pm-cockpit-sum";
  const paintSum = () => { sum.textContent = "COCKPIT · " + (CHOICES.wheel.labels[wheel()] || wheel()); };
  paintSum();
  onWheel(paintSum);
  const content = document.createElement("div");
  content.id = "pm-cockpit-body";
  content.setAttribute("role", "group");
  content.setAttribute("aria-label", "Cockpit");
  fold.appendChild(sum);
  fold.appendChild(content);
  // Just above ADVANCED VISUALS, the one fold here that is static shell DOM —
  // RENDERER is rebuilt at runtime (js/perf/renderer-picker.js), so "after
  // RENDERER" landed wherever the two inits happened to finish.
  const tools = document.getElementById("pm-visual-tuners");
  if (tools && tools.parentNode === host && typeof host.insertBefore === "function") host.insertBefore(fold, tools);
  else host.appendChild(fold);
  let section = content;
  const place = (el) => section.appendChild(el);
  function subgroup(parent, visible) {
    const group = document.createElement("div");
    parent.appendChild(group);
    const refresh = () => { group.hidden = !visible(); };
    refresh();
    onWheel(refresh);
    return group;
  }
  // The row titles are hover-only, which a phone never shows: each row also
  // gets the same sentence as a visible help line under it.
  const help = (text) => {
    const p = document.createElement("p");
    p.className = "adv-help";
    p.textContent = text;
    place(p);
  };

  function row(id, label, values, labels, title, read, write) {
    const r = SettingRow.build(id, label, values.map((v) => [v, labels[v]]));
    r.row.title = title;
    SettingRow.wire(r.row, { read, write: (v) => {
      write(v);
      try { if (typeof GameAudio !== "undefined" && GameAudio.uiSelect) GameAudio.uiSelect(); }
      catch (_) { /* audio is optional here */ }
    } });
    place(r.row);
    onWheel(() => SettingRow.paint(r.row, read()));
    help(title);   // the visible help line under the row (a phone never shows a title)
  }
  row("pm-ckpreset", "PRESET", ["custom","modern","historic"], {custom:"CUSTOM",modern:"MODERN F1",historic:"HISTORIC"},
    "Apply a coordinated cockpit, or mix individual options below. HISTORIC uses leather, gauges, a round wheel and no halo.", preset, setPreset);
  const C = CHOICES;
  row("pm-helmet-visor", "HELMET VISOR", C.visor.values, C.visor.labels,
    "Optional see-through shield in HELMET camera only. CLEAR adds a curved rim and faint reflections; TINTED adds your chosen lens color and intensity. OFF removes the visor and its frame: a plain, unframed helmet view.", visor, setVisor);
  row("pm-helmeteye", "HELMET EYE POSITION", C.helmetEye.values, C.helmetEye.labels,
    "Tucked moves your eyes down and forward. Upright moves them up and back. Forward keeps your usual eye height. Fine-tune the field of view in Camera Tuner.", helmetEye, setHelmetEye);
  row("pm-helmetmount", "CAMERA MOUNT", C.helmetMount.values, C.helmetMount.labels,
    "Center the helmet camera or mount it over either eye. Works with every eye position.", helmetMount, v => setChoice("helmetMount", v));
  function motionSlider(key, label, helpText, max = 100) {
    slider("pm-" + key.toLowerCase(), label.toUpperCase(), label, helpText,
      max, 1, () => motionAmount(key), value => setMotionAmount(key, value));
  }
  motionSlider("helmetShake", "Vibration", "Overall strength of impacts, kerb ribs and speed vibration. 100% is standard.", 150);
  motionSlider("helmetHeadMotion", "Head lean & nod", "How far your head leans in corners and nods under braking, even at zero vibration.");
  const fine = document.createElement("details");
  fine.id = "pm-helmet-vibration-details";
  const fineLabel = document.createElement("summary");
  fineLabel.textContent = "Fine-tune vibration";
  fineLabel.className = "adv-more-btn";
  fine.appendChild(fineLabel);
  place(fine);
  section = fine;
  motionSlider("helmetImpact", "Contact & sustained rumble", "Jolts from contact and the sustained rumble on a kerb.");
  motionSlider("helmetKerb", "Kerb rib vibration", "Vertical vibration as each kerb rib passes under the car.");
  motionSlider("helmetBuzz", "Speed vibration", "Continuous vibration as speed builds on dry tarmac.");
  const optics = subgroup(content, () => visor() !== "off");
  section = optics;
  row("pm-visor-quality", "VISOR EFFECTS QUALITY", C.visorQuality.values, C.visorQuality.labels,
    "AUTO adapts visor effects to the available performance. LOW reduces effect detail. HIGH requests full detail; graphics and performance limits still apply. Your style and strength settings are kept.", visorQuality, setVisorQuality);
  row("pm-visorshape", "VISOR OPENING", C.visorShape.values, C.visorShape.labels,
    "Choose how much of the road is visible through a clear or tinted visor.", visorShape, setVisorShape);
  section = subgroup(optics, () => visor() === "smoke");
  row("pm-visor-color", "TINT COLOR", C.visorColor.values, C.visorColor.labels,
    "Choose the lens color for a tinted visor.", visorColor, setVisorColor);
  row("pm-visor-intensity", "TINT INTENSITY", C.visorIntensity.values, C.visorIntensity.labels,
    "Choose how much lens color covers the road, from a trace to a deep tint.", visorIntensity, setVisorIntensity);
  section = optics;
  row("pm-visor-refraction", "VISOR REFRACTION", C.visorRefraction.values, C.visorRefraction.labels,
    "Distortion through the shield in HELMET camera with CLEAR or TINTED visor. OFF keeps the road undistorted.", visorRefraction, setVisorRefraction);
  row("pm-visor-reflections", "VISOR REFLECTIONS", C.visorReflections.values, C.visorReflections.labels,
    "Shield reflections in HELMET camera with CLEAR or TINTED visor. LIGHT is subtle; OFF removes the highlights.", visorReflections, setVisorReflections);
  // A percent slider (the TURN CHASING pattern): label, live value, then the range; the help line under it.
  function slider(id, label, aria, title, max, step, read, write, min = 0) {
    const lab = document.createElement("label");
    lab.className = "tune-row";
    lab.title = title;
    const span = document.createElement("span");
    span.className = "tune-label";
    span.appendChild(document.createTextNode(label + " "));
    const out = document.createElement("b");
    out.id = id + "-v";
    span.appendChild(out);
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.id = id;
    inp.setAttribute("aria-label", aria);
    const paint = () => { const pct = Math.round(read() * 100); inp.value = String(pct); inp.setAttribute("aria-valuetext", `${pct}%`); out.textContent = `${pct}%`; };
    inp.oninput = () => { write(parseFloat(inp.value) / 100); paint(); };
    lab.appendChild(span);
    lab.appendChild(inp);
    place(lab);
    help(title);
    paint();
    onWheel(paint);
  }
  const lightControls = subgroup(optics, () => visorReflections() !== "off");
  section = lightControls;
  row("pm-visor-light-style", "VISOR LIGHT STYLE", C.visorLightStyle.values, C.visorLightStyle.labels,
    "CLASSIC keeps the original light effects. COMPACT uses smaller highlights without rays. SHORT RAYS combines compact highlights with short diffraction rays. Your beam strength is kept when you change styles.", visorLightStyle, setVisorLightStyle);
  section = subgroup(lightControls, () => visorLightStyle() !== "compact");
  slider("pm-visor-beams", "VISOR BEAMS", "Visor beams",
    "Strength of rays and streaks on the HELMET visor. 100% is the standard amount for your light style; higher values make them brighter and longer. 0% keeps only the highlights. Needs VISOR REFLECTIONS on; COMPACT has no rays.",
    200, 10, visorBeams, setVisorBeams);
  section = optics;
  row("pm-visor-rain", "VISOR RAIN", C.visorRain.values, C.visorRain.labels,
    "Water accumulating on the shield in HELMET camera with CLEAR or TINTED visor. Actual rain controls new drops; OFF clears the water. LOW graphics disables droplets.", visorRain, setVisorRain);
  section = subgroup(optics, () => visorRain() !== "off");
  slider("pm-visor-drop-size", "DROPLET SIZE", "Visor droplet size",
    "Size of collected rain on the HELMET visor. 50% is small, 100% is standard and 200% is large. Updates existing drops while paused. Requires CLEAR or TINTED visor with VISOR RAIN on.",
    200, 1, visorDropSize, setVisorDropSize, 50);
  row("pm-visor-runoff", "WATER RUNOFF", C.visorRunoff.values, C.visorRunoff.labels,
    "How quickly visor water slides away. Airflow moves drops at speed; stopped drops sag downward. REDUCED MOTION keeps drops still.", visorRunoff, setVisorRunoff);
  section = content;
  row("pm-ckwheel", "WHEEL", C.wheel.values, C.wheel.labels,
    "The steering wheel. CLASSIC and NONE have no screen, so the HUD shows gear and speed.", wheel, setWheel);
  row("pm-ckbody", "BODY", C.body.values, C.body.labels,
    "Cockpit body shape: standard, sculpted, wide, tapered or stepped shoulders.", body, setBody);
  row("pm-ckseat", "SEAT", C.seat.values, C.seat.labels,
    "Where you sit in the car. The wheel moves with the seat.", seat, setSeat);
  row("pm-halo", "HALO", HALO_VALUES, HALO_LABELS,
    "The halo over the cockpit. FAIRED adds a broad carbon roof and curved centre junction.", haloSetting, setHalo);
  row("pm-ckint", "INTERIOR", C.interior.values, C.interior.labels,
    "The cockpit trim: carbon, team padding, suede, ribbed pads, or a 1960s cockpit with an aeroscreen and round gauges.", interior, setInterior);

  slider("pm-turnchase", "TURN CHASING", "Turn chasing",
    "How far the cockpit view glances into the corner ahead. 0% stays locked to the car's nose; 100% aims 30 m down the road.",
    100, 5, turnChaseLead, setTurnChaseLead);
  if (typeof CockpitPreview !== "undefined") CockpitPreview.mount(content);
}

if (typeof document !== "undefined") {
  // #4798 gate (paintVisor stays at DCL)
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => {
    paintVisor();
    if (typeof SettingsNav !== "undefined" && SettingsNav.lazy) SettingsNav.lazy(initUI); else initUI();
  }, { once: true });
  else initUI();
}

return {
  KEY, KEY_TC, KEY_LEAD, KEY_WHEEL, LEAD_DEFAULT, BEAMS_KEY, BEAMS_DEFAULT, BEAMS_MAX, WHEELS, CHOICES, HALO_VALUES,
  PRESETS, preset, setPreset, halo, haloSize, setHalo, wheel, setWheel, body, setBody, seat, setSeat, interior, setInterior, visor, setVisor, visorColor, setVisorColor, visorIntensity, setVisorIntensity,
  visorQuality, setVisorQuality, visorRefraction, setVisorRefraction, visorReflections, setVisorReflections, visorLightStyle, setVisorLightStyle, visorBeams, setVisorBeams, visorRain, setVisorRain, visorDropSize, setVisorDropSize, visorRunoff, setVisorRunoff,
  helmetMount, helmetEye, setHelmetEye, helmetShake, setHelmetShake, visorShape, setVisorShape,
  shakeScale, helmetHeadMotion: () => motionAmount("helmetHeadMotion"),
  wheelHasScreen, onWheel, layout, turnChase, setTurnChase, turnChaseLead, setTurnChaseLead, parseLead,
};
})();
Object.freeze(CockpitOpts);
