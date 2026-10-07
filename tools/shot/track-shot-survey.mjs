#!/usr/bin/env node
// track-shot-survey.mjs — CLI for multi-shot track scenery surveys (one boot per track, panel + index).
// @doc One Chromium boot per circuit: preset/fracs shots, contact sheet, index.html, JSON summary; `--tracks` queues sequentially.
// @skill survey-track
//
// Used by apex_job_start kind shot_survey and by agents when host MCP would timeout.
// Progress lines: `= shot i/n …` and `= survey done …` for apex_job_status tails.
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import {
  buildTrackShotSurveyPlan,
  writeSurveyIndex,
  MAX_SURVEY_SHOTS,
} from "../lib/track-shot-survey.mjs";

const ROOT = fileURLToPath(new URL("../..", import.meta.url)).replace(/[\\/]$/, "");
const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf(n); return i >= 0 && i + 1 < argv.length ? argv[i + 1] : d; };
const has = (n) => argv.includes(n);

if (has("--help") || has("-h")) {
  console.log(`track-shot-survey — one boot, many shots, panel + index.html

  node tools/shot/track-shot-survey.mjs --track monza [--preset scenery|lap|dual|inspect]
  node tools/shot/track-shot-survey.mjs --tracks monza,monaco,spa --preset dual
  node tools/shot/track-shot-survey.mjs --track spa --fracs 0,0.25,0.5,0.75 --cam orbit
  node tools/shot/track-shot-survey.mjs --plan --track monza --preset dual

  --out DIR     under artifacts/ or scratch/ (default artifacts/track-survey/<track>-<label>)
  --label STR   shot name prefix (default survey)
  --cols N      panel columns (0 = auto)
  --no-panel / --no-index
  --json        print one summary object on stdout at the end
`);
  process.exit(0);
}

function parseTracks() {
  const multi = flag("--tracks", "");
  const one = flag("--track", "");
  if (multi) {
    const ids = multi.split(",").map((s) => s.trim()).filter(Boolean);
    if (!ids.length || ids.length > 16) throw new Error("--tracks: 1..16 circuit ids");
    return ids;
  }
  if (!one) throw new Error("need --track <id> or --tracks a,b,c");
  return [one];
}

function planArgsFromCli() {
  const preset = flag("--preset", "scenery");
  const label = flag("--label", "survey");
  const cols = Number(flag("--cols", "0")) || 0;
  const sheetName = flag("--sheet", "") || undefined;
  const args = { preset, label, cols, sheetName };
  const fracs = flag("--fracs", "");
  if (fracs) args.fracs = fracs.split(",").map((s) => Number(s.trim()));
  const count = flag("--count", "");
  if (count) args.count = Number(count);
  const cam = flag("--cam", "");
  if (cam) args.cam = cam;
  const cams = flag("--cams", "");
  if (cams) args.cams = cams.split(",").map((s) => s.trim());
  for (const k of ["az", "el", "dist", "h"]) {
    const v = flag(`--${k}`, "");
    if (v !== "") args[k] = Number(v);
  }
  const tod = flag("--tod", "");
  if (tod) args.tod = tod;
  if (has("--hud")) args.hud = true;
  return args;
}

function assertOut(rel) {
  const abs = resolve(ROOT, rel);
  if (!abs.startsWith(ROOT) || !/(^|\/)(artifacts|scratch)(\/|$)/.test(rel.replace(/\\/g, "/"))) {
    throw new Error(`--out must be under artifacts/ or scratch/ (got ${rel})`);
  }
  return abs;
}

/** Drive track-session.mjs --serve with JSON-line ops; resolve each reply by id. */
function openSession(track, outDir) {
  const child = spawn(process.execPath, [
    join(ROOT, "tools/shot/track-session.mjs"),
    "--serve", "--track", track, "--out", outDir,
  ], { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"] });
  const pending = new Map();
  let seq = 0;
  let buf = "";
  let ready = null;
  const readyP = new Promise((resolve) => { ready = resolve; setTimeout(() => resolve(null), 180000); });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      let msg; try { msg = JSON.parse(line); } catch { continue; }
      if ("ready" in msg) { ready(msg); continue; }
      const p = pending.get(msg.id);
      if (p) { pending.delete(msg.id); clearTimeout(p.timer); p.resolve(msg); }
    }
  });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => {
    const t = String(d).trim().slice(0, 200);
    if (t) console.error(`[track-session] ${t}`);
  });
  const send = (cmd, timeoutMs = 240000) => new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`no reply within ${timeoutMs} ms`)); }, timeoutMs);
    pending.set(id, { resolve, reject, timer });
    child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n");
  });
  const close = () => new Promise((resolve) => {
    try { child.stdin.end(); } catch { /* gone */ }
    const t = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve(); }, 8000);
    child.on("exit", () => { clearTimeout(t); resolve(); });
  });
  return { readyP, send, close, child };
}

async function runOneTrack(track, cliArgs, outRoot) {
  const plan = buildTrackShotSurveyPlan({ ...cliArgs, label: cliArgs.label || "survey" });
  const outDir = assertOut(outRoot || `artifacts/track-survey/${track}-${plan.label}`);
  mkdirSync(outDir, { recursive: true });
  const n = plan.shots.length;
  console.log(`= survey start track=${track} preset=${plan.preset} shots=${n} out=${outDir}`);

  const sess = openSession(track, outDir);
  const r = await sess.readyP;
  if (!r || !r.ready) {
    await sess.close();
    throw new Error(`session never ready${r && r.error ? `: ${r.error}` : ""}`);
  }
  console.log(`= survey ready track=${track} bootMs=${r.bootMs} buildMs=${r.buildMs}`);

  const captured = [];
  const failed = [];
  try {
    for (let i = 0; i < plan.shots.length; i++) {
      const s = plan.shots[i];
      console.log(`= shot ${i + 1}/${n} ${track} ${s.name} frac=${s.frac} cam=${s.cam}`);
      let reply;
      try {
        reply = await sess.send({
          shot: s.name, frac: s.frac, cam: s.cam, az: s.az, el: s.el, dist: s.dist,
          h: s.h, side: s.side, tod: s.tod, hud: s.hud,
        });
      } catch (e) {
        failed.push({ ...s, error: String(e.message || e) });
        console.log(`= shot fail ${s.name}: ${e.message || e}`);
        continue;
      }
      if (reply.ok) {
        captured.push({ ...s, track, png: reply.png, spread: reply.spread, kb: reply.kb });
      } else {
        failed.push({ ...s, error: reply.error || "shot failed" });
        console.log(`= shot fail ${s.name}: ${reply.error || "shot failed"}`);
      }
    }

    let panelPng = null;
    if (!has("--no-panel") && captured.length) {
      const sh = await sess.send({ sheet: plan.sheetName, cols: plan.cols || 0 }, 120000);
      if (sh.ok) {
        panelPng = sh.png;
        console.log(`= panel ${panelPng}`);
      }
    }
    let indexHtml = null;
    if (!has("--no-index") && captured.length) {
      indexHtml = writeSurveyIndex(outDir, {
        track, label: plan.label, preset: plan.preset, shots: captured, panelPng, ok: captured.length,
      });
      console.log(`= index ${indexHtml}`);
    }

    const summary = {
      ok: captured.length > 0 && failed.length === 0,
      track,
      out: outDir,
      preset: plan.preset,
      label: plan.label,
      captured: captured.length,
      failed: failed.length,
      shots: captured,
      failures: failed.length ? failed : undefined,
      panel: panelPng,
      indexHtml,
    };
    writeFileSync(join(outDir, "survey.json"), JSON.stringify(summary, null, 2));
    console.log(`= survey track-done track=${track} ok=${summary.ok} captured=${summary.captured} failed=${summary.failed}`);
    return summary;
  } finally {
    await sess.close();
  }
}

async function main() {
  const tracks = parseTracks();
  const cliArgs = planArgsFromCli();
  if (has("--plan")) {
    const plans = tracks.map((track) => ({ track, ...buildTrackShotSurveyPlan(cliArgs) }));
    console.log(JSON.stringify({ ok: true, plan: true, tracks: plans }, null, 2));
    return 0;
  }
  // Validate plans early (shot cap).
  for (const track of tracks) {
    const p = buildTrackShotSurveyPlan(cliArgs);
    if (p.shots.length > MAX_SURVEY_SHOTS) throw new Error(`${track}: too many shots`);
  }

  const results = [];
  for (const track of tracks) {
    const out = flag("--out", "") || `artifacts/track-survey/${track}-${cliArgs.label || "survey"}`;
    // Multi-track with a single --out: nest per track.
    const outDir = tracks.length > 1 && flag("--out", "")
      ? join(flag("--out", ""), track)
      : out;
    results.push(await runOneTrack(track, cliArgs, outDir));
  }

  const ok = results.every((r) => r.ok);
  const summary = {
    ok,
    tracks: results.map((r) => r.track),
    results,
    captured: results.reduce((a, r) => a + r.captured, 0),
    failed: results.reduce((a, r) => a + r.failed, 0),
  };
  console.log(`= survey done ok=${ok} tracks=${tracks.length} captured=${summary.captured} failed=${summary.failed}`);
  if (has("--json")) console.log(JSON.stringify(summary));
  else if (tracks.length > 1) {
    const roll = flag("--out", "") || "artifacts/track-survey/multi";
    try {
      const abs = assertOut(roll);
      mkdirSync(abs, { recursive: true });
      writeFileSync(join(abs, "survey-multi.json"), JSON.stringify(summary, null, 2));
    } catch { /* out optional */ }
  }
  return ok ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error(String(e.message || e));
  console.log(`= survey done ok=false error=${String(e.message || e).slice(0, 120)}`);
  process.exit(1);
});
