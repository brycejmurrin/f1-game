/* Apex 26 — SAVES & DATA body (SettingsExportBody, LAZY_SAVES_DATA, #4748): collect / apply for
   the SETTINGS, GARAGE and CAREER files, the optional time-trial ttlb section, and the UI — the
   SETTINGS › FILES page (mount), the GARAGE FILE row and the CAREER FILE row. The module's prose
   and its FULL half (FORMAT, SPEC, the garage key / value gates, the public façade) live in
   js/ui/settings-export.js; callers keep using SettingsExport, which creates this body with the G
   game.js handed it the first time anything asks after the bundle lands. */
const SettingsExportBody = (function () {
  "use strict";

const {
  FORMAT, SPEC, isObj, GARAGE_FORMAT, GARAGE_EXCLUDED, isGarageKey, GARAGE_MAX_BYTES, SETTINGS_MAX_BYTES,
  CAREER_BAG_KEYS_MAX, garageValue, CAREER_FORMAT, CAREER_FLAVOURS, CAREER_SLOT_N, CAREER_EXCLUDED,
  CAREER_SLOT_RE, isCareerKey,
} = SettingsExport._core;

const EXCLUDED = "photo library and personal background images, garage (parts, liveries, setup sheets, MY TEAM), saves (career, the season save, replays, daily challenge), accounts and network (Spotify, TURN, relays), renderer self-heal latches, developer flags. Time-trial leaderboards are optional in the ttlb section, and season setup, circuit mastery, ghosts, onboarding marks and your own circuits in the progress section (both merged on import)";

function same(a, b) {
  if (a === b) return true;
  if (isObj(a) && isObj(b)) {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => same(a[k], b[k]));
  }
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((x, i) => same(x, b[i]));
  return false;
}
// The stored object minus what the default already says — a tuner that saves
// its whole table (sndTune, sndLayers) reports only the fields the player
// moved. A key missing from the default (a knob added after the save) is kept.
function objDiff(v, def) {
  const out = {};
  for (const k of Object.keys(v)) if (!(k in def) || !same(v[k], def[k])) out[k] = v[k];
  return out;
}
function readStored(row) {
  const s = GameStore.store;
  if (row.lane === "raw") return s.raw(row.k);   // null when unset
  const v = s.get(row.k, undefined);
  return v === undefined ? null : v;
}
// The SHIPPED default, which is what makes CHANGED honest. js/data/settings-defaults.js
// outranks the row's own `def` for any key it names — otherwise moving a default
// into that file would leave this reporting a stale value, and every exported
// file would list a key as "changed" that the player never touched.
function defaultOf(row, G) {
  if (typeof SettingsDefaults !== "undefined" && SettingsDefaults.has(row.k)) return SettingsDefaults.get(row.k);
  return typeof row.def === "function" ? row.def(G) : row.def;
}

// collect(mode, G) → the file's object. mode "changes" (default) lists only
// what differs from the shipped default; "all" lists every key's effective
// value (stored, else the default). Both carry `changed`, the dotted names of
// the keys that differ, and for those the default replaced and its source.
function collect(mode, G) {
  const all = mode === "all";
  const settings = {};
  const defaults = {};
  const where = {};
  const changed = [];
  for (const row of SPEC) {
    const raw = readStored(row);
    const stored = row.normalize && raw !== null ? row.normalize(raw) ?? null : raw;
    const def = defaultOf(row, G);
    const has = stored !== null;
    // An undefined default is not known yet (engineTable): nothing to diff against, so never CHANGED.
    let diff = has && !row.info && def !== undefined && (row.changed ? row.changed(stored) : !same(stored, def));
    // perDevice: an UNSET key whose default depends on this device (a phone's
    // LOW resolution, its touch steering weight) exports as null, so loading
    // the file elsewhere keeps THAT device's default instead of pinning ours.
    let value = has ? stored : (all && row.perDevice ? null : def);
    if (diff && !row.whole && isObj(stored) && isObj(def) && Object.keys(def).length) {
      const d = objDiff(stored, def);
      if (!Object.keys(d).length) diff = false;
      if (!all) value = d;   // CHANGES carries the moved fields; ALL the whole effective value (B·H11 hunt)
    }
    if ((!diff && !all) || value === undefined) continue;
    (settings[row.group] ||= {})[row.k] = value;
    if (diff) {
      const name = `${row.group}.${row.k}`;
      changed.push(name);
      (defaults[row.group] ||= {})[row.k] = def;
      where[name] = row.src;
    }
  }
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) { /* no DOM */ }
  const desktop = thisDesktop(G);   // the same reading applySettings compares against
  const out = {
    format: FORMAT, mode: all ? "all" : "changes", exportedAt: new Date().toISOString(), build,
    device: { desktop, userAgent: (typeof navigator !== "undefined" && navigator.userAgent) || null },
    keys: { json: "went through store.set (JSON)", raw: "bare strings from store.rawSet; null = unset" },
    excluded: EXCLUDED,
    changed, settings, defaults, where,
  };
  const ttlb = collectTtlb();
  if (ttlb && Object.keys(ttlb).length) out.ttlb = ttlb;
  const progress = typeof ProgressBackup !== "undefined" ? ProgressBackup.collect() : null;   // #5992
  if (progress && Object.keys(progress).length) out.progress = progress;
  return out;
}

// TIME-TRIAL LEADERBOARDS (apex26.ttlb.<trackId>). Optional in the settings
// file: old backups without `ttlb` still import. Export includes refused session writes;
// import validates through GameStore.ttParseBoard (same filter as ttRead) and
// merges per track via ttBoardAdd so caps and class limits stay enforced.
const TTLB_TRACK_RE = /^[A-Za-z0-9_.-]{1,64}$/;
// Include every supported custom circuit as well as the shipped roster. The
// old 64-track cap refused our own exports once 13 customs joined 52 natives.
// Keep the legacy floor for backups from builds with a different roster.
function ttlbTracksMax() {
  const native = typeof Tracks !== "undefined" && Array.isArray(Tracks.LIST) ? Tracks.LIST.filter((t) => t && !t.custom).length : 0;
  const custom = typeof CustomTracks !== "undefined" && CustomTracks.LIMITS ? CustomTracks.LIMITS.items : 0;
  return Math.max(64, native + custom);
}
// Read disk without load-time repairs, then overlay refused JSON writes. Those
// values are still usable in GameStore (including keys disk never accepted),
// and exporting them is the player's recovery path. Never retry a write here.
function collectJson(accept) {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || !full.startsWith("apex26.")) continue;
      const k = full.slice(7);
      if (!accept(k)) continue;
      const raw = localStorage.getItem(full);
      if (raw !== null) { try { out[k] = JSON.parse(raw); } catch (_) { /* not ours to repair */ } }
    }
  } catch (_) { /* blocked disk: session writes can still be exported below */ }
  const s = typeof GameStore !== "undefined" && GameStore.store;
  if (s && s.failedKeys && s.getStored) for (const f of s.failedKeys()) {
    if (f.lane !== "json" || !accept(f.key)) continue;
    // A serialization refusal may never have populated the cache. Avoid the
    // repairing read path in that case; the original disk snapshot above wins.
    if (!s._cache || typeof s._cache.has !== "function" || !s._cache.has("apex26." + f.key)) continue;
    try {
      const value = s.getStored(f.key);
      if (value === undefined) delete out[f.key];
      else out[f.key] = JSON.parse(JSON.stringify(value));
    } catch (_) { /* an unserializable session value cannot replace valid disk data */ }
  }
  return out;
}
function ttlbEntryKey(e) {
  return JSON.stringify({ t: e.t, teamId: e.teamId, code: e.code, name: e.name, ts: e.ts, context: e.context || null });
}
function ttlbParseBoard(b) {
  if (typeof GameStore !== "undefined" && GameStore.ttParseBoard) return GameStore.ttParseBoard(b);
  let laps = [];
  if (Array.isArray(b)) laps = b;
  else if (b && b.v === 2 && Array.isArray(b.laps)) {
    const cls = Array.isArray(b.classes) ? b.classes : [];
    laps = b.laps.map((e) => {
      if (!e || typeof e !== "object") return null;
      const o = {};
      for (const k of Object.keys(e)) if (k !== "c") o[k] = e[k];
      if (Number.isInteger(e.c) && cls[e.c]) o.context = cls[e.c];
      return o;
    });
  }
  return laps.filter((e) => e && Number.isFinite(e.t) && e.t > 0);
}
function collectTtlb() {
  const out = {};
  const boards = collectJson((k) => k.startsWith("ttlb.") && TTLB_TRACK_RE.test(k.slice(5)));
  for (const [k, raw] of Object.entries(boards)) {
    const laps = ttlbParseBoard(raw);
    if (laps.length) out[k.slice(5)] = laps;
  }
  return out;
}
function applyTtlb(bag) {
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return { applied: 0, skipped: 0, rejected: 0 };
  if (!GameStore || !GameStore.ttBoardAddResult || !GameStore.ttBoard) {
    return { applied: 0, skipped: 0, rejected: 0 };
  }
  const tracks = Object.keys(bag);
  const maxTracks = ttlbTracksMax(), maxLaps = maxTracks * 6 * 10;   // 6 classes × 10 laps per board
  if (tracks.length > maxTracks) return { applied: 0, skipped: tracks.length, rejected: tracks.length };
  let applied = 0, skipped = 0, rejected = 0, failed = 0, lapsSeen = 0;
  for (const trackId of tracks) {
    if (!TTLB_TRACK_RE.test(trackId)) { skipped++; rejected++; continue; }
    const raw = bag[trackId];
    const laps = ttlbParseBoard(raw);
    const rawLen = Array.isArray(raw) ? raw.length : (raw && raw.laps && Array.isArray(raw.laps) ? raw.laps.length : 0);
    rejected += Math.max(0, rawLen - laps.length);
    const seen = new Set(GameStore.ttBoard(trackId).map(ttlbEntryKey));
    for (const lap of laps) {
      if (lapsSeen >= maxLaps) { skipped++; continue; }
      lapsSeen++;
      const k = ttlbEntryKey(lap);
      if (seen.has(k)) {
        if (GameStore.store.failedKeys().some((f) => f.key === "ttlb." + trackId)) {
          try { if (GameStore.ttBoardSaveResult(trackId).durable) applied++; else failed++; } catch (_) { failed++; }
        } else skipped++;
        continue;
      }
      try {
        const result = GameStore.ttBoardAddResult(trackId, lap);
        if (result.ok) seen.add(k);
        if (result.durable) applied++; else failed++;
      } catch (_) { failed++; }
    }
  }
  return { applied, skipped, rejected, failed };
}

// Every disk and refused-session key passes the same garage allowlist.
function collectGarage() {
  const out = collectJson(isGarageKey);
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) { /* no DOM */ }
  return { format: GARAGE_FORMAT, exportedAt: new Date().toISOString(), build,
           excluded: GARAGE_EXCLUDED, count: Object.keys(out).length, garage: out };
}

// Reading a file back in. Both loaders answer {ok, applied, skipped, reason}. They are deliberately
// strict and SILENT about anything they do not recognise: a file is player
// input, and the failure that matters is not a malformed number but a key the
// allowlist never named being written into the namespace. Nothing outside SPEC
// (settings) or isGarageKey (garage) is written, whatever the file says.
function typeOk(v, def, row) {
  if (v === null && row && row.nullable) return true;  // legacy empty race draft clears its override
  if (row && row.table) return isObj(v);               // an engine table, known or not yet (engineTable)
  // A raw row is a bare string flag: an object or array stored "[object Object]" (#5743 S2).
  if (row && row.lane === "raw" && v !== null && typeof v === "object") return false;
  if (def === null || def === undefined) return true;   // "unset" default: any shape
  // A plain-object default takes a plain object, an array default an array (#5743 S3).
  if (typeof def === "object") return v !== null && typeof v === "object" && Array.isArray(v) === Array.isArray(def);
  return typeof v === typeof def;
}
// Which kind of device this page runs on, read the way collect() writes file.device.desktop.
function thisDesktop(G) {
  try { if (document.body.classList) return document.body.classList.contains("desktop"); } catch (_) { /* no DOM */ }
  return G && G.gfx && typeof G.gfx.isMobile === "boolean" ? !G.gfx.isMobile : null;
}
function applySettings(file, G) {
  if (!file || file.format !== FORMAT) return { ok: false, reason: `not an ${FORMAT} file`, applied: 0, skipped: 0 };
  // A file is player input: a non-object `settings` or group is "nothing here",
  // never a value to assign into (strict mode throws on a primitive, #2191).
  const isPlain = (o) => o !== null && typeof o === "object" && !Array.isArray(o);
  const groups = isPlain(file.settings) ? Object.assign({}, file.settings) : {};
  // Legacy: REDUCE MOTION lived under appearance before ACCESSIBILITY.
  if (isPlain(groups.appearance) && Object.prototype.hasOwnProperty.call(groups.appearance, "motion")
      && (groups.a11y == null || isPlain(groups.a11y))
      && !(groups.a11y && Object.prototype.hasOwnProperty.call(groups.a11y, "motion"))) {
    groups.a11y = Object.assign({}, groups.a11y, { motion: groups.appearance.motion });
  }
  // Old changes-only files can carry the line-speed flag in the predictive slider row.
  const oldCue = groups.steering?.brakeCue;
  if (oldCue === "on" || oldCue === "off") {
    if ((groups.driving == null || isPlain(groups.driving)) && !Object.hasOwn(groups.driving || {}, "lineBrakeCue")) {
      groups.driving = { ...groups.driving, lineBrakeCue: oldCue };
    }
    groups.steering = { ...groups.steering };
    delete groups.steering.brakeCue;
  }
  // A STEERING SHEET FROM AN OLDER SCHEMA (#5004): the boot migration never runs over imported values (this
  // device is already at STEER_SCHEMA), so the file's own version runs the same ladder here first: a v2 PACE 3
  // is 0.750 of ground speed there and would read as 0.527 on today's grid.
  if (isPlain(groups.steering) && typeof SteerTuning !== "undefined" && SteerTuning.migrateValues) {
    groups.steering = SteerTuning.migrateValues(groups.steering.steerSchema, groups.steering);
  }
  // A FILE FROM THE OTHER KIND OF DEVICE (#5005): a desktop's renderer, quality and resolution pinned on the
  // phone boot desktop graphics. Every perDevice row stays this device's own; the receipt counts them skipped.
  const here = thisDesktop(G), there = isPlain(file.device) ? file.device.desktop : null;
  // A file that does not say which kind of device saved it (no or a broken `device` block: hand-built, older)
  // is treated as the other kind on a page that knows its own: pinning its resolution and renderer here is
  // the #5005 failure (#5743 S4).
  const crossDevice = typeof here === "boolean" && (typeof there !== "boolean" || here !== there);
  const restoreAdaptiveDefaults = file.mode === "all" && typeof here === "boolean" && here === there;
  const writes = [];
  let skipped = 0;
  for (const row of SPEC) {
    // A migration VERSION is context in the file and must never be written
    // back: an older number would re-run migrations that have already run.
    if (row.info) continue;
    const g = groups[row.group];
    if (!isPlain(g) || !Object.prototype.hasOwnProperty.call(g, row.k)) continue;
    // An unset (null) value is nothing to keep out, so it is not a skip either.
    if (row.noImport || (crossDevice && (row.perDevice || row.deviceBound))) { if (g[row.k] !== null) skipped++; continue; }
    const v = row.normalize ? row.normalize(g[row.k]) : g[row.k];
    if (v === undefined) { skipped++; continue; }
    if (v === null && row.perDevice) {
      // An ALL backup from the same device class records that this preference was unpinned.
      if (restoreAdaptiveDefaults) writes.push([row, null]);
      continue;
    }
    const def = defaultOf(row, G);
    // null restores OS-following motion; it is not an unknown enum member.
    if ((!row.freeShape && !typeOk(v, def, row)) || (row.oneOf && !(v === null && def === null) && !row.oneOf.includes(v))) { skipped++; continue; }
    writes.push([row, v]);
  }
  // ALL OR NOTHING (#5005). A write storage refuses (a nearly full phone) used to leave the keys before and
  // after it written: half old, half new after the next launch. Snapshot every key first; any refusal puts
  // them all back and the time-trial merge below never starts.
  // Read through the store, so a value it holds only in memory (an earlier refused write) is what comes back;
  // getStored, never get: a key the player never set must go back to unset, not to a written-out default.
  const stored = (k) => (GameStore.store.getStored ? GameStore.store.getStored(k) : GameStore.store.get(k, undefined));
  const before = writes.map(([row]) => [row, row.lane === "raw" ? GameStore.store.raw(`apex26.${row.k}`) : stored(row.k)]);
  let applied = 0, failed = 0;
  for (const [row, v] of writes) {
    try {
      // A write storage refused (full quota, private mode) is not APPLIED:
      // counting it reloaded the page into the values it had lost.
      let stored = true;
      if (row.lane === "raw") {
        if (v === null) stored = GameStore.store.rawDel(`apex26.${row.k}`) !== false;
        else stored = GameStore.store.rawSet(`apex26.${row.k}`, String(v)) !== false;
      } else {
        // An unset row exports as null; storing it wrote the literal "null",
        // so readers got null instead of their own default. undefined removes.
        stored = GameStore.store.set(row.k, v === null ? undefined : v) !== false;
      }
      if (stored) applied++; else failed++;
    } catch (_) { failed++; }
  }
  if (failed) {
    for (const [row, prev] of before) {
      try {
        if (row.lane !== "raw") GameStore.store.set(row.k, prev);   // undefined removes the key
        else if (prev === null || prev === undefined) GameStore.store.rawDel(`apex26.${row.k}`);
        else GameStore.store.rawSet(`apex26.${row.k}`, prev);
      } catch (_) { /* storage is refusing: the key keeps whatever it could */ }
    }
    return { ok: true, applied: 0, skipped, failed, rejectedTtlb: 0, reason: null };
  }
  const ttlb = applyTtlb(file.ttlb);
  applied += ttlb.applied;
  skipped += ttlb.skipped;
  failed += ttlb.failed || 0;
  // PROGRESS (#5992, js/ui/progress-backup.js): merged like ttlb; a file without it imports as before.
  const progress = typeof ProgressBackup !== "undefined" ? ProgressBackup.apply(file.progress) : { applied: 0, skipped: 0, rejected: 0, failed: 0 };
  applied += progress.applied;
  skipped += progress.skipped;
  failed += progress.failed;
  return { ok: true, applied, skipped, failed, rejectedTtlb: ttlb.rejected || 0, rejectedProgress: progress.rejected, reason: null };
}
function applyGarage(file) {
  if (!file || file.format !== GARAGE_FORMAT) return { ok: false, reason: `not an ${GARAGE_FORMAT} file`, applied: 0, skipped: 0 };
  const g = file.garage || {};
  const prepared = {};
  let applied = 0, skipped = 0, failed = 0, droppedLiveries = 0, remappedLiveries = 0;
  for (const k of Object.keys(g)) {
    if (!isGarageKey(k)) { skipped++; continue; }
    const v = garageValue(k, g[k]);
    if (v === undefined) { skipped++; continue; }
    if (k.indexOf("livery.custom.") === 0 && Array.isArray(g[k])) droppedLiveries += g[k].length - v.length;
    prepared[k] = v;
  }
  // Repair each team as one import unit so a selected colliding id follows the
  // custom paint to its new id regardless of key order in the JSON file.
  for (const k of Object.keys(prepared)) {
    if (k.indexOf("livery.custom.") !== 0) continue;
    const teamId = k.slice("livery.custom.".length), selectedKey = "livery." + teamId;
    const hasImportedSelection = Object.prototype.hasOwnProperty.call(prepared, selectedKey);
    const normalized = CustomLiveries.normalizeImported(
      teamId, prepared[k], hasImportedSelection ? prepared[selectedKey] : undefined);
    prepared[k] = normalized.liveries;
    if (hasImportedSelection) prepared[selectedKey] = normalized.selectedId;
    else if (normalized.catalogAvailable) {
      prepared[selectedKey] = CustomLiveries.coherentImportedSelection(
        teamId, normalized.liveries, GameStore.store.get(selectedKey, "default"));
    }
    remappedLiveries += normalized.repaired;
  }
  for (const k of Object.keys(prepared)) {
    if (k.indexOf("livery.") !== 0 || k.indexOf("livery.custom.") === 0) continue;
    const teamId = k.slice("livery.".length), customKey = "livery.custom." + teamId;
    const customs = Object.prototype.hasOwnProperty.call(prepared, customKey)
      ? prepared[customKey] : GameStore.store.get(customKey, []);
    prepared[k] = CustomLiveries.coherentImportedSelection(teamId, customs, prepared[k]);
  }
  for (const k of Object.keys(prepared)) {
    try { if (GameStore.store.set(k, prepared[k]) !== false) applied++; else failed++; } catch (_) { failed++; }
  }
  const res = { ok: true, applied, skipped, failed, reason: null };
  if (droppedLiveries) { res.droppedLiveries = droppedLiveries; Log.warn("ui", "garage file: livery rows failed the shape check", { droppedLiveries }); }
  if (remappedLiveries) res.remappedLiveries = remappedLiveries;
  return res;
}
// RESET TO THE SHIPPED GARAGE. Fresh installs never need this — GameStore.get
// already answers from GarageDefaults on a miss — but a player who diverged
// and wants the factory look back does. Clear every garage-shaped key first
// so extras the shipped file does not name (an invented team, a one-off
// setup.*) cannot linger, then apply GarageDefaults.file() through the same
// loader a hand-picked export uses. Career / season / settings stay out.
function resetGarage() {
  if (typeof GarageDefaults === "undefined" || !GarageDefaults.file) {
    return { ok: false, reason: "no shipped garage defaults", applied: 0, skipped: 0 };
  }
  const doomed = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full || full.indexOf("apex26.") !== 0) continue;
      const k = full.slice(7);
      if (isGarageKey(k)) doomed.push(k);
    }
  } catch (_) { /* storage blocked: apply what we can */ }
  let failed = 0;
  for (const k of doomed) {
    try { if (GameStore.store.set(k, undefined) === false) failed++; } catch (_) { failed++; }
  }
  const result = applyGarage(GarageDefaults.file());
  result.failed = (result.failed || 0) + failed;
  return result;
}

function migrateSlot(raw) {
  if (raw == null) return null;
  // Clone before migrateCareer: it mutates in place, and export must not
  // rewrite the live Career.data() object sitting in the store cache.
  let copy = raw;
  try { copy = JSON.parse(JSON.stringify(raw)); } catch (_) { return null; }
  if (typeof GameStore !== "undefined" && GameStore.migrateCareer) return GameStore.migrateCareer(copy);
  return copy && typeof copy === "object" && !Array.isArray(copy) ? copy : null;
}
// Ask the shared authority about opaque future saves before migration can
// discard them. Check only the version so unrelated legacy coercion, shape
// and size decisions cannot hide a future discriminator.
function futureCareerSlot(raw, flavour) {
  if (typeof CareerBackup === "undefined") return false;
  return CareerBackup.validate({ format: CareerBackup.FORMAT,
    slots: [{ flavour, i: 0, data: { v: raw && raw.v } }] }).reason === "newer-version";
}
// migrateSlot coerces money:"abc" to 0, which would restore a poisoned file as
// a zero-credit career; ask the backup gate about the RAW money first.
function poisonedCareerMoney(raw, flavour) {
  if (typeof CareerBackup === "undefined" || !raw || typeof raw !== "object"
      || !Object.prototype.hasOwnProperty.call(raw, "money")) return false;
  return CareerBackup.validate({ format: CareerBackup.FORMAT,
    slots: [{ flavour, i: 0, data: { money: raw.money } }] }).reason === "nan-money";
}
// Clean-room fix 70: the season save, licence badges and daily history travel in the career
// file too, under CareerBackup's envelope names, so a player with no career still backs them up.
const CAREER_EXTRA_KEYS = Object.freeze({ season: "season", badges: "badges", daily: "daily.v1" });
function collectCareer() {
  const out = {};
  let n = 0;
  const store = typeof GameStore !== "undefined" ? GameStore.store : null;
  for (const f of CAREER_FLAVOURS) {
    for (let i = 0; i < CAREER_SLOT_N; i++) {
      const k = "career." + f + "." + i;
      let raw = null;
      if (store && store.get) raw = store.get(k, null);
      else {
        try {
          const s = localStorage.getItem("apex26." + k);
          if (s != null) raw = JSON.parse(s);
        } catch (_) { raw = null; }
      }
      const c = futureCareerSlot(raw, f) ? JSON.parse(JSON.stringify(raw)) : migrateSlot(raw);
      if (!c) continue;
      out[k] = c;
      n++;
    }
  }
  let live = null;
  if (store && store.get) live = store.get("careerSlot", null);
  else {
    try {
      const s = localStorage.getItem("apex26.careerSlot");
      if (s != null) live = JSON.parse(s);
    } catch (_) { live = null; }
  }
  if (typeof live === "string" && /^((driver|myteam):[0-2])$/.test(live)) {
    out.careerSlot = live;
    n++;
  }
  let build = null;
  try { const m = document.querySelector('meta[name="apex-build"]'); build = (m && m.content) || null; } catch (_) { /* no DOM */ }
  const extras = {};
  for (const [name, key] of Object.entries(CAREER_EXTRA_KEYS)) {
    const v = store && store.get ? store.get(key, null) : null;
    if (isObj(v)) { extras[name] = JSON.parse(JSON.stringify(v)); n++; }
  }
  return Object.assign({ format: CAREER_FORMAT, exportedAt: new Date().toISOString(), build,
           excluded: CAREER_EXCLUDED, count: n, careers: out }, extras);
}
// CareerBackup is lazy (LAZY_CAREER_UI, #4748): the CAREER FILE buttons await
// it so futureCareerSlot / poisonedCareerMoney never run without their gate.
function careerReady() {
  if (typeof CareerBackup !== "undefined") return Promise.resolve(true);
  return typeof CareerUI !== "undefined" && CareerUI.ensureBackup ? CareerUI.ensureBackup() : Promise.resolve(false);
}
// A snapshot armed before the bundle landed holds no revisions: take it at apply time.
const loadCareer = (file, revisions) => careerReady().then(() => applyCareer(file,
  revisions && Object.keys(revisions.expectedRevisions).length ? revisions : undefined));
// Freeze all possible destinations before opening the asynchronous picker.
function careerRevisions() {
  const expectedRevisions = {};
  if (typeof CareerBackup !== "undefined") for (const f of CAREER_FLAVOURS) {
    for (let i = 0; i < CAREER_SLOT_N; i++) expectedRevisions[f + ":" + i] = CareerBackup.revisionOf(f, i);
  }
  const s = typeof GameStore !== "undefined" ? GameStore.store : null;
  return { expectedRevisions, expectedSelectionRevision: s && s.keyRevision ? s.keyRevision("careerSlot") : null };
}
async function applyCareer(file, revisions) {
  const refused = (reason) => ({ ok: false, reason, applied: 0, skipped: 0, failed: 0 });
  if (!file || file.format !== CAREER_FORMAT) return refused(`not an ${CAREER_FORMAT} file`);
  const bag = file.careers;
  if (!bag || typeof bag !== "object" || Array.isArray(bag)) return refused("invalid careers");
  if (Object.keys(bag).length > CAREER_BAG_KEYS_MAX) return refused("too many careers");
  if (typeof CareerBackup === "undefined") return refused("career backup unavailable");
  const slots = [];
  let skipped = 0, liveSlot;
  for (const k of Object.keys(bag)) {
    if (!isCareerKey(k)) { skipped++; continue; }
    if (k === "careerSlot") {
      if (typeof bag[k] === "string" && /^(driver|myteam):[0-2]$/.test(bag[k])) liveSlot = bag[k];
      else skipped++;
      continue;
    }
    const match = CAREER_SLOT_RE.exec(k);
    if (futureCareerSlot(bag[k], match[1])) return refused("newer-version");
    if (poisonedCareerMoney(bag[k], match[1])) { skipped++; continue; }
    const c = migrateSlot(bag[k]);
    if (!c) { skipped++; continue; }
    slots.push({ flavour: match[1], i: Number(match[2]), data: c });
  }
  const envelope = { format: CareerBackup.FORMAT, slots };
  for (const name of Object.keys(CAREER_EXTRA_KEYS)) if (file[name] != null) envelope[name] = file[name];
  const hasExtras = Object.keys(envelope).length > 2;
  if (!slots.length && liveSlot == null && !hasExtras) return { ok: true, applied: 0, skipped, failed: 0, reason: null };
  // Both file formats share the same live-conflict gate and preflight of ALL
  // destination revisions. No slot is written if any destination changed.
  // applyWithUndo keeps each replaced slot as a restore point first, or refuses.
  // applyWithUndo merges the extras: a newer local season stays, badges combine, daily bests are kept.
  const r = await CareerBackup.applyWithUndo(envelope,
    Object.assign({}, revisions || careerRevisions(), { liveSlot, includeExtras: hasExtras }));
  if (!r.ok) return refused(r.reason);
  const failed = r.failed || 0;
  const applied = Array.isArray(r.applied) ? r.applied.length : r.written.length + (r.selectionWritten ? 1 : 0);
  return { ok: true, applied, skipped, failed, reason: null };
}

async function download(obj, name) {
  const blob = new Blob([JSON.stringify(obj, null, 1)], { type: "application/json" });
  if (typeof NativeDownload !== "undefined" && NativeDownload.viable()) {
    await NativeDownload.saveBlob(blob, name);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

// Settings backups have their own page; renderer diagnostics stay in DISPLAY.
//
// FIVE buttons, two files. Saving is one tap. LOADING IS TWO: it overwrites
// what is already stored and then reloads the page, which is not something a
// mis-tap should do, so the first tap arms and says so and the second commits.
// The arm clears itself after ARM_MS, and arming either loader disarms the
// other.
const ARM_MS = 4000;
// The live UI half, set by create(). js/garage/setup-sheet.js reaches the
// garage row through the module rather than through the G façade: the row is
// UI this module owns, and G's contract is for state game.js hands out.
let _ui = null;
function create(G) {
  const tick = () => { if (G.soundOn && typeof GameAudio !== "undefined" && GameAudio.uiTick) GameAudio.uiTick(); };
  let picker = null;
  let armed = null;
  let armT = 0;
  let leaveSubscribed = false;
  let pickVersion = 0;
  let reloading = false;

  // ONE hidden <input type="file">, retargeted per use: iOS re-uses the sheet
  // and a second input would open a second one. `value = ""` before every click so
  // choosing the SAME file twice still fires change.
  function pick(onJson, maxBytes) {
    const chooserVersion = ++pickVersion;   // a new chooser supersedes pending reads
    if (!picker) {
      picker = document.createElement("input");
      picker.type = "file";
      picker.accept = "application/json,.json";
      picker.hidden = true;
      document.body.appendChild(picker);
    }
    picker.onchange = () => {
      if (reloading || chooserVersion !== pickVersion) return;
      const version = ++pickVersion;
      const f = picker.files && picker.files[0];
      if (!f) return;
      const done = (text) => {
        if (version !== pickVersion) return;
        let obj = null;
        try { obj = JSON.parse(text); } catch (_) { obj = null; }
        onJson(obj);
      };
      const fail = (why) => { if (version === pickVersion) onJson(null, why === "big" ? "big" : "read"); };
      if (maxBytes && f.size > maxBytes) { fail("big"); return; }   // refused before it is read, let alone parsed
      if (typeof f.text === "function") f.text().then(done, fail);
      else { const r = new FileReader(); r.onload = () => done(String(r.result || "")); r.onerror = fail; r.readAsText(f); }
    };
    picker.value = "";
    picker.click();
  }

  // One label timer per button: a FAILED / NOT A JSON FILE restore landing after
  // the button was armed wiped "OVERWRITE …?" while the next tap still loaded.
  const flashT = new Map();
  const unflash = (b) => { clearTimeout(flashT.get(b)); flashT.delete(b); };
  const flash = (b, label, msg, ms) => { unflash(b); b.textContent = `${label} — ${msg}`; flashT.set(b, setTimeout(() => { flashT.delete(b); b.textContent = label; }, ms || 1800)); };
  const disarm = () => { if (armed) { armed.el.textContent = armed.label; armed = null; } clearTimeout(armT); };

  const saveBtn = (id, label, title, make, name) => {
    const b = document.createElement("button");
    b.id = id; b.type = "button"; b.textContent = label; b.title = title;
    b.onclick = async () => {
      if (b.disabled) return;
      disarm(); unflash(b);
      b.disabled = true;
      b.textContent = `${label} — SAVING…`;
      try {
        tick();
        let file = make();
        if (file && typeof file.then === "function") file = await file;   // CAREER FILE waits for CareerBackup
        await download(file, name(file));
        const n = file.changed ? `${file.changed.length} changed` : `${file.count} keys`;
        flash(b, label, `SAVED (${n})`);
        Log.info("ui", "file saved", { id, n });
      } catch (e) {
        flash(b, label, typeof NativeDownload !== "undefined" && NativeDownload.isCancelled(e) ? "CANCELLED" : "FAILED");
        Log.warn("ui", "file save failed", e && e.message);
      } finally {
        b.disabled = false;
      }
    };
    return b;
  };
  const loadBtn = (id, label, title, apply, what, snapshot, maxBytes) => {
    const b = document.createElement("button");
    b.id = id; b.type = "button"; b.textContent = label; b.title = title;
    b.onclick = () => {
      if (reloading) return;
      if (!armed || armed.el !== b) {
        disarm(); unflash(b);
        armed = { el: b, label, snapshot: snapshot ? snapshot() : null };
        b.textContent = `${label} — OVERWRITE ${what}?`;
        armT = setTimeout(disarm, ARM_MS);
        tick();
        return;
      }
      const revisions = armed.snapshot;
      disarm();
      const loaded = (r) => {
        if (!r || !r.ok) { flash(b, label, String((r && r.reason) || "REFUSED").toUpperCase(), 2600); return; }
        Log.info("ui", "file loaded", { id, applied: r.applied, skipped: r.skipped, failed: r.failed });
        // Storage refused some writes: a reload would drop them, so say so and stay.
        if (r.failed) { flash(b, label, `STORAGE FULL — ${r.failed} NOT SAVED${r.applied ? "" : ", NOTHING CHANGED"}`, 3200); return; }
        if (!r.applied) { flash(b, label, "NOTHING TO LOAD", 2200); return; }
        // A reload is the honest way to apply this: half these values are read
        // once at boot (the backend pick, the grid, every tuner's first
        // paint), so re-reading them without one would leave the page showing
        // a mix of old and new.
        b.textContent = `${label} — ${r.applied} APPLIED${r.skipped ? `, ${r.skipped} SKIPPED` : ""}${r.droppedLiveries ? `, ${r.droppedLiveries} LIVERIES SKIPPED` : ""}, RELOADING…`;
        reloading = true; b.disabled = true;
        setTimeout(() => { try { location.reload(); } catch (_) { /* file:// */ } }, 600);
      };
      pick((obj, why) => {
        // Over the size cap is its own reason: "NOT A JSON FILE" for a 2 MB .json misled (#5743 S5).
        if (!obj) { flash(b, label, why === "big" ? "FILE TOO LARGE" : "NOT A JSON FILE", 2200); return; }
        let r;
        // A throw here would surface as an unhandled rejection over the game (#2191).
        const threw = (e) => { Log.warn("ui", "file load threw", e && e.message); return null; };
        try { r = apply(obj, revisions); } catch (e) { r = threw(e); }
        // The career loader is async: it awaits its restore points before writing.
        if (r && typeof r.then === "function") r.then(loaded, (e) => loaded(threw(e)));
        else loaded(r);
      }, maxBytes);
      tick();
    };
    return b;
  };

  function mount() {
    const host = document.getElementById("pm-panel-files");
    if (!host || document.getElementById("pm-settings-file")) return;
    careerReady();   // warm CareerBackup before the first CAREER FILE tap
    if (!leaveSubscribed && typeof SettingsNav !== "undefined" && SettingsNav.onLeave) {
      SettingsNav.onLeave((page) => { if (page === "files") { disarm(); ++pickVersion; } });
      leaveSubscribed = true;
    }
    const h = document.createElement("h3");
    h.className = "pm-group-h";
    h.id = "pm-settings-file";
    h.textContent = "SAVES & DATA";
    const note = document.createElement("p");
    note.className = "adv-help";
    note.setAttribute("data-help", "keep");   // HELP TEXT: HIDE keeps it — it is the only word on what LOAD does
    note.id = "pm-settings-file-scope";
    note.textContent = "SAVE ALL SETTINGS includes preferences, appearance profiles, tuners and control bindings. SAVE CHANGED SETTINGS includes only preference differences from defaults. Both files also include saved time-trial leaderboards, season setup, circuit mastery, ghosts, onboarding marks and your own circuits when present; loading merges them with yours and keeps the best laps. LOAD SETTINGS FILE asks twice, then reloads. Neither file is a complete game backup: garage builds, career and season saves, photos, personal background images, replays, accounts and network credentials are not included.";
    const otherFiles = document.createElement("p");
    otherFiles.id = "pm-other-save-files";
    otherFiles.className = "adv-help";
    otherFiles.setAttribute("data-help", "keep");
    otherFiles.textContent = "Separate backups: GARAGE → TEAM → SAVE GARAGE FILE saves parts, setups, liveries and your team. CAREER → CAREER MODES → SAVE CAREER FILE saves all six career slots, the season save, licence badges and daily history. The same separate file controls are on the Save and Restore pages here. LOAD asks twice and replaces only the corresponding data, then reloads. Settings, garage and career remain separate files. Photos, personal backgrounds, replays and accounts are not included in these backups; ghosts travel in the settings file. STORAGE HEALTH & RESTORE POINTS below reports browser storage and local career history; local history is not an exported backup.";

    const shareNote = document.createElement("p");
    shareNote.id = "pm-share-code-help";
    shareNote.className = "adv-help";
    shareNote.setAttribute("data-help", "keep");
    shareNote.textContent = "Paste a shared setup, livery or daily challenge code or link. Your previous setup or livery is kept after an import: paste UNDO here to restore it. Ghost recording codes and links are imported separately.";
    // textarea — not <input>: settings-export tests pick the LOAD file input via
    // querySelector("input"), and a text field here would steal that match.
    const shareIn = document.createElement("textarea");
    shareIn.id = "pm-share-code-in";
    shareIn.className = "sel-chip";
    shareIn.rows = 2;
    shareIn.spellcheck = false;
    shareIn.autocomplete = "off";
    shareIn.placeholder = "Paste a shared setup, livery or challenge";
    shareIn.setAttribute("aria-label", "Share code");
    shareIn.setAttribute("aria-describedby", "pm-share-code-help pm-share-code-status");
    const shareStatus = document.createElement("p");
    shareStatus.id = "pm-share-code-status";
    shareStatus.className = "adv-help";
    shareStatus.setAttribute("data-help", "keep");
    shareStatus.setAttribute("role", "status");
    shareStatus.setAttribute("aria-live", "polite");
    shareStatus.setAttribute("aria-atomic", "true");
    const shareBtn = document.createElement("button");
    shareBtn.type = "button";
    shareBtn.id = "pm-share-code-import";
    shareBtn.className = "sel-chip";
    shareBtn.textContent = "IMPORT SHARE CODE";
    shareBtn.onclick = () => {
      if (typeof ShareCode === "undefined") { shareStatus.textContent = "Share codes are unavailable. Reload the page and try again."; return; }
      const started = { n: 0 };
      const decoded = ShareCode.decode(shareIn.value);
      if (!decoded.ok) {
        shareStatus.textContent = ShareCode.messageFor(decoded);
        return;
      }
      const opensTrial = decoded.kind === "lap" || decoded.kind === "daily";
      if (opensTrial && G.paused) {
        shareStatus.textContent = "Return to the main menu before opening a shared time trial.";
        return;
      }
      const openPicker = request => {
        if (G.closeSettings) G.closeSettings();
        G.openTimeTrialPicker(request);
      };
      const applied = ShareCode.apply(decoded, {
        store: G.store,
        startRace: () => { started.n++; },
        selectTeam: (teamId) => {
          const ti = Teams.LIST.findIndex((t) => t.id === teamId);
          if (ti >= 0) G.teamIdx = ti;
        },
        openGarage: (from) => { if (G.openGarage) { if (G.closeSettings) G.closeSettings(); G.openGarage(from || "share"); } },
        today: G.daily && G.daily.dayKey(),
        openDaily: (_decoded, staged) => openPicker(staged),
        openTrack: openPicker,
      });
      shareStatus.textContent = ShareCode.messageFor(started.n ? { ok: false } : applied);
      if (opensTrial && applied.ok && G.announce) G.announce(shareStatus.textContent, 3, "info");
    };

    const nav = document.createElement("div");
    nav.id = "pm-files-nav";
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "Backup actions");
    const sections = [], choices = [];
    const selectSection = (index) => {
      disarm();
      sections.forEach((section, i) => { section.hidden = i !== index; });
      choices.forEach((button, i) => button.setAttribute("aria-pressed", String(i === index)));
    };
    for (const [id, label] of [["save", "Save"], ["restore", "Restore"], ["share", "Import share code"]]) {
      const section = document.createElement("section");
      section.id = "pm-files-" + id;
      const button = document.createElement("button");
      button.id = "pm-files-show-" + id;
      button.type = "button";
      button.textContent = label;
      button.setAttribute("aria-controls", section.id);
      section.setAttribute("aria-labelledby", button.id);
      const index = sections.length;
      button.onclick = () => selectSection(index);
      sections.push(section); choices.push(button); nav.append(button);
    }
    // Settings, garage and career stay separate files: each action page keeps
    // the three in that order under their own sub-heading.
    const groupHead = (text) => {
      const head = document.createElement("h4");
      head.className = "pm-group-h"; head.textContent = text;
      return head;
    };
    const saveHelp = document.createElement("p");
    saveHelp.className = "adv-help";
    saveHelp.textContent = "Save all settings for a backup, or just your changes to share a smaller file.";
    sections[0].append(saveHelp,
      saveBtn("pm-settings-changed", "SAVE CHANGED SETTINGS",
        "Changed preferences plus saved time-trial leaderboards, when present. This is not a full game backup.",
        () => collect("changes", G), () => `apex26-settings-changes-${stamp()}.json`),
      saveBtn("pm-settings-all", "SAVE ALL SETTINGS",
        "All exportable preferences plus saved time-trial leaderboards, when present. This is not a full game backup.",
        () => collect("all", G), () => `apex26-settings-all-${stamp()}.json`),
      groupHead("GARAGE FILE"),
      saveBtn("pm-garage-save", "SAVE GARAGE FILE", "Parts, setups, liveries and your team. Career progress and settings are excluded.",
        collectGarage, () => `apex26-garage-${stamp()}.json`),
      groupHead("CAREER FILE"),
      saveBtn("pm-career-save", "SAVE CAREER FILE", "All six career slots, the active slot, the season save, licence badges and daily history. Settings and garage builds are excluded.",
        () => careerReady().then(collectCareer), () => `apex26-career-${stamp()}.json`));
    const restoreHelp = document.createElement("p");
    restoreHelp.className = "adv-help";
    restoreHelp.setAttribute("data-help", "keep");
    restoreHelp.textContent = "Replace settings, garage or career data from a saved file. Press Load twice to confirm, then choose the file. Each file replaces only its own data and the game reloads after applying it; best laps are merged.";
    sections[1].append(restoreHelp,
      loadBtn("pm-settings-load", "LOAD SETTINGS FILE",
        "Read an apex26-settings file back in. Only allowlisted keys are written; the garage, career and accounts are never touched.",
        (obj) => applySettings(obj, G), "SETTINGS", null, SETTINGS_MAX_BYTES),
      groupHead("GARAGE FILE"),
      loadBtn("pm-garage-load", "LOAD GARAGE FILE", "Replace garage data only. Settings and career saves are kept.",
        applyGarage, "THE GARAGE", null, GARAGE_MAX_BYTES),
      groupHead("CAREER FILE"),
      loadBtn("pm-career-load", "LOAD CAREER FILE", "Replace career slots only, with protection against changes made after confirmation.",
        loadCareer, "CAREER SAVES", careerRevisions,
        typeof CareerBackup !== "undefined" ? CareerBackup.MAX_BYTES : 5 * 1024 * 1024));
    sections[2].append(shareNote, shareIn, shareBtn, shareStatus);
    const scope = document.createElement("details");
    scope.id = "pm-files-included";
    const summary = document.createElement("summary");
    summary.textContent = "What is included in each backup?";
    scope.append(summary, note, otherFiles);
    // Exclusions remain visible on every action page, even with help hidden.
    const exclusions = document.createElement("p");
    exclusions.className = "adv-help";
    exclusions.setAttribute("data-help", "keep");
    exclusions.textContent = "Settings, garage and career are separate files. Photos, background images, replays and accounts are excluded.";
    selectSection(0);
    host.append(h, nav, ...sections, exclusions, scope);
    if (typeof SaveHealth !== "undefined" && SaveHealth.mount) SaveHealth.mount(host);
  }

  // The contextual garage pair remains in the Garage: a player looking to back up
  // a livery looks where liveries are. js/garage/setup-sheet.js calls this at
  // the end of its TEAM tab and appends what comes back. It rebuilds that tab
  // on every change, so this returns FRESH nodes each call and holds no
  // singleton — the id-guard mount() uses would leave an empty section behind
  // the first time the tab was rebuilt.
  function garageRow() {
    if (typeof document === "undefined") return null;
    const wrap = document.createElement("div");
    wrap.id = "cs-garage-file";
    wrap.className = "sel-edit-row";
    // Same two-tap arm as LOAD, but no file picker — the second tap clears
    // garage-shaped keys and re-applies js/data/garage-defaults.js.
    const resetLabel = "RESET GARAGE TO DEFAULTS";
    const resetBtn = document.createElement("button");
    resetBtn.id = "cs-garage-reset";
    resetBtn.type = "button";
    resetBtn.textContent = resetLabel;
    resetBtn.title = "Clear parts, liveries, setups (career setup sheets included) and team/driver back to the shipped garage. Career saves and settings are never touched.";
    resetBtn.onclick = () => {
      if (reloading) return;
      if (!armed || armed.el !== resetBtn) {
        disarm(); unflash(resetBtn);
        armed = { el: resetBtn, label: resetLabel, snapshot: null };
        resetBtn.textContent = `${resetLabel} — OVERWRITE THE GARAGE WITH DEFAULTS?`;
        armT = setTimeout(disarm, ARM_MS);
        tick();
        return;
      }
      disarm();
      const r = resetGarage();
      if (!r.ok) { flash(resetBtn, resetLabel, String((r && r.reason) || "REFUSED").toUpperCase(), 2600); return; }
      Log.info("ui", "garage reset to shipped defaults", { applied: r.applied, skipped: r.skipped, failed: r.failed });
      if (r.failed) { flash(resetBtn, resetLabel, `STORAGE FULL — ${r.failed} NOT SAVED`, 3200); return; }
      if (!r.applied) { flash(resetBtn, resetLabel, "NOTHING TO RESET", 2200); return; }
      resetBtn.textContent = `${resetLabel} — ${r.applied} APPLIED, RELOADING…`;
      reloading = true; resetBtn.disabled = true;
      setTimeout(() => { try { location.reload(); } catch (_) { /* file:// */ } }, 600);
      tick();
    };
    wrap.append(
      saveBtn("cs-garage-save", "SAVE GARAGE FILE",
        "Parts, liveries, setup sheets and your own team, for every team. Career money, results and lap records are never in it.",
        collectGarage, () => `apex26-garage-${stamp()}.json`),
      loadBtn("cs-garage-load", "LOAD GARAGE FILE",
        "Read an apex26-garage file back in. Career money, results and lap records are never touched.",
        applyGarage, "THE GARAGE", null, GARAGE_MAX_BYTES),
      resetBtn);
    return wrap;
  }
  // CAREER MODES mounts this the same way GARAGE mounts garageRow: fresh
  // nodes each call, no static shell tags, id-guard against a double append.
  function careerRow() {
    if (typeof document === "undefined") return null;
    const wrap = document.createElement("div");
    wrap.id = "cr-career-file";
    wrap.className = "sel-edit-row";
    wrap.append(
      saveBtn("cr-career-save", "SAVE CAREER FILE",
        "All six career slots and which one is live. Settings, garage builds and accounts stay out.",
        collectCareer, () => `apex26-career-${stamp()}.json`),
      loadBtn("cr-career-load", "LOAD CAREER FILE",
        "Read an apex26-career file back in. Only career slots are written; settings and the garage are never touched.",
        applyCareer, "CAREER SAVES", careerRevisions,
        typeof CareerBackup !== "undefined" ? CareerBackup.MAX_BYTES : 5 * 1024 * 1024));
    const protection = document.createElement("button");
    protection.type = "button";
    protection.textContent = "PROTECT LOCAL SAVES";
    const status = document.createElement("p");
    status.className = "adv-help";
    status.style.flexBasis = "100%";
    status.setAttribute("role", "status");
    status.setAttribute("data-help", "keep");
    const storage = typeof navigator !== "undefined" && navigator.storage;
    let revision = 0;
    async function checkProtection(request) {
      const current = ++revision;
      protection.disabled = true;
      try {
        const protectedSaves = await (request ? storage.persist() : storage.persisted());
        if (current !== revision) return;
        protection.disabled = protectedSaves || typeof storage.persist !== "function";
        protection.textContent = protectedSaves ? "LOCAL SAVES PROTECTED" : "PROTECT LOCAL SAVES";
        status.textContent = protectedSaves
          ? "Browser storage protection is enabled. Clearing site data still removes saves. Save a career file for a separate backup."
          : "Browser storage protection is not enabled. Save a career file regularly to keep a separate backup.";
      } catch (_) {
        if (current !== revision) return;
        protection.disabled = !storage || typeof storage.persist !== "function";
        status.textContent = "Storage protection could not be confirmed. Save a career file to keep a separate backup.";
      }
    }
    protection.onclick = () => { if (!protection.disabled) { tick(); checkProtection(true); } };
    status.textContent = "Storage protection is unavailable in this browser. Save a career file to keep a separate backup.";
    protection.disabled = !storage || typeof storage.persist !== "function";
    if (storage && typeof storage.persisted === "function") {
      status.textContent = "Checking browser storage protection…";
      checkProtection(false);
    }
    wrap.append(protection, status);
    return wrap;
  }
  if (typeof document === "undefined") return { collect: (mode) => collect(mode, G) };
  // #4798 gate (after SaveHealth's)
  if (document.readyState !== "complete") document.addEventListener("DOMContentLoaded", () => (typeof SettingsNav !== "undefined" && SettingsNav.lazy ? SettingsNav.lazy(mount) : mount()), { once: true });
  else mount();
  Log.info("ui", "SettingsExport.create");
  _ui = { collect: (mode) => collect(mode, G), collectGarage, collectCareer,
          applySettings: (o) => applySettings(o, G), applyGarage, applyCareer, resetGarage,
          garageRow, careerRow, mount };
  return _ui;
}

/** Remount the SAVES & DATA controls if create already ran (idempotent).
 *  SettingsNav calls this when the files page opens so a missed boot mount
 *  cannot leave an empty panel (title + Back only). */
function ensureMounted() { if (_ui && typeof _ui.mount === "function") _ui.mount(); }

return { collect, collectGarage, collectCareer, collectTtlb, ttlbParseBoard, applySettings, applyGarage, applyCareer,
         applyTtlb, resetGarage, create, ensureMounted,
         garageRow: () => (_ui && _ui.garageRow ? _ui.garageRow() : null),
         careerRow: () => (_ui && _ui.careerRow ? _ui.careerRow() : null) };
})();
Object.freeze(SettingsExportBody);
SettingsExport._bind(SettingsExportBody);
