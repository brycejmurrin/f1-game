#!/usr/bin/env node
// circuit-info.cjs — one circuit's headline facts from the REAL build, no browser.
// @doc One circuit's facts from the real build, no browser: lengthKm, built lap m, turns, sectors, corner count; `--json`.
// @skill agent-view
//
//   node tools/track/circuit-info.cjs <trackId>          # one line per fact
//   node tools/track/circuit-info.cjs <trackId> --json   # {ok, track, name, lengthKm, builtM, turns, turnCount, sectors, cornerCount, cornerApex}
//
// WHY (#4287): a cold agent asked "Monza's corner count and lap length?" grepped
// js/circuits/monza.js and read the built length from a COMMENT, which drifts from
// the build. Here every number comes from the engine in a Node VM (the TRACK_VM
// load list, via verify-track's buildContext), ~0.5 s:
//   lengthKm     def.lengthKm, the official lap the circuit file declares
//   builtM       Tracks.buildCenterline(def).total, the built lap in metres — the
//                denominator of def.turns / def.sectors fractions
//   turns        def.turns, the curated FIA turn apexes (lap fractions)
//   sectors      def.sectors, the curated sector splits (lap fractions)
//   cornerCount  TrackLine's corner detector (js/track/core/line.js, K_ON / MIN_LEN_M):
//                the bends the racing line apexes, NOT a hand count of turns —
//                flat-out kinks fall under it and a chicane can count as one or two
//   cornerApex   each detected corner's apex as a lap fraction
// Exit 2 on an unknown id (the message lists the valid ones).
"use strict";

const { buildContext } = require("./verify-track.cjs");

const round = (v, d) => +(+v).toFixed(d);

function circuitInfo(id, Tracks) {
  Tracks = Tracks || buildContext(null, { quiet: true });
  const def = Tracks.LIST.find((d) => d.id === id);
  if (!def) {
    const err = new Error(`unknown circuit "${id}" — one of: ${Tracks.LIST.map((d) => d.id).join(", ")}`);
    err.code = "UNKNOWN_TRACK";
    throw err;
  }
  const track = Tracks.buildCenterline(def);
  const total = track.total;
  const corners = track.lineCorners || [];
  return {
    ok: true,
    track: def.id,
    name: def.name,
    lengthKm: def.lengthKm,
    builtM: round(total, 2),
    turns: (def.turns || []).slice(),
    turnCount: (def.turns || []).length,
    sectors: (def.sectors || []).slice(),
    cornerCount: corners.length,
    cornerApex: corners.map((c) => round((((c.sApex % total) + total) % total) / total, 4)),
  };
}

function main(argv) {
  const json = argv.includes("--json");
  const id = argv.find((a) => !a.startsWith("--"));
  if (!id || argv.includes("--help")) {
    process.stdout.write("usage: node tools/track/circuit-info.cjs <trackId> [--json]\n");
    process.exit(id ? 0 : 2);
  }
  let info;
  try { info = circuitInfo(String(id).toLowerCase()); }
  catch (e) {
    if (json) process.stdout.write(JSON.stringify({ ok: false, error: e.message }) + "\n");
    else process.stderr.write(e.message + "\n");
    process.exit(e.code === "UNKNOWN_TRACK" ? 2 : 1);
  }
  if (json) { process.stdout.write(JSON.stringify(info) + "\n"); return; }
  const lines = [
    `${info.track} — ${info.name}`,
    `lengthKm     ${info.lengthKm}`,
    `builtM       ${info.builtM}`,
    `turns        ${info.turnCount}  [${info.turns.join(", ")}]`,
    `sectors      [${info.sectors.join(", ")}]`,
    `cornerCount  ${info.cornerCount}  (racing-line corner detector)`,
  ];
  process.stdout.write(lines.join("\n") + "\n");
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { circuitInfo };
