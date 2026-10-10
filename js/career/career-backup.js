/* Apex 26 — CAREER BACKUP: versioned export/import of all six career slots
   (plus optional standalone season / badges / daily and the MY TEAM
   identity). Ghosts stay out.
   SettingsExport deliberately excludes saves; the only other career dump is
   exportRecovery on the broken-storage banner. This is the deliberate backup
   path for origin / app-id moves (docs/PACKAGING.md, CAREER-BRAINSTORM §4 #3). */
const CareerBackup = (function () {
  "use strict";

  const FORMAT = "apex26-career-backup-v1";
  const MAX_BYTES = 5 * 1024 * 1024;
  const FLAVOURS = Object.freeze(["driver", "myteam"]);
  const SLOTS = 3;

  function store() {
    return (typeof GameStore !== "undefined" && GameStore.store) ? GameStore.store : null;
  }
  function migrate(c) {
    if (typeof SaveMigrate !== "undefined" && SaveMigrate.migrateCareer) return SaveMigrate.migrateCareer(c);
    if (typeof GameStore !== "undefined" && GameStore.migrateCareer) return GameStore.migrateCareer(c);
    return null;
  }
  function slotKey(f, i) { return "career." + f + "." + (i | 0); }
  function flavourIn(f) { return f === "myteam" ? "myteam" : "driver"; }
  function slotIn(i) {
    const n = i | 0;
    return n < 0 ? 0 : n > SLOTS - 1 ? SLOTS - 1 : n;
  }
  function isObj(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
  function log(level, msg) {
    if (typeof Log !== "undefined" && Log[level]) Log[level]("game", msg);
  }

  // Hostile-payload gate BEFORE migrateCareer: the ladder coerces NaN money to
  // 0, which would silently turn a poisoned file into a zero-credit career.
  // `rowFlavour` is the slot the file files it under; a driver career that
  // claims a MY TEAM row (a hand edit) would load as a driver save in that set.
  function slotPayloadOk(data, rowFlavour) {
    if (data == null) return { ok: true };
    if (Array.isArray(data)) return { ok: false, reason: "slot-not-object" };
    if (!isObj(data)) return { ok: false, reason: "slot-not-object" };
    if (data.flavour != null && flavourIn(data.flavour) !== flavourIn(rowFlavour)) {
      return { ok: false, reason: "flavour-mismatch" };
    }
    if (Object.prototype.hasOwnProperty.call(data, "money")) {
      const m = data.money;
      if (typeof m === "number" && !Number.isFinite(m)) return { ok: false, reason: "nan-money" };
      if (m != null && typeof m !== "number" && typeof m !== "string") return { ok: false, reason: "nan-money" };
      if (typeof m === "string" && m !== "" && !Number.isFinite(Number(m))) return { ok: false, reason: "nan-money" };
    }
    if (data.season != null && (typeof data.season !== "object" || Array.isArray(data.season))) {
      return { ok: false, reason: "season-not-object" };
    }
    if (data.driver != null && (typeof data.driver !== "object" || Array.isArray(data.driver))) {
      return { ok: false, reason: "driver-not-object" };
    }
    if (data.fitted != null && (typeof data.fitted !== "object" || Array.isArray(data.fitted))) {
      return { ok: false, reason: "fitted-not-object" };
    }
    return { ok: true };
  }

  function readSlotRaw(f, i) {
    const s = store();
    if (!s) return null;
    const v = s.get(slotKey(f, i), null);
    return v == null ? null : v;
  }

  function collectSlots() {
    const out = [];
    for (const f of FLAVOURS) {
      for (let i = 0; i < SLOTS; i++) {
        const raw = readSlotRaw(f, i);
        let data = null;
        if (raw != null) {
          // Deep clone so the envelope never holds the store cache object.
          const clone = JSON.parse(JSON.stringify(raw));
          data = migrate(clone) || clone;
        }
        out.push({ flavour: f, i: i, data: data });
      }
    }
    return out;
  }

  function optionalExtras() {
    const s = store();
    const extras = {};
    if (!s) return extras;
    const season = s.get("season", null);
    if (season != null) extras.season = JSON.parse(JSON.stringify(season));
    const badges = s.get("badges", null);
    if (badges != null) extras.badges = JSON.parse(JSON.stringify(badges));
    const daily = s.get("daily.v1", null);
    if (daily != null) extras.daily = JSON.parse(JSON.stringify(daily));
    // Optional records book (not yet a first-class store key): pass through if present.
    const records = s.get("records", null);
    if (records != null) extras.records = JSON.parse(JSON.stringify(records));
    return extras;
  }

  // MY TEAM IDENTITY. A myteam save stores only `team: "custom"`; the team's
  // name, colours, roster, logo and paint jobs live in GLOBAL garage keys. A
  // backup restored on a new origin / device without them brought back the
  // money and seasons under the default "custom" team. These ride along as an
  // optional `myTeam` block (store key -> value) whenever a MY TEAM slot has
  // data. One identity for all three slots — a per-slot snapshot is a follow-up.
  const IDENTITY_KEYS = Object.freeze(["customTeam", "customLogo", "livery.custom.custom", "livery.custom"]);
  function hasMyTeamData(slots) {
    for (const row of slots || []) if (row && row.data != null && flavourIn(row.flavour) === "myteam") return true;
    return false;
  }
  function collectIdentity() {
    const s = store();
    const out = {};
    if (!s) return out;
    for (const k of IDENTITY_KEYS) {
      const v = s.get(k, null);
      if (v != null) out[k] = JSON.parse(JSON.stringify(v));
    }
    return out;
  }
  // Same per-key shape gate as the GARAGE file (SettingsExport.garageValue:
  // Teams.sanitizeCustom, data:image logo cap, livery rows needing id/c1/c2).
  // Without it nothing is written — never an unchecked value.
  function identityValue(k, v) {
    if (IDENTITY_KEYS.indexOf(k) === -1 || v == null) return undefined;
    if (typeof SettingsExport === "undefined" || !SettingsExport.garageValue) return undefined;
    try { return SettingsExport.garageValue(k, v); } catch (e) { return undefined; }
  }

  function build() {
    const envelope = {
      format: FORMAT,
      exportedAt: new Date().toISOString(),
      build: (typeof window !== "undefined" && window.__APEX_BUILD) ? window.__APEX_BUILD : null,
      slots: collectSlots(),
    };
    Object.assign(envelope, optionalExtras());
    if (hasMyTeamData(envelope.slots)) {
      const id = collectIdentity();
      if (Object.keys(id).length) envelope.myTeam = id;
    }
    return envelope;
  }

  function serialize(envelope) {
    return JSON.stringify(envelope, null, 2);
  }

  function download(envelope, filename) {
    const name = filename || ("apex26-career-backup-" + Date.now() + ".json");
    const text = typeof envelope === "string" ? envelope : serialize(envelope);
    const blob = new Blob([text], { type: "application/json" });
    // Prefer the Capacitor Share path when the native shim is viable; otherwise
    // the click interceptor on NativeDownload still catches the <a download>.
    if (typeof NativeDownload !== "undefined" && NativeDownload.viable && NativeDownload.viable()
        && typeof NativeDownload.saveBlob === "function") {
      return NativeDownload.saveBlob(blob, name).then(function () {
        return { ok: true, name: name };
      }).catch(function (err) {
        log("warn", "career backup native download failed: " + ((err && err.message) || err));
        return clickDownload(blob, name);
      });
    }
    return Promise.resolve(clickDownload(blob, name));
  }

  function clickDownload(blob, name) {
    if (typeof document === "undefined") return { ok: false, reason: "no-document", name: name };
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
    return { ok: true, name: name };
  }

  function exportAll() {
    const envelope = build();
    return download(envelope).then(function (r) {
      return Object.assign({ envelope: envelope }, r || { ok: true });
    });
  }

  function validate(raw, rawText) {
    if (rawText != null) {
      const n = typeof rawText === "string" ? rawText.length
        : (rawText && rawText.byteLength) || 0;
      if (n > MAX_BYTES) return { ok: false, reason: "too-large" };
    }
    if (raw == null) return { ok: false, reason: "empty" };
    if (typeof raw === "string") {
      if (raw.length > MAX_BYTES) return { ok: false, reason: "too-large" };
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { return { ok: false, reason: "bad-json" }; }
      return validate(parsed, raw);
    }
    if (!isObj(raw)) return { ok: false, reason: "not-object" };
    if (raw.format !== FORMAT) return { ok: false, reason: "wrong-format" };
    if (!Array.isArray(raw.slots)) return { ok: false, reason: "slots-not-array" };
    if (raw.slots.length > 12) return { ok: false, reason: "too-many-slots" };
    // One row per slot (build() never exports two): apply() writes row by row,
    // so a second row for the same slot either overwrote the first or, with a
    // pinned revision, wrote the first and THEN reported "conflict". Refused
    // here, before anything is written.
    const seenSlots = {};
    for (let i = 0; i < raw.slots.length; i++) {
      const row = raw.slots[i];
      if (!isObj(row)) return { ok: false, reason: "slot-row-not-object" };
      const f = flavourIn(row.flavour);
      if (row.flavour != null && row.flavour !== "driver" && row.flavour !== "myteam") {
        return { ok: false, reason: "bad-flavour" };
      }
      const idx = slotIn(row.i);
      if (row.i != null && (row.i | 0) !== idx) return { ok: false, reason: "bad-index" };
      const chk = slotPayloadOk(row.data, row.flavour);
      if (!chk.ok) return chk;
      const slotId = f + ":" + idx;
      if (Object.prototype.hasOwnProperty.call(seenSlots, slotId)) return { ok: false, reason: "duplicate-slot" };
      seenSlots[slotId] = true;
    }
    if (raw.season != null && !isObj(raw.season)) return { ok: false, reason: "season-not-object" };
    if (raw.badges != null && !isObj(raw.badges)) return { ok: false, reason: "badges-not-object" };
    if (raw.daily != null && !isObj(raw.daily)) return { ok: false, reason: "daily-not-object" };
    if (raw.records != null && !isObj(raw.records)) return { ok: false, reason: "records-not-object" };
    for (const k of EXTRA_KEYS) {
      if (raw[k] == null) continue;
      const c = cleanExtra(k, raw[k]);
      if (!c.ok) return { ok: false, reason: c.reason };
    }
    // Malformed VALUES inside myTeam are dropped per key at apply, not fatal.
    if (raw.myTeam != null && !isObj(raw.myTeam)) return { ok: false, reason: "myteam-not-object" };
    // Ghosts must never ride along — refuse a file that smuggles them in.
    if (raw.ghost != null || raw.ghosts != null || raw["ghost.v1"] != null) {
      return { ok: false, reason: "ghosts-forbidden" };
    }
    return { ok: true, envelope: raw };
  }

  // THE OPTIONAL EXTRAS ARE UNTRUSTED. validate() only proved they were objects, and
  // apply() wrote them to storage as given: a 4 MB `junk` key rode a legal file into
  // the 5 MB quota, and `season` came back through SeasonCal.resume(), which keeps
  // every key it does not know. Each extra now goes through an allowlist cleaner
  // that rebuilds it from the fields its reader uses, bounded in size, and a payload
  // that is oversized or carries an own `__proto__` key is refused outright.
  const EXTRA_MAX = 256 * 1024;      // serialised bytes, per extra (the file cap is 5 MB for ALL of it)
  const EXTRA_KEYS = Object.freeze(["season", "badges", "daily", "records"]);
  const DAY_RE = /^\d{4}-\d\d-\d\d$/;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,48}$/;
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function hostile() { const e = new Error("hostile"); e.hostile = true; return e; }
  // Every object the cleaners walk goes through here: an own "__proto__" (what
  // JSON.parse makes of that key) is the signature of a prototype-pollution attempt.
  function plain(o) {
    if (!isObj(o)) return null;
    if (own(o, "__proto__")) throw hostile();
    return o;
  }
  function num(v, lo, hi) { return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null; }
  function idMap(raw, max, take) {
    const out = {};
    const src = plain(raw);
    if (!src) return out;
    let n = 0;
    for (const id of Object.keys(src)) {
      if (n >= max) break;
      if (!ID_RE.test(id)) continue;
      const v = take(src[id]);
      if (v === undefined) continue;
      out[id] = v;
      n++;
    }
    return out;
  }
  function numArr(raw, max) {
    if (!Array.isArray(raw)) return undefined;
    const out = [];
    for (let i = 0; i < Math.min(raw.length, max); i++) out.push(num(raw[i], 0, 1e6) || 0);
    return out;
  }
  function cleanSeasonConfig(raw) {
    const c = plain(raw);
    if (!c) return undefined;
    const ids = (a) => (Array.isArray(a) ? a.filter((id, i) => typeof id === "string" && ID_RE.test(id) && a.indexOf(id) === i).slice(0, 64) : []);
    return {
      trackIds: ids(c.trackIds),
      quali: c.quali !== false,
      sprint: c.sprint === true ? true : c.sprint === "rounds" ? "rounds" : false,
      sprintIds: ids(c.sprintIds),
      laps: num(c.laps, 1, 200) | 0 || 3,
      points: c.points === "classic" ? "classic" : "modern",
      flPoint: c.flPoint === true,
      drop: num(c.drop, 0, 5) | 0,
    };
  }
  function cleanSeason(raw) {
    const r = plain(raw);
    const out = {
      round: Number.isInteger(r.round) && r.round >= 0 && r.round <= 200 ? r.round : 0,
      pts: idMap(r.pts, 120, (v) => { const n = num(v, 0, 1e6); return n == null ? undefined : n; }),
      teamPts: idMap(r.teamPts, 40, (v) => { const n = num(v, 0, 1e6); return n == null ? undefined : n; }),
      driverCodes: idMap(r.driverCodes, 120, (v) => (typeof v === "string" ? v.slice(0, 12) : undefined)),
      finishes: idMap(r.finishes, 120, (v) => numArr(v, 30)),
      roundPts: idMap(r.roundPts, 120, (v) => numArr(v, 64)),
    };
    const cfg = cleanSeasonConfig(r.config);
    if (cfg) out.config = cfg;
    if (r.stage === "race") out.stage = "race";
    if (typeof r.lastFl === "string" && ID_RE.test(r.lastFl)) out.lastFl = r.lastFl;
    if (Number.isInteger(r.seed) && r.seed > 0 && r.seed <= 0xFFFFFFFF) out.seed = r.seed;
    return out;
  }
  function cleanBadges(raw) {
    const r = plain(raw);
    return { v: 1, got: idMap(r.got, 200, (v) => { const n = num(v, 1, 8.64e15); return n == null ? undefined : n; }) };
  }
  function cleanBest(v) { const n = num(v, 0, 1e6); return n && n > 0 ? n : null; }
  function cleanDayEntry(raw, nested) {
    const e = plain(raw);
    if (!e) return undefined;
    const out = {};
    if (own(e, "best")) out.best = cleanBest(e.best);
    if (own(e, "laps")) out.laps = num(e.laps, 0, 1e6) | 0;
    if (!nested && isObj(e.classes)) {
      out.classes = idMap(e.classes, 8, (v) => cleanDayEntry(v, true));
    }
    return out;
  }
  function cleanDaily(raw) {
    const r = plain(raw);
    const out = {};
    if (isObj(r.days)) {
      const src = plain(r.days);
      const days = {};
      // The newest 120 days: the reader keeps a window and never asks for more.
      for (const day of Object.keys(src).filter((k) => DAY_RE.test(k)).sort().slice(-120)) {
        const e = cleanDayEntry(src[day], false);
        if (e) days[day] = e;
      }
      out.days = days;
    }
    const st = isObj(r.streak) ? plain(r.streak) : null;
    if (st && Number.isInteger(st.count) && st.count >= 0 && st.count <= 1e5 && typeof st.last === "string" && DAY_RE.test(st.last)) {
      out.streak = { count: st.count, last: st.last };
    }
    return out;
  }
  // The records book has no schema yet (a pass-through key): plain data only,
  // bounded in depth, width and string length.
  function cleanPlain(v, depth) {
    if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
    if (typeof v === "boolean") return v;
    if (typeof v === "string") return v.slice(0, 64);
    if (depth >= 4) return undefined;
    if (Array.isArray(v)) {
      return v.slice(0, 64).map((x) => cleanPlain(x, depth + 1)).filter((x) => x !== undefined);
    }
    if (!isObj(v)) return undefined;
    plain(v);
    const out = {};
    let n = 0;
    for (const k of Object.keys(v)) {
      if (n >= 128) break;
      if (k.length > 40) continue;
      const c = cleanPlain(v[k], depth + 1);
      if (c === undefined) continue;
      out[k] = c;
      n++;
    }
    return out;
  }
  const CLEANERS = { season: cleanSeason, badges: cleanBadges, daily: cleanDaily, records: (r) => cleanPlain(plain(r), 0) };
  // { ok, value } or { ok:false, reason }. Oversized is judged on the INCOMING
  // payload (the junk key is what costs the quota), and again on what is kept.
  function cleanExtra(name, raw) {
    try {
      if (JSON.stringify(raw).length > EXTRA_MAX) return { ok: false, reason: name + "-too-large" };
      const value = CLEANERS[name](raw);
      if (JSON.stringify(value).length > EXTRA_MAX) return { ok: false, reason: name + "-too-large" };
      return { ok: true, value: value };
    } catch (e) {
      if (e && e.hostile) return { ok: false, reason: name + "-hostile" };
      return { ok: false, reason: name + "-invalid" };
    }
  }

  function revisionOf(f, i) {
    const s = store();
    if (!s || !s.keyRevision) return null;
    return s.keyRevision(slotKey(f, i));
  }

  function liveConflict(f, i) {
    if (typeof Career === "undefined" || !Career) return false;
    const live = Career.slot && Career.slot();
    if (!live || live.flavour !== f || live.i !== i) return false;
    if (Career.conflicted && Career.conflicted()) return true;
    // The ARMED revision, not slotRevision(): that is the store's current
    // revision of this same key, so `seen !== now` compared a value with itself
    // and never fired — only conflicted() guarded the live slot.
    if (Career.armedRevision) {
      const seen = Career.armedRevision();
      const now = revisionOf(f, i);
      if (seen != null && now != null && seen !== now) return true;
    }
    return false;
  }

  function otherFlavourPending(envelope, focusFlavour) {
    const focus = flavourIn(focusFlavour);
    const other = focus === "myteam" ? "driver" : "myteam";
    for (let i = 0; i < (envelope.slots || []).length; i++) {
      const row = envelope.slots[i];
      if (!row || row.data == null) continue;
      if (flavourIn(row.flavour) === other) return true;
    }
    return false;
  }

  // Write one slot through store.write (IndexedDB mirror included). Refuses a
  // newer live revision the same way Career.save() does.
  function writeSlot(f, i, data, expectedRevision) {
    const s = store();
    if (!s) return { ok: false, durable: false, reason: "no-store" };
    const key = slotKey(f, i);
    if (expectedRevision != null && s.keyRevision && expectedRevision !== s.keyRevision(key)) {
      return { ok: false, durable: false, reason: "conflict" };
    }
    if (liveConflict(f, i)) return { ok: false, durable: false, reason: "conflict" };
    let value = null;
    if (data != null) {
      const clone = JSON.parse(JSON.stringify(data));
      const migrated = migrate(clone);
      if (!migrated) return { ok: false, durable: false, reason: "migrate-failed" };
      value = migrated;
    }
    const result = typeof s.write === "function" ? s.write(key, value) : { ok: true, durable: s.set(key, value) !== false, reason: null };
    if (typeof Career !== "undefined" && Career) {
      const live = Career.slot && Career.slot();
      if (live && live.flavour === f && live.i === i && Career.useSlot) {
        // Refresh the in-memory career from the just-written slot (re-arms revision).
        Career.useSlot(f, i);
      }
    }
    return result;
  }

  // A standalone season further along than the backup's (a later round, or
  // more points at the same round) is newer progress: keep it.
  function seasonPts(sz) {
    let n = 0;
    if (isObj(sz.pts)) for (const k of Object.keys(sz.pts)) n += Number.isFinite(sz.pts[k]) ? sz.pts[k] : 0;
    return n;
  }
  function seasonAhead(local, incoming) {
    if (!isObj(local)) return false;
    const a = local.round | 0, b = incoming.round | 0;
    return a !== b ? a > b : seasonPts(local) > seasonPts(incoming);
  }

  // Badges are earned once and never revoked: import is a UNION of the two
  // { got: { id: ts } } maps, the earlier unlock time winning.
  function mergeBadges(local, incoming) {
    if (!isObj(local)) return incoming;
    const out = Object.assign({}, incoming, local);
    if (isObj(local.got) || isObj(incoming.got)) {
      const got = Object.assign({}, isObj(incoming.got) ? incoming.got : {});
      const mine = isObj(local.got) ? local.got : {};
      for (const id of Object.keys(mine)) {
        const t = mine[id];
        if (!Number.isFinite(got[id]) || (Number.isFinite(t) && t < got[id])) got[id] = t;
      }
      out.got = got;
    }
    return out;
  }

  // THE DAILY CHALLENGE MERGES PER DAY, like badges: a day's best is the
  // faster of the two (each class too), laps the larger count, and the streak
  // is the one with the later `last` day (the longer one on the same day).
  // Writing the backup wholesale reset today's streak and bests to last week's.
  function betterBest(a, b) {
    const fa = Number.isFinite(a) && a > 0, fb = Number.isFinite(b) && b > 0;
    if (fa && fb) return Math.min(a, b);
    return fa ? a : (fb ? b : null);
  }
  function mergeDayEntry(mine, theirs) {
    if (!isObj(mine)) return theirs;
    if (!isObj(theirs)) return mine;
    const out = Object.assign({}, theirs, mine);
    out.best = betterBest(mine.best, theirs.best);
    out.laps = Math.max(mine.laps | 0, theirs.laps | 0);
    if (isObj(mine.classes) || isObj(theirs.classes)) {
      const a = isObj(mine.classes) ? mine.classes : {}, b = isObj(theirs.classes) ? theirs.classes : {};
      out.classes = {};
      for (const k of Object.keys(Object.assign({}, b, a))) out.classes[k] = mergeDayEntry(a[k], b[k]);
    }
    return out;
  }
  function mergeDaily(local, incoming) {
    if (!isObj(local)) return incoming;
    const out = Object.assign({}, incoming, local);
    const a = isObj(local.days) ? local.days : {}, b = isObj(incoming.days) ? incoming.days : {};
    if (isObj(local.days) || isObj(incoming.days)) {
      out.days = {};
      for (const day of Object.keys(Object.assign({}, b, a)).sort()) out.days[day] = mergeDayEntry(a[day], b[day]);
    }
    const sa = isObj(local.streak) ? local.streak : null, sb = isObj(incoming.streak) ? incoming.streak : null;
    if (sa || sb) {
      const la = sa && typeof sa.last === "string" ? sa.last : "", lb = sb && typeof sb.last === "string" ? sb.last : "";
      out.streak = !sb ? sa : !sa ? sb
        : lb > la ? sb : la > lb ? sa
        : ((sb.count | 0) > (sa.count | 0) ? sb : sa);
    }
    return out;
  }
  // The records book has no first-class writer yet (a pass-through key), so
  // there is no "better" to compute: the import fills only the entries this
  // device lacks and never replaces one it has.
  function mergeRecords(local, incoming) {
    return isObj(local) ? Object.assign({}, incoming, local) : incoming;
  }

  function apply(envelope, opts) {
    const o = opts || {};
    const checked = validate(envelope, o.rawText);
    if (!checked.ok) return checked;

    const focus = o.focusFlavour != null ? flavourIn(o.focusFlavour) : null;
    // Same-flavour slots restore without a confirm; the OTHER mode's slots
    // wait on otherFlavourConfirmed so a driver-card import cannot silently
    // overwrite a MY TEAM save (and the reverse).
    const allowed = o.flavours
      ? o.flavours.map(flavourIn)
      : (focus && !o.otherFlavourConfirmed ? [focus] : FLAVOURS.slice());
    const pendingOther = !!(focus && !o.otherFlavourConfirmed && otherFlavourPending(envelope, focus));

    const s = store();
    const selected = o.liveSlot;
    if (selected != null && !/^(driver|myteam):[0-2]$/.test(selected)) return { ok: false, reason: "bad-slot" };
    if (selected != null && o.expectedSelectionRevision != null && s && s.keyRevision
        && o.expectedSelectionRevision !== s.keyRevision("careerSlot")) return { ok: false, reason: "conflict" };
    const expected = o.expectedRevisions || {};
    const written = [];
    let failed = 0;
    const skipped = [];

    // Snapshot disk first so a mid-apply conflict can leave nothing half-done
    // for the slots we intended to touch — we write only after every check.
    const plan = [];
    for (let i = 0; i < envelope.slots.length; i++) {
      const row = envelope.slots[i];
      if (!row) continue;
      const f = flavourIn(row.flavour);
      const idx = slotIn(row.i);
      if (allowed.indexOf(f) === -1) { skipped.push(f + ":" + idx); continue; }
      const id = f + ":" + idx;
      const chk = slotPayloadOk(row.data, row.flavour);
      if (!chk.ok) return chk;
      // An empty row is "nothing to restore", never "delete": build() exports
      // all six slots, so writing its nulls wiped saves the backup never had.
      if (row.data == null) { skipped.push(id); continue; }
      if (Object.prototype.hasOwnProperty.call(expected, id)) {
        const now = revisionOf(f, idx);
        if (expected[id] !== now) return { ok: false, reason: "conflict", slot: id };
      }
      if (liveConflict(f, idx)) return { ok: false, reason: "conflict", slot: id };
      plan.push({ f: f, i: idx, data: row.data, id: id });
    }

    for (let p = 0; p < plan.length; p++) {
      const step = plan[p];
      const id = step.id;
      const exp = Object.prototype.hasOwnProperty.call(expected, id) ? expected[id] : revisionOf(step.f, step.i);
      // Re-check revision immediately before write (race with another tab).
      if (exp != null && revisionOf(step.f, step.i) !== exp) {
        return { ok: false, reason: "conflict", slot: id, written: written };
      }
      if (liveConflict(step.f, step.i)) {
        return { ok: false, reason: "conflict", slot: id, written: written };
      }
      const result = writeSlot(step.f, step.i, step.data, exp);
      if (!result.ok || result.reason === "conflict") {
        return { ok: false, reason: result.reason || "write-failed", slot: id, written: written };
      }
      if (result.durable === false) failed++;
      written.push(id);
    }

    // The legacy all-careers file also restores its selected slot. Preflight
    // that revision above, before any slot writes; keep selection on failure.
    let selectionWritten = false;
    if (selected != null && s && !failed) {
      selectionWritten = s.set("careerSlot", selected) !== false;
      if (!selectionWritten) failed++;
    }
    const identity = [];
    let seasonWritten = false;
    // The second mode confirmation must not replay already-restored global progress.
    // MY TEAM identity still accompanies its slot on that confirmation.
    const progressExtras = o.includeExtras !== false && o.includeProgressExtras !== false;
    if (s && typeof s.write === "function") {
      // validate() proved every extra cleans; what is written is the cleaned copy.
      const extra = (k) => (envelope[k] != null && isObj(envelope[k]) && progressExtras ? cleanExtra(k, envelope[k]).value : null);
      const season = extra("season");
      if (season && !seasonAhead(s.get("season", null), season)) {
        s.write("season", season);
        seasonWritten = true;
      }
      const badges = extra("badges");
      if (badges) s.write("badges", mergeBadges(s.get("badges", null), badges));
      const daily = extra("daily");
      if (daily) s.write("daily.v1", mergeDaily(s.get("daily.v1", null), daily));
      const records = extra("records");
      if (records) s.write("records", mergeRecords(s.get("records", null), records));
      // Identity only with a MY TEAM slot actually written; a key the backup
      // lacks (or carries malformed) leaves the local value alone.
      if (isObj(envelope.myTeam) && o.includeExtras !== false
          && written.some(function (id) { return id.indexOf("myteam:") === 0; })) {
        for (const k of IDENTITY_KEYS) {
          if (!Object.prototype.hasOwnProperty.call(envelope.myTeam, k)) continue;
          const v = identityValue(k, envelope.myTeam[k]);
          // An all-garbage livery list cleans to [] — that is not a restore.
          if (v === undefined || (Array.isArray(v) && !v.length)) continue;
          s.write(k, v);
          identity.push(k);
        }
        // custom-team.js re-syncs Teams.LIST / the logo only on a foreign
        // change (its own saves sync directly); this restore is one, announced
        // like the durable mirror's (store.js: foreign + restored).
        if (typeof s._notify === "function") {
          for (const k of identity) s._notify({ key: k, foreign: true, clear: false, restored: true });
        }
      }
    }

    if (typeof Career !== "undefined" && Career && Career.load) Career.load({ persist: false });
    // The write above bumped the season key's revision under SeasonCal's armed one,
    // so its next save() read as a conflict and the title kept showing the old
    // championship until something re-entered SEASON. Re-arm it from the store.
    if (seasonWritten && typeof SeasonCal !== "undefined" && SeasonCal && SeasonCal.load) {
      try { SeasonCal.load(); } catch (e) { log("warn", "career backup: SeasonCal.load failed: " + ((e && e.message) || e)); }
    }
    log("info", "career backup imported " + written.length + " slot(s)");
    return {
      ok: true,
      written: written,
      failed: failed,
      selectionWritten: selectionWritten,
      skipped: skipped,
      identity: identity,
      reason: null,
      needsConfirm: pendingOther,
    };
  }

  function wipeAllSlots() {
    const s = store();
    if (!s) return { ok: false, reason: "no-store" };
    for (const f of FLAVOURS) {
      for (let i = 0; i < SLOTS; i++) {
        if (typeof s.write === "function") s.write(slotKey(f, i), null);
        else s.set(slotKey(f, i), null);
      }
    }
    if (typeof Career !== "undefined" && Career && Career.load) Career.load();
    return { ok: true };
  }

  return {
    FORMAT: FORMAT,
    MAX_BYTES: MAX_BYTES,
    FLAVOURS: FLAVOURS,
    SLOTS: SLOTS,
    build: build,
    serialize: serialize,
    download: download,
    exportAll: exportAll,
    validate: validate,
    apply: apply,
    writeSlot: writeSlot,
    otherFlavourPending: otherFlavourPending,
    wipeAllSlots: wipeAllSlots,
    revisionOf: revisionOf,
    slotKey: slotKey,
    IDENTITY_KEYS: IDENTITY_KEYS,
  };
})();
Object.freeze(CareerBackup);
