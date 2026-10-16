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

test("filterResumeShots and findings helpers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-survey-"));
  const plan = buildTrackShotSurveyPlan({ preset: "lap", label: "r" });
  fs.writeFileSync(path.join(dir, `${plan.shots[0].name}.png`), "x");
  const { pending, resumed } = filterResumeShots(dir, plan.shots, true);
  assert.equal(resumed.length, 1);
  assert.equal(pending.length, 3);
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
