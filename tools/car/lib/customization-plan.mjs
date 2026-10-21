// @doc Browser-free customization capture plans from canonical body, finish and part registries.
import { loadParts, catalogRows } from '../parts-sweep.mjs';
import { loadAtlas } from '../livery-contrast.mjs';

export function customizationCatalog() {
  const M = loadParts({ shade: true });
  const { Liveries } = loadAtlas();
  return { ...M, Liveries };
}

export function customizationEnums(M) {
  const finishes = ['gloss', ...Object.keys(M.Car3D.FINISH_SURFACE)];
  const enums = {
    bodyStyle: ['team', ...M.Car3D.BODY_STYLE_IDS], finish: finishes,
    finShape: M.Car3D.FIN_SHAPE_IDS, spineHeight: M.Car3D.SPINE_HEIGHT_IDS,
    coverVents: M.Car3D.COVER_VENT_IDS, tcam: M.Car3D.TCAM_IDS,
  };
  for (const field of M.Car3D.FINISH_FIELDS) if (field !== 'finish') enums[field] = ['inherit', ...finishes];
  for (const [field, category] of Object.entries(M.Car3D.PART_STYLE_FIELDS || {}))
    enums[field] = ['fitted', ...M.Parts.CATALOG.find(c => c.id === category).options.filter(o => o.tag === 'STYLE').map(o => o.id)];
  return enums;
}

export const PART_VIEWS = {
  engine: { az: 322, el: 24, dist: 4.6, look: -0.7, lookY: 0.2 },
  aero: { az: 24, el: 20, dist: 4.4, look: -1.3, lookY: 0.35 },
  suspension: { az: 148, el: 11, dist: 4.5, look: 1.1 },
  brakes: { az: 100, el: 12, dist: 3.4, look: 1.65, lookX: -0.65 },
  tyres: { az: 98, el: 10, dist: 3.5, look: 1.65, lookX: -0.65 },
  ers: { az: 322, el: 24, dist: 4.3, look: -0.8 },
  gearbox: { az: 24, el: 22, dist: 4.0, look: -1.6 },
  fuel: { az: 20, el: 28, dist: 4.3, look: -0.6 },
  exhaust: { az: 8, el: 15, dist: 3.3, look: -1.9, lookY: 0.15 },
  floor: { az: 100, el: 7, dist: 5.3, look: -0.45, lookY: -0.12 },
  cockpit: { az: 145, el: 38, dist: 3.7, look: -0.15, lookY: 0.35 },
  wheels: { az: 94, el: 12, dist: 3.3, look: 1.65, lookX: -0.65 },
};

export function validateSelections(M, { team = 'mclaren', bodyStyle = 'team', finish = 'gloss', parts = {} } = {}) {
  const t = M.Teams.LIST.find(t => t.id === team);
  if (!t) throw new Error(`Unknown team: ${team}`);
  const enums = customizationEnums(M);
  if (!enums.bodyStyle.includes(bodyStyle)) throw new Error(`Unknown body style: ${bodyStyle}`);
  if (!enums.finish.includes(finish)) throw new Error(`Unknown finish: ${finish}`);
  for (const [cat, id] of Object.entries(parts)) {
    const c = M.Parts.CATALOG.find(c => c.id === cat);
    if (!c?.options.some(o => o.id === id)) throw new Error(`Unknown part: ${cat}/${id}`);
    if (M.Parts.resolveSetup({ [cat]: id }, t).ids[cat] !== id) throw new Error(`Unavailable part for ${team}: ${cat}/${id}`);
  }
  return t;
}

export function planCustomization({ categories, team = 'mclaren', bodyStyle = 'team', finish = 'gloss', parts = {}, livery = {}, stylesOnly = false, bodies = false, finishes = false, M = customizationCatalog() } = {}) {
  validateSelections(M, { team, bodyStyle, finish, parts });
  const enums = customizationEnums(M);
  for (const [field, value] of Object.entries(livery)) {
    if (!M.Liveries.FIELDS.includes(field)) throw new Error(`Unknown livery field: ${field}`);
    if (enums[field] && !enums[field].includes(value)) throw new Error(`Unknown ${field}: ${value}`);
  }
  const cats = categories || M.Parts.CATALOG.map(c => c.id);
  if (cats.some(id => !M.Parts.CATALOG.some(c => c.id === id))) throw new Error('Unknown part category');
  const jobs = [];
  const add = (kind, category, id, label, state, meta = {}) => jobs.push({ key: `${kind}/${category}/${id}`, kind, category, id, label, state, ...meta });
  for (const row of catalogRows(M.Parts, M.Teams, team)) {
    if (!cats.includes(row.cat)) continue;
    const opt = M.Parts.CATALOG.find(c => c.id === row.cat).options.find(o => o.id === row.optionId);
    if (stylesOnly && opt.tag !== 'STYLE' && !opt.id.startsWith('style_')) continue;
    const t = M.Teams.LIST.find(t => t.id === row.teamId);
    const requested = { ...M.Parts.DEFAULTS, ...parts, [row.cat]: row.optionId };
    validateSelections(M, { team: t.id, bodyStyle, finish, parts: requested });
    const paint = { sponsors: 'clean', spineLogo: 'none', spineSide: 'none', finBadge: 'none', ...livery, bodyStyle, finish };
    const state = { team: t.id, parts: requested, livery: paint, ...PART_VIEWS[row.cat] };
    const meta = { option: opt, baseline: opt.equivalent || M.Parts.DEFAULTS[row.cat], team: t.id };
    add('parts', row.cat, opt.id, opt.label, state, meta);
    if (row.cat === 'aero') add('parts', row.cat, opt.id + '-front', opt.label + ' · front wing', { ...state, az: 158, el: 18, dist: 4.6, look: 1.65, lookY: 0 }, { ...meta, optionId: opt.id });
  }
  if (bodies) for (const id of customizationEnums(M).bodyStyle) for (const [view, az, el] of [['quarter', 145, 23], ['side', 90, 9]]) {
    add('bodies', 'body', `${id}-${view}`, `${id} · ${view}`, { team, parts: { ...M.Parts.DEFAULTS, ...parts }, livery: { sponsors: 'clean', spineLogo: 'none', finShape: 'standard', spineHeight: 'standard', ...livery, bodyStyle: id, finish }, az, el, dist: 8.2, look: 0, lookY: 0, lookX: 0 }, { bodyStyle: id, team });
  }
  if (bodies) for (const t of M.Teams.LIST) for (const [view, az, el] of [['quarter', 145, 23], ['side', 90, 9]]) {
    add('teams', 'chassis', `${t.id}-${view}`, `${t.name} · ${view}`, { team: t.id, parts: M.Parts.getFactorySetup(t), livery: { ...livery, bodyStyle: 'team', finish, sponsors: 'clean', spineLogo: 'none' }, az, el, dist: 8.5, look: 0, lookY: 0, lookX: 0 }, { team: t.id });
  }
  if (finishes) for (const id of customizationEnums(M).finish) {
    add('finishes', 'finish', id, id, { team, parts: { ...M.Parts.DEFAULTS, ...parts }, livery: { sponsors: 'clean', spineLogo: 'none', ...livery, bodyStyle, finish: id }, az: 145, el: 23, dist: 7.5, look: 0, lookY: 0, lookX: 0 }, { finish: id, team });
  }
  return { version: 1, categories: cats, jobs, counts: { shots: jobs.length, parts: new Set(jobs.filter(j => j.kind === 'parts').map(j => `${j.category}/${j.optionId || j.id}`)).size }, catalog: M.Parts.CATALOG, bodies: customizationEnums(M).bodyStyle, finishes: customizationEnums(M).finish };
}
