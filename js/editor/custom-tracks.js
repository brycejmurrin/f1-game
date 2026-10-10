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
  // DRAFT_PREV_KEY holds the unsaved design a load replaced (a share link, an
  // EDIT, an IMPORT), so the 600 ms autosave of the new one cannot clobber it.
  const KEY = "customTracks", DRAFT_KEY = "customTrackDraft", DRAFT_PREV_KEY = "customTrackDraftPrev", V = 1;
  // A STORED DESIGN IS PLAYER INPUT (and, via a share code, someone else's):
  // every field is rebuilt to these limits on load, never trusted off disk.
  const LIMITS = Object.freeze({
    items: 24, name: 24, country: 32, ptsMin: 8, ptsMax: 200, coord: 10000,
    hwMin: 5, hwMax: 8, zones: 24, halfM: 2000, rise: 60, angleDeg: 30,
    // A stored loop must be one the engine can build: no two consecutive
    // control points closer than the editor's spacing (8 coincident points
    // registered as raceable with curvature NaN), and a control polygon no
    // shorter than this (validate.js's lap floor is 2.5 km on the BUILT road).
    spacing: 8, loopMin: 1000,
  });
  // Road-edge styles the designer authors (mesh.js buildKerbs). Default flat
  // matches the engine's historic ribbon so older saves keep their look + id.
  const KERB_STYLES = Object.freeze(["flat", "sausage", "rumble"]);
  // ONE LATTICE for storage and the share code (js/editor/codec.js): points on
  // 0.25 m, lap fractions on 1/65535, widths and ease on 0.1 / 0.001, angles and
  // rises on 0.25, lengths on 1 m — so a design's content id is the same on
  // both ends of a code, and the TT board and ghosts that key on it line up.
  const q = (v) => Math.round(v * 4) / 4;
  const num = (v, lo, hi, dflt) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
  // A fraction that rounds up to 1.0 wraps to 0 (the loop is closed), so a
  // stored design's id is the same after upsert() and after the next load().
  const frac = (v) => (Number.isFinite(v) ? (Math.round((v - Math.floor(v)) * 65535) % 65535) / 65535 : null);
  const dm = (v) => Math.round(v * 10) / 10, mil = (v) => Math.round(v * 1000) / 1000;

  function sanitizeName(s) {
    let t = String(s == null ? "" : s);
    try { t = t.normalize("NFC"); } catch (_) { /* no ICU */ }
    t = t.replace(/[^\x20-\x7E]/g, "").replace(/\s+/g, " ").trim().toUpperCase().slice(0, LIMITS.name);
    return t || "MY CIRCUIT";
  }

  /** The circuit's country: a LABEL (the picker's flag and LOCATION row), like
   *  the name kept out of the content id. A display name the flag table knows
   *  ("Italy", "UK"); the designer offers only those, and an unknown name still
   *  shows the chequered fallback flag. "" when unset. */
  function sanitizeCountry(s) {
    if (typeof s !== "string") return "";
    return s.normalize("NFC").replace(/[^\p{L}\p{N} .'-]/gu, "").replace(/\s+/g, " ").trim().slice(0, LIMITS.country);
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
  /** Parallel node heights (metres). Missing / short → zeros (old saves load flat).
   *  Same ±rise lattice as a cosine bump's rise. Always length === pts.length. */
  function sanitizeHeights(pts, heights) {
    const n = pts.length, out = new Array(n);
    const src = Array.isArray(heights) ? heights : null;
    for (let i = 0; i < n; i++) {
      const h = src && i < src.length && Number.isFinite(+src[i]) ? +src[i] : 0;
      out[i] = q(Math.min(LIMITS.rise, Math.max(-LIMITS.rise, h))) || 0;
    }
    return out;
  }
  const heightsFlat = (h) => { for (let i = 0; i < h.length; i++) if (h[i]) return false; return true; };

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
    // Cap on the STORED length: clamping before rounding it could shave the
    // rise again on reload. Keep nearest-quarter rounding so legacy ids hold.
    const length = Math.round(halfM), cap = length / 19.6;
    if (Math.abs(rise) > cap) rise = Math.sign(rise) * cap;
    return { s, halfM: length, rise: q(rise) };
  };
  // A narrowing never takes the road under the registry's own width floor, and
  // `ease` is ALWAYS stored (the engine's 0.025 default when absent): the share
  // code always carries one, so an absent ease gave the receiver another id. A
  // zero ease is a step in the road edge, so it floors above 0.
  const HWZ = (z) => {
    const s0 = frac(z.s0), s1 = frac(z.s1), hw = num(z.hw, LIMITS.hwMin, LIMITS.hwMax, null);
    if (s0 == null || s1 == null || hw == null) return null;
    return { s0, s1, hw: dm(hw), ease: mil(num(z.ease, 0.005, 0.2, 0.025)) };
  };
  // mesh.js reads `(angleDeg || 18)` and takes the camber SIDE from curvature:
  // 0 would build 18° and a negative angle adverse camber, so [1, 30] only.
  const BANK = (z) => {
    const f = frac(z.frac), angleDeg = num(z.angleDeg, 1, LIMITS.angleDeg, null), widthM = num(z.widthM, 20, 600, null);
    return f == null || angleDeg == null || widthM == null ? null : { frac: f, angleDeg: q(angleDeg), widthM: Math.round(widthM) };
  };

  /** The content id: everything that shapes the built circuit, nothing that
   *  only labels it. The theme is in it on purpose — game.js skips a rebuild
   *  when builtTrackId matches, and a theme change must rebuild. */
  function sanitizeKerbStyle(v) {
    return KERB_STYLES.includes(v) ? v : "flat";
  }
  function sanitizeBerms(v) {
    // Default ON: berms dress banked corners (surface.js). Explicit false opts out.
    return v === false ? false : true;
  }

  function canonical(it) {
    const parts = [it.theme, it.baseHW, it.seed, it.pts.map((p) => p[0] + "," + p[1]).join(";"),
      JSON.stringify([it.hwZones, it.bankZones, it.elevations, it.bridges])];
    // Per-node heights rebuild the centreline; omitted when flat so older flat ids hold.
    if (it.heights && !heightsFlat(it.heights)) parts.push("h:" + it.heights.join(","));
    // The scenery options rebuild the circuit too; absent at their defaults, so older ids hold.
    if (it.look) parts.push("look:" + it.look.time + "," + it.look.trees + "," + it.look.crowd);
    // Kerb / berm surface opts rebuild the mesh; omitted at defaults so older ids hold.
    const kerb = sanitizeKerbStyle(it.kerbStyle);
    if (kerb !== "flat") parts.push("kerb:" + kerb);
    if (it.berms === false) parts.push("berms:0");
    // Authored props (slice H) rebuild scenery; absent when empty so older ids hold.
    if (it.props && it.props.length) {
      parts.push("props:" + it.props.map((p) => p.kind + "@" + p.s + ":" + p.side + ":" + p.gap).join(","));
    }
    return parts.join("|");
  }
  function idOf(it) { return "custom-" + ("00000000" + Hash32.fnv1a(canonical(it)).toString(16)).slice(-8); }

  /** Control-polygon perimeter (the closing chord included), or -1 when two
   *  consecutive points sit closer than LIMITS.spacing. */
  function loopLength(pts) {
    let L = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], d = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (d < LIMITS.spacing) return -1;
      L += d;
    }
    return L;
  }

  /** Repair rather than discard where the geometry is sound; null when it is not.
   *  opts.loose: a WORK IN PROGRESS — the designer's autosaved draft, and the
   *  validator's preview build — may have two points too close or a loop too
   *  small (the CHECKS list says so in red); restoring or judging it must not
   *  throw it away. Never for storage or a share code. */
  function sanitize(raw, opts) {
    if (!raw || typeof raw !== "object") return null;
    const pts = sanitizePts(raw.pts);
    if (!pts) return null;
    const L = loopLength(pts);
    if (!(opts && opts.loose) && L < LIMITS.loopMin) return null;
    const heights = sanitizeHeights(pts, raw.heights);
    const it = {
      name: sanitizeName(raw.name),
      seed: Number.isFinite(raw.seed) ? (Math.floor(raw.seed) >>> 0) : 1,
      theme: TrackThemes.has(raw.theme) ? raw.theme : TrackThemes.ORDER[0],
      baseHW: Math.round(num(raw.baseHW, LIMITS.hwMin, LIMITS.hwMax, 7) * 10) / 10,
      pts,
      heights,
      hwZones: sanitizeZones(raw.hwZones, HWZ),
      bankZones: sanitizeZones(raw.bankZones, BANK),
      elevations: sanitizeZones(raw.elevations, BUMP),
      bridges: sanitizeZones(raw.bridges, BUMP),
      turns: Array.isArray(raw.turns) ? raw.turns.map(frac).filter((v) => v != null).slice(0, 40) : [],
      lengthM: num(raw.lengthM, 0, 50000, 0),
      created: num(raw.created, 0, 8.64e15, Date.now()),
      updated: num(raw.updated, 0, 8.64e15, Date.now()),
    };
    const look = TrackThemes.sanitizeLook(raw.look);
    if (look) it.look = look;
    const country = sanitizeCountry(raw.country);
    if (country) it.country = country;
    const kerb = sanitizeKerbStyle(raw.kerbStyle);
    if (kerb !== "flat") it.kerbStyle = kerb;
    if (sanitizeBerms(raw.berms) === false) it.berms = false;
    // Authored scenery props (TrackDesignerProps): absent when empty / all invalid.
    if (typeof TrackDesignerProps !== "undefined" && TrackDesignerProps.sanitize) {
      const props = TrackDesignerProps.sanitize(raw.props);
      if (props) it.props = props;
    }
    if (!it.lengthM) { let C = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; C += Math.hypot(b[0] - a[0], b[1] - a[1]); } it.lengthM = Math.round(C); }
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

  /** A lap fraction measured along the CONTROL POLYGON's arc → the control
   *  INDEX fraction ((i + t) / N) at the same place, interpolated inside the
   *  segment. applyHwZones keys its windows on i / N; the designer (START HERE,
   *  REVERSE, the stamp remap) works in arc fractions — exact for any spacing. */
  function arcToIndexFrac(pts, f) {
    const N = pts.length, cum = [0];
    for (let i = 0; i < N; i++) { const a = pts[i], b = pts[(i + 1) % N]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    const L = cum[N];
    if (!(L > 0)) return f;
    const x = Math.min(1, Math.max(0, f)) * L;
    let i = 0;
    while (i < N - 1 && cum[i + 1] < x) i++;
    const seg = cum[i + 1] - cum[i];
    return (i + (seg > 0 ? (x - cum[i]) / seg : 0)) / N;
  }

  /** Design record → the raw def shape js/circuits/<id>.js authors, ready for TrackDef.fromRaw. */
  function toRaw(it) {
    const theme = TrackThemes.defFields(it.theme, it);   // the design: the street presets thin their city past cityM of lap
    const hs = Array.isArray(it.heights) ? it.heights : null;
    // path.pts stay [x, z]; optional [x, z, y] when any node height is non-zero
    // (TrackDef.realPoints reads p[2] as authored Y for custom circuits).
    const pathPts = it.pts.map((p, i) => {
      const y = hs && Number.isFinite(+hs[i]) ? +hs[i] : 0;
      return y ? [p[0], p[1], y] : [p[0], p[1]];
    });
    const raw = Object.assign({
      id: it.id, custom: true, name: it.name, gp: it.name + " GP", country: it.country || "",
      lengthKm: Math.round(it.lengthM / 100) / 10 || 0.1, classic: false,
      sceneryCoordinates: "racing", startFrac: 0, undulate: true,
      baseHW: it.baseHW,
      path: { len: it.lengthM, pts: pathPts },
      turns: it.turns && it.turns.length ? it.turns.slice() : null, sectors: null,
      bankZones: it.bankZones, elevations: it.elevations, bridges: it.bridges,
    }, theme);
    // applyHwZones keys its windows on the CONTROL INDEX fraction (i / N); the
    // designer authors arc fractions, so map each end through the polygon's
    // cumulative length rather than assume equal spacing.
    if (it.hwZones) raw.hwZones = it.hwZones.map((z) => Object.assign({}, z, { s0: arcToIndexFrac(it.pts, z.s0), s1: arcToIndexFrac(it.pts, z.s1) }));
    const kerb = sanitizeKerbStyle(it.kerbStyle);
    if (kerb !== "flat") raw.kerbStyle = kerb;
    // Berms dress banked corners; explicit false opts out. Default ON when any
    // bankZones exist so a banked custom circuit gets the catch-fence mound.
    if (it.berms === false) raw.berms = false;
    else if (it.bankZones && it.bankZones.length) raw.berms = true;
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

  /** The selected circuit's id: the façade's trackIdx when game.js handed it
   *  over (create), else the stored stable id. */
  function selectedId() {
    const t = _G && Number.isInteger(_G.trackIdx) ? Tracks.LIST[_G.trackIdx] : null;
    const id = t ? t.id : store.get("trackId", null);
    // Only a CUSTOM selection can move: the shipped 52 sit ahead of the tail.
    return typeof id === "string" && id.startsWith("custom-") ? id : null;
  }
  /** After the custom tail changed: put the selection back on `id` (or index
   *  0 when it is gone) and rewrite BOTH stored keys, so neither the façade
   *  nor a reload's positional fallback lands on whatever slid into its slot. */
  function reselect(id) {
    let idx = id ? Tracks.LIST.findIndex((t) => t.id === id) : -1;
    if (idx < 0) idx = 0;
    if (_G) _G.trackIdx = idx;
    if (Tracks.LIST[idx]) { store.set("trackId", Tracks.LIST[idx].id); store.set("track", idx); }
    return idx;
  }

  /** Save (new id = new entry; same content id = refresh the label).
   *  opts.replace: the id this design was opened from (the designer's EDIT) —
   *  a geometry change makes a new content id, and the edited circuit is
   *  REPLACED in place instead of gaining a duplicate per change. */
  function upsert(design, opts) {
    const it = sanitize(design);
    if (!it) return { ok: false, reason: "geometry" };
    const sel = selectedId();
    const items = load().items;
    const origin = opts && typeof opts.replace === "string" && opts.replace !== it.id ? items.findIndex((x) => x.id === opts.replace) : -1;
    const i = items.findIndex((x) => x.id === it.id);
    if (i >= 0) { it.created = items[i].created; items[i] = it; if (origin >= 0) items.splice(origin, 1); }
    else if (origin >= 0) { it.created = items[origin].created; items[origin] = it; }
    else { if (items.length >= LIMITS.items) return { ok: false, reason: "full", limit: LIMITS.items }; items.push(it); }
    it.updated = Date.now();
    const r = write(items);
    if (origin >= 0) { try { store.rawDel("ttlb." + opts.replace); } catch (_) { /* never had one */ } }
    if (sync() >= 0 && sel) reselect(sel === (opts && opts.replace) ? it.id : sel);
    return { ok: true, id: it.id, replaced: origin >= 0 ? opts.replace : null, durable: !!(r && r.durable), reason: r && r.reason };
  }

  function remove(id) {
    const sel = selectedId();
    const items = load().items.filter((x) => x.id !== id);
    const r = write(items);
    // Its time-trial board goes with it (GameStore.ttBoard key shape).
    try { store.rawDel("ttlb." + id); } catch (_) { /* never had one */ }
    // Re-resolve by id: the tail re-syncs, so the removed circuit's index now
    // names its successor (or nothing) and every later custom slid down one.
    if (sync() >= 0 && sel) reselect(sel === id ? null : sel);
    return { ok: true, durable: !!(r && r.durable) };
  }

  const COLLECTION_FORMAT = "apex26.tracks";
  function exportCollection() { return { format: COLLECTION_FORMAT, v: 1, items: list() }; }
  /** Preflight the entire collection before one write. Existing content wins
   *  duplicates, including its label; a hash collision refuses the import.
   *  The optional validator adds full editor raceability checks to registry checks. */
  function importCollection(raw, validate) {
    if (!raw || raw.format !== COLLECTION_FORMAT || raw.v !== 1 || !Array.isArray(raw.items)) return { ok: false, reason: "format" };
    if (raw.items.length > LIMITS.items) return { ok: false, reason: "full", limit: LIMITS.items };
    const items = list(), known = new Map(items.map((it) => [it.id, it]));
    let added = 0, skipped = 0;
    for (const [index, row] of raw.items.entries()) {
      let it;
      try {
        it = sanitize(row);
        // Bound engine work before validation, even with hostile coordinates.
        if (!it || loopLength(it.pts) > 14000 || (validate && !validate(it).ok)) return { ok: false, reason: "invalid", index };
        TrackDef.fromRaw(toRaw(it));
      } catch (_) { return { ok: false, reason: "invalid", index }; }
      const existing = known.get(it.id);
      if (existing) {
        if (canonical(existing) !== canonical(it)) return { ok: false, reason: "collision", index };
        skipped++; continue;
      }
      known.set(it.id, it); items.push(it); added++;
    }
    if (items.length > LIMITS.items) return { ok: false, reason: "full", limit: LIMITS.items, needed: items.length };
    if (!added) return { ok: true, added, skipped, durable: true };
    const selected = selectedId(), result = write(items);
    if (!result || !result.ok) return { ok: false, reason: "write" };
    if (sync() >= 0 && selected) reselect(selected);
    return { ok: true, added, skipped, durable: !!result.durable };
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
  function draftPrev() { return store.get(DRAFT_PREV_KEY, null); }
  function setDraftPrev(d) { if (d == null) store.rawDel(DRAFT_PREV_KEY); else store.set(DRAFT_PREV_KEY, d); }

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
  // TEST HERE's way back (TrackDesigner.testHere): { id, sel, span, s } of the
  // design the test drive left from. MEMORY ONLY, never localStorage — a reload
  // must not reopen the designer over the title screen.
  let _ret = null;
  /** Arm the return the next consumeTrackHash() outside a race takes (quitToMenu calls it). */
  function armReturn(r) { _ret = r && typeof r === "object" ? r : null; }
  /** A #track=<APXT1 code> link (TrackCodec.shareUrl): load the designer and
   *  open the shared design in it, then strip the fragment so a reload does not
   *  re-open it. Mid-race it waits, fragment intact, for the menu (game.js
   *  re-reads it on quit, as it does the #ghost= link). Resolves true when a
   *  design opened, false when the link was refused or absent, null when deferred. */
  function consumeTrackHash() {
    // An armed test-drive return goes first: mid-race it waits (kept armed),
    // else it is taken once and the designer reopens on the same point.
    if (_ret) {
      if (typeof UiLayers !== "undefined" && UiLayers.inRace && UiLayers.inRace()) return Promise.resolve(null);
      const r = _ret; _ret = null;
      return ensureEditor().then((ok) => {
        if (!ok || typeof TrackDesigner === "undefined") return false;
        Log.info("track", "back from the test drive on " + r.id);
        TrackDesigner.open({ resume: r });
        return true;
      }).catch((e) => { Log.warn("track", "test drive return failed: " + (e && e.message || e)); return false; });
    }
    const hash = typeof location !== "undefined" ? String(location.hash || "") : "";
    if (!/[#&]track=/.test(hash)) return Promise.resolve(false);
    if (typeof UiLayers !== "undefined" && UiLayers.inRace && UiLayers.inRace()) { Log.info("track", "share link deferred: racing"); return Promise.resolve(null); }
    return ensureEditor().then(async (ok) => {
      if (!ok || typeof TrackCodec === "undefined" || typeof TrackDesigner === "undefined") return false;
      // A malformed fragment (`%E0%A4%A`) must not throw past here: the strip
      // below would never run and every hashchange would re-throw.
      let code = null;
      try { code = TrackCodec.fromHash(location.hash); } catch (_) { code = null; }
      const r = code ? await TrackCodec.decode(code) : { ok: false, reason: "malformed" };
      try { history.replaceState(history.state, "", location.pathname + location.search + TrackCodec.withoutTrack(location.hash)); } catch (_) { /* a sandboxed page */ }
      if (!r.ok) { Log.warn("track", "share link refused: " + r.reason); return false; }
      Log.info("track", "share link opened " + r.id);
      TrackDesigner.open({ design: r.design, shared: true });
      return true;
    }).catch((e) => { Log.warn("track", "share link failed: " + (e && e.message || e)); return false; });
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
    if (typeof window !== "undefined" && window.addEventListener) { consumeTrackHash(); window.addEventListener("hashchange", consumeTrackHash); }
    return { ensureEditor, consumeTrackHash };
  }

  sync();   // at EVAL: before game.js resolves the stored trackId

  return { COLLECTION_FORMAT, exportCollection, importCollection, KEY, DRAFT_KEY, DRAFT_PREV_KEY, LIMITS, KERB_STYLES, sanitize, sanitizeName, sanitizeCountry, sanitizeHeights, sanitizeKerbStyle, sanitizeBerms, idOf, canonical, toRaw, arcToIndexFrac, sync, list, get, upsert, remove, select, isCustom, draft, setDraft, draftPrev, setDraftPrev, ensureEditor, consumeTrackHash, create, armReturn };
})();
Object.freeze(CustomTracks);
