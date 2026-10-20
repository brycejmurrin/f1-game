// Render every catalog option plus every team's factory preset through the
// @doc Renders every option of chosen part categories through `carview.html`; per-category contact sheets.
// @skill garage-parts-livery
// isolated car viewer. Requires a static server at http://127.0.0.1:3456.
//
//   node tools/car/audit-parts.mjs [--cats=engine,aero] [--team=mclaren]
//   node tools/car/audit-parts.mjs --body-styles=all --finishes=all
//   node tools/car/audit-parts.mjs --body-style=needle --finish=satin
//
// Output: scratch/renders/parts/<category>/ and parts/factory/
import { screenshotCard, renderGallery } from "../lib/screenshot-gallery.cjs";
import { launchChromium, shutdown } from "../lib/harness.mjs";
import { screenshotPresentedCanvas } from "../shot/probe-page.mjs";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertSafePathToken,
  resolveContainedChild,
  resolveRepoDefault,
} from "../lib/output-paths.mjs";
import { exitIfHelp, parseFlags } from "../lib/cli-args.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
// --help and a typo'd flag must answer before Chromium launches (#1708).
const ARGV = process.argv.slice(2);
exitIfHelp(ARGV, `usage: node tools/car/audit-parts.mjs [--cats=engine,aero] [--team=mclaren]
  [--body-styles=all|team,needle] [--finishes=all|gloss,satin]
  [--body-style=needle] [--finish=satin] [--designs=all|build-01,build-02] [--append]
  [--cats=none] [--wait=90] [--url=http://127.0.0.1:3456]
  Renders every catalog option of selected categories; optionally add independent
  body-shape and paint-finish surveys. --designs captures complete combinations
  of body, finish, palette and part selections. --append merges shots into the
  existing survey manifest. Output is under scratch/renders/parts/. Requires a
  static server; PW_CHROMIUM overrides Playwright's bundled Chromium.`);
const F = parseFlags(ARGV, ["--cats", "--team", "--url", "--body-styles", "--finishes", "--body-style", "--finish", "--designs", "--append", "--wait"]);
const arg = (key, fallback) => F.flag(`--${key}`, fallback);
const TEAM = assertSafePathToken(arg("team", "mclaren"), "team");
const URL = arg("url", "http://127.0.0.1:3456");
const WAIT_MS = Math.max(30_000, Number(arg("wait", "90")) * 1000);
const BODY_STYLE = arg("body-style", "team");
const FINISH = arg("finish", "team");
const CAT_VIEW = {
  engine:     { az: 322, el: 22, dist: 6.2, tod: "day" },
  aero:       { az: 38,  el: 18, dist: 6.4, tod: "day" },
  suspension: { az: 152, el: 6,  dist: 5.8, tod: "day" },
  brakes:     { az: 104, el: 8,  dist: 5.6, tod: "day" },
  tyres:      { az: 96,  el: 8,  dist: 5.8, tod: "day" },
  ers:        { az: 322, el: 16, dist: 5.6, tod: "dusk" },
  gearbox:    { az: 26,  el: 22, dist: 5.8, tod: "day" },
  fuel:       { az: 6,   el: 15, dist: 6.0, tod: "dusk" },
  // The tailpipe cluster reads from close behind and slightly above; the floor
  // fences and skids need a low angle from the side to clear the bodywork.
  exhaust:    { az: 10,  el: 12, dist: 4.6, tod: "dusk" },
  floor:      { az: 118, el: 4,  dist: 5.4, tod: "day" },
  cockpit:    { az: 148, el: 26, dist: 3.9, tod: "day" },
  wheels:     { az: 92,  el: 10, dist: 4.4, tod: "day" },
};
const catArg = arg("cats", Object.keys(CAT_VIEW).join(","));
const cats = catArg === "none" ? [] : catArg.split(",")
  .map((value) => assertSafePathToken(value.trim(), "category")).filter(Boolean);
const sheet = (title, cards) => renderGallery({ title,
  summary: `${cards.length} part views`,
  groups: [{ title: "Captured parts", cards: cards.map(({ file, label }) => screenshotCard({ title: label, image: file })) }],
});
async function setAndSettle(page, state) {
  const before = await page.evaluate(() => window.CARVIEW.frame);
  await page.evaluate((next) => window.CARVIEW.set(next), state);
  // CARVIEW.set rebuilds synchronously; one presented frame is enough to show
  // that state. Waiting eight more frames made software-rendered surveys spend
  // most of their time drawing identical frames.
  await page.evaluate(() => window.__surveyPump());
  await page.waitForFunction((frame) => window.CARVIEW.frame > frame, before, { polling: 100, timeout: WAIT_MS });
}
async function screenshot(page, file) {
  await screenshotPresentedCanvas(page, {
    path: file, skipAwait: true, forceCdp: true, timeout: WAIT_MS,
    clip: { x: 0, y: 0, width: 720, height: 560 },
  });
}

const browser = await launchChromium({
  timeout: 60_000,
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 560 } });
  // Render exactly one requested frame per variant. A free-running RAF loop
  // spends CPU drawing identical frames between screenshots on SwiftShader.
  await page.addInitScript(() => {
    const queued = [];
    let id = 0;
    window.requestAnimationFrame = (fn) => { queued.push(fn); return ++id; };
    window.__surveyPump = () => {
      const frame = queued.splice(0);
      const now = performance.now();
      for (const fn of frame) fn(now);
      return frame.length;
    };
  });
  page.on("pageerror", (error) => console.log("PAGEERR", error.message));
  await page.goto(`${URL}/tools/carview.html?team=${TEAM}&hud=0`, { waitUntil: "commit", timeout: WAIT_MS });
  await page.waitForFunction(() => window.CARVIEW, null, { polling: 100, timeout: WAIT_MS });
  await page.evaluate(() => GLX.setRenderScale?.(0.75));
  await page.evaluate(() => window.__surveyPump());
  // First software-rendered frame can take tens of seconds on CPU-only hosts.
  await page.waitForFunction(() => window.CARVIEW.ready, null, { polling: 100, timeout: WAIT_MS });

  const audit = await page.evaluate((fallbackTeam) => {
    const teams = Teams.LIST.filter((team) => Parts.FACTORY_PRESETS[team.id]);
    const byId = Object.fromEntries(teams.map((team) => [team.id, team]));
    const eligibleTeam = (option) => {
      if (option.teams && option.teams.length) return byId[option.teams[0]]?.id;
      if (option.team) return byId[option.team]?.id;
      const suppliers = option.suppliers || (option.supplier ? [option.supplier] : []);
      if (suppliers.length) return teams.find((team) => suppliers.includes(team.engine))?.id;
      return byId[fallbackTeam] ? fallbackTeam : teams[0].id;
    };
    return {
      defaults: { ...Parts.DEFAULTS },
      catalog: Object.fromEntries(Parts.CATALOG.map((category) => [
        category.id,
        category.options.map((option) => ({
          id: option.id,
          label: option.label,
          team: eligibleTeam(option),
        })),
      ])),
      factories: teams.map((team) => ({
        id: team.id,
        name: team.name,
        parts: Parts.getFactorySetup(team),
      })),
      bodyStyles: ["team", ...Car3D.BODY_STYLE_IDS],
      finishes: ["gloss", ...Object.keys(Car3D.FINISH_SURFACE)],
      palettes: LiveryDesign.PALETTES,
      renderer: (() => {
        const gl = document.getElementById("view")?.getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "WebGL2 renderer unavailable";
      })(),
      renderScale: GLX.getRenderScale?.() ?? 1,
    };
  }, TEAM);

  const parseSelection = (raw, known, flag) => {
    if (!raw) return [];
    const values = raw === "all" ? known : raw.split(",").map((x) => x.trim()).filter(Boolean);
    const unknown = values.filter((x) => !known.includes(x));
    if (unknown.length) throw new Error(`Unknown ${flag}: ${unknown.join(", ")}\nAvailable: ${known.join(", ")}`);
    return [...new Set(values)];
  };
  if (!audit.bodyStyles.includes(BODY_STYLE)) throw new Error(`Unknown --body-style=${BODY_STYLE}\nAvailable: ${audit.bodyStyles.join(", ")}`);
  if (FINISH !== "team" && !audit.finishes.includes(FINISH)) throw new Error(`Unknown --finish=${FINISH}\nAvailable: team, ${audit.finishes.join(", ")}`);
  const bodySweeps = parseSelection(arg("body-styles", null), audit.bodyStyles, "body style");
  const finishSweeps = parseSelection(arg("finishes", null), audit.finishes, "finish");
  const designIds = Array.from({ length: 36 }, (_, i) => `build-${String(i + 1).padStart(2, "0")}`);
  const designSweeps = parseSelection(arg("designs", null), designIds, "design");
  const variant = {};
  if (BODY_STYLE !== "team") variant.bodyStyle = BODY_STYLE;
  if (FINISH !== "team") variant.finish = FINISH;
  const partLivery = Object.keys(variant).length ? variant : null;
  const survey = {
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    tool: "tools/car/audit-parts.mjs",
    renderer: audit.renderer,
    renderScale: audit.renderScale,
    browser: "Chromium · SwiftShader",
    viewport: { width: 720, height: 560 },
    team: TEAM, bodyStyle: BODY_STYLE, finish: FINISH,
    bodyStyles: audit.bodyStyles, finishes: audit.finishes,
    views: CAT_VIEW,
    shots: [],
  };
  const partsRoot = resolveRepoDefault(ROOT, "scratch", "renders", "parts");
  const manifestPath = resolveContainedChild(partsRoot, "survey.json", "parts survey manifest");
  if (F.has("--append") && existsSync(manifestPath)) {
    const previous = JSON.parse(readFileSync(manifestPath, "utf8"));
    survey.shots = Array.isArray(previous.shots) ? previous.shots : [];
  }

  for (const cat of cats) {
    const view = CAT_VIEW[cat];
    const options = audit.catalog[cat];
    if (!view || !options) throw new Error(`Unknown parts category: ${cat}`);
    const dir = resolveRepoDefault(ROOT, "scratch", "renders", "parts", cat);
    mkdirSync(dir, { recursive: true });
    const cards = [];
    for (const option of options) {
      if (!option.team) throw new Error(`No eligible team found for ${cat}:${option.id}`);
      const parts = { ...audit.defaults, [cat]: option.id };
      await setAndSettle(page, {
        team: option.team, livery: partLivery, colors: null, parts,
        az: view.az, el: view.el, dist: view.dist, tod: view.tod,
      });
      const file = `${BODY_STYLE === "team" ? "" : `${assertSafePathToken(BODY_STYLE, "body style")}--`}${FINISH === "team" ? "" : `${assertSafePathToken(FINISH, "finish")}--`}${assertSafePathToken(option.id, "option")}.png`;
      await screenshot(page, resolveContainedChild(dir, file, "parts audit shot"));
      const label = `${option.label} · ${option.team}${BODY_STYLE === "team" ? "" : ` · ${BODY_STYLE} body`}${FINISH === "team" ? "" : ` · ${FINISH} finish`}`;
      cards.push({ file, label });
      survey.shots.push({ group: cat, id: option.id, label, file: `parts/${cat}/${file}` });
    }
    writeFileSync(resolveContainedChild(dir, "index.html", "parts audit index"), sheet(`${cat} parts`, cards));
    console.log(`  ${cat}: ${cards.length} options`);
  }

  if (bodySweeps.length) {
    const dir = resolveRepoDefault(ROOT, "scratch", "renders", "parts", "body-styles");
    mkdirSync(dir, { recursive: true });
    const cards = [];
    for (const bodyStyle of bodySweeps) {
      await setAndSettle(page, {
        team: TEAM,
        livery: bodyStyle === "team" ? null : { bodyStyle },
        colors: [[0.72, 0.75, 0.78], [0.08, 0.2, 0.28]],
        parts: audit.defaults,
        az: 40, el: 16, dist: 6.4, tod: "day",
      });
      const file = `${assertSafePathToken(bodyStyle, "body style")}.png`;
      await screenshot(page, resolveContainedChild(dir, file, "body style survey shot"));
      const label = bodyStyle === "team" ? `${TEAM} chassis` : bodyStyle;
      cards.push({ file, label });
      survey.shots.push({ group: "body-styles", id: bodyStyle, label, file: `parts/body-styles/${file}` });
    }
    writeFileSync(resolveContainedChild(dir, "index.html", "body style survey index"), sheet("body shape styles", cards));
    console.log(`  body-styles: ${cards.length} renders`);
  }

  if (finishSweeps.length) {
    const dir = resolveRepoDefault(ROOT, "scratch", "renders", "parts", "finishes");
    mkdirSync(dir, { recursive: true });
    const cards = [];
    for (const finish of finishSweeps) {
      await setAndSettle(page, {
        team: TEAM,
        livery: { finish },
        colors: [[0.72, 0.75, 0.78], [0.08, 0.2, 0.28]],
        parts: audit.defaults,
        az: 40, el: 16, dist: 6.4, tod: "day",
      });
      const file = `${assertSafePathToken(finish, "finish")}.png`;
      await screenshot(page, resolveContainedChild(dir, file, "finish survey shot"));
      cards.push({ file, label: finish });
      survey.shots.push({ group: "finishes", id: finish, label: finish, file: `parts/finishes/${file}` });
    }
    writeFileSync(resolveContainedChild(dir, "index.html", "finish survey index"), sheet("paint finishes", cards));
    console.log(`  finishes: ${cards.length} renders`);
  }

  if (designSweeps.length) {
    const dir = resolveRepoDefault(partsRoot, "builds");
    mkdirSync(dir, { recursive: true });
    const cards = [];
    const bodyChoices = audit.bodyStyles.filter((id) => id !== "team");
    const hexRgb = (hex) => {
      const value = hex.replace(/^#/, "");
      return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255);
    };
    const designs = designSweeps.map((id) => {
      const index = Number(id.slice("build-".length)) - 1;
      const palette = audit.palettes[index % audit.palettes.length];
      const bodyStyle = bodyChoices[(index * 7) % bodyChoices.length];
      const finish = audit.finishes[(index * 5) % audit.finishes.length];
      const parts = { ...audit.defaults };
      const selectedParts = {};
      for (const [category, options] of Object.entries(audit.catalog)) {
        const optionIndex = Math.floor(index * options.length / designIds.length);
        const option = options[optionIndex];
        parts[category] = option.id;
        selectedParts[category] = { id: option.id, label: option.label };
      }
      return { id, index, palette, bodyStyle, finish, parts, selectedParts };
    });
    for (const design of designs) {
      const colors = design.palette.colors;
      const livery = { bodyStyle: design.bodyStyle, finish: design.finish, accent: colors[2] };
      await setAndSettle(page, {
        team: TEAM, livery, colors: [hexRgb(colors[0]), hexRgb(colors[1])], parts: design.parts,
        az: 40, el: 16, dist: 6.4, tod: "day",
      });
      const file = `${design.id}.png`;
      await screenshot(page, resolveContainedChild(dir, file, "complete design survey shot"));
      const label = `${String(design.index + 1).padStart(2, "0")} · ${design.palette.name} · ${design.bodyStyle} · ${design.finish}`;
      cards.push({ file, label });
      survey.shots.push({ group: "builds", id: design.id, label, file: `parts/builds/${file}`, palette: design.palette, bodyStyle: design.bodyStyle, finish: design.finish, parts: design.selectedParts });
    }
    writeFileSync(resolveContainedChild(dir, "index.html", "complete designs survey index"), sheet("complete livery and parts builds", cards));
    console.log(`  builds: ${cards.length} renders`);
  }

  const factoryDir = resolveRepoDefault(ROOT, "scratch", "renders", "parts", "factory");
  mkdirSync(factoryDir, { recursive: true });
  const factoryCards = [];
  const liveries = [
    { id: "light", colors: [[0.88, 0.9, 0.94], [0.22, 0.25, 0.3]] },
    { id: "dark", colors: [[0.035, 0.045, 0.06], [0.3, 0.34, 0.4]] },
  ];
  for (const factory of audit.factories) {
    for (const livery of liveries) {
      await setAndSettle(page, {
        team: factory.id, livery: null, colors: livery.colors, parts: factory.parts,
        az: 40, el: 16, dist: 6.4, tod: "day",
      });
      const file = `${assertSafePathToken(factory.id, "factory team")}-${livery.id}.png`;
      await screenshot(page, resolveContainedChild(factoryDir, file, "factory audit shot"));
      const label = `${factory.name} · ${livery.id}`;
      factoryCards.push({ file, label });
      survey.shots.push({ group: "factory", id: `${factory.id}-${livery.id}`, label, file: `parts/factory/${file}` });
    }
  }
  writeFileSync(resolveContainedChild(factoryDir, "index.html", "factory audit index"), sheet("factory presets · light / dark", factoryCards));
  console.log(`  factory: ${factoryCards.length} renders`);
  const effectsDir = resolveRepoDefault(ROOT, "scratch", "renders", "parts", "effects");
  mkdirSync(effectsDir, { recursive: true });
  const effectCards = [];
  for (const preset of [
    { id: "after-fire", label: "Throttle-lift after-fire", effects: { exhaustFlame: true, brakeGlow: false, ersDeploy: false } },
    { id: "brake-heat", label: "Hot brake rotors", effects: { exhaustFlame: false, brakeGlow: true, ersDeploy: false } },
    { id: "ers-deploy", label: "Electric ERS deployment", effects: { exhaustFlame: false, brakeGlow: false, ersDeploy: true } },
  ]) {
    await setAndSettle(page, {
      team: TEAM, colors: null, parts: audit.defaults,
      az: 18, el: 10, dist: 4.8, look: -1.3, tod: "dusk", effects: preset.effects,
    });
    const file = `${preset.id}.png`;
    await screenshot(page, resolveContainedChild(effectsDir, file, "effects audit shot"));
    effectCards.push({ file, label: preset.label });
    survey.shots.push({ group: "effects", id: preset.id, label: preset.label, file: `parts/effects/${file}` });
  }
  writeFileSync(resolveContainedChild(effectsDir, "index.html", "effects audit index"),
    sheet("grounded runtime effects", effectCards));
  console.log(`  effects: ${effectCards.length} renders`);
  mkdirSync(partsRoot, { recursive: true });
  survey.shots = [...new Map(survey.shots.map((shot) => [`${shot.group}/${shot.id}`, shot])).values()];
  writeFileSync(resolveContainedChild(partsRoot, "survey.json", "parts survey manifest"), JSON.stringify(survey, null, 2) + "\n");
  console.log("done -> scratch/renders/parts/");
} finally {
  await shutdown();
}
