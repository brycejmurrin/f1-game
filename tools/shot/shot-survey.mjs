#!/usr/bin/env node
// shot-survey.mjs — multi-track apex_shot_survey CLI (job backend for apex_job_start kind shot_survey).
// @doc Multi-track shot survey CLI (job backend): track-session boots, resume, progress/findings JSON.
// @skill survey-track
import fs from "node:fs";
import { loadSurveyDesigns } from "../lib/custom-survey-locations.mjs";
import { SURVEY_LOCATIONS, CAMERA_RECIPES, listSurveyLocations, captureIdentity, sourceIdentity, surveyGlEnvironment } from "../lib/survey-scenarios.mjs";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseFlags } from "../lib/cli-args.mjs";
import { fileURLToPath } from "node:url";
import {
  buildSurveyPlans,
  estimateSurveyMs,
  filterResumeShots,
  surveyTerminalState,
  normalizeSurveyTracks,
  scoreShotFindings,
  writeCompareIndex,
  writeSurveyFindings,
  writeSurveyIndex,
  writeSurveyGalleryFromReports,
  writeSurveyProgress,
} from "../lib/track-shot-survey.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
if (!argv.includes("--help") && !argv.includes("-h")) {
  parseFlags(argv, ["--angles", "--cold-sessions", "--count", "--designs", "--dry-run", "--fracs", "--gl", "--label",
    "--list-locations", "--location", "--locations", "--no-index", "--no-panel", "--out", "--plan-file", "--plan-json",
    "--preset", "--profile", "--reports", "--resume", "--save-plan", "--seed", "--select", "--tod", "--track", "--tracks",
    "--weather", "--weathers"]);
}
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);
const designsFile = flag('--designs', '');
const customDesigns = designsFile ? loadSurveyDesigns(path.resolve(ROOT, designsFile)) : null;

function usage(code = 2) {
  console.error(`usage: node tools/shot/shot-survey.mjs --tracks id[,id…] [--preset scenery|quick|dual_lite|night_pass|lap|dual|inspect|full|custom]
       [--label name] [--out dir] [--resume] [--no-panel] [--no-index] [--gl llvmpipe|swiftshader]
       [--location spa/eau-rouge|monaco/turn-1 --angles overview,reverse,overhead --weathers dry,rain]
       [--profile preview|comparison --seed N --select name,name --plan-file FILE --save-plan FILE --list-locations]
       [--locations ID,ID --designs native-collection.json --cold-sessions]
       [--reports findings.json[,findings.json…]] [--fracs 0,0.5] [--count N] [--tod day|dusk|dawn|night] [--weather dry|wet|rain|overcast|fog] [--dry-run]`);
  process.exit(code);
}

if (has("--list-locations")) {
  const track = flag("--track", flag("--tracks", ""));
  console.log(JSON.stringify({ locations: track ? listSurveyLocations(track, customDesigns) : SURVEY_LOCATIONS,
    ...(track ? { track } : { hint: "Pass --track ID to list authored turns and anchors for any circuit." }),
    cameras: CAMERA_RECIPES }, null, 2));
  process.exit(0);
}
if (has("--help") || has("-h")) usage(0);

// Rebuild a portable gallery from saved surveys without booting Chromium.
if (has("--reports")) {
  const reports = flag("--reports", "").split(",").map((s) => s.trim()).filter(Boolean).map((s) => path.resolve(ROOT, s));
  if (!reports.length) throw new Error("--reports needs at least one findings.json path");
  const out = path.resolve(ROOT, flag("--out", "artifacts/track-survey/gallery"));
  if (has("--dry-run")) console.log(JSON.stringify({ ok: true, dryRun: true, reports, out, browser: false }));
  else console.log(JSON.stringify({ ok: true, browser: false, indexHtml: writeSurveyGalleryFromReports(out, reports), out }));
  process.exit(0);
}

const tracksCsv = flag("--tracks", flag("--track", ""));
const tracks = normalizeSurveyTracks({ tracks: tracksCsv.split(",").map((s) => s.trim()).filter(Boolean) });
const preset = flag("--preset", "scenery");
const label = flag("--label", "survey");
const outRoot = path.resolve(ROOT, flag("--out", `artifacts/track-survey/${tracks.join("-")}-${label}`));
const resume = has("--resume");
const wantPanel = !has("--no-panel");
const wantIndex = !has("--no-index");
const gl = flag("--gl", "");
const tod = flag("--tod", "");
const weather = flag("--weather", "");
const count = flag("--count", "");
const fracsRaw = flag("--fracs", "");
const dryRun = has("--dry-run");

const seed = Number(flag("--seed", "2391"));
if (!Number.isSafeInteger(seed) || seed < 0 || seed > 4294967295) throw new Error("seed must be a integer in 0..4294967295");
const planArgs = { preset, label, track: tracks[0], tracks, customDesigns };
// --plan-json: the plan-shaping options the flags below do not name (cam/cams/az/el/dist/h/side/hud/shots/cols/sheetName)
const planJson = flag("--plan-json", "");
if (planJson) Object.assign(planArgs, JSON.parse(planJson), { preset, label });
if (tod) planArgs.tod = tod;
if (weather) planArgs.weather = weather;
if (count) planArgs.count = Number(count);
if (fracsRaw) planArgs.fracs = fracsRaw.split(",").map(Number);
if (has("--location")) planArgs.location = flag("--location", "");
if (has("--locations")) planArgs.locations = flag("--locations", "").split(',');
if (has("--angles")) planArgs.angles = flag("--angles", "").split(",");
if (has("--weathers")) planArgs.weathers = flag("--weathers", "").split(",");
if (has("--plan-file")) Object.assign(planArgs, JSON.parse(fs.readFileSync(flag("--plan-file", ""), "utf8")));
if (has('--select')) planArgs.select = flag('--select', '').split(',');
const profile = flag('--profile', planArgs.location || planArgs.locations ? 'preview' : 'comparison');
if (!['preview', 'comparison'].includes(profile)) throw new Error('profile must be preview or comparison');
const plans = buildSurveyPlans(planArgs, tracks);
const plan = plans.get(tracks[0]);
for (const p of plans.values()) if (new Set(p.shots.map(s=>s.name)).size !== p.shots.length) throw new Error("Shot names must be unique");
if (has('--save-plan') && planArgs.locations && tracks.length > 1) throw new Error('Save named-location plans one track at a time');
if (has("--save-plan")) fs.writeFileSync(flag("--save-plan", ""), JSON.stringify({preset:"custom",label,shots:plan.shots},null,2));
const source = sourceIdentity(ROOT);
if (customDesigns) source.designsHash = customDesigns.digest;
const estimateMs = [...plans.values()].reduce((sum, p) => sum + estimateSurveyMs(p.shots.length, 1), 0);

if (dryRun) {
  console.log(JSON.stringify({
    ok: true, dryRun: true, profile, seed, source, tracks, out: outRoot, preset: plan.preset, label: plan.label,
    shotsPerTrack: plan.shots.length, estimateMs, resume, gl: gl || undefined, shots: plan.shots,
    plans: Object.fromEntries(plans),
  }, null, 2));
  process.exit(0);
}

fs.mkdirSync(outRoot, { recursive: true });
writeSurveyProgress(outRoot, {
  state: "starting", tracks, preset: plan.preset, label: plan.label,
  shotsPerTrack: plan.shots.length, estimateMs, trackIndex: 0, shotIndex: 0,
});

function sessionEnv() { return surveyGlEnvironment(process.env, gl); }

function stopSessionChild(child, state) {
  if (state.stopping) return state.stopping;
  if (state.dead || !child.pid) return Promise.resolve();
  state.stopping = new Promise((resolve, reject) => {
    const term = setTimeout(() => child.kill('SIGTERM'), 8000);
    const limit = setTimeout(() => {
      clearTimeout(term);
      reject(new Error('Track session did not finish shutting down; refusing another browser'));
    }, 23000);
    child.once('exit', () => { clearTimeout(term); clearTimeout(limit); resolve(); });
    child.stdin.end();
  });
  return state.stopping;
}

function runSession(track, outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(ROOT, "tools/shot/track-session.mjs"),
      "--serve", "--track", track, "--out", outDir, "--profile", profile, "--seed", String(seed),
      '--output-root', outRoot, ...(designsFile ? ['--designs', path.resolve(ROOT, designsFile)] : []),
    ], { cwd: ROOT, env: sessionEnv(), stdio: ["pipe", "pipe", "pipe"] });
    const state = { buf: "", pending: new Map(), seq: 0, ready: false, track, out: outDir };
    const fail = (e) => { stopSessionChild(child, state).then(() => reject(e), reject); };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      state.buf += d;
      let i;
      while ((i = state.buf.indexOf("\n")) >= 0) {
        const line = state.buf.slice(0, i); state.buf = state.buf.slice(i + 1);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if ("ready" in msg) {
          state.ready = !!msg.ready;
          if (!msg.ready) fail(new Error(msg.error || "track session not ready"));
          else resolve({
            child, state, boot: msg,
            send(cmd, timeoutMs = 240000) {
              if (state.dead) return Promise.reject(new Error('track session has exited'));
              return new Promise((res, rej) => {
                const id = ++state.seq;
                const timer = setTimeout(() => { state.pending.delete(id); rej(new Error(`no reply within ${timeoutMs} ms`)); }, timeoutMs);
                state.pending.set(id, { resolve: res, reject: rej, timer });
                child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n");
              });
            },
            close() { return stopSessionChild(child, state); },
          });
          continue;
        }
        const p = state.pending.get(msg.id);
        if (p) { state.pending.delete(msg.id); clearTimeout(p.timer); p.resolve(msg); }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => process.stderr.write(`[shot-survey ${track}] ${String(d).trim().slice(0, 300)}\n`));
    child.on("exit", (code, sig) => {
      state.dead = true;
      for (const p of state.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`track-session exited (${code ?? sig})`)); }
      state.pending.clear();
      if (!state.ready) fail(new Error(`track-session exited before ready (${code ?? sig})`));
    });
    child.on("error", fail);
    setTimeout(() => { if (!state.ready) fail(new Error("track session boot timeout 180s")); }, 180000).unref();
  });
}

const trackResults = [];
let hardFail = false;
let sess = null;

try {
for (let ti = 0; ti < tracks.length; ti++) {
  const track = tracks[ti];
  const plan = plans.get(track);
  if (!plan.shots.length) continue;
  const outDir = tracks.length === 1 ? outRoot : path.join(outRoot, track);
  fs.mkdirSync(outDir, { recursive: true });
  const identityContext = { extension: profile === "preview" ? "jpg" : "png", identities: Object.fromEntries(plan.shots.map(s=>[s.name,captureIdentity({ source, track, shot:s, profile, seed, gpu:sessionEnv().APEX_GPU })])) };
  const { pending, resumed, invalid } = filterResumeShots(outDir, plan.shots, resume, identityContext);
  for (const bad of invalid) console.error(`shot-survey: ${track}/${bad.name}.${identityContext.extension} is not a valid image (${bad.reason}); recapturing`);
  const invalidNames = new Set(invalid.map((b) => b.name));
  for (const s of pending) {
    if (!invalidNames.has(s.name) && fs.existsSync(path.join(outDir, `${s.name}.${identityContext.extension}`))) throw new Error("Existing capture does not match this plan/revision; choose a new output directory: " + s.name);
  }
  writeSurveyProgress(outRoot, {
    state: "running", track, tracks, trackIndex: ti, pending: pending.length, resumed: resumed.length, invalid,
    shotsPerTrack: plan.shots.length, estimateMs,
  });

  const captured = resumed.map((s) => ({ ...s, track, flags: scoreShotFindings(s) }));
  const failed = [];
  let panelPng = null;
  const existingPanel = path.join(outDir, `${plan.sheetName}.png`);
  if (fs.existsSync(existingPanel)) panelPng = existingPanel;

  try {
    if (pending.length) {
      let sessionRecord;
      if (!sess) { sess = await runSession(track, outDir); sessionRecord = { ...sess.boot, reusedSession: false }; }
      else {
        const switched = await sess.send({ track, out: outDir });
        if (!switched.ok) throw new Error(switched.error || 'track switch failed');
        sessionRecord = { ...switched, reusedSession: true, bootMs: 0, profile, diagnostics: sess.boot.diagnostics };
      }
      fs.writeFileSync(path.join(outDir, "session.json"), JSON.stringify({source,profile,seed,...sessionRecord},null,2));
      for (let si = 0; si < pending.length; si++) {
        const s = pending[si];
        writeSurveyProgress(outRoot, {
          state: "shooting", track, tracks, trackIndex: ti, shotIndex: si,
          shot: s.name, pendingLeft: pending.length - si, captured: captured.length,
        });
        let reply;
        try {
          reply = await sess.send({
            ...s, shot: s.name, frac: s.frac, cam: s.cam, az: s.az, el: s.el, dist: s.dist,
            h: s.h, side: s.side, tod: s.tod, weather: s.weather, hud: s.hud,
          });
        } catch (e) {
          failed.push({ ...s, track, error: String(e.message || e) });
          continue;
        }
        if (reply.ok) {
          const row = { ...s, track: reply.track || track, png: reply.png, spread: reply.spread, kb: reply.kb, timings: reply.timings };
          fs.writeFileSync(reply.png + ".capture.json", JSON.stringify({ identity:identityContext.identities[s.name], source, profile, seed, job:{...s,track}, timings:reply.timings, frame:reply.frame, state:{plugin:{renderer:sess.boot.diagnostics}} },null,2));
          row.flags = scoreShotFindings(row);
          captured.push(row);
        } else failed.push({ ...s, track, error: reply.error || "shot failed" });
      }
      if (wantPanel && captured.length) {
        try {
          const sh = await sess.send({ sheet: plan.sheetName, cols: plan.cols || 0 });
          if (sh.ok) panelPng = sh.png;
        } catch (e) {
          process.stderr.write(`[shot-survey] panel failed: ${e.message}\n`);
        }
      }
    }

    let indexHtml = null;
    if (wantIndex && captured.length) {
      indexHtml = writeSurveyIndex(outDir, {
        track: captured[0]?.track || track, label: plan.label, preset: plan.preset, shots: captured, panelPng, ok: captured.length,
      });
    }
    {
      const findings = writeSurveyFindings(outDir, {
        ok: failed.length === 0, failed: failed.length, failures: failed,
        track: captured[0]?.track || track, label: plan.label, preset: plan.preset, shots: captured, panelPng, indexHtml,
      });
      trackResults.push({
        track: captured[0]?.track || track, out: outDir, captured: captured.length, failed: failed.length,
        panel: panelPng, indexHtml, shots: captured, findings: findings.file, failures: failed.length ? failed : undefined,
        relIndex: indexHtml ? path.relative(outRoot, indexHtml) : `${track}/index.html`,
      });
    }
    if (!captured.length) hardFail = true;
    if (failed.length) hardFail = true;
  } catch (e) {
    hardFail = true;
    trackResults.push({ track, out: outDir, error: String(e.message || e) });
    process.stderr.write(`[shot-survey] ${track}: ${e.message || e}\n`);
    if (sess) { await sess.close(); sess = null; }
  } finally {
    if (has('--cold-sessions') && sess) { await sess.close(); sess = null; }
  }
}
} finally { if (sess) await sess.close(); }

let compareIndex = null;
if (tracks.length > 1 && wantIndex) {
  compareIndex = writeCompareIndex(outRoot, {
    label: plan.label, preset: plan.preset,
    tracks: trackResults.map((t) => ({
      track: t.track,
      captured: t.captured,
      shots: t.shots, failed: t.failed, failures: t.failures, error: t.error,
      panel: t.panel ? path.relative(outRoot, t.panel) : null,
      relIndex: t.indexHtml ? t.relIndex || `${t.track}/index.html` : null,
    })),
  });
}

writeSurveyProgress(outRoot, {
  state: surveyTerminalState(trackResults, hardFail), tracks, trackResults: trackResults.map((t) => ({
    track: t.track, captured: t.captured, failed: t.failed, error: t.error,
  })),
  compareIndex, estimateMs,
});

const summary = {
  ok: !hardFail && trackResults.every((t) => !t.error && (t.captured > 0 || t.skipped)),
  tracks, out: outRoot, preset: plan.preset, label: plan.label, source, profile, seed,
  estimateMs, compareIndex, trackResults,
  hint: hardFail
    ? "Retry with --resume to skip finished cells; check progress.json / findings.json."
    : "Open index.html (or per-track galleries); watch progress.json during long runs.",
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
