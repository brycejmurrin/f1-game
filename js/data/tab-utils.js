const DataTabUtils = (function () {
  "use strict";

  function driverColor(d, findTeam, fallback) {
    if (d && d.color && /^[0-9a-fA-F]{6}$/.test(d.color)) {
      return [parseInt(d.color.slice(0, 2), 16) / 255,
              parseInt(d.color.slice(2, 4), 16) / 255,
              parseInt(d.color.slice(4, 6), 16) / 255];
    }
    const team = findTeam(d && d.team);
    return team ? team.color : fallback;
  }

  function countsByDriver(entries) {
    const counts = {};
    entries.forEach(function (entry) {
      counts[entry.d.num] = (counts[entry.d.num] || 0) + 1;
    });
    return counts;
  }

  function placeLabel(circuit, country, sep) {
    if (typeof F1API !== "undefined" && F1API.placeLabel) return F1API.placeLabel(circuit, country, sep);
    return [circuit, country].filter(Boolean).join(sep || ", ");
  }

  function sessionSuffix(counts, num, sessionLabel) {
    return counts && counts[num] > 1 && sessionLabel ? " " + sessionLabel : "";
  }

  function liveLockout(err) {
    const status = err && err.status;
    return status === 401 || status === 403;
  }
  const LOCKOUT_TITLE = "LIVE SESSION IN PROGRESS";
  const LOCKOUT_MSG = "OpenF1's free feed pauses from 30 minutes before a session until 30 minutes after it ends. " +
    "Sessions already loaded on this device still open; live timing returns after the session.";

  return { driverColor, countsByDriver, placeLabel, sessionSuffix, liveLockout, LOCKOUT_TITLE, LOCKOUT_MSG };
})();
Object.freeze(DataTabUtils);
