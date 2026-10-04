/* Apex 26 — CAREER BACKUP: versioned export/import of all six career slots
   (plus optional standalone season / badges / daily). Ghosts stay out.
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
  function slotPayloadOk(data) {
    if (data == null) return { ok: true };
    if (Array.isArray(data)) return { ok: false, reason: "slot-not-object" };
    if (!isObj(data)) return { ok: false, reason: "slot-not-object" };
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
    for (let i = 0; i < raw.slots.length; i++) {
      const row = raw.slots[i];
      if (!isObj(row)) return { ok: false, reason: "slot-row-not-object" };
      const f = flavourIn(row.flavour);
      if (row.flavour != null && row.flavour !== "driver" && row.flavour !== "myteam") {
        return { ok: false, reason: "bad-flavour" };
      }
      const idx = slotIn(row.i);
      if (row.i != null && (row.i | 0) !== idx) return { ok: false, reason: "bad-index" };
      const chk = slotPayloadOk(row.data);
      if (!chk.ok) return chk;
      void f;
    }
    if (raw.season != null && !isObj(raw.season)) return { ok: false, reason: "season-not-object" };
    if (raw.badges != null && !isObj(raw.badges)) return { ok: false, reason: "badges-not-object" };
    if (raw.daily != null && !isObj(raw.daily)) return { ok: false, reason: "daily-not-object" };
    if (raw.records != null && !isObj(raw.records)) return { ok: false, reason: "records-not-object" };
    // Ghosts must never ride along — refuse a file that smuggles them in.
    if (raw.ghost != null || raw.ghosts != null || raw["ghost.v1"] != null) {
      return { ok: false, reason: "ghosts-forbidden" };
    }
    return { ok: true, envelope: raw };
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
    if (Career.slotRevision) {
      const seen = Career.slotRevision(f, i);
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

    const expected = o.expectedRevisions || {};
    const written = [];
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
      const chk = slotPayloadOk(row.data);
      if (!chk.ok) return chk;
      if (Object.prototype.hasOwnProperty.call(expected, id)) {
        const now = revisionOf(f, idx);
        if (expected[id] !== now) return { ok: false, reason: "conflict", slot: id };
      }
      // An empty row is "nothing to restore", never "delete": build() exports
      // all six slots, so writing its nulls wiped saves the backup never had.
      if (row.data == null) { skipped.push(id); continue; }
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
      written.push(id);
    }

    const s = store();
    if (s && typeof s.write === "function") {
      if (envelope.season != null && isObj(envelope.season) && o.includeExtras !== false
          && !seasonAhead(s.get("season", null), envelope.season)) {
        s.write("season", envelope.season);
      }
      if (envelope.badges != null && isObj(envelope.badges) && o.includeExtras !== false) {
        s.write("badges", mergeBadges(s.get("badges", null), envelope.badges));
      }
      if (envelope.daily != null && isObj(envelope.daily) && o.includeExtras !== false) {
        s.write("daily.v1", envelope.daily);
      }
      if (envelope.records != null && isObj(envelope.records) && o.includeExtras !== false) {
        s.write("records", envelope.records);
      }
    }

    if (typeof Career !== "undefined" && Career && Career.load) Career.load();
    log("info", "career backup imported " + written.length + " slot(s)");
    return {
      ok: true,
      written: written,
      skipped: skipped,
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
  };
})();
Object.freeze(CareerBackup);
