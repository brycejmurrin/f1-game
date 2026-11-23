/* results-story.test.mjs — a classified retiree keeps podium place and points (#4931).
 * Run: node --test tests/unit/results-story.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rel = "js/ui/results-story.js";
const ctx = vm.createContext({ Dom: {} });
vm.runInContext(fs.readFileSync(path.join(ROOT, rel), "utf8"), ctx, { filename: absSrc(rel) });
const { summary } = vm.runInContext("ResultsStory", ctx);
const car = (id, x = {}) => ({ driverId: id, classified: true, ...x });
const points = [25, 18, 15, 12];

test("classified P3 retiree stays on the podium and keeps points", () => {
  const order = [car("a"), car("b"), car("c", { isPlayer: true, retired: true, dnf: "DNF" }), car("d")];
  const s = summary(order, { points });
  assert.equal(s.podium.length, 3);
  assert.equal(s.player.out, "DNF");
  assert.equal(s.player.points, 15);
});

test("unclassified retiree and DSQ are off the podium and score nothing", () => {
  const order = [car("a"), car("b", { retired: true, classified: false }), car("c", { dsq: true, classified: false }), car("d")];
  const s = summary(order, { points });
  assert.deepEqual(s.podium.map((p) => p.car.driverId), ["a"]);
});
