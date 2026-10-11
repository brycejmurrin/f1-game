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
    set(k, v) { bag.set(k, v); },
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
    Tracks: {
      LIST: (opts.tracks || ["monza", "spa"]).map((id) => ({ id, name: id.toUpperCase() })),
      SEASON: (opts.tracks || ["monza", "spa"]).map((id) => ({ id, name: id.toUpperCase() })),
    },
    Career: {
      data: () => opts.career || null,
      load: () => opts.career || null,
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
