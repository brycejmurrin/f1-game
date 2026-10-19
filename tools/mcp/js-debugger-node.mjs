// @doc debugger_node_test: run Node test files under the inspector, in parallel, with counting probes,
// value logpoints, locals captures and exception records — one call, no attach.
// Each file runs as `node --inspect-brk=127.0.0.1:0 <file>` (node:test runs a file's tests in-process
// when it is the entry script), so every run gets its own kernel-chosen port and its own CDP client.
// Probe values stream out through Runtime.addBinding (Runtime.bindingCalled), which survives the
// process exiting; breakpoints are set before Runtime.runIfWaitingForDebugger releases the script.
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Cdp } from "./js-debugger-cdp.mjs";
import { frameLine, frameLocals, pathSuffixRegex } from "./js-debugger-workflow.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BINDING = "__apexDbgEmit";
const BOOT = fileURLToPath(new URL("./js-debugger-boot.cjs", import.meta.url));
const clip = (s, max = 2000) => String(s ?? "").slice(0, max);
const tail = (s, max) => s.length > max ? `…${s.slice(-max)}` : s;

/** Repo-relative or absolute path → absolute path inside the repository (refuses anything else). */
export function repoFile(file) {
  const abs = path.resolve(ROOT, file);
  const real = existsSync(abs) ? realpathSync(abs) : abs;
  const root = realpathSync(ROOT);
  if (real !== root && !real.startsWith(root + path.sep)) throw Error(`${clip(file, 200)} is outside the repository`);
  if (!existsSync(real)) throw Error(`No such file: ${clip(file, 200)}`);
  return real;
}
const rel = abs => path.relative(ROOT, abs) || abs;
const relUrl = url => url?.startsWith("file://") ? rel(fileURLToPath(url)) : url;

// Breakpoint condition: count the hit, emit the value through the binding for the first `maxValues`
// hits (and every 1000th, so a hot loop cannot flood the socket), pause only for the first `pauses`.
// An arrow keeps the frame's `this`/`arguments`; the frame's locals resolve inside it.
export function probeCondition(id, { expression, condition, maxValues = 20, pauses = 0, maxChars = 200 }) {
  const key = JSON.stringify(id);
  // Same collision rule as logpointCondition: every helper name is __apexDbg-prefixed, since
  // a hoisted `var G` would shadow (and blank) the frame's own `G`.
  const value = expression ? `var __apexDbgV;try{__apexDbgV=(${expression}\n);__apexDbgV=typeof __apexDbgV==="number"?(isFinite(__apexDbgV)?__apexDbgV:String(__apexDbgV)):typeof __apexDbgV==="string"?__apexDbgV.slice(0,${maxChars}):__apexDbgV===undefined?"undefined":(typeof __apexDbgV==="object"&&__apexDbgV!==null)?(function(){try{return JSON.stringify(__apexDbgV).slice(0,${maxChars})}catch(e){return String(__apexDbgV).slice(0,${maxChars})}})():String(__apexDbgV)}catch(__apexDbgE){__apexDbgV="!err: "+String(__apexDbgE&&__apexDbgE.message||__apexDbgE).slice(0,${maxChars})}` : "";
  return `(()=>{try{${condition ? `if(!(${condition}\n))return false;` : ""}var __apexDbgN=globalThis.__apexDbgN||(Object.defineProperty(globalThis,"__apexDbgN",{value:{$c:Math.random().toString(36).slice(2)},configurable:true}),globalThis.__apexDbgN),__apexDbgK=__apexDbgN[${key}]=(__apexDbgN[${key}]|0)+1;`
    + `if(__apexDbgK<=${maxValues}||__apexDbgK%1000===0){${value}globalThis.${BINDING}(JSON.stringify(${expression ? `{p:${key},c:__apexDbgN.$c,n:__apexDbgK,v:__apexDbgV}` : `{p:${key},c:__apexDbgN.$c,n:__apexDbgK}`}))}return __apexDbgK<=${pauses}}catch(__apexDbgE){return false}})()`;
}
// Exact final counts: an exit hook flushes the counter table through the binding (Node keeps the
// inspector open after exit until this client disconnects, so the message arrives).
// Each vm context has its own globalThis, hence its own counter table tagged $c; only the main
// context's table is flushed at exit, other contexts count exactly up to maxValues, then per 1000.
const EXIT_HOOK = `typeof process==="object"&&process.once("exit",()=>{try{globalThis.${BINDING}(JSON.stringify({final:globalThis.__apexDbgN||{}}))}catch(e){}})`;

// Unnamed vm scripts (url "" or evalmachine.<anonymous>) are matched to a probe file by content:
// same line count (± a harness suffix), same first 400 chars after the harnesses' ^const→var rewrite.
const normalise = src => src.replace(/^const\b/gm, "var").slice(0, 400);
const anonymous = url => !url || url.startsWith("evalmachine.");
function probeFiles(probes, file) {
  const files = new Map();
  for (const p of probes) {
    const abs = repoFile(p.file || file);
    if (files.has(abs)) continue;
    const src = readFileSync(abs, "utf8");
    files.set(abs, { rel: rel(abs), lines: src.split("\n").length, head: normalise(src) });
  }
  return files;
}

function tapSummary(out) {
  const num = k => { const m = out.match(new RegExp(`^# ${k} (\\d+)`, "m")); return m ? +m[1] : null; };
  const failed = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map(m => clip(m[1], 200)).slice(0, 20);
  return { tests: num("tests"), pass: num("pass"), fail: num("fail"), cancelled: num("cancelled"), skipped: num("skipped"), failed };
}

// Wire one inspector connection (the entry process or an auto-attached child): handlers, exception
// state, probe breakpoints, exit hook, then release the waiting process.
async function instrument(cdp, conn, report, opts, file, state) {
  const byBp = new Map(), scriptUrl = new Map(), counts = new Map();
  // Pause handling and unnamed-script binding await CDP replies; one chain keeps them in order.
  let chain = Promise.resolve();
  cdp.on("Runtime.bindingCalled", e => {
    if (e.name !== BINDING) return;
    let m; try { m = JSON.parse(e.payload); } catch { return; }
    if (m.final) { for (const p of report.probes) if (Object.hasOwn(m.final, p.id)) { counts.set(p.id, m.final[p.id]); p.hitsBy[`${conn}:${m.final.$c}`] = m.final[p.id]; } return; }
    const p = report.probes.find(q => q.id === m.p); if (!p) return;
    const k = `${conn}:${m.c}`;
    p.hitsBy[k] = Math.max(p.hitsBy[k] || 0, m.n);
    if (Object.hasOwn(m, "v") && p.values.length < (opts.maxValues ?? 20)) p.values.push(conn ? { pid: conn, v: m.v } : m.v);
  });
  cdp.on("Debugger.breakpointResolved", b => { const p = byBp.get(b.breakpointId); if (p && !p.resolved.includes(b.location.lineNumber + 1)) p.resolved.push(b.location.lineNumber + 1); });
  // Unnamed-script fallback: bind each probe by scriptId to every unnamed script whose source is
  // that file. The entry process pauses each script before it runs (instrumentation breakpoint,
  // armed at Break on start: armed earlier, Node never leaves its wait) and binds inside the pause,
  // so even code run in the same tick as the load hits. An auto-attached child has no Break on
  // start, so it binds off scriptParsed: best effort, a call in the load's own tick can be missed.
  const files = probeFiles(opts.probes || [], file), bound = new Set();
  let pauseBind = conn === 0 && opts.vmTopLevel !== false && files.size > 0;
  // Every script execution pauses while armed (measured on cam-avoid-vm.test.mjs: 121 s vs 38 s),
  // so disarm after a budget and bind later scripts off scriptParsed.
  const budget = opts.vmPauseBudget ?? 300;
  const bindAnonymous = async (scriptId, endLine) => {
    if (bound.has(scriptId)) return;
    const candidates = [...files.entries()].filter(([, f]) => endLine + 1 >= f.lines && endLine + 1 <= f.lines + 3);
    if (!candidates.length) return;
    bound.add(scriptId);
    let src; try { src = (await cdp.send("Debugger.getScriptSource", { scriptId })).scriptSource || ""; } catch { return; }
    const head = normalise(src);
    for (const [abs, f] of candidates) {
      if (head !== f.head) continue;
      for (const [i, p] of (opts.probes || []).entries()) {
        if (repoFile(p.file || file) !== abs) continue;
        const rp = report.probes[i];
        const r = await cdp.send("Debugger.setBreakpoint", { location: { scriptId, lineNumber: p.line - 1, columnNumber: (p.column ?? 1) - 1 },
          condition: probeCondition(rp.id, { expression: p.expression, condition: p.condition, maxValues: opts.maxValues ?? 20, pauses: p.captureLocals ?? 0 }) }).catch(() => null);
        if (!r) continue;
        byBp.set(r.breakpointId, rp);
        rp.boundBy = "source (unnamed vm script)";
        const line = r.actualLocation.lineNumber + 1;
        if (!rp.resolved.includes(line)) rp.resolved.push(line);
      }
    }
  };
  const lineCount = new Map();
  cdp.on("Debugger.scriptParsed", s => {
    if (s.url) scriptUrl.set(s.scriptId, s.url);
    if (!files.size || !anonymous(s.url)) return;
    if (pauseBind) lineCount.set(s.scriptId, s.endLine);
    else chain = chain.then(() => bindAnonymous(s.scriptId, s.endLine));
  });
  cdp.on("Debugger.paused", e => { chain = chain.then(async () => {
    // Several probes can share one location: credit the capture to one that still wants pauses.
    const hit = (e.hitBreakpoints || []).map(id => byBp.get(id)).filter(Boolean);
    const own = hit.find(p => p.captures.length < (p.wants ?? 0)) || hit[0];
    if (e.reason === "Break on start" && pauseBind)
      state.instrumentationId = (await cdp.send("Debugger.setInstrumentationBreakpoint", { instrumentation: "beforeScriptExecution" }).catch(() => ({}))).breakpointId;
    if (e.reason === "instrumentation") {
      const id = e.data?.scriptId;
      report.vmPauses = (report.vmPauses || 0) + 1;
      if (pauseBind && report.vmPauses >= budget) {
        pauseBind = false;
        report.vmNote = `Pause-binding stopped after ${budget} script executions (vmPauseBudget); later unnamed vm scripts bind off scriptParsed and can miss a call in their load's tick.`;
        if (state.instrumentationId) await cdp.send("Debugger.removeBreakpoint", { breakpointId: state.instrumentationId }).catch(() => {});
      }
      if (id && lineCount.has(id)) await bindAnonymous(id, lineCount.get(id));
      await cdp.send("Debugger.resume").catch(() => {});
      return;
    }
    const stack = (e.callFrames || []).slice(0, 8).map(f => frameLine(f, relUrl(f.url || scriptUrl.get(f.location.scriptId))));
    if (own && state.captures < (opts.maxCaptures ?? 10)) {
      state.captures++;
      let locals;
      try { locals = await frameLocals(cdp, e.callFrames[0]?.scopeChain, { max: 30 }); } catch (err) { locals = { error: clip(err.message, 200) }; }
      own.captures.push({ hit: own.captures.length + 1, ...(conn ? { pid: conn } : {}), stack, locals });
    } else if (["exception", "promiseRejection"].includes(e.reason)) {
      if (report.exceptions.length < 20) report.exceptions.push({ reason: e.reason, uncaught: e.data?.uncaught ?? null, ...(conn ? { pid: conn } : {}),
        message: clip(String(e.data?.description ?? e.data?.value ?? "").split("\n")[0], 300), stack });
    } else if (e.reason !== "Break on start" && !own && report.pauses.length < 10) report.pauses.push({ reason: e.reason, stack });
    await cdp.send("Debugger.resume").catch(() => {});
  }); });
  // Close our socket once the main context dies, or Node waits for the debugger forever.
  const gone = new Promise(resolve => {
    cdp.on("Runtime.executionContextDestroyed", () => setTimeout(() => { cdp.close(); resolve(); }, 50));
    cdp.once("disconnect", resolve);
  });
  await cdp.send("Runtime.enable");
  await cdp.send("Runtime.addBinding", { name: BINDING });
  await cdp.send("Debugger.enable");
  await cdp.send("Debugger.setPauseOnExceptions", { state: opts.exceptions ?? "uncaught" });
  for (const [i, p] of (opts.probes || []).entries()) {
    const rp = report.probes[i];
    Object.defineProperty(rp, "wants", { value: p.captureLocals ?? 0, enumerable: false });
    // Two probes at one resolved location: V8 refuses the second; report it, run the rest.
    const r = await cdp.send("Debugger.setBreakpointByUrl", { urlRegex: pathSuffixRegex(rel(repoFile(p.file || file))),
      lineNumber: p.line - 1, columnNumber: (p.column ?? 1) - 1,
      condition: probeCondition(rp.id, { expression: p.expression, condition: p.condition, maxValues: opts.maxValues ?? 20, pauses: p.captureLocals ?? 0 }) })
      .catch(e => { rp.error = `${clip(e.message, 200)} (another probe already sits at this location: give it a different line/column, or merge the expressions)`; return null; });
    if (!r) continue;
    byBp.set(r.breakpointId, rp);
    for (const l of r.locations || []) if (!rp.resolved.includes(l.lineNumber + 1)) rp.resolved.push(l.lineNumber + 1);
  }
  await cdp.send("Runtime.evaluate", { expression: EXIT_HOOK, silent: true }).catch(() => {});
  await cdp.send("Runtime.runIfWaitingForDebugger");
  return { done: gone.then(() => chain) };
}

/** Run one file; resolves with the per-file report. `spawnNode`/`open` are injectable for tests. */
export async function runNodeFile(file, opts = {}, { spawnNode = spawn, open = Cdp.open } = {}) {
  const { probes = [], timeoutMs = 120000, testNamePattern, runner = "direct" } = opts;
  const children = runner === "test" || !!opts.children;
  const abs = repoFile(file), started = Date.now();
  // runner "test" is the real `node --test` (its child gets the file); "direct" runs the file as
  // the entry script, where node:test runs its tests in-process.
  const args = runner === "test"
    ? ["--test", "--test-reporter=tap", ...(testNamePattern ? [`--test-name-pattern=${testNamePattern}`] : []), abs]
    : ["--inspect-brk=127.0.0.1:0", ...(testNamePattern ? [`--test-name-pattern=${testNamePattern}`] : []), abs];
  const env = { ...process.env };
  // Spawned from inside a node --test run (an MCP server under test, a test calling this), the
  // child would inherit the runner's NODE_TEST_CONTEXT and report to a parent that is not there.
  delete env.NODE_TEST_CONTEXT;
  // An inherited NODE_OPTIONS --inspect would fight for the port; keep the rest.
  if (env.NODE_OPTIONS) env.NODE_OPTIONS = env.NODE_OPTIONS.split(/\s+/).filter(o => o && !/^--inspect/.test(o)).join(" ");
  let childLog = null;
  if (children) {
    const dir = path.join(ROOT, "scratch", "debug-node"); mkdirSync(dir, { recursive: true });
    childLog = path.join(dir, `${randomUUID()}.jsonl`); writeFileSync(childLog, "");
    Object.assign(env, { APEX_DBG_CHILDREN: childLog, APEX_DBG_OWNER: String(process.pid),
      NODE_OPTIONS: `${env.NODE_OPTIONS || ""} --require ${JSON.stringify(BOOT)}`.trim() });
  }
  // Its own process group, so a timeout kills the test's descendants too.
  const child = spawnNode(process.execPath, args, { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"], detached: true });
  let stdout = "", stderr = "", timedOut = false;
  const sockets = [], waits = [], state = { captures: 0 };
  const report = { file: rel(abs), runner, probes: probes.map((p, i) => ({ id: `p${i + 1}`, file: rel(repoFile(p.file || file)), line: p.line,
    ...(p.expression ? { expression: clip(p.expression, 200) } : {}), ...(p.condition ? { condition: clip(p.condition, 200) } : {}),
    resolved: [], hits: 0, hitsBy: {}, values: [], captures: [] })), exceptions: [], pauses: [], ...(children ? { processes: [] } : {}) };
  child.stdout.on("data", d => { stdout = tail(stdout + d, 64000); });
  child.stderr.on("data", d => { stderr = tail(stderr + d, 64000); });
  const exited = new Promise(resolve => child.once("exit", (code, signal) => resolve({ code, signal })));
  const killTree = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { try { child.kill("SIGKILL"); } catch {} } };
  const listening = runner === "test" ? null : new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(Error("Node did not print its inspector URL within 10 s")), 10000);
    child.stderr.on("data", () => { const m = stderr.match(/Debugger listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); resolve(m[1]); } });
    child.once("exit", () => { clearTimeout(t); reject(Error(`Node exited before the inspector started: ${clip(stderr, 500)}`)); });
  });
  const killer = setTimeout(() => { timedOut = true; killTree(); }, timeoutMs);
  // Auto-attach: the bootloader appends one JSON line per new Node process, then blocks in
  // inspector.waitForDebugger() until instrument() releases it.
  let seen = 0, poller = null;
  const attachChild = async row => {
    if (report.processes.length >= 16) return;
    report.processes.push({ pid: row.pid, ppid: row.ppid, argv: row.argv.map(a => relUrl(a.startsWith("/") ? pathToFileURL(a).href : a)) });
    try {
      const cdp = await open(row.url); sockets.push(cdp);
      waits.push((await instrument(cdp, row.pid, report, opts, file, state)).done);
    } catch (e) { report.processes.at(-1).error = clip(e.message, 200); }
  };
  if (childLog) poller = setInterval(() => {
    let text; try { text = readFileSync(childLog, "utf8"); } catch { return; }
    const lines = text.split("\n").filter(Boolean);
    for (; seen < lines.length; seen++) { try { attachChild(JSON.parse(lines[seen])); } catch {} }
  }, 20);
  try {
    if (listening) {
      const cdp = await open(await listening); sockets.push(cdp);
      waits.push((await instrument(cdp, 0, report, opts, file, state)).done);
    }
    const { code, signal } = await exited;
    // Descendants normally exit first; give their sockets a moment to drain the exit hook.
    await Promise.race([Promise.all(waits), new Promise(r => setTimeout(r, 1000))]);
    Object.assign(report, { exitCode: code, signal, timedOut, durationMs: Date.now() - started, summary: tapSummary(stdout) });
  } catch (e) {
    killTree();
    const { code, signal } = await exited;
    Object.assign(report, { error: clip(e.message, 500), exitCode: code, signal, timedOut, durationMs: Date.now() - started, summary: tapSummary(stdout) });
  } finally {
    clearTimeout(killer); clearInterval(poller);
    for (const s of sockets) if (!s.closed) s.close();
    if (childLog) try { unlinkSync(childLog); } catch {}
  }
  if (timedOut) report.note = `Killed after timeoutMs ${timeoutMs}: a test hung, or a probe captured locals faster than they could be read.`;
  const pids = new Set(report.probes.flatMap(p => [...p.values, ...p.captures].map(x => x?.pid ?? 0)));
  const single = pids.size <= 1;
  const untag = x => single && x && typeof x === "object" && Object.hasOwn(x, "pid") ? (({ pid, ...rest }) => Object.hasOwn(rest, "v") ? rest.v : rest)(x) : x;
  for (const p of report.probes) {
    if (single) { p.values = p.values.map(untag); p.captures = p.captures.map(({ pid, ...c }) => c); }
    p.hits = Object.values(p.hitsBy).reduce((a, b) => a + b, 0);
    const contexts = Object.keys(p.hitsBy).length;
    if (contexts > 1) p.contexts = contexts;
    delete p.hitsBy;
    if (!p.resolved.length && !p.error) p.warning = `Never resolved: the file was not loaded by this run, it was loaded as an unnamed vm script whose source differs from the working tree, or the line has no breakable statement (try the next line).${opts.vmTopLevel === false ? " vmTopLevel:false skips the pause-binding of unnamed vm scripts." : ""}`;
  }
  stdout = stdout.replace(/^# (?:Debugger listening on \S+|For help, see: \S+|Debugger attached\.|Waiting for the debugger to disconnect\.\.\.)\n/gm, "");
  report.stdoutTail = tail(stdout.trim(), report.summary.fail === 0 && !report.error ? 600 : 3000);
  const err = stderr.replace(/Debugger listening on \S+\nFor help, see: \S+\n|Debugger attached\.\n|Waiting for the debugger to disconnect\.\.\.\n/g, "").trim();
  if (err) report.stderrTail = tail(err, 1500);
  return report;
}

/** Run up to 8 files at `concurrency` at once; each has its own inspector port and CDP socket. */
export async function nodeTest(opts, deps) {
  const files = opts.files?.length ? opts.files : [opts.file];
  if (!files[0]) throw Error("debugger_node_test needs file or files");
  if (files.length > 8) throw Error("At most 8 files per call");
  for (const f of files) repoFile(f);
  for (const p of opts.probes || []) repoFile(p.file || files[0]);
  const queue = files.map((f, i) => ({ f, i })), out = new Array(files.length);
  const width = Math.min(opts.concurrency ?? 4, files.length);
  await Promise.all(Array.from({ length: width }, async () => {
    for (let job; (job = queue.shift());) out[job.i] = await runNodeFile(job.f, opts, deps);
  }));
  const failed = out.filter(r => r.error || r.timedOut || r.exitCode !== 0).map(r => r.file);
  return { ok: failed.length === 0, files: out.length, failed, runs: out };
}
