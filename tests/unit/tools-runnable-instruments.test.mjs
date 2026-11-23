/* tools-runnable-instruments.test.mjs — the survey, capture, AI and profile
 * instruments keep their contracts: retired forwarders stay gone, the AI
 * instruments take --wear into the VM storage seed, and profile waits honour
 * APEX_PROFILE_WAIT_MS. Split out of tools-runnable.test.mjs (#3043 T5-12),
 * assertions unchanged.
 *
 * Run: node --test tests/unit/tools-runnable-instruments.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse } from "espree";
import { ROOT, FILES, tool } from "../helpers/tools-tree.mjs";

test("aerial-survey.mjs is folded into survey-track --oblique", async () => {
  assert.equal(FILES.some((f) => f.rel.endsWith("aerial-survey.mjs")), false,
    "aerial-survey.mjs must be gone — its N/E/S/W obliques live on survey-track --oblique");
  const src = fs.readFileSync(tool("survey-track.mjs"), "utf8");
  assert.match(src, /--oblique/);
  assert.match(src, /oblique\$\{name\}/);
  assert.match(src, /dirs = \{ N: 0, E:/);
  const { parseSurveyTrackArgs } = await import("../../tools/track/survey-track.mjs");
  const mid = parseSurveyTrackArgs(["monaco", "--oblique", "0.1,0.5"]);
  assert.equal(mid.id, "monaco");
  assert.equal(mid.label, "survey");
  assert.deepEqual(mid.fracs, [0.1, 0.5]);
  assert.equal(mid.oblique, true);
  const front = parseSurveyTrackArgs(["--oblique", "monaco", "0.1,0.5"]);
  assert.deepEqual(front.fracs, [0.1, 0.5]);
  const labeled = parseSurveyTrackArgs(["monaco", "before", "0.1,0.5", "--oblique"]);
  assert.equal(labeled.label, "before");
  assert.deepEqual(labeled.fracs, [0.1, 0.5]);
});

test("capture/shot.mjs clips the presented canvas instead of locator.screenshot", () => {
  // locator.screenshot waits for element stability AND reads opacity-0 #game
  // on HeadlessChrome GLX. survey-track / shot.mjs share screenshotPresentedCanvas.
  const src = fs.readFileSync(tool("shot.mjs"), "utf8");
  assert.match(src, /screenshotPresentedCanvas/);
  assert.match(src, /timeout:\s*60000/);
  assert.doesNotMatch(src, /locator\("canvas#game"\)\.screenshot/);
  const callers = [...src.matchAll(/(\w+)\.screenshot\(/g)].map((m) => m[1]);
  assert.ok(callers.every((n) => n === "page"),
    `screenshot callers must be page, got: ${callers.join(",")}`);
  assert.match(src, /from ["']\.{1,2}\/(?:lib\/)?harness\.mjs["']/);
  assert.match(src, /shot-jobs\.mjs/, "batch / jpeg / raster parse stays extracted");
  assert.match(src, /groupJobsByTrack/, "one Chromium reuses race() per track");
});

test("WGX validator distinguishes frame counts from circuit names before launching", () => {
  const run = (...args) => {
    const started = performance.now();
    const r = spawnSync(process.execPath, [tool("wgx-validate.mjs"), "--static", ...args], { cwd: ROOT, encoding: "utf8", timeout: 10000 });
    const detail = JSON.stringify({ args, elapsedMs: Math.round(performance.now() - started), status: r.status, signal: r.signal,
      error: r.error ? { code: r.error.code, message: r.error.message } : null, stdout: r.stdout, stderr: r.stderr });
    assert.equal(r.error, undefined, detail);
    assert.equal(r.signal, null, detail);
    return { ...r, detail };
  };
  for (const args of [["--frames", "2"], ["--frames=2"], ["--frames", "2", "monza"], ["monza", "--frames", "2"]]) {
    const r = run(...args);
    assert.equal(r.status, 0, r.detail);
    const result = JSON.parse(r.stdout);
    assert.equal(result.track, args.includes("monza") ? "monza" : "montreal");
    assert.equal(result.frames, 2);
  }
  for (const args of [["--frames"], ["--frames", "0"], ["--frames", "2junk"], ["--frames", "1.5"], ["--unknown"], ["monza", "montreal"]]) {
    const r = run(...args);
    assert.equal(r.status, 1, r.detail);
  }
});

// The wgx-shot gallery test that stood here (and the wgx-validate --static
// smoke case above) covered tools that left for tools/gfx/ in the
// 2026-09-03 spike-out. They are not shipped tools any more, so this shipped
// guard has nothing to say about them; they travel with the backend.

test("the survey forwarders are gone — layout-audit --survey is the entry point", () => {
  // Two stacked forwarders (ui-mcp-survey.mjs -> ui-survey.mjs -> layout-audit
  // --survey) with nothing calling either: package.json's `ui:survey` already
  // names layout-audit.mjs. The recipe they encoded lives in layout-audit.
  for (const gone of ["ui-survey.mjs", "ui-mcp-survey.mjs"])
    assert.equal(FILES.some((f) => f.rel.endsWith(gone)), false, `${gone} must stay gone`);
  const audit = FILES.find((f) => f.rel.endsWith("layout-audit.mjs"));
  assert.ok(audit, "layout-audit.mjs missing from the walk");
  const src = fs.readFileSync(audit.abs, "utf8");
  assert.match(src, /--survey/);
  assert.match(src, /ios-iphone-landscape/);
});

// ── the AI instruments' --wear flag ─────────────────────────────────────────
// tools/lib/game-vm.cjs seeds `tyreWear: "off"`, but the shipped default
// (js/data/settings-defaults.js) is "real". Nothing said so, and the
// consequence was that AiDrive.stintPlan / pitNow / compoundFor / degCost and
// pits.think were INERT in all four AI instruments: every strategy number they
// ever printed was a no-wear number, silently. `--wear off|light|real` is the
// opt-in that makes the seam measurable, and these guard both halves of it —
// that the flag exists and reaches createGame, and that the DEFAULT is still
// off so the tables in docs/notes/AI-FIELD-RESEARCH.md stay reproducible.
// Race instruments (boot the VM). ai-ratings.mjs is data-only and is pinned
// separately — it must NOT invent a --wear flag that does nothing.
const AI_INSTRUMENTS = ["ai-pace.mjs", "ai-field.mjs", "ai-tactics.mjs", "ai-line.mjs", "ai-human.mjs", "ai-band.mjs"];

test("every AI instrument takes --wear and passes it into the VM's storage seed", () => {
  for (const name of AI_INSTRUMENTS) {
    const src = fs.readFileSync(tool(name), "utf8");
    assert.match(src, /wearArg\s*\(\s*argv\s*\)/, `${name}: does not read the --wear flag`);
    // The seam is the storage seed: game-vm's own `tyreWear: "off"` default is
    // overridden per-call, so a tool that parses the flag and forgets to pass
    // it would print "wear real" over a race with wear off.
    assert.match(src, /createGame\(\{[^}]*storage:\s*\{[^}]*tyreWear:\s*WEAR/,
      `${name}: --wear never reaches createGame's storage seed`);
  }
});

test("ai-ratings is data-only (no race, no --wear) and ai-race dispatches it", () => {
  const ratings = fs.readFileSync(tool("ai-ratings.mjs"), "utf8");
  assert.doesNotMatch(ratings, /wearArg/, "ratings must not pretend to take --wear");
  assert.doesNotMatch(ratings, /createGame/, "ratings must not boot the race VM");
  assert.match(ratings, /correlationMatrix|pearson/i, "ratings must compute correlations");
  const dispatch = fs.readFileSync(tool("ai-race.mjs"), "utf8");
  assert.match(dispatch, /ratings:\s*"ai-ratings\.mjs"/);
  assert.match(dispatch, /band:\s*"ai-band\.mjs"/);
  assert.match(dispatch, /tactics:\s*"ai-tactics\.mjs"/);
});

// THE PARKED PLAYER. The VM's player has no input, so every AI-only instrument
// raced around it sitting on its grid box (attacked 7-10x a race). The field
// instruments take it OUT with game-vm's aiOnly(); this pins that they do.
test("the AI-only field instruments take the player out of the field (aiOnly)", () => {
  for (const name of ["ai-pace.mjs", "ai-field.mjs", "ai-tactics.mjs"]) {
    assert.match(fs.readFileSync(tool(name), "utf8"), /\.aiOnly\(\)/, `${name}: races around a parked player`);
  }
});

test("--wear defaults to off, and a bad level is refused rather than defaulted", async () => {
  const { wearArg, WEAR_LEVELS } = await import("../../tools/lib/cli-args.mjs");
  assert.deepEqual(WEAR_LEVELS, ["off", "light", "real"], "must match TyreModel.LEVELS");
  assert.equal(wearArg([]), "off", "the default moved — recorded AI numbers assume wear off");
  assert.equal(wearArg(["--track", "monza"]), "off");
  for (const v of WEAR_LEVELS) {
    assert.equal(wearArg(["--wear", v]), v);
    assert.equal(wearArg([`--wear=${v}`]), v);
  }
  // A typo must not race on the default: an instrument that quietly measured
  // no-wear under a "--wear=lite" heading is the whole defect again.
  for (const bad of [["--wear", "lite"], ["--wear=REAL"], ["--wear"], ["--wear", "--json"]]) {
    const r = spawnSync(process.execPath,
      ["-e", `import("./tools/lib/cli-args.mjs").then(m=>m.wearArg(${JSON.stringify(bad)}))`],
      { cwd: ROOT, encoding: "utf8", timeout: 10000 });
    assert.equal(r.status, 1, `wearArg accepted ${bad.join(" ")}`);
    assert.match(r.stderr, /--wear: expected one of off\|light\|real/);
  }
});

test("the game's shipped tyreWear default is not 'off' (so off must be opt-in, not inherited)", () => {
  // The premise of the flag. If the game ever ships "off" as the default, the
  // instruments and the product agree by accident and this comment is wrong.
  // Read the OWNER file: store.get's _def() answers tyreWear from
  // js/data/settings-defaults.js, so game.js's call-site literal decides
  // nothing (this test used to pin that literal, "light", while "real" shipped).
  const src = fs.readFileSync(path.join(ROOT, "js/data/settings-defaults.js"), "utf8");
  const m = src.match(/"tyreWear":\s*"(\w+)"/);
  assert.ok(m, "js/data/settings-defaults.js no longer lists tyreWear — re-read tools/lib/cli-args.mjs wearArg");
  assert.ok(["light", "real"].includes(m[1]),
    `shipped tyreWear is ${m[1]} — re-read tools/lib/cli-args.mjs wearArg`);
});

test("occlusion-estimate resolves game-vm and --help exits without booting it", () => {
  // ROOT was briefly one level too shallow (tools/check → tools), then joined
  // tools/lib again, so createGame could not load. Pin the "../.." form and a
  // side-effect-free --help before the VM boot.
  const src = fs.readFileSync(tool("occlusion-estimate.mjs"), "utf8");
  assert.match(src, /dirname\(fileURLToPath\(import\.meta\.url\)\),\s*"\.\.\/\.\."\)/);
  assert.ok(fs.existsSync(path.join(ROOT, "tools/lib/game-vm.cjs")));
  const r = spawnSync(process.execPath, [tool("occlusion-estimate.mjs"), "--help"],
    { encoding: "utf8", cwd: ROOT, timeout: 10000 });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "usage: node tools/check/occlusion-estimate.mjs [track] [cameras]\nenv:   OCC_W OCC_H  (default 256x144)\n");
});

test("profile-gameloop.mjs: page-ready waits come from APEX_PROFILE_WAIT_MS, never below 20 s", () => {
  const src = fs.readFileSync(tool("profile-gameloop.mjs"), "utf8");
  assert.match(src, /APEX_PROFILE_WAIT_MS/);
  assert.doesNotMatch(src, /timeout:\s*20000/, "a literal 20 s wait would ignore the env override");
  assert.equal((src.match(/timeout:\s*WAIT_MS/g) || []).length, 2, "both waitForFunction calls use WAIT_MS");
});

test("profile.mjs: page-ready waits (spans/hitch/trace/step) honour APEX_PROFILE_WAIT_MS, never below 30 s", () => {
  const src = fs.readFileSync(path.join(ROOT, "tools/perf/profile.mjs"), "utf8");
  const ast = parse(src, { ecmaVersion: "latest", sourceType: "module", range: true });
  const waits = [];
  let budget;
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator" && node.id.name === "WAIT_MS") budget = node.init;
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "waitForFunction") waits.push(node);
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(visit);
      else if (value && typeof value === "object") visit(value);
    }
  }
  visit(ast);
  assert.ok(budget && waits.length, "the shared readiness path must have a configured wait");
  const timeoutFor = new Function("process", `return ${src.slice(...budget.range)};`);
  for (const [value, expected] of [[undefined, 30000], ["bad", 30000], ["0", 30000], ["1000", 30000], ["60000", 60000]]) {
    assert.equal(timeoutFor({ env: { APEX_PROFILE_WAIT_MS: value } }), expected, `wait budget for ${value}`);
  }
  for (const wait of waits) {
    const options = wait.arguments.at(-1);
    const timeout = options.type === "ObjectExpression" && options.properties.find(p => p.key.name === "timeout");
    assert.equal(timeout?.value.type, "Identifier", "each page/track wait reads the configured budget");
    assert.equal(timeout.value.name, "WAIT_MS", "shared helpers must retain the same timeout contract");
  }
});
