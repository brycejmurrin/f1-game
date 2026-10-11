// apex-extras.mjs — the session, job, UI, car and track-audit handlers behind apex-tools-mcp.mjs.
// @doc Handlers for apex_track (track session), apex_job_* (background CLIs), apex_ui_*, apex_car_audit, apex_track_audit.
// @skill check-changes
//
// The catalog entries stay in apex-tools-mcp.mjs (agent-surface.test.mjs reads
// each name + description there); this module gets the server's helpers in
// `ctx` and returns one handler per tool. Why each exists (2026-10-03):
//   apex_track  — a 45-shot survey through apex_shot booted Chromium 45 times
//                 (~35 min); one session boots once and shoots in ~10–25 s.
//   apex_job_*  — survey-track --oblique, layout-audit matrices, parts-sweep
//                 (102 s), livery-contrast (95 s a team) outlive any client's
//                 tool timeout; a job returns an id at once and runs on.
//   apex_ui_*   — one menu screen × viewport: geometry numbers or PNG + DOM, ~15 s.
//   apex_car_audit / apex_track_audit — the offline checks agents ran by hand.
import fs from "node:fs";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import sharp from "sharp";
import {
  buildTrackShotSurveyPlan,
  estimateSurveyMs,
  filterResumeShots,
  normalizeSurveyTracks,
  scoreShotFindings,
  shouldSurveyAsync,
  writeCompareIndex,
  writeSurveyFindings,
  writeSurveyIndex,
  writeSurveyProgress,
} from "../lib/track-shot-survey.mjs";

const TRACK_TOOL = "tools/shot/track-session.mjs";
const ID_RE = /^[a-z0-9_]{2,40}$/;
const LIST_RE = /^[a-z0-9*_,.-]{1,200}$/i;
const REF_RE = /^[A-Za-z0-9._\/~^@{}-]{1,200}$/;

/** A process and every descendant, read BEFORE anything is killed: Playwright
 *  starts Chromium in its own process group, so killing the CLI's group left
 *  the browser running ~7 s after the lock read free (2026-10-03 re-test), and
 *  once its parent exits a browser is re-parented to init and unreachable. */
export function processTree(rootPid) {
  if (!rootPid) return [];
  let rows;
  try { rows = execFileSync("ps", ["-eo", "pid=,ppid="], { encoding: "utf8", timeout: 5000 }); } catch { return [rootPid]; }
  const kids = new Map();
  for (const line of rows.split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid && ppid) { if (!kids.has(ppid)) kids.set(ppid, []); kids.get(ppid).push(pid); }
  }
  const out = [rootPid];
  for (let i = 0; i < out.length; i++) for (const k of kids.get(out[i]) || []) out.push(k);
  return out;
}
const alive = (pid) => {
  try { return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8")); }   // a zombie is gone
  catch { try { process.kill(pid, 0); return true; } catch { return false; } }
};
/** SIGTERM every pid (and the root's group), SIGKILL survivors after graceMs,
 *  resolve once all are gone or maxMs passes. Release a lock only after this. */
export async function killTreeAndWait(pids, { graceMs = 3000, maxMs = 15000 } = {}) {
  const sig = (s) => { for (const p of pids) { try { process.kill(p, s); } catch { /* gone */ } } try { process.kill(-pids[0], s); } catch { /* not a leader */ } };
  sig("SIGTERM");
  const t0 = Date.now();
  let killed = false;
  while (pids.some(alive) && Date.now() - t0 < maxMs) {
    if (!killed && Date.now() - t0 > graceMs) { sig("SIGKILL"); killed = true; }
    await new Promise((r) => setTimeout(r, 150));
  }
  return { pids: pids.length, survivors: pids.filter(alive) };
}

/** An MCP image block for a PNG: a 640-px JPEG thumbnail, so an agent sees the
 *  frame in the result instead of spending a Read on it. */
export async function thumbBlock(png, width = 640) {
  const buf = await sharp(png).resize({ width, withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return { type: "image", data: buf.toString("base64"), mimeType: "image/jpeg" };
}

export function createExtras(ctx) {
  const { ROOT, toolResult, refuse, acquireLock, releaseLock, occupancyRefuse, assertSafeOut,
    knownCircuits, runSpawn, log, mockMode } = ctx;
  const nodeArgv = (rel, ...a) => [process.execPath, path.join(ROOT, "tools", rel), ...a];
  const bodyOf = (r) => JSON.parse(r.content[0].text);
  const rewrap = (r, patch) => { const b = { ...bodyOf(r), ...patch }; r.content[0].text = JSON.stringify(b); r.isError = b.ok === false ? true : undefined; if (!r.isError) delete r.isError; return r; };
  const withImage = async (result, png, want) => {
    if (want === false || !png || !fs.existsSync(png)) return result;
    try { result.content.push(await thumbBlock(png)); } catch (e) { log(`thumb failed: ${e.message}`); }
    return result;
  };
  const needTrack = (id) => {
    if (!ID_RE.test(String(id || "")) || !knownCircuits().includes(String(id))) {
      throw Object.assign(new Error("bad track"), { refuse: refuse("bad_args", `unknown track ${id}`, `Tracks.LIST ids: ${knownCircuits().join(", ")}.`) });
    }
    return String(id);
  };

  // ── apex_track: one persistent track-session.mjs child ───────────────────
  let sess = null;
  /** Close the session; the returned promise settles once its whole process
   *  tree is gone and the lock is free, so a status right after close is true. */
  function sessClose(reason) {
    if (!sess) return null;
    const s = sess; sess = null;
    for (const p of s.pending.values()) { clearTimeout(p.timer); p.reject(new Error(`session closed: ${reason}`)); }
    const tree = processTree(s.child.pid);
    try { s.child.stdin.end(); } catch { /* gone */ }
    const summary = { closed: true, reason, uptimeMs: Date.now() - s.started, shots: s.shots };
    s.closing = (async () => {
      // A clean EOF shutdown first (track-session closes its browser), then the tree.
      const t0 = Date.now();
      while (!s.exited && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 150));
      const left = await killTreeAndWait(tree);
      releaseLock();
      return { ...summary, survivors: left.survivors.length };
    })();
    return summary;
  }
  function sessSend(cmd, timeoutMs = 240000) {
    return new Promise((resolve, reject) => {
      const id = ++sess.seq;
      const timer = setTimeout(() => { if (sess) sess.pending.delete(id); reject(new Error(`no reply within ${timeoutMs} ms`)); }, timeoutMs);
      sess.pending.set(id, { resolve, reject, timer });
      sess.child.stdin.write(JSON.stringify({ id, ...cmd }) + "\n");
    });
  }
  function surveyGlEnv(args = {}) {
    const env = { ...process.env };
    const want = args.gl || env.APEX_GL || (fs.existsSync("/usr/lib/x86_64-linux-gnu/dri/swrast_dri.so") ? "llvmpipe" : "");
    if (want === "llvmpipe" || want === "swiftshader") env.APEX_GL = want;
    return env;
  }
  async function trackOpen(args) {
    const track = needTrack(args.track || "monza");
    const out = assertSafeOut(args.out || `artifacts/track-session/${track}`);
    const argv = nodeArgv("shot/track-session.mjs", "--serve", "--track", track, "--out", out);
    if (sess) return toolResult({ ok: true, op: "open", alreadyOpen: true, track: sess.track, hint: 'op "track" switches circuits; "close" ends the session.' });
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, op: "open", argv });
    if (mockMode()) return toolResult({ ok: true, mock: true, op: "open", argv });
    const took = acquireLock("apex_track");
    if (took) return took;
    const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, env: surveyGlEnv(args), stdio: ["pipe", "pipe", "pipe"], detached: true });
    const s = sess = { child, track, pending: new Map(), seq: 0, buf: "", started: Date.now(), shots: 0, exited: false, out };
    const ready = new Promise((resolve) => {
      s.onReady = resolve;
      setTimeout(() => resolve(null), 180000).unref();
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => {
      s.buf += d;
      let i;
      while ((i = s.buf.indexOf("\n")) >= 0) {
        const line = s.buf.slice(0, i); s.buf = s.buf.slice(i + 1);
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if ("ready" in msg) { s.onReady(msg); continue; }
        const p = s.pending.get(msg.id);
        if (p) { s.pending.delete(msg.id); clearTimeout(p.timer); p.resolve(msg); }
      }
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (d) => log(`[track] ${String(d).trim().slice(0, 300)}`));
    child.on("exit", (code, sig) => {
      s.exited = true;
      s.onReady(null);
      if (sess === s) sessClose(`exit ${code ?? sig}`);   // releases once the tree is gone
    });
    const r = await ready;
    if (!r || !r.ready) {
      const why = sess === s ? sessClose("not ready") : null;
      if (s.closing) await s.closing;
      return refuse("track_boot_failed", `track session never became ready${r && r.error ? `: ${r.error}` : ""}`, "Check apex_status (load, orphan Chromium) and retry.", why);
    }
    return toolResult({ ok: true, op: "open", ...r, hint: "Now op shot / eval / track / sheet / diff; op close when done (the browser lock is held until then)." });
  }
  /** One boot, N shots, optional contact panel + index.html (apex_shot_survey / apex_track op survey).
   *  Multi-track / long estimates default to apex_job_start kind shot_survey (async jobId). */
  /** The plan options shot-survey.mjs has no flag for; the async job carries them as --plan-json. */
  const pickPlanArgs = (a) => {
    const o = {};
    for (const k of ["cam", "cams", "az", "el", "dist", "h", "side", "hud", "shots", "cols", "sheetName"]) if (a[k] != null) o[k] = a[k];
    return o;
  };
  async function handleShotSurvey(args = {}) {
    let tracks;
    try {
      tracks = normalizeSurveyTracks(args).map((id) => needTrack(id));
    } catch (e) {
      if (e.refuse) return e.refuse;
      return refuse("bad_args", String(e.message || e), "Pass track or tracks[] with Tracks.LIST ids.");
    }
    let plan;
    try { plan = buildTrackShotSurveyPlan(args); }
    catch (e) { return refuse("bad_args", String(e.message || e), "See apex_shot_survey inputSchema."); }
    const label = plan.label;
    const outRoot = assertSafeOut(args.out || (tracks.length === 1
      ? `artifacts/track-survey/${tracks[0]}-${label}`
      : `artifacts/track-survey/${tracks.join("-")}-${label}`));
    const wantPanel = args.panel !== false;
    const wantIndex = args.index !== false;
    const resume = !!args.resume;
    const estimateMs = estimateSurveyMs(plan.shots.length, tracks.length);
    const asJob = shouldSurveyAsync(args, plan, tracks.length);

    if (args.dryRun) {
      return toolResult({
        ok: true, dryRun: true, track: tracks[0], tracks, out: outRoot, ...plan,
        estimateMs, asyncDefault: asJob, resume,
        hint: asJob
          ? "Long/multi-track: omit async:false to get a jobId via shot_survey; watch apex_job_status."
          : "Sync path: one track-session boot, then each shot (~10–25 s), sheet + index + findings.json.",
      });
    }
    if (mockMode()) {
      return toolResult({
        ok: true, mock: true, track: tracks[0], tracks, out: outRoot, ...plan, estimateMs, asyncDefault: asJob,
        argv: nodeArgv("shot/shot-survey.mjs", "--tracks", tracks.join(","), "--preset", plan.preset, "--label", label, "--out", outRoot),
      });
    }

    // Long surveys / multi-track: return a jobId immediately (survives MCP client timeouts).
    if (asJob) {
      return jobStart({
        kind: "shot_survey",
        tracks: tracks.join(","),
        preset: plan.preset,
        label,
        out: outRoot,
        resume,
        panel: wantPanel,
        index: wantIndex,
        gl: args.gl,
        tod: args.tod,
        count: args.count,
        fracs: args.fracs,
        planArgs: pickPlanArgs(args),
      });
    }

    const trackResults = [];
    try {
      for (let ti = 0; ti < tracks.length; ti++) {
        const track = tracks[ti];
        const out = tracks.length === 1 ? outRoot : assertSafeOut(path.join(outRoot, track));
        fs.mkdirSync(out, { recursive: true });
        const { pending, resumed } = filterResumeShots(out, plan.shots, resume);
        writeSurveyProgress(outRoot, {
          state: "running", track, tracks, trackIndex: ti, pending: pending.length, resumed: resumed.length, estimateMs,
        });

        if (!sess || sess.track !== track || sess.out !== out) {
          if (sess) await handleTrack({ op: "close" });
          if (sess?.closing) await sess.closing;
          const opened = await trackOpen({ track, out, gl: args.gl });
          const body = bodyOf(opened);
          if (body.ok === false) return opened;
        }

        const captured = resumed.map((s) => ({ ...s, track, flags: scoreShotFindings(s) }));
        const failed = [];
        for (let si = 0; si < pending.length; si++) {
          const s = pending[si];
          writeSurveyProgress(outRoot, {
            state: "shooting", track, tracks, trackIndex: ti, shotIndex: si, shot: s.name,
            pendingLeft: pending.length - si, captured: captured.length, estimateMs,
          });
          let reply;
          try {
            reply = await sessSend({
              shot: s.name, frac: s.frac, cam: s.cam, az: s.az, el: s.el, dist: s.dist,
              h: s.h, side: s.side, tod: s.tod, hud: s.hud,
            }, 240000);
          } catch (e) {
            failed.push({ ...s, track, error: String(e.message || e) });
            continue;
          }
          if (reply.ok) {
            sess.shots++;
            const row = { ...s, track, png: reply.png, spread: reply.spread, kb: reply.kb };
            row.flags = scoreShotFindings(row);
            captured.push(row);
          } else failed.push({ ...s, track, error: reply.error || "shot failed" });
        }

        let panelPng = null;
        const existingPanel = path.join(out, `${plan.sheetName}.png`);
        if (fs.existsSync(existingPanel)) panelPng = existingPanel;
        if (wantPanel && pending.length && captured.length) {
          try {
            const sh = await sessSend({ sheet: plan.sheetName, cols: plan.cols || 0 }, 120000);
            if (sh.ok) panelPng = sh.png;
          } catch (e) { log(`survey panel failed: ${e.message}`); }
        }

        let indexHtml = null;
        if (wantIndex && captured.length) {
          indexHtml = writeSurveyIndex(out, {
            track, label: plan.label, preset: plan.preset, shots: captured, panelPng, ok: captured.length,
          });
        }
        const findings = writeSurveyFindings(out, {
          ok: failed.length === 0 && captured.length > 0,
          track, label: plan.label, preset: plan.preset, shots: captured, panelPng, indexHtml,
        });
        trackResults.push({
          track, out, captured: captured.length, failed: failed.length,
          panel: panelPng, indexHtml, findings: findings.file, findingsSummary: findings.findings,
          shots: captured, failures: failed.length ? failed : undefined,
        });
      }

      let compareIndex = null;
      if (tracks.length > 1 && wantIndex) {
        compareIndex = writeCompareIndex(outRoot, {
          label: plan.label, preset: plan.preset,
          tracks: trackResults.map((t) => ({
            track: t.track, captured: t.captured,
            panel: t.panel ? path.relative(outRoot, t.panel) : null,
            relIndex: t.indexHtml ? path.relative(outRoot, t.indexHtml) : `${t.track}/index.html`,
          })),
        });
      }
      writeSurveyProgress(outRoot, { state: "done", tracks, estimateMs, compareIndex });

      const captured = trackResults.reduce((n, t) => n + t.captured, 0);
      const failed = trackResults.reduce((n, t) => n + t.failed, 0);
      const ok = captured > 0 && failed === 0;
      const panelPng = trackResults[0]?.panel || null;
      const result = toolResult({
        ok,
        track: tracks[0],
        tracks,
        out: outRoot,
        preset: plan.preset,
        label: plan.label,
        estimateMs,
        captured,
        failed,
        trackResults,
        compareIndex,
        panel: panelPng,
        indexHtml: compareIndex || trackResults[0]?.indexHtml,
        hint: failed
          ? "Retry with resume:true to skip finished cells, or apex_job_start {kind:\"shot_survey\"}."
          : "Gallery: open index.html; findings.json flags low_spread/near_blank cells.",
      }, { isError: captured === 0 });
      return withImage(result, panelPng, args.image !== false);
    } finally {
      if (sess && !args.keepSession && args.closeSession !== false) {
        await handleTrack({ op: "close" });
      }
    }
  }

  async function handleTrack(args = {}) {
    const op = String(args.op || "status");
    try {
      if (op === "open") return await trackOpen(args);
      if (op === "survey") return handleShotSurvey(args);
    } catch (e) { if (e.refuse) return e.refuse; return refuse("bad_args", String(e.message || e), "See the apex_track inputSchema."); }
    if (op === "close") {
      const s = sess;
      if (!sessClose("close")) return toolResult({ ok: true, op, closed: false, reason: "not open" });
      return toolResult({ ok: true, op, ...(await s.closing), lockFree: true });
    }
    const cmd = {};
    if (op === "shot") {
      Object.assign(cmd, { shot: args.name || true, frac: args.frac, cam: args.cam, az: args.az, el: args.el, dist: args.dist, h: args.h, side: args.side, tod: args.tod, hud: args.hud });
    } else if (op === "eval") {
      if (typeof args.expr !== "string" || !args.expr) return refuse("bad_args", "eval needs expr", 'Pass {"op":"eval","expr":"a.corners()"}.');
      cmd.eval = args.expr;
    } else if (op === "track") {
      try { cmd.track = needTrack(args.track); } catch (e) { return e.refuse; }
    } else if (op === "sheet") {
      cmd.sheet = args.name || args.sheetName || "sheet";
      if (args.cols != null) cmd.cols = Number(args.cols);
    } else if (op === "diff") {
      if (!Array.isArray(args.diff) || args.diff.length !== 2) return refuse("bad_args", "diff needs two shot names", 'Pass {"op":"diff","diff":["a","b"]}.');
      cmd.diff = args.diff.map(String);
    } else if (op === "status") cmd.status = true;
    else return refuse("bad_args", `unknown op ${op}`, "open | shot | eval | track | sheet | diff | status | close");
    // dryRun previews the JSON line without a session; a real op needs one.
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, op, command: cmd });
    if (!sess) return refuse("track_not_open", "no track session", 'Call apex_track {"op":"open","track":"spa"} first.');
    try {
      const reply = await sessSend(cmd);
      delete reply.id;
      if (op === "shot" && reply.ok) sess.shots++;
      if (op === "track" && reply.ok) sess.track = reply.track;
      const result = toolResult({ op, ...reply }, { isError: reply.ok === false });
      return (op === "shot" || op === "sheet" || op === "diff") && reply.ok ? withImage(result, reply.png, args.image) : result;
    } catch (e) {
      return refuse("track_failed", String(e.message || e), "Retry; if the session died, op open again.");
    }
  }

  // ── apex_job_*: long CLIs in the background ───────────────────────────────
  const JOB_DIR = path.join(ROOT, "artifacts", "logs", "apex-jobs");
  const jobs = new Map();
  let jobSeq = 0;
  const list = (v, what) => {
    if (v == null || v === "") return null;
    const s = Array.isArray(v) ? v.join(",") : String(v);
    if (!LIST_RE.test(s) || s.startsWith("-")) throw Object.assign(new Error(what), { refuse: refuse("bad_args", `${what} must be ids, commas and * only`, "e.g. settings,garage") });
    return s;
  };
  /** kind → {argv, browser}. Every flag is fixed here; callers pick values only. */
  function jobPlan(kind, a) {
    switch (kind) {
      case "survey_track": return { browser: true, argv: nodeArgv("track/survey-track.mjs", needTrack(a.track), ...(a.oblique ? ["--oblique"] : [])) };
      case "shot_survey": {
        let tracks;
        try {
          tracks = normalizeSurveyTracks({
            track: a.track,
            tracks: a.tracks == null ? undefined : (Array.isArray(a.tracks) ? a.tracks : String(a.tracks).split(",")),
          }).map((id) => needTrack(id));
        } catch (e) {
          if (e.refuse) throw e;
          throw Object.assign(new Error("tracks"), { refuse: refuse("bad_args", String(e.message || e), "shot_survey needs track or tracks.") });
        }
        const preset = String(a.preset || "scenery");
        const label = String(a.label || "survey");
        const out = assertSafeOut(a.out || (tracks.length === 1
          ? `artifacts/track-survey/${tracks[0]}-${label}`
          : `artifacts/track-survey/${tracks.join("-")}-${label}`));
        const argv = nodeArgv(
          "shot/shot-survey.mjs",
          "--tracks", tracks.join(","),
          "--preset", preset,
          "--label", label,
          "--out", out,
          ...(a.resume ? ["--resume"] : []),
          ...(a.panel === false ? ["--no-panel"] : []),
          ...(a.index === false ? ["--no-index"] : []),
          ...(a.gl ? ["--gl", String(a.gl)] : []),
          ...(a.tod ? ["--tod", String(a.tod)] : []),
          ...(a.count != null ? ["--count", String(a.count)] : []),
          ...(Array.isArray(a.fracs) && a.fracs.length ? ["--fracs", a.fracs.join(",")] : []),
          ...(a.planArgs && Object.keys(a.planArgs).length ? ["--plan-json", JSON.stringify(a.planArgs)] : []),
        );
        return { browser: true, argv };
      }
      // apex_hud_shot / apex_hud_survey route here by default (host MCP calls
      // die at ~60-120 s; a cell is ~2 min). The server builds and pins the
      // argv (buildArgv + pinOk) and hands it over under a Symbol key, which no
      // JSON caller can set, so apex_job_start never runs a caller-chosen argv.
      case "hud_shot":
      case "hud_survey": {
        const argv = a[HUD_JOB_ARGV];
        if (!Array.isArray(argv) || !argv.length) {
          throw Object.assign(new Error(kind), {
            refuse: refuse("bad_args", `${kind} jobs start from apex_${kind} (its default route)`, `Call apex_${kind}; it returns a jobId unless async:false.`),
          });
        }
        return { browser: true, argv };
      }
      case "ui_gallery": {
        const s = list(a.screens, "screens"), v = list(a.viewports, "viewports");
        return { browser: true, argv: nodeArgv("ui/layout-audit.mjs", "--gallery", "--jobs=1", ...(s ? [`--screens=${s}`] : []), ...(v ? [`--viewports=${v}`] : [])) };
      }
      case "ui_matrix": {
        const s = list(a.screens, "screens"), v = list(a.viewports, "viewports"), sc = list(a.scale, "scale");
        return { browser: true, argv: nodeArgv("ui/layout-audit.mjs", "--jobs=1", ...(s ? [`--screens=${s}`] : []), ...(v ? [`--viewports=${v}`] : []), ...(sc ? [`--scale=${sc}`] : [])) };
      }
      case "flicker_gate": {
        const site = list(a.site, "site");
        return { browser: true, argv: nodeArgv("shot/flicker-gate.mjs", "--out", path.join(ROOT, "artifacts", "flicker-gate"), ...(site ? site.split(",").flatMap((x) => ["--site", x]) : [])) };
      }
      case "frame_fleet": return { browser: false, argv: nodeArgv("shot/frame-report.mjs", "--fleet") };
      case "parts_sweep": return { browser: false, argv: nodeArgv("car/parts-sweep.mjs", "--json") };
      case "livery_contrast": {
        const t = list(a.team, "team");
        return { browser: false, argv: nodeArgv("car/livery-contrast.mjs", "--json", ...(t ? [`--team=${t}`] : [])) };
      }
      case "verify_all": return { browser: false, argv: nodeArgv("track/verify-track.cjs", "--all", "--quiet") };
      case "float_all": return { browser: false, argv: nodeArgv("track/float-audit.cjs", "--all") };
      // Every circuit built twice (~4 s each): 52 outran apex_graph_parity's
      // 180 s cap at ~46 (2026-10-05). BASE goes by env, never argv.
      case "graph_parity_all": {
        const base = String(a.base || "");
        if (!REF_RE.test(base) || base.startsWith("-")) throw Object.assign(new Error("base"), { refuse: refuse("bad_args", "graph_parity_all needs base: a git ref", 'e.g. {"kind":"graph_parity_all","base":"HEAD~1"} — never omit it (a clean tree passes vacuously).') });
        return { browser: false, argv: nodeArgv("track/graph-parity.cjs", "--all"), env: { BASE: base } };
      }
      default: throw Object.assign(new Error("kind"), { refuse: refuse("bad_args", `unknown job kind ${kind}`, `One of: ${JOB_KINDS.join(", ")}.`) });
    }
  }
  const tail = (file, n = 40) => {
    try {
      const t = fs.readFileSync(file, "utf8").split("\n").slice(-n - 1).join("\n").trim();
      // one line can be a whole result (hud_survey prints its JSON on one): the tail is for progress, so cap its bytes
      return t.length > 4000 ? `…${t.slice(-4000)}` : t;
    } catch { return ""; }
  };
  /** One-shot `call` must not SIGKILL durable jobs on exit — they outlive the CLI. */
  const callCli = process.argv[2] === "call";
  const jobManifestPath = (id) => path.join(JOB_DIR, `${id}.json`);
  const writeJobManifest = (j) => {
    try {
      fs.writeFileSync(jobManifestPath(j.id), JSON.stringify({
        id: j.id, kind: j.kind, state: j.state, exit: j.exit, pid: j.child?.pid || j.pid || null,
        browser: j.browser, started: j.started, ended: j.ended, argv: j.argv,
        log: path.relative(ROOT, j.log), stderr: path.relative(ROOT, j.err),
      }, null, 2) + "\n");
    } catch (e) { log(`job manifest write failed: ${e.message}`); }
  };
  const exitFileFor = (log) => log.replace(/\.log$/, ".exit");
  const pidAlive = (pid) => {
    if (!pid) return false;
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  const refreshDiskJob = (meta) => {
    if (!meta || meta.state !== "running") return meta;
    if (pidAlive(meta.pid)) return meta;
    // Parent may have exited before the child's exit handler ran: the sh wrapper left the real code beside the log.
    let exit = meta.exit;
    try {
      const code = Number(fs.readFileSync(exitFileFor(path.join(ROOT, meta.log)), "utf8"));
      if (Number.isInteger(code)) exit = code;
    } catch { /* no exit file: a job from before the wrapper, or the sh itself was killed */ }
    if (exit == null) try {
      const text = fs.readFileSync(path.join(ROOT, meta.log), "utf8");
      const last = text.trim().split("\n").filter(Boolean).pop() || "";
      if (/"ok"\s*:\s*true/.test(last)) exit = 0;
      else if (/"ok"\s*:\s*false/.test(last) || last) exit = exit ?? 1;
    } catch { /* empty log */ }
    meta.state = exit === 0 ? "done" : "failed";
    meta.exit = exit ?? 1;
    meta.ended = meta.ended || Date.now();
    try { fs.writeFileSync(jobManifestPath(meta.id), JSON.stringify(meta, null, 2) + "\n"); } catch { /* */ }
    return meta;
  };
  const loadDiskJob = (id) => {
    try {
      const raw = JSON.parse(fs.readFileSync(jobManifestPath(id), "utf8"));
      return refreshDiskJob(raw);
    } catch { return null; }
  };
  /** apex_job_status {}: drop finished manifests (+ .log/.err/.exit) ended over 7 days ago; re-judge a `failed` one with no
   *  .exit file whose log's parsed result says ok:true (written before the .exit fix) as done. */
  const JOB_TTL_MS = 7 * 86400000;
  const pruneJobs = () => {
    let files = [];
    try { files = fs.readdirSync(JOB_DIR).filter((f) => f.endsWith(".json")); } catch { return; }
    for (const f of files) {
      try {
        const mf = path.join(JOB_DIR, f);
        const m = JSON.parse(fs.readFileSync(mf, "utf8"));
        if (!["done", "failed", "cancelled"].includes(m.state)) continue;
        const logAbs = m.log ? path.join(ROOT, m.log) : "";
        const exitAbs = logAbs ? exitFileFor(logAbs) : "";
        if (m.ended && Date.now() - m.ended > JOB_TTL_MS) {
          for (const x of [mf, logAbs, m.stderr ? path.join(ROOT, m.stderr) : "", exitAbs]) if (x) fs.rmSync(x, { force: true });
          continue;
        }
        if (m.state === "failed" && logAbs && !fs.existsSync(exitAbs)) {
          const o = ctx.splitOut(fs.readFileSync(logAbs, "utf8")).out;
          if (o && o.ok === true) { m.state = "done"; m.exit = 0; fs.writeFileSync(mf, JSON.stringify(m, null, 2) + "\n"); }
        }
      } catch { /* unreadable manifest: leave it */ }
    }
  };
  const listDiskJobs = () => {
    try {
      return fs.readdirSync(JOB_DIR).filter((f) => f.endsWith(".json")).map((f) => loadDiskJob(f.slice(0, -5))).filter(Boolean);
    } catch { return []; }
  };
  /** A finished survey's parsed result can run past 100 KB (hud_survey: every cell); a client then drops the whole reply.
   *  Over the cap, keep the headline keys and point at the log, which still holds all of it. */
  const JOB_OUT_CAP = 20000;
  const capJobOut = (out, logRel) => {
    let bytes = 0;
    try { bytes = JSON.stringify(out).length; } catch { return out; }
    if (bytes <= JOB_OUT_CAP) return out;
    const o = typeof out === "object" && out ? out : {};
    const small = {};
    for (const [k, val] of Object.entries(o)) {
      let n = 0; try { n = JSON.stringify(val).length; } catch { /* */ }
      if (n <= 2000) small[k] = val;
    }
    return { truncated: true, bytes, keys: Object.keys(o), ...small, hint: `full result: ${logRel} (jq on the log); per-cell data is in the report named above` };
  };
  const jobView = (j, full = false) => {
    // log = the CLI's stdout, where every job CLI reports; stderr beside it.
    // (Until 2026-10-05 log named the stderr file, which stayed 0 bytes for
    // verify_all / float_all while the output sat in an unreported .out.)
    const logRel = j.log.startsWith(ROOT) ? path.relative(ROOT, j.log) : j.log;
    const errRel = j.err ? (j.err.startsWith(ROOT) ? path.relative(ROOT, j.err) : j.err) : (j.stderr || "");
    const v = { jobId: j.id, kind: j.kind, state: j.state, exit: j.exit, elapsedMs: (j.ended || Date.now()) - j.started,
      log: logRel, stderr: errRel, argv: j.argv, durable: true };
    if (full) {
      const logAbs = path.join(ROOT, logRel);
      const errAbs = errRel ? path.join(ROOT, errRel) : "";
      v.tail = [tail(logAbs, 30), errAbs ? tail(errAbs, 20) : ""].filter(Boolean).join("\n--- stderr ---\n");
      if (j.state !== "running") {
        try {
          const o = ctx.splitOut(fs.readFileSync(logAbs, "utf8"));
          if (o.out != null) v.out = capJobOut(o.out, logRel);
        } catch { /* no log */ }
      }
    }
    return v;
  };
  /** Measured ~4.3 s/cell on SwiftShader for layout-audit geometry (ui_matrix 2026-10-10). */
  const UI_MATRIX_MS_PER_CELL = 4300;
  const UI_GALLERY_MS_PER_CELL = 1500;
  /** Sync estimate from the planned argv (wildcards use catalog-shaped sizes). */
  function estimateLayoutJobMs(kind, argv) {
    if (kind !== "ui_matrix" && kind !== "ui_gallery") return undefined;
    const get = (p) => { const hit = (argv || []).find((a) => typeof a === "string" && a.startsWith(p)); return hit ? hit.slice(p.length) : null; };
    const expand = (pat, fallback) => {
      if (!pat) return fallback;
      return Math.max(1, pat.split(",").filter(Boolean).reduce((n, p) => {
        if (!p.includes("*")) return n + 1;
        if (p.startsWith("ios-")) return n + 6;
        if (p.startsWith("desktop-")) return n + 6;
        return n + 4;
      }, 0));
    };
    const screens = expand(get("--screens="), kind === "ui_gallery" ? 2 : 12);
    const viewports = expand(get("--viewports="), kind === "ui_gallery" ? 2 : 12);
    const scale = get("--scale=");
    const scales = scale ? Math.max(1, scale.split(",").filter(Boolean).length) : 1;
    const cells = screens * viewports * scales;
    const per = kind === "ui_gallery" ? UI_GALLERY_MS_PER_CELL : UI_MATRIX_MS_PER_CELL;
    return { estimateMs: cells * per, cells, screens, viewports, scales };
  }
  function jobStart(args) {
    const kind = String(args.kind || "");
    let plan;
    try { plan = jobPlan(kind, args); } catch (e) { if (e.refuse) return e.refuse; throw e; }
    const est = estimateLayoutJobMs(kind, plan.argv);
    if (args.dryRun) {
      return toolResult({ ok: true, dryRun: true, kind, argv: plan.argv, env: plan.env, browser: plan.browser, ...(est || {}) });
    }
    if (mockMode()) return toolResult({ ok: true, mock: true, kind, argv: plan.argv, env: plan.env, ...(est || {}) });
    const memRunning = [...jobs.values()].filter((j) => j.state === "running");
    const diskRunning = listDiskJobs().filter((j) => j.state === "running" && !jobs.has(j.id));
    if (memRunning.length + diskRunning.length >= 2) {
      // Name them: "2 jobs already running" sent the caller to a second tool call just to learn which, and for how long.
      const who = [...memRunning, ...diskRunning].map((j) => `${j.id} (${j.kind}, ${Math.round((Date.now() - (j.started || Date.now())) / 1000)}s)`).join(", ");
      return refuse("jobs_busy", `${memRunning.length + diskRunning.length} jobs already running: ${who}`, "At most 2 run at once. apex_job_status {jobId} to watch one; apex_job_cancel {jobId} to free a slot.");
    }
    if (plan.browser) { const took = acquireLock(`apex_job:${kind}`); if (took) return took; }
    fs.mkdirSync(JOB_DIR, { recursive: true });
    const id = `${kind}-${Date.now().toString(36)}-${++jobSeq}`;
    const log = path.join(JOB_DIR, `${id}.log`), err = path.join(JOB_DIR, `${id}.err`);
    const logFd = fs.openSync(log, "w"), errFd = fs.openSync(err, "w");
    const env = plan.env ? { ...process.env, ...plan.env } : process.env;
    // sh records the child's real exit code beside the log: a one-shot `call` parent dies before the exit handler below
    // runs, and refreshDiskJob would otherwise have to guess the verdict from the log's last line.
    const exitFile = exitFileFor(log);
    const child = spawn("/bin/sh", ["-c", '"$@"; c=$?; printf %s "$c" > "$APEX_JOB_EXIT_FILE"; exit $c', "sh", ...plan.argv],
      { cwd: ROOT, detached: true, env: { ...env, APEX_JOB_EXIT_FILE: exitFile }, stdio: ["ignore", logFd, errFd] });
    fs.closeSync(logFd); fs.closeSync(errFd);
    try { child.unref(); } catch { /* */ }
    const j = { id, kind, argv: plan.argv, browser: plan.browser, child, pid: child.pid, state: "running", exit: null, started: Date.now(), ended: null, log, err };
    jobs.set(id, j);
    writeJobManifest(j);
    child.on("exit", (code, sig) => {
      j.ended = Date.now();
      j.exit = code ?? sig;
      if (j.state === "running") j.state = code === 0 ? "done" : "failed";
      writeJobManifest(j);
      // A cancelled browser job frees the lock from jobCancel, after its tree is gone.
      if (j.browser && !j.cancelTree) releaseLock();
    });
    child.on("error", (e) => {
      j.state = "failed"; j.exit = String(e.message); j.ended = Date.now();
      writeJobManifest(j);
      if (j.browser) releaseLock();
    });
    return toolResult({
      ok: true, ...jobView(j),
      hint: "apex_job_status {jobId} for progress (works across call processes via disk manifest); result in out when done.",
    });
  }
  function jobStatus(args) {
    if (!args.jobId) {
      pruneJobs();
      const fromDisk = listDiskJobs();
      const merged = new Map(fromDisk.map((j) => [j.id, j]));
      for (const j of jobs.values()) merged.set(j.id, j);
      // Newest first and bounded: a long-lived checkout accumulates every job ever started (dozens of manifests).
      const all = [...merged.values()].filter((j) => !args.state || j.state === args.state).sort((a, b) => (b.started || 0) - (a.started || 0));
      const limit = Math.min(Number(args.limit) || 20, 200);
      return toolResult({ ok: true, jobs: all.slice(0, limit).map((j) => jobView(j)), total: all.length, ...(all.length > limit ? { hint: `${all.length - limit} older job(s) not shown; pass limit (max 200) or state.` } : {}) });
    }
    const id = String(args.jobId);
    const j = jobs.get(id) || loadDiskJob(id);
    if (!j) return refuse("unknown_job", `no job ${id}`, "apex_job_status {} lists in-memory and disk manifests under artifacts/logs/apex-jobs/.");
    return toolResult({ ok: j.state !== "failed", ...jobView(j, true) }, { isError: j.state === "failed" });
  }
  async function jobCancel(args) {
    const id = String(args.jobId || "");
    let j = jobs.get(id);
    const disk = !j ? loadDiskJob(id) : null;
    if (!j && !disk) return refuse("unknown_job", `no job ${id}`, "apex_job_status {} lists them.");
    if (!j && disk) {
      j = { ...disk, child: { pid: disk.pid }, log: path.join(ROOT, disk.log), err: path.join(ROOT, disk.stderr || disk.log.replace(/\.log$/, ".err")) };
    }
    let survivors;
    if (j.state === "running") {
      j.state = "cancelled";
      j.cancelTree = processTree(j.child?.pid || j.pid);
      survivors = (await killTreeAndWait(j.cancelTree)).survivors.length;
      j.ended = Date.now();
      writeJobManifest(j);
      if (j.browser) releaseLock();
    }
    return toolResult({ ok: true, ...jobView(j), survivors });
  }
  process.on("exit", () => {
    // Durable jobs outlive one-shot `call`; only the long-lived serve process reaps them.
    if (!callCli) {
      for (const j of jobs.values()) if (j.state === "running") { try { process.kill(-j.child.pid, "SIGKILL"); } catch { /* gone */ } }
    }
    if (sess) { try { process.kill(-sess.child.pid, "SIGKILL"); } catch { /* gone */ } }
  });

  // ── apex_ui_fit / apex_ui_shot: one screen × viewport ─────────────────────
  // The real catalogs (tools/ui/menu-screens.mjs): an id the audit does not know used to come back ok:true with out:null.
  let uiCatalogP = null;
  const uiCatalog = () => (uiCatalogP ||= import("../ui/menu-screens.mjs")
    .then((m) => ({ screens: m.listScreenIds(), viewports: m.VIEWPORTS.map((v) => v[0]) }))
    .catch(() => null));   // a catalog that will not load must not block the tool: fall back to the shape check alone
  const unknownId = (kind, id, ids) => {
    const dist = (a, b) => {   // Levenshtein, small strings
      const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 1; j <= b.length; j++) d[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return d[a.length][b.length];
    };
    const best = ids.map((x) => [x, dist(id, x)]).sort((p, q) => p[1] - q[1])[0];
    const near = ids.find((x) => x.startsWith(id)) || (best && best[1] <= 2 ? best[0] : null);
    return refuse("bad_args", `unknown ${kind} ${id}`, `${near ? `Did you mean ${near}? ` : ""}Valid ${kind}s: ${ids.join(", ")}.`);
  };
  const uiArgs = async (a) => {
    const screen = String(a.screen || "");
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(screen)) throw Object.assign(new Error("screen"), { refuse: refuse("bad_args", "screen must be a layout-audit screen id", "`node tools/ui/layout-audit.mjs --list` prints them (title, select, garage, settings, …).") });
    const viewport = String(a.viewport || "ios-iphone-landscape");
    if (!/^[a-z0-9-]{3,60}$/.test(viewport)) throw Object.assign(new Error("viewport"), { refuse: refuse("bad_args", "viewport must be a layout-audit viewport id", "e.g. ios-iphone-landscape, desktop-1440x900.") });
    const cat = await uiCatalog();
    if (cat && !cat.screens.includes(screen)) throw Object.assign(new Error("screen"), { refuse: unknownId("screen", screen, cat.screens) });
    if (cat && !cat.viewports.includes(viewport)) throw Object.assign(new Error("viewport"), { refuse: unknownId("viewport", viewport, cat.viewports) });
    return { screen, viewport };
  };
  async function uiFit(args, { signal }) {
    let u; try { u = await uiArgs(args); } catch (e) { return e.refuse; }
    const scale = args.scale == null ? null : Number(args.scale);
    if (scale != null && !(scale >= 40 && scale <= 200)) return refuse("bad_args", "scale must be 40..200 (%)", "Interface size, e.g. 100 or 130.");
    // --json prints THIS run's rows on stdout (splitOut); audit.json is merged history and
    // may keep a stale cell when --scale= retags the viewport (ios-iphone-landscape@130).
    const argv = nodeArgv("ui/layout-audit.mjs", `--screens=${u.screen}`, `--viewports=${u.viewport}`, "--jobs=1", "--json",
      ...(scale != null ? [`--scale=${scale}`] : []));
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, argv });
    if (mockMode()) return toolResult({ ok: true, mock: true, argv });
    const took = acquireLock("apex_ui_fit"); if (took) return took;
    try {
      const r = await runSpawn(argv, { timeoutMs: 180000, signal });
      const b = bodyOf(r);
      if (b.error) return r;
      const vpKey = u.viewport + (scale != null ? `@${scale}` : "");
      const matchRow = (rows) => (rows || []).find((x) => x.screen === u.screen
        && (x.viewport === vpKey || x.viewport === u.viewport)) || null;
      let row = null;
      if (b.out && Array.isArray(b.out.rows)) row = matchRow(b.out.rows);
      if (!row) {
        try {
          row = matchRow(JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", "layout-audit", "audit.json"), "utf8")).rows);
        } catch { /* report text only */ }
      }
      if (!row) {
        return refuse("no_result", `layout-audit wrote no row for ${u.screen} x ${vpKey}`,
          "The audit ran but produced nothing for this cell (a screen that is skipped at this viewport, or an audit error): see stderr, or apex_ui_shot for the raw capture.");
      }
      const problems = ["clipped", "offscreen", "smallTaps", "tinyTaps", "truncated", "underHardware", "starved", "deepScroll", "errors"]
        .filter((k) => Array.isArray(row[k]) && row[k].length).map((k) => ({ kind: k, n: row[k].length }));
      const line = (b.stdout || "").split("\n").filter((l) => l.startsWith(u.screen)).join("\n");
      return rewrap(r, { stdout: line, out: { ...row, problems, clean: problems.length === 0 } });
    } finally { releaseLock(); }
  }
  async function uiShot(args, { signal }) {
    let u; try { u = await uiArgs(args); } catch (e) { return e.refuse; }
    const outDir = path.join(ROOT, "artifacts", "ui-shots");
    const argv = nodeArgv("ui/layout-audit.mjs", `--screen=${u.screen}`, `--viewport=${u.viewport}`, `--out=${outDir}`, "--force");
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, argv });
    if (mockMode()) return toolResult({ ok: true, mock: true, argv });
    const took = acquireLock("apex_ui_shot"); if (took) return took;
    try {
      const r = await runSpawn(argv, { timeoutMs: 180000, signal });
      const b = bodyOf(r);
      const png = b.out && b.out.shot ? path.join(outDir, b.out.shot) : null;
      let dom = null;
      try { if (b.out && b.out.dom) dom = JSON.parse(fs.readFileSync(path.join(outDir, b.out.dom), "utf8")); } catch { /* png only */ }
      return withImage(rewrap(r, { out: b.out && { ...b.out, png, dom } }), png, args.image);
    } finally { releaseLock(); }
  }

  // ── apex_car_audit / apex_track_audit: offline checks, no browser ─────────
  async function carAudit(args, { signal }) {
    const check = String(args.check || "");
    let argv;
    if (check === "ladder") argv = nodeArgv("car/parts-ladder.mjs", "--json");
    else if (check === "crest") {
      const teams = (args.teams || []).map(String);
      if (teams.some((t) => !/^[a-z]{2,20}$/.test(t))) return refuse("bad_args", "teams are team ids", "e.g. [\"haas\",\"audi\"]");
      argv = nodeArgv("car/crest-sweep.mjs", ...teams, "--json");
    } else return refuse("bad_args", "check must be ladder or crest", "parts-sweep and livery-contrast take minutes: apex_job_start {kind:\"parts_sweep\"|\"livery_contrast\"}.");
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, argv });
    if (mockMode()) return toolResult({ ok: true, mock: true, argv });
    // Exit 1 = the check found rows to look at — a verdict, not a crash.
    return runSpawn(argv, { timeoutMs: 120000, allowExit: new Set([0, 1]), signal });
  }
  const AUDIT_CHECKS = ["verify", "float", "clip", "coplanar", "props", "ground"];
  async function trackAudit(args, { signal }) {
    let track; try { track = needTrack(args.track); } catch (e) { return e.refuse; }
    // `checks` → tools/track/audit-circuit.cjs: every per-circuit audit against
    // its baseline in one call (~16 s for all six on monza, 2026-10-05). The
    // bare call keeps the original verify + float pair.
    if (args.checks !== undefined) {
      const checks = Array.isArray(args.checks) ? args.checks.map(String) : [];
      if (!checks.length || checks.some((c) => !AUDIT_CHECKS.includes(c))) return refuse("bad_args", `checks must be a non-empty list of ${AUDIT_CHECKS.join(" | ")}`, 'e.g. {"track":"monza","checks":["clip","coplanar"]}');
      const argv = nodeArgv("track/audit-circuit.cjs", track, "--json", "--checks", [...new Set(checks)].join(","));
      if (args.dryRun) return toolResult({ ok: true, dryRun: true, argv });
      if (mockMode()) return toolResult({ ok: true, mock: true, argv });
      // Exit 1 = a check over its baseline — a verdict, not a crash.
      const r = bodyOf(await runSpawn(argv, { timeoutMs: 180000, allowExit: new Set([0, 1]), signal }));
      return toolResult({ ok: r.ok, track, audit: r.out, stderr: r.ok ? undefined : String(r.stderr || "").slice(-800),
        hint: "Suspect fracs go to apex_track op shot (orbit el 20, dist 25) to confirm." }, { isError: !r.ok });
    }
    const va = nodeArgv("track/verify-track.cjs", track, "--quiet"), fa = nodeArgv("track/float-audit.cjs", track, "--json");
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, argv: [va, fa] });
    if (mockMode()) return toolResult({ ok: true, mock: true, argv: [va, fa] });
    const [v, f] = (await Promise.all([runSpawn(va, { timeoutMs: 120000, signal }), runSpawn(fa, { timeoutMs: 120000, allowExit: new Set([0, 1]), signal })])).map(bodyOf);
    const ok = v.ok && f.ok;
    return toolResult({ ok, track,
      verify: { ok: v.ok, exit: v.exit, line: (v.stdout || "").split("\n")[0], stderr: v.ok ? undefined : v.stderr.slice(-800) },
      float: { ok: f.ok, exit: f.exit, out: f.out, stderr: f.ok ? undefined : f.stderr.slice(-800) },
      hint: "Suspect fracs go to apex_track op shot (orbit el 20, dist 25) to confirm." }, { isError: !ok });
  }

  return {
    thumbBlock,
    handlers: {
      apex_shot_survey: (a) => handleShotSurvey(a),
      apex_track: (a) => handleTrack(a),
      apex_job_start: (a) => jobStart(a),
      apex_job_status: (a) => jobStatus(a),
      apex_job_cancel: (a) => jobCancel(a),
      apex_ui_fit: (a, o) => uiFit(a, o),
      apex_ui_shot: (a, o) => uiShot(a, o),
      apex_car_audit: (a, o) => carAudit(a, o),
      apex_track_audit: (a, o) => trackAudit(a, o),
    },
  };
}

export const JOB_KINDS = ["survey_track", "shot_survey", "hud_shot", "hud_survey", "ui_gallery", "ui_matrix", "flicker_gate", "frame_fleet", "parts_sweep", "livery_contrast", "verify_all", "float_all", "graph_parity_all"];
/** Key apex-tools-mcp uses to hand apex_job_start a pinned HUD argv; unreachable from JSON. */
export const HUD_JOB_ARGV = Symbol("apex.hudJobArgv");
