import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTrackShotSurveyPlan,
  buildSurveyPlans,
  estimateSurveyMs,
  filterResumeShots,
  linspaceFracs,
  normalizeSurveyTracks,
  scoreShotFindings,
  shouldSurveyAsync,
  writeSurveyFindings,
  writeSurveyIndex,
  MAX_SURVEY_SHOTS,
  SURVEY_ASYNC_MS,
} from "../../tools/lib/track-shot-survey.mjs";

test("linspaceFracs spreads without hitting 1.0 duplicate", () => {
  assert.deepEqual(linspaceFracs(4), [0, 0.25, 0.5, 0.75]);
  assert.equal(linspaceFracs(1)[0], 0.5);
});

test("buildTrackShotSurveyPlan: scenery preset yields 12 orbit shots", () => {
  const p = buildTrackShotSurveyPlan({ track: "monza", preset: "scenery" });
  assert.equal(p.shots.length, 12);
  assert.equal(p.shots[0].cam, "orbit");
  assert.match(p.shots[0].name, /^survey-/);
});

test("buildTrackShotSurveyPlan: quick / dual_lite / night_pass presets", () => {
  assert.equal(buildTrackShotSurveyPlan({ preset: "quick" }).shots.length, 4);
  assert.equal(buildTrackShotSurveyPlan({ preset: "dual_lite" }).shots.length, 8);
  const night = buildTrackShotSurveyPlan({ preset: "night_pass" });
  assert.equal(night.shots.length, 6);
  assert.equal(night.shots[0].tod, "night");
  assert.equal(buildTrackShotSurveyPlan({ preset: "full" }).shots.length, 12);
});

test("buildTrackShotSurveyPlan: dual preset caps at 32 cells", () => {
  const p = buildTrackShotSurveyPlan({ track: "spa", preset: "dual", count: 8 });
  assert.equal(p.shots.length, 16);
});

test("buildTrackShotSurveyPlan: custom shots list", () => {
  const p = buildTrackShotSurveyPlan({
    track: "monza",
    preset: "custom",
    shots: [{ name: "t1", frac: 0.2, cam: "trackside", tod: "night" }],
  });
  assert.equal(p.shots.length, 1);
  assert.equal(p.shots[0].cam, "trackside");
});

test("buildTrackShotSurveyPlan rejects >32 shots", () => {
  assert.throws(
    () => buildTrackShotSurveyPlan({ track: "monza", fracs: Array.from({ length: 20 }, (_, i) => i / 20), cams: ["orbit", "trackside"] }),
    /max 32/,
  );
});

test("normalizeSurveyTracks + estimate + async policy", () => {
  assert.deepEqual(normalizeSurveyTracks({ tracks: ["monza", "spa", "monza"] }), ["monza", "spa"]);
  const quick = buildTrackShotSurveyPlan({ preset: "quick" });
  assert.ok(estimateSurveyMs(quick.shots.length, 1) >= SURVEY_ASYNC_MS);
  assert.equal(shouldSurveyAsync({}, quick, 1), true);
  assert.equal(shouldSurveyAsync({}, quick, 2), true);
  const one = buildTrackShotSurveyPlan({
    preset: "custom",
    shots: [{ name: "only", frac: 0.5, cam: "orbit", tod: "day" }],
  });
  assert.ok(estimateSurveyMs(one.shots.length, 1) < SURVEY_ASYNC_MS);
  assert.equal(shouldSurveyAsync({}, one, 1), false);
  assert.equal(shouldSurveyAsync({ async: true }, one, 1), true);
  assert.equal(shouldSurveyAsync({ async: false }, buildTrackShotSurveyPlan({ preset: "dual" }), 3), false);
});

test('named batches partition tracks and reject missing, duplicate and oversized selections', () => {
  const args = { locations: ['spa/eau-rouge', 'monaco/turn-1', 'spa/raidillon'], angles: ['overview', 'entry'] };
  const plans = buildSurveyPlans(args, ['spa', 'monaco']);
  assert.equal(plans.get('spa').shots.length, 4);
  assert.equal(plans.get('monaco').shots.length, 2);
  assert.ok(plans.get('spa').shots.every(s => s.location.startsWith('spa/')));
  const name = plans.get('monaco').shots[0].name;
  const selected = buildSurveyPlans({ ...args, select: [name] }, ['spa', 'monaco']);
  assert.equal(selected.get('spa').shots.length, 0);
  assert.deepEqual(selected.get('monaco').shots.map(s => s.name), [name]);
  assert.throws(() => buildSurveyPlans({ ...args, select: ['missing'] }, ['spa', 'monaco']), /Unknown selected shot/);
  assert.throws(() => buildSurveyPlans({ ...args, locations: [...args.locations, 'fuji/turn-1'] }, ['spa', 'monaco']), /does not match/);
  assert.throws(() => buildSurveyPlans({ ...args, locations: ['spa/eau-rouge'] }, ['spa', 'monaco']), /No locations/);
  assert.throws(() => buildSurveyPlans({ locations: ['spa/eau-rouge', 'spa/eau-rouge'] }, ['spa']), /unique/);
  assert.throws(() => buildSurveyPlans({ locations: ['spa/eau-rouge'], location: 'spa/raidillon' }, ['spa']), /not both/);
  assert.throws(() => buildSurveyPlans({ locations: ['spa/eau-rouge', 'spa/raidillon'], angles: ['overview','reverse','overhead','entry','apex','exit'], weathers: ['dry','wet','rain'] }, ['spa']), /max 32/);
});

test('native custom scenery targets preserve content ids and reject unsupported scenery', async () => {
  const { loadSurveyDesigns } = await import('../../tools/lib/custom-survey-locations.mjs');
  const { design } = await import('../helpers/editor-vm.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'survey-custom-')), file = path.join(dir, 'designs.json');
  const row = design({ props: [{ kind: 'pond', s: .25, side: 1, gap: 30 }, { kind: 'pond', s: .75, side: -1, gap: 40 }] });
  const write = items => fs.writeFileSync(file, JSON.stringify({ format: 'apex26.tracks', v: 1, items }));
  try {
    write([row]);
    const custom = loadSurveyDesigns(file), id = custom.designs[0].id;
    assert.deepEqual(normalizeSurveyTracks({ track: id }), [id]);
    const targets = custom.locations.get(id);
    assert.deepEqual(targets.map(l => l.id), [`${id}/pond-1`, `${id}/pond-2`]);
    assert.ok(targets.every(l => l.target.length === 3 && l.target.every(Number.isFinite)));
    assert.match(targets[0].verification, /placement anchor/);
    assert.ok(targets[0].target[2] > 400 && targets[0].target[2] < 450, 'infield pond centre includes its 30m half-width beyond the road-edge gap');
    const plan = buildTrackShotSurveyPlan({ track: id, customDesigns: custom, location: `${id}/pond-2`, angles: ['overhead'] });
    assert.deepEqual(plan.shots[0].target, targets[1].target);
    assert.ok(plan.shots[0].dist > 110, 'water framing accounts for the full footprint');
    write(custom.designs);
    assert.equal(loadSurveyDesigns(file).designs[0].id, id);
    assert.notEqual(loadSurveyDesigns(file).digest, custom.digest, 'input changes invalidate resume');
    write([{ ...row, props: [{ kind: 'future-prop', s: .2 }] }]);
    assert.throws(() => loadSurveyDesigns(file), /Unsupported scenery/);
    write([{ ...row, theme: 'future-theme' }]);
    assert.throws(() => loadSurveyDesigns(file), /Unsupported theme/);
    write([{ ...row, id: 'custom-00000000' }]);
    assert.throws(() => loadSurveyDesigns(file), /id mismatch/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("filterResumeShots and findings helpers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-survey-"));
  const plan = buildTrackShotSurveyPlan({ preset: "lap", label: "r" });
  fs.writeFileSync(path.join(dir, `${plan.shots[0].name}.png`), "x");
  const { pending, resumed } = filterResumeShots(dir, plan.shots, true);
  assert.equal(resumed.length, 1);
  assert.equal(pending.length, 3);
  assert.deepEqual(scoreShotFindings({ spread: 1.5, kb: 40 }), ["low_spread", "near_blank", "tiny_png"]);
  const { file } = writeSurveyFindings(dir, {
    track: "monza", label: "r", preset: "lap",
    shots: [{ name: "a", spread: 1.5, kb: 40, frac: 0, cam: "orbit", tod: "day" }],
  });
  assert.equal(path.basename(file), "findings.json");
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(body.flagged, 1);
});

test("writeSurveyIndex writes readable gallery", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-survey-"));
  const html = writeSurveyIndex(dir, {
    track: "monza",
    label: "scenery",
    preset: "lap",
    shots: [{ name: "a", frac: 0.5, cam: "orbit", tod: "day" }],
  });
  assert.equal(path.basename(html), "index.html");
  const text = fs.readFileSync(html, "utf8");
  assert.match(text, /monza/);
  assert.match(text, /a\.png/);
});

test("MAX_SURVEY_SHOTS is 32", () => {
  assert.equal(MAX_SURVEY_SHOTS, 32);
});

test("buildTrackShotSurveyPlan: weather is validated and reaches every shot (null = leave as booted)", () => {
  assert.ok(buildTrackShotSurveyPlan({ preset: "quick" }).shots.every((s) => s.weather === null));
  assert.ok(buildTrackShotSurveyPlan({ preset: "quick", weather: "fog" }).shots.every((s) => s.weather === "fog"));
  const custom = buildTrackShotSurveyPlan({ weather: "rain", shots: [{ frac: 0.2 }, { frac: 0.4, weather: "overcast" }] });
  assert.deepEqual(custom.shots.map((s) => s.weather), ["rain", "overcast"]);
  assert.throws(() => buildTrackShotSurveyPlan({ preset: "quick", weather: "snow" }), /weather invalid/);
});

test('named scenarios resolve racing-space locations and preserve camera controls', () => {
 const plan=buildTrackShotSurveyPlan({track:'spa',location:'eau rouge',angles:['overview','entry'],weathers:['dry','rain'],camera:{fov:45}});
 assert.equal(plan.shots.length,4);assert.equal(plan.shots[0].frac,.14);assert.equal(plan.shots[0].fov,45);
 assert.equal(plan.shots[1].lookFrac,.14);assert.equal(plan.shots[1].lat,-6);
 assert.match(plan.shots[0].verification,/unverified/);
 assert.throws(()=>buildTrackShotSurveyPlan({track:'monza',location:'spa/eau-rouge'}),/Unknown/);
 assert.throws(()=>buildTrackShotSurveyPlan({track:'spa',location:'eau rouge',angles:['__proto__']}),/Unknown angle/);
 assert.throws(()=>buildTrackShotSurveyPlan({location:'spa/eau-rouge',camera:{fov:Infinity}}),/fov/);
 assert.throws(()=>buildTrackShotSurveyPlan({preset:'custom',shots:[{cam:'orbit',lat:3}]}),/require eye/);
});
test('every circuit exposes authored turn locations usable by named shot plans', async () => {
 const { listSurveyLocations } = await import('../../tools/lib/survey-scenarios.mjs');
 const { createRequire } = await import('node:module');
 const require = createRequire(import.meta.url);
 const defs = require('../../tools/track/verify-track.cjs').buildContext(null, {quiet:true}).LIST;
 assert.equal(defs.length,52);
 for (const def of defs) {
   const locations = listSurveyLocations(def.id);
   assert.equal(locations.filter(l=>l.kind==='turn').length,def.turns.length,def.id);
   assert.equal(locations.find(l=>l.id===`${def.id}/turn-1`).frac,def.turns[0],def.id);
   const plan = buildTrackShotSurveyPlan({track:def.id,location:`${def.id}/turn-1`,angles:['apex']});
   assert.equal(plan.shots[0].frac,def.turns[0],def.id);
 }
 assert.throws(()=>listSurveyLocations('unknown'),/Unknown track/);
 assert.throws(()=>buildTrackShotSurveyPlan({track:'monaco',location:'spa/turn-1'}),/Unknown or ambiguous/);
});
test('named scenery catalog accounts for every registered hero and targets emitted geometry', async () => {
 const { listSurveyLocations } = await import('../../tools/lib/survey-scenarios.mjs');
 const { default: { scenerySourceDigest } } = await import('../../tools/shot/scenery-source-hash.cjs');
 const catalog = JSON.parse(fs.readFileSync('tools/shot/scenery-locations.json', 'utf8'));
 assert.equal(catalog.sourceDigest,scenerySourceDigest(path.resolve('.')),'catalog must be regenerated after scenery or projection source changes');
 const registryDir = 'tests/data/landmarks';
 const registryFiles = fs.readdirSync(registryDir).filter(f=>f.endsWith('.json'));
 const { createRequire } = await import('node:module');
 const require = createRequire(import.meta.url);
 const trackIds = Array.from(require('../../tools/track/verify-track.cjs').buildContext(null,{quiet:true}).LIST,d=>d.id).sort();
 assert.deepEqual(registryFiles.map(f=>f.slice(0,-5)).sort(),trackIds,'every circuit must have a scenery registry');
 const registered = registryFiles.flatMap(f=>JSON.parse(fs.readFileSync(path.join(registryDir,f),'utf8')).ids);
 assert.equal(new Set([...catalog.locations.map(l=>l.modelId),...catalog.omitted.map(l=>l.modelId)]).size,registered.length);
 assert.deepEqual([...catalog.locations.map(l=>l.modelId),...catalog.omitted.map(l=>l.modelId)].sort(),registered.sort());
 for (const file of registryFiles) {
   const track=file.slice(0,-5), names=listSurveyLocations(track).filter(l=>l.kind==='scenery');
   assert.ok(names.length>0,`${track}: no emitted scenery names`);
   for (const l of names) {
     assert.ok(l.frac>=0&&l.frac<1,`${l.id}: racing fraction`);
     assert.equal(l.target.length,3);
     assert.ok(l.target.every(Number.isFinite));
     assert.ok(l.nearestRoadDistanceM>=0 && l.viewDistanceM>=0);
     assert.ok(['source-viewpoint','nearest-road-projection'].includes(l.stationMethod));
     assert.match(l.verification,/framing unverified/);
   }
 }
 assert.equal(listSurveyLocations('spa').filter(l=>l.kind==='named').length,4);
 const merlion=listSurveyLocations('singapore').find(l=>l.modelId==='singapore-merlion');
 assert.ok(merlion);
 const shot=buildTrackShotSurveyPlan({track:'singapore',location:merlion.id,angles:['overview']}).shots[0];
 assert.equal(shot.frac,merlion.frac);
 assert.deepEqual(shot.target,merlion.target);
 const fuji=listSurveyLocations('fuji').find(l=>l.modelId==='fuji-mount-fuji');
 assert.equal(fuji.frac,.12);
 assert.equal(fuji.stationMethod,'source-viewpoint');
 assert.notEqual(fuji.projectedFrac,fuji.frac);
 const estoril=listSurveyLocations('estoril').find(l=>l.modelId==='estoril-moinho');
 assert.equal(estoril.frac,.44);
 assert.equal(estoril.stationMethod,'source-viewpoint');
 const jerez=listSurveyLocations('jerez').find(l=>l.modelId==='jerez-ovni');
 assert.equal(jerez.frac,.002,'the sl() scenery anchor is the racing start line');
 assert.equal(jerez.name,'El Ovni');
 assert.equal(listSurveyLocations('magny_cours').find(l=>l.modelId==='magny-cours-bourg').name,'Bourg');
 const sochi=listSurveyLocations('sochi').find(l=>l.modelId==='sochi-flame-tower');
 assert.equal(sochi.frac,.115,'the Olympic Park loop has a nearer wrong-leg road');
 assert.notEqual(sochi.projectedFrac,sochi.frac);
});
test('resume requires matching receipt identity when a capture context is supplied',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'survey-identity-'));
 try {
  const shot={name:'one'};const file=path.join(dir,'one.jpg');fs.writeFileSync(file,'fixture');
  const context={extension:'jpg',identities:{one:'current'}};
  assert.equal(filterResumeShots(dir,[shot],true,context).pending.length,1);
  fs.writeFileSync(file+'.capture.json',JSON.stringify({identity:'old'}));
  assert.equal(filterResumeShots(dir,[shot],true,context).pending.length,1);
  fs.writeFileSync(file+'.capture.json',JSON.stringify({identity:'current'}));
  assert.equal(filterResumeShots(dir,[shot],true,context).resumed.length,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('capture identities are key-order independent but change with source or settings', async()=>{
 const {captureIdentity}=await import('../../tools/lib/survey-scenarios.mjs');
 assert.equal(captureIdentity({seed:1,shot:{az:40,el:30}}),captureIdentity({shot:{el:30,az:40},seed:1}));
 assert.notEqual(captureIdentity({revision:'a',profile:'preview'}),captureIdentity({revision:'a',profile:'comparison'}));
 assert.notEqual(captureIdentity({revision:'a'}),captureIdentity({revision:'b'}));
});

test('survey GPU auto-selection does not mistake installed Mesa for a usable local device',async()=>{
 const {surveyGlEnvironment}=await import('../../tools/lib/survey-scenarios.mjs');
 const librariesOnly=p=>p.endsWith('swrast_dri.so');
 assert.equal(surveyGlEnvironment({},'',librariesOnly).APEX_GPU,'swiftshader');
 assert.equal(surveyGlEnvironment({GITHUB_ACTIONS:'true'},'',librariesOnly).APEX_GPU,'llvmpipe');
 assert.equal(surveyGlEnvironment({APEX_GPU:'hardware'},'swiftshader',librariesOnly).APEX_GPU,'swiftshader');
 assert.equal(surveyGlEnvironment({APEX_GPU:'hardware'},'',librariesOnly).APEX_GPU,'hardware');
});

test('survey galleries preserve the actual JPEG capture path and native navigation', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apex-gallery-jpeg-'));
  try {
    const file = writeSurveyIndex(dir, { track: 'spa', shots: [{ name: 'pond', png: path.join(dir, 'pond.jpg'), cam: 'orbit' }] });
    const html = fs.readFileSync(file, 'utf8');
    assert.match(html, /src="pond.jpg"/);
    assert.doesNotMatch(html, /pond.png|<script\b|<select\b/);
    assert.match(html, /name="viewport"/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
