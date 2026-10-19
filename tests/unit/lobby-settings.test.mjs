/* lobby-settings.test.mjs — LobbySettings.normaliseSettings / circuitPayload /
   installCircuit: the VS FRIEND custom-circuit wire (#1587) and the settings
   peel (#1655). Uses the real CustomTracks + TrackDef stack (verify-track VM).
   Run: node --test tests/unit/lobby-settings.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function ellipse(n = 36, a = 760, b = 480) {
  const pts = [];
  const q = (v) => Math.round(v * 4) / 4;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    pts.push([q(a * Math.cos(t)), q(b * Math.sin(t))]);
  }
  return pts;
}
const design = (extra) => Object.assign({
  name: "Friend Loop", seed: 11, theme: "parkland", baseHW: 7, pts: ellipse(),
}, extra);

/** Two peers: host registry + guest registry, each with LobbySettings. */
function peers(hostStored) {
  function boot(stored) {
    const Tracks = buildContext(undefined, { quiet: true });
    const ctx = Tracks._vmContext;
    const data = Object.assign({}, stored);
    ctx.GameStore = {
      store: {
        get: (k, d) => (k in data ? JSON.parse(JSON.stringify(data[k])) : d),
        set: (k, v) => { data[k] = v; },
        write: (k, v) => { data[k] = v; return { ok: true, durable: true }; },
        rawDel: (k) => { delete data[k]; },
      },
    };
    for (const f of ["js/core/hash32.js", "js/editor/track-themes.js", "js/editor/custom-tracks.js"]) {
      vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
    }
    vm.runInContext(read("js/net/lobby-settings.js").replace(/^const\b/gm, "var"), ctx, { filename: "lobby-settings.js" });
    return { Tracks, ctx, C: ctx.CustomTracks, S: ctx.LobbySettings };
  }
  const host = boot(hostStored);
  const guest = boot({});
  return { host, guest };
}

test("lobby-settings is on the lazy net roster ahead of lobby", () => {
  const man = read("tools/manifest.cjs");
  const iSet = man.indexOf('"js/net/lobby-settings.js"');
  const iLobby = man.indexOf('"js/net/lobby.js"');
  assert.ok(iSet > 0 && iLobby > iSet, "lobby-settings.js must load before lobby.js");
  assert.match(man, /\["js\/net\/lobby-settings\.js", "js\/net\/lobby\.js"\]/);
});

test("glx soft-present sibling loads before glx.js", () => {
  const man = read("tools/manifest.cjs");
  const iSoft = man.indexOf('"js/render/glx/soft.js"');
  const iGlx = man.indexOf('"js/render/glx/glx.js"');
  assert.ok(iSoft > 0 && iGlx > iSoft, "soft.js must load before glx.js");
});

test("circuitPayload + installCircuit builds the same custom circuit on both peers", () => {
  const { host, guest } = peers({ customTracks: { v: 1, items: [design()] } });
  assert.equal(host.Tracks.LIST.filter((t) => t.custom).length, 1);
  const hostDef = host.Tracks.LIST.find((t) => t.custom);
  const stored = host.C.get(hostDef.id);
  assert.ok(stored);

  const payload = host.S.circuitPayload(stored);
  assert.ok(payload, "host encodes a wire design");
  assert.ok(JSON.stringify(payload).length <= host.S.MAX_CIRCUIT_JSON);

  const norm = guest.S.normaliseSettings({
    track: -1, circuit: payload, laps: 5, weather: "dry", tod: "day",
    quali: false, difficulty: "normal", revision: 1,
  });
  assert.ok(norm && norm.circuit, "guest accepts the circuit body");
  assert.equal(norm.circuit.id, hostDef.id);

  const before = guest.Tracks.LIST.length;
  const idx = guest.S.installCircuit(norm.circuit);
  assert.ok(idx >= 0);
  assert.equal(guest.Tracks.LIST.length, before + 1);
  const guestDef = guest.Tracks.LIST[idx];
  assert.equal(guestDef.id, hostDef.id);
  assert.equal(guestDef.custom, true);
  assert.equal(guestDef.name, hostDef.name);

  // Both peers can bake a centerline (the race build path).
  const hLine = host.Tracks.buildCenterline(hostDef);
  const gLine = guest.Tracks.buildCenterline(guestDef);
  assert.ok(Math.abs(hLine.total - gLine.total) < 1, "same lap length on both peers");
});

test("normaliseSettings refuses an oversized or hostile circuit body", () => {
  const { host } = peers({});
  const S = host.S;
  // circuit:null is "no body" (built-in track path); a string / array / oversized object is hostile.
  assert.equal(S.normaliseSettings({ circuit: "APXT1.p.nope", laps: 3 }), null);
  assert.equal(S.normaliseSettings({ circuit: [], laps: 3 }), null);
  const bloated = { name: "BAD", seed: 1, theme: "parkland", baseHW: 7, pts: ellipse(8), junk: "x".repeat(S.MAX_CIRCUIT_JSON) };
  assert.equal(S.normaliseSettings({ circuit: bloated, laps: 3, weather: "dry", tod: "day", quali: false, difficulty: "normal" }), null);
  // Built-in track index still works without a circuit.
  host.Tracks.LIST.length = 2;
  host.Tracks.LIST[0] = { id: "a" };
  host.Tracks.LIST[1] = { id: "b" };
  const ok = S.normaliseSettings({ track: 1, laps: 3, weather: "dry", tod: "day", quali: false, difficulty: "normal" });
  assert.ok(ok);
  assert.equal(ok.track, 1);
  assert.equal(ok.laps, 3);
  assert.equal(ok.weather, "dry");
  assert.equal(ok.tod, "day");
  assert.equal(ok.quali, false);
  assert.equal(ok.difficulty, "normal");
});

test("a custom LIST index without a circuit body is refused (legacy host)", () => {
  const { host } = peers({ customTracks: { v: 1, items: [design()] } });
  const customIdx = host.Tracks.LIST.findIndex((t) => t.custom);
  assert.ok(customIdx >= 0);
  assert.equal(host.S.normaliseSettings({
    track: customIdx, laps: 3, weather: "dry", tod: "day", quali: false, difficulty: "normal",
  }), null, "guest must not accept a custom index alone — it cannot build it");
});
