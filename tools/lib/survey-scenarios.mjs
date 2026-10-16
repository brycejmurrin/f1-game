// @doc Named survey locations, camera recipes and bounded reproducible scenario plans.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Racing-space fractions, not authored scenery fractions. Visual verification is separate.
export const SURVEY_LOCATIONS = [
  ['spa/la-source', 'La Source', .035],
  ['spa/eau-rouge', 'Eau Rouge', .14],
  ['spa/raidillon', 'Raidillon', .165],
  ['spa/les-combes', 'Les Combes', .36],
].map(([id, name, frac]) => ({ id, name, track: 'spa', frac,
  aliases: [name.toLowerCase(), id.split('/')[1]], source: 'docs/tracks/spa.md §3', verification: 'source-located; framing unverified' }));
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
  const found = SURVEY_LOCATIONS.filter(l => (!track || l.track === track) && (l.id === q || l.aliases.includes(q)));
  if (found.length !== 1) throw new Error(`Unknown or ambiguous location ${query}; choose ${SURVEY_LOCATIONS.filter(l=>!track||l.track===track).map(l=>l.id).join(', ')}`);
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
      verification:location.verification, ...cameraControls({...camera,...args.camera}) };
  }));
}
export function captureIdentity(value) {
  const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}
export function sourceIdentity(root) {
  const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024});
  return { revision:git('rev-parse','HEAD').trim(), dirty:!!git('status','--porcelain','--untracked-files=no').trim(),
    diffHash:captureIdentity(git('diff','HEAD','--','js','css','index.html','tools','assets')) };
}
