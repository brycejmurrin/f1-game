/* CareerExperience / ResultsStory: real save and canonical verdict presentation.
 * No browser: validates source-of-truth gates and retirement/points edge cases. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

function boot(extra = {}) {
  const dom = makeDom(), ctx = vm.createContext({ document: dom.document, ...extra });
  for (const path of ["js/ui/dom.js", "js/career/experience.js", "js/ui/results-story.js"])
    vm.runInContext(fs.readFileSync(new URL("../../" + path, import.meta.url), "utf8"), ctx);
  return { career: vm.runInContext("CareerExperience", ctx), story: vm.runInContext("ResultsStory", ctx), dom };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test("career garage decoration is gated by live flow, not a loaded save", () => {
  let live = false;
  const c = { team: "custom", seat: 0, year: 2027, season: { pts: { "custom:0": 18 } },
    results: [{ p: 1 }, { p: 3 }, { p: 0 }], history: [{ wins: 2, podiums: 4, pos: 1, cPos: 1 }] };
  const { career } = boot({ Career: { inCareer: () => live, data: () => c,
    state: () => ({ facility: 2, facilityDiscount: 0.1 }), FACILITY_MAX: 10 } });
  assert.deepEqual(plain(career.garageMetadata()), { active: false });
  live = true;
  assert.deepEqual(plain(career.garageMetadata()), { active: true, teamId: "custom", year: 2027,
    facility: 2, facilityMax: 10, discount: 0.1, points: 18,
    wins: 3, podiums: 6, titles: 1, teamTitles: 1, seasons: 2 });
});

test("calendar stories map saved zero-based round results without inventing missing results", () => {
  const { career } = boot(), tracks = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const c = { season: { round: 2 }, results: [{ r: 0, p: 4, pts: 12 }] };
  const rows = plain(career.calendar(c, tracks));
  assert.deepEqual(rows.map((r) => r.state), ["complete", "complete", "next", "future"]);
  assert.deepEqual(rows[0].result, { r: 0, p: 4, pts: 12 });
  assert.equal(rows[1].result, null);
  assert.equal(rows[2].round, 3);
  c.season.round = 4;
  assert.ok(career.calendar(c, tracks).every((r) => r.state === "complete"));
});

test("result story uses canonical retirement verdict and preserves supplied classification order", () => {
  const { story } = boot();
  const cars = [{ driverId: "a", isPlayer: true, retired: true, code: "AAA" },
    { driverId: "b", code: "BBB" }, { driverId: "c", code: "CCC" }];
  const data = story.summary(cars, { dnfOf: () => null, points: [25, 18, 15], fastestLap: "a" });
  assert.equal(data.player.points, 26, "host timed a car which this guest locally retired");
  assert.equal(data.player.out, null);
  assert.deepEqual(plain(data.podium).map((p) => p.car.code), ["AAA", "BBB", "CCC"]);
});

test("classified retirement gets paid points but is excluded from the podium", () => {
  const { story } = boot();
  const cars = [{ driverId: "a" }, { driverId: "b", isPlayer: true, retired: true, classified: true }];
  const data = story.summary(cars, { dnfOf: (c) => c.retired ? "engine" : null, points: [25, 18], fastestLap: "a" });
  assert.equal(data.player.points, 18);
  assert.equal(story.summary(cars, { dnfOf: (c) => c.retired ? "engine" : null,
    points: [25, 18], fastestLap: "b" }).player.points, 18, "retired fastest car receives no fastest-lap bonus");
  assert.deepEqual(plain(data.podium).map((p) => p.pos), [1]);
  cars[1].dsq = "compound";
  assert.equal(story.summary(cars, { dnfOf: (c) => c.dsq ? "DSQ" : null, points: [25, 18] }).player.points, 0);
});

test("a watched replay never congratulates the followed car as the player, and duels have no podium", () => {
  const { story } = boot();
  const cars = [1, 2, 3].map((n) => ({ code: "C" + n, name: "Driver " + n, isPlayer: n === 2 }));
  const node = story.render({}, cars, { watched: true, points: [25, 18, 15] });
  assert.equal(node.children[0].children[0].textContent, "At the chequered flag");
  const duel = story.render({}, cars, { duel: true, points: [25, 18, 15] });
  assert.equal(duel.children.length, 1);
});

test("armed unscored practice reports its finish without earned points, podium or stale career settlement", () => {
  const { story } = boot();
  const cars = [1, 2, 3].map((n) => ({ driverId: "c" + n, code: "C" + n, isPlayer: n === 1 }));
  const options = { points: [25, 18, 15], fastestLap: "c1" };
  const G = { practice: true, careerSettlement: { obj: { done: true } } };
  const node = story.render(G, cars, options);
  assert.equal(node.getAttribute("aria-label"), "Practice session result");
  assert.equal(node.children[0].children[0].textContent, "Practice complete");
  assert.equal(node.children[0].children[1].textContent, "Unscored session · P1");
  assert.equal(node.children[0].children.length, 2, "no stale objective award from an earlier career result");
  assert.equal(node.children.length, 1, "no scored podium presentation");
  cars[0].retired = true; cars[0].dnf = "engine";
  assert.equal(story.render(G, cars, options).children[0].children[1].textContent, "Unscored session · engine");
  cars[0].retired = false;
  const scored = story.render({ practice: false }, cars, options);
  assert.equal(scored.children[0].children[0].textContent, "Race winner");
  assert.equal(scored.children[0].children[1].textContent, "P1 · 26 points", "real scored result keeps its actual points");
  assert.equal(scored.children.length, 2);
});

test("totals read the cumulative tally, so a trimmed history archive does not cap the record", () => {
  const { career } = boot();
  const c = { results: [{ p: 1 }], history: [{ wins: 1, podiums: 1, pos: 1, cPos: 1 }],
    tally: { seasons: 14, wins: 20, podiums: 31, titles: 13, cTitles: 6, pts: 9000 } };
  assert.deepEqual(plain(career.totals(c)), { wins: 21, podiums: 32, titles: 13, teamTitles: 6, seasons: 15 });
});

test("the pause card's career brief reads Career.objectiveMet on settleRound's ctx, live", async () => {
  const { fnSource } = await import("../helpers/fn-source.mjs");
  const careerSrc = fs.readFileSync(new URL("../../js/career/career.js", import.meta.url), "utf8");
  const objectiveMet = vm.runInContext("(" + fnSource(careerSrc, "function objectiveMet(") + ")", vm.createContext({}));
  // objectiveStatus reads it off the façade and says nothing without it.
  assert.match(careerSrc, /objectiveLabel, objectiveMet, prizeFor, settleRound/, "Career exports objectiveMet");
  let live = true, obj = { type: "finish", value: 6 };
  const c = { team: "haas", season: { round: 3 } };
  const labels = { finish: (v) => `Finish P${v} or better`, beatMate: () => "Finish ahead of your team-mate",
    clean: () => "Clean race — no track limits, no penalty", points: () => "Score championship points",
    outQualMate: () => "Out-qualify your team-mate" };
  const { career } = boot({ Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] }, Career: { inCareer: () => live, data: () => c,
    objectiveFor: (r) => (r === 3 ? obj : null), objectiveLabel: (o) => labels[o.type](o.value), objectiveMet } });
  const haas = { id: "haas" }, other = { id: "ferrari" };
  const field = Array.from({ length: 10 }, (_, i) => ({ team: i === 2 ? haas : other, gridPos: i + 1 }));
  const p = { team: haas, gridPos: 4 }, mate = field[2];
  const G = { player: p, session: "race", cars: [p, ...field], ranked: [...field.slice(0, 7), p, ...field.slice(7)] };
  assert.equal(career.objectiveStatus(G), "OBJECTIVE · TARGET P6 · NOW P8");
  G.ranked = [field[0], p, ...field.slice(1)];
  assert.equal(career.objectiveStatus(G), "OBJECTIVE · TARGET P6 · NOW P2 ✓");
  obj = { type: "points", value: 1 };
  assert.match(career.objectiveStatus(G), /CHAMPIONSHIP POINTS · ON TARGET$/, "P2 scores");
  obj = { type: "beatMate", value: 0 };
  assert.equal(career.objectiveStatus(G), "OBJECTIVE · FINISH AHEAD OF YOUR TEAM-MATE · ON TARGET");
  G.ranked = [mate, ...field.filter((f) => f !== mate), p];
  assert.equal(career.objectiveStatus(G), "OBJECTIVE · FINISH AHEAD OF YOUR TEAM-MATE · NOT YET");
  // The settlement's own verdict on the same ctx agrees.
  assert.equal(objectiveMet(obj, { pos: 11, pts: 0, player: p, mate, matePos: 1 }), false);
  obj = { type: "points", value: 1 };
  assert.match(career.objectiveStatus(G), /NOT YET$/, "P11 scores nothing");
  obj = { type: "clean", value: 0 };
  assert.match(career.objectiveStatus(G), /CLEAN SO FAR$/);
  p.cuts = 1;
  assert.match(career.objectiveStatus(G), /· MISSED$/, "a track-limits strike spends a clean brief for good");
  obj = { type: "outQualMate", value: 0 };
  assert.match(career.objectiveStatus(G), /· MISSED$/, "grid P4 behind the mate's P3");
  G.session = "quali";
  assert.equal(career.objectiveStatus(G), "OBJECTIVE · OUT-QUALIFY YOUR TEAM-MATE", "quali reads the brief alone");
  G.session = "race"; G.timeTrial = true;
  assert.equal(career.objectiveStatus(G), "", "never on a time trial");
  G.timeTrial = false; live = false;
  assert.equal(career.objectiveStatus(G), "", "a loaded save that is not being raced shows nothing");
});
