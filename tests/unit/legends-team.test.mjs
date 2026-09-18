// THE LEGENDS TEAM as a grid entry, separate from MY TEAM.
//
// The rules that matter here are the ones a refactor breaks silently: the team
// must not collide with the custom slot, it must carry the whole roster so the
// select screen's DRIVER picker is the legend picker, and it must still GRID
// exactly one car. The last is the one with teeth — `drivers.length` is 12, so
// anything that counts seats by that number puts twelve legends on a 23-box
// grid.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import fs from "node:fs";

function load(files) {
  const ctx = vm.createContext({ console, Object, Math });
  for (const f of files) vm.runInContext(fs.readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  return (name) => vm.runInContext(name, ctx);
}
const get = load(["js/core/mat4.js", "js/data/legends.js"]);
const Legends = get("Legends");
const Teams = load(["js/core/mat4.js", "js/data/teams.js"])("Teams");

test("the Legends team is its own id, not the custom slot", () => {
  const t = Legends.team("senna");
  assert.equal(t.id, "legends", "sharing the custom id would overwrite the player's decals and parts sheet");
  assert.equal(t.legends, true);
  assert.ok(!t.custom, "it must not also read as the custom team — gridTeams() would count it twice");
  assert.ok(!Teams.LIST.some((x) => x.id === "legends"),
    "the base roster must stay the eleven real teams; Legends is appended at runtime");
});

test("the team carries the whole roster, so the driver picker is the legend picker", () => {
  const t = Legends.team("senna");
  assert.equal(t.drivers.length, Legends.LIST.length);
  assert.deepEqual(t.drivers.map((d) => d.code), Legends.LIST.map((l) => l.code),
    "roster order — seatOf() and a saved driverIdx both depend on it");
});

test("seatOf finds every legend, and refuses what is not one", () => {
  Legends.LIST.forEach((l, i) => {
    assert.equal(Legends.seatOf(l.id), i, `${l.id} is not at its own index`);
    assert.equal(Legends.seatOf(l.code), i, `${l.code} must resolve too — the team stores a code`);
  });
  assert.equal(Legends.seatOf("nobody"), -1);
  assert.equal(Legends.seatOf(undefined), -1);
});

test("the team's identity follows the legend it fields, not just its name", () => {
  // Picking a different legend has to change the CAR, or the picker is cosmetic.
  const a = Legends.team("fangio"), b = Legends.team("ghill");
  assert.notEqual(a.legend, b.legend);
  assert.notEqual(a.tier, b.tier, "a 1950s champion and a 1960s one must not share a car tier");
  assert.notDeepEqual(a.color, b.color);
  assert.notDeepEqual(a.stats, b.stats);
  assert.equal(a.name, b.name, "…while the TEAM name stays Legends either way");
});

test("every legend can field the team", () => {
  for (const l of Legends.LIST) {
    const t = Legends.team(l.id);
    assert.ok(t, `${l.id} cannot field the team`);
    assert.equal(t.legend, l.id);
    assert.equal(t.id, "legends");
    assert.ok(t.stats && t.livery && t.color && t.color2, `${l.id}: an incomplete team record`);
    assert.ok(t.tier >= 0 && t.tier <= 3, `${l.id}: tier ${t.tier} is off the 0..3 scale`);
  }
  assert.equal(Legends.team("nobody"), null);
});

// The seat rule, as js/game.js seatsFor() implements it. Held here rather than
// only in game.js because the number it produces feeds BOTH the grid and the
// painted boxes — a disagreement is a car on bare tarmac.
const seatsFor = (team, driverIdx) => {
  if (!team || !team.legends) return team.drivers;
  const d = team.drivers || [];
  if (!d.length) return [];
  return [d[Math.min(Math.max(driverIdx | 0, 0), d.length - 1)]];
};

test("the team grids exactly one car, whichever legend is picked", () => {
  const t = Legends.team("senna");
  for (let i = 0; i < t.drivers.length; i++) {
    const seats = seatsFor(t, i);
    assert.equal(seats.length, 1, `driverIdx ${i} gridded ${seats.length} cars`);
    assert.equal(seats[0].code, Legends.LIST[i].code, `driverIdx ${i} gridded the wrong legend`);
  }
});

test("an out-of-range or junk pick still grids one car", () => {
  // A saved driverIdx outlives a roster edit, and a shorter roster must not
  // grid `undefined` — which reads as a car with no driver rather than a crash.
  const t = Legends.team("senna");
  for (const bad of [-5, 99, NaN, undefined, null]) {
    const seats = seatsFor(t, bad);
    assert.equal(seats.length, 1, `pick ${String(bad)} gridded ${seats.length}`);
    assert.ok(seats[0] && seats[0].code, `pick ${String(bad)} gridded a seat with no driver`);
  }
});
