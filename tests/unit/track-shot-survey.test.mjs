import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import zlib from "node:zlib";
import path from "node:path";
import {
  buildTrackShotSurveyPlan,
  estimateSurveyMs,
  filterResumeShots,
  pngProblem,
  surveyTerminalState,
  linspaceFracs,
  normalizeSurveyTracks,
  scoreShotFindings,
  shouldSurveyAsync,
  writeSurveyFindings,
  writeSurveyIndex,
  writeCompareIndex,
  writeSurveyGalleryFromReports,
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

/** A real 1x1 PNG built by hand (signature + IHDR + IDAT + IEND with correct CRCs). */
function tinyPng() {
  const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(Buffer.from([0, 255, 0, 0]))), chunk("IEND", Buffer.alloc(0))]);
}

test("filterResumeShots and findings helpers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-survey-"));
  const plan = buildTrackShotSurveyPlan({ preset: "lap", label: "r" });
  fs.writeFileSync(path.join(dir, `${plan.shots[0].name}.png`), tinyPng());
  const { pending, resumed, invalid } = filterResumeShots(dir, plan.shots, true);
  assert.equal(resumed.length, 1);
  assert.equal(pending.length, 3);
  assert.deepEqual(invalid, []);
  assert.deepEqual(scoreShotFindings({ spread: 1.5, kb: 40 }), ["low_spread", "near_blank", "tiny_png"]);
  const { file } = writeSurveyFindings(dir, {
    track: "monza", actualTrack: "custom-fjord", failures: [{ name: "failed-view", error: "capture failed" }], label: "r", preset: "lap",
    shots: [{ name: "a", spread: 1.5, kb: 40, frac: 0, cam: "orbit", tod: "day" }],
  });
  assert.equal(path.basename(file), "findings.json");
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(body.flagged, 1);
  assert.equal(body.actualTrack, "custom-fjord");
  assert.equal(body.failed, 1);
  assert.equal(body.failures[0].name, "failed-view");
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


test("compare gallery shows every track view, captions, failures and legacy panels", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-gallery-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = writeCompareIndex(dir, { label: '<Gallery "review">', tracks: [
    { track: "custom-first", label: "Fjord <ridge>", captured: 1, failed: 1, failures: [{ name: "bad <view>", error: '<script>alert("x")</script>' }], shots: [{ name: "ridge", png: path.join(dir, "first", "ridge one.jpg"), cam: "orbit", frac: 0.25, tod: "day" }] },
    { track: "custom-second", shots: [{ name: "ridge", file: "second/ridge.png", cam: "trackside", frac: 0.75, tod: "night" }] },
    { track: "legacy", captured: 4, panel: "legacy/panel.png", relIndex: "legacy/index.html" },
  ] });
  const html = fs.readFileSync(file, "utf8");
  assert.equal((html.match(/<figure>/g) || []).length, 2);
  assert.match(html, /first\/ridge%20one.jpg/);
  assert.match(html, /second\/ridge.png/);
  assert.match(html, /orbit · lap 25.0% · day/);
  assert.match(html, /trackside · lap 75.0% · night/);
  assert.match(html, /3 track\(s\) · 6 captured · 1 failed/);
  assert.match(html, /legacy\/panel.png/);
  assert.match(html, /legacy\/index.html/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /Fjord &lt;ridge&gt;/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /minmax\(min\(100%,340px\)/);
});

test("report galleries copy repeated shot names portably and preserve actual custom identities", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-reports-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const reports = ["first", "second"].map((name, i) => {
    const root = path.join(dir, name);
    fs.mkdirSync(root);
    fs.writeFileSync(path.join(root, "same.jpg"), `image-${i}`);
    const file = path.join(root, "findings.json");
    fs.writeFileSync(file, JSON.stringify({ track: "monza", ...(i ? { state: { info: { track: "custom-second" } } } : { actualTrack: "custom-first" }), label: name, shots: [{ name: "same", ...(i ? { file: "same.jpg" } : { png: path.join(root, "same.jpg") }), cam: "orbit", frac: 0.5, tod: "day" }], failed: i, failures: i ? ["camera failed"] : [] }));
    return file;
  });
  const out = path.join(dir, "gallery");
  const validated = [];
  const file = writeSurveyGalleryFromReports(out, reports, { validateAssetPath: (source) => validated.push(source) });
  assert.deepEqual(validated.slice(0, reports.length), reports.map((report) => path.join(path.dirname(report), "same.jpg")));
  assert.ok(validated.includes(path.join(out, "index.html")));
  assert.ok(validated.includes(path.join(out, "assets")));
  // Source reports can disappear: all referenced images remain inside the output folder.
  fs.rmSync(path.dirname(reports[0]), { recursive: true });
  fs.rmSync(path.dirname(reports[1]), { recursive: true });
  const html = fs.readFileSync(file, "utf8");
  assert.match(html, /custom-first/);
  assert.match(html, /custom-second/);
  assert.doesNotMatch(html, /monza|file:\/\//);
  assert.match(html, /2 captured · 1 failed/);
  assert.match(html, /camera failed/);
  const images = [...html.matchAll(/<img src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(images).size, 2);
  assert.deepEqual(images.map((image) => fs.readFileSync(path.join(out, decodeURIComponent(image)), "utf8")), ["image-0", "image-1"]);
});

test("report gallery rejects missing reports, images and unsupported asset types before writing", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-missing-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "gallery");
  assert.throws(() => writeSurveyGalleryFromReports(out, []), /at least one/);
  assert.throws(() => writeSurveyGalleryFromReports(out, [path.join(dir, "absent.json")]), /Cannot read survey report/);
  const report = path.join(dir, "findings.json");
  fs.writeFileSync(report, JSON.stringify({ track: "custom-a", shots: [{ name: "missing", png: "missing.png" }] }));
  assert.throws(() => writeSurveyGalleryFromReports(out, [report]), /Missing survey image.*missing.png/);
  assert.equal(fs.existsSync(out), false);
  fs.writeFileSync(report, JSON.stringify({ shots: [{ name: "unsafe", file: "image.svg" }] }));
  assert.throws(() => writeSurveyGalleryFromReports(out, [report]), /expected PNG or JPEG/);
  fs.writeFileSync(report, JSON.stringify({ shots: "invalid" }));
  assert.throws(() => writeSurveyGalleryFromReports(out, [report]), /shots must be an array/);
});


test("report gallery applies the asset policy before file reads, including symbolic links", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-gallery-policy-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const out = path.join(dir, "gallery");
  const report = path.join(dir, "findings.json");
  fs.writeFileSync(report, JSON.stringify({ shots: [{ file: "not-present.jpg" }] }));
  assert.throws(() => writeSurveyGalleryFromReports(out, [report], { validateAssetPath: () => { throw new Error("outside allowed assets"); } }), /outside allowed assets/);
  const external = path.join(dir, "outside.jpg");
  fs.writeFileSync(external, "outside");
  const safe = path.join(dir, "safe");
  fs.mkdirSync(safe);
  const link = path.join(safe, "linked.jpg");
  fs.symlinkSync(external, link);
  fs.writeFileSync(report, JSON.stringify({ shots: [{ png: link }] }));
  const validateAssetPath = (source) => {
    if (!fs.realpathSync(source).startsWith(safe + path.sep)) throw new Error("outside allowed assets through symlink");
  };
  assert.throws(() => writeSurveyGalleryFromReports(out, [report], { validateAssetPath }), /through symlink/);
  assert.equal(fs.existsSync(out), false);
});

test("compare gallery shows all-failed tracks without inventing index links", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-gallery-failed-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = writeCompareIndex(dir, { tracks: [{ track: "broken", error: "Boot failed", relIndex: null }] });
  const html = fs.readFileSync(file, "utf8");
  assert.match(html, /0 captured · 1 failed/);
  assert.match(html, /Boot failed/);
  assert.doesNotMatch(html, /Track index/);
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

// #1982: identity and resume evidence.
test("two fracs that round to one name are rejected at plan time, not overwritten into one image", () => {
  assert.throws(() => buildTrackShotSurveyPlan({ preset: "custom", fracs: [0.101, 0.104], cam: "orbit", label: "repro" }),
    /share a name.*repro-10-orbit \(fracs 0\.101, 0\.104\)/);
  assert.doesNotThrow(() => buildTrackShotSurveyPlan({ preset: "custom", fracs: [0.1, 0.12], cam: "orbit", label: "repro" }));
  // explicit duplicate shot names collide the same way
  assert.throws(() => buildTrackShotSurveyPlan({ shots: [{ name: "a", frac: 0.1 }, { name: "a", frac: 0.5 }] }), /share a name/);
});

test("resume only counts a structurally sound PNG: text, truncation and a flipped byte are recaptured and reported", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-survey-"));
  const plan = buildTrackShotSurveyPlan({ preset: "custom", fracs: [0.1, 0.3, 0.5, 0.7], cam: "orbit", label: "v" });
  const [ok, text, cut, flipped] = plan.shots.map((s) => path.join(dir, `${s.name}.png`));
  fs.writeFileSync(ok, tinyPng());
  fs.writeFileSync(text, "not an image");
  fs.writeFileSync(cut, tinyPng().subarray(0, 40));
  const bad = Buffer.from(tinyPng()); bad[30] ^= 0xff; // inside IHDR/IDAT payload: CRC no longer matches
  fs.writeFileSync(flipped, bad);
  const { pending, resumed, invalid } = filterResumeShots(dir, plan.shots, true);
  assert.deepEqual(resumed.map((s) => s.name), [plan.shots[0].name]);
  assert.deepEqual(pending.map((s) => s.name), plan.shots.slice(1).map((s) => s.name));
  assert.deepEqual(invalid.map((i) => i.name), plan.shots.slice(1, 4).map((s) => s.name));
  assert.match(invalid[0].reason, /not a PNG/);
  assert.match(invalid[1].reason, /truncated|no IEND/);
  assert.match(invalid[2].reason, /bad CRC/);
  assert.equal(pngProblem(ok), null);
  // without --resume nothing is read
  assert.equal(filterResumeShots(dir, plan.shots, false).resumed.length, 0);
});

test("#1983: one terminal state for CLI and MCP: any failed shot, track error or empty track is failed, never done", () => {
  assert.equal(surveyTerminalState([{ track: "monza", captured: 4, failed: 0 }]), "done");
  assert.equal(surveyTerminalState([{ track: "monza", captured: 3, failed: 1 }]), "failed", "a failed shot");
  assert.equal(surveyTerminalState([{ track: "monza", captured: 0, failed: 0 }]), "failed", "nothing captured");
  assert.equal(surveyTerminalState([{ track: "monza", captured: 0, failed: 0, skipped: true }]), "done", "a skipped track (CLI)");
  assert.equal(surveyTerminalState([{ track: "a", captured: 4, failed: 0 }, { track: "b", captured: 0, failed: 0, error: "boot" }]), "failed");
  assert.equal(surveyTerminalState([{ track: "a", captured: 4, failed: 0 }], true), "failed", "a hard failure");
  // both adapters route their final progress write through it
  for (const f of ["tools/shot/shot-survey.mjs", "tools/mcp/apex-extras.mjs"]) {
    const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "../..", f), "utf8");
    assert.match(src, /state: surveyTerminalState\(/, f);
    assert.doesNotMatch(src, /state: "done"/, `${f} must not write an unconditional done`);
  }
});
