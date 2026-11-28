/* Apex 26 — shared Data Hub driver colors, lane identity counts and the OpenF1 live-window test. */
const DataTabUtils = (function () {
  "use strict";

  // Callers choose their existing missing-team fallback (LIVE: null;
  // TELEMETRY: gray). OpenF1's unprefixed six-digit color takes precedence.
  function driverColor(d, findTeam, fallback) {
    if (d && d.color && /^[0-9a-fA-F]{6}$/.test(d.color)) {
      return [parseInt(d.color.slice(0, 2), 16) / 255,
              parseInt(d.color.slice(2, 4), 16) / 255,
              parseInt(d.color.slice(4, 6), 16) / 255];
    }
    const team = findTeam(d && d.team);
    return team ? team.color : fallback;
  }

  // A near-black team colour (luminance < 0.10) reads as a hole on the dark
  // hub panel: swap in the team's second colour when it has one. One rule for
  // STANDINGS' row bar and LIVE's code chip (Bryce's pick, #7422 row 4).
  function teamShade(color, team) {
    if (!color || !team || !team.color2) return color;
    const lum = 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
    return lum < 0.10 ? team.color2 : color;
  }

  function countsByDriver(entries) {
    const counts = {};
    entries.forEach(function (entry) {
      counts[entry.d.num] = (counts[entry.d.num] || 0) + 1;
    });
    return counts;
  }

  // Same join as F1API.placeLabel: an omitted separator is ", ".
  function placeLabel(circuit, country, sep) {
    if (typeof F1API !== "undefined" && F1API.placeLabel) return F1API.placeLabel(circuit, country, sep);
    return [circuit, country].filter(Boolean).join(sep || ", ");
  }

  // A second lane with the same car number shows its session; one lane does not.
  function sessionSuffix(counts, num, sessionLabel) {
    return counts && counts[num] > 1 && sessionLabel ? " " + sessionLabel : "";
  }

  // OPENF1'S LIVE WINDOW. The free tier refuses requests from 30 minutes
  // before a session until 30 minutes after it ends ("Data is considered live
  // from 30 minutes before a session starts until 30 minutes after it ends",
  // https://openf1.org/ FAQ). The refusal is HTTP 401/403, and the status is
  // the signal — js/data/api-transport.js keeps it on every wrapped error and
  // replaces the message with the server's `detail`, so text is not.
  function liveLockout(err) {
    const status = err && err.status;
    return status === 401 || status === 403;
  }
  const LOCKOUT_TITLE = "LIVE SESSION IN PROGRESS";
  const LOCKOUT_MSG = "OpenF1's free feed pauses from 30 minutes before a session until 30 minutes after it ends. " +
    "Sessions already loaded on this device still open; live timing returns after the session.";

  return { driverColor, teamShade, countsByDriver, placeLabel, sessionSuffix, liveLockout, LOCKOUT_TITLE, LOCKOUT_MSG };
})();
Object.freeze(DataTabUtils);
