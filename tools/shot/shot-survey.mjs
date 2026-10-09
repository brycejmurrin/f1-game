#!/usr/bin/env node
// shot-survey.mjs — multi-track apex_shot_survey CLI (job backend for apex_job_start kind shot_survey).
// @doc Multi-track shot survey CLI (job backend): track-session boots, resume, progress/findings JSON.
// @skill survey-track
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildTrackShotSurveyPlan,
  estimateSurveyMs,
  filterResumeShots,
  normalizeSurveyTracks,
  scoreShotFindings,
  writeCompareIndex,
  writeSurveyFindings,
  writeSurveyIndex,
  writeSurveyProgress,
} from "../lib/track-shot-survey.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
const flag = (n, d) => {
  const i = argv.indexOf(n);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d;
};
const has = (n) => argv.includes(n);

function usage(code = 2) {
  console.error(`usage: node tools/shot/shot-survey.mjs --tracks id[,id…] [--preset scenery|quick|dual_lite|night_pass|lap|dual|inspect|full|custom]
       [--label name] [--out dir] [--resume] [--no-panel] [--no-index] [--gl llvmpipe|swiftshader]
       [--fracs 0,0.5] [--count N] [--tod day|dusk|dawn|night] [--dry-run]`);
  process.exit(code);
}

if (has("--help") || has("-h")) usage(0);

const tracksCsv = flag("--tracks", flag("--track", ""));
const tracks = normalizeSurveyTracks({ tracks: tracksCsv.split(",").map((s) => s.trim()).filter(Boolean) });
const preset = flag("--preset", "scenery");
const label = flag("--label", "survey");
const outRoot = path.resolve(ROOT, flag("--out", `artifacts/track-survey/${tracks.join("-")}-${label}`));
const resume = has("--resume");
const wantPanel = !has("--no-panel");
const wantIndex = !has("--no-index");
const gl = flag("--gl", process.env.APEX_GL || "");
const tod = flag("--tod", "");
const count = flag("--count", "");
const fracsRaw = flag("--fracs", "");
const dryRun = has("--dry-run");

const planArgs = { preset, label };
if (tod) planArgs.tod = tod;
if (count) planArgs.count = Number(count);
if (fracsRaw) planArgs.fracs = fracsRaw.split(",").map(Number);
const plan = buildTrackShotSurveyPlan(planArgs);
const estimateMs = estimateSurveyMs(plan.shots.length, tracks.length);

if (dryRun) {
  console.log(JSON.stringify({
    ok: true, dryRun: true, tracks, out: outRoot, preset: plan.preset, label: plan.label,
    shotsPerTrack: plan.shots.length, estimateMs, resume, gl: gl || undefined, shots: plan.shots,
  }, null, 2));
  process.exit(0);
}

fs.mkdirSync(outRoot, { recursive: true });
writeSurveyProgress(outRoot, {
  state: "starting", tracks, preset: plan.preset, label: plan.label,
  shotsPerTrack: plan.shots.length, estimateMs, trackIndex: 0, shotIndex: 0,
});

function mesaLikely() {
  try {
    return fs.existsSync("/usr/lib/x86_64-linux-gnu/dri/swrast_dri.so")
      || fs.existsSync("/usr/lib/x86_64-linux-gnu/dri/llvmpipe_dri.so");
  } catch { return false; }
}

function sessionEnv() {
  const env = { ...process.env };
  const want = gl || (mesaLikely() && !env.APEX_GL ? "llvmpipe" : env.APEX_GL);
  if (want === "llvmpipe" || want === "swiftshader") env.APEX_GL = want;
  return env;
}

function runSession(track, outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(ROOT, "tools/shot/track-session.mjs"),
      "--serve", "--track", track, "--out", outDir,
    ], { cwd: ROOT, env: sessionEnv(), stdio: ["pipe", "pipe", "pipe"] });
    const state = { buf: "", pending: new Map(), seq: 0, ready: false, track, out: outDir };
    const fail = (e) => { try { child.kill("SIGTERM"); } catch { /* */ } reject(e); };
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
            child, state,
            send(cmd, timeoutMs = 240000) {
              return new Promise((res, rej) => {
                const id = ++state.seq;
                const timer = setTimeout(() => { state.pending.delete(id); rej(new Error(`no reply within ${timeoutMs} ms`)); }, timeoutMs);
                state.pending.set(id, { resolve: res, reject: rej, timer });
                child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n");
              });
            },
            async close() {
              try { child.stdin.end(); } catch { /* */ }
              await new Promise((r) => { child.once("exit", r); setTimeout(r, 8000); });
            },
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
      if (!state.ready) fail(new Error(`track-session exited before ready (${code ?? sig})`));
    });
    child.on("error", fail);
    setTimeout(() => { if (!state.ready) fail(new Error("track session boot timeout 180s")); }, 180000).unref();
  });
}

const trackResults = [];
let hardFail = false;

for (let ti = 0; ti < tracks.length; ti++) {
  const track = tracks[ti];
  const outDir = tracks.length === 1 ? outRoot : path.join(outRoot, track);
  fs.mkdirSync(outDir, { recursive: true });
  const { pending, resumed } = filterResumeShots(outDir, plan.shots, resume);
  writeSurveyProgress(outRoot, {
    state: "running", track, tracks, trackIndex: ti, pending: pending.length, resumed: resumed.length,
    shotsPerTrack: plan.shots.length, estimateMs,
  });

  const captured = resumed.map((s) => ({ ...s, track, flags: scoreShotFindings(s) }));
  const failed = [];
  let panelPng = null;
  const existingPanel = path.join(outDir, `${plan.sheetName}.png`);
  if (fs.existsSync(existingPanel)) panelPng = existingPanel;

  let sess = null;
  try {
    if (pending.length) {
      sess = await runSession(track, outDir);
      for (let si = 0; si < pending.length; si++) {
        const s = pending[si];
        writeSurveyProgress(outRoot, {
          state: "shooting", track, tracks, trackIndex: ti, shotIndex: si,
          shot: s.name, pendingLeft: pending.length - si, captured: captured.length,
        });
        let reply;
        try {
          reply = await sess.send({
            shot: s.name, frac: s.frac, cam: s.cam, az: s.az, el: s.el, dist: s.dist,
            h: s.h, side: s.side, tod: s.tod, hud: s.hud,
          });
        } catch (e) {
          failed.push({ ...s, track, error: String(e.message || e) });
          continue;
        }
        if (reply.ok) {
          const row = { ...s, track, png: reply.png, spread: reply.spread, kb: reply.kb };
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
        track, label: plan.label, preset: plan.preset, shots: captured, panelPng, ok: captured.length,
      });
    }
    if (captured.length) {
      const findings = writeSurveyFindings(outDir, {
        ok: failed.length === 0,
        track, label: plan.label, preset: plan.preset, shots: captured, panelPng, indexHtml,
      });
      trackResults.push({
        track, out: outDir, captured: captured.length, failed: failed.length,
        panel: panelPng, indexHtml, findings: findings.file, failures: failed.length ? failed : undefined,
        relIndex: indexHtml ? path.relative(outRoot, indexHtml) : `${track}/index.html`,
      });
    } else {
      trackResults.push({ track, out: outDir, captured: 0, failed: failed.length || 1, skipped: !failed.length });
      hardFail = true;
    }
    if (failed.length) hardFail = true;
  } catch (e) {
    hardFail = true;
    trackResults.push({ track, out: outDir, error: String(e.message || e) });
    process.stderr.write(`[shot-survey] ${track}: ${e.message || e}\n`);
  } finally {
    if (sess) await sess.close();
  }
}

let compareIndex = null;
if (tracks.length > 1 && wantIndex) {
  compareIndex = writeCompareIndex(outRoot, {
    label: plan.label, preset: plan.preset,
    tracks: trackResults.filter((t) => t.indexHtml || t.panel).map((t) => ({
      track: t.track,
      captured: t.captured,
      panel: t.panel ? path.relative(outRoot, t.panel) : null,
      relIndex: t.relIndex || `${t.track}/index.html`,
    })),
  });
}

writeSurveyProgress(outRoot, {
  state: hardFail ? "failed" : "done", tracks, trackResults: trackResults.map((t) => ({
    track: t.track, captured: t.captured, failed: t.failed, error: t.error,
  })),
  compareIndex, estimateMs,
});

const summary = {
  ok: !hardFail && trackResults.every((t) => !t.error && (t.captured > 0 || t.skipped)),
  tracks, out: outRoot, preset: plan.preset, label: plan.label,
  estimateMs, compareIndex, trackResults,
  hint: hardFail
    ? "Retry with --resume to skip finished cells; check progress.json / findings.json."
    : "Open index.html (or per-track galleries); watch progress.json during long runs.",
};
console.log(JSON.stringify(summary, null, 2));
process.exit(summary.ok ? 0 : 1);
