/* onboard.test.mjs — the first-run COACH MARKS, in a VM.
 *
 * The rules this file exists for: each mark fires ONCE and is remembered across
 * a reload; a mark never stomps a race message (#announce is one channel and
 * LIGHTS OUT! owns it); the wording names the control this player actually has;
 * and the module reads REPORTS only — the brake cue's urgency, the overtake arm
 * flag, the car's own active-aero ARM state — so it can never reach the car.
 *
 * Run: node --test tests/unit/onboard.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/ui/onboard.js"), "utf8");

function load(opts = {}) {
  const stored = new Map(Object.entries(opts.stored || {}));
  const said = [];
  const ctx = vm.createContext({
    Math, console, Object, Array, Number, JSON,
    Input: { touchControlsNeeded: () => !!opts.touch },
    BrakeCue: { debug: () => ({ on: true, urgency: opts.urgency != null ? opts.urgency : 0 }) },
  });
  seedLog(ctx);
  vm.runInContext(SRC, ctx, { filename: "js/ui/onboard.js" });
  const O = vm.runInContext("Onboard", ctx);
  const G = {
    state: "race",
    player: { s: 0, otArmed: false, otT: 0, xOn: false, xArmed: !!opts.aeroArmed },
    announceBusy: false,
    raceAeroMode: opts.aeroMode || "manual",
    aeroZoneAhead: () => (opts.aeroAhead != null ? opts.aeroAhead : -1),
    announce: (m, d) => said.push([m, d]),
    store: { get: (k, d) => (stored.has(k) ? stored.get(k) : d), set: (k, v) => stored.set(k, v) },
  };
  return { O, G, said, stored, on: O.create(G) };
}
const step = (on, n, dt) => { for (let i = 0; i < (n || 1); i++) on.tick(dt != null ? dt : 1 / 60); };

test("the brake mark fires once when the cue is genuinely urgent, and is remembered", () => {
  const a = load({ urgency: 0.1 });
  step(a.on, 30);
  assert.deepEqual(a.said, [], "a corner already made prompts nothing");
  const b = load({ urgency: 0.9 });
  step(b.on, 30);
  assert.equal(b.said.length, 1);
  assert.match(b.said[0][0], /^BRAKE — S OR DOWN — into the corner$/);
  step(b.on, 60 * 30);
  assert.equal(b.said.length, 1, "once, not once a corner");
  assert.equal(b.stored.get("onboarded") & 1, 1, "persisted");
  const again = load({ urgency: 0.9, stored: { onboarded: 1 } });
  step(again.on, 30);
  assert.deepEqual(again.said, [], "a player who has seen it is never told twice");
});

test("overtake and aero fire on their own signals, and two marks never land together", () => {
  const { on, G, said } = load({ urgency: 0.9, aeroArmed: true });
  G.player.otArmed = true;
  on.tick(1 / 60);
  assert.equal(said.length, 1, "one per frame");
  step(on, 30);
  assert.equal(said.length, 1, "…and the 8 s gap holds the next one back");
  step(on, 1, 9);
  assert.equal(said.length, 2);
  step(on, 1, 9);
  assert.equal(said.length, 3);
  assert.deepEqual(said.map((s) => s[0].split(" — ")[0]), ["BRAKE", "OVERTAKE", "ACTIVE AERO"]);
  step(on, 1, 9);
  assert.equal(said.length, 3, "all three shown: the module goes quiet for good");
  assert.equal(on.state().done, true);
});

test("a coach mark never stomps a race message, and never speaks outside a race", () => {
  const busy = load({ urgency: 0.9 });
  busy.G.announceBusy = true;
  step(busy.on, 60);
  assert.deepEqual(busy.said, [], "LIGHTS OUT! keeps the channel");
  busy.G.announceBusy = false;
  step(busy.on, 1);
  assert.equal(busy.said.length, 1);

  const menu = load({ urgency: 0.9 });
  menu.G.state = "menu";
  step(menu.on, 60);
  assert.deepEqual(menu.said, []);
  menu.G.state = "count";
  step(menu.on, 60);
  assert.deepEqual(menu.said, [], "not during the countdown either");
});

test("the wording names the control the player actually has", () => {
  const touch = load({ urgency: 0.9, touch: true });
  step(touch.on, 1);
  assert.match(touch.said[0][0], /^TAP AND HOLD BRAKE/);
  const keys = load({ urgency: 0.9 });
  step(keys.on, 1);
  assert.match(keys.said[0][0], /S OR DOWN/);
  const t2 = load({ touch: true, aeroArmed: true });
  step(t2.on, 1);
  assert.match(t2.said[0][0], /^TAP AERO/);
});

test("the aero mark waits for the ARM, and never fires in auto mode", () => {
  // It used to fire on `aeroZoneAhead() < 250` — up to 250 m BEFORE the zone,
  // where xArmed is still false and js/game.js's `if (!c.xArmed) c.xOn = false`
  // discards the toggle in the same frame. The one-shot mark was spent teaching
  // a press that does nothing. It now waits until the car can actually take it.
  const early = load({ aeroAhead: 120, aeroArmed: false });
  step(early.on, 60);
  assert.deepEqual(early.said, [], "approaching the zone is not yet a usable control");
  early.G.player.xArmed = true;
  step(early.on, 1);
  assert.equal(early.said.length, 1, "armed: now the press does something");
  assert.match(early.said[0][0], /^ACTIVE AERO/);

  // In auto mode the game opens the wing itself, the toggle is never read and
  // the button is hidden — naming a key there is worse than silence.
  const auto = load({ aeroArmed: true, aeroMode: "auto" });
  step(auto.on, 60);
  assert.deepEqual(auto.said, [], "auto mode: the player has no control to be taught");

  // Already open is not a teaching moment either.
  const open = load({ aeroArmed: true });
  open.G.player.xOn = true;
  step(open.on, 60);
  assert.deepEqual(open.said, [], "the wing is already open");
});

test("it stops after two races even with a mark unseen, and reset() puts it back", () => {
  const { on, G, said } = load({ urgency: 0.9 });
  step(on, 1);
  assert.equal(said.length, 1);
  for (let r = 0; r < 3; r++) { G.state = "count"; on.tick(1 / 60); G.state = "race"; on.tick(9); }
  assert.equal(on.state().done, true, "three lights-out sequences: the player has learned the car");
  assert.equal(said.length, 1, "only the brake mark ever had a signal; the cap stops the rest");
  on.reset();
  assert.equal(on.state().shown, 0);
  assert.equal(on.state().done, false);
});

test("the module reads reports only — no Tracks, no curvature, no car writes", () => {
  assert.doesNotMatch(SRC, /Tracks\./, "the arc must not reach the driver: no Tracks read");
  assert.doesNotMatch(SRC, /curvature/, "…and no curvature");
  assert.doesNotMatch(SRC, /\bp\.[a-zA-Z]+\s*=[^=]/, "never assigns to the car");
  assert.doesNotMatch(SRC, /G\.player\.[a-zA-Z]+\s*=[^=]/, "…through any spelling");
});
