// THE SCHEDULE TAB'S CALENDAR EXPORT IS RFC 5545, NOT "A TEXT FILE THAT LOOKS LIKE ONE".
// js/data/ics.js builds the .ics the ADD RACE WEEKEND / ADD WHOLE SEASON buttons save.
// Phone calendars are strict about the parts pinned here: CRLF, 75-OCTET folding that
// never splits a UTF-8 sequence, TEXT escaping, UTC DTSTART, and a UID that names the
// session (so a corrected time re-imports as an update, not a duplicate).
// https://datatracker.ietf.org/doc/html/rfc5545 §3.1, §3.3.5, §3.3.11, §3.8.4.7
process.env.TZ = "America/Los_Angeles";

import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { absSrc } from "../helpers/abs-src.mjs";

const ctx = vm.createContext({});
for (const f of ["js/data/schedule.js", "js/data/ics.js"]) {
  vm.runInContext(readFileSync(new URL("../../" + f, import.meta.url), "utf8"), ctx, { filename: absSrc(f) });
}
vm.runInContext("globalThis.DataIcs = DataIcs;", ctx);
const I = ctx.DataIcs;
const NOW = Date.parse("2026-10-27T12:00:00Z");

const SPRINT = {
  round: 21, name: "São Paulo Grand Prix", circuit: "Autódromo José Carlos Pace", locality: "São Paulo", country: "Brazil",
  date: "2026-11-08", time: "17:00:00Z", hasSprint: true,
  sessions: { fp1: { date: "2026-11-06", time: "14:30:00Z" }, sq: { date: "2026-11-06", time: "18:30:00Z" },
    s: { date: "2026-11-07", time: "14:00:00Z" }, q: { date: "2026-11-07", time: "18:00:00Z" },
    r: { date: "2026-11-08", time: "17:00:00Z" } }
};
const CONVENTIONAL = {
  round: 7, name: "Emilia Romagna Grand Prix", circuit: "Imola", locality: "Imola", country: "Italy",
  date: "2026-05-17", time: "13:00:00Z",
  sessions: { fp1: { date: "2026-05-15", time: "11:30:00Z" }, fp2: { date: "2026-05-15", time: "15:00:00Z" },
    fp3: { date: "2026-05-16", time: "10:30:00Z" }, q: { date: "2026-05-16", time: "14:00:00Z" },
    r: { date: "2026-05-17", time: "13:00:00Z" } }
};
const DATE_ONLY = { round: 24, name: "Abu Dhabi Grand Prix", date: "2026-12-06" };

const unfold = (ics) => ics.replace(/\r\n /g, "");
const props = (ics, name) => unfold(ics).split("\r\n").filter((l) => l.startsWith(name + ":") || l.startsWith(name + ";"));
const octets = (s) => Buffer.byteLength(s, "utf8");

test("every line ends CRLF, no bare LF, and the calendar is framed", () => {
  const ics = I.build([SPRINT, CONVENTIONAL], { now: NOW, alarmMin: 30 });
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Apex 26//Race Weekend//EN\r\n"));
  assert.equal(/[^\r]\n/.test(ics), false, "a bare LF");
  assert.equal(props(ics, "BEGIN").filter((l) => l === "BEGIN:VEVENT").length, 10);
});

test("folding: no physical line over 75 octets, multibyte characters are never split, unfold restores", () => {
  const long = Object.assign({}, SPRINT, { name: "Grande Prêmio de São Paulo — Fórmula 1 MSC Cruises 🇧🇷 Ñandú Ünïcödé São São São São" });
  const ics = I.build([long], { now: NOW });
  for (const line of ics.split("\r\n")) {
    assert.ok(octets(line) <= 75, `${octets(line)} octets: ${line}`);
    assert.equal(line.includes("�"), false);
  }
  assert.ok(ics.split("\r\n").some((l) => l.startsWith(" ")), "the long SUMMARY folded");
  assert.ok(props(ics, "SUMMARY")[0].includes("🇧🇷 Ñandú"), "unfolding gives the name back whole");
  // octet, not character, counting: 40 three-byte chars = 120 octets must fold
  const f = I.fold("X:" + "€".repeat(40));
  assert.ok(f.split("\r\n")[0].length < 40, "folded by octets");
});

test("TEXT escaping of backslash, semicolon, comma and newline", () => {
  assert.equal(I.text("a\\b;c,d\ne"), "a\\\\b\\;c\\,d\\ne");
  const ics = I.build([CONVENTIONAL], { now: NOW });
  assert.ok(props(ics, "LOCATION")[0] === "LOCATION:Imola\\, Imola\\, Italy");
});

test("DTSTART is UTC with a Z; the UID names the session and survives a changed time", () => {
  const a = I.build([CONVENTIONAL], { now: NOW });
  const moved = JSON.parse(JSON.stringify(CONVENTIONAL));
  moved.sessions.q.time = "15:00:00Z";
  const b = I.build([moved], { now: NOW + 86400000 });
  assert.deepEqual(props(a, "UID"), props(b, "UID"));
  assert.ok(props(a, "UID").includes("UID:2026-r7-q@apex26"));
  for (const l of props(a, "DTSTART")) assert.match(l, /^DTSTART:\d{8}T\d{6}Z$/);
  assert.ok(props(a, "DTSTART").includes("DTSTART:20260516T140000Z"));
  assert.ok(props(b, "DTSTART").includes("DTSTART:20260516T150000Z"));
  assert.ok(Number(props(b, "SEQUENCE")[0].split(":")[1]) > Number(props(a, "SEQUENCE")[0].split(":")[1]), "the newer export wins");
});

test("sprint weekend carries SQ and Sprint; conventional carries FP2/FP3", () => {
  const uids = (r) => props(I.build([r], { now: NOW }), "UID").map((l) => l.slice(4).split("@")[0].split("-").pop());
  assert.deepEqual(uids(SPRINT), ["fp1", "sq", "s", "q", "r"]);
  assert.deepEqual(uids(CONVENTIONAL), ["fp1", "fp2", "fp3", "q", "r"]);
  assert.ok(props(I.build([SPRINT], { now: NOW }), "SUMMARY").some((l) => l.endsWith("· Sprint Qualifying")));
});

test("date-only race: one all-day VALUE=DATE event, no 00:00Z instant, no alarm", () => {
  const ics = I.build([DATE_ONLY], { now: NOW, alarmMin: 60 });
  assert.deepEqual(props(ics, "DTSTART"), ["DTSTART;VALUE=DATE:20261206"]);
  assert.deepEqual(props(ics, "DTEND"), ["DTEND;VALUE=DATE:20261207"]);
  assert.equal(ics.includes("VALARM"), false);
  assert.deepEqual(props(ics, "UID"), ["UID:2026-r24-r@apex26"]);
});

test("the reminder picker feeds VALARM; an unknown offset means none", () => {
  assert.equal(I.trigger(15), "-PT15M");
  assert.equal(I.trigger(60), "-PT1H");
  assert.equal(I.trigger(1440), "-P1D");
  const ics = I.build([CONVENTIONAL], { now: NOW, alarmMin: 1440 });
  assert.equal(props(ics, "TRIGGER").length, 5);
  assert.ok(props(ics, "TRIGGER").every((l) => l === "TRIGGER:-P1D"));
  assert.equal(I.build([CONVENTIONAL], { now: NOW, alarmMin: 0 }).includes("VALARM"), false);
  assert.equal(I.build([CONVENTIONAL], { now: NOW, alarmMin: 7 }).includes("VALARM"), false);
});

test("Jolpica attribution rides every event; file names are stable", () => {
  const ics = I.build([SPRINT], { now: NOW });
  assert.ok(props(ics, "DESCRIPTION").every((l) => l.includes("Jolpica F1")));
  assert.equal(I.fileName([SPRINT], false), "apex26-f1-2026-r21.ics");
  assert.equal(I.fileName([CONVENTIONAL, SPRINT], true), "apex26-f1-2026.ics");
  assert.match(I.build([], { now: NOW }), /^BEGIN:VCALENDAR[\s\S]*END:VCALENDAR\r\n$/);
});
