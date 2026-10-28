/* cooldown-lap.test.mjs — CooldownLap exits, eligibility, AI cool/park, SKIP
 * tap floor (js/race/cooldown-lap.js; #4068 / plan 2026-10-27-cooldown-podium
 * slice 2). Pure VM; RaceCeremony wiring is #4067.
 * Run: node --test tests/unit/cooldown-lap.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot() {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/race/cooldown-lap.js"), ctx, { filename: absSrc("js/race/cooldown-lap.js") });
  return vm.runInContext("CooldownLap", ctx);
}

function raceG(over = {}) {
  const player = Object.assign({ s: 100, x: 0, prog: 0.1, speed: 40, retired: false, dsq: false }, over.player);
  return Object.assign({
    session: "race",
    timeTrial: false,
    duel: false,
    netPlay: { active: () => false },
    track: { total: 5000 },
    player,
  }, over, { player });
}

test("sessionEligible: GP/sprint on; TT/quali/practice/duel/friend/WATCH off", () => {
  const C = boot();
  assert.equal(C.sessionEligible(raceG()), true);
  assert.equal(C.sessionEligible(raceG({ session: "sprint" })), true);
  assert.equal(C.sessionEligible(raceG({ timeTrial: true })), false);
  assert.equal(C.sessionEligible(raceG({ session: "quali" })), false);
  assert.equal(C.sessionEligible(raceG({ session: "practice" })), false);
  assert.equal(C.sessionEligible(raceG({ duel: true })), false);
  assert.equal(C.sessionEligible(raceG({ netPlay: { active: () => true } })), false);
  assert.equal(C.sessionEligible(raceG({ watchMode: true })), false);
  assert.equal(C.sessionEligible(raceG({ realRace: { isWatch: () => true } })), false);
});

test("playerCanDrive refuses retired / DSQ", () => {
  const C = boot();
  assert.equal(C.playerCanDrive({ retired: false, dsq: false }), true);
  assert.equal(C.playerCanDrive({ retired: true }), false);
  assert.equal(C.playerCanDrive({ dsq: true }), false);
  assert.equal(C.playerCanDrive(null), false);
});

test("exitReason: skip, pit, lap, time — live only", () => {
  const C = boot();
  assert.equal(C.exitReason({ live: false, age: 99 }, {}), null);
  assert.equal(C.exitReason({ live: true, age: 1, skipRequested: true }, {}), "skip");
  assert.equal(C.exitReason({ live: true, age: 1 }, { inPitLane: true }), "pit");
  assert.equal(C.exitReason({ live: true, age: 1 }, { atBox: true }), "pit");
  assert.equal(C.exitReason({ live: true, age: 1, lapBudget: 1 }, { progDelta: 1 }), "lap");
  assert.equal(C.exitReason({ live: true, age: 1, lapBudget: 1 }, { progDelta: 0.5 }), null);
  assert.equal(C.exitReason({ live: true, age: 45, wallBudget: 45 }, { progDelta: 0 }), "time");
  assert.equal(C.exitReason({ live: true, age: 10, wallBudget: 45 }, { progDelta: 0 }), null);
});

test("aiPolicy: never attack; cool vs park", () => {
  const C = boot();
  const cool = C.aiPolicy({}, { vRef: 100 });
  assert.equal(cool.mode, "cool");
  assert.equal(cool.attack, false);
  assert.ok(cool.targetSpeed > 0 && cool.targetSpeed < 100);
  const park = C.aiPolicy({}, { inPitLane: true, speed: 1, vRef: 100 });
  assert.equal(park.mode, "park");
  assert.equal(park.attack, false);
  assert.equal(park.targetSpeed, 0);
  const near = C.aiPolicy({}, { nearPit: true, vRef: 80 });
  assert.equal(near.mode, "park");
  assert.equal(near.attack, false);
});

test("create: start → tick time/lap/pit/skip exits; camera stays chase", () => {
  const C = boot();
  const G = raceG({ player: { prog: 0.2, s: 1000, speed: 40 } });
  const api = C.create(G, { inPitLane: () => false, atBox: () => false });
  assert.equal(api.start(), true);
  assert.equal(api.status().phase, "cooldown");
  assert.equal(api.cameraOwner(), "chase");
  assert.equal(api.driveAllowed(), true);

  // Time budget (short wall for the test).
  api.reset();
  assert.equal(api.start({ wallS: 2, force: true }), true);
  assert.equal(api.tick(1), null);
  assert.equal(api.tick(1.1), "time");
  assert.equal(api.status().phase, "done");
  assert.equal(api.status().exit, "time");
  assert.equal(api.live(), false);

  // Lap budget (explicit sample pins exitReason).
  assert.equal(api.start({ lapBudget: 0.5, wallS: 99, force: true }), true);
  assert.equal(api.tick(0.016, { progDelta: 0.5 }), "lap");

  // Pit exit.
  const pitApi = C.create(G, { inPitLane: () => true, atBox: () => false });
  assert.equal(pitApi.start({ wallS: 99, force: true }), true);
  assert.equal(pitApi.tick(0.016), "pit");

  // Prog wiring: startProg captured at start; crossing lapBudget ends the beat.
  const G2 = raceG({ player: { prog: 0 } });
  const progApi = C.create(G2, { inPitLane: () => false, atBox: () => false });
  assert.equal(progApi.start({ lapBudget: 0.25, wallS: 99, force: true }), true);
  G2.player.prog = 0.25;
  assert.equal(progApi.tick(0.016), "lap");

  // Skip.
  const sk = C.create(G);
  assert.equal(sk.start({ force: true }), true);
  assert.equal(sk.skip(), true);
  assert.equal(sk.tick(0), "skip");
});

test("retired player: start still arms but driveAllowed is false", () => {
  const C = boot();
  const G = raceG({ player: { retired: true, prog: 0 } });
  const api = C.create(G);
  assert.equal(api.start({ force: true }), true);
  assert.equal(api.driveAllowed(), false);
  assert.equal(api.status().drive, false);
});

test("ineligible session refuses start unless force", () => {
  const C = boot();
  const G = raceG({ timeTrial: true });
  const api = C.create(G);
  assert.equal(api.start(), false);
  assert.equal(api.start({ force: true }), true);
});

test("mountSkip paints TAP_MIN_CSS_PX and skipTargetOk reads the box", () => {
  const C = boot();
  assert.equal(C.TAP_MIN_CSS_PX, 44);
  assert.equal(C.SKIP_LABEL, "SKIP TO PARC FERMÉ");

  // Fake DOM host.
  const kids = [];
  const host = {
    appendChild(el) { kids.push(el); el.parentNode = host; },
    removeChild(el) {
      const i = kids.indexOf(el);
      if (i >= 0) kids.splice(i, 1);
      el.parentNode = null;
    },
  };
  const listeners = [];
  function makeBtn() {
    return {
      type: "", id: "", className: "", textContent: "", style: {},
      parentNode: null,
      _attrs: {},
      setAttribute(k, v) { this._attrs[k] = v; },
      addEventListener(type, fn) { listeners.push({ type, fn }); },
      removeEventListener(type, fn) {
        const i = listeners.findIndex((l) => l.type === type && l.fn === fn);
        if (i >= 0) listeners.splice(i, 1);
      },
      getBoundingClientRect() {
        return { width: 120, height: 44, top: 0, left: 0, right: 120, bottom: 44 };
      },
    };
  }
  const doc = { createElement(tag) { assert.equal(tag, "button"); return makeBtn(); } };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, isFinite,
    Log: { info() {}, debug() {}, warn() {} },
    document: doc,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/race/cooldown-lap.js"), ctx, { filename: absSrc("js/race/cooldown-lap.js") });
  const CD = vm.runInContext("CooldownLap", ctx);
  const api = CD.create(raceG());
  api.start({ force: true });
  const btn = api.mountSkip(host);
  assert.ok(btn);
  assert.equal(btn.id, "ceremony-cooldown-skip");
  assert.equal(btn.textContent, CD.SKIP_LABEL);
  assert.match(btn.style.minHeight, /44px/);
  assert.match(btn.style.minWidth, /44px/);
  assert.ok(CD.skipTargetOk(btn));
  assert.equal(kids.length, 1);
  // Click → skip exit.
  listeners[0].fn();
  assert.equal(api.tick(0), "skip");
});
