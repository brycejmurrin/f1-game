// @doc Browser-free bounded garage matrix planning over canonical cameras and livery fields.
// @skill garage-parts-livery
import path from 'node:path';
import { STATIONS, CAM_ALIAS } from '../shot/lib/garage-camera-catalog.mjs';
import { validateCarFilters, discoverCatalog } from './catalog-discovery.mjs';

export const GARAGE_PLAN_SCHEMA = { type: 'object', additionalProperties: false, properties: {
  team: { type: 'string', description: 'Canonical team id, default mclaren.' },
  frames: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: { type: 'string', enum: [...Object.keys(STATIONS), ...Object.keys(CAM_ALIAS)] }, description: 'Canonical station or camera alias ids; default spineTop.' },
  field: { type: 'string', description: 'Canonical livery enum field (including bodyStyle and finishes), or part.<category> from apex_catalog section parts.' },
  options: { type: 'array', minItems: 1, maxItems: 4, uniqueItems: true, items: { type: 'string' }, description: 'Explicit canonical enum values for field; no arbitrary design objects.' },
  maxShots: { type: 'integer', minimum: 1, maximum: 16 },
  budgetSeconds: { type: 'integer', minimum: 30, maximum: 180 },
  dryRun: { type: 'boolean' }, target: { type: 'string', enum: ['local', 'deploy'] }, url: { type: 'string' },
} };

export function createGaragePlanHandler({ ROOT, toolResult, refuse, runSpawn }) {
  return async function garagePlan(args = {}, { signal } = {}) {
    try {
      const { team } = validateCarFilters({ team: args.team || 'mclaren' });
      const frames = args.frames || ['spineTop'];
      if (!frames.length || frames.length > 4 || frames.some(f => !STATIONS[f] && !CAM_ALIAS[f])) throw new Error('Unknown or oversized frame list');
      const argv = [process.execPath, path.join(ROOT, 'tools/shot/garage-angles.mjs'), '--plan', `--team=${team}`, '--preset=none', `--budget=${args.budgetSeconds ?? 180}s`];
      const stations = frames.filter(f => STATIONS[f]), cams = frames.filter(f => CAM_ALIAS[f]);
      if (stations.length) argv.push(`--station=${stations.join(',')}`);
      if (cams.length) argv.push(`--cam=${cams.join(',')}`);
      if ((args.field == null) !== (args.options == null)) throw new Error('field and options must be supplied together');
      if (args.field != null) {
        const isPart = args.field.startsWith('part.');
        const fields = discoverCatalog(isPart
          ? { section: 'parts', category: args.field.slice(5), team, limit: 100 }
          : { section: 'liveries', filter: args.field, limit: 100 }).rows;
        const values = isPart ? fields.map(f => f.id) : fields.find(f => f.kind === 'field' && f.id === args.field)?.values;
        if (!values || !args.options.length || args.options.length > 4 || args.options.some(v => !values.includes(v))) throw new Error('Use a canonical livery enum or available part.<category> with 1..4 explicit values');
        argv.push(`--${args.field}=${args.options.join(',')}`);
      }
      const shots = frames.length * (args.options?.length || 1);
      const maxShots = args.maxShots ?? 16;
      if (shots > maxShots) throw new Error(`Matrix ${shots} exceeds maxShots ${maxShots}`);
      if (args.dryRun) return toolResult({ ok: true, dryRun: true, browser: false, argv, shots, maxShots, budgetSeconds: args.budgetSeconds ?? 180 });
      const result = await runSpawn(argv, { timeoutMs: 30000, signal });
      const body = JSON.parse(result.content[0].text);
      if (!body.ok) return result;
      const plan = body.out;
      if (!plan || !Number.isFinite(plan.shotCount)) throw new Error('Garage planner returned no numeric shotCount');
      return toolResult({ ok: true, browser: false, planOnly: true, withinBudget: !plan.overBudget && plan.shotCount <= maxShots,
        maxShots, budgetSeconds: args.budgetSeconds ?? 180, plan,
        limitation: 'No browser was launched. Estimates do not establish rendering correctness or real GPU performance. Captures must use one parent-owned browser and the shared lock.' });
    } catch (e) { return e.refuse || refuse('bad_args', e.message, 'Use canonical garage frames, team ids, livery enum values and explicit shot/time bounds.'); }
  };
}
