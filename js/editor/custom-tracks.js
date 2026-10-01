/* Apex 26 — CustomTracks: the registry of the player's OWN circuits. A design
   saved by the track designer (the TrackDesigner screen, LAZY_EDITOR) is a small
   record under apex26.customTracks — a closed control-point loop on a 0.25 m
   lattice plus a theme id and a few zone lists. sync() turns every stored
   record into a Tracks.LIST entry through the same factory the 52 shipped
   circuits use (TrackDef.fromRaw), appended AFTER them with `custom: true`, so
   the picker, race settings, time trial boards and the AI see an ordinary
   circuit while SEASON, career, the online lobby and the roster-count pins see
   none of them. Runs sync() at EVAL — this file loads after tracks.js and
   before game.js, whose `trackIdx = storedTrackIndex()` resolves a stored
   custom id on the very first read. Mirrors js/career/custom-team.js, which
   splices MY TEAM into Teams.LIST the same way.
   Needs GameStore, Tracks, TrackDef, TrackThemes, Hash32 at eval (HARD_EDGES). */
const CustomTracks = (function () {
  "use strict";
  const store = GameStore.store;
  const KEY = "customTracks", DRAFT_KEY = "customTrackDraft", V = 1;
  // A STORED DESIGN IS PLAYER INPUT (and, via a share code, someone else's):
  // every field is rebuilt to these limits on load, never trusted off disk.
  const LIMITS = Object.freeze({
    items: 24, name: 24, ptsMin: 8, ptsMax: 200, coord: 10000,
    hwMin: 5, hwMax: 8, zones: 24, halfM: 2000, rise: 60, angleDeg: 30,
  });
  const q = (v) => Math.round(v * 4) / 4;   // the 0.25 m lattice (storage AND share codes: same id both ends)
  const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
  const frac = (v) => (Number.isFinite(v) ? v - Math.floor(v) : null);   // exact for in-range input (`(v % 1 + 1) % 1` adds float noise)

  function sanitizeName(s) {
    let t = String(s == null ? "" : s);
    try { t = t.normalize("NFC"); } catch (_) { /* no ICU */ }
    t = t.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, LIMITS.name);
    return t || "MY CIRCUIT";
  }

  function sanitizePts(pts) {
    if (!Array.isArray(pts) || pts.length < LIMITS.ptsMin || pts.length > LIMITS.ptsMax) return null;
    const out = [];
    for (const p of pts) {
      if (!Array.isArray(p) || p.length < 2) return null;
      const x = +p[0], z = +p[1];
      if (!Number.isFinite(x) || !Number.isFinite(z) || Math.abs(x) > LIMITS.coord || Math.abs(z) > LIMITS.coord) return null;
      out.push([q(x), q(z)]);
    }
    return out;
  }

  function sanitizeZones(list, shape) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const z of list.slice(0, LIMITS.zones)) {
      if (!z || typeof z !== "object") continue;
      const row = shape(z);
      if (row) out.push(row);
    }
    return out.length ? out : null;
  }
  // A cosine bump's steepest grade is π·rise / (2·halfM): hold it under 8 %
  // (halfM ≥ 19.6·|rise|) by shrinking the rise, so a stored spike cannot
  // build a wall the car launches off (the engine itself caps nothing here).
  const BUMP = (z) => {
    const s = frac(z.s), halfM = num(z.halfM, 20, LIMITS.halfM, null);
    let rise = num(z.rise, -LIMITS.rise, LIMITS.rise, null);
    if (s == null || halfM == null || rise == null) return null;
    const cap = halfM / 19.6;
    if (Math.abs(rise) > cap) rise = Math.sign(rise) * Math.round(cap * 100) / 100;
    return { s, halfM, rise };
  };
  const HWZ = (z) => {
    const s0 = frac(z.s0), s1 = frac(z.s1), hw = num(z.hw, 3, LIMITS.hwMax, null);
    if (s0 == null || s1 == null || hw == null) return null;
    const row = { s0, s1, hw };
    if (Number.isFinite(z.ease)) row.ease = num(z.ease, 0, 0.2, 0.025);
    return row;
  };
  const BANK = (z) => {
    const f = frac(z.frac), angleDeg = num(z.angleDeg, -LIMITS.angleDeg, LIMITS.angleDeg, null), widthM = num(z.widthM, 20, 600, null);
    return f == null || angleDeg == null || widthM == null ? null : { frac: f, angleDeg, widthM };
  };

  /** The content id: everything that shapes the built circuit, nothing that
   *  only labels it. The theme is in it on purpose — game.js skips a rebuild
   *  when builtTrackId matches, and a theme change must rebuild. */
  function canonical(it) {
    return [it.theme, it.baseHW, it.seed, it.pts.map((p) => p[0] + "," + p[1]).join(";"),
      JSON.stringify([it.hwZones, it.bankZones, it.elevations, it.bridges])].join("|");
  }
  function idOf(it) { return "custom-" + ("00000000" + Hash32.fnv1a(canonical(it)).toString(16)).slice(-8); }

  /** Repair rather than discard where the geometry is sound; null when it is not. */
  function sanitize(raw) {
    if (!raw || typeof raw !== "object") return null;
    const pts = sanitizePts(raw.pts);
    if (!pts) return null;
    const it = {
      name: sanitizeName(raw.name),
      seed: Number.isFinite(raw.seed) ? (Math.floor(raw.seed) >>> 0) : 1,
      theme: TrackThemes.has(raw.theme) ? raw.theme : TrackThemes.ORDER[0],
      baseHW: Math.round(num(raw.baseHW, LIMITS.hwMin, LIMITS.hwMax, 7) * 10) / 10,
      pts,
      hwZones: sanitizeZones(raw.hwZones, HWZ),
      bankZones: sanitizeZones(raw.bankZones, BANK),
      elevations: sanitizeZones(raw.elevations, BUMP),
      bridges: sanitizeZones(raw.bridges, BUMP),
      turns: Array.isArray(raw.turns) ? raw.turns.map(frac).filter((v) => v != null).slice(0, 40) : [],
      lengthM: num(raw.lengthM, 0, 50000, 0),
      created: num(raw.created, 0, 8.64e15, Date.now()),
      updated: num(raw.updated, 0, 8.64e15, Date.now()),
    };
    if (!it.lengthM) { let L = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } it.lengthM = Math.round(L); }
    it.id = idOf(it);
    return it;
  }

  function load() {
    const v = store.get(KEY, null);
    const items = [];
    const seen = new Set();
    if (v && typeof v === "object" && Array.isArray(v.items)) {
      let dropped = 0;
      for (const raw of v.items.slice(0, LIMITS.items)) {
        const it = sanitize(raw);
        if (!it) { dropped++; continue; }
        // Two records with one content id: the newer edit wins.
        if (seen.has(it.id)) { const i = items.findIndex((x) => x.id === it.id); if (items[i].updated < it.updated) items[i] = it; continue; }
        seen.add(it.id); items.push(it);
      }
      if (dropped) Log.warn("track", "customTracks: dropped " + dropped + " unreadable design(s)");
    }
    return { v: V, items };
  }
  function write(items) { return store.write(KEY, { v: V, items }); }

  /** Design record → the raw def shape js/circuits/<id>.js authors, ready for TrackDef.fromRaw. */
  function toRaw(it) {
    const theme = TrackThemes.defFields(it.theme);
    const N = it.pts.length;
    const raw = Object.assign({
      id: it.id, custom: true, name: it.name, gp: it.name + " GP", country: "",
      lengthKm: Math.round(it.lengthM / 100) / 10 || 0.1, classic: false,
      sceneryCoordinates: "racing", startFrac: 0, undulate: true,
      baseHW: it.baseHW,
      path: { len: it.lengthM, pts: it.pts.map((p) => [p[0], p[1]]) },
      turns: it.turns && it.turns.length ? it.turns.slice() : null, sectors: null,
      bankZones: it.bankZones, elevations: it.elevations, bridges: it.bridges,
    }, theme);
    // applyHwZones keys its windows on the CONTROL INDEX fraction (i / N), the
    // designer authors arc fractions; with ~uniform control spacing the two
    // agree to within one point, and the engine's eased shoulders hide the rest.
    if (it.hwZones) raw.hwZones = it.hwZones.map((z) => Object.assign({}, z, { s0: Math.round(z.s0 * N) / N, s1: Math.round(z.s1 * N) / N }));
    raw.scenery = TrackThemes.sceneryFor(it);
    return raw;
  }

  const isCustom = (def) => !!(def && def.custom);

  /** Rebuild the custom tail of Tracks.LIST from storage. Never mid-race: the
   *  race holds its def by reference and an index shift would re-point trackIdx. */
  function sync() {
    if (typeof UiLayers !== "undefined" && UiLayers.inRace && UiLayers.inRace()) return -1;
    for (let i = Tracks.LIST.length - 1; i >= 0; i--) if (Tracks.LIST[i].custom) Tracks.LIST.splice(i, 1);
    const items = load().items;
    for (const it of items) Tracks.LIST.push(TrackDef.fromRaw(toRaw(it)));
    return items.length;
  }

  function list() { return load().items; }
  function get(id) { return load().items.find((x) => x.id === id) || null; }

  /** Save (new id = new entry; same content id = refresh the label). */
  function upsert(design) {
    const it = sanitize(design);
    if (!it) return { ok: false, reason: "geometry" };
    const items = load().items;
    const i = items.findIndex((x) => x.id === it.id);
    if (i >= 0) { it.created = items[i].created; items[i] = it; }
    else { if (items.length >= LIMITS.items) return { ok: false, reason: "full", limit: LIMITS.items }; items.push(it); }
    it.updated = Date.now();
    const r = write(items);
    sync();
    return { ok: true, id: it.id, durable: !!(r && r.durable), reason: r && r.reason };
  }

  function remove(id) {
    const items = load().items.filter((x) => x.id !== id);
    const r = write(items);
    // Its time-trial board goes with it (GameStore.ttBoard key shape).
    try { store.rawDel("ttlb." + id); } catch (_) { /* never had one */ }
    sync();
    return { ok: true, durable: !!(r && r.durable) };
  }

  /** Make a custom circuit the current selection (what the picker click does). */
  function select(id) {
    const idx = Tracks.LIST.findIndex((t) => t.id === id);
    if (idx < 0) return -1;
    store.set("trackId", id); store.set("track", idx);
    return idx;
  }

  function draft() { return store.get(DRAFT_KEY, null); }
  function setDraft(d) { if (d == null) store.rawDel(DRAFT_KEY); else store.set(DRAFT_KEY, d); }

  /** game.js hands the façade + the lazy loader; the designer screen (PR4) and
   *  the #track= share link (PR5) hang off this. Idempotent, DOM-optional. */
  let _editorLoad = null, _G = null, _hooks = null;
  function ensureEditor() {
    if (_editorLoad) return _editorLoad;
    const files = typeof ApexRoster !== "undefined" && ApexRoster.LAZY_EDITOR, edges = (typeof ApexRoster !== "undefined" && ApexRoster.LAZY_EDITOR_EDGES) || [];
    if (!files || !_hooks || typeof _hooks.load !== "function") { Log.warn("track", "track designer bundle is not in this build"); return Promise.resolve(false); }
    _editorLoad = _hooks.load(files, edges, { strict: true }).then((ok) => {
      if (!ok) { _editorLoad = null; Log.warn("track", "the track designer bundle did not load"); return false; }
      if (typeof TrackDesigner !== "undefined" && TrackDesigner.init) TrackDesigner.init(_G, { custom: CustomTracks });
      return true;
    });
    return _editorLoad;
  }
  function create(G, hooks) {
    _G = G; _hooks = hooks || {};
    // The TRACK DESIGNER title door is handed in as an element (game.js `$()`),
    // not looked up by id here: the shell gains it with the screen (PR4), and
    // the shell-id guard holds every literal lookup to an id that exists.
    const door = _hooks.door || null;
    if (door) door.onclick = () => {
      if (G.soundOn && typeof GameAudio !== "undefined") GameAudio.uiSelect();
      ensureEditor().then((ok) => { if (ok && typeof TrackDesigner !== "undefined") TrackDesigner.open(); });
    };
    return { ensureEditor };
  }

  sync();   // at EVAL: before game.js resolves the stored trackId

  return { KEY, DRAFT_KEY, LIMITS, sanitize, sanitizeName, idOf, canonical, toRaw, sync, list, get, upsert, remove, select, isCustom, draft, setDraft, ensureEditor, create };
})();
Object.freeze(CustomTracks);
