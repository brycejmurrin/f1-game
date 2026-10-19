#!/usr/bin/env node
// @doc Bounded diagnostic plans and saved summaries for heap, GPU allocation and VM lifecycle censuses.
// @skill renderer-debug / mcp-probe
// Interpretation: https://developer.chrome.com/docs/devtools/memory-problems
// Resource counts: https://threejs.org/docs/#WebGLRenderer.info (counts, not resident bytes).
import { existsSync, realpathSync, statSync, readFileSync, mkdirSync, writeFileSync, readdirSync, lstatSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
const { CIRCUITS } = createRequire(import.meta.url)('../manifest.cjs');
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const DIAGNOSTIC_JOB_KINDS = ['memory_census', 'gpu_memory_census', 'renderer_probe', 'vm_lifecycle'];
const COMMON = ['kind', 'op', 'out', 'dryRun', 'target'];
const FIELDS = {
  memory_census: ['backend', 'mode', 'tracks', 'cycles', 'settle', 'maxGrowthMb'],
  gpu_memory_census: ['track', 'visits', 'warm', 'mobile', 'realLink'],
  renderer_probe: ['track', 'backend', 'cam', 'lite', 'iphone'],
  vm_lifecycle: ['track', 'cycles', 'seed'],
};
const within = (base, file) => { const rel = relative(base, file); return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !rel.startsWith(sep); };
/** Check lexical AND physical ancestry, including dangling symlinks and not-yet-created output directories. */
export function diagnosticPath(root, value) {
  if (typeof value !== 'string' || !value || value.startsWith('-') || value.includes('\0')) throw new Error('path must be under artifacts/ or scratch/');
  const abs = resolve(root, value), realRoot = realpathSync(root);
  const base = ['artifacts', 'scratch'].map((x) => resolve(root, x)).find((x) => within(x, abs));
  if (!base) throw new Error('path must be a child of artifacts/ or scratch/');
  // Resolve each extant ancestor: the artifact root itself must not redirect outside the checkout.
  let ancestor = abs;
  while (!existsSync(ancestor)) {
    // existsSync is false for a dangling symlink; realpath must reject that case too.
    try { if (statSync(ancestor, { throwIfNoEntry: false })) break; } catch { /* checked below */ }
    if (ancestor === dirname(ancestor)) throw new Error('no existing path ancestor');
    ancestor = dirname(ancestor);
  }
  const physical = resolve(realpathSync(ancestor), relative(ancestor, abs));
  const physicalBase = resolve(realRoot, relative(root, base));
  if (!within(physicalBase, physical)) throw new Error('path symlink escapes artifact root');
  // A dangling symlink in the unresolved tail is rejected by lstat below.
  for (let p = abs; p !== ancestor; p = dirname(p)) {
    if (lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error('dangling symlink in path');
  }
  return abs;
}
const integer = (v, d, lo, hi, name) => {
  const n = v ?? d; if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${name} bounds: ${lo}..${hi}`); return n;
};
const choice = (v, d, allowed, name) => { const x = v ?? d; if (!allowed.includes(x)) throw new Error(`${name}: ${allowed.join('|')}`); return x; };
const bool = (v, name) => { if (v != null && typeof v !== 'boolean') throw new Error(`${name} must be boolean`); return v === true; };
export function diagnosticPlan(kind, a = {}, { root = ROOT, knownCircuits = () => CIRCUITS } = {}) {
  if (!DIAGNOSTIC_JOB_KINDS.includes(kind)) throw new Error('unknown diagnostic kind');
  for (const key of Object.keys(a)) if (![...COMMON, ...FIELDS[kind]].includes(key)) throw new Error(`${key} is unsupported for ${kind}`);
  if (a.target != null && a.target !== 'local') throw new Error('diagnostics only support the local checkout');
  const track = (v) => { if (typeof v !== 'string' || !knownCircuits().includes(v)) throw new Error(`unknown circuit ${v}`); return v; };
  const tracks = (v, d, name) => { const xs = v ?? d; if (!Array.isArray(xs) || xs.length < 1 || xs.length > 4) throw new Error(`${name} needs 1..4 circuit ids`); return xs.map(track); };
  const outDir = diagnosticPath(root, a.out ?? `artifacts/diagnostics/${kind}`);
  const resultFile = resolve(outDir, kind === 'renderer_probe' ? 'state.json' : kind === 'vm_lifecycle' ? 'census.json' : 'report.json');
  // Check fixed children too: a pre-existing report symlink must not escape an otherwise safe directory.
  diagnosticPath(root, resultFile); diagnosticPath(root, resolve(outDir, 'run.json'));
  let args, script, timeoutMs, evidence;
  if (kind === 'memory_census') {
    const ids = tracks(a.tracks, ['monza', 'monaco'], 'tracks');
    if (new Set(ids).size !== ids.length) throw new Error('tracks must be unique for per-cycle growth');
    const cycles = integer(a.cycles, 3, 3, 5, 'cycles'), settle = integer(a.settle, 2, 0, 10, 'settle');
    script = 'gfx/mem-census.mjs'; timeoutMs = 900000;
    args = ['--backend', choice(a.backend, 'three', ['three', 'webgl2'], 'backend'), '--mode', choice(a.mode, 'picker', ['picker', 'race'], 'mode'), '--tracks', ids.join(','), '--cycles', String(cycles), '--settle', String(settle), '--json', resultFile, '--quiet'];
    if (a.maxGrowthMb != null) args.push('--max-growth-mb', String(integer(a.maxGrowthMb, 10, 0, 2048, 'maxGrowthMb')));
    evidence = 'Post-GC JS heap, retained track weak references, three object counts and decoded audio PCM. First cycle warms caches; growth alone is not proof of a leak.';
  } else if (kind === 'gpu_memory_census') {
    script = 'gfx/gpu-mem-census.mjs'; timeoutMs = 600000;
    args = [track(a.track ?? 'monaco'), '--warm', String(integer(a.warm, 30, 1, 120, 'warm')), '--json', resultFile];
    if (a.visits != null) args.push('--visits', tracks(a.visits, [], 'visits').join(','));
    if (bool(a.mobile, 'mobile')) args.push('--mobile');
    if (bool(a.realLink, 'realLink')) args.push('--real-link');
    evidence = `TLX WebGL2 requested allocation estimates, not driver residency or GPU timings. Shader linking ${a.realLink ? 'real' : 'stubbed (default)'}; excludes padding, drawing buffer and compressed formats.`;
  } else if (kind === 'renderer_probe') {
    script = 'gfx/gfx-probe.mjs'; timeoutMs = 360000;
    args = ['--backend', choice(a.backend, 'three', ['three', 'webgpu'], 'backend'), track(a.track ?? 'monza'), '--cam', choice(a.cam, 'park', ['orbit', 'eye', 'park'], 'cam'), '--retries', '1', '--present-timeout', '60000', '--out', outDir];
    if (bool(a.lite, 'lite')) args.push('--lite');
    if (bool(a.iphone, 'iphone')) args.push('--iphone');
    evidence = 'Renderer boot/presentation correctness and validation errors. Software-rendered frames do not measure player GPU performance; backend fallback must be inspected.';
  } else {
    script = 'check/lifecycle-census.mjs'; timeoutMs = 120000;
    args = ['--track', track(a.track ?? 'monza'), '--cycles', String(integer(a.cycles, 3, 1, 6, 'cycles')), '--seed', String(integer(a.seed, 1, 0, 0xffffffff, 'seed')), '--out', outDir];
    evidence = 'VM-only deterministic timer/rAF/rejection-listener teardown and stale WATCH cancellation. No browser, DOM, heap or GPU evidence.';
  }
  return { kind, browser: kind !== 'vm_lifecycle', argv: [process.execPath, resolve(root, 'tools', script), ...args], timeoutMs, outDir, resultFile, evidence };
}
const MAX_REPORT_BYTES = 5 * 1024 * 1024;
const number = (n) => typeof n === 'number' && Number.isFinite(n) ? n : null;
export function summariseDiagnostic(kind, doc, limit = 12) {
  integer(limit, 12, 1, 50, 'limit');
  if (kind === 'memory_census') {
    if (!Array.isArray(doc.rows) || !doc.summary || doc.rows.length > 200) throw new Error('not a bounded memory census report');
    return { summary: { ...doc.summary }, observations: doc.rows.slice(-limit).map((r) => ({ step: r.step, cycle: r.cycle, track: r.track, heapMB: number(r.heapMB), heapBytes: number(r.heapBytes), backend: r.backend, instrumentation: r.instrumentation, aliveTrackCount: Array.isArray(r.aliveTracks) ? r.aliveTracks.length : null, audioMB: number(r.audioMB), three: r.three, runtimeMemory: r.runtimeMemory ?? { status: 'unavailable', reason: 'older report without CDP runtime counters' } })), interpretation: 'Query success is not measurement success: inspect completeness, correctness and budget; older reports lack these checks. MiB heap values are separate samples from CDP runtime fields; do not sum memory domains. Growth is a diagnostic budget, not a leak verdict. Animation callbacks and menu warm completion do not prove visible presentation; compare warmed identical tracks and inspect retaining paths.' };
  }
  if (kind === 'gpu_memory_census') {
    if (!Array.isArray(doc.cat) || !Array.isArray(doc.visits)) throw new Error('not a GPU allocation census');
    return { texMB: number(doc.texMB), rbMB: number(doc.rbMB), bufMB: number(doc.bufMB), categories: doc.cat.slice(0, limit), visits: doc.visits.slice(-limit), interpretation: 'Requested WebGL2 allocations; not resident GPU memory or hardware performance. Read run.json for shader-link mode.' };
  }
  if (kind === 'vm_lifecycle') {
    if (doc.mode !== 'vm-no-renderer') throw new Error('not a VM lifecycle census');
    return { ok: doc.ok, mode: doc.mode, track: doc.track, seed: doc.seed, resetOwners: doc.resetOwners, cancellation: doc.cancellation, soak: { ok: doc.soak?.ok, cycles: doc.soak?.cycles }, closed: doc.snapshots?.at(-1)?.resources, interpretation: 'VM ownership teardown only; excludes renderer, DOM and actual browser resource lifetime.' };
  }
  if (kind === 'renderer_probe') {
    if (!('backend' in doc) || !('ok' in doc)) throw new Error('not a renderer probe report');
    return { ok: doc.ok, backend: doc.backend, track: doc.track, attempt: doc.attempt, gpuErrors: doc.gpuErrors, error: doc.error, interpretation: 'Presentation/validation correctness; no hardware performance conclusion.' };
  }
  throw new Error('unknown diagnostic kind');
}
export function diagnosticQuery(a, { root = ROOT } = {}) {
  const bounded = (value) => { if (Buffer.byteLength(JSON.stringify(value)) > 48 * 1024) throw new Error('diagnostic summary exceeds 48 KiB; reduce limit'); return value; };
  const load = (file) => { const p = diagnosticPath(root, file); const st = statSync(p); if (!st.isFile() || st.size > MAX_REPORT_BYTES) throw new Error('report must be a file at most 5 MiB'); return JSON.parse(readFileSync(p, 'utf8')); };
  const limit = integer(a.limit, 12, 1, 50, 'limit');
  const summary = summariseDiagnostic(a.kind, load(a.file), limit);
  if (!a.compare) return bounded({ ok: true, kind: a.kind, file: a.file, summary });
  const comparison = summariseDiagnostic(a.kind, load(a.compare), limit);
  return bounded({ ok: true, kind: a.kind, file: a.file, compare: a.compare, baseline: summary, candidate: comparison, comparability: 'unproven: verify source, backend, track order, warmup and link mode in the adjacent run.json manifests; no automatic improvement or leak verdict' });
}
/** Atomically reserve an empty output directory. The persistent claim prevents stale evidence reuse. */
export function reserveDiagnosticOutput(outDir, { root = ROOT } = {}) {
  diagnosticPath(root, outDir);
  const claim = resolve(outDir, '.diagnostic-owner.json');
  diagnosticPath(root, claim);
  if (existsSync(outDir) && readdirSync(outDir).length) throw new Error('output directory must be empty; choose a fresh out directory');
  mkdirSync(outDir, { recursive: true });
  diagnosticPath(root, claim);
  // Exclusive creation arbitrates concurrent jobs even when both observed an empty directory.
  writeFileSync(claim, JSON.stringify({ pid: process.pid, started: new Date().toISOString() }), { flag: 'wx' });
  if (readdirSync(outDir).some((name) => name !== '.diagnostic-owner.json')) throw new Error('output changed while reserving; choose a fresh out directory');
  return claim;
}
// Linux start ticks distinguish an owned process from a later process reusing its PID.
function processIdentity(pid) {
  try { return readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1).split(/\s+/)[19]; } catch { return null; }
}
/** Job-owned supervisor outlives one-shot MCP callers and stops the complete CLI/Chromium tree. */
async function run(kind, args) {
  const plan = diagnosticPlan(kind, args);
  const { processTree, killTreeAndWait } = await import('../lib/process-tree.mjs');
  reserveDiagnosticOutput(plan.outDir);
  let sourceSha = null, sourceDirty = null;
  try { sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 }).trim(); sourceDirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: ROOT, encoding: 'utf8', timeout: 5000 }).trim() !== ''; } catch { /* recorded unavailable */ }
  const provenance = { kind, sourceSha, sourceDirty, args, argv: plan.argv, timeoutMs: plan.timeoutMs, evidence: plan.evidence, started: new Date().toISOString() };
  const child = spawn(plan.argv[0], plan.argv.slice(1), { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  // Keep descendants observed before the producer exits and they become reparented.
  const owned = new Map();
  const observe = () => { for (const pid of processTree(child.pid)) { const identity = processIdentity(pid); if (identity) owned.set(pid, identity); } };
  observe();
  const observer = setInterval(observe, 250);
  let bytes = 0, stopping = false, stopReason = null, cleanup = null;
  const stop = async (reason) => { if (stopping) return; stopping = true; stopReason = reason; cleanup = killTreeAndWait([...new Set([...processTree(child.pid), ...[...owned].filter(([pid, identity]) => processIdentity(pid) === identity).map(([pid]) => pid)])]); await cleanup; };
  const output = (stream, chunk) => { bytes += chunk.length; if (bytes > 1024 * 1024) { void stop('log limit 1 MiB exceeded'); return; } stream.write(chunk); };
  child.stdout.on('data', (c) => output(process.stdout, c)); child.stderr.on('data', (c) => output(process.stderr, c));
  const timer = setTimeout(() => { void stop(`timeout ${plan.timeoutMs}ms`); }, plan.timeoutMs);
  const terminate = () => { void stop('supervisor terminated'); };
  process.on('SIGTERM', terminate); process.on('SIGINT', terminate);
  const result = await new Promise((accept) => { child.on('error', (e) => accept({ exit: 2, error: e.message })); child.on('close', (code, signal) => accept({ exit: code, signal })); });
  clearTimeout(timer); clearInterval(observer);
  if (!cleanup) {
    const lingering = [...owned].filter(([pid, identity]) => pid !== child.pid && processIdentity(pid) === identity).map(([pid]) => pid);
    // Browser resources must be gone before the job exits and its owner releases the lock.
    // The producer has its own process group; signal it even after its leader exits.
    cleanup = killTreeAndWait([child.pid, ...lingering]);
  }
  const cleanupResult = await cleanup;
  if (cleanupResult.survivors.length) stopReason = stopReason || 'producer descendants survived cleanup';
  process.off('SIGTERM', terminate); process.off('SIGINT', terminate);
  writeFileSync(resolve(plan.outDir, 'run.json'), JSON.stringify({ ...provenance, ...result, stopReason, cleanup: cleanupResult, logBytes: bytes, ended: new Date().toISOString() }, null, 2));
  console.log(JSON.stringify({ ok: result.exit === 0 && !stopReason, kind, resultFile: relative(ROOT, plan.resultFile), manifest: relative(ROOT, resolve(plan.outDir, 'run.json')), stopReason, evidence: plan.evidence }));
  process.exitCode = stopReason ? 2 : result.exit ?? 2;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(process.argv[2], JSON.parse(process.argv[3] || '{}')); } catch (e) { console.error(e.message); process.exitCode = 2; }
}
