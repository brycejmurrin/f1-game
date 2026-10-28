/* Apex 26 — the Schedule tab's calendar export: an RFC 5545 VCALENDAR string built from the cached Jolpica schedule. Pure, no DOM. */
const DataIcs = (function () {
  "use strict";

  /* RFC 5545 (https://datatracker.ietf.org/doc/html/rfc5545), the parts a phone calendar reads:
     CRLF line ends (§3.1), lines folded at 75 OCTETS with a one-space continuation and never inside a
     UTF-8 sequence (§3.1), TEXT escaping of \ ; , and newline (§3.3.11), UTC DATE-TIME with a Z and no
     TZID (§3.3.5 form 2, so no VTIMEZONE block and no DST arithmetic), DATE values for an all-day event
     (§3.3.4). The UID is the session, never its title or time, so a corrected time re-imports as an
     update; SEQUENCE counts days since 2026-01-01 so the newer export wins. Plan:
     docs/plans/2026-10-04-pwa-shortcuts-calendar.md §D. */
  const CRLF = "\r\n";
  const FOLD = 75;
  const SEQ_EPOCH = Date.UTC(2026, 0, 1);
  const DAY_MS = 86400000;
  const NAMES = Object.freeze({
    fp1: "Practice 1", fp2: "Practice 2", fp3: "Practice 3",
    sq: "Sprint Qualifying", s: "Sprint", q: "Qualifying", r: "Race"
  });
  const CREDIT = "Times from Jolpica F1 schedule data (CC BY-NC-SA 4.0); unofficial, verify with F1.com. " +
    "End times are estimates.";
  const ALARMS = Object.freeze([0, 15, 30, 60, 1440]);

  function octets(cp) { return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4; }

  // One content line → folded physical lines. Iterating code points keeps a
  // multibyte character (São Paulo, Monza's "Autodromo", an emoji) whole.
  function fold(line) {
    let out = "", used = 0, limit = FOLD;
    for (const ch of line) {
      const n = octets(ch.codePointAt(0));
      if (used + n > limit) { out += CRLF + " "; used = 0; limit = FOLD - 1; }
      out += ch;
      used += n;
    }
    return out + CRLF;
  }

  function text(s) {
    return String(s == null ? "" : s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,")
      .replace(/\r\n|\r|\n/g, "\\n");
  }

  function utc(ms) {
    return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  }
  function dateValue(ymd) { return ymd.replace(/-/g, ""); }
  function nextDay(ymd) { return new Date(Date.parse(ymd + "T00:00:00Z") + DAY_MS).toISOString().slice(0, 10); }

  function trigger(min) {
    if (min % 1440 === 0) return "-P" + min / 1440 + "D";
    if (min % 60 === 0) return "-PT" + min / 60 + "H";
    return "-PT" + min + "M";
  }

  function raceYear(r) { return r && /^\d{4}/.test(r.date || "") ? r.date.slice(0, 4) : "0000"; }
  function raceKey(r) { return r.round != null ? "r" + r.round : "d" + dateValue(r.date || ""); }
  function place(r) { return [r.circuit, r.locality, r.country].filter(Boolean).join(", "); }

  // One race → its VEVENTs. Timed sessions come from DataSchedule.weekendSessions (the NEXT tile's own
  // list, so sprint weekends carry SQ/S and conventional ones FP2/FP3). A date-only race with no timed
  // session is one all-day event and gets NO alarm: a reminder before midnight UTC would be a lie.
  function raceEvents(r, opt) {
    const base = raceYear(r) + "-" + raceKey(r);
    const loc = place(r);
    const ev = [];
    const sessions = DataSchedule.weekendSessions(r);
    for (const s of sessions) {
      const lines = [
        "BEGIN:VEVENT",
        "UID:" + base + "-" + s.key + "@apex26",
        "DTSTAMP:" + opt.stamp,
        "SEQUENCE:" + opt.seq,
        "DTSTART:" + utc(s.startMs),
        "DTEND:" + utc(s.endMs),
        "SUMMARY:" + text((r.name || "Grand Prix") + " · " + NAMES[s.key])
      ];
      if (loc) lines.push("LOCATION:" + text(loc));
      lines.push("DESCRIPTION:" + text(CREDIT), "TRANSP:TRANSPARENT");
      if (opt.alarmMin > 0) {
        lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:" + trigger(opt.alarmMin),
          "DESCRIPTION:" + text((r.name || "Grand Prix") + " " + NAMES[s.key]), "END:VALARM");
      }
      lines.push("END:VEVENT");
      ev.push(lines);
    }
    if (!sessions.length && /^\d{4}-\d{2}-\d{2}$/.test(r.date || "")) {
      const lines = [
        "BEGIN:VEVENT",
        "UID:" + base + "-r@apex26",
        "DTSTAMP:" + opt.stamp,
        "SEQUENCE:" + opt.seq,
        "DTSTART;VALUE=DATE:" + dateValue(r.date),
        "DTEND;VALUE=DATE:" + dateValue(nextDay(r.date)),
        "SUMMARY:" + text((r.name || "Grand Prix") + " · Race (time TBC)")
      ];
      if (loc) lines.push("LOCATION:" + text(loc));
      lines.push("DESCRIPTION:" + text(CREDIT), "TRANSP:TRANSPARENT", "END:VEVENT");
      ev.push(lines);
    }
    return ev;
  }

  // build(races, { alarmMin, now, name }) → the .ics text. `now` pins DTSTAMP and SEQUENCE (tests);
  // `alarmMin` is one of ALARMS (0 = no VALARM).
  function build(races, options) {
    const o = options || {};
    const now = Number.isFinite(o.now) ? o.now : Date.now();
    const alarmMin = ALARMS.indexOf(o.alarmMin) >= 0 ? o.alarmMin : 0;
    const opt = { stamp: utc(now), seq: Math.max(0, Math.floor((now - SEQ_EPOCH) / DAY_MS)), alarmMin };
    const lines = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Apex 26//Race Weekend//EN", "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH", "X-WR-CALNAME:" + text(o.name || "F1 calendar · Apex 26")
    ];
    for (const r of races || []) if (r) for (const ev of raceEvents(r, opt)) lines.push.apply(lines, ev);
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("");
  }

  function fileName(races, whole) {
    const first = (races || [])[0];
    const year = first ? raceYear(first) : "season";
    return whole || !first ? "apex26-f1-" + year + ".ics" : "apex26-f1-" + year + "-" + raceKey(first) + ".ics";
  }

  return { build, fileName, fold, text, trigger, ALARMS };
})();
Object.freeze(DataIcs);
