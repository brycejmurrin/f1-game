#!/usr/bin/env node
/* Apex 26 — rotate CircuitMarkings onto a corrected start line.
 * @doc Rotates `CircuitMarkings` turn apexes onto a corrected start line by the scenery's arc shift, then re-sorts them.
 * @skill new-track
 *
 * `CircuitMarkings` sector splits and turn apexes are authored in RACING-LAP
 * space and deliberately never fmap'd (see the header of js/track/markings.js).
 * So when `startFrac` moves the line, the same PHYSICAL apex acquires a new
 * racing fraction and the stored numbers go stale — silently, because they stay
 * perfectly well-formed.
 *
 * The rotation is the same arc-length shift the scenery uses: a point that was
 * `f` of a lap past the OLD line is `f + shift` past the new one, where `shift`
 * is `def._sceneryShift` (computed in buildCenterline). Direction-agnostic —
 * reversed laps need no special case.
 *
 * Turns are then RE-SORTED. That is the point of the exercise: the array is
 * consumed by index (`signBoard(..., idx + 1)` in tracks.js), so index 0 must be
 * the first apex after the line for Turn 1 to mean Turn 1. Re-sorting is what
 * fixes albert_park and silverstone sorting their FINAL turn before T1.
 *
 * Sectors are left ALONE — see the comment at the sector branch below. They are
 * idealised thirds rather than timing-loop positions, so they are already
 * line-relative and rotating them breaks this file's own contract.
 *
 *   node tools/rotate-markings.cjs --check    # report, write nothing
 *   node tools/rotate-markings.cjs --write
 *
 * NOT IDEMPOTENT — do not re-run --write against an already-rotated
 * markings.js. `_sceneryShift` is a fixed function of startFrac vs
 * sceneryStartFrac, so it stays nonzero forever once a circuit opts in; this
 * tool has no way to tell "already rotated" from "never rotated" and will add
 * the shift AGAIN on a second run, silently corrupting every turn on that
 * circuit. Measured: a second --check against the correctly-rotated file
 * proposed changing all 27 circuits again, each one a double rotation.
 * `--check` is safe any time; only run `--write` once per circuit, when it
 * first opts into `sceneryStartFrac`. Verify with `t1check.cjs`-style probes
 * (turns[0] against the measured first apex), not by trusting a green --check.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { buildContext } = require("./verify-track.cjs");

const ROOT = path.resolve(__dirname, "..");
const FILE = path.join(ROOT, "js/track/markings.js");
const wrap01 = (v) => ((v % 1) + 1) % 1;
const r4 = (v) => Number(wrap01(v).toFixed(4));

function main(write) {
  const Tracks = buildContext();
  const src = fs.readFileSync(FILE, "utf8");
  let out = src, changed = 0, skipped = [];

  for (const def of Tracks.LIST) {
    // `_sceneryShift` is stamped by buildCenterline, not by resolve(), so it is
    // undefined on a freshly loaded LIST. Build the centreline (cheap — no
    // meshes) to make the def answer for itself rather than recomputing the
    // arc-length lookup here and risking a second, subtly different one.
    Tracks.buildCenterline(def);
    const shift = def._sceneryShift;
    if (!shift) continue;                       // start line did not move
    const M = Tracks._vmContext.CircuitMarkings[def.id];
    if (!M) continue;

    // Match this circuit's block in the source so the rewrite is surgical —
    // the file is hand-maintained and full of comments worth keeping.
    const block = new RegExp(`(^  ${def.id}: \\{)([\\s\\S]*?)(^  \\},)`, "m");
    const m = block.exec(out);
    if (!m) { skipped.push(`${def.id}: no block matched`); continue; }
    let body = m[2];

    if (Array.isArray(M.turns) && M.turns.length) {
      // Rotate, then sort: index 0 becomes the first apex after the new line.
      const turns = M.turns.map((f) => r4(f + shift)).sort((a, b) => a - b);
      body = body.replace(/turns:\s*\[[^\]]*\]/,
        `turns: [${turns.map((v) => v.toFixed(4)).join(", ")}]`);
    }
    // SECTORS ARE DELIBERATELY NOT ROTATED. They are not timing-loop positions:
    // the whole grid carries the same handful of idealised thirds ([0.30, 0.62],
    // [0.32, 0.68], [0.28, 0.62]), i.e. "about a third of a lap from the line"
    // — which makes them LINE-RELATIVE by construction, and already correct
    // against a corrected line. Rotating them produced [0.7160, 0.0360] at COTA
    // and [0.9953, 0.3453] at Qatar, breaking this file's own
    // `0 < s1 < s2 < 1` contract, which is the shape of an answer that was
    // never physical to begin with. Turns are the opposite case: they were
    // regenerated from the N strongest curvature PEAKS, so they name places on
    // the tarmac and have to move with the origin.
    if (body !== m[2]) { out = out.replace(m[0], m[1] + body + m[3]); changed++; }
    console.log(`${def.id.padEnd(13)} shift ${(shift * 100).toFixed(2)}% of lap` +
      (M.turns ? `  ${M.turns.length} turns` : "") + (M.sectors ? "  (sectors left alone)" : ""));
  }

  for (const s of skipped) console.log(`  SKIP ${s}`);
  if (write) { fs.writeFileSync(FILE, out); console.log(`\n${changed} circuit block(s) rewritten`); }
  else console.log(`\n${changed} circuit block(s) would change (--write to apply)`);
}

main(process.argv.includes("--write"));
