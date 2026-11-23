#!/usr/bin/env node
/**
 * gen-quali-calib.mjs — the CALIB block of js/race/quali-model.js.
 * @doc Regenerates the qualifying factors in `js/race/quali-model.js` from `tests/data/quali-calibration.json`; `--check`.
 * @skill race-weekend
 *
 *   node tools/gen/gen-quali-calib.mjs            # write
 *   node tools/gen/gen-quali-calib.mjs --check    # exit 1 when committed ≠ generated
 *
 * Arithmetic only (milliseconds): the slow part, driving the solo qualifying laps, is the tool run
 * `node tools/check/quali-calibrate.mjs --update`, whose output is the committed SOURCE. One
 * factor per circuit: the median, over every measured car at easy, normal and hard, of its
 * qualifying flying lap over the model's uncalibrated lap, to 4 decimals. CALIB_DEFAULT is the
 * median of the factors (a circuit with no row).
 */
import fs from "node:fs";
import path from "node:path";
import { emit, isMain, readRepo, ROOT } from "./gen-lib.mjs";

export const TARGET = "js/race/quali-model.js";
export const SOURCE = "tests/data/quali-calibration.json";
const OPEN = "  // @gen-quali-calib start", CLOSE = "  // @gen-quali-calib end";
const PER_LINE = 6;

const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2; };

/** { id: factor } and the default, as the strings the block prints. */
export function factors(data = JSON.parse(readRepo(SOURCE))) {
  const hz = data.method.hz, out = {};
  for (const id of Object.keys(data.cells).sort()) {
    const rs = [];
    for (const lv of data.method.levels) for (const [, , frames, ms] of data.cells[id][lv]) if (frames > 0 && ms > 0) rs.push((frames / hz) / (ms / 1000));
    if (rs.length < 12) throw new Error(`${SOURCE}: ${id} has ${rs.length} timed cars; re-measure it (quali-calibrate.mjs --update --track ${id})`);
    const k = median(rs);
    // A factor is the integrated lap's known shortfall, a few per cent: outside this a measurement broke.
    if (!(k >= 0.9 && k <= 1.1)) throw new Error(`${SOURCE}: ${id} factor ${k.toFixed(4)} outside [0.9, 1.1]; the measurement is broken, not the circuit`);
    out[id] = k.toFixed(4);
  }
  const want = fs.readdirSync(path.join(ROOT, "js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3));
  const missing = want.filter((id) => !out[id]), extra = Object.keys(out).filter((id) => !want.includes(id));
  if (missing.length || extra.length) throw new Error(`${SOURCE}: not the calendar (missing ${missing.join(", ") || "none"}; unknown ${extra.join(", ") || "none"}); run quali-calibrate.mjs --update --track <id>`);
  const ids = Object.keys(out);
  if (!ids.length) throw new Error(`${SOURCE}: no circuits`);
  return { by: out, def: median(ids.map((id) => +out[id])).toFixed(4) };
}

export function render(src = readRepo(TARGET), f = factors()) {
  const a = src.indexOf(OPEN), b = src.indexOf(CLOSE);
  if (a < 0 || b < a) throw new Error(`${TARGET}: @gen-quali-calib markers not found`);
  const ids = Object.keys(f.by), lines = [];
  for (let i = 0; i < ids.length; i += PER_LINE) lines.push("    " + ids.slice(i, i + PER_LINE).map((id) => `${id}: ${f.by[id]}`).join(", ") + ",");
  const body = `  const CALIB = {\n${lines.join("\n")}\n  };\n  const CALIB_DEFAULT = ${f.def};\n`;
  return src.slice(0, a) + OPEN + "\n" + body + src.slice(b);
}

if (isMain(import.meta.url)) process.exitCode = emit(TARGET, render());
