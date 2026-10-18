// Fleet probe for barrier/run-off clearance jumps, including pit edges.
"use strict";

const { maxAdjOver } = require("../../tools/track/barrier-jumps.cjs");

function measureTrack(def, track) {
  const pit = track.pit;
  const oppositePitBar = pit && !pit.painted
    ? (pit.side > 0 ? track.barL : track.barR)
    : null;
  let nonPitWindowMax = 0;
  if (oppositePitBar) {
    for (let k = 0; k < track.n; k++) {
      const j = (k + 1) % track.n;
      if (!(pit.keep[k] > 0 || pit.keep[j] > 0)) continue;
      const jump = Math.abs(
        (oppositePitBar[k] - track.hw[k])
        - (oppositePitBar[j] - track.hw[j]),
      );
      nonPitWindowMax = Math.max(nonPitWindowMax, jump);
    }
  }
  return {
    id: def.id,
    className: def.street ? "street" : "open",
    maxAdjOver: Math.max(
      maxAdjOver(track.barL, track.hw),
      maxAdjOver(track.barR, track.hw),
    ),
    nonPitWindowMax,
    hasPitComplex: !!oppositePitBar,
  };
}

function probeFleet(env) {
  const rows = [];
  for (const def of env.Tracks.LIST) {
    let track;
    try {
      track = env.Tracks.build(def);
      rows.push(measureTrack(def, track));
    } finally {
      env.trim(0);
      env.release(track);
    }
  }
  return rows;
}

function capViolations(rows, caps) {
  return rows.filter((row) => row.maxAdjOver > caps[row.className]);
}

function assertFleetCaps(rows, caps) {
  const bad = capViolations(rows, caps);
  if (bad.length) {
    throw new Error(bad.map((row) =>
      `${row.id} (${row.className}) ${row.maxAdjOver.toFixed(3)} > ${caps[row.className]}`,
    ).join("; "));
  }
}

module.exports = {
  assertFleetCaps,
  capViolations,
  measureTrack,
  probeFleet,
};
