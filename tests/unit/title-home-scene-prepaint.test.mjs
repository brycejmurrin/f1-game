/* title-home-scene-prepaint.test.mjs — live Home grid must not wait for experience.js.
 *
 * Run: node --test tests/unit/title-home-scene-prepaint.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(import.meta.url);
const MANIFEST = require("../../tools/manifest.cjs");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const menus = fs.readFileSync(path.join(ROOT, "css/menus.css"), "utf8");

const TITLE_CRITICAL = [
  "css/tokens.css", "css/components.css", "css/title.css", "css/menus.css",
  "css/responsive.css",
];

test("pre-paint script stamps html[data-home-scene] from apex26.homeScene", () => {
  assert.match(html, /apex26\.homeScene/);
  assert.match(html, /document\.documentElement\.setAttribute\("data-home-scene"/);
  assert.match(html, /setAttribute\("data-home-live", "1"\)/);
  assert.match(html, /hsMode === "auto"[\s\S]*apex26\.homeVisit[\s\S]*hsMode = envs\[/);
});

test("live Home grid geometry lives in blocking css/menus.css", () => {
  const blocking = TITLE_CRITICAL
    .map((f) => fs.readFileSync(path.join(ROOT, f), "utf8")).join("\n");
  assert.match(
    blocking,
    /html\[data-home-live\] #overlay #menu-buttons[\s\S]*grid-column:\s*2/,
    "wide live Home puts #menu-buttons in column 2 before experience.css loads",
  );
  assert.match(
    blocking,
    /html\[data-home-live\] #overlay[\s\S]*transform:\s*none/,
    "live Home clears skewed .bigbtn transforms in the blocking set",
  );
  assert.match(
    blocking,
    /html\[data-home-live\][\s\S]*#title-car \{ display: none;/,
    "tall live Home hides #title-car in blocking CSS before data-home-ready",
  );
  assert.equal(MANIFEST.CSS_DEFERRED.includes("css/experience.css"), true);
  assert.doesNotMatch(
    menus,
    /grid-column:\s*2[\s\S]*@layer overlays/,
    "menus.css home-scene block is not deferred into overlays layer",
  );
});

test("compact-wide live Home grid-places #menu-secondary under the door stack", () => {
  // Source pin: #menu-buttons spans the overlay with subgrid so #menu-secondary
  // can sit under #menu-brand while remaining the title scroll box (no DOM move).
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-buttons \{[\s\S]*grid-template-columns:\s*subgrid/,
    "subgrids door groups onto the overlay columns",
  );
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-buttons \{[\s\S]*overflow-y:\s*auto/,
    "keeps #menu-buttons as the title scroll box",
  );
  assert.doesNotMatch(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-buttons \{[^}]*display:\s*contents/,
    "display:contents drops the scroll box (ui-scale @200% / SE hit tests)",
  );
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \{[\s\S]*grid-column:\s*2;[\s\S]*grid-row:\s*5;[\s\S]*min-height:\s*var\(--tap\)/,
    "parks #menu-secondary as the bottom row of the door column (Oct 6 look) with a --tap floor (#1537: height auto for 2-line labels)",
  );
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \.bigbtn \{[\s\S]*min-height:\s*var\(--tap-paint\)/,
    "under-brand rooms keep the --tap-paint floor",
  );
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \.bigbtn \{[\s\S]*white-space:\s*normal/,
    "#1537: under-brand rooms wrap (TRACK DESIGNER / HOW TO PLAY) instead of nowrap-clip",
  );
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \.bigbtn \{[\s\S]*justify-content:\s*flex-start/,
    "under-brand room icons stay on the leading edge (not clipped by center+overflow)",
  );
  assert.match(
    menus,
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-buttons \{[\s\S]*padding-inline:\s*var\(--gap\)/,
    "CAREER skew tip clears #menu-buttons overflow-x via inline pad",
  );
  const secondaryBlock = menus.match(
    /:where\(body\[data-shape="wide"\]\[data-density="compact"\]\) #overlay #menu-secondary \{[^}]+\}/,
  );
  assert.ok(secondaryBlock, "compact-wide #menu-secondary rule block exists");
  assert.match(secondaryBlock[0], /display:\s*flex/, "rooms stay a visible flex row");
  assert.doesNotMatch(secondaryBlock[0], /display:\s*none/);
});

test("portrait live Home #menu-buttons is tall before data-home-ready", async () => {
  const chrome = process.env.APEX_CHROME || "/usr/local/bin/google-chrome";
  if (!fs.existsSync(chrome)) return;
  // Ephemeral port — fixed :3456 races other tooling-fast / serve jobs.
  const { startStaticServer, launchChromium, shutdown } = await import("../../tools/lib/harness.mjs");
  const srv = await startStaticServer(ROOT);
  let browser;
  try {
    browser = await launchChromium({
      executablePath: chrome,
      args: ["--use-angle=swiftshader-webgl", "--disable-dev-shm-usage"],
    });
    const page = await browser.newPage({ viewport: { width: 393, height: 659 } });
    await page.goto(srv.url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForSelector("#menu-buttons");
    const metrics = await page.evaluate(() => new Promise((resolve) => {
      const read = () => {
        const el = document.getElementById("menu-buttons");
        const overlay = document.getElementById("overlay");
        const car = document.getElementById("title-car");
        return {
          clientHeight: el?.clientHeight ?? 0,
          scrollHeight: el?.scrollHeight ?? 0,
          homeLive: document.documentElement.getAttribute("data-home-live"),
          homeReady: overlay?.getAttribute("data-home-ready"),
          titleCarDisplay: car ? getComputedStyle(car).display : "",
        };
      };
      setTimeout(() => resolve(read()), 3000);
    }));
    assert.equal(metrics.homeLive, "1");
    assert.equal(metrics.titleCarDisplay, "none");
    assert.ok(metrics.clientHeight >= 280,
      `#menu-buttons clientHeight ${metrics.clientHeight} want >= 280 (scroll ${metrics.scrollHeight})`);
  } finally {
    await Promise.allSettled([browser?.close(), srv.close()]);
    await shutdown();
  }
});

test("experience.js keeps html and #overlay home-scene stamps aligned", () => {
  const experience = fs.readFileSync(path.join(ROOT, "js/ui/experience.js"), "utf8");
  assert.match(
    experience,
    /document\.documentElement\.dataset\.homeScene = s\.mode;[\s\S]*dataset\.homeLive = "1";[\s\S]*overlay\.dataset\.homeScene = s\.mode;/,
  );
});

// ── W8: the pre-paint copy must give the answers the deferred modules give ──
const block = (start, end) => {
  const a = html.indexOf(start), b = html.indexOf(end, a);
  assert.ok(a > 0 && b > a, "inline block present: " + start);
  return html.slice(a, b + end.length);
};
const lsFrom = (stored) => ({ getItem: (k) => (k.startsWith("apex26.") && k.slice(7) in stored ? stored[k.slice(7)] : null) });
const rootEl = (attrs = {}) => {
  const style = {};
  const dataset = { ...attrs };
  return { dataset, _style: style, className: "",
    style: { setProperty: (k, v) => { style[k] = String(v); }, removeProperty: (k) => { delete style[k]; }, getPropertyValue: (k) => style[k] || "" },
    getAttribute: (k) => dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] ?? null,
    setAttribute: (k, v) => { dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = String(v); },
    removeAttribute: (k) => { delete dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())]; } };
};
const staticHtmlData = () => {
  const tag = html.match(/<html\b[^>]*>/)[0], out = {};
  for (const [, k, v] of tag.matchAll(/data-([\w-]+)="([^"]*)"/g)) out[k.replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
  return out;
};
function loadDefaults() {
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/data/settings-defaults.js"), "utf8") + ";globalThis.D=SettingsDefaults;", c, { filename: absSrc("js/data/settings-defaults.js") });
  return c.D;
}
// The real module over a real-shaped store (store.js _def: SettingsDefaults on a miss).
function moduleAnswer(stored) {
  const D = loadDefaults(), de = rootEl();
  const miss = (k, d) => (D.has(k) ? D.get(k) : d);
  const store = { get: (k, d) => { if (!(k in stored)) return miss(k, d); try { return JSON.parse(stored[k]); } catch { return miss(k, d); } }, set() {} };
  const sb = { GameStore: { store }, document: { documentElement: de, readyState: "loading", addEventListener() {}, getElementById: () => null, querySelectorAll: () => [] },
    window: { matchMedia: () => ({ matches: false }) }, getComputedStyle: () => null };
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/appearance-opts.js"), "utf8"), vm.createContext(sb), { filename: absSrc("js/ui/appearance-opts.js") });
  return de;
}
const APPEARANCE = () => block("// Appearance (Bryce", "/* AppearanceOpts / UiScale answer at eval */ }");
function inlineAnswer(stored) {
  const de = rootEl(staticHtmlData());
  vm.runInContext(APPEARANCE(), vm.createContext({ localStorage: lsFrom(stored), document: { documentElement: de }, JSON, String, Math, isFinite }), { filename: absSrc("index.html") });
  return de;
}
const PICK = ["uiTheme", "menuAccent", "textSize", "uiContrast", "cvd"];
const pick = (de) => Object.fromEntries(PICK.map((k) => [k, de.dataset[k] ?? null]));

test("<html> ships the shipped appearance answers statically (SettingsDefaults / AppearanceOpts on an empty store)", () => {
  const D = loadDefaults(), s = staticHtmlData();
  for (const [attr, key] of [["menuAccent", "menuAccent"], ["textSize", "textSize"], ["uiContrast", "uiContrast"]]) {
    assert.ok(D.has(key), key + " is a SettingsDefaults key");
    assert.equal(s[attr], D.get(key), attr + " equals SettingsDefaults." + key);
  }
  assert.deepEqual(pick(rootEl(s)), pick(moduleAnswer({})), "and equals what AppearanceOpts paints with nothing stored");
});

test("the pre-paint appearance block writes what AppearanceOpts writes for every saved pick", () => {
  const J = JSON.stringify, cases = [{}];
  for (const t of ["dark", "light", "system", "bogus"]) cases.push({ uiTheme: J(t) });
  for (const a of ["brand", "team", "ember", "amber", "cyan", "violet", "lime", "custom", 7]) cases.push({ menuAccent: J(a) });
  for (const hex of ["#00FF88", "12ab34", "nope"]) cases.push({ menuAccent: J("custom"), menuAccentHex: J(hex) });
  for (const t of ["normal", "large", "larger", "huge"]) cases.push({ textSize: J(t) });
  for (const c of ["off", "high", "x"]) cases.push({ uiContrast: J(c) });
  for (const c of ["off", "deutan", "protan", "tritan", "y"]) cases.push({ cvdMode: J(c) });
  cases.push({ uiTheme: "{broken", textSize: J("normal"), uiContrast: J("off"), cvdMode: J("tritan"), menuAccent: J("custom") });
  for (const stored of cases) {
    const why = J(stored), m = moduleAnswer(stored), i = inlineAnswer(stored);
    assert.deepEqual(pick(i), pick(m), "same attributes: " + why);
    if (m.dataset.menuAccent !== "team") assert.equal(i._style["--red"] ?? null, m._style["--red"] ?? null, "same --red: " + why);
  }
});

test("the pre-paint --ui-scale is UiScale's clamped, snapped stored value, before data-density reads it", () => {
  const scale = fs.readFileSync(path.join(ROOT, "js/ui/scale.js"), "utf8");
  // scale.js's own constants drive the expected value, so a change there turns this red.
  const k = (name) => +(scale.match(new RegExp("const " + name + " = ([\\d.]+);")) || [])[1];
  const [MIN, MAX, STEP] = [k("SCALE_MIN"), k("SCALE_MAX"), k("SCALE_STEP")];
  assert.ok(MIN > 0 && MAX > MIN && STEP > 0, "scale.js still declares SCALE_MIN / SCALE_MAX / SCALE_STEP");
  const snap = (v) => String(Math.round(Math.max(MIN, Math.min(MAX, v)) / STEP) * STEP / 100);
  for (const v of [109, 87.6, 10, 30, 500, 199.9, 150.13]) assert.equal(inlineAnswer({ uiScale: String(v) })._style["--ui-scale"], snap(v));
  assert.equal(inlineAnswer({})._style["--ui-scale"], undefined, "nothing stored => the CSS (pointer: coarse) default stands");
  assert.equal(inlineAnswer({ uiScale: "1e309" })._style["--ui-scale"], undefined, "a non-finite store value is refused, as store.js does");
  assert.ok(html.indexOf("// Appearance (Bryce") < html.indexOf('.getPropertyValue("--ui-scale")'), "runs before the density probe");
});

test("the pre-paint auto Home scene is homeVariation's pick for this visit", () => {
  const exp = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/experience.js"), "utf8") + ";globalThis.api=UiExperience;", exp, { filename: absSrc("js/ui/experience.js") });
  const HOME = block("// Home scene: apex26.homeScene", "/* Experience stamp() answers at eval */ }");
  for (const visit of [undefined, 0, 1, 2, 3, 4, 5, 9, 19, 23, -2, 1.5, "1e309", "{bad"]) {
    const stored = { homeScene: JSON.stringify("auto") };
    if (visit !== undefined) stored.homeVisit = typeof visit === "string" ? visit : JSON.stringify(visit);
    const de = rootEl();
    vm.runInContext(HOME, vm.createContext({ localStorage: lsFrom(stored), document: { documentElement: de }, JSON, Math }), { filename: absSrc("index.html") });
    let v; try { v = visit === undefined ? 0 : JSON.parse(stored.homeVisit); } catch { v = 0; }
    if (typeof v === "number" && !Number.isFinite(v)) v = 0;   // store.js refuses it
    const picker = exp.api.homeVariation({ get: () => v, set() {} });
    assert.equal(de.dataset.homeScene, picker.enter("auto", "auto").mode, "visit " + visit);
  }
});
