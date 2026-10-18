import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { diagnosticPlan, diagnosticPath, diagnosticQuery, summariseDiagnostic, reserveDiagnosticOutput } from '../../tools/perf/diagnostics.mjs';
import { diagnosticsJobSpec, createDiagnosticsHandler } from '../../tools/mcp/diagnostics-tools.mjs';
import { runtimeMemory } from '../../tools/perf/runtime-memory.mjs';
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
