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

const TRACK_TOOL = "tools/shot/track-session.mjs";
const ID_RE = /^[a-z0-9_]{2,40}$/;
const LIST_RE = /^[a-z0-9*_,.-]{1,200}$/i;

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
  async function trackOpen(args) {
    const track = needTrack(args.track || "monza");
    const out = assertSafeOut(args.out || `artifacts/track-session/${track}`);
    const argv = nodeArgv("shot/track-session.mjs", "--serve", "--track", track, "--out", out);
    if (sess) return toolResult({ ok: true, op: "open", alreadyOpen: true, track: sess.track, hint: 'op "track" switches circuits; "close" ends the session.' });
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, op: "open", argv });
    if (mockMode()) return toolResult({ ok: true, mock: true, op: "open", argv });
    const took = acquireLock("apex_track");
    if (took) return took;
    const child = spawn(argv[0], argv.slice(1), { cwd: ROOT, stdio: ["pipe", "pipe", "pipe"], detached: true });
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
  async function handleTrack(args = {}) {
    const op = String(args.op || "status");
    try {
      if (op === "open") return await trackOpen(args);
    } catch (e) { if (e.refuse) return e.refuse; return refuse("bad_args", String(e.message || e), "See the apex_track inputSchema."); }
    if (op === "close") {
      const s = sess;
      if (!sessClose("close")) return toolResult({ ok: true, op, closed: false, reason: "not open" });
      return toolResult({ ok: true, op, ...(await s.closing), lockFree: true });
    }
    if (!sess) return refuse("track_not_open", "no track session", 'Call apex_track {"op":"open","track":"spa"} first.');
    const cmd = {};
    if (op === "shot") {
      Object.assign(cmd, { shot: args.name || true, frac: args.frac, cam: args.cam, az: args.az, el: args.el, dist: args.dist, side: args.side, tod: args.tod, hud: args.hud });
    } else if (op === "eval") {
      if (typeof args.expr !== "string" || !args.expr) return refuse("bad_args", "eval needs expr", 'Pass {"op":"eval","expr":"a.corners()"}.');
      cmd.eval = args.expr;
    } else if (op === "track") {
      try { cmd.track = needTrack(args.track); } catch (e) { return e.refuse; }
    } else if (op === "sheet") cmd.sheet = args.name || "sheet";
    else if (op === "diff") {
      if (!Array.isArray(args.diff) || args.diff.length !== 2) return refuse("bad_args", "diff needs two shot names", 'Pass {"op":"diff","diff":["a","b"]}.');
      cmd.diff = args.diff.map(String);
    } else if (op === "status") cmd.status = true;
    else return refuse("bad_args", `unknown op ${op}`, "open | shot | eval | track | sheet | diff | status | close");
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, op, command: cmd });
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
      default: throw Object.assign(new Error("kind"), { refuse: refuse("bad_args", `unknown job kind ${kind}`, `One of: ${JOB_KINDS.join(", ")}.`) });
    }
  }
  const tail = (file, n = 40) => {
    try { const t = fs.readFileSync(file, "utf8").split("\n"); return t.slice(-n - 1).join("\n").trim(); } catch { return ""; }
  };
  const jobView = (j, full = false) => {
    const v = { jobId: j.id, kind: j.kind, state: j.state, exit: j.exit, elapsedMs: (j.ended || Date.now()) - j.started, log: path.relative(ROOT, j.log), argv: j.argv };
    if (full) {
      // stdout and stderr each — a CLI that reports on stdout (verify-track)
      // left the stderr-only tail empty.
      v.tail = [tail(j.out, 30), tail(j.log, 20)].filter(Boolean).join("\n--- stderr ---\n");
      if (j.state !== "running") { const o = ctx.splitOut(fs.readFileSync(j.out, "utf8")); if (o.out != null) v.out = o.out; }
    }
    return v;
  };
  function jobStart(args) {
    const kind = String(args.kind || "");
    let plan;
    try { plan = jobPlan(kind, args); } catch (e) { if (e.refuse) return e.refuse; throw e; }
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, kind, argv: plan.argv, browser: plan.browser });
    if (mockMode()) return toolResult({ ok: true, mock: true, kind, argv: plan.argv });
    const running = [...jobs.values()].filter((j) => j.state === "running");
    if (running.length >= 2) return refuse("jobs_busy", `${running.length} jobs already running`, "apex_job_status to watch them; apex_job_cancel to free a slot.");
    if (plan.browser) { const took = acquireLock(`apex_job:${kind}`); if (took) return took; }
    fs.mkdirSync(JOB_DIR, { recursive: true });
    const id = `${kind}-${Date.now().toString(36)}-${++jobSeq}`;
    const log = path.join(JOB_DIR, `${id}.log`), out = path.join(JOB_DIR, `${id}.out`);
    const logFd = fs.openSync(log, "w"), outFd = fs.openSync(out, "w");
    const child = spawn(plan.argv[0], plan.argv.slice(1), { cwd: ROOT, detached: true, stdio: ["ignore", outFd, logFd] });
    fs.closeSync(logFd); fs.closeSync(outFd);
    const j = { id, kind, argv: plan.argv, browser: plan.browser, child, state: "running", exit: null, started: Date.now(), ended: null, log, out };
    jobs.set(id, j);
    child.on("exit", (code, sig) => {
      j.ended = Date.now();
      j.exit = code ?? sig;
      if (j.state === "running") j.state = code === 0 ? "done" : "failed";
      // A cancelled browser job frees the lock from jobCancel, after its tree is gone.
      if (j.browser && !j.cancelTree) releaseLock();
    });
    child.on("error", (e) => { j.state = "failed"; j.exit = String(e.message); j.ended = Date.now(); if (j.browser) releaseLock(); });
    return toolResult({ ok: true, ...jobView(j), hint: "apex_job_status {jobId} for progress; the result lands in out when state is done." });
  }
  function jobStatus(args) {
    if (!args.jobId) return toolResult({ ok: true, jobs: [...jobs.values()].map((j) => jobView(j)) });
    const j = jobs.get(String(args.jobId));
    if (!j) return refuse("unknown_job", `no job ${args.jobId} in this server process`, "apex_job_status {} lists them.");
    return toolResult({ ok: j.state !== "failed", ...jobView(j, true) }, { isError: j.state === "failed" });
  }
  async function jobCancel(args) {
    const j = jobs.get(String(args.jobId || ""));
    if (!j) return refuse("unknown_job", `no job ${args.jobId}`, "apex_job_status {} lists them.");
    let survivors;
    if (j.state === "running") {
      j.state = "cancelled";
      j.cancelTree = processTree(j.child.pid);
      survivors = (await killTreeAndWait(j.cancelTree)).survivors.length;
      if (j.browser) releaseLock();
    }
    return toolResult({ ok: true, ...jobView(j), survivors });
  }
  process.on("exit", () => {
    for (const j of jobs.values()) if (j.state === "running") { try { process.kill(-j.child.pid, "SIGKILL"); } catch { /* gone */ } }
    if (sess) { try { process.kill(-sess.child.pid, "SIGKILL"); } catch { /* gone */ } }
  });

  // ── apex_ui_fit / apex_ui_shot: one screen × viewport ─────────────────────
  const uiArgs = (a) => {
    const screen = String(a.screen || "");
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(screen)) throw Object.assign(new Error("screen"), { refuse: refuse("bad_args", "screen must be a layout-audit screen id", "`node tools/ui/layout-audit.mjs --list` prints them (title, select, garage, settings, …).") });
    const viewport = String(a.viewport || "ios-iphone-landscape");
    if (!/^[a-z0-9-]{3,60}$/.test(viewport)) throw Object.assign(new Error("viewport"), { refuse: refuse("bad_args", "viewport must be a layout-audit viewport id", "e.g. ios-iphone-landscape, desktop-1440x900.") });
    return { screen, viewport };
  };
  async function uiFit(args, { signal }) {
    let u; try { u = uiArgs(args); } catch (e) { return e.refuse; }
    const scale = args.scale == null ? null : Number(args.scale);
    if (scale != null && !(scale >= 40 && scale <= 200)) return refuse("bad_args", "scale must be 40..200 (%)", "Interface size, e.g. 100 or 130.");
    const argv = nodeArgv("ui/layout-audit.mjs", `--screens=${u.screen}`, `--viewports=${u.viewport}`, "--jobs=1", ...(scale ? [`--scale=${scale}`] : []));
    if (args.dryRun) return toolResult({ ok: true, dryRun: true, argv });
    if (mockMode()) return toolResult({ ok: true, mock: true, argv });
    const took = acquireLock("apex_ui_fit"); if (took) return took;
    try {
      const r = await runSpawn(argv, { timeoutMs: 180000, signal });
      const b = bodyOf(r);
      if (b.error) return r;
      let rows = [];
      try { rows = JSON.parse(fs.readFileSync(path.join(ROOT, "artifacts", "layout-audit", "audit.json"), "utf8")).rows || []; } catch { /* report text only */ }
      const row = rows.find((x) => x.screen === u.screen && x.viewport === u.viewport) || null;
      const problems = row ? ["clipped", "offscreen", "smallTaps", "tinyTaps", "truncated", "underHardware", "starved", "deepScroll", "errors"]
        .filter((k) => Array.isArray(row[k]) && row[k].length).map((k) => ({ kind: k, n: row[k].length })) : null;
      return rewrap(r, { stdout: b.stdout.split("\n").filter((l) => l.startsWith(u.screen)).join("\n"), out: row && { ...row, problems, clean: problems.length === 0 } });
    } finally { releaseLock(); }
  }
  async function uiShot(args, { signal }) {
    let u; try { u = uiArgs(args); } catch (e) { return e.refuse; }
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
  async function trackAudit(args, { signal }) {
    let track; try { track = needTrack(args.track); } catch (e) { return e.refuse; }
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

export const JOB_KINDS = ["survey_track", "ui_gallery", "ui_matrix", "flicker_gate", "frame_fleet", "parts_sweep", "livery_contrast", "verify_all", "float_all"];
