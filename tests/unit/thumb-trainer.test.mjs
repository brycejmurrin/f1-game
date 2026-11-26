// LEARN's THUMB TRAINER (js/ui/thumb-trainer.js): every corner's arrow matches the built Las Vegas centreline, the
// scoring rewards the target script and not an idle thumb, and the pedal explorer draws through the game's own
// PedalTravel code. The drill itself runs over the real dock in a browser; LearnDoor opens it instead of a frame.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const require = createRequire(import.meta.url);
const src = rel => readFileSync(new URL("../../" + rel, import.meta.url), "utf8");

function load() {
  const ctx = vm.createContext({ Log: { info() {}, warn() {} } });
  for (const rel of ["js/input/pedal-travel.js", "js/ui/thumb-trainer.js"]) vm.runInContext(src(rel), ctx, { filename: absSrc(rel) });
  return vm.runInContext("({ ThumbTrainer, PedalTravel })", ctx);
}

test("each of the 17 corners steers the way the built Vegas centreline turns (+k = LEFT = the left arrow)", () => {
  const { ThumbTrainer } = load();
  const { Tracks } = require("../../tools/lib/track-build-vm.cjs").buildContext({});
  const def = Tracks.LIST.find(d => d.id === "vegas");
  const road = Tracks.buildCenterline(def, { line: false });
  assert.equal(ThumbTrainer.CORNERS.length, def.turns.length);
  def.turns.forEach((fraction, i) => {
    const c = Math.round(fraction * road.n);
    let k = 0;
    for (let j = -6; j <= 6; j++) k += road.curv[(c + j + road.n) % road.n];
    const corner = ThumbTrainer.CORNERS[i];
    assert.equal(corner.name, "T" + (i + 1));
    assert.equal(corner.dir, k > 0 ? -1 : 1, `${corner.name}: curvature ${k.toFixed(3)}`);
  });
  // T15 flicks out of T14: the script holds the OTHER arrow first.
  const t15 = ThumbTrainer.script("T15");
  assert.equal(t15.target(0.2), -1);
  assert.equal(t15.target(1.0), 1);
});

test("the target script scores clean; an idle thumb or the wrong arrow does not", () => {
  const { ThumbTrainer } = load();
  for (const { name } of ThumbTrainer.CORNERS) {
    const C = ThumbTrainer.script(name), perfect = [], idle = [], wrong = [];
    for (let t = 0; t < C.dur; t += 1 / 60) {
      perfect.push({ t, s: C.target(t), b: C.brake(t), g: C.gas(t) });
      idle.push({ t, s: 0, b: 0, g: 0 });
      wrong.push({ t, s: -C.target(t), b: C.brake(t), g: C.gas(t) });
    }
    const best = ThumbTrainer.score(name, perfect);
    assert.ok(best.all > 0.97, `${name} perfect ${best.all}`);
    assert.ok(best.tips.some(t => /Clean|on time/.test(t)), best.tips.join(" | "));
    assert.ok(ThumbTrainer.score(name, idle).all < best.all - 0.15, name + " idle");
    const w = ThumbTrainer.score(name, wrong);
    assert.ok(w.arrow < 0.7 && w.tips.some(t => /arrow/i.test(t)), name + " wrong arrow");
  }
  const both = ThumbTrainer.score("T6", [{ t: 1, s: 1, b: 0.5, g: 1 }]);
  assert.ok(both.tips.some(t => /BRAKE and GAS/.test(t)));
});

test("the pedal explorer curves come from PedalTravel.level / sliderLevel with the preset profiles", () => {
  const { ThumbTrainer, PedalTravel } = load();
  const { rec, edge, catch: gasCatch } = ThumbTrainer.PRESETS;
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, a + " vs " + b);
  near(ThumbTrainer.curve(PedalTravel, rec.brake, 0, 100), 1);
  near(ThumbTrainer.curve(PedalTravel, rec.brake, 0.75, 100), 0.2);              // 75 px of 100: the end
  near(ThumbTrainer.curve(PedalTravel, gasCatch.gas, 0.4, 100), 0.7);             // 40 px left
  near(ThumbTrainer.curve(PedalTravel, edge.brake, 1, 100), 1);                   // top of the bar
  near(ThumbTrainer.curve(PedalTravel, edge.brake, 0, 100), 0.2);                 // bottom
  near(ThumbTrainer.curve(PedalTravel, edge.gas, 1, 100), 1);                     // gas: bottom 100 %
  near(ThumbTrainer.curve(PedalTravel, edge.gas, 0, 100), 0.9);                   // top 90 %
  // Every preset is a profile the touch-button editor can save as it is.
  for (const p of Object.values(ThumbTrainer.PRESETS)) {
    for (const [id, profile] of [["brake", p.brake], ["gas", p.gas]]) {
      if (!profile) continue;
      const { press, ...fields } = profile;
      const kept = PedalTravel.normalizeProfiles({ v: 1, buttons: { [id]: fields } }).buttons[id];
      assert.deepEqual({ ...kept }, fields, p.label + " " + id);
    }
  }
});

test("LearnDoor's trainer door hands over to the trainer and reopens Learn on its lesson after BACK", () => {
  const dom = makeDom(), queue = [];
  const sb = { Math, Object, Array, Map, Set, JSON, Promise, document: dom.document, queueMicrotask: cb => queue.push(cb),
    Log: { info() {}, warn() {} }, addEventListener() {}, matchMedia: () => ({ matches: false }), UiLayers: { top: () => null } };
  sb.window = sb;
  sb.TopModal = { wire() {} };
  for (const rel of ["js/ui/dom.js", "js/ui/learn-door.js"]) vm.runInNewContext(src(rel), sb, { filename: absSrc(rel) });
  const LearnDoor = vm.runInNewContext("LearnDoor", sb);
  const door = dom.document.createElement("button"), opened = [];
  door.dataset.openLesson = "thumbs";   // as the ?go=thumbs deep link leaves it
  LearnDoor.open(door, null, null, onClose => opened.push(onClose));
  const dialog = dom.byId("learn");
  assert.equal(door.dataset.openLesson, undefined, "the deep link's lesson is used once");
  assert.equal(dialog.hidden, true, "Learn steps aside for the trainer");
  assert.equal(dom.byId("learn-lab").getAttribute("src"), null, "no framed lab page");
  queue.shift()();
  assert.equal(opened.length, 1);
  opened[0]();                          // the trainer's BACK
  assert.equal(dialog.hidden, false);
  assert.equal(dom.document.activeElement, dom.byId("learn-open-thumbs"));
  assert.ok(require("../../tools/manifest.cjs").LAZY_LEARN.includes("js/ui/thumb-trainer.js"), "loads with the Learn door");
});

test("Escape and BACK are one door, and closing puts the title, HUD and dock back as they were", () => {
  const dom = makeDom(), calls = [];
  for (const id of ["overlay", "hud"]) { const el = dom.document.createElement("div"); el.id = id; dom.document.body.appendChild(el); }
  dom.byId("hud").hidden = true;
  const proto = Object.getPrototypeOf(dom.document.createElement("canvas"));
  const sb = { Math, Object, Array, Map, Set, JSON, Promise, String, Number, document: dom.document, devicePixelRatio: 1, innerWidth: 852, innerHeight: 393,
    Log: { info() {}, warn() {} }, localStorage: { getItem: () => null, setItem() {} }, addEventListener() {}, removeEventListener() {},
    requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => "" }), Input: { reset: () => calls.push("reset"), touchLevels: () => ({ brake: 0, gas: 0, left: 0, right: 0 }) } };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/thumb-trainer.js"), sb, { filename: absSrc("js/ui/thumb-trainer.js") });
  const TT = vm.runInNewContext("ThumbTrainer", sb);
  if (!proto.getContext) proto.getContext = () => null;
  TT.open({ getSteerMode: () => "buttons" }, { preview: on => calls.push("preview " + on), onClose: () => calls.push("closed") });
  const root = dom.byId("thumb-trainer");
  assert.equal(root.hidden, false);
  assert.equal(dom.byId("overlay").hidden, true);
  assert.equal(dom.byId("hud").hidden, false, "the race dock's layer is shown");
  const door = dom.byId(root.getAttribute("data-esc-close"));
  assert.equal(door.textContent, "BACK", "Escape presses the trainer's own BACK");
  door.click();
  assert.equal(root.hidden, true);
  assert.equal(dom.byId("overlay").hidden, false);
  assert.equal(dom.byId("hud").hidden, true);
  assert.equal(dom.document.body.hasAttribute("data-thumb-trainer"), false);
  assert.deepEqual(calls, ["preview true", "preview false", "reset", "closed"], "the dock hides and every hold is released before Learn returns");
});
