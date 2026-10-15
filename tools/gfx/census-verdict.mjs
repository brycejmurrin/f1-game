#!/usr/bin/env node
// census-verdict.mjs — the real-GPU gate of .github/workflows/gpu-census.yml.
// @doc Reads one image's census + four game-check JSONs, prints the Verdict rows and fails on what the game reported.
// @skill renderer-debug
//
// This was a ~570-line single-quoted `node -e` script inside the workflow's
// Verdict step: testable only by regex over its source, and an apostrophe in
// a comment ended it once (run 33757119814). It is a module now, so the rows
// and the gate are plain functions with fixture tests
// (tests/unit/census-verdict.test.mjs, and the behaviour cases in
// tests/unit/gfx-backend-canary.test.mjs).
//
//   node tools/gfx/census-verdict.mjs [--image ID] [--dir DIR] [--ls "k=v ..."] [--summary FILE]
//
// Defaults come from the step env: IMAGE, CENSUS_LS, GITHUB_STEP_SUMMARY; DIR
// is the cwd. Exit 1 when any gate fails, 0 otherwise.
//
// Errors gate; APPEARANCE is only reported. A brightness floor is the kind of
// threshold that goes flaky and then gets widened to pass, which AGENTS.md
// forbids outright — meanLuma goes in the summary for a human.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LEGS = ["webgpu", "webgl2", "glx", "wgx"];
const IND = " ".repeat(8);

/** The value CENSUS_LS gives apex26.wgxCapture when it OVERRIDES the "0" pin
 *  every leg carries (the dispatcher's --ls comes after the pin on the command
 *  line, so the last one wins), else null. "0" restated is not an override. */
export function capOverride(ls) {
  let v = null;
  for (const kv of String(ls || "").split(/\s+/)) {
    const m = kv.match(/^apex26\.wgxCapture=(.*)$/);
    if (m) v = m[1];
  }
  return v != null && v !== "0" ? v : null;
}

/** Read census-<image>.json and game-<leg>-<image>.json from dir; an absent or
 *  unparseable file is null (the gate then names it). */
export function readArtifacts(dir, image) {
  const read = (p) => { try { return JSON.parse(fs.readFileSync(path.join(dir, p), "utf8")); } catch (_) { return null; } };
  const legs = {};
  for (const leg of LEGS) legs[leg] = read(`game-${leg}-${image}.json`);
  return { census: read(`census-${image}.json`), legs };
}

/** The whole verdict: { rows, bad }. `cap` is capOverride(CENSUS_LS). */
export function verdict({ image, census, legs, cap = null }) {
  // Only a machine the census called hardware can be held to the hardware
  // expectations; a software image legitimately reports softAdapter true and
  // a skipped (blank) env probe.
  // TRI-STATE, deliberately not coerced: `!!` mapped BOTH "measured, no
  // hardware" and "measured nothing" to false, which switches off the
  // hardware-only clauses, so a census that failed to launch downgraded this
  // gate to a software gate (docs/PERF-FINDINGS.md 2j).
  const hardware = !!(census && census.anyHardware === true);
  const censusUnknown = !census || census.anyHardware == null;
  const bad = [];
  if (censusUnknown) bad.push(
    `census-${image}.json: the census measured NOTHING (anyHardware ` +
    `null or file unreadable) — this run cannot tell hardware from ` +
    `software, so the hardware-only checks below would pass vacuously`);
  const rows = [`## ${image} — real-GPU verdict`, "", "```",
    `census anyHardware: ${hardware}`];
  // GLX rows carry no backendState / envState (gpu-game-check reads those only
  // when g.__tlx exists), so every env/backend check below is absent-safe or
  // scoped to tlxLeg.
  for (const path3 of LEGS) {
    const file = `game-${path3}-${image}.json`;
    const g = legs[path3];
    if (!g) { bad.push(`${path3}: ${file} missing — the check produced nothing`); continue; }
    const r = legReport(path3, g, { hardware, cap });
    rows.push(...r.rows);
    bad.push(...r.bad);
  }
  rows.push("```", "");
  if (bad.length) rows.push("**FAILED**", "", ...bad.map((b) => `- ${b}`));
  return { rows, bad };
}

/** One leg: its report rows and its gate failures. */
export function legReport(path3, g, { hardware, cap = null }) {
  const rows = [], bad = [];
  const gfx = g.gfx || {}, env = gfx.envState || {}, be = gfx.backendState || {};
  // The two TLX legs are three.js BY CONSTRUCTION (--backend three), so they
  // MUST bring an env probe. Scoped on the leg name, not on "has a __tlx": a
  // TLX leg that fell back to GLX loses envState too, and that is a regression.
  const tlxLeg = path3 === "webgpu" || path3 === "webgl2";
  const frame = g.frame || {};
  rows.push(`${path3.padEnd(7)} phase=${g.phase} ok=${g.ok} ` +
    `gpuErrors=${gfx.gpuErrors} envFail=${env.fail} envReady=${env.ready} ` +
    `envBlank=${env.blank} gaveUp=${env.gaveUp} softAdapter=${be.softAdapter} ` +
    `headless=${be.headless} meanLuma=${frame.meanLuma != null ? frame.meanLuma : "n/a"}` +
    (g.softBlitAtShot ? ` blit=${g.softBlitAtShot}/${g.softBlitWaitMs}ms` : "") +
    // HOW gpuErrors was drained on GLX: "beat" = ~1 Hz explicit drain (hunt 4 I2), "present" = --gl-err-drain.
    (path3 === "glx" && g.glErrDrain ? ` glErrDrain=${g.glErrDrain}` : "") +
    (g.present ? ` shot=${g.present.mode}${g.present.gen != null ? "@" + g.present.gen : ""}` : ""));
  rows.push(...detailRows(path3, g, { tlxLeg }));
  if (tlxLeg) rows.push(`${IND}path:  api=${be.api} forceWebGL=${be.forceWebGL} softBlit=${be.softBlit === true ? "YES (headless readback — NOT the path a player takes)" : be.softBlit === false ? "no (direct present)" : "?"} skipBatches=${be.skipBatches} gpuErrFrames=${be.gpuErrFrames}`);
  rows.push(...envRows(env, gfx));
  // Print the REASON: a Windows outage once read as contentless and got
  // misfiled as "WARP is slow" for two sessions (docs/PERF-FINDINGS.md 2f).
  if (g.error) rows.push(`${IND}error: ${String(g.error).slice(0, 200)}`);
  if (g.root) rows.push(`${IND}root:  ${g.root}`);
  // bounded() turns a failed read into a VALUE, so the run still says done/ok
  // and every gfx field reads undefined — name why.
  if (g.gfxReadFailed) rows.push(`${IND}gfx:   ${g.gfxReadFailed}`);
  if (g.overlayReadFailed) rows.push(`${IND}ovl:   ${g.overlayReadFailed}`);
  // Why meanLuma is empty — an empty column is not a dark frame (PERF-FINDINGS 2l).
  if (g.frameReadFailed) rows.push(`${IND}luma:  ${g.frameReadFailed}`);

  // ---- THE GATES ----
  const compileErrors = (g.console || []).filter((line) => /(?:Async render pipeline creation failed|Render pipeline creation failed|ShaderModule|fragment error|vertex error)/i.test(String(line)));
  if (compileErrors.length) bad.push(`${path3}: ${compileErrors.length} shader/pipeline console errors — ${String(compileErrors[0]).slice(0, 200)}`);
  if (g.ok !== true || g.phase !== "done") bad.push(`${path3}: did not finish (phase=${g.phase}, ok=${g.ok})${g.error ? " — " + String(g.error).slice(0, 200) : ""}`);
  // An ABSENT count must not read as clean (PERF-FINDINGS 2e). Hardware-only:
  // on a software image a leg that cannot bring its backend up is information,
  // not a regression signal.
  if (hardware && g.gfxReadFailed) bad.push(`${path3}: the gfx read failed, so this leg proved NOTHING — ${g.gfxReadFailed}`);
  else if (hardware && gfx.gpuErrors == null) bad.push(`${path3}: NO gpuErrors count reported — the error check would pass vacuously (see docs/PERF-FINDINGS.md 2e)`);
  else if (gfx.gpuErrors > 0) bad.push(`${path3}: ${gfx.gpuErrors} uncaptured GPU errors — ${String(gfx.gpuFirstError || "").slice(0, 160)}`);
  // envState().fail is `_envFailN`, initialised 0 and always a number once the
  // surface exists — so on a hardware TLX leg an ABSENT count means the surface
  // is gone or envState() threw, never "no failures" (PERF-FINDINGS 2j).
  if (hardware && tlxLeg && env.fail == null) bad.push(`${path3}: NO env-probe fail count reported — the env check would pass vacuously`);
  else if (env.fail > 0) bad.push(`${path3}: ${env.fail} env-probe faces FAILED — ${String(env.failMsg || "").slice(0, 160)}`);
  // gaveUp lives on the same envState object, so its absence is already failed above.
  if (env.gaveUp) bad.push(`${path3}: the env probe stood down — it could not succeed`);
  if (hardware && be.softAdapter === true) bad.push(`${path3}: softAdapter TRUE on an adapter the census called hardware — the classification regressed and the game is running the degraded content path`);
  // THE PLAYER'S PRESENT PATH ON TLX (promoted from report to gate
  // 2026-10-14; softBlit=no on every hardware TLX leg, 66 of 66). Every leg
  // pins apex26.wgxCapture=0 and tlx.js arms its soft blit only when
  // `_capPref !== "0"`, so a readback here means the pin stopped being
  // honoured. A dispatcher who overrides the pin through `ls` asked for the
  // blit, and the row above reports it.
  if (hardware && tlxLeg && cap == null && be.softBlit !== false) {
    bad.push(be.softBlit === true
      ? `${path3}: TLX is soft-blitting (GPU readback + putImageData every frame) on a hardware adapter with apex26.wgxCapture=0 pinned — the pin is no longer honoured, and every number on this leg timed the readback`
      : `${path3}: NO softBlit reported on a hardware TLX leg — the present-path check would pass vacuously`);
  }
  if (path3 === "wgx") {
    rows.push(`${IND}wgx:   bound=${gfx.wgx} softPresent=${gfx.wgxSoftPresent} headlessUa=${gfx.headlessUa}` +
      (cap != null ? ` (apex26.wgxCapture=${cap} from the dispatch ls overrides the native pin — soft-present is not gated)` : ""));
    if (hardware && gfx.wgx !== true) bad.push(`wgx: WGX did not bind on a hardware adapter (fell back to GLX, or the surface stopped reporting) — this leg proved nothing about js/render/webgpu/`);
    // THE SWAPCHAIN (promoted 2026-10-14; softPresent=false on every hardware
    // run since the hunt 4 I3 pin, 15 of 15). The old clause exempted a
    // headless UA, and gpu-game-check always launches headless, so it could
    // never fire (headlessUa=true in 65 of 65 runs). The pin is what makes
    // the headless run take the player's path, so the pin is the condition.
    else if (hardware && cap == null && gfx.wgxSoftPresent !== false) {
      bad.push(gfx.wgxSoftPresent === true
        ? `wgx: WGX is soft-presenting (CPU blit) on a hardware adapter with apex26.wgxCapture=0 pinned — the swapchain path is off, every frame pays a readback + putImageData`
        : `wgx: NO softPresent state reported for a bound WGX — the swapchain check would pass vacuously${gfx.wgxSoftPresentError ? " — " + String(gfx.wgxSoftPresentError).slice(0, 160) : ""}`);
    }
  }
  return { rows, bad };
}

/** The report-only rows between a leg's head row and its path row. */
function detailRows(path3, g, { tlxLeg }) {
  const rows = [];
  const gfx = g.gfx || {}, env = gfx.envState || {};
  const gov = gfx.gov || {};
  // THE WINDOW ITSELF: did the gate wait for the race and drive the car, how
  // long the lights held by warm stage, how far the car went (census 207).
  const _rc = g.race;
  if (_rc && _rc.reached === false) {
    rows.push(`${IND}race:  NOT REACHED in ${_rc.gateMs} ms — every row below timed the LIGHTS, not the race` +
      (_rc.warm ? `  (warm: scene=${_rc.warm.scene} post=${_rc.warm.post} shadow=${_rc.warm.shadow} total=${_rc.warm.total} ms, pending=${_rc.warm.pending})` : ""));
  } else if (_rc) {
    const _w = _rc.warm, _d = _rc.driven;
    rows.push(`${IND}race:  gate=${_rc.gateMs}ms beats=${_rc.beats}` +
      (_rc.warmMark !== undefined ? ` entryWarm=${_rc.warmMark || "none"}` : "") +
      (_w ? `  warm scene=${_w.scene} post=${_w.post} shadow=${_w.shadow} total=${_w.total} ms attempts=${_w.attempts} failed=${_w.failed}` : "  warm: none (no TLX warm on this leg)") +
      (_d ? `  | driven ${_d.frames}f ${_d.distM} m mean ${_d.meanSpeed} m/s offRoad=${_d.offRoadFrames}f${_d.error ? " driverError=" + _d.error : ""}` : _rc.drive ? `  | driver ${_rc.driver || "not started"}` : "  | PARKED (--no-drive)"));
  } else {
    rows.push(`${IND}race:  no race gate in this build — the window opened at arm(), car parked`);
  }
  // Programs and materials over the window, first beat to last: a climbing
  // program count is the lazy-program tally; climbing miss/evict is tlx.js
  // minting materials on the road (MAT_CACHE_CAP).
  const _mmB = (g.beats || []).filter((b) => b && b.mm);
  if (_mmB.length >= 2) {
    const a = _mmB[0].mm, z = _mmB[_mmB.length - 1].mm;
    const d = (k) => (a[k] != null && z[k] != null) ? `${k} ${a[k]}→${z[k]} (+${z[k] - a[k]})` : `${k} ?`;
    rows.push(`${IND}mats:  ${["progs", "mats", "pool", "miss", "evict"].map(d).join("  ")}`);
    const _k0 = new Set(a.keys || []), _kNew = (z.keys || []).filter((k) => !_k0.has(k));
    if (_kNew.length) rows.push(`${IND}       minted: ${_kNew.slice(-8).join(" | ")}`);
  }
  // THE TAIL, which fps cannot show: p99 against p50 tells a spike train from
  // plain slowness. Top level (out.frameTail), not under gfx.
  const _ft = g.frameTail;
  if (_ft && _ft.p99 != null) {
    rows.push(`${IND}tail:  p50=${_ft.p50} p95=${_ft.p95} p99=${_ft.p99} max=${_ft.max} p99/p50=${_ft.p99OverP50}x` +
      `  (beats=${_ft.beats})`);
  } else if (_ft && _ft.note) {
    rows.push(`${IND}tail:  ${_ft.note}`);
  }
  // THE PERIOD OF THE TAIL: analyse() over every rAF callback — how many
  // frames cost far more than this leg's typical frame, and whether they are
  // evenly spaced (low CV = a mechanism on a clock).
  const _h = g.hitch;
  if (_h && _h.ok) {
    rows.push(`${IND}hitch: ${_h.spikes} spikes/${_h.frames}f over ${_h.spikeThresholdMs}ms` +
      `  every ~${_h.gapMedianS}s (CV ${_h.gapCV}) periodic=${_h.periodic}  max=${_h.max}ms`);
  } else if (_h && _h.note) {
    rows.push(`${IND}hitch: ${_h.note}`);
  }
  // THE PASS CENSUS at the size a player renders (shadow maps are sized by
  // softwareGL, so the container measures a sixteenth of the pixels).
  const _p = g.passes, _pk = g.passKinds;
  if (_p && _p.medianPasses != null) {
    rows.push(`${IND}pass:  median=${_p.medianPasses} max=${_p.maxPasses} wide=${_p.widerThanMedian}` +
      ` every ~${_p.gapMedianS}s (CV ${_p.gapCV})` +
      (_p.wideCostRatio != null ? `  cost ${_p.wideCostRatio}x normal (${_p.wideMeanMs} vs ${_p.normalMeanMs}ms) spikeEnrich ${_p.spikeEnrichmentOnWide}x` : ""));
  }
  if (_pk && _pk.verdict) rows.push(`${IND}kinds: ${_pk.verdict}`);
  // PIPELINE COMPILES: only a compile count separates "allocate faster" from
  // "warm the programs" (run 197).
  const _w = g.gpuWork;
  if (_w && !_w.note) {
    const keys = Object.keys(_w).sort((a, b) => _w[b] - _w[a]).slice(0, 6);
    rows.push(`${IND}work:  ${keys.map((k) => `${k}=${_w[k]}`).join(" ")}`);
  } else if (_w && _w.note) {
    rows.push(`${IND}work:  ${_w.note}`);
  }
  // WHERE THE CPU TIME GOES, by function, over the race window (self time).
  const _cpu = g.cpu;
  if (_cpu && !_cpu.note) {
    rows.push(`${IND}cpu:   ${_cpu.totalMs} ms sampled — ${(_cpu.files || []).slice(0, 4).map((f) => `${f.file}=${(f.share * 100).toFixed(0)}%`).join(" ")}`);
    for (const r of (_cpu.rows || []).slice(0, 14)) {
      rows.push(`${IND}  ${String((r.share * 100).toFixed(1)).padStart(5)}%  ${String(r.ms).padStart(8)} ms  ${r.site}`);
    }
  } else if (_cpu && _cpu.note) {
    rows.push(`${IND}cpu:   ${_cpu.note}`);
  }
  // The compile stacks, one row per signature.
  const _cs = g.compileStacks || [];
  for (const [sig, count] of _cs.slice(0, 12)) {
    rows.push(`${IND}stack: x${count}  ${String(sig).slice(0, 300)}`);
  }
  // INSIDE THE SPIKES: the profile joined to the frames at or over 100 ms.
  const _sc = g.spikeCpu, _sw = g.spikeWork;
  if (_sc && _sc.spikes != null && _sc.spikes > 0) {
    rows.push(`${IND}spike: ${_sc.spikes} frames >= ${_sc.thresholdMs} ms, ${_sc.spikeMs} ms of callbacks, ${_sc.sampledMs} ms sampled inside (join ${_sc.coverage}x)`);
    for (const r of (_sc.rows || []).slice(0, 8)) rows.push(`${IND}  ${String((r.share * 100).toFixed(1)).padStart(5)}%  ${String(r.ms).padStart(8)} ms  ${r.site}${r.path ? "  <- " + String(r.path).slice(0, 160) : ""}`);
    if (_sw && _sw.frames != null) rows.push(`${IND}       work inside vs rest: ${_sw.summary}`);
    if (_sw && _sw.timed) rows.push(`${IND}       wall time inside vs rest: ${_sw.timed}`);
    if (_sw && _sw.remainder) rows.push(`${IND}       ${_sw.remainder}`);
    const _sp = g.spikePasses;
    if (_sp && _sp.summary) rows.push(`${IND}       passes in spike frames vs rest: ${_sp.summary}`);
  } else if (_sc && _sc.note) {
    rows.push(`${IND}spike: ${_sc.note}`);
  }
  // THE GAPS (hunt 4 §A gap ii): rAF intervals >= 500 ms the spike rows cannot see.
  const _gw = g.gapWork;
  if (_gw && _gw.rows && _gw.rows.length) {
    rows.push(`${IND}gaps:  ${_gw.summary}`);
    for (const x of _gw.rows.slice(0, 6)) {
      rows.push(`${IND}  ${String(x.gapMs).padStart(6)} ms [${x.phase}] at +${x.atMs} ms: step before ${x.prevFrameMs} ms${x.prevCallbacks != null ? ` (${x.prevCallbacks} cb)` : ""}, long tasks ${x.longTaskMs} ms — prev: ${x.prev} | between: ${x.between}`);
    }
  } else if (_gw && (_gw.summary || _gw.note)) {
    rows.push(`${IND}gaps:  ${_gw.summary || _gw.note}`);
  }
  // RACE ENTRY BY NAMED SPAN (hunt 4 B-F3.3).
  const _rs = g.raceEntrySpans;
  if (_rs && _rs.events) {
    rows.push(`${IND}marks: ${_rs.summary}`);
    for (const x of _rs.events.slice(0, 6)) {
      rows.push(`${IND}  ${String(x.ms).padStart(7)} ms ${x.kind.padEnd(8)} at +${x.atMs} ms -> ${x.span ? `${x.span} (${Math.round(100 * x.share)}%)` : "(no span)"}` +
        (x.also && x.also.length ? ` also ${x.also.join(", ")}` : "") + ` | after ${x.after || "-"}, before ${x.before || "-"}`);
    }
  } else if (_rs && _rs.note) {
    rows.push(`${IND}marks: ${_rs.note}`);
  }
  // THE DRIVEN WINDOW (hunt 4 I4), in game frames — the number to compare
  // across legs and runs (the gov row is the end-of-run ring).
  const _win = g.window;
  if (_win && _win.frames != null) {
    rows.push(`${IND}window: ${_win.frames} frames in ${_win.ms} ms = ${_win.fps} fps` +
      (_win.msPerFrame != null ? ` (${_win.msPerFrame} ms/frame)` : "") +
      (_win.p50 != null ? `  interval p50=${_win.p50} p95=${_win.p95} p99=${_win.p99} max=${_win.max} ms` : "") +
      (_win.callbacksPerFrame != null ? `  rAF/frame=${_win.callbacksPerFrame}` : "") + `  [${_win.source}]`);
  } else if (_win && _win.note) {
    rows.push(`${IND}window: ${_win.note}`);
  }
  // THE DEPTH-DISCARD ROW (hunt 4 A-P1): TLX only; a TLX leg that lost it says why.
  const _dd = g.depth;
  if (_dd && _dd.supported) rows.push(`${IND}depth: ${_dd.summary}`);
  else if (tlxLeg) rows.push(`${IND}depth: NOT MEASURED — ${(_dd && _dd.note) || "the leg wrote no depth row"}`);
  // THE CAMERA THE WINDOW DROVE (hunt 4 H5) and the mirror chain it left.
  const _cam = g.cam, _mir = g.mirror || {}, _mb = _mir.backend || {};
  if (_cam) {
    const _sw = g.camSwitch, _endWant = _cam.switchedTo || _cam.set;
    const off = _cam.error || (_cam.asked && _cam.set !== _cam.asked) || (_cam.atWindowEnd && _endWant && _cam.atWindowEnd !== _endWant) || (_sw && _sw.error);
    rows.push(`${IND}cam:   ${_cam.set || "?"} (asked ${_cam.asked || "game default"}, at window end ${_cam.atWindowEnd || "?"})` +
      (_sw ? `  switch>${_sw.to} at beat ${_sw.beat}` : "") +
      (_mir.mode !== undefined ? `  mirror=${_mir.mode} shown=${_mir.shown}` : "") +
      (_mb.mips !== undefined ? ` mips=${_mb.mips} cap=${_mb.mipCap} full=${_mb.mipFull}` : "") +
      (off ? `   <- CAMERA NOT AS ASKED${_cam.error ? ": " + _cam.error : _sw && _sw.error ? ": " + _sw.error : ""}` : ""));
  }
  const _we = g.warmEnd;
  if (_we && (_we.mirrorDeferred || _we.mirrorLazy)) {
    const _ml = _we.mirrorLazy;
    rows.push(`${IND}mirwarm: deferred=${_we.mirrorDeferred} lazy=` +
      (_ml ? `${_ml.ms} ms drawn=${_ml.drawn} ok=${_ml.ok}` : "not paid (no mirror view asked)") + ` entryMirror=${_we.mirror}`);
  }
  if (g.entry && g.entry !== "api") {
    const _mn = g.menu || {}, _at = _mn.atGo || {}, _mc = _at.cars;
    rows.push(`${IND}menu:  entry=${g.entry} ok=${_mn.ok} prepReady=${_mn.prepReady} waited=${_mn.prepWaitMs}ms` +
      ` done=${_at.done} warmed=${_at.warmed}${_at.warmable ? "" : "(no warm)"} garage=${_mn.garage ? _mn.garage.garageReady : "?"}` +
      (_mc ? `  cars=${_mc.cars} steps=${_mc.steps} lod=${_mc.lod} cpu=${_mc.cpuMs}ms max=${_mc.maxCpuMs}ms` : "  cars: no prep recorded") +
      (_mn.error ? `   <- MENU ENTRY FAILED: ${_mn.error}` : _mn.prepNote ? `   <- ${_mn.prepNote}` : ""));
  }
  rows.push(`${IND}gov:   tier=${gov.tier} autoTier=${gov.autoTier} userTier=${gov.userTier} ` +
    `scale=${gov.scale} fps=${gov.fps} floorMs=${gov.floorMs} envFace=${env.face} frames=${(gov.open && gov.open.frames) != null ? gov.open.frames : "?"}`
    // floorMs 16.6 is the value PerfGov is INITIALISED with: a leg that never
    // fed it reports a perfect fps=60 that is not a measurement (PERF-FINDINGS 2t).
    + (Math.abs((gov.floorMs || 0) - 16.6) < 0.2 ? "   <- fps UNFED (floorMs is the init value); not a measurement" : ""));
  // A LEG THAT RENDERED ALMOST NOTHING MEASURED NOTHING (runs 54, 72). Not a
  // gate: a slow runner is not a defect in the build.
  if (tlxLeg && (gov.open && gov.open.frames) != null && gov.open.frames < 60) {
    rows.push(`${IND}run:   ONLY ${gov.open.frames} frames rendered — INCONCLUSIVE: this leg measured the runner, not the build, and its appearance and env numbers are not comparable with any other run`);
  }
  rows.push(...entryRows(g));
  rows.push(...abRows(g));
  return rows;
}

/** Race entry, build, startRace, GPU time and occlusion — the multithreading
 *  plan gate (its section 4). REPORTED, NOT GATED: a timing floor goes flaky
 *  and then gets widened. EVERY absence prints (PERF-FINDINGS 2j, 2l). */
function entryRows(g) {
  const rows = [];
  // longestBlockMs is CONTIGUOUS block, the condition as written.
  const re = g.raceEntry || {};
  if (re.supported === false || re.note || re.error) {
    rows.push(`${IND}entry: NOT MEASURED — ${re.note || re.error || "no longtask observer"}`);
  } else if (re.longestBlockMs == null) {
    rows.push(`${IND}entry: NOT MEASURED — the leg wrote no raceEntry at all (it died before the read)`);
  } else if (re.longestBlockMs != null) {
    const verdict = re.longestBlockMs > 400
      ? (re.otherBlockMs >= 300 ? "conditions 1 and 3 HOLD"
        : "condition 1 holds, condition 3 FAILS: too little other work to overlap, so a worker buys a spinner")
      : "condition 1 FAILS: the block is under 400 ms, so the plan says record the item as DEAD";
    rows.push(`${IND}entry: window=${re.entryMs}ms longestBlock=${re.longestBlockMs}ms ` +
      `otherBlock=${re.otherBlockMs}ms tasks=${re.tasks}`);
    rows.push(`${IND}       ${verdict}`);
  }
  const _lf = re.loaf;
  if (_lf && _lf.summary) {
    rows.push(`${IND}loaf:  ${_lf.summary}`);
    for (const f of (_lf.longest || []).slice(0, 4)) {
      rows.push(`${IND}  ${String(f.duration).padStart(7)} ms at +${f.atMs} ms${f.span ? " [" + f.span + "]" : ""}: ` +
        ((f.scripts || []).slice(0, 3).map((s) => `${s.invokerType} ${s.invoker || "?"}${s.sourceFunctionName ? " " + s.sourceFunctionName : ""} ${s.duration} ms`).join(" | ") || "no script attributed"));
    }
  } else if (_lf && _lf.note) {
    rows.push(`${IND}loaf:  NOT MEASURED — ${_lf.note}`);
  }
  // WHICH HALF a worker would move: the track build, and which phase of it.
  const bp = g.buildProfile || {};
  if (bp.note || bp.error) {
    rows.push(`${IND}build: NOT MEASURED — ${bp.note || bp.error}`);
  } else if (bp.totalMs != null) {
    rows.push(`${IND}build: total=${bp.totalMs}ms geo=${bp.geoMs}ms up=${bp.upMs}ms geoShare=${bp.geoShare}`);
    rows.push(`${IND}       hottest: ${(bp.top || []).join("  ")}`);
    // CONDITION 2, computed — two ratios: against the longest single task (the
    // condition as written) and against ALL blocking in the window (what
    // decides whether a worker helps).
    const lb = re.longestBlockMs, tb = (re.longestBlockMs || 0) + (re.otherBlockMs || 0);
    if (lb) {
      const ofLongest = Math.round(100 * bp.totalMs / lb), ofAll = Math.round(100 * bp.totalMs / tb);
      rows.push(`${IND}       cond2: build is ${ofLongest}% of the longest block, ${ofAll}% of ALL blocking in the window`);
      rows.push(`${IND}       ${ofAll >= 50
        ? "condition 2 HOLDS on both ratios"
        : ofLongest >= 50
          ? `condition 2 holds as WRITTEN but fails on the ratio that decides: moving the whole build off-thread leaves ${100 - ofAll}% of the freeze in place`
          : "condition 2 FAILS on both ratios — the build is not the block"}`);
    }
  }
  // startRace phase by phase.
  const rp = g.raceProfile || {};
  if (rp.note || rp.error) {
    rows.push(`${IND}enter: NOT MEASURED — ${rp.note || rp.error}`);
  } else if (rp.totalMs != null) {
    rows.push(`${IND}enter: startRace total=${rp.totalMs}ms  hottest: ${(rp.top || []).join("  ")}`);
  }
  // GPU time against pixel count — the fragment-bound test.
  const gf = g.gpuFrame || {};
  if (gf.note || gf.error) {
    rows.push(`${IND}gpu:   ${gf.note || gf.error}`);
  } else if (gf.medianMs != null) {
    const px = gf.canvas && gf.canvas.w ? gf.canvas.w * gf.canvas.h : null;
    rows.push(`${IND}gpu:   median=${gf.medianMs}ms over ${gf.samples} samples  scale=${gf.scale}`
      + (px ? `  canvas=${gf.canvas.w}x${gf.canvas.h} (${(px / 1e6).toFixed(2)} MP)` : "")
      // hunt 4 I5: the backends time different work; compare within one span only.
      + (gf.span ? `  span=${gf.span} (compare within a backend only)` : ""));
  }
  // Occlusion culling: counted, never timed.
  const oc = g.occlusion || {};
  if (oc.note || oc.error) {
    rows.push(`${IND}occl:  NOT MEASURED — ${oc.note || oc.error}`);
  } else if (oc.supported === false) {
    rows.push(`${IND}occl:  not supported on this backend (GLX only)`);
  } else if (oc.on === false) {
    rows.push(`${IND}occl:  off (apex26.occlusionCull unset) — supported=${oc.supported}`);
  } else {
    rows.push(`${IND}occl:  ON  tested=${oc.tested} culled=${oc.culled} queries=${oc.queries} passes=${oc.passes}`
      + (oc.tested ? `  -> ${Math.round(100 * oc.culled / oc.tested)}% of candidate chunks skipped` : "  <- NOTHING TESTED: the pass never ran"));
    rows.push(`${IND}       query lag: max=${oc.lagMax} avg=${oc.lagAvg} passes`
      + (oc.lagMax > 4 ? "   <- SLOW: a flag this late pops when the camera moves" : ""));
  }
  // The same counters after DRIVING: a parked camera hides every popping risk.
  const om = g.occlusionMoving || {};
  if (om.tested != null) {
    rows.push(`${IND}       moving: tested=${om.tested} culled=${om.culled} lagMax=${om.lagMax} lagAvg=${om.lagAvg}`
      + (om.tested ? `  -> ${Math.round(100 * om.culled / om.tested)}% skipped` : ""));
  } else if (om.note || om.error) {
    rows.push(`${IND}       moving: NOT MEASURED — ${om.note || om.error}`);
  }
  return rows;
}

/** THE IN-RUN A/B: same commit, same runner, clock pinned — the only honest
 *  comparison of two flag states this workflow can make. */
function abRows(g) {
  const rows = [];
  for (const ab of [g.occlusionAB, g.multiDrawAB]) {
    if (!ab) continue;
    const tag = (ab.feature === "multiDraw" ? "mdraw" : "occl ").padEnd(5);
    if (ab.skipped) {
      rows.push(`${IND}${tag} A/B: skipped — ${ab.note}`);
    } else if (ab.note || ab.error) {
      rows.push(`${IND}${tag} A/B: NOT MEASURED — ${ab.note || ab.error}`);
    } else if (ab.off && ab.on) {
      const pr = ab.paired || {};
      rows.push(`${IND}${tag} A/B: gpu off=${pr.off != null ? pr.off : ab.off.median}ms on=${pr.on != null ? pr.on : ab.on.median}ms  delta=${ab.gpuDeltaPct}% (interleaved, ${pr.samples || 0} samples)  `
        + `clock=${ab.clock != null ? ab.clock + ":00" : "?"} clockPinned=${ab.clockPinned} simFrozen=${ab.simFrozen}`
        + (ab.gpuDeltaPct != null && ab.gpuDeltaPct > 0 ? "   <- COSTS time here" : "   <- saves time here"));
      // THE FLOOR FIRST: off against off2 is the same state twice; the effect
      // only means anything if it clears it.
      const nf = ab.noiseFloor || {}, px = ab.pixels || {};
      if (nf.pctDiffering != null) {
        rows.push(`${IND}       floor:  same state twice -> ${nf.pctDiffering}% of pixels, gpu ${ab.gpuNoisePct}%`);
      }
      // WHICH FRAMES WERE SHOT (hunt 4 I1): equal gens are one frame shot three times.
      const pv = ["off", "off2", "on"].map((k) => (ab[k] && ab[k].present) || null);
      if (pv.some(Boolean)) {
        rows.push(`${IND}       frames: ${pv.map((p, i) => `${["off", "off2", "on"][i]}=${p ? p.mode + (p.gen != null ? "@" + p.gen : "") + (p.error ? "(" + p.error + ")" : "") : "?"}`).join(" ")}`
          + (ab.freshFrames === false ? "   <- STALE: the captures are not fresh frames; the pixel rows below compare the HUD" : ""));
      }
      if (px.error) rows.push(`${IND}       pixels: diff FAILED — ${px.error}`);
      else if (px.differing != null) {
        rows.push(`${IND}       pixels: ${px.differing} of ${px.ofTotal} differ (${px.pctDiffering}%) maxDelta=${px.maxChannelDelta} meanAbs=${px.meanAbsDelta}`
          + (ab.aboveFloor === true ? "   <- ABOVE the floor: the image CHANGED"
            : ab.aboveFloor === false ? "   (at the floor — no visible change)" : ""));
      }
      const st = (ab.on && ab.on.stats) || {};
      // COUNTED, AND PER FRAME: a raw total says nothing without its frames (run 143).
      const fr = (ab.on && ab.on.frames) || 0;
      const per = (n) => (fr > 0 && n != null ? (n / fr).toFixed(1) : "?");
      if (st.drawElementsAvoided != null) {
        rows.push(`${IND}       counted: ${st.multiCalls} multi-draw calls, ${st.rangesSubmitted} ranges, ${st.drawElementsAvoided} drawElements AVOIDED`
          + ` over ${fr} frames -> ${per(st.rangesSubmitted)} ranges/frame in ${per(st.multiCalls)} calls/frame`);
      }
      // THE GROUPING ORACLE: visible chunks -> groups by NEIGHBOUR -> groups by
      // light SET. When the lamp branch did NOT run, say why.
      if (st.plainFrames != null && !st.perChunkDraws) {
        rows.push(`${IND}       grouping: LAMP BRANCH DID NOT RUN — ${st.lampFrames} lamp draws vs ${st.plainFrames} plain;`
          + ` perChunkLights=${st.perChunkKnob} allLights=${st.allLightsLen} (gate needs knob>0 AND a lights array)`);
      }
      if (st.perChunkDraws) {
        rows.push(`${IND}       grouping: ${per(st.perChunkDraws)} visible chunks/frame -> ${per(st.consecutiveGroups)} groups by NEIGHBOUR -> ${per(st.setGroups)} by SET`
          + (st.setGroups > 0 ? `  (${(st.consecutiveGroups / st.setGroups).toFixed(2)}x fewer calls)` : ""));
      }
    }
  }
  return rows;
}

/** The env probe's own bookkeeping (run 54), the cube readback (run 75), the
 *  mip pass (PERF-FINDINGS 2t) and a failed governor read. REPORTED, NOT GATED. */
function envRows(env, gfx) {
  const rows = [];
  if (env.begins != null) {
    rows.push(`${IND}env:   mask=${env.mask} begins=${env.begins} ends=${env.ends} ` +
      `ready=${env.ready} badProbes=${env.badProbes}`);
  }
  // envBlank is a BRANCH MARKER (software clear path only); this reads the cube back.
  if (env.cube && env.cube.faces) {
    const f = env.cube.faces.map((c) => c.m).join("/");
    rows.push(`${IND}cube:  mean=${env.cube.mean} max=${env.cube.max} hdr=${env.cube.hdr} faces=${f}`
      + (env.cube.max <= 0.002 ? "   <- the cube is BLACK: the probe captured nothing" : ""));
  } else if (env.cube && env.cube.error) {
    rows.push(`${IND}cube:  readback FAILED: ${String(env.cube.error).slice(0, 90)}`);
  }
  // mipFn is typeof renderer.generateMipmaps: "undefined" = a SILENT no-op guard.
  if (env.mipFn != null) {
    rows.push(`${IND}mip:   fn=${env.mipFn} via=${env.mipWhere} ran=${env.mipRan}`
      + (env.mipErr ? ` err=${String(env.mipErr).slice(0, 120)}` : "")
      + (env.ready === true && env.mipRan === 0
        ? "   <- cube LATCHED with no mip pass; empty mips read black" : ""));
  }
  if (gfx.govError) rows.push(`${IND}gov:   read failed: ${gfx.govError}`);
  return rows;
}

function parseArgs(argv, env) {
  const o = { image: env.IMAGE || "", dir: process.cwd(), ls: env.CENSUS_LS || "", summary: env.GITHUB_STEP_SUMMARY || "" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--image") o.image = argv[++i];
    else if (a === "--dir") o.dir = argv[++i];
    else if (a === "--ls") o.ls = argv[++i];
    else if (a === "--summary") o.summary = argv[++i];
    else throw new Error(`unknown argument: ${a}`);
  }
  return o;
}

/** The CLI the workflow step runs. Returns the exit code. */
export function main(argv = process.argv.slice(2), env = process.env) {
  const o = parseArgs(argv, env);
  if (o.help) {
    console.log("usage: node tools/gfx/census-verdict.mjs [--image ID] [--dir DIR] [--ls \"apex26.k=v ...\"] [--summary FILE]\n" +
      "  defaults: IMAGE, cwd, CENSUS_LS, GITHUB_STEP_SUMMARY from the environment; exit 1 when a gate fails");
    return 0;
  }
  if (!o.image) { console.error("census-verdict: no image (--image or IMAGE)"); return 2; }
  const { census, legs } = readArtifacts(o.dir, o.image);
  const { rows, bad } = verdict({ image: o.image, census, legs, cap: capOverride(o.ls) });
  if (o.summary) { try { fs.appendFileSync(o.summary, rows.join("\n") + "\n"); } catch (_) { /* summary is best-effort */ } }
  console.log(rows.join("\n"));
  for (const b of bad) console.error(`::error::REAL-GPU GATE: ${b}`);
  return bad.length ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
