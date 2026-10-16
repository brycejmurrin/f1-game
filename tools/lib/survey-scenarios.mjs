// @doc Named survey locations, camera recipes and bounded reproducible scenario plans.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

// Racing-space fractions, not authored scenery fractions. Visual verification is separate.
export const SURVEY_LOCATIONS = [
  ['spa/la-source', 'La Source', .035],
  ['spa/eau-rouge', 'Eau Rouge', .14],
  ['spa/raidillon', 'Raidillon', .165],
  ['spa/les-combes', 'Les Combes', .36],
].map(([id, name, frac]) => ({ id, name, track: 'spa', frac,
  aliases: [name.toLowerCase(), id.split('/')[1]], source: 'docs/tracks/spa.md §3', verification: 'source-located; framing unverified' }));
const require = createRequire(import.meta.url);
const sceneryCatalog = JSON.parse(readFileSync(new URL('../shot/scenery-locations.json', import.meta.url), 'utf8'));
const SCENERY_LOCATIONS = sceneryCatalog.locations.map(l => ({ ...l, kind: 'scenery',
  aliases: [...new Set([l.id.split('/')[1], l.modelId, l.name.toLowerCase()])],
  verification: `required scenery model emitted; ${l.stationMethod === 'source-viewpoint' ? 'source-backed viewing station' : 'nearest-road camera candidate'} ${l.viewDistanceM} m from model; framing unverified${l.viewDistanceM > 150 ? `; distant landmark${l.stationMethod === 'source-viewpoint' ? '' : ', road viewpoint uncertain'}` : ''}`,
}));
let circuitLocations;

// The authored `turns` are racing-lap fractions. Read the built definitions
// instead of parsing comments or guessing a scenery object's world position.
function indexedLocations() {
  if (circuitLocations) return circuitLocations;
  const { buildContext } = require('../track/verify-track.cjs');
  circuitLocations = new Map(buildContext(null, { quiet: true }).LIST.map(def => {
    const track = def.id;
    const source = `js/circuits/${track}.js turns`;
    const turns = Array.from(def.turns || [], (frac, i) => ({
      id: `${track}/turn-${i + 1}`, name: `Turn ${i + 1}`, track, frac: Number(frac),
      kind: 'turn', aliases: [`turn-${i + 1}`, `t${i + 1}`], source,
      verification: 'authored turn marker; scenery framing unverified',
    }));
    const anchors = [{ id: `${track}/start-finish`, name: 'Start/finish', track, frac: 0,
      kind: 'anchor', aliases: ['start-finish', 'start'], source: `js/circuits/${track}.js startFrac`,
      verification: 'racing-lap origin; scenery framing unverified' }];
    for (const [i, frac] of Array.from(def.sectors || []).entries()) anchors.push({
      id: `${track}/sector-${i + 2}-start`, name: `Sector ${i + 2} start`, track, frac: Number(frac),
      kind: 'anchor', aliases: [`sector-${i + 2}-start`], source: `js/circuits/${track}.js sectors`,
      verification: 'authored sector boundary; scenery framing unverified',
    });
    return [track, [...anchors, ...turns]];
  }));
  return circuitLocations;
}

export function listSurveyLocations(track) {
  const all = indexedLocations();
  if (!all.has(track)) throw new Error(`Unknown track ${track}; choose ${[...all.keys()].join(', ')}`);
  return [...SURVEY_LOCATIONS.filter(l => l.track === track).map(l => ({ ...l, kind: 'named' })),
    ...SCENERY_LOCATIONS.filter(l => l.track === track), ...all.get(track)];
}
export const CAMERA_RECIPES = {
  overview: { cam: 'orbit', az: 40, el: 40, dist: 90, h: 1.5, fov: 55 },
  reverse: { cam: 'orbit', az: 220, el: 30, dist: 75, h: 1.5, fov: 55 },
  overhead: { cam: 'orbit', az: 40, el: 75, dist: 110, h: 1.5, fov: 55 },
  entry: { cam: 'eye', offset: -.012, h: 3, lat: -6, fov: 60 },
  apex: { cam: 'trackside', dist: 18, h: 5, side: 1, fov: 55 },
  exit: { cam: 'eye', offset: .012, h: 3, lat: 6, fov: 60 },
};
export function resolveLocation(query, track) {
  const q = String(query).trim().toLowerCase();
  const tracks = track ? [track] : [...indexedLocations().keys()];
  const candidates = tracks.flatMap(id => listSurveyLocations(id));
  const found = candidates.filter(l => l.id === q || (track && l.aliases.includes(q)));
  if (found.length !== 1) throw new Error(`Unknown or ambiguous location ${query}; use a circuit-qualified id such as ${track || 'spa'}/turn-1`);
  return { ...found[0] };
}
const number = (v, min, max, key) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`${key} must be ${min}..${max}`);
  return v;
};
export function cameraControls(s) {
  const out = {};
  for (const [key,min,max] of [['fov',10,120],['lat',-500,500],['lookFrac',0,1],['h',-50,1000],['dist',.1,10000],['az',-360,360],['el',-85,85]]) {
    if (s[key] != null) out[key] = number(s[key],min,max,key);
  }
  if (s.target != null) {
    if (!Array.isArray(s.target) || s.target.length !== 3) throw new Error('target must be [x,y,z]');
    out.target=s.target.map(v=>number(v,-1000000,1000000,'target'));
  }
  if ((s.lat != null || s.lookFrac != null) && s.cam !== 'eye') throw new Error('lat/lookFrac require eye camera');
  if ((s.fov != null || s.target != null) && s.cam === 'park') throw new Error('fov/target require a debug camera');
  return out;
}
export function scenarioShots(args) {
  const location=resolveLocation(args.location,args.track || args.tracks?.[0]);
  if (args.tracks?.some(t=>t!==location.track)) throw new Error('Named locations require one matching track');
  const angles=args.angles || ['overview','reverse','overhead'];
  const weathers=args.weathers || [args.weather || 'dry'];
  if (!Array.isArray(angles)||!angles.length||!Array.isArray(weathers)||!weathers.length||angles.length*weathers.length>32) throw new Error('Scenario must contain 1..32 shots');
  if (new Set(angles).size!==angles.length || new Set(weathers).size!==weathers.length) throw new Error('Scenario angles/weather must be unique');
  return weathers.flatMap(weather=>angles.map(angle=>{
    if (!Object.hasOwn(CAMERA_RECIPES,angle)) throw new Error(`Unknown angle ${angle}`);
    const {offset=0,...camera}=CAMERA_RECIPES[angle];
    return { ...camera, name:`${location.id.replace('/','-')}-${angle}-${weather}`, frac:+((location.frac+offset+1)%1).toFixed(6),
      ...(camera.cam==='eye'?{lookFrac:location.frac}:{}), weather, tod:args.tod||'day', location:location.id, angle,
      verification:location.verification,
      ...(location.kind==='scenery' ? { target: location.target } : {}),
      ...cameraControls({...camera,...args.camera}) };
  }));
}
export function captureIdentity(value) {
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function sourceIdentity(root) {
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  const untracked = git('ls-files','--others','--exclude-standard','-z','--','js','css','index.html','tools','assets').split('\0').filter(Boolean).sort().map(file=>[file,createHash('sha256').update(readFileSync(path.join(root,file))).digest('hex')]);
  return { revision:git('rev-parse','HEAD').trim(), dirty:!!git('status','--porcelain','--untracked-files=no').trim() || untracked.length > 0, untracked,
    diffHash:captureIdentity(git('diff','HEAD','--','js','css','index.html','tools','assets')) };
}

/** Honor explicit requests; auto-select Mesa only where the capture launcher permits it. */
export function surveyGlEnvironment(env = process.env, requested = "", exists = existsSync) {
  const mesa = (exists("/dev/dri") || !!env.GITHUB_ACTIONS) && exists("/usr/lib/x86_64-linux-gnu/dri/swrast_dri.so");
  const gpu = requested || env.APEX_GPU || env.APEX_GL || env.GL || (mesa ? "llvmpipe" : "swiftshader");
  if (!["swiftshader", "llvmpipe", "hardware", "lavapipe"].includes(gpu)) throw new Error("Unsupported survey GPU: " + gpu);
  return { ...env, APEX_GPU: gpu, APEX_GL: gpu };
}
