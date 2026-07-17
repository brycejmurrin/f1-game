import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file, name, globals = {}) {
  const sandbox = { console, Math, Array, Object, Number, Map, Set, ...globals };
  sandbox.window = sandbox;
  const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(source, vm.createContext(sandbox), { filename: file });
  return sandbox[name];
}

test("SceneryThemes resolves neutral defaults, named theme, and track overrides", () => {
  const Themes = load("js/scenery-themes.js", "SceneryThemes");
  const theme = Themes.resolve("desert", {
    palette: { accent: [1, 0, 0] },
    budgets: { facility: 12000 },
  }, { night: true });
  assert.equal(theme.name, "desert");
  assert.deepEqual(theme.palette.accent, [1, 0, 0]);
  assert.equal(theme.budgets.hero, 50000);
  assert.equal(theme.budgets.facility, 12000);
  assert.ok(theme.palette.window.every(Number.isFinite));
});

test("SceneryThemes variant selection is stable and bounded", () => {
  const Themes = load("js/scenery-themes.js", "SceneryThemes");
  const choices = ["flat", "sawtooth", "cantilever"];
  const first = Themes.variant("spa", "pit-roof", 3, choices);
  assert.equal(first, Themes.variant("spa", "pit-roof", 3, choices));
  assert.ok(choices.includes(first));
});
