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
