// THE SCHEDULE'S DATE AND TIME COME FROM ONE INSTANT IN ONE ZONE.
// js/data/schedule.js printed the start time in the viewer's zone but the date
// in UTC, so a Las Vegas GP (2026-11-22, 04:00Z) read "22 Nov · 20:00 PST" in
// California — a day adrift. NEXT was also picked against today's UTC date.
// The zone is pinned BEFORE any Date use: Node re-reads process.env.TZ.
process.env.TZ = "America/Los_Angeles";

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";

const SRC = readFileSync(new URL("../../js/data/schedule.js", import.meta.url), "utf8");
const ctx = vm.createContext({});
vm.runInContext(SRC + ";globalThis.DataSchedule = DataSchedule;", ctx, { filename: "js/data/schedule.js" });
const S = ctx.DataSchedule;

const VEGAS = { date: "2026-11-22", time: "04:00:00Z", name: "Las Vegas Grand Prix" };

test("the zone pin took effect", () => {
  assert.equal(new Date(Date.parse("2026-11-22T04:00:00Z")).getDate(), 21, "LA is UTC-8 in November");
});

test("Las Vegas: the date is the viewer's LOCAL day of the race instant (21 Nov in LA)", () => {
  const label = S.dateLabel(VEGAS);
  assert.match(label, /21/, label);
  assert.doesNotMatch(label, /22/, label);
  assert.match(label, /Nov/, label);
});

test("a date-only entry stays a UTC calendar day (the earlier UTC+13 fix)", () => {
  const label = S.dateLabel({ date: "2026-11-22" });
  assert.match(label, /22/, label);
});

test("NEXT compares the race instant with now, not today's UTC date", () => {
  const at = Date.parse("2026-11-22T04:00:00Z");
  assert.equal(S.isUpcoming(VEGAS, at - 60e3), true, "a minute before lights out");
  assert.equal(S.isUpcoming(VEGAS, at + 60 * 60e3), true, "an hour in: still running");
  assert.equal(S.isUpcoming(VEGAS, at + 3 * 3600e3), false,
    "three hours after the start it is over, even though the UTC date is still the 22nd");
  // Date-only entries keep the day comparison.
  assert.equal(S.isUpcoming({ date: "2026-11-22" }, Date.parse("2026-11-22T20:00:00Z")), true);
  assert.equal(S.isUpcoming({ date: "2026-11-22" }, Date.parse("2026-11-23T01:00:00Z")), false);
});

test("a malformed time falls back to the date-only rules", () => {
  const r = { date: "2026-11-22", time: "garbage" };
  assert.ok(Number.isNaN(S.raceInstant(r)));
  assert.match(S.dateLabel(r), /22/);
});
