#!/usr/bin/env node
/**
 * @doc Golden track-query grid (VM): Tracks.sample/banking/onKerb/wallAt/inPitLane as raw doubles for the apex-26 port gate.
 * @skill agent-view
 *
 * track-oracle — the track half of tools/check/physics-oracle.mjs. Builds the
 * circuit through the same pinned VM boot (tools/lib/game-vm.cjs, scenery
 * resident, so wallAt reads the barriers the props placed) and samples the
 * track engine on a fixed grid: N evenly spaced arc positions s = i·total/N,
 * each crossed with lateral x = f·hw for f ∈ {-1, -0.5, 0, 0.5, 1}. apex-26's
 * TypeScript track engine must reproduce every value bit for bit.
 * Why: docs/notes/PHYSICS-ORACLE-2026-10-18.md.
 *
 *   node tools/check/track-oracle.mjs                    # monza, 2000 s values → artifacts/oracle/track-monza.json
 *   node tools/check/track-oracle.mjs --track spa --samples 500 --out scratch/oracle
 *
 * Row schema (one per s): { s, p, t, r, hw, wallR, wallL, lat: [{ f, x, bank, onKerb, inPitLane }] }
 *   p/t/r/hw   Tracks.sample(track, s)          wallR/wallL  Tracks.wallAt(track, s, +1 / -1)
 *   bank       Tracks.banking(track, s, x) → { dy, roll }, or null on a flat section
 * Non-finite numbers and -0 are strings, as in physics-oracle (`encodeNumber`).
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { parseFlags } from "../lib/cli-args.mjs";
import { bootPinned, header, stringify } from "./physics-oracle.mjs";
const require = createRequire(import.meta.url);
const { ROOT } = require("../lib/game-vm.cjs");

export const LATERAL = Object.freeze([-1, -0.5, 0, 0.5, 1]);

/** The grid for a built track, as plain data. */
export function grid(Tracks, track, samples) {
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  const rows = [];
  for (let i = 0; i < samples; i++) {
    const s = i * track.total / samples;
    Tracks.sample(track, s, smp);
    const hw = smp.hw;
    rows.push({ s, p: smp.p.slice(), t: smp.t.slice(), r: smp.r.slice(), hw,
      wallR: Tracks.wallAt(track, s, 1), wallL: Tracks.wallAt(track, s, -1),
      lat: LATERAL.map((f) => {
        const x = f * hw, b = Tracks.banking(track, s, x);
        return { f, x, bank: b ? { dy: b.dy, roll: b.roll } : null,
          onKerb: Tracks.onKerb(track, s, x), inPitLane: !!Tracks.inPitLane(track, s, x) };
      }) });
  }
  return rows;
}

const FLAGS = ["--track", "--samples", "--out", "--help"];

export async function main(argv) {
  const f = parseFlags(argv, FLAGS);
  if (f.has("--help")) { console.log("track-oracle [--track monza] [--samples 2000] [--out artifacts/oracle]"); return 0; }
  const track = f.flag("--track", "monza");
  const samples = Number(f.flag("--samples", "2000"));
  if (!Number.isInteger(samples) || samples < 1) throw new Error("track-oracle: --samples wants an integer >= 1");
  const out = path.resolve(ROOT, f.flag("--out", path.join("artifacts", "oracle")));
  const g = await bootPinned(track);
  try {
    const T = g.G.track;
    const doc = { header: header(g, track, { samples, lateral: LATERAL, total: T.total, n: T.n }),
      rows: grid(g.sandbox.Tracks, T, samples) };
    fs.mkdirSync(out, { recursive: true });
    const file = path.join(out, `track-${track}.json`);
    fs.writeFileSync(file, stringify(doc));
    console.log(path.relative(ROOT, file));
    return 0;
  } finally { g.close(); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (e) => { console.error(e && e.message || e); process.exit(1); });
}
