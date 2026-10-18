// @doc Typed background diagnostics and bounded report queries for Apex MCP.
// @skill renderer-debug / mcp-probe
import { resolve } from 'node:path';
import { DIAGNOSTIC_JOB_KINDS, diagnosticPlan, diagnosticQuery } from '../perf/diagnostics.mjs';
export { DIAGNOSTIC_JOB_KINDS };
export const DIAGNOSTICS_TOOL = {
  name: 'apex_diagnostics',
  description: 'Tree/browser — capabilities, bounded run (background apex_job_status/cancel), or query saved memory/GPU/renderer/VM lifecycle reports. Browser jobs hold the shared lock and use disposable contexts. Memory growth alone is not a leak; GPU census estimates requested WebGL2 allocations, not residency or hardware timings. CPU spans/copy costs use apex_profile and apex_profile_query; source debugging uses debugger_* on the parent-owned page. Skill: renderer-debug / mcp-probe.',
  inputSchema: { type: 'object', additionalProperties: false, properties: {
    op: { type: 'string', enum: ['capabilities', 'run', 'query'] },
    kind: { type: 'string', enum: DIAGNOSTIC_JOB_KINDS },
    out: { type: 'string', maxLength: 512 }, file: { type: 'string', maxLength: 512 }, compare: { type: 'string', maxLength: 512 },
    limit: { type: 'integer', minimum: 1, maximum: 50 },
    track: { type: 'string', maxLength: 40 }, tracks: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', maxLength: 40 } }, visits: { type: 'array', minItems: 1, maxItems: 4, items: { type: 'string', maxLength: 40 } },
    backend: { type: 'string', enum: ['three', 'webgl2', 'webgpu'] }, mode: { type: 'string', enum: ['picker', 'race'] },
    cycles: { type: 'integer', minimum: 1, maximum: 6 }, settle: { type: 'integer', minimum: 0, maximum: 10 }, warm: { type: 'integer', minimum: 1, maximum: 120 }, maxGrowthMb: { type: 'integer', minimum: 0, maximum: 2048 },
    seed: { type: 'integer', minimum: 0, maximum: 4294967295 }, cam: { type: 'string', enum: ['orbit', 'eye', 'park'] },
    mobile: { type: 'boolean' }, realLink: { type: 'boolean' }, lite: { type: 'boolean' }, iphone: { type: 'boolean' }, dryRun: { type: 'boolean' },
    target: { type: 'string', enum: ['local'] },
  } },
};
export function diagnosticsJobSpec(kind, args, ctx) {
  const plan = diagnosticPlan(kind, args, { root: ctx.ROOT, knownCircuits: ctx.knownCircuits });
  const { kind: _k, op: _o, ...options } = args;
  return { ...plan, argv: [process.execPath, resolve(ctx.ROOT, 'tools/perf/diagnostics.mjs'), kind, JSON.stringify(options)] };
}
export const DIAGNOSTIC_CAPABILITIES = {
  jobs: DIAGNOSTIC_JOB_KINDS,
  memory: 'Post-GC heap/retained track/three object/audio census. At least 3 cycles. Growth is a lead; retaining paths and repeated equivalent lifecycles are needed to establish a leak.',
  runtimeMemory: 'tools/perf/runtime-memory.mjs: feature-detected Runtime.getHeapUsage, Memory.getDOMCounters and Performance.getMetrics on an existing parent-owned CDP session; no forced GC or worker termination.',
  cpuAndCopies: 'apex_profile modes spans|cpu|hitch|trace; apex_profile_query. CPU sampling attributes runtime costs; backing-store bytes and renderer allocation counts answer different questions.',
  gpu: 'Requested WebGL2 allocation estimates only; default shader links are stubbed (realLink:true opts in). Hardware GPU timings/residency unavailable here; run real-device WebGL timer queries/WebGPU timestamp queries separately.',
  sourceDebugging: 'Existing debugger_* attach/inspect/logpoints/listeners/instances on one parent-owned local Chrome, then detach.',
  unsupported: ['Raw heap snapshot streaming/allocation profiling capture (use parent-owned DevTools/CDP workflow)', 'Automatic leak classification', 'Driver GPU memory residency', 'Software-browser FPS as player GPU evidence'],
};
export function createDiagnosticsHandler(ctx) {
  return async (args) => {
    try {
      const op = args.op ?? 'capabilities';
      if (op === 'capabilities') {
        if (Object.keys(args).some((k) => !['op', 'target'].includes(k))) throw new Error('capabilities accepts only op and local target');
        if (args.target != null && args.target !== 'local') throw new Error('local target required');
        return ctx.toolResult({ ok: true, ...DIAGNOSTIC_CAPABILITIES });
      }
      if (op === 'query') {
        if (Object.keys(args).some((k) => !['op', 'kind', 'file', 'compare', 'limit', 'target'].includes(k))) throw new Error('query accepts kind,file,compare,limit only');
        if (args.target != null && args.target !== 'local') throw new Error('local target required');
        return ctx.toolResult(diagnosticQuery(args, { root: ctx.ROOT }));
      }
      if (op !== 'run') throw new Error('op must be capabilities|run|query');
      const plan = diagnosticPlan(args.kind, args, { root: ctx.ROOT });
      if (args.dryRun) return ctx.toolResult({ ok: true, dryRun: true, ...plan, routed: 'apex_job_start' });
      return ctx.startJob(args);
    } catch (e) { return ctx.refuse('bad_args', String(e.message || e), 'Use apex_diagnostics capabilities; choose a fresh output under artifacts/ or scratch/.'); }
  };
}
