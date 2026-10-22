/* Apex 26 — first-person finish preferences. Exterior liveries stay untouched. */
const CockpitFinishes = (function () {
  "use strict";
  const SURFACES = ["livery", "gloss", "matte", "satin", "carbon", "brushed", "chrome"];
  const CHOICES = {
    wheel: { key: "apex26.cockpitWheelFinish", values: ["carbon", "livery", "anodised", "suede", "stock"], label: "WHEEL FINISH" },
    body: { key: "apex26.cockpitBodyFinish", values: SURFACES, label: "BODY FINISH" },
    halo: { key: "apex26.cockpitHaloFinish", values: SURFACES, label: "HALO FINISH" },
  };
  const LABELS = { livery: "FOLLOW LIVERY", gloss: "GLOSS", matte: "MATTE", satin: "SATIN", carbon: "CARBON", brushed: "BRUSHED ALLOY", chrome: "CHROME", anodised: "ANODISED", suede: "SUEDE", stock: "STOCK" };
  const picked = {}, listeners = [];
  let revision = 0, cache = new WeakMap();
  function get(name) {
    const c = CHOICES[name];
    if (picked[name] === undefined) {
      const raw = GameStore.store.raw(c.key);
      picked[name] = c.values.includes(raw) ? raw : c.values[0];
    }
    return picked[name];
  }
  function set(name, value) {
    const c = CHOICES[name], next = c.values.includes(value) ? value : c.values[0];
    if (get(name) === next) return next;
    picked[name] = next;
    if (name === "wheel") GameStore.store.rawSet("apex26.cockpitWheelFinish", next);
    else if (name === "body") GameStore.store.rawSet("apex26.cockpitBodyFinish", next);
    else GameStore.store.rawSet("apex26.cockpitHaloFinish", next);
    if (name !== "wheel") revision++;
    cache = new WeakMap();
    for (const fn of listeners) fn(name, next);
    return next;
  }
  function onChange(fn) { listeners.push(fn); }
  function view(livery) {
    let v = cache.get(livery);
    if (v) return v;
    const mode = get("body"), haloMode = get("halo");
    let body = livery;
    if (mode !== "livery") {
      body = Object.assign({}, livery);
      for (const key of CarMaterials.FINISH_FIELDS) if (key !== "haloFinish" && key !== "rimFinish") body[key] = mode;
    }
    const finish = haloMode === "livery" ? CarMaterials.finishOf(livery, "haloFinish") || "gloss" : haloMode;
    const halo = { surface: CarMaterials.FINISH_SURFACE[finish] || CarMaterials.SURFACES.paint,
      color: CarMaterials.zoneColour(livery.halo) || livery.c1 };
    v = { livery: body, halo, wheel: get("wheel") };
    cache.set(livery, v);
    return v;
  }
  function stamp() { return revision; }
  function initUI() {
    const host = document.getElementById("pm-cockpit-body");
    if (!host || document.getElementById("pm-ckfinish-wheel")) return;
    const group = document.createElement("div");
    for (const name of Object.keys(CHOICES)) {
      const c = CHOICES[name], labels = Object.assign({}, LABELS, name === "wheel" ? {carbon:"CARBON + ALLOY"} : {});
      const row = SettingRow.build("pm-ckfinish-" + name, c.label, c.values.map(v => [v, labels[v]]));
      SettingRow.wire(row.row, { read: () => get(name), write: v => set(name, v) });
      group.appendChild(row.row);
      onChange(() => SettingRow.paint(row.row, get(name)));
    }
    const help = document.createElement("p"); help.className = "adv-help";
    help.textContent = "First-person views only. FOLLOW LIVERY uses your fitted paint and finish. BODY and HALO can override it separately. Wheel finishes preserve the gloves and screen. A hidden wheel or halo keeps its choice for when you turn it back on. Changes apply immediately and are saved.";
    group.appendChild(help);
    const preview = document.getElementById("ckpreview");
    host.insertBefore(group, preview && preview.parentNode === host ? preview : null);
  }
  if (typeof document !== "undefined") {
    if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", initUI, { once: true });
    else initUI();
  }
  return { CHOICES, get, set, onChange, view, stamp };
})();
Object.freeze(CockpitFinishes);
