// @doc Owns subprocess lifecycles: forwards cancellation and bounds cleanup of descendants after exits and explicit timeouts.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
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
// Linux exposes children per thread, including children spawned by non-leader
// threads. If that interface is missing or changes during a walk, use the
// process-table snapshot below. Some managed proc mounts omit children entirely.
const hasTaskChildren = process.platform === 'linux' && fs.existsSync('/proc/thread-self/children');
export function taskDescendants(root, io = fs) {
  const seen = new Set([root]);
  try {
    for (const pid of seen) {
      const task = `/proc/${pid}/task`;
      for (const tid of io.readdirSync(task)) {
        const children = io.readFileSync(`${task}/${tid}/children`, 'utf8').trim();
        if (children) for (const id of children.split(/\s+/)) seen.add(Number(id));
      }
    }
    return [...seen];
  } catch { return null; }
}
function descendants(pid) {
  if (!pid) return [];
  const pids = [pid];
  if (process.platform === 'linux') {
    if (hasTaskChildren) {
      const tree = taskDescendants(pid);
      if (tree) return tree;
    }
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
// Linux can reparent a detached grandchild before the first tree sample. A
// cleanup-on-exit run passes a unique marker through exec, then checks for it
// once during cleanup. A nested run retains its parent's marker. Commands that
// explicitly clear their environment still use the normal ancestry sampler.
function collectMarked(marker, owned, rootStart) {
  let entries;
  try { entries = fs.readdirSync('/proc'); } catch { return; }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    const pid = Number(entry);
    if (owned.has(pid)) continue;
    try {
      const before = info(pid);
      if (!before?.start || before.state === 'Z' || Number(before.start) < Number(rootStart)) continue;
      const environment = fs.readFileSync(`/proc/${pid}/environ`);
      const offset = environment.indexOf(marker);
      if (offset < 0 || (offset > 0 && environment[offset - 1] !== 0)) continue;
      if (info(pid)?.start === before.start) owned.set(pid, before.start);
    } catch { /* A process may be gone or inaccessible. */ }
  }
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
  const marker = cleanupOnExit && process.platform === 'linux' ? `APEX_CLEANUP_${randomUUID().replaceAll('-', '')}` : null;
  if (marker) env = { ...(env ?? process.env), [marker]: '1' };
  const child = spawn(command, args, { cwd, stdio, env, shell: false, detached: process.platform !== 'win32' });
  const owned = new Map();
  const rootStart = marker && child.pid ? info(child.pid)?.start : null;
  const releaseProcPool = procPool.acquire();
  let exited = false, closed = false, exitCode = null, signal = null, error, timedOut = false, cancelSignal = null;
  let shutdown, timer, doneResolve, exitResolve, closeResolve;
  const rootExited = new Promise((resolve) => { exitResolve = resolve; });
  const streamsClosed = new Promise((resolve) => { closeResolve = resolve; });
  const done = new Promise((resolve) => { doneResolve = resolve; });
  function collect() {
    // Once the root has exited its children have been reparented. Retain the
    // sampled identities for cleanup without walking a potentially reused PID.
    if (exited) return;
    for (const pid of descendants(child.pid)) {
      if (owned.has(pid)) continue;
      const stamp = info(pid);
      if (stamp) owned.set(pid, stamp.start);
    }
  }
  function alive(pid) { const stamp = info(pid); return stamp && stamp.state !== 'Z' && stamp.state !== 'X' && (owned.get(pid) === null || owned.get(pid) === stamp.start); }
  function groupAlive() {
    if (!child.pid || process.platform === 'win32') return false;
    const leader = exited && info(child.pid);
    if (leader && owned.get(child.pid) !== leader.start) return false;
    try { process.kill(-child.pid, 0); return true; } catch { return false; }
  }
  function send(sig) {
    collect();
    // Signal children before parents, retaining identities before reparenting.
    for (const pid of [...owned.keys()].reverse()) if (alive(pid) && (process.platform === 'win32' || info(pid)?.group !== child.pid)) { try { process.kill(pid, sig); } catch { /* Exited. */ } }
    if (groupAlive()) { try { process.kill(-child.pid, sig); } catch { /* Group exited. */ } }
    if (process.platform === 'win32' && child.pid) spawnSync('taskkill', ['/pid', String(child.pid), '/T', ...(sig === 'SIGKILL' ? ['/F'] : [])], { stdio: 'ignore', timeout: 1000 });
  }
  async function waitGone(ms) {
    const until = Date.now() + ms;
    while (Date.now() < until && (groupAlive() || [...owned.keys()].some(alive))) await pause(25);
  }
  async function clean() {
    collect();
    if (marker && child.pid) collectMarked(Buffer.from(`${marker}=1\0`), owned, rootStart);
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
