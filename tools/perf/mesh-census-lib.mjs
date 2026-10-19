// @doc Pure aggregation for mesh-census: pass/source/distance bands + #2657 recommend.
// mesh-census-lib.mjs — parser/aggregation only (no browser). Unit tests:
// tests/unit/mesh-census.test.mjs.

/** Distance band for #2657's 150 m cut. */
export function distanceBand(metres, threshold = 150) {
  if (!Number.isFinite(metres)) return "unknown";
  return metres < threshold ? "near" : "far";
}

/**
 * Source family for #2657: ground/terrain ribbons vs quad-soup props.
 * TLX labels come from mesh userData flags; GLX labels from stack-site tags.
 */
export function classifySource(label) {
  const s = String(label || "").toLowerCase();
  if (!s || s === "unflagged" || s === "other") return "other";
  if (/\btlxlgroad\b|\broad\b|\bterrain\b|\bkerb\b|\bbarrier\b|\bribbon\b|\btrk\b|\bskirt\b/.test(s)) {
    return "ribbon";
  }
  if (/\btlxbatch\b|\bprops?\b|\binst\b|\bscenery\b|\bbatch\b|\bquad\b/.test(s)) {
    return "props";
  }
  return "other";
}

/**
 * Map a render-target key to a logical pass.
 * Shadow / env / post are never presented as the main scene (#2631 contract).
 * Unnamed TLX mirror targets are often just `rt 207x59` (no "mirror" in the name).
 */
export function classifyPass(key) {
  const k = String(key || "").toLowerCase();
  if (!k || k === "canvas") return "main";
  if (/mirror|rear|hud-mirror|pip/.test(k)) return "mirror";
  if (/shadow|depth|sunshadow|carshadow|lampshadow/.test(k)) return "shadow";
  if (/env|cube|probe|post|bloom|ssao|fxaa|sgsr|composite|godray/.test(k)) return "aux";
  const dim = k.match(/(\d+)\s*x\s*(\d+)/);
  if (dim) {
    const w = +dim[1], h = +dim[2];
    // Square power-of-two → shadow / depth atlas (not the HUD mirror).
    if (w === h && (w === 256 || w === 512 || w === 1024 || w === 2048)) return "shadow";
    // HUD mirror / PiP: wide short targets (pass-census: ~207×59, lite ~138×39).
    // Aspect ≥ 2.2 keeps bloom mips (≈16:9) out of the mirror bucket.
    if (h <= 160 && w / Math.max(1, h) >= 2.2) return "mirror";
  }
  // Named HDR / scene colour targets are the main lit pass.
  if (/output|scene|hdr|color|main/.test(k)) return "main";
  // Soft-present / main colour RTs are large and non-square.
  if (dim && (+dim[1] * +dim[2]) >= 80_000) return "main";
  return "aux";
}

/** Empty accumulator cell. */
export function emptyCell() {
  return { draws: 0, tris: 0, calls: 0, samples: 0 };
}

/**
 * rows: [{ pass, source, band, draws, tris, calls }]
 * → nested map pass → source → band → totals (sums), plus pass totals.
 */
export function aggregateRows(rows, { threshold = 150 } = {}) {
  const by = Object.create(null);
  const passTotals = Object.create(null);
  for (const r of rows || []) {
    const pass = r.pass || classifyPass(r.passKey || r.key);
    if (pass === "shadow" || pass === "aux") continue; // #2631: not the main scene
    const source = r.source || classifySource(r.group || r.label);
    const band = r.band || distanceBand(r.dist, threshold);
    by[pass] ||= Object.create(null);
    by[pass][source] ||= Object.create(null);
    by[pass][source][band] ||= emptyCell();
    const cell = by[pass][source][band];
    cell.draws += r.draws || 0;
    cell.tris += r.tris || 0;
    cell.calls += r.calls || 0;
    cell.samples += 1;
    passTotals[pass] ||= emptyCell();
    passTotals[pass].draws += r.draws || 0;
    passTotals[pass].tris += r.tris || 0;
    passTotals[pass].calls += r.calls || 0;
    passTotals[pass].samples += 1;
  }
  return { by, passTotals, threshold };
}

/** Average a cell over `frames` (per-frame means). */
export function perFrame(cell, frames) {
  const n = Math.max(1, frames | 0);
  return {
    draws: +(cell.draws / n).toFixed(2),
    tris: Math.round(cell.tris / n),
    calls: +(cell.calls / n).toFixed(2),
  };
}

/**
 * Flatten one circuit/backend aggregate into table rows for markdown / JSON.
 * frames: measured game frames used as the denominator.
 */
export function tableRows(agg, frames) {
  const out = [];
  for (const pass of ["main", "mirror"]) {
    const sources = agg.by[pass] || {};
    for (const source of ["ribbon", "props", "other"]) {
      const bands = sources[source] || {};
      for (const band of ["near", "far", "unknown"]) {
        const cell = bands[band];
        if (!cell || !(cell.tris || cell.calls || cell.draws)) continue;
        const pf = perFrame(cell, frames);
        out.push({ pass, source, band, ...pf, threshold: agg.threshold });
      }
    }
  }
  return out;
}

/** Markdown table from tableRows(). */
export function formatBandTable(rows, { title } = {}) {
  const lines = [];
  if (title) lines.push(`### ${title}`, "");
  lines.push("| pass | source | band | calls/frame | tris/frame |");
  lines.push("|---|---|---|---:|---:|");
  for (const r of rows) {
    lines.push(`| ${r.pass} | ${r.source} | ${r.band} (<${r.threshold} m = near) | ${r.calls} | ${r.tris} |`);
  }
  if (rows.length === 0) lines.push("| — | — | — | 0 | 0 |");
  return lines.join("\n");
}

/**
 * Recommendation for #2657 step 2 and which #2631 experiments are worth running.
 * Inputs are per-frame triangle means (already averaged).
 */
export function recommend(stats) {
  // stats: { mainRibbonNear, mainRibbonFar, mirrorRibbon, mainPropsFar, mainTris, mirrorTris,
  //          culledChunks, totalChunks, mainCalls, mirrorCalls }
  const mainFar = stats.mainRibbonFar || 0;
  const mainNear = stats.mainRibbonNear || 0;
  const mainRibbon = mainFar + mainNear;
  const mirrorRibbon = stats.mirrorRibbon || 0;
  const mainTris = stats.mainTris || 0;
  const mirrorTris = stats.mirrorTris || 0;
  const farShare = mainRibbon > 0 ? mainFar / mainRibbon : 0;
  const mirrorShare = mainTris > 0 ? mirrorTris / mainTris : 0;
  const mirrorRibbonShare = mirrorTris > 0 ? mirrorRibbon / mirrorTris : 0;
  const culled = stats.culledChunks || 0;
  const total = stats.totalChunks || 0;
  const culledShare = total > 0 ? culled / total : 0;

  const lodMirrorPays = mirrorRibbon >= 80_000 || (mirrorShare >= 0.7 && mirrorRibbonShare >= 0.8);
  const lodFarPays = farShare >= 0.35 && mainFar >= 40_000;
  const lodPays = lodMirrorPays || lodFarPays;
  const passFirst = lodMirrorPays && (!lodFarPays || mirrorRibbon >= mainFar)
    ? "mirror"
    : (lodFarPays ? "main-far" : "none");

  const chunkingWorth = culledShare < 0.55 && total >= 20; // still drawing most chunks → road chunking / merge experiments
  const mergeWorth = (stats.mainCalls || 0) >= 60;
  const experiments = [];
  if (chunkingWorth) experiments.push("road-chunking (#2631 §2) — visible-chunk share is high; shared-vertex index subsets can cut submitted road indices");
  if (mergeWorth) experiments.push("chunk-merge factor A/B (#2631 §3) — main-pass call count is high enough that mergeK changes are measurable");
  if ((stats.mainPropsFar || 0) > (mainFar || 0) * 0.5) {
    experiments.push("skip meshopt/lossy prop LOD — far props are large but #2657 notes quad-soup simplifies poorly; prefer instance/batch diet");
  }
  if (!experiments.length) {
    experiments.push("attribution/pass-identity hardening (#2631 §1) before further mesh experiments — counts are small or already culled");
  }

  return {
    lodPays,
    passFirst,
    farShare: +farShare.toFixed(3),
    mirrorShare: +mirrorShare.toFixed(3),
    mirrorRibbonShare: +mirrorRibbonShare.toFixed(3),
    culledShare: +culledShare.toFixed(3),
    experiments,
    summary: lodPays
      ? `#2657 step 2 (index-only LOD) PAYS on counts: start with the ${passFirst} pass` +
        (passFirst === "mirror"
          ? ` (mirror ribbon ≈ ${mirrorRibbon} tris/frame into a tiny target).`
          : ` (main far ribbon share ${(farShare * 100).toFixed(0)}% / ${mainFar} tris).`)
      : `#2657 step 2 does NOT clearly pay on these counts (far ribbon share ${(farShare * 100).toFixed(0)}%, mirror/main ${(mirrorShare * 100).toFixed(0)}%); keep as a phone-timeline experiment only.`,
  };
}

/** Parse the tool's `= mesh-census {...}` summary line from a log. */
export function parseSummaryLine(text) {
  const m = String(text).match(/^= mesh-census (.+)$/m);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}
