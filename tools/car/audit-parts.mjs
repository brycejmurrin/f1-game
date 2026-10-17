// Render every catalog option plus every team's factory preset through the
// @doc Renders every option of chosen part categories through `carview.html`; per-category contact sheets.
// @skill garage-parts-livery
// isolated car viewer. Requires a static server at http://127.0.0.1:3456.
//
//   node tools/car/audit-parts.mjs [--cats=engine,aero] [--team=mclaren]
//
// Output: scratch/renders/parts/<category>/ and parts/factory/
import { screenshotCard, renderGallery } from "../lib/screenshot-gallery.cjs";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
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
exitIfHelp(ARGV, `usage: node tools/car/audit-parts.mjs [--cats=engine,aero] [--team=mclaren] [--url=http://127.0.0.1:3456]
  Renders every catalog option of each category (and every factory preset)
  through tools/carview.html into scratch/renders/parts/. Needs a static server
  on --url and launches Chromium (PW_CHROMIUM overrides the executable).`);
const F = parseFlags(ARGV, ["--cats", "--team", "--url"]);
const arg = (key, fallback) => F.flag(`--${key}`, fallback);
const TEAM = assertSafePathToken(arg("team", "mclaren"), "team");
const URL = arg("url", "http://127.0.0.1:3456");
const EXE = process.env.PW_CHROMIUM;
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
const cats = arg("cats", Object.keys(CAT_VIEW).join(",")).split(",")
  .map((value) => assertSafePathToken(value.trim(), "category")).filter(Boolean);
const sheet = (title, cards) => renderGallery({ title,
  summary: `${cards.length} part views`,
  groups: [{ title: "Captured parts", cards: cards.map(({ file, label }) => screenshotCard({ title: label, image: file })) }],
});
async function setAndSettle(page, state) {
  const before = await page.evaluate(() => window.CARVIEW.frame);
  await page.evaluate((next) => window.CARVIEW.set(next), state);
  await page.waitForFunction((frame) => window.CARVIEW.frame >= frame + 8, before);
}

const browser = await chromium.launch({
  ...(EXE ? { executablePath: EXE } : {}),
  args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 560 } });
  page.on("pageerror", (error) => console.log("PAGEERR", error.message));
  await page.goto(`${URL}/tools/carview.html?team=${TEAM}&hud=0`, { waitUntil: "load" });
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { timeout: 15_000 });

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
    };
  }, TEAM);

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
        team: option.team, colors: null, parts,
        az: view.az, el: view.el, dist: view.dist, tod: view.tod,
      });
      const file = `${assertSafePathToken(option.id, "option")}.png`;
      await page.screenshot({ path: resolveContainedChild(dir, file, "parts audit shot") });
      cards.push({ file, label: `${option.label} · ${option.team}` });
    }
    writeFileSync(resolveContainedChild(dir, "index.html", "parts audit index"), sheet(`${cat} parts`, cards));
    console.log(`  ${cat}: ${cards.length} options`);
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
      await page.screenshot({ path: resolveContainedChild(factoryDir, file, "factory audit shot") });
      factoryCards.push({ file, label: `${factory.name} · ${livery.id}` });
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
    await page.screenshot({ path: resolveContainedChild(effectsDir, file, "effects audit shot") });
    effectCards.push({ file, label: preset.label });
  }
  writeFileSync(resolveContainedChild(effectsDir, "index.html", "effects audit index"),
    sheet("grounded runtime effects", effectCards));
  console.log(`  effects: ${effectCards.length} renders`);
  console.log("done -> scratch/renders/parts/");
} finally {
  await browser.close();
}
