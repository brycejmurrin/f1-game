#!/usr/bin/env node
// Will every design actually be SEEN where it lands?
// @doc Sweeps every team x spine design offline and reports any large area that fails to separate from what it covers.
// @skill garage-parts-livery
//
// Three failures shipped this week and all three are the same shape: a colour
// that owns a big piece of a panel and does not separate from what is under it.
// The crown band had a guard (BAND_ON_COVER); the wrap's sun did not, and painted
// #ffec00 on Ferrari's #f2f2f5 cover at 1.09:1. The flank bands scored against the
// COVER while standing on a flank the crown design had already repainted, so on a
// saddle car the culled split/bars/slash fills painted that colour onto itself
// at 1.00:1 (band/sash now carry the fill role and re-pick against the flank).
//
// Each site answers the question with its own threshold — there are nine of them
// in liverytex.js, from 1.6 to 6.5 — so a new design is only as safe as whoever
// wrote it remembering to ask. This asks ONCE, of every combination, and knows
// nothing about which code path painted what: it replays the real buildAtlas into
// the recording 2D context crest-sweep.mjs already trusts, finds the ops that own
// a meaningful share of a region, and compares each against the paint beneath it.
//
//   node tools/car/livery-contrast.mjs              every team × TOP × SIDE
//   node tools/car/livery-contrast.mjs --team=ferrari
//   node tools/car/livery-contrast.mjs --json       machine-readable
//
// Exit 1 when anything is below the floor.

import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCrests, paintAt } from "./crest-sweep.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { RecCtx } = loadCrests();

// A metre-long band is not lettering: the floor is the crown band's, which Red
// Bull's bull clears at 2.26 against its navy and reads on track.
export const AREA_FLOOR = 2.0;
// Below this share of a panel it is a detail, not the thing you see first.
export const AREA_SHARE = 0.15;

export function loadAtlas() {
  let made = [];
  const sb = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Math, Object, Array, String, Number, JSON, Map, Set, isNaN, isFinite, parseInt, parseFloat,
    document: { querySelector: () => null,
      createElement: () => { const c = new RecCtx(); made.push(c);
        return { getContext: () => c, set width(v) {}, set height(v) {},
                 get width() { return 1024; }, get height() { return 1280; } }; } },
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const f of ["js/core/log.js", "js/data/teams.js", "js/car/liveries.js",
                   "js/car/crest-paths.js", "js/car/liverytex.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), sb, { filename: f });
  const grab = (n) => vm.runInContext(n, sb);
  return { LT: grab("LiveryTex"), Teams: grab("Teams"), Liveries: grab("Liveries"),
           paint: (id, colors) => { made = []; grab("LiveryTex").buildAtlas(id, colors, 16, true); return made[0].ops; } };
}

const lum = (css) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css || "");
  if (!m) return null;
  const f = (v) => { v = +v / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(m[1]) + 0.7152 * f(m[2]) + 0.0722 * f(m[3]);
};
const contrast = (a, b) => {
  const la = lum(a), lb = lum(b);
  if (la == null || lb == null) return null;
  return +((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)).toFixed(2);
};
// A translucent pass is a halo or a wash, not the paint: comparing the ink to
// ITS OWN halo measures the halo and reports every glyph on the car.
const alphaOf = (st) => { const m = /rgba\([^)]*,\s*(0?\.\d+|0|1)\)/.exec(st || ""); return m ? +m[1] : 1; };
const geo = (o) => (o.pts || []).flat().join(",");

/** Sweep one atlas. `regions` are REGIONS keys; `n` is the sampling grid. */
export function sweepAtlas(A, teamId, colors, regions, n = 24) {
  const ops = A.paint(teamId, colors), out = [];
  for (const rn of regions) {
    const R = A.LT.REGIONS[rn];
    if (!R) continue;
    const owner = new Map();
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const px = R.x + R.w * (i + 0.5) / n, py = R.y + R.h * (j + 0.5) / n;
      let top = -1;
      for (let k = 0; k < ops.length; k++) if (paintAt([ops[k]], px, py)) top = k;
      if (top < 0) continue;
      if (!owner.has(top)) owner.set(top, []);
      owner.get(top).push([px, py]);
    }
    for (const [k, pts] of owner) {
      if (pts.length / (n * n) < AREA_SHARE) continue;
      const op = ops[k];
      if (alphaOf(op.style) < 0.5) continue;
      // drawCrest replays the whole crest up to four times when a halo fires:
      // identical geometry in an identical style is a REDRAW, not a colour
      // landing on itself, and counting it reports every crest at 1.00.
      if (ops.slice(0, k).some((o) => o.style === op.style && geo(o) === geo(op))) continue;
      const below = ops.slice(0, k).filter((o) => alphaOf(o.style) >= 0.9);
      let worst = null, over = null;
      for (const [px, py] of pts) {
        const u = paintAt(below, px, py);
        if (!u) continue;
        const c = contrast(op.style, u);
        if (c != null && (worst == null || c < worst)) { worst = c; over = u; }
      }
      if (worst != null && worst < AREA_FLOOR)
        out.push({ region: rn, paint: op.style, over, contrast: worst,
                   share: +(pts.length / (n * n)).toFixed(2) });
    }
  }
  return out;
}

/** Every team x spineLogo x spineSide. */
export function sweepAll(A, { teams, regions = ["crest", "spineSide", "spineSideL", "tail", "fin"], n = 24 } = {}) {
  const rows = [];
  for (const t of (teams || A.Teams.LIST)) {
    const base = A.Liveries.forTeam(t)[0];
    for (const spineLogo of A.LT.SPINE_LOGO_IDS)
      for (const spineSide of A.LT.SPINE_SIDE_IDS)
        for (const hit of sweepAtlas(A, t.id, Object.assign({}, base, { spineLogo, spineSide }), regions, n))
          rows.push({ team: t.id, spineLogo, spineSide, ...hit });
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const h = process.argv.find((a) => a.startsWith(`--${k}=`)); return h ? h.slice(k.length + 3) : d; };
  const A = loadAtlas();
  const only = arg("team", null);
  const teams = only ? A.Teams.LIST.filter((t) => t.id === only) : A.Teams.LIST;
  const rows = sweepAll(A, { teams });
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows, null, 1));
  else {
    console.log(`${rows.length} large-area failure(s) below ${AREA_FLOOR}:1`);
    for (const r of rows)
      console.log(`  ${r.contrast.toFixed(2)}  ${r.team} ${r.spineLogo}/${r.spineSide} ${r.region}: ${r.paint} over ${r.over} (${(r.share * 100).toFixed(0)}% of the panel)`);
  }
  process.exitCode = rows.length ? 1 : 0;
}
