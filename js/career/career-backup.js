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

  function versionOf(data) {
    if (!data || typeof SaveMigrate === "undefined" || !SaveMigrate.careerVersion) return null;
    return SaveMigrate.careerVersion(data.v);
  }
  function destinationVersionIssue(data) {
    if (!isObj(data) || !Object.prototype.hasOwnProperty.call(data, "v")) return null;
    const v = versionOf(data);
    if (v === null) return "invalid-version";
    return v > SaveMigrate.CAREER_V ? "newer-version" : null;
  }
  const inRange = (n, k) => Number.isFinite(n) && n >= 0 && n <= ((typeof SaveMigrate !== "undefined" && SaveMigrate.LIMITS || {})[k] ?? Infinity);
  function slotPayloadOk(data, rowFlavour) {
    if (data == null) return { ok: true };
    if (Array.isArray(data)) return { ok: false, reason: "slot-not-object" };
    if (!isObj(data)) return { ok: false, reason: "slot-not-object" };
    const version = versionOf(data);
    if (version === null) return { ok: false, reason: "invalid-version" };
    if (version > SaveMigrate.CAREER_V) return { ok: false, reason: "newer-version" };
    if (data.flavour != null && flavourIn(data.flavour) !== flavourIn(rowFlavour)) {
      return { ok: false, reason: "flavour-mismatch" };
    }
    if (Object.prototype.hasOwnProperty.call(data, "money")) {
      const m = data.money;
      if (typeof m === "number" && !Number.isFinite(m)) return { ok: false, reason: "nan-money" };
      if (m != null && typeof m !== "number" && typeof m !== "string") return { ok: false, reason: "nan-money" };
      if (typeof m === "string" && m !== "" && !Number.isFinite(Number(m))) return { ok: false, reason: "nan-money" };
      if (m != null && m !== "" && !inRange(Number(m), "MONEY_MAX")) return { ok: false, reason: "money-range" };
    }
    const rows = (a) => (Array.isArray(a) ? a.filter(isObj) : []);
    const pay = [data.deal && data.deal.salary, ...rows(data.offers).map((o) => o.salary),
      ...rows(data.roster).flatMap((d) => [d.salary, isObj(d.pending) ? d.pending.ask : null])];
    if (pay.some((v) => (typeof v === "number" || (typeof v === "string" && v !== "" && Number.isFinite(+v))) && !inRange(+v, "SALARY_MAX"))) return { ok: false, reason: "salary-range" };
    if (data.season != null && (typeof data.season !== "object" || Array.isArray(data.season))) {
      return { ok: false, reason: "season-not-object" };
    }
    if (data.driver != null && (typeof data.driver !== "object" || Array.isArray(data.driver))) {
      return { ok: false, reason: "driver-not-object" };
    }
    if (data.driver != null) {
      const d = data.driver;
      if (Object.prototype.hasOwnProperty.call(d, "name") && typeof d.name !== "string") {
        return { ok: false, reason: "driver-name" };
      }
      if (Object.prototype.hasOwnProperty.call(d, "code") && typeof d.code !== "string") {
        return { ok: false, reason: "driver-code" };
      }
      if (Object.prototype.hasOwnProperty.call(d, "num")
          && (typeof d.num !== "number" || !Number.isFinite(d.num))) {
        return { ok: false, reason: "driver-num" };
      }
    }
    if (data.fitted != null && (typeof data.fitted !== "object" || Array.isArray(data.fitted))) {
      return { ok: false, reason: "fitted-not-object" };
    }
    if (data.team != null && typeof data.team !== "string") return { ok: false, reason: "team-not-string" };
    if (data.team != null && typeof Teams !== "undefined" && Array.isArray(Teams.LIST)) {
      const team = Teams.LIST.find((t) => t && t.id === data.team);
      const fits = flavourIn(rowFlavour) === "myteam" ? data.team === "custom" : !!team && Teams.isReal(team);
      if (!fits) return { ok: false, reason: "unknown-team" };
    }
    if (isObj(data.season) && data.season.round != null) {
      const r = Number(data.season.round);
      const ids = data.season.calIds;
      const n = Math.max(Array.isArray(ids) ? ids.length : 0,
        typeof Tracks !== "undefined" && Array.isArray(Tracks.SEASON) ? Tracks.SEASON.length : 0);
      if (Number.isFinite(r) && n > 0 && r > n) return { ok: false, reason: "round-range" };
    }
    if (data.year != null && (typeof data.year !== "number" || !Number.isFinite(data.year))) {
      return { ok: false, reason: "year-not-number" };
    }
    const ct = data.myTeamIdentity && data.myTeamIdentity.customTeam;
    if (ct != null && (!isObj(ct) || (ct.name != null && typeof ct.name !== "string"))) {
      return { ok: false, reason: "custom-team-name" };
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
          const clone = JSON.parse(JSON.stringify(raw));
          data = migrate(clone) || clone;
          if (f === "myteam" && typeof CareerTeamIdentity !== "undefined") data.myTeamIdentity = data.myTeamIdentity ? CareerTeamIdentity.sanitize(data.myTeamIdentity) : CareerTeamIdentity.capture(store());
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
    const records = s.get("records", null);
    if (records != null) extras.records = JSON.parse(JSON.stringify(records));
    return extras;
  }

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
    return envelope;
  }

  function serialize(envelope) {
    return JSON.stringify(envelope, null, 2);
  }

  function download(envelope, filename) {
    const name = filename || ("apex26-career-backup-" + Date.now() + ".json");
    const text = typeof envelope === "string" ? envelope : serialize(envelope);
    const blob = new Blob([text], { type: "application/json" });
    if (typeof NativeDownload !== "undefined" && NativeDownload.viable && NativeDownload.viable()
        && typeof NativeDownload.saveBlob === "function") {
      return NativeDownload.saveBlob(blob, name).then(function () {
        return { ok: true, name: name };
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
    for (const k of EXTRA_KEYS) {
      if (envelope[k] == null) continue;
      const checked = cleanExtra(k, envelope[k]);
      if (!checked.ok) return Promise.resolve(checked);
    }
    if (new Blob([serialize(envelope)]).size > MAX_BYTES) {
      return Promise.resolve({ ok: false, reason: "too-large" });
    }
    return download(envelope).then(function (r) {
      return Object.assign({ envelope: envelope }, r || { ok: true });
    });
  }

  function validate(raw, rawText) {
    if (rawText != null) {
      const n = typeof rawText === "string" ? new Blob([rawText]).size
        : (rawText && rawText.byteLength) || 0;
      if (n > MAX_BYTES) return { ok: false, reason: "too-large" };
    }
    if (raw == null) return { ok: false, reason: "empty" };
    if (typeof raw === "string") {
      if (new Blob([raw]).size > MAX_BYTES) return { ok: false, reason: "too-large" };
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { return { ok: false, reason: "bad-json" }; }
      return validate(parsed, raw);
    }
    if (!isObj(raw)) return { ok: false, reason: "not-object" };
    try {
      if (new Blob([JSON.stringify(raw)]).size > MAX_BYTES) return { ok: false, reason: "too-large" };
    } catch (_) { return { ok: false, reason: "bad-json" }; }
    if (raw.format !== FORMAT) return { ok: false, reason: "wrong-format" };
    if (!Array.isArray(raw.slots)) return { ok: false, reason: "slots-not-array" };
    if (raw.slots.length > 12) return { ok: false, reason: "too-many-slots" };
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
    if (raw.myTeam != null && !isObj(raw.myTeam)) return { ok: false, reason: "myteam-not-object" };
    if (raw.myTeam && raw.myTeam.customTeam != null && (!isObj(raw.myTeam.customTeam)
        || (raw.myTeam.customTeam.name != null && typeof raw.myTeam.customTeam.name !== "string"))) {
      return { ok: false, reason: "custom-team-name" };
    }
    if (raw.ghost != null || raw.ghosts != null || raw["ghost.v1"] != null) {
      return { ok: false, reason: "ghosts-forbidden" };
    }
    return { ok: true, envelope: raw };
  }

  function recoveryEnvelope(raw, target, rawText) {
    if (!target || !FLAVOURS.includes(target.flavour) || !Number.isInteger(target.i) || target.i < 0 || target.i >= SLOTS) return { ok: false, reason: "bad-slot" };
    let clone, text;
    try {
      text = typeof raw === "string" ? raw : JSON.stringify(raw);
      if (!text || text.length > MAX_BYTES || new Blob([text]).size > MAX_BYTES || (rawText && new Blob([rawText]).size > MAX_BYTES)) return { ok: false, reason: "too-large" };
      clone = JSON.parse(text);
    } catch (_) { return { ok: false, reason: "bad-json" }; }
    if (!isObj(clone) || clone.format !== "apex26-recovery-v1") return { ok: false, reason: "wrong-format" };
    if (clone.career == null && clone.season == null) return { ok: false, reason: "empty-recovery" };
    const envelope = { format: FORMAT, slots: [] };
    if (clone.career != null) {
      const data = clone.career;
      if (!isObj(data)) return { ok: false, reason: "slot-not-object" };
      if (data.flavour != null && !FLAVOURS.includes(data.flavour)) return { ok: false, reason: "flavour-mismatch" };
      if ((data.flavour || "driver") !== target.flavour) return { ok: false, reason: "flavour-mismatch" };
      if (typeof SaveMigrate === "undefined" || !Number.isSafeInteger(SaveMigrate.CAREER_V)
        || (data.v != null && (SaveMigrate.careerVersion(data.v) === null || SaveMigrate.careerVersion(data.v) > SaveMigrate.CAREER_V))) return { ok: false, reason: "unsupported-version" };
      envelope.slots.push({ flavour: target.flavour, i: target.i, data });
    }
    const careerSeason = clone.career && clone.career.season;
    const knownCalendar = (ids) => Array.isArray(ids) && ids.length > 0 && ids.length <= 64
      && new Set(ids).size === ids.length && typeof Tracks !== "undefined" && Array.isArray(Tracks.LIST)
      && ids.every((id) => typeof id === "string" && Tracks.LIST.some((t) => t.id === id));
    if (careerSeason && careerSeason.calIds != null && !knownCalendar(careerSeason.calIds)) {
      return { ok: false, reason: "unsupported-calendar" };
    }
    for (const season of [clone.career && clone.career.season, clone.season]) {
      if (!season) continue;
      if (!isObj(season)) return { ok: false, reason: "season-not-object" };
      const ids = season.config && season.config.trackIds;
      if (ids != null && !knownCalendar(ids)) return { ok: false, reason: "unsupported-calendar" };
    }
    const careerAlias = isObj(careerSeason) && sameSeasonValue(careerSeason, clone.season);
    if (clone.season != null && !careerAlias) {
      const keys = ["round", "pts", "teamPts", "driverCodes", "finishes", "roundPts", "config", "stage", "lastFl", "seed", "qualiOrder", "qualiTrack", "qualiMode", "qualiSeat"];
      if (Object.keys(clone.season).some((k) => !keys.includes(k))) return { ok: false, reason: "unsupported-season" };
      if (clone.season.round != null && (!Number.isInteger(clone.season.round) || clone.season.round < 0 || clone.season.round > 200)) return { ok: false, reason: "season-invalid" };
      if (clone.season.config != null) {
        const config = clone.season.config;
        const configKeys = ["trackIds", "quali", "sprint", "sprintIds", "laps", "points", "flPoint", "drop"];
        if (!isObj(config) || Object.keys(config).some((k) => !configKeys.includes(k))) return { ok: false, reason: "unsupported-calendar" };
        const clean = cleanSeasonConfig(config);
        if (Object.keys(config).some((k) => JSON.stringify(config[k]) !== JSON.stringify(clean[k]))) return { ok: false, reason: "unsupported-calendar" };
      }
      if (clone.season.qualiOrder != null && typeof cleanQualifying !== "function") return { ok: false, reason: "unsupported-qualifying" };
      envelope.season = clone.season;
    }
    const checked = validate(envelope, rawText || text);
    return checked.ok ? { ok: true, envelope, recovery: true } : checked;
  }

  const EXTRA_MAX = 256 * 1024;
  const EXTRA_KEYS = Object.freeze(["season", "badges", "daily", "records"]);
  const DAY_RE = /^\d{4}-\d\d-\d\d$/;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,48}$/;
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function hostile() { const e = new Error("hostile"); e.hostile = true; return e; }
  function plain(o) {
    if (!isObj(o)) return null;
    if (own(o, "__proto__")) throw hostile();
    return o;
  }
  function num(v, lo, hi) { return typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi ? v : null; }
  const CLASS_KEY_MAX = 4096;
  function classKey(k) {
    return k.length > 0 && k.length <= CLASS_KEY_MAX && k !== "__proto__" && k !== "constructor" && k !== "prototype";
  }
  function idMap(raw, max, take, keyOk = (k) => ID_RE.test(k)) {
    const out = {};
    const src = plain(raw);
    if (!src) return out;
    let n = 0;
    for (const id of Object.keys(src)) {
      if (n >= max) break;
      if (!keyOk(id)) continue;
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
  function cleanQualifying(raw, out) {
    if (raw.qualiOrder == null) return;
    const order = raw.qualiOrder;
    if (!Array.isArray(order) || order.length > 120) throw new Error("invalid qualifying order");
    const seen = new Set();
    out.qualiOrder = Array.from(order, (row) => {
      const old = typeof row === "string", entry = old ? null : plain(row);
      const id = old ? row : entry && entry.id;
      if (typeof id !== "string" || !ID_RE.test(id) || seen.has(id)) throw new Error("invalid qualifying driver");
      seen.add(id);
      if (old) return id;
      const cleaned = { id };
      if (own(entry, "t")) {
        if (num(entry.t, 0, 1e6) == null) throw new Error("invalid qualifying time");
        cleaned.t = entry.t;
      }
      for (const key of ["human", "noTime"]) if (own(entry, key)) {
        if (typeof entry[key] !== "boolean") throw new Error("invalid qualifying flag");
        cleaned[key] = entry[key];
      }
      return cleaned;
    });
    const stamp = (key, valid) => {
      if (raw[key] == null) return;
      if (typeof raw[key] !== "string" || !valid(raw[key])) throw new Error("invalid qualifying stamp");
      out[key] = raw[key];
    };
    stamp("qualiTrack", (v) => ID_RE.test(v));
    stamp("qualiMode", (v) => /^(?:gp|season|career:(?:driver|myteam):[0-2])$/.test(v));
    stamp("qualiSeat", (v) => { const ids = v.split("|"); return ids.length === 2 && ids.every((id) => ID_RE.test(id)); });
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
    cleanQualifying(r, out);
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
      out.classes = idMap(e.classes, Infinity, (v) => cleanDayEntry(v, true), classKey);
    }
    return out;
  }
  function cleanDaily(raw) {
    const r = plain(raw);
    const out = {};
    if (isObj(r.days)) {
      const src = plain(r.days);
      const days = {};
      const dates = Object.keys(src).filter((k) => DAY_RE.test(k)).sort();
      for (const day of dates) {
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
  function cleanExtra(name, raw) {
    try {
      const incoming = new Blob([JSON.stringify(raw)]).size;
      const limit = name === "daily" ? MAX_BYTES : EXTRA_MAX;
      if (incoming > limit) return { ok: false, reason: name + "-too-large" };
      const value = CLEANERS[name](raw);
      const kept = new Blob([JSON.stringify(value)]).size;
      if (kept > limit || (name === "daily" && incoming - kept > EXTRA_MAX)) {
        return { ok: false, reason: name + "-too-large" };
      }
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

  function writeSlot(f, i, data, expectedRevision) {
    return writeSlotValue(f, i, data, expectedRevision, false);
  }
  function undoRequired(s, key) {
    return typeof CareerRestorePoints !== "undefined" && s.get(key, null) != null;
  }
  function writeSlotValue(f, i, data, expectedRevision, prepared) {
    const s = store();
    if (!s) return { ok: false, durable: false, reason: "no-store" };
    if (s.careerWriteStatus && !s.careerWriteStatus().ok) return s.careerWriteStatus();
    const key = slotKey(f, i);
    const versionIssue = destinationVersionIssue(s.get(key, null));
    if (versionIssue) return { ok: false, durable: false, reason: versionIssue };
    if (expectedRevision != null && s.keyRevision && expectedRevision !== s.keyRevision(key)) {
      return { ok: false, durable: false, reason: "conflict" };
    }
    if (liveConflict(f, i)) return { ok: false, durable: false, reason: "conflict" };
    if (!prepared && undoRequired(s, key)) return { ok: false, durable: false, reason: "undo-required" };
    let value = null;
    if (data != null) {
      const clone = JSON.parse(JSON.stringify(data));
      const migrated = prepared ? clone : migrate(clone);
      if (!migrated) return { ok: false, durable: false, reason: "migrate-failed" };
      value = migrated;
    }
    const result = typeof s.write === "function" ? s.write(key, value) : { ok: true, durable: s.set(key, value) !== false, reason: null };
    if (result.ok && typeof Career !== "undefined" && Career) {
      const live = Career.slot && Career.slot();
      if (live && live.flavour === f && live.i === i && Career.useSlot) {
        Career.useSlot(f, i);
      }
    }
    return result;
  }

  function seasonPts(sz) {
    let n = 0;
    if (isObj(sz.pts)) for (const k of Object.keys(sz.pts)) n += Number.isFinite(sz.pts[k]) ? sz.pts[k] : 0;
    return n;
  }
  function sameSeasonValue(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => own(b, k) && sameSeasonValue(a[k], b[k]));
  }
  function completeSeasonGrid(order, seat) {
    if (typeof Teams === "undefined" || !Teams.isReal || !Array.isArray(Teams.LIST)) return false;
    if (!Teams.LIST.some(team => team.id === seat[1])) return false;
    const ids = new Set(order.map(row => typeof row === "string" ? row : row.id));
    if (!ids.has(seat[0]) || !seat[0].startsWith(seat[1] + ":")) return false;
    let count = 0;
    for (const team of Teams.LIST) if (Teams.isReal(team) || team.id === seat[1]) {
      const n = Array.isArray(team.drivers) ? (team.legends ? Math.min(1, team.drivers.length) : team.drivers.length) : 0;
      if (!n) return false;
      for (let i = 0; i < n; i++) if (!ids.has(team.id + ":" + i)) return false;
      count += n;
    }
    return ids.size === count;
  }
  function qualifyingAhead(local, incoming) {
    if (incoming.qualiOrder != null && (!Array.isArray(incoming.qualiOrder) || incoming.qualiOrder.length)) return false;
    const a = cleanExtra("season", local), b = cleanExtra("season", incoming);
    if (!a.ok || !b.ok) return false;
    const mine = a.value, theirs = b.value, order = mine.qualiOrder;
    if (!order || !order.length || mine.qualiMode !== "season" || !mine.qualiSeat
        || !mine.config || !mine.config.quali || mine.qualiTrack !== mine.config.trackIds[mine.round]) return false;
    const seat = mine.qualiSeat.split("|");
    if (!completeSeasonGrid(order, seat)) return false;
    for (const key of ["qualiTrack", "qualiMode", "qualiSeat"]) {
      if (incoming[key] != null && incoming[key] !== mine[key]) return false;
    }
    if (incoming.seed != null && incoming.seed !== mine.seed) return false;
    if (local.seed != null && local.seed !== mine.seed) return false;
    for (const key of ["qualiOrder", "qualiTrack", "qualiMode", "qualiSeat", "seed"]) {
      delete mine[key]; delete theirs[key];
    }
    return sameSeasonValue(mine, theirs);
  }
  function seasonAhead(local, incoming) {
    if (!isObj(local)) return false;
    if (isObj(incoming)) { const c = cleanExtra("season", incoming); if (c && c.value) incoming = Object.assign({}, incoming, { round: c.value.round }); }
    const a = local.round | 0, b = incoming.round | 0;
    return a !== b ? a > b : seasonPts(local) > seasonPts(incoming)
      || qualifyingAhead(local, incoming) || sprintAhead(local, incoming);
  }
  function sprintAhead(local, incoming) {
    if (local.stage !== "race" || incoming.stage === "race") return false;
    const a = cleanExtra("season", local), b = cleanExtra("season", incoming);
    if (!a.ok || !b.ok) return false;
    const mine = a.value, theirs = b.value, c = mine.config;
    const id = c && c.trackIds[mine.round];
    if (!id || !(c.sprint === true || (c.sprint === "rounds" && c.sprintIds.includes(id)))
        || !sameSeasonValue(c, theirs.config) || mine.round !== theirs.round) return false;
    if ((incoming.seed != null && incoming.seed !== mine.seed)
        || (local.seed != null && local.seed !== mine.seed)) return false;
    const nonzero = (map) => Object.fromEntries(Object.entries(map).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        value = value.slice();
        while (value.length && !value[value.length - 1]) value.pop();
      }
      return (Array.isArray(value) ? value.length : value) ? [[key, value]] : [];
    }));
    for (const key of ["pts", "teamPts", "finishes", "roundPts"]) {
      if (!sameSeasonValue(nonzero(mine[key]), nonzero(theirs[key]))) return false;
      delete mine[key]; delete theirs[key];
    }
    for (const id of Object.keys(theirs.driverCodes)) if (mine.driverCodes[id] !== theirs.driverCodes[id]) return false;
    for (const key of ["stage", "seed", "driverCodes", "qualiOrder", "qualiTrack", "qualiMode", "qualiSeat"]) {
      delete mine[key]; delete theirs[key];
    }
    return sameSeasonValue(mine, theirs);
  }

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
  function mergeRecords(local, incoming) {
    return isObj(local) ? Object.assign({}, incoming, local) : incoming;
  }

  function preview(envelope, opts) {
    const o = opts || {}, checked = validate(envelope);
    if (!checked.ok) return checked;
    const focus = o.focusFlavour != null ? flavourIn(o.focusFlavour) : null;
    const allowed = o.flavours ? o.flavours.map(flavourIn)
      : (focus && !o.otherFlavourConfirmed ? [focus] : FLAVOURS);
    const slots = envelope.slots.filter(r => r.data != null && allowed.includes(flavourIn(r.flavour)))
      .map(r => ({ flavour: flavourIn(r.flavour), i: slotIn(r.i),
        current: readSlotRaw(flavourIn(r.flavour), slotIn(r.i)), incoming: r.data }));
    const extras = [], s = store();
    if (o.includeExtras !== false && o.includeProgressExtras !== false) {
      if (envelope.season != null) extras.push(seasonAhead(s && s.get("season", null), envelope.season)
        ? "Standalone season: keep newer local progress" : "Standalone season: restore backup progress");
      if (envelope.badges != null) extras.push("Licence badges: combine earned badges");
      if (envelope.daily != null) extras.push("Daily challenges: combine best laps and streaks");
      if (envelope.records != null) extras.push("Records: add missing entries");
    }
    if (slots.some(r => r.flavour === "myteam")) extras.push("MY TEAM identity: restore separately with each imported career; other careers and one-off GP appearance are preserved");
    return { ok: true, slots, extras };
  }

  const DRY = 1, UNDO_READY = 2;
  function apply(envelope, opts) { return applyCore(envelope, opts, 0); }
  function ownLiveSave(step, pinned, foreign) {
    if (foreign.all || foreign.keys.has(slotKey(step.f, step.i))) return false;
    if (typeof Career === "undefined" || !Career || !Career.slot || !Career.armedRevision) return false;
    const live = Career.slot();
    if (!live || live.flavour !== step.f || live.i !== step.i || (Career.conflicted && Career.conflicted())) return false;
    const now = revisionOf(step.f, step.i);
    return now != null && now !== pinned && Career.armedRevision() === now;
  }
  function refusedCapture(step, saved) {
    if (saved && saved.ok) return null;
    log("warn", "career backup: import refused, no restore point for " + step.id + " (" + ((saved && saved.reason) || "capture-failed") + ")");
    return { ok: false, durable: false, reason: "undo-unavailable", detail: (saved && saved.reason) || "capture-failed", slot: step.id, written: [] };
  }
  async function applyWithUndo(envelope, opts) {
    const o = opts || {};
    const dry = applyCore(envelope, o, DRY);
    if (!dry.ok) return dry;
    const s = store(), expected = Object.assign({}, o.expectedRevisions);
    const foreign = { all: false, keys: new Set() };
    const unsubscribe = s && s.subscribe ? s.subscribe((ch) => {
      if (!ch || !ch.foreign) return;
      if (ch.clear) foreign.all = true;
      if (typeof ch.key === "string") foreign.keys.add(ch.key);
      if (Array.isArray(ch.keys)) for (const k of ch.keys) foreign.keys.add(k);
    }) : null;
    try {
      const captured = [];
      const previousOf = (step) => s && typeof CareerRestorePoints !== "undefined" ? s.get(slotKey(step.f, step.i), null) : null;
      for (let round = 0; round < 4; round++) {
        const steps = round === 0 ? dry.plan : captured.filter((step) => ownLiveSave(step, expected[step.id], foreign));
        if (!steps.length) break;
        for (const step of steps) {
          if (round === 0) { if (!own(expected, step.id)) expected[step.id] = revisionOf(step.f, step.i); }
          else { log("info", "career backup: live career saved " + step.id + " during its restore point; capturing it again"); expected[step.id] = revisionOf(step.f, step.i); }
          const previous = previousOf(step);
          if (previous == null) continue;
          if (round === 0) captured.push(step);
          let saved;
          try { saved = await CareerRestorePoints.capture(step.f, step.i, previous, { reason: "before-import" }); } catch (_) { saved = null; }
          const refused = refusedCapture(step, saved);
          if (refused) return refused;
        }
      }
      return applyCore(envelope, Object.assign({}, o, { expectedRevisions: expected }), UNDO_READY);
    } finally {
      if (unsubscribe) unsubscribe();
    }
  }

  function applyCore(envelope, opts, mode) {
    const o = opts || {};
    const checked = validate(envelope, o.rawText);
    if (!checked.ok) return checked;

    const focus = o.focusFlavour != null ? flavourIn(o.focusFlavour) : null;
    const allowed = o.flavours
      ? o.flavours.map(flavourIn)
      : (focus && !o.otherFlavourConfirmed ? [focus] : FLAVOURS.slice());
    const pendingOther = !!(focus && !o.otherFlavourConfirmed && otherFlavourPending(envelope, focus));

    const s = store();
    if (s && s.careerWriteStatus && !s.careerWriteStatus().ok) return s.careerWriteStatus();
    const selected = o.liveSlot;
    if (o.recovery && envelope.season != null && o.expectedSeasonRevision != null && s && s.keyRevision
      && o.expectedSeasonRevision !== s.keyRevision("season")) return { ok: false, reason: "conflict" };
    if (selected != null && !/^(driver|myteam):[0-2]$/.test(selected)) return { ok: false, reason: "bad-slot" };
    if (selected != null && o.expectedSelectionRevision != null && s && s.keyRevision
        && o.expectedSelectionRevision !== s.keyRevision("careerSlot")) return { ok: false, reason: "conflict" };
    const expected = o.expectedRevisions || {};
    const written = [];
    let failed = 0;
    const issues = [], applied = [];
    const recordWrite = (key, result) => {
      if (result && result.ok !== false) applied.push(key);
      if (!result || result.ok === false || result.durable === false) {
        failed++;
        issues.push({ key, reason: (result && result.reason) || "write-failed", rejected: !result || result.ok === false });
      }
      return result;
    };
    const skipped = [];

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
      if (row.data == null) { skipped.push(id); continue; }
      const versionIssue = s && destinationVersionIssue(s.get(slotKey(f, idx), null));
      if (versionIssue) return { ok: false, reason: versionIssue, slot: id };
      if (Object.prototype.hasOwnProperty.call(expected, id)) {
        const now = revisionOf(f, idx);
        if (expected[id] !== now) return { ok: false, reason: "conflict", slot: id };
      }
      if (liveConflict(f, idx)) return { ok: false, reason: "conflict", slot: id };
      if (mode === 0 && s && undoRequired(s, slotKey(f, idx))) return { ok: false, durable: false, reason: "undo-required", slot: id };
      let data;
      try {
        data = migrate(JSON.parse(JSON.stringify(row.data)));
        if (!data) return { ok: false, reason: "migrate-failed", slot: id };
        if (f === "myteam" && typeof CareerTeamIdentity !== "undefined") data.myTeamIdentity = CareerTeamIdentity.sanitize(data.myTeamIdentity || envelope.myTeam || CareerTeamIdentity.capture(s));
      } catch (_) { return { ok: false, reason: "migrate-failed", slot: id }; }
      plan.push({ f: f, i: idx, data, id: id });
    }

    let mergedDaily = null;
    if (s && typeof s.write === "function" && envelope.daily != null
        && o.includeExtras !== false && o.includeProgressExtras !== false) {
      const rawLocal = s.get("daily.v1", null);
      const local = cleanExtra("daily", isObj(rawLocal) ? rawLocal : {});
      if (!local.ok) return local;
      const incoming = cleanExtra("daily", envelope.daily);
      if (!incoming.ok) return incoming;
      const merged = cleanExtra("daily", mergeDaily(local.value, incoming.value));
      if (!merged.ok) return merged;
      mergedDaily = merged.value;
    }
    if (mode === DRY) return { ok: true, plan };

    for (let p = 0; p < plan.length; p++) {
      const step = plan[p];
      const id = step.id;
      const exp = Object.prototype.hasOwnProperty.call(expected, id) ? expected[id] : revisionOf(step.f, step.i);
      if (exp != null && revisionOf(step.f, step.i) !== exp) {
        return { ok: false, reason: "conflict", slot: id, written: written };
      }
      if (liveConflict(step.f, step.i)) {
        return { ok: false, reason: "conflict", slot: id, written: written };
      }
      const result = writeSlotValue(step.f, step.i, step.data, exp, true);
      if (!result.ok || result.reason === "conflict") {
        return { ok: false, reason: result.reason || "write-failed", slot: id, written: written };
      }
      recordWrite(slotKey(step.f, step.i), result);
      written.push(id);
    }

    let selectionWritten = false;
    if (selected != null && s && !failed) {
      const result = recordWrite("careerSlot", typeof s.write === "function" ? s.write("careerSlot", selected)
        : { ok: true, durable: s.set("careerSlot", selected) !== false });
      selectionWritten = !!result && result.ok !== false;
    }
    const identity = [];
    let seasonWritten = false;
    const progressExtras = o.includeExtras !== false && o.includeProgressExtras !== false && !(o.recovery && failed);
    if (s && typeof s.write === "function") {
      const extra = (k) => (envelope[k] != null && isObj(envelope[k]) && progressExtras ? cleanExtra(k, envelope[k]).value : null);
      const season = extra("season");
      if (season && !seasonAhead(s.get("season", null), envelope.season)) {
        recordWrite("season", s.write("season", season));
        seasonWritten = true;
      }
      const badges = extra("badges");
      if (badges) recordWrite("badges", s.write("badges", mergeBadges(s.get("badges", null), badges)));
      if (mergedDaily && progressExtras) recordWrite("daily.v1", s.write("daily.v1", mergedDaily));
      const records = extra("records");
      if (records) recordWrite("records", s.write("records", mergeRecords(s.get("records", null), records)));

    }

    if (!o.recovery && typeof Career !== "undefined" && Career && Career.load) Career.load({ persist: false });
    if (seasonWritten && typeof SeasonCal !== "undefined" && SeasonCal && SeasonCal.load) {
      try { SeasonCal.load(); } catch (e) { log("warn", "career backup: SeasonCal.load failed: " + ((e && e.message) || e)); }
    }
    log("info", "career backup imported " + written.length + " slot(s)");
    return {
      ok: !issues.some(r => r.rejected),
      durable: failed === 0,
      issues,
      applied,
      written: written,
      failed: failed,
      selectionWritten: selectionWritten,
      skipped: skipped,
      identity: identity,
      reason: issues.length ? issues[0].reason : null,
      needsConfirm: pendingOther,
    };
  }

  function wipeAllSlots() {
    const s = store();
    if (!s) return { ok: false, reason: "no-store" };
    if (s.careerWriteStatus && !s.careerWriteStatus().ok) return s.careerWriteStatus();
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
    build: build,
    serialize: serialize,
    download: download,
    exportAll: exportAll,
    validate: validate,
    recoveryEnvelope: recoveryEnvelope,
    apply: apply,
    applyWithUndo: applyWithUndo,
    preview: preview,
    writeSlot: writeSlot,
    wipeAllSlots: wipeAllSlots,
    revisionOf: revisionOf,
  };
})();
Object.freeze(CareerBackup);
