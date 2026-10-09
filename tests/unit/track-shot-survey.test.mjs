import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildTrackShotSurveyPlan,
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
