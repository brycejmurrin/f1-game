import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { diagnosticPlan, diagnosticPath, diagnosticQuery, summariseDiagnostic, reserveDiagnosticOutput } from '../../tools/perf/diagnostics.mjs';
import { diagnosticsJobSpec, createDiagnosticsHandler } from '../../tools/mcp/diagnostics-tools.mjs';
import { runtimeMemory } from '../../tools/perf/runtime-memory.mjs';
import { parseArgs, summariseCensus } from '../../tools/gfx/mem-census.mjs';
import { censusInitScript, readCensus } from '../../tools/lib/mem-census.mjs';
import vm from 'node:vm';
const ROOT = resolve(import.meta.dirname, '../..');
function fixture(fn) {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const root = mkdtempSync(resolve(ROOT, 'scratch/diagnostics-unit-'));
  mkdirSync(resolve(root, 'artifacts')); mkdirSync(resolve(root, 'scratch'));
  try { return fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
}
const circuits = () => ['monza', 'monaco', 'spa'];
test('plans pin local CLIs, bounded cycles, modes and real shader-link evidence', () => fixture((root) => {
  const p = diagnosticPlan('memory_census', {}, { root, knownCircuits: circuits });
  assert.equal(p.browser, true); assert.equal(p.timeoutMs, 900000);
  assert.ok(p.argv.includes('--quiet')); assert.ok(!p.argv.includes('--snapshot'));
  assert.equal(p.argv[p.argv.indexOf('--cycles') + 1], '3');
  for (const a of [{ cycles: 2 }, { cycles: 99 }, { settle: NaN }, { tracks: ['../../etc'] }, { tracks: 'monza' }, { target: 'deploy' }, { snapshot: 'artifacts/x' }, { backend: 'webgpu' }]) assert.throws(() => diagnosticPlan('memory_census', a, { root, knownCircuits: circuits }));
  const g = diagnosticPlan('gpu_memory_census', { realLink: true, visits: ['spa'] }, { root, knownCircuits: circuits });
  assert.ok(g.argv.includes('--real-link')); assert.match(g.evidence, /not driver residency/);
  assert.throws(() => diagnosticPlan('gpu_memory_census', { realLink: 'true' }, { root, knownCircuits: circuits }));
  const vm = diagnosticPlan('vm_lifecycle', { cycles: 2, seed: 0xffffffff }, { root, knownCircuits: circuits });
  assert.equal(vm.browser, false); assert.equal(vm.timeoutMs, 120000);
  const r = diagnosticPlan('renderer_probe', {}, { root, knownCircuits: circuits });
  assert.equal(r.argv[r.argv.indexOf('--retries') + 1], '1');
  const job = diagnosticsJobSpec('vm_lifecycle', { kind: 'vm_lifecycle', op: 'run', dryRun: true }, { ROOT: root, knownCircuits: circuits });
  assert.equal(job.argv[1], resolve(root, 'tools/perf/diagnostics.mjs'));
  assert.equal(JSON.parse(job.argv[3]).op, undefined);
}));
test('paths reject traversal, symlink roots, existing child redirects and dangling symlinks', () => fixture((root) => {
  assert.equal(diagnosticPath(root, 'artifacts/fresh/report.json'), resolve(root, 'artifacts/fresh/report.json'));
  for (const p of ['artifacts', '../escape', '/etc/passwd', 'artifacts/../../escape']) assert.throws(() => diagnosticPath(root, p));
  symlinkSync(resolve(root, 'scratch'), resolve(root, 'artifacts/redirect'));
  assert.throws(() => diagnosticPath(root, 'artifacts/redirect/a'));
  symlinkSync('/missing/diagnostic-unit', resolve(root, 'artifacts/dangling'));
  assert.throws(() => diagnosticPath(root, 'artifacts/dangling/a'));
  rmSync(resolve(root, 'artifacts'), { recursive: true });
  symlinkSync(resolve(root, 'scratch'), resolve(root, 'artifacts'));
  assert.throws(() => diagnosticPath(root, 'artifacts/a'));
}));
test('report queries bound input/output and refuse to infer leak or A/B comparability', () => fixture((root) => {
  const doc = { summary: { backend: 'three', cycles: 3, growthMbLastCycle: { monza: 5 }, verdict: 'ok' }, rows: [{ cycle: 3, track: 'monza', heapMB: 50, aliveTracks: [1], audioMB: 2 }] };
  writeFileSync(resolve(root, 'artifacts/a.json'), JSON.stringify(doc));
  writeFileSync(resolve(root, 'artifacts/b.json'), JSON.stringify(doc));
  const q = diagnosticQuery({ kind: 'memory_census', file: 'artifacts/a.json', compare: 'artifacts/b.json' }, { root });
  assert.match(q.comparability, /unproven/); assert.match(q.baseline.interpretation, /not a leak verdict/);
  assert.equal(q.baseline.observations[0].aliveTrackCount, 1);
  assert.throws(() => diagnosticQuery({ kind: 'memory_census', file: 'artifacts/a.json', limit: 51 }, { root }));
  assert.throws(() => summariseDiagnostic('memory_census', { rows: [] }));
  writeFileSync(resolve(root, 'artifacts/big.json'), ' '.repeat(5 * 1024 * 1024 + 1));
  assert.throws(() => diagnosticQuery({ kind: 'memory_census', file: 'artifacts/big.json' }, { root }), /5 MiB/);
  doc.summary.verdict = 'x'.repeat(50000);
  writeFileSync(resolve(root, 'artifacts/a.json'), JSON.stringify(doc));
  assert.throws(() => diagnosticQuery({ kind: 'memory_census', file: 'artifacts/a.json' }, { root }), /48 KiB/);
}));
test('CDP optional counters remain unavailable, never fabricated zero; no intrusive calls', async () => {
  const calls = [];
  const result = await runtimeMemory({ send: async (method) => {
    calls.push(method);
    if (method === 'Runtime.getHeapUsage') return { usedSize: 0, totalSize: 100, backingStorageSize: 20 };
    if (method === 'Memory.getDOMCounters') throw new Error('Method not found');
    return { metrics: [{ name: 'JSHeapUsedSize', value: 100 }] };
  } });
  assert.equal(result.heap.bytes.usedSize.value, 0);
  assert.equal(result.heap.bytes.embedderHeapUsedSize.status, 'unavailable');
  assert.equal(result.dom.status, 'unavailable'); assert.equal(result.dom.counters.nodes.value, null);
  assert.deepEqual(calls, ['Runtime.getHeapUsage', 'Memory.getDOMCounters', 'Performance.getMetrics']);
});
test('CDP commands have bounded waits; unsupported performance enable blocks metric read', async () => {
  const result = await runtimeMemory({ send: () => new Promise(() => {}) }, { timeoutMs: 10 });
  assert.equal(result.heap.status, 'unavailable'); assert.match(result.heap.reason, /execution unknown/);
  const calls = [];
  const r = await runtimeMemory({ send: async (method) => { calls.push(method); if (method === 'Performance.enable') throw new Error('unsupported'); return {}; } }, { enablePerformance: true });
  assert.equal(r.performance.status, 'unavailable'); assert.equal(r.performance.enabledByHelper, false);
  assert.ok(!calls.includes('Performance.getMetrics'));
});
test('facade routes real runs through shared jobs and keeps capability/query reads offline', async () => {
  const seen = [];
  const handler = createDiagnosticsHandler({ ROOT, toolResult: (x) => x, refuse: (code, error) => ({ ok: false, code, error }), startJob: (a) => { seen.push(a); return { jobId: 'owned' }; } });
  assert.equal((await handler({ op: 'run', kind: 'vm_lifecycle', cycles: 2 })).jobId, 'owned');
  assert.equal(seen.length, 1);
  assert.equal((await handler({ op: 'capabilities' })).ok, true);
  assert.equal((await handler({ op: 'run', kind: 'memory_census', cycles: 2 })).ok, false);
  assert.equal((await handler({ op: 'query', kind: 'memory_census', file: '/etc/passwd' })).ok, false);
});
test('shared process cleanup reaps a disposable Node parent and child', async () => {
  const { spawn } = await import('node:child_process');
  const { processTree, killTreeAndWait, alive } = await import('../../tools/lib/process-tree.mjs');
  const code = "const {spawn}=require('node:child_process');const c=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});console.log(c.pid);setInterval(()=>{},1000)";
  const child = spawn(process.execPath, ['-e', code], { stdio: ['ignore', 'pipe', 'pipe'] });
  let pids = [child.pid];
  try {
    const pid = await new Promise((accept, reject) => { const timer = setTimeout(() => reject(new Error('fixture start timeout')), 5000); child.stdout.once('data', (c) => { clearTimeout(timer); accept(Number(String(c).trim())); }); child.once('error', reject); });
    pids = processTree(child.pid);
    assert.ok(pids.includes(pid)); assert.equal(alive(child.pid), true);
    const result = await killTreeAndWait(pids, { graceMs: 100, maxMs: 3000 });
    assert.deepEqual(result.survivors, []); assert.equal(alive(child.pid), false);
  } finally { await killTreeAndWait(pids, { graceMs: 100, maxMs: 3000 }); }
});

test('exclusive output reservation admits one concurrent owner and prevents evidence reuse', async () => {
  const { spawn } = await import('node:child_process');
  const { pathToFileURL } = await import('node:url');
  const root = mkdtempSync(resolve(ROOT, 'scratch/diagnostics-reservation-'));
  mkdirSync(resolve(root, 'artifacts')); mkdirSync(resolve(root, 'scratch'));
  const out = resolve(root, 'artifacts/shared');
  mkdirSync(out);
  const moduleUrl = pathToFileURL(resolve(ROOT, 'tools/perf/diagnostics.mjs')).href;
  const code = `import {reserveDiagnosticOutput} from ${JSON.stringify(moduleUrl)};try {reserveDiagnosticOutput(process.argv[1], {root:process.argv[2]});console.log('owner');}catch(e){console.error(e.message);process.exitCode=2;}`;
  const attempt = () => new Promise((accept, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', code, out, root], { stdio: ['ignore', 'pipe', 'pipe'] });
    child.once('error', reject); child.once('close', (exit) => accept(exit));
  });
  try {
    const exits = await Promise.all([attempt(), attempt()]);
    assert.deepEqual(exits.sort(), [0, 2]);
    assert.throws(() => reserveDiagnosticOutput(out, { root }), /empty/);
    writeFileSync(resolve(out, 'census.json'), JSON.stringify({ priorOwner: true }));
    assert.throws(() => reserveDiagnosticOutput(out, { root }), /empty/);
    assert.deepEqual(JSON.parse((await import('node:fs')).readFileSync(resolve(out, 'census.json'), 'utf8')), { priorOwner: true });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

function censusFixture() {
  const options = parseArgs(['--backend', 'three', '--tracks', 'monza,monaco', '--cycles', '3', '--max-growth-mb', '1']);
  const rows = Array.from({ length: 3 }, (_, i) => options.tracks.map((track) => ({
    cycle: i + 1, track, heapBytes: 100 * 1048576 + i * 1024,
    aliveTracks: [track], backend: { renderer: 'three', api: 'webgl2' },
    instrumentation: { tracksReady: true }, three: { geometries: 0, textures: 0, renderObjects: 0, programs: 0 },
  }))).flat();
  return { options, rows };
}
test('heap census rejects malformed CLI inputs before acquiring a browser', () => {
  for (const args of [
    ['--tracks', ''], ['--tracks', ','], ['--tracks', 'monza,monza'], ['--tracks', '../escape'],
    ['--cycles', 'NaN'], ['--cycles', '0'], ['--cycles', '2.5'], ['--settle', 'Infinity'], ['--settle', '-1'],
    ['--max-growth-mb', 'NaN'], ['--max-growth-mb', '-1'], ['--cycles', '2', '--max-growth-mb', '1'],
    ['--json'], ['--settle', '--quiet'],
  ]) assert.throws(() => parseArgs(args), JSON.stringify(args));
  assert.equal(parseArgs([]).cycles, 3);
  assert.equal(parseArgs(['--settle', '0', '--max-growth-mb', '0']).maxGrowthMb, 0);
  fixture((root) => assert.throws(() => diagnosticPlan('memory_census', { tracks: ['monza', 'monza'] }, { root, knownCircuits: circuits }), /unique/));
});
test('heap census budgets use raw bytes and preserve measured zero counts', () => {
  const { options, rows } = censusFixture();
  const r = summariseCensus(options, [{ step: 'boot', aliveTracks: [] }, ...rows], []);
  assert.equal(r.ok, true); assert.equal(r.verdict, 'ok');
  assert.equal(r.completeness.status, 'pass'); assert.equal(r.correctness.status, 'pass');
  assert.equal(r.growthBytesLastCycle.monza, 1024);
  assert.equal(r.growthMbLastCycle.monza, 0); // Compatibility display rounding cannot determine the budget.
  assert.equal(r.budget.worstGrowthMiB, 1024 / 1048576);
  assert.equal(summariseCensus({ ...options, maxGrowthMb: 0 }, rows, []).budget.status, 'fail');
  assert.equal(summariseCensus({ ...options, maxGrowthMb: 0 }, rows, []).ok, false);
});
test('page errors, backend fallback and wrong or absent live world cannot pass', () => {
  const { options, rows } = censusFixture();
  assert.equal(summariseCensus(options, rows, ['unexpected page failure']).correctness.status, 'fail');
  for (const patch of [
    { backend: { renderer: 'webgl2', api: 'webgl2' } }, { backend: { renderer: 'three', api: 'unknown' } },
    { aliveTracks: [] }, { aliveTracks: ['spa'] }, { aliveTracks: ['monza', 'monza'] },
  ]) {
    const r = summariseCensus(options, [{ ...rows[0], ...patch }, ...rows.slice(1)], []);
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.equal(r.budget.status, 'unavailable');
  }
});
test('missing heap, hooks, renderer counters, visits and aborted runs are incomplete', () => {
  const { options, rows } = censusFixture();
  for (const patch of [
    { heapBytes: null }, { heapBytes: NaN }, { heapBytes: Infinity }, { heapBytes: -1 },
    { instrumentation: undefined }, { instrumentation: { tracksReady: false } },
    { backend: null }, { three: null }, { three: { geometries: 1, textures: 1, renderObjects: 1 } }, { aliveTracks: null },
  ]) {
    const r = summariseCensus(options, [{ ...rows[0], ...patch }, ...rows.slice(1)], []);
    assert.equal(r.ok, false, JSON.stringify(patch));
    assert.equal(r.completeness.status, 'fail'); assert.equal(r.budget.status, 'unavailable');
  }
  for (const xs of [[], rows.slice(1), [...rows, rows[0]]]) assert.equal(summariseCensus(options, xs, []).ok, false);
  assert.equal(summariseCensus(options, rows, [], { completed: false, failure: 'build timeout' }).ok, false);
  const short = summariseCensus({ ...options, cycles: 1 }, rows.slice(0, 2), []);
  assert.equal(short.growthAvailable, false); assert.equal(short.budget.status, 'unavailable'); assert.equal(short.ok, false);
});
test('diagnostic queries retain correctness, completeness, actual backend and memory scope', () => {
  const { options, rows } = censusFixture();
  rows[0].runtimeMemory = { scope: 'target-isolate', collection: 'sampler already forced GC', performance: { metrics: [] } };
  const summary = summariseCensus(options, rows, ['page error']);
  const result = summariseDiagnostic('memory_census', { summary, rows });
  assert.equal(result.summary.ok, false); assert.equal(result.summary.correctness.status, 'fail');
  assert.deepEqual(result.observations[0].backend, rows[0].backend);
  assert.equal(result.observations[0].heapBytes, rows[0].heapBytes);
  assert.deepEqual(result.observations[0].runtimeMemory, rows[0].runtimeMemory);
  assert.match(result.interpretation, /not measurement success/);
});
test('collector deduplicates identity without merging distinct worlds or decoded buffers', async () => {
  class FakeRef { constructor(value) { this.value = value; } deref() { return this.value; } }
  const track = { def: { id: 'monza' } }, buffer = { length: 100, numberOfChannels: 2 };
  class AudioContext {
    decodeAudioData(_input, ok) { ok?.(buffer); return Promise.resolve(buffer); }
  }
  const context = vm.createContext({
    WeakRef: FakeRef, AudioContext, requestAnimationFrame() {},
    Tracks: { build: () => track, buildPaced: async () => track },
    performance: { memory: { usedJSHeapSize: 123456 } },
    GLX: { backend: 'three', backendState: () => ({ api: 'webgpu' }) },
    renderer: { info: { memory: { geometries: 0, textures: 2, programs: 43, programsSize: 500, total: 1000 } }, _objects: { _renderObjects: new Map() } },
  });
  vm.runInContext(`window = globalThis; (${censusInitScript.toString()})();`, context);
  context.Tracks.build(); await context.Tracks.buildPaced();
  await new context.AudioContext().decodeAudioData(null, () => {});
  await new context.AudioContext().decodeAudioData(null);
  const read = () => JSON.parse(JSON.stringify(vm.runInContext(`(${readCensus.toString()})()`, context)));
  const first = read();
  assert.deepEqual(first.aliveTracks, ['monza']); assert.equal(first.audioBuffers, 1);
  assert.equal(first.heapBytes, 123456); assert.equal(first.three.programs, 43);
  assert.equal(first.three.memory.programsSize, 500); assert.equal(first.three.memory.total, 1000);
  assert.deepEqual(first.backend, { renderer: 'three', api: 'webgpu' });
  const other = { def: { id: 'monza' } };
  context.__memCensus.tracks.push(['monza', new FakeRef(other)]);
  context.__memCensus.tracks.push(['dead', new FakeRef(null)]);
  context.__memCensus.buffers.push(new FakeRef(null));
  assert.deepEqual(read().aliveTracks, ['monza', 'monza']);
  assert.equal(context.__memCensus.tracks.length, 2); assert.equal(context.__memCensus.buffers.length, 1);
});
test('collector reports absent init, heap and renderer data as unavailable', () => {
  const context = vm.createContext({ performance: {} });
  const r = JSON.parse(vm.runInContext(`window = globalThis; JSON.stringify((${readCensus.toString()})())`, context));
  assert.equal(r.instrumentation.tracksReady, false); assert.equal(r.heapBytes, null);
  assert.equal(r.three, null); assert.deepEqual(r.backend, { renderer: null, api: null });
});
test('native GLX identity uses its observed API without assuming a missing label is TLX', () => {
  const context = vm.createContext({ performance: {}, GLX: { backendState: () => ({ api: 'webgl2' }) } });
  const read = () => JSON.parse(vm.runInContext(`window = globalThis; JSON.stringify((${readCensus.toString()})())`, context));
  assert.deepEqual(read().backend, { renderer: 'webgl2', api: 'webgl2' });
  context.GLX.backend = 'three';
  assert.deepEqual(read().backend, { renderer: 'three', api: 'webgl2' });
  delete context.GLX.backend; context.GLX.backendState = () => ({});
  assert.deepEqual(read().backend, { renderer: null, api: null });
});
