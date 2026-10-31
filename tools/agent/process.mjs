// @doc Owns subprocess lifecycles: forwards cancellation and bounds cleanup of descendants after exits and explicit timeouts.
import fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createProcFdPool } from '../lib/proc-stat-reader.mjs';
const procPool = createProcFdPool();

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// /proc/PID/stat's comm can contain spaces and parentheses. Only four fields
// are needed; avoid allocating all 50+ tokens for every PID on each 50 ms scan.
export function parseProcStat(raw) {
  let cursor = raw.lastIndexOf(')') + 2;
  const take = () => {
    if (cursor === -1) return undefined;
    const end = raw.indexOf(' ', cursor), value = raw.slice(cursor, end === -1 ? undefined : end);
    cursor = end === -1 ? -1 : end + 1;
    return value;
  };
  const state = take(), parent = Number(take()), group = Number(take());
  for (let field = 3; field < 19 && cursor !== -1; field++) {
    const end = raw.indexOf(' ', cursor);
    cursor = end === -1 ? -1 : end + 1;
  }
  return { state, group, parent, start: take() };
}
function info(pid) {
  try {
    const raw = procPool.read(pid);
    return parseProcStat(raw);
  } catch {
    try { process.kill(pid, 0); return { state: '?', start: null }; } catch { return null; }
  }
}
function descendants(pid) {
  if (!pid) return [];
  const pids = [pid];
  if (process.platform === 'linux') {
    // Some managed /proc mounts omit task/*/children. Derive the same scoped
    // tree from numeric /proc entries, without launching a ps process per scan.
    const children = new Map();
    try {
      const entries = fs.readdirSync('/proc');
      procPool.sweep(entries.filter(entry => /^\d+$/.test(entry)).map(Number));
      for (const entry of entries) {
        if (!/^\d+$/.test(entry)) continue;
        const pid = Number(entry), stamp = info(pid);
        if (!stamp?.parent) continue;
        if (!children.has(stamp.parent)) children.set(stamp.parent, []);
        children.get(stamp.parent).push(pid);
      }
    } catch { /* Collection remains best effort if /proc disappears. */ }
    for (let i = 0; i < pids.length; i++) for (const child of children.get(pids[i]) || []) if (!pids.includes(child)) pids.push(child);
  } else if (process.platform !== 'win32') {
    const rows = spawnSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8', timeout: 1000 }).stdout || '';
    const children = new Map();
    for (const row of rows.trim().split('\n')) {
      const [child, parent] = row.trim().split(/\s+/).map(Number);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(child);
    }
    for (let i = 0; i < pids.length; i++) for (const child of children.get(pids[i]) || []) if (!pids.includes(child)) pids.push(child);
  }
  return pids;
}
/** No command timeout by default. Every child gets its own POSIX process group.
 * Descendant identities are sampled while it runs, including children that
 * start their own groups. Linux start times prevent signaling reused PIDs.
 * Detached grandchildren created and reparented between samples may escape.
 * Normal exits preserve intentional background handoffs unless cleanupOnExit
 * is true. Cancellation and explicit timeouts always clean owned descendants.
 * `done` resolves after root exit and any requested cleanup. `stop` first
 * permits an EOF shutdown, then escalates TERM to KILL. */
export function spawnAgentProcess(command, args = [], { cwd, stdio = 'pipe', env, timeoutMs, killGraceMs = 500, forwardSignals = false, cleanupOnExit = false } = {}) {
  if (!Number.isSafeInteger(killGraceMs) || killGraceMs < 1) throw new Error('killGraceMs must be a positive integer');
  if (timeoutMs !== undefined && (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1)) throw new Error('timeoutMs must be a positive integer');
  const child = spawn(command, args, { cwd, stdio, env, shell: false, detached: process.platform !== 'win32' });
  const owned = new Map();
  const releaseProcPool = procPool.acquire();
  let exited = false, closed = false, exitCode = null, signal = null, error, timedOut = false, cancelSignal = null;
  let shutdown, timer, doneResolve, exitResolve, closeResolve;
  const rootExited = new Promise((resolve) => { exitResolve = resolve; });
  const streamsClosed = new Promise((resolve) => { closeResolve = resolve; });
  const done = new Promise((resolve) => { doneResolve = resolve; });
  function collect() { for (const pid of descendants(child.pid)) { const stamp = info(pid); if (stamp && !owned.has(pid)) owned.set(pid, stamp.start); } }
  function alive(pid) { const stamp = info(pid); return stamp && stamp.state !== 'Z' && stamp.state !== 'X' && (owned.get(pid) === null || owned.get(pid) === stamp.start); }
  function groupAlive() {
    if (!child.pid || process.platform === 'win32') return false;
    try { process.kill(-child.pid, 0); return true; } catch { return false; }
  }
  function send(sig) {
    collect();
    // Signal children before parents, retaining identities before reparenting.
    for (const pid of [...owned.keys()].reverse()) if (alive(pid) && (process.platform === 'win32' || info(pid)?.group !== child.pid)) { try { process.kill(pid, sig); } catch { /* Exited. */ } }
    if (child.pid && process.platform !== 'win32') { try { process.kill(-child.pid, sig); } catch { /* Group exited. */ } }
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', ...(sig === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore', timeout: 1000 });
  }
  async function waitGone(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until && (groupAlive() || [...owned.keys()].some(alive))) await pause(25);
  }
  async function clean() {
    collect();
    if (groupAlive() || [...owned.keys()].some(alive)) {
      send('SIGTERM'); await waitGone(killGraceMs);
      send('SIGKILL'); await waitGone(500);
    }
    return [...owned.keys()].filter(alive);
  }
  function stop({ graceful = true, signal: requestedSignal = 'SIGTERM' } = {}) {
    if (shutdown) return shutdown;
    collect();
    shutdown = (async () => {
      if (graceful && child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
        await Promise.race([rootExited, pause(Math.min(killGraceMs, 250))]);
      }
      if (!exited || groupAlive() || [...owned.keys()].some(alive)) {
        send(requestedSignal); await waitGone(killGraceMs);
        send('SIGKILL');
      }
      await rootExited;
      return done;
    })();
    return shutdown;
  }
  const onInt = () => { cancelSignal ||= 'SIGINT'; void stop({ graceful: false, signal: 'SIGINT' }); };
  const onTerm = () => { cancelSignal ||= 'SIGTERM'; void stop({ graceful: false, signal: 'SIGTERM' }); };
  if (forwardSignals) { process.on('SIGINT', onInt); process.on('SIGTERM', onTerm); }
  collect();
  const sampler = setInterval(collect, 50);
  sampler.unref();
  if (timeoutMs !== undefined) timer = setTimeout(() => { timedOut = true; void stop({ graceful: false }); }, timeoutMs);
  child.once('error', (failure) => { error = { code: failure.code, message: failure.message }; exited = true; exitResolve(); });
  child.once('exit', (code, sig) => { exited = true; exitCode = code; signal = sig; exitResolve(); });
  child.once('close', () => { closed = true; closeResolve(); });
  void (async () => {
    await rootExited;
    clearTimeout(timer);
    const survivors = cleanupOnExit || shutdown || timedOut || cancelSignal ? await clean() : [];
    clearInterval(sampler);
    if (!closed) await Promise.race([streamsClosed, pause(1000)]);
    if (forwardSignals) { process.off('SIGINT', onInt); process.off('SIGTERM', onTerm); }
    releaseProcPool();
    doneResolve({ exitCode, signal, timedOut, cancelSignal, ...(error ? { error } : {}), ...(survivors.length ? { cleanupError: 'owned descendant processes survived SIGKILL', survivors } : {}) });
  })();
  return { child, done, stop };
}
