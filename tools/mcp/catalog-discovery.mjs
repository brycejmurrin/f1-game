// @doc Bounded browser-free canonical parts, livery and garage camera discovery; validated audit filters.
// @skill garage-parts-livery
import { loadParts } from "../car/parts-sweep.mjs";
import { loadAtlas } from "../car/livery-contrast.mjs";
import { TARGETS, CAM_ALIAS, STATIONS, FIELD_STATIONS } from "../shot/lib/garage-camera-catalog.mjs";

export const DISCOVERY_SCHEMA = {
  section: { type: "string", enum: ["parts", "liveries", "garage"], description: "Optional focused catalog; omitted preserves the existing general catalog." },
  category: { type: "string", description: "Canonical part category id; parts section only." },
  team: { type: "string", description: "Canonical team id. Parts use supplier/team availability; liveries include that team's default." },
  filter: { type: "string", maxLength: 80, description: "Case-insensitive literal id/name/field search." },
  limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
  offset: { type: "integer", minimum: 0, maximum: 100000, default: 0 },
};
export const CAR_FILTER_SCHEMA = {
  categories: { type: "array", minItems: 1, maxItems: 12, uniqueItems: true, items: { type: "string" }, description: "Canonical part category ids from apex_catalog section parts." },
  team: DISCOVERY_SCHEMA.team,
};
let parts, atlas;
const mods = () => (parts ||= loadParts());
const paint = () => (atlas ||= loadAtlas());
const plain = (value) => JSON.parse(JSON.stringify(value));
const fail = (message) => { throw new Error(message); };
function teamOf(id) {
  if (typeof id !== "string") fail("team must be a canonical team id");
  const team = mods().Teams.LIST.find((t) => t.id === id);
  return team || fail(`unknown team ${id}`);
}
/** Pure argv validation: no child process, file output or browser state. */
export function validateCarFilters(args = {}, { allowTeam = true } = {}) {
  if (args.category !== undefined && args.categories !== undefined) fail("use category or categories, not both");
  const requested = args.category === undefined ? args.categories : [args.category];
  let cats;
  if (requested !== undefined) {
    if (!Array.isArray(requested) || !requested.length || requested.length > 12) fail("categories must contain 1..12 canonical category ids");
    const ids = Array.from(mods().Parts.CATALOG, (c) => c.id);
    if (requested.some((id) => typeof id !== "string" || !ids.includes(id))) fail("unknown part category");
    cats = [...new Set(requested)];
  }
  let team;
  if (args.team !== undefined) {
    if (!allowTeam) fail("team is not supported for this operation");
    team = teamOf(args.team).id;
  }
  return { cats, team };
}
export function carFilterArgv(args = {}, options = {}) {
  const { cats, team } = validateCarFilters(args, options);
  return [...(cats ? [`--cats=${cats.join(",")}`] : []), ...(team ? [`--team=${team}`] : [])];
}
function partRows(args) {
  const { Parts, Teams } = mods();
  const { cats, team } = validateCarFilters(args);
  const selectedTeam = team ? teamOf(team) : null;
  const rows = [];
  for (const cat of Parts.CATALOG) {
    if (cats && !cats.includes(cat.id)) continue;
    for (const opt of cat.options) {
      if (selectedTeam && !Parts.isOptionAvailable(opt, selectedTeam)) continue;
      rows.push({ kind: "option", category: cat.id, categoryLabel: cat.label, id: opt.id, label: opt.label,
        description: opt.desc || "", cost: opt.cost || 0, default: Parts.DEFAULTS[cat.id] === opt.id,
        stats: Object.fromEntries(["speed", "accel", "cornering", "braking"].map((key) => [key, opt[key] ?? 1])),
        restrictions: { teams: opt.teams || (opt.team ? [opt.team] : []), suppliers: opt.suppliers || (opt.supplier ? [opt.supplier] : []) },
        availableTeams: Array.from(Teams.LIST).filter((t) => Parts.isOptionAvailable(opt, t)).map((t) => t.id),
        ...(opt.tag ? { tag: opt.tag } : {}), ...(opt.equivalent ? { equivalent: opt.equivalent } : {}),
        ...(opt.ersProfile ? { ersProfile: opt.ersProfile } : {}), ...(opt.aeroLoad != null ? { aeroLoad: opt.aeroLoad } : {}),
      });
    }
  }
  return { rows, categories: Array.from(Parts.CATALOG, (c) => ({ id: c.id, label: c.label, options: c.options.length })), budget: Parts.BUDGET,
    limitation: "Availability is supplier/team-only; career ownership and research unlocks require live career state." };
}
function liveryRows(args) {
  const { Liveries, LT } = paint();
  const { Car3D, Teams } = mods();
  const teams = args.team === undefined ? Array.from(Teams.LIST) : [teamOf(args.team)];
  const rows = [];
  const universal = new Set(Array.from(Liveries.UNIVERSAL, (l) => l.id));
  const seen = new Set();
  for (const team of teams) for (const liv of Liveries.forTeam(team)) {
    const key = universal.has(liv.id) ? liv.id : `${team.id}/${liv.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ kind: "livery", id: liv.id, name: liv.name, team: universal.has(liv.id) ? null : team.id, fields: Object.keys(liv).filter((k) => !["id", "name"].includes(k)) });
  }
  const enums = { numFont: LT.NUM_FONT_IDS, sponsors: LT.SPONSOR_PACK_IDS, finStyle: LT.TAIL_STYLE_IDS,
    finBadge: LT.FIN_BADGE_IDS, spineLogo: LT.SPINE_LOGO_IDS, spineSide: LT.SPINE_SIDE_IDS,
    finShape: Car3D.FIN_SHAPE_IDS, tcam: Car3D.TCAM_IDS, coverVents: Car3D.COVER_VENT_IDS,
    spineHeight: Car3D.SPINE_HEIGHT_IDS, finish: ["gloss", ...Object.keys(Car3D.FINISH_SURFACE)] };
  for (const id of Liveries.FIELDS) rows.push({ kind: "field", id, ...(enums[id] ? { values: enums[id] } : {}), stations: FIELD_STATIONS[id] || [] });
  return { rows, limitation: "Canonical universal/team catalog only; optional Legends runtime additions, custom player liveries and saved selections are not loaded. Fields without values have no enum exposed by the canonical loader." };
}
export function discoverCatalog(args = {}) {
  if (!["parts", "liveries", "garage"].includes(args.section)) fail("section must be parts, liveries or garage");
  if (args.section !== "parts" && (args.category !== undefined || args.categories !== undefined)) fail("category applies only to parts");
  if (args.section === "garage" && args.team !== undefined) fail("garage camera stations are team-independent");
  const offset = args.offset ?? 0, limit = args.limit ?? 25;
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) fail("offset must be an integer 0..100000");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) fail("limit must be an integer 1..100");
  if (args.filter !== undefined && (typeof args.filter !== "string" || args.filter.length > 80)) fail("filter must be a string of at most 80 characters");
  const data = args.section === "parts" ? partRows(args) : args.section === "liveries" ? liveryRows(args) : { rows: [
    ...Object.entries(STATIONS).map(([id, camera]) => ({ kind: "station", id, ...camera, fields: Object.keys(FIELD_STATIONS).filter((field) => FIELD_STATIONS[field].includes(id)) })),
    ...Object.entries(CAM_ALIAS).map(([id, camera]) => ({ kind: "alias", id, camera })),
    ...Object.entries(TARGETS).map(([id, target]) => ({ kind: "target", id, target })),
  ] };
  const needle = (args.filter || "").toLowerCase();
  const rows = data.rows.filter((row) => !needle || JSON.stringify(row).toLowerCase().includes(needle));
  return plain({ ok: true, section: args.section, ...data, rows: rows.slice(offset, offset + limit), total: rows.length, offset, limit,
    nextOffset: offset + limit < rows.length ? offset + limit : null, readOnly: true, browser: false });
}
