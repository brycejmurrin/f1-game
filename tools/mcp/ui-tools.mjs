// @doc Bounded semantic UI inspection and saved inspection comparison for Apex MCP.
// @skill ui-menu-a11y
// Protocol: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
import fs from 'node:fs';
import path from 'node:path';
import { listScreenIds } from '../ui/menu-screens.mjs';
import { diffInspections } from '../ui/explorer/inspector.mjs';
import { MISSIONS } from '../ui/explorer/catalog.mjs';

const size = { type: 'object', additionalProperties: false, required: ['width', 'height'], properties: {
  width: { type: 'integer', minimum: 240, maximum: 3840 }, height: { type: 'integer', minimum: 240, maximum: 2160 },
} };
// Saved evidence is untrusted JSON. Preserve the complete artifact on disk,
// while preventing one control's serialized runtime value flooding MCP.
function bounded(value, depth = 0) {
  if (typeof value === 'string') return value.length > 512 ? value.slice(0, 512) + '…[truncated]' : value;
  if (!value || typeof value !== 'object') return value;
  if (depth >= 5) return '[nested evidence omitted]';
  if (Array.isArray(value)) return value.slice(0, 100).map(v => bounded(v, depth + 1));
  return Object.fromEntries(Object.entries(value).slice(0, 40).map(([k, v]) => [k.slice(0, 512), bounded(v, depth + 1)]));
}
export const UI_INSPECT_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  screen: { type: 'string', enum: listScreenIds(), description: 'Catalog route; default title. This is setup, not proof of player navigation.' },
  selector: { type: 'string', minLength: 1, maxLength: 512 },
  styles: { type: 'string', minLength: 1, maxLength: 512, description: 'Selector whose computed and matched CSS is inspected.' },
  viewports: { type: 'array', minItems: 1, maxItems: 8, items: size },
  roundtrip: { type: 'boolean', description: 'Return through the viewport sequence; requires viewports.' },
  touch: { type: 'boolean' }, boot: size,
  safe: { type: 'array', minItems: 4, maxItems: 4, items: { type: 'integer', minimum: 0, maximum: 200 }, description: 'Safe-area top,right,bottom,left in CSS pixels.' },
  out: { type: 'string', description: 'Output directory inside artifacts/ or scratch/.' },
  dryRun: { type: 'boolean' }, target: { type: 'string', enum: ['local', 'deploy'] }, url: { type: 'string' },
} };
export const UI_DIFF_SCHEMA = { type: 'object', additionalProperties: false, required: ['before', 'after'], properties: {
  before: { type: 'string', description: 'Saved inspection.json under artifacts/ or scratch/; max 5 MiB.' },
  after: { type: 'string', description: 'Saved inspection.json under artifacts/ or scratch/; max 5 MiB.' },
  dryRun: { type: 'boolean' }, target: { type: 'string', enum: ['local', 'deploy'] }, url: { type: 'string' },
} };
export const UI_MISSION_SCHEMA = { type: 'object', additionalProperties: false, required: ['mission'], properties: {
  mission: { type: 'string', enum: MISSIONS.map(m => m.id) },
  out: { type: 'string', description: 'Directory under artifacts/ or scratch/ for a canonical scenario and future evidence.' },
  maxShots: { type: 'integer', minimum: 1, maximum: 5 },
  timeoutSeconds: { type: 'integer', minimum: 30, maximum: 180 },
  dryRun: { type: 'boolean' }, target: { type: 'string', enum: ['local', 'deploy'] }, url: { type: 'string' },
} };

function inspections(report) {
  const rows = report.records || [{ inspection: report }];
  if (!Array.isArray(rows) || !rows.length || rows.length > 16) throw new Error('Expected 1..16 inspection records');
  for (const r of rows) {
    const i = r?.inspection;
    if (!i || !Array.isArray(i.controls) || i.controls.length > 5000 || i.controls.some(c => !c || typeof c.selector !== 'string')) throw new Error('Invalid or oversized inspection controls');
    if (i.issues != null && (!Array.isArray(i.issues) || i.issues.length > 5000)) throw new Error('Invalid inspection issues');
    if (i.layoutContexts != null && (!Array.isArray(i.layoutContexts) || i.layoutContexts.length > 5000)) throw new Error('Invalid layout contexts');
  }
  return rows;
}

export function summarizeUIInspection(report) {
  const records = inspections(report);
  return { provenance: bounded(report.provenance || null), records: records.map(r => {
    const i = r.inspection, counts = {};
    for (const c of i.controls) { const s = c.binding?.status || 'unmapped'; counts[s] = (counts[s] || 0) + 1; }
    return { viewport: bounded(r.requestedViewport || i.viewport || null), phase: bounded(r.phase || null),
      settlement: bounded(r.settlement || i.settlement || null), controls: i.controls.length, bindings: counts,
      advisories: bounded((i.issues || []).slice(0, 100)), advisoryTotal: (i.issues || []).length,
      truncated: (i.issues || []).length > 100 };
  }), limitation: 'Probe completion is not a UI pass. Issues are advisories; unavailable and unmapped bindings are unknown. Catalog setup does not establish player navigation.' };
}

export function createUITools(ctx) {
  const { ROOT, assertSafeOut, toolResult, refuse, runSpawn, occupancyRefuse, mockMode } = ctx;
  const compactResult = body => {
    if (Buffer.byteLength(JSON.stringify(body)) <= 512 * 1024) return toolResult(body);
    return toolResult({ ok: true, browser: body.browser, truncated: true, report: body.report, beforeFile: body.beforeFile, afterFile: body.afterFile,
      limitation: 'Inspection details exceed the 512 KiB MCP budget. Read the saved inspection artifacts; this is not a correctness verdict.' });
  };
  const read = raw => {
    const file = assertSafeOut(raw);
    if (!fs.statSync(file).isFile() || fs.statSync(file).size > 5 * 1024 * 1024) throw new Error('Inspection must be a file of at most 5 MiB');
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  };
  const bad = e => e.refuse || refuse('bad_args', e.message, 'Use bounded inspection JSON and paths under artifacts/ or scratch/.');
  return { handlers: {
    apex_ui_mission_plan(args) {
      try {
        const mission = MISSIONS.find(m => m.id === args.mission);
        if (!mission) throw new Error('Unknown named mission');
        const out = assertSafeOut(args.out || `artifacts/ui-missions/${mission.id}`);
        const scenario = assertSafeOut(path.join(out, 'scenario.json'));
        const evidence = assertSafeOut(path.join(out, 'run'));
        const maxShots = args.maxShots ?? 5;
        const argv = [process.execPath, path.join(ROOT, 'tools/ui/explorer.mjs'), 'replay', scenario, '--out', evidence, '--max-shots', String(maxShots)];
        if (!args.dryRun && !mockMode()) { fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(scenario, JSON.stringify(mission, null, 2) + '\n'); }
        return toolResult({ ok: true, browser: false, planOnly: true, mission: mission.id, goal: mission.goal,
          scenario: path.relative(ROOT, scenario), written: !args.dryRun && !mockMode(), argv,
          limits: { missions: 1, actions: mission.actions.length, maxShots, timeoutMs: (args.timeoutSeconds ?? 180) * 1000 },
          limitation: 'Planning is not a playtest result. Run the pinned CLI as the parent with the stated outer timeout; the CLI owns the browser lock. Guided replay is separate from independent player discovery.' });
      } catch (e) { return bad(e); }
    },
    async apex_ui_inspect(args = {}, { signal } = {}) {
      try {
        if (args.roundtrip && !args.viewports) throw new Error('roundtrip requires viewports');
        const out = assertSafeOut(args.out || 'artifacts/ui-inspect');
        // explorer owns the shared lock itself; acquiring it in this parent
        // would deadlock the child. Preflight occupancy also covers dry runs.
        const argv = [process.execPath, path.join(ROOT, 'tools/ui/explorer.mjs'), 'inspect', '--screen', args.screen || 'title', '--out', out, '--summary'];
        for (const k of ['selector', 'styles']) if (args[k] != null) argv.push('--' + k + '=' + args[k]);
        if (args.viewports) argv.push('--viewports', args.viewports.map(v => `${v.width}x${v.height}`).join(','));
        if (args.boot) argv.push('--boot', `${args.boot.width}x${args.boot.height}`);
        if (args.safe) argv.push('--safe', args.safe.join(','));
        for (const k of ['touch', 'roundtrip']) if (args[k]) argv.push('--' + k);
        if (!mockMode()) { const occupied = occupancyRefuse(); if (occupied) return occupied; }
        if (args.dryRun || mockMode()) return toolResult({ ok: true, dryRun: !!args.dryRun, mock: mockMode(), argv, lockOwner: 'tools/ui/explorer.mjs', timeoutMs: 180000 });
        const result = await runSpawn(argv, { timeoutMs: 180000, signal });
        const body = JSON.parse(result.content[0].text);
        if (!body.ok) return result;
        const file = path.join(out, 'inspection.json');
        return compactResult({ ok: true, browser: true, report: path.relative(ROOT, file), ...summarizeUIInspection(read(file)) });
      } catch (e) { return bad(e); }
    },
    apex_ui_diff(args) {
      try {
        if (args.dryRun) { assertSafeOut(args.before); assertSafeOut(args.after); return toolResult({ ok: true, dryRun: true, browser: false }); }
        const before = read(args.before), after = read(args.after);
        const a = inspections(before), b = inspections(after);
        if (before.provenance?.screen !== after.provenance?.screen) return refuse('incompatible_inspections', 'Catalog screens differ.', 'Compare the same screen.');
        const comparable = a.length === b.length && a.every((r, n) => JSON.stringify(r.requestedViewport || r.inspection.viewport) === JSON.stringify(b[n].requestedViewport || b[n].inspection.viewport) && r.phase === b[n].phase);
        if (!comparable) return refuse('incompatible_inspections', 'Record counts, viewport sequence, or phases differ.', 'Compare inspections made with the same viewport sequence and roundtrip setting.');
        return compactResult({ ok: true, browser: false, beforeFile: args.before, afterFile: args.after, comparisons: a.map((r, n) => ({ index: n,
          viewport: r.requestedViewport || r.inspection.viewport || null,
          ...(() => {
            const d = diffInspections(r.inspection, b[n].inspection);
            const totals = {};
            for (const key of ['added', 'removed', 'layout', 'layoutContexts', 'issues']) {
              if (Array.isArray(d[key])) { totals[key] = d[key].length; if (d[key].length > 100) d.truncated = true; d[key] = d[key].slice(0, 100); }
            }
            return { ...bounded(d), totals };
          })() })),
          before: summarizeUIInspection(before), after: summarizeUIInspection(after),
          limitation: 'Differences are observations, not correctness verdicts. Missing bindings remain unknown; source and state changes can explain differences.' });
      } catch (e) { return bad(e); }
    },
  } };
}
