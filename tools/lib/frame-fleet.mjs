// @doc Pure FLEET half of frame-report.mjs: compact per-circuit reports, worst-frame summary, and the old-vs-new diff.
/*
 * frame-fleet.mjs — COMPARE A SHOT-LIST EDIT ACROSS EVERY CIRCUIT.
 *
 * `frame-report.mjs --fleet` runs the framing report once per circuit and
 * keeps a compact record of each frame; `--diff old.json new.json` compares
 * two such records. Everything here is a pure function of that JSON, so the
 * unit test (tests/unit/frame-fleet.test.mjs) builds two fleets by hand.
 *
 * FRAME IDENTITY. A shot-list edit that changes one shot's `dur` moves every
 * later u, so frames are keyed by WHAT they are, not WHEN: `<shot>@<pos>` for
 * the default sampling (pos = start / mid / end of that shot), `<shot>@u0.412`
 * for an explicit u list. A shot id that appears twice gets `#2`, `#3`…
 *
 * FLAG IDENTITY. A flag carries its measurement ("SUBJECT_OCCLUDED(46% visible,
 * by pine)"); the diff compares flag NAMES (the text before "(" or ":"), so a
 * visibility that drifts 46 → 44 % is a score delta, not a flag churn.
 */

export const FLEET_KIND = "frame-report-fleet";
export const FLEET_VERSION = 1;

/** "SUBJECT_OCCLUDED(46% visible, by pine)" → "SUBJECT_OCCLUDED"; "EYE_INSIDE:pine/canopy" → "EYE_INSIDE". */
export function flagName(flag) {
  return String(flag).split(/[(:]/)[0].trim();
}

/** Stable key per frame (see FRAME IDENTITY). Mutates nothing; `seen` counts repeats. */
export function frameKey(f, seen) {
  const where = f.pos ? f.pos : f.u != null ? "u" + Number(f.u).toFixed(3) : "pose";
  const base = `${f.shot != null ? f.shot : "?"}@${where}`;
  const n = (seen.get(base) || 0) + 1;
  seen.set(base, n);
  return n === 1 ? base : `${base}#${n}`;
}

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

/** One frame of a full frame-report JSON → the fields a fleet keeps. */
export function compactFrame(f, key) {
  const s = f.subject || null;
  return {
    key, u: f.u != null ? +Number(f.u).toFixed(4) : null, shot: f.shot, pos: f.pos || null,
    score: f.score, flags: (f.flags || []).slice(),
    subject: s ? { kind: s.kind, coverPct: r1(s.coverPct), visiblePct: r1(s.visiblePct), inFramePct: r1(s.inFramePct) } : null,
    skyPct: r1(f.skyPct), roadPct: r1(f.roadPct),
    nearest: f.nearest ? { distM: f.nearest.distM, kind: f.nearest.kind, third: f.nearest.third } : null,
    cars: f.cars ? f.cars.visible : null,
  };
}

/** A full single-circuit frame-report JSON → its compact fleet entry. */
export function compactReport(out) {
  const seen = new Map();
  const frames = (out.frames || []).map((f) => compactFrame(f, frameKey(f, seen)));
  return {
    bootMs: out.bootMs, analyseMs: out.analyseMs, raster: out.raster,
    meanScore: meanScore(frames), frames,
    cuts: (out.cuts || []).map((c) => ({ from: c.from, to: c.to, eyeJumpM: c.eyeJumpM, turnDeg: c.turnDeg,
                                         jumpCutRisk: !!c.jumpCutRisk })),
  };
}

export function meanScore(frames) {
  const xs = frames.map((f) => f.score).filter((v) => typeof v === "number");
  return xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : null;
}

/** Worst `n` frames across the fleet, lowest score first (ties: track order, then frame order). */
export function worstFrames(fleet, n = 10) {
  const rows = [];
  const ids = Object.keys(fleet.tracks || {});
  ids.forEach((track, ti) => {
    const t = fleet.tracks[track];
    if (!t || !t.frames) return;
    t.frames.forEach((f, fi) => rows.push({ track, ti, fi, ...f }));
  });
  rows.sort((a, b) => a.score - b.score || a.ti - b.ti || a.fi - b.fi);
  return rows.slice(0, n).map(({ ti, fi, ...r }) => r);
}

/** The printable fleet summary: per-circuit mean, errors, and the worst frames. */
export function formatSummary(fleet, n = 10) {
  const ids = Object.keys(fleet.tracks || {});
  const ok = ids.filter((id) => fleet.tracks[id] && fleet.tracks[id].frames);
  const all = ok.flatMap((id) => fleet.tracks[id].frames);
  const lines = [];
  lines.push(`frame-report fleet: ${ok.length}/${ids.length} circuits, ${all.length} frames, ` +
    `mean score ${meanScore(all)}` + (fleet.shots ? `, shots ${fleet.shots}` : ", shots FlybySeq.DEFAULT"));
  const errs = ids.filter((id) => fleet.tracks[id] && fleet.tracks[id].error);
  if (errs.length) lines.push("errors: " + errs.map((id) => `${id} (${fleet.tracks[id].error})`).join(", "));
  const flagCount = new Map();
  for (const f of all) for (const fl of f.flags) flagCount.set(flagName(fl), (flagCount.get(flagName(fl)) || 0) + 1);
  if (flagCount.size) {
    lines.push("flags: " + [...flagCount].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(", "));
  }
  const byMean = ok.map((id) => [id, fleet.tracks[id].meanScore]).sort((a, b) => a[1] - b[1]);
  lines.push("lowest circuit means: " + byMean.slice(0, 5).map(([id, m]) => `${id} ${m}`).join(", "));
  lines.push(`worst ${n} frames:`);
  for (const w of worstFrames(fleet, n)) {
    lines.push(`  ${String(w.score).padStart(3)}  ${w.track.padEnd(14)} ${w.key.padEnd(20)} ${w.flags.join(" ") || "-"}`);
  }
  return lines.join("\n");
}

/**
 * old fleet × new fleet → per circuit / per frame changes.
 *   minDelta   smallest |score change| that counts (default 1)
 * A frame "changed" when its score moved by ≥ minDelta or its flag NAMES differ.
 */
export function diffFleet(oldF, newF, { minDelta = 1 } = {}) {
  const oT = (oldF && oldF.tracks) || {}, nT = (newF && newF.tracks) || {};
  const ids = [...new Set([...Object.keys(oT), ...Object.keys(nT)])];
  const tracks = [];
  const tot = { circuits: ids.length, changedCircuits: 0, frames: 0, changed: 0, better: 0, worse: 0,
                added: 0, removed: 0, flagsAdded: 0, flagsRemoved: 0 };
  for (const id of ids) {
    const o = oT[id], n = nT[id];
    if (!o || !o.frames || !n || !n.frames) {
      const status = !o ? "added" : !n ? "removed" : "error";
      tracks.push({ track: id, status, error: (n && n.error) || (o && o.error) || null });
      tot.changedCircuits++;
      continue;
    }
    const om = new Map(o.frames.map((f) => [f.key, f])), nm = new Map(n.frames.map((f) => [f.key, f]));
    const keys = [...new Set([...o.frames.map((f) => f.key), ...n.frames.map((f) => f.key)])];
    const frames = [];
    for (const k of keys) {
      const a = om.get(k), b = nm.get(k);
      tot.frames++;
      if (!a || !b) {
        frames.push({ key: k, status: a ? "removed" : "added", old: a ? a.score : null, new: b ? b.score : null,
                      flags: (b || a).flags.map(flagName) });
        tot[a ? "removed" : "added"]++;
        continue;
      }
      const an = new Set(a.flags.map(flagName)), bn = new Set(b.flags.map(flagName));
      const flagsAdded = [...bn].filter((x) => !an.has(x)), flagsRemoved = [...an].filter((x) => !bn.has(x));
      const dScore = b.score - a.score;
      if (Math.abs(dScore) < minDelta && !flagsAdded.length && !flagsRemoved.length) continue;
      tot.changed++;
      if (dScore > 0) tot.better++; else if (dScore < 0) tot.worse++;
      tot.flagsAdded += flagsAdded.length; tot.flagsRemoved += flagsRemoved.length;
      frames.push({ key: k, status: "changed", old: a.score, new: b.score, dScore, flagsAdded, flagsRemoved });
    }
    const mo = meanScore(o.frames), mn = meanScore(n.frames);
    if (frames.length) tot.changedCircuits++;
    tracks.push({ track: id, status: frames.length ? "changed" : "same", meanOld: mo, meanNew: mn,
                  dMean: mo != null && mn != null ? +(mn - mo).toFixed(1) : null, frames });
  }
  return { minDelta, totals: tot, tracks };
}

/** Printable diff: unchanged circuits collapse into one line. */
export function formatDiff(d) {
  const t = d.totals, lines = [];
  lines.push(`frame-report diff: ${t.changedCircuits}/${t.circuits} circuits changed; ${t.changed} frames changed ` +
    `(${t.better} better, ${t.worse} worse), ${t.added} added, ${t.removed} removed; ` +
    `flags +${t.flagsAdded} -${t.flagsRemoved} (|Δscore| ≥ ${d.minDelta})`);
  const same = [];
  for (const tr of d.tracks) {
    if (tr.status === "same") { same.push(tr.track); continue; }
    if (tr.status !== "changed") { lines.push(`${tr.track}: ${tr.status.toUpperCase()}${tr.error ? ` (${tr.error})` : ""}`); continue; }
    const sgn = (v) => (v > 0 ? "+" : "") + v;
    lines.push(`${tr.track}: mean ${tr.meanOld} → ${tr.meanNew} (${sgn(tr.dMean)})`);
    for (const f of tr.frames) {
      if (f.status !== "changed") { lines.push(`  ${f.key.padEnd(22)} ${f.status.toUpperCase()} score ${f.old != null ? f.old : f.new} ${f.flags.join(" ")}`); continue; }
      const fl = [...f.flagsAdded.map((x) => "+" + x), ...f.flagsRemoved.map((x) => "-" + x)].join(" ");
      lines.push(`  ${f.key.padEnd(22)} ${String(f.old).padStart(3)} → ${String(f.new).padStart(3)} (${sgn(f.dScore)})${fl ? "  " + fl : ""}`);
    }
  }
  if (same.length) lines.push(`unchanged (${same.length}): ${same.join(" ")}`);
  return lines.join("\n");
}

/** Refuse a file that is not a fleet record, naming what it is instead. */
export function assertFleet(obj, label) {
  if (!obj || obj.kind !== FLEET_KIND || typeof obj.tracks !== "object") {
    const what = obj && Array.isArray(obj.frames) ? "a single-circuit report (run --fleet)" : "not a fleet record";
    throw new Error(`${label}: ${what} — expected {"kind":"${FLEET_KIND}"} from frame-report.mjs --fleet`);
  }
  return obj;
}
