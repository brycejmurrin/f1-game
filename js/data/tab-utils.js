/* Apex 26 — shared Data Hub driver colors and lane identity counts. */
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

  function countsByDriver(entries) {
    const counts = {};
    entries.forEach(function (entry) {
      counts[entry.d.num] = (counts[entry.d.num] || 0) + 1;
    });
    return counts;
  }

  return { driverColor, countsByDriver };
})();
Object.freeze(DataTabUtils);
