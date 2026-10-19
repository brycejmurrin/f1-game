/* share-code.test.mjs — APXS/APXL/APXD envelopes, #share= staging, Continue hints.
 *
 * Run: node --test tests/unit/share-code.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "js/ui/share-code.js";
const j = (v) => JSON.parse(JSON.stringify(v));

function harness(opts = {}) {
  const bag = new Map();
  const store = {
    get(k, d) { return bag.has(k) ? bag.get(k) : d; },
    set(k, v) { bag.set(k, v); return true; },
  };
  const writes = [];
  const location = {
    origin: "https://example.test",
    pathname: "/f1-game/",
    href: opts.href || "https://example.test/f1-game/",
    hash: opts.hash || "",
  };
  const history = {
    state: { keep: true },
    replaceState(state, _title, href) {
      writes.push({ state, href });
      location.href = href;
      location.hash = new URL(href).hash;
    },
  };
  const sandbox = {
    module: { exports: {} },
    TextEncoder,
    TextDecoder,
    Uint8Array,
    btoa,
    atob,
    URL,
    location,
    history,
    Teams: { LIST: (opts.teams || ["mercedes", "ferrari"]).map((id) => ({ id })) },
    Liveries: { forTeam: () => (opts.catalog || ["default"]).map((id) => ({ id })) },
    Tracks: {
      LIST: (opts.tracks || ["monza", "spa"]).map((id) => ({ id, name: id.toUpperCase() })),
      SEASON: (opts.tracks || ["monza", "spa"]).map((id) => ({ id, name: id.toUpperCase() })),
    },
    Career: {
      data: () => opts.career || null,
      load: () => opts.career || null,
      ...(opts.calendar ? { calendar: () => opts.calendar.map((id) => ({ id, name: id.toUpperCase() })) } : {}),
    },
    DailyChallenge: {
      prevDay: (day) => {
        const d = new Date(day + "T00:00:00Z");
        d.setUTCDate(d.getUTCDate() - 1);
        return d.toISOString().slice(0, 10);
      },
      plan: (day) => ({ day, trackId: "monza", trackName: "Monza" }),
    },
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/car/custom-liveries.js"), "utf8"), ctx, { filename: "js/car/custom-liveries.js" });
  vm.runInContext(fs.readFileSync(path.join(ROOT, SRC), "utf8"), ctx, { filename: SRC });
  const ShareCode = sandbox.module.exports || vm.runInContext("ShareCode", ctx);
  return { ShareCode, store, bag, location, writes, sandbox };
}

test("setup encode/decode round-trip", () => {
  const { ShareCode } = harness();
  const tune = { arbF: 7, arbR: 6, rideF: 22, rideR: 62, brakeBias: 56 };
  const encoded = ShareCode.encode("setup", { team: "mercedes", tune });
  assert.equal(encoded.ok, true);
  assert.match(encoded.code, /^APXS1\.p\.[A-Za-z0-9_-]+$/);
  assert.equal(encoded.url, "https://example.test/f1-game/#share=" + encoded.code);
  const decoded = ShareCode.decode(encoded.code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.kind, "setup");
  assert.equal(decoded.team, "mercedes");
  assert.deepEqual(j(decoded.tune), tune);
});

test("livery encode/decode keeps colours", () => {
  const { ShareCode } = harness();
  const liv = { id: "mine", name: "Mine", c1: [1, 0, 0], c2: [0, 0, 1], finish: "gloss" };
  const encoded = ShareCode.encode("livery", { team: "ferrari", id: "mine", livery: liv });
  assert.equal(encoded.ok, true);
  assert.match(encoded.code, /^APXL1\.p\./);
  const decoded = ShareCode.decode(encoded.code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.team, "ferrari");
  assert.equal(decoded.id, "mine");
  assert.deepEqual(j(decoded.livery.c1), [1, 0, 0]);
});

test("daily encode/decode", () => {
  const { ShareCode } = harness();
  const encoded = ShareCode.encode("daily", {
    day: "2026-10-10", track: "monza", trackName: "Monza", weather: "dry",
    best: 81.234, medal: "gold", streak: 3, class: "standard",
  });
  assert.equal(encoded.ok, true);
  assert.match(encoded.code, /^APXD1\.p\./);
  const decoded = ShareCode.decode(encoded.code);
  assert.equal(decoded.ok, true);
  assert.equal(decoded.day, "2026-10-10");
  assert.equal(decoded.best, 81.234);
  assert.equal(decoded.streak, 3);
});

test("corrupt and unknown-team codes are refused", () => {
  const { ShareCode } = harness();
  assert.equal(ShareCode.decode("APXS1.p.not-valid").ok, false);
  const bad = ShareCode.encode("setup", { team: "imaginary", tune: { arbF: 1, arbR: 1, rideF: 15, rideR: 40, brakeBias: 50 } });
  assert.equal(bad.ok, false);
});

test("apply setup writes store and never calls startRace", () => {
  const { ShareCode, store } = harness();
  const encoded = ShareCode.encode("setup", {
    team: "mercedes",
    tune: { arbF: 8, arbR: 5, rideF: 20, rideR: 60, brakeBias: 55 },
  });
  const decoded = ShareCode.decode(encoded.code);
  let starts = 0;
  let garage = 0;
  const applied = ShareCode.apply(decoded, {
    store,
    startRace: () => { starts++; },
    openGarage: () => { garage++; },
    selectTeam: () => {},
  });
  assert.equal(applied.ok, true);
  assert.equal(starts, 0);
  assert.equal(garage, 1);
  assert.deepEqual(store.get("setup.mercedes"), decoded.tune);
});

test("hash consumer clears #share= and does not invoke startRace", async () => {
  const { ShareCode, store, location, writes } = harness();
  const encoded = ShareCode.encode("livery", {
    team: "ferrari", id: "default",
  });
  location.hash = "#share=" + encoded.code;
  location.href = "https://example.test/f1-game/" + location.hash;
  let starts = 0;
  const result = await ShareCode.consumeHash({
    apply: (decoded) => ShareCode.apply(decoded, {
      store,
      startRace: () => { starts++; },
      openGarage: () => {},
      selectTeam: () => {},
    }),
  });
  assert.equal(result.ok, true);
  assert.equal(starts, 0);
  assert.equal(writes.length, 1);
  assert.equal(new URL(writes[0].href).hash, "");
});

test("title-flow source never calls startRace from share apply hooks", () => {
  const src = fs.readFileSync(path.join(ROOT, "js/ui/title-flow.js"), "utf8");
  assert.match(src, /ShareCode\.consumeHash/);
  assert.match(src, /startRace:\s*\(\)\s*=>\s*\{\s*started\.n\+\+;?\s*\}/);
  assert.doesNotMatch(src, /openDaily:\s*\([^)]*\)\s*=>\s*\{[^}]*G\.startRace/);
});

test("lastSession round-trips and continueHint prefers career then daily then session", () => {
  const { ShareCode, store } = harness({ career: null });
  assert.equal(ShareCode.recordSession(store, { trackId: "spa", session: "tt", trackName: "Spa" }), true);
  const last = ShareCode.lastSession(store);
  assert.equal(last.trackId, "spa");
  assert.equal(last.session, "tt");

  const withCareer = harness({
    career: { year: 2026, season: { round: 2 }, team: "mercedes", flavour: "driver" },
  });
  const hintC = withCareer.ShareCode.continueHint({
    store: withCareer.store,
    daily: null,
  });
  assert.equal(hintC.kind, "career");

  const day = new Date().toISOString().slice(0, 10);
  const withDaily = harness({ career: null });
  withDaily.ShareCode.recordSession(withDaily.store, { trackId: "spa", session: "race" });
  const hintD = withDaily.ShareCode.continueHint({
    store: withDaily.store,
    daily: {
      dayKey: () => day,
      data: () => ({ days: {}, streak: { count: 4, last: day } }),
      liveStreak: () => 4,
      today: () => null,
    },
  });
  assert.equal(hintD.kind, "daily");
  assert.match(hintD.sub, /STREAK 4/);

  const hintS = withDaily.ShareCode.continueHint({
    store: withDaily.store,
    daily: {
      dayKey: () => day,
      data: () => ({ days: { [day]: { best: 80, laps: 1 } }, streak: { count: 4, last: day } }),
      liveStreak: () => 4,
      today: () => ({ best: 80, laps: 1 }),
    },
  });
  assert.equal(hintS.kind, "session");
});

// #2160: the career CONTINUE subtitle named Tracks.SEASON (the build's calendar), so a
// save stamped with another calendar showed a different circuit and round count from
// the career hub, which reads Career.calendar().
test("career continueHint names the save's own calendar, not the build's Tracks.SEASON", () => {
  const { ShareCode, store } = harness({
    tracks: ["monza", "spa", "suzuka", "imola"],
    calendar: ["imola", "suzuka", "baku"],
    career: { year: 2026, season: { round: 1 }, team: "mercedes", flavour: "driver" },
  });
  const hint = ShareCode.continueHint({ store, daily: null });
  assert.equal(hint.kind, "career");
  assert.equal(hint.sub, "2026 · ROUND 2 · SUZUKA", "calendar()[round] and its own round count");
  const last = harness({
    tracks: ["monza", "spa", "suzuka", "imola"],
    calendar: ["imola", "suzuka"],
    career: { year: 2026, season: { round: 2 }, team: "mercedes", flavour: "driver" },
  });
  assert.equal(last.ShareCode.continueHint({ store: last.store, daily: null }).sub, "2026 · ROUND 2 · SUZUKA",
    "a finished season clamps to calendar().length, not Tracks.SEASON.length");
});

// #2155: an unfinished YESTERDAY daily card staged TODAY's daily (title-menu dropped hint.day,
// and every other path — share codes, the picker chip — deliberately replays only today).
// The card is retired: CONTINUE never offers a past day it cannot open.
test("continueHint never offers yesterday's daily", () => {
  const day = new Date().toISOString().slice(0, 10);
  const d = new Date(day + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - 1);
  const y = d.toISOString().slice(0, 10);
  const h = harness({ career: null });
  const daily = (streak) => ({
    dayKey: () => day,
    data: () => ({ days: { [y]: { best: null, laps: 3 } }, streak: { count: streak, last: y } }),
    liveStreak: () => streak,
    today: () => null,
  });
  const none = h.ShareCode.continueHint({ store: h.store, daily: daily(0) });
  assert.equal(none, null, "no streak and no last session: no CONTINUE card");
  const live = h.ShareCode.continueHint({ store: h.store, daily: daily(2) });
  assert.equal(live.kind, "daily");
  assert.equal(live.day, day, "the daily CONTINUE card is today's, which is what openDailyPicker() opens");
  assert.doesNotMatch(live.sub, /YESTERDAY/);
});

// Round-3 hunt 6-F1: the livery branch did next.slice(0, 32) — a player with 40 custom
// liveries lost 33–40 for good and the shared one (appended last) was cut too, while the
// pick pointed at it and the toast said "Livery loaded". At the cap it now refuses whole.
test("a livery code never trims the player's customs; at the cap it refuses honestly", async () => {
  const { ShareCode, store, location } = harness();
  const mine = Array.from({ length: 40 }, (_, i) => ({ id: "c" + i, c1: [1, 0, 0], c2: [0, 0, 1] }));
  store.set("livery.custom.ferrari", mine);
  store.set("livery.ferrari", "c3");
  const shared = { id: "custom_friend", c1: [0, 1, 0], c2: [1, 1, 1] };
  const encoded = ShareCode.encode("livery", { team: "ferrari", id: shared.id, livery: shared });
  location.hash = "#share=" + encoded.code;
  location.href = "https://example.test/f1-game/" + location.hash;
  const notices = [];
  await ShareCode.consumeHash({
    apply: (d) => ShareCode.apply(d, { store, openGarage() {}, selectTeam() {} }),
    notify: (msg, result) => notices.push({ msg, ok: result.ok }),
  });
  const after = store.get("livery.custom.ferrari");
  assert.equal(after.length, 40, "no custom livery deleted");
  assert.deepEqual(after.map((l) => l.id), mine.map((l) => l.id));
  assert.equal(store.get("livery.ferrari"), "c3", "selection untouched when refused");
  assert.equal(notices.length, 1);
  assert.equal(notices[0].ok, false);
  assert.doesNotMatch(notices[0].msg, /Livery loaded/);
  assert.match(notices[0].msg, /not added .*32-livery limit/);

  // Under the cap: the shared livery is stored AND selected; re-sharing it replaces in place.
  store.set("livery.custom.ferrari", mine.slice(0, 10));
  const ok = ShareCode.apply(ShareCode.decode(encoded.code), { store });
  assert.equal(ok.ok, true);
  const got = store.get("livery.custom.ferrari");
  assert.equal(got.length, 11);
  assert.ok(got.some((l) => l.id === shared.id));
  assert.equal(store.get("livery.ferrari"), shared.id);
  ShareCode.apply(ShareCode.decode(encoded.code), { store });
  assert.equal(store.get("livery.custom.ferrari").length, 11);
});

test("a shared custom livery that collides with the catalog is renamed and selected", () => {
  const { ShareCode, store } = harness({ catalog: ["default", "special"] });
  const imported = { id: "default", c1: [1, 0, 1], c2: [0, 1, 1] };
  const decoded = ShareCode.decode(ShareCode.encode("livery", {
    team: "ferrari", id: imported.id, livery: imported,
  }).code);
  assert.equal(ShareCode.apply(decoded, { store }).ok, true);
  const kept = store.get("livery.custom.ferrari");
  assert.equal(kept[0].id, "default_imported");
  assert.deepEqual(j(kept[0].c1), [1, 0, 1]);
  assert.equal(store.get("livery.ferrari"), "default_imported");
});

test("catalog-collision import preserves an unrelated custom using the synthesized suffix", () => {
  const { ShareCode, store } = harness({ catalog: ["default"] });
  const own = { id: "default_imported", name: "Mine", c1: [0, 1, 0], c2: [0, 0, 1] };
  store.set("livery.custom.ferrari", [own]);
  const shared = { id: "default", name: "Friend", c1: [1, 0, 1], c2: [1, 1, 0] };
  const decoded = ShareCode.decode(ShareCode.encode("livery", { team: "ferrari", id: "default", livery: shared }).code);
  assert.equal(ShareCode.apply(decoded, { store }).ok, true);
  const after = store.get("livery.custom.ferrari");
  assert.deepEqual(after.map((l) => l.id), ["default_imported", "default_imported_2"]);
  assert.deepEqual(j(after[0]), own, "the suffix alone cannot authorize replacement");
  assert.equal(store.get("livery.ferrari"), "default_imported_2");
  assert.equal(ShareCode.apply(decoded, { store }).ok, true, "identical re-import replaces its repaired copy");
  assert.equal(store.get("livery.custom.ferrari").length, 2);
  assert.equal(store.get("livery.ferrari"), "default_imported_2", "re-import keeps the repaired paint selected");
});

test("selected-only livery share falls back when its id is absent", () => {
  const { ShareCode, store } = harness({ catalog: ["default"] });
  store.set("livery.custom.ferrari", [{ id: "own", c1: [1, 0, 0], c2: [0, 0, 1] }]);
  const decoded = ShareCode.decode(ShareCode.encode("livery", { team: "ferrari", id: "stale_v3" }).code);
  assert.equal(ShareCode.apply(decoded, { store }).ok, true);
  assert.equal(store.get("livery.ferrari"), "default");
  assert.equal(store.get("livery.custom.ferrari").length, 1, "unrelated paint is untouched");
});

// Round-3 hunt 6-F2: opening a #share= setup/livery link replaced the team's stored
// sheet / livery pick with no way back. apply() now keeps the previous values, the
// toast says so, and pasting UNDO (SETTINGS › FILES) restores them. A link cannot undo.
test("a setup code keeps the player's previous sheet and UNDO restores it", async () => {
  const { ShareCode, store, bag, location } = harness();
  const own = { arbF: 3, arbR: 4, rideF: 30, rideR: 70, brakeBias: 58 };
  store.set("setup.ferrari", own);
  const encoded = ShareCode.encode("setup", { team: "ferrari", tune: { arbF: 11, arbR: 11, rideF: 15, rideR: 40, brakeBias: 62 } });
  location.hash = "#share=" + encoded.code;
  location.href = "https://example.test/f1-game/" + location.hash;
  const notices = [];
  await ShareCode.consumeHash({
    apply: (d) => ShareCode.apply(d, { store, openGarage() {}, selectTeam() {} }),
    notify: (msg) => notices.push(msg),
  });
  assert.equal(store.get("setup.ferrari").arbF, 11, "the shared sheet is applied");
  assert.match(notices[0], /UNDO/, "the toast names the way back");
  // #share=UNDO is not a door: only a pasted word undoes.
  location.hash = "#share=UNDO";
  location.href = "https://example.test/f1-game/" + location.hash;
  assert.equal((await ShareCode.consumeHash({ apply: (d) => ShareCode.apply(d, { store }) })).ok, false);
  assert.equal(store.get("setup.ferrari").arbF, 11);
  const undone = ShareCode.apply(ShareCode.decode("undo"), { store });
  assert.equal(undone.ok, true);
  assert.deepEqual(j(store.get("setup.ferrari")), own);
  assert.equal(ShareCode.apply(ShareCode.decode("UNDO"), { store }).ok, false, "one-deep");
  // A team with no sheet of its own goes back to having none.
  ShareCode.apply(ShareCode.decode(ShareCode.encode("setup", { team: "mercedes", tune: own }).code), { store });
  ShareCode.apply(ShareCode.decode("UNDO"), { store });
  assert.equal(bag.get("setup.mercedes"), undefined);
});

// Round-3 hunt 6-F3: lastSession kept any flow string and CONTINUE restored it into the
// FREE picker — a season round came back with seasonMode on, a deleted career's "career"
// with isCareer() true and no save. Only free play's flow is recorded or restored.
test("CONTINUE's lastSession never carries a season or career flow", () => {
  const { ShareCode, store, bag } = harness();
  ShareCode.recordSession(store, { trackId: "monza", flow: "season" });
  assert.equal(ShareCode.lastSession(store).flow, "gp");
  bag.set("lastSession", { trackId: "monza", session: "race", flow: "career" });
  assert.equal(ShareCode.lastSession(store).flow, "gp");
  const menu = fs.readFileSync(path.join(ROOT, "js/ui/title-menu.js"), "utf8");
  assert.doesNotMatch(menu, /G\.flow\s*=\s*hint\.session\.flow/, "CONTINUE does not trust the stored flow");
});

test("share-code module is referenced (zeroRefModules)", () => {
  const { ShareCode } = harness();
  assert.equal(typeof ShareCode.encode, "function");
  assert.ok(fs.existsSync(path.join(ROOT, SRC)));
  assert.match(fs.readFileSync(path.join(ROOT, SRC), "utf8"), /const ShareCode/);
});

// Real GameStore deliberately updates its cache even when localStorage refuses.
function quotaHarness() {
  const disk = new Map();
  let refuse = () => false;
  const storage = {
    get length() { return disk.size; },
    key(i) { return [...disk.keys()][i] || null; },
    getItem(k) { return disk.get(k) ?? null; },
    setItem(k, v) { if (refuse(k, v, false)) throw Object.assign(new Error("full"), { name: "QuotaExceededError" }); disk.set(k, v); },
    removeItem(k) { if (refuse(k, undefined, true)) throw Object.assign(new Error("blocked"), { name: "SecurityError" }); disk.delete(k); },
  };
  function reload() {
    const { ShareCode, sandbox } = harness();
    sandbox.localStorage = storage;
    sandbox.Log = { warn() {}, info() {} };
    sandbox.SaveMigrate = { migrateCareer() {}, CAREER_V: 1 };
    const ctx = vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "js/core/store.js"), "utf8"), ctx);
    return { ShareCode, store: vm.runInContext("GameStore.store", ctx) };
  }
  return { reload, fail(fn) { refuse = fn; }, disk };
}
const oldTune = { arbF: 3, arbR: 4, rideF: 30, rideR: 70, brakeBias: 58 };
const newTune = { ...oldTune, arbF: 11 };
const setupImport = (ShareCode) => ShareCode.decode(ShareCode.encode("setup", { team: "ferrari", tune: newTune }).code);

test("quota-refused backup never overwrites setup or prior recovery, even after reload/retry", () => {
  const q = quotaHarness();
  let { ShareCode, store } = q.reload();
  store.set("setup.ferrari", oldTune);
  const prior = { keys: ["setup.mercedes"], prev: { "setup.mercedes": oldTune } };
  store.set("shareUndo", prior);
  q.fail((k) => k === "apex26.shareUndo");
  let opened = 0;
  const result = ShareCode.apply(setupImport(ShareCode), { store, openGarage() { opened++; } });
  assert.equal(result.reason, "undo-save-failed");
  assert.equal(opened, 0);
  assert.deepEqual(j(store.get("setup.ferrari")), oldTune);
  assert.deepEqual(j(store.get("shareUndo")), prior);
  q.fail(() => false);
  store.retryFailed();
  ({ ShareCode, store } = q.reload());
  assert.deepEqual(j(store.get("setup.ferrari")), oldTune);
  assert.deepEqual(j(store.get("shareUndo")), prior);
});

test("partial livery durability rolls back session values and keeps reload recovery", () => {
  const q = quotaHarness();
  let { ShareCode, store } = q.reload();
  const own = [{ id: "own", c1: [1, 0, 0], c2: [0, 0, 1] }];
  store.set("livery.custom.ferrari", own);
  store.set("livery.ferrari", "own");
  // Customs persist, selection fails, and rollback of the customs then fails.
  let customsWrites = 0;
  q.fail((k) => k === "apex26.livery.ferrari" || (k === "apex26.livery.custom.ferrari" && ++customsWrites > 1));
  const livery = { id: "friend", c1: [0, 1, 0], c2: [1, 1, 1] };
  const decoded = ShareCode.decode(ShareCode.encode("livery", { team: "ferrari", id: livery.id, livery }).code);
  assert.equal(ShareCode.apply(decoded, { store }).reason, "import-save-failed");
  assert.deepEqual(j(store.get("livery.custom.ferrari")), own);
  assert.equal(store.get("livery.ferrari"), "own");
  ({ ShareCode, store } = q.reload());
  assert.equal(store.get("livery.custom.ferrari").length, 2, "partial disk write really happened");
  const recovery = j(store.get("shareUndo"));
  assert.equal(recovery.pending, true);
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).reason, "recovery-pending");
  assert.deepEqual(j(store.get("shareUndo")), recovery);
  q.fail(() => false);
  assert.equal(ShareCode.undo(store).ok, true);
  ({ store } = q.reload());
  assert.deepEqual(j(store.get("livery.custom.ferrari")), own);
  assert.equal(store.get("livery.ferrari"), "own");
});

test("Undo retains recovery across failed restore and failed cleanup, then retries", () => {
  const q = quotaHarness();
  let { ShareCode, store } = q.reload();
  store.set("setup.ferrari", oldTune);
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).ok, true);
  q.fail((k) => k === "apex26.setup.ferrari");
  assert.equal(ShareCode.undo(store).reason, "undo-restore-failed");
  assert.ok(store.get("shareUndo"));
  ({ ShareCode, store } = q.reload());
  assert.deepEqual(j(store.get("setup.ferrari")), newTune);
  q.fail((k, _v, deleting) => k === "apex26.shareUndo" && deleting);
  assert.equal(ShareCode.undo(store).reason, "undo-cleanup-failed");
  assert.ok(store.get("shareUndo"), "failed deletion must not hide cached recovery");
  ({ ShareCode, store } = q.reload());
  assert.deepEqual(j(store.get("setup.ferrari")), oldTune);
  assert.ok(store.get("shareUndo"));
  q.fail(() => false);
  assert.equal(ShareCode.undo(store).ok, true);
  assert.equal(q.reload().store.get("shareUndo", null), null);
});

test("partial multi-key Undo blocks replacement after reload; completed imports stay one-deep", () => {
  const q = quotaHarness();
  let { ShareCode, store } = q.reload();
  const own = [{ id: "own", c1: [1, 0, 0], c2: [0, 0, 1] }];
  store.set("livery.custom.ferrari", own);
  store.set("livery.ferrari", "own");
  const livery = { id: "friend", c1: [0, 1, 0], c2: [1, 1, 1] };
  const decoded = ShareCode.decode(ShareCode.encode("livery", { team: "ferrari", id: livery.id, livery }).code);
  assert.equal(ShareCode.apply(decoded, { store }).ok, true);
  assert.equal(store.get("shareUndo").pending, false);
  q.fail((k) => k === "apex26.livery.ferrari");
  assert.equal(ShareCode.undo(store).reason, "undo-restore-failed");
  ({ ShareCode, store } = q.reload());
  assert.deepEqual(j(store.get("livery.custom.ferrari")), own);
  assert.equal(store.get("livery.ferrari"), "friend");
  const recovery = j(store.get("shareUndo"));
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).reason, "recovery-pending");
  assert.deepEqual(j(store.get("shareUndo")), recovery);
  q.fail(() => false);
  assert.equal(ShareCode.undo(store).ok, true);
  assert.equal(ShareCode.apply(decoded, { store }).ok, true);
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).ok, true, "completed recovery can be replaced");
  assert.deepEqual(j(store.get("shareUndo").keys), ["setup.ferrari"]);
});

test("failed completion marker leaves durable pending recovery; failed Undo marker changes no values", () => {
  const q = quotaHarness();
  let { ShareCode, store } = q.reload();
  store.set("setup.ferrari", oldTune);
  q.fail((k, v) => k === "apex26.shareUndo" && v && JSON.parse(v).pending === false);
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).reason, "import-save-failed");
  assert.equal(store.get("shareUndo").pending, true);
  ({ ShareCode, store } = q.reload());
  assert.deepEqual(j(store.get("setup.ferrari")), oldTune);
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).reason, "recovery-pending");
  q.fail(() => false);
  assert.equal(ShareCode.undo(store).ok, true);
  assert.equal(ShareCode.apply(setupImport(ShareCode), { store }).ok, true);
  const rec = j(store.get("shareUndo"));
  q.fail((k) => k === "apex26.shareUndo");
  assert.equal(ShareCode.undo(store).reason, "undo-restore-failed");
  assert.deepEqual(j(store.get("setup.ferrari")), newTune);
  assert.deepEqual(j(store.get("shareUndo")), rec);
  q.fail(() => false);
  store.retryFailed();
  assert.deepEqual(j(q.reload().store.get("shareUndo")), rec);
});

// #2191: the undo snapshot read store.get(), which falls back to GarageDefaults
// (setup.mercedes, livery.* ship there). UNDO then wrote the shipped default as a
// STORED value, pinning it so a later default change never reached the player.
test("UNDO of a setup code on an empty store leaves the key absent, not pinned to the garage default (#2191)", () => {
  const { ShareCode, sandbox } = harness();
  const disk = new Map();
  sandbox.localStorage = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => disk.set(k, String(v)),
    removeItem: (k) => disk.delete(k),
  };
  sandbox.Log = { warn() {}, info() {}, debug() {}, error() {}, enabled: () => false };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  for (const f of ["js/data/garage-defaults.js", "js/core/hash32.js", "js/core/mat4.js", "js/career/save-migrate.js", "js/core/store.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: f });
  }
  const store = vm.runInContext("GameStore.store", ctx);
  assert.ok(store.get("setup.mercedes", null), "the shipped default is visible through get()");
  assert.equal(store.getStored("setup.mercedes"), undefined);
  const code = ShareCode.encode("setup", { team: "mercedes", tune: { arbF: 11, arbR: 11, rideF: 15, rideR: 40, brakeBias: 62 } }).code;
  assert.equal(ShareCode.apply(ShareCode.decode(code), { store }).ok, true);
  assert.equal(store.getStored("setup.mercedes").arbF, 11);
  assert.equal(ShareCode.apply(ShareCode.decode("UNDO"), { store }).ok, true);
  assert.equal(store.getStored("setup.mercedes"), undefined, "absent again, so the shipped default keeps following releases");
});
