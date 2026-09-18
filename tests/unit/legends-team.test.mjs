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

// ── THE TEAM TILE ────────────────────────────────────────────────────────────
// A tile is built for the two names every other team has. LEGENDS carries all
// twelve so the driver picker can offer them, and the select screen joined all
// twelve into one line: on a real screen that overflowed the card and pushed it
// over Aston Martin's (2026-09-17). These pin the data the tile leans on.

test("only a SOURCED racing number exists; the rest are a neutral placeholder", () => {
  // Array.from: a map() over a vm-realm array stays in that realm, and a strict
  // deepEqual then fails on prototype identity alone with the values matching.
  const numbered = Array.from(Legends.LIST).filter((l) => l.num);
  assert.deepEqual(numbered.map((l) => l.code).sort(), ["MAN", "SEN"],
    "only Senna's 12 and Mansell's 5 are sourced — a new one needs a source, not a guess");
  for (const l of Legends.LIST) {
    if (!l.num) continue;
    assert.ok(l.num > 1, `${l.id}: a sourced number of 1 is indistinguishable from the placeholder`);
  }
});

test("the tile's driver line stays one line's worth for a legend", () => {
  // The bug was a 12-entry join. Whatever the tile shows, it must be derived
  // from ONE seat, so the line cannot grow with the roster.
  const t = Legends.team("senna");
  const line = (seat) => {
    const d = t.drivers[seat];
    return (d.num > 1 ? "#" + d.num + " " : "") + d.name.split(" ").pop() + "  ·  " + t.engine;
  };
  for (let i = 0; i < t.drivers.length; i++) {
    assert.ok(line(i).length < 48, `seat ${i} renders ${line(i).length} chars: "${line(i)}"`);
  }
});

test("a legend wears a real marque crest or none — never a borrowed one", () => {
  // EVERY team the game ships has a mark, and this list is read from the game
  // rather than remembered. An earlier version hard-coded the eight in
  // js/car/crest-paths.js and called them "hand-drawn ... and no others" —
  // wrong twice: those eight are TRACED, and mercedes/haas/audi carry geometric
  // constructions in js/car/liverytex.js MARK_PARTS instead. That mistake cost
  // Fangio his Silver Arrow badge, so the set is derived now and the test would
  // have caught the omission.
  const HAVE = new Set(Teams.LIST.map((t) => t.id));
  assert.ok(HAVE.has("mercedes"), "mercedes must be markable — its star and ring are drawn, not traced");
  assert.ok(HAVE.size >= 11, `only ${HAVE.size} teams — the roster shrank under this test`);
  let withCrest = 0;
  for (const l of Legends.LIST) {
    if (l.marque == null) continue;
    withCrest++;
    assert.ok(HAVE.has(l.marque), `${l.id}: "${l.marque}" is not a crest the game draws`);
    // …and it must be the marque the CAR is, not a nearby one.
    const car = l.car.toLowerCase();
    const brand = l.marque === "redbull" ? "red bull" : l.marque;
    assert.ok(car.includes(brand), `${l.id}: crest "${l.marque}" against car "${l.car}"`);
  }
  assert.ok(withCrest >= 8, `only ${withCrest} legends carry a crest — the mapping has regressed`);
  assert.equal(Legends.team("fangio").crest, "mercedes", "the W196 is a Mercedes and the game draws that star");
  assert.equal(Legends.team("senna").crest, "mclaren");
  // The four with no mark are a SOURCE limit, not a to-do: Lotus, Tyrrell and
  // Vanwall are typographic and this repo's tracer says memory is the wrong
  // source for a mark. If one of them ever gains a real crest, flip it here.
  for (const id of ["clark", "ghill", "stewart", "moss"]) {
    assert.equal(Legends.team(id).crest, null, `${id}: no Lotus/Tyrrell/Vanwall mark exists to wear`);
  }
});
