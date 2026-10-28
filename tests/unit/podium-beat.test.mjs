/* podium-beat.test.mjs — PodiumBeat overlay + RacePodium handoff (#4070 slice 4).
 * Mounts ResultsStory podium, CONTINUE / timer → buildResults + show #results.
 * Run: node --test tests/unit/podium-beat.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot() {
  const dom = makeDom();
  const results = dom.document.createElement("dialog");
  results.id = "results";
  results.hidden = true;
  dom.document.body.appendChild(results);
  const ctx = vm.createContext({
    document: dom.document,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
  });
  for (const rel of [
    "js/ui/dom.js",
    "js/ui/results-story.js",
    "js/ui/podium-beat.js",
    "js/race/podium-beat.js",
  ]) {
    vm.runInContext(src(rel), ctx, { filename: absSrc(rel) });
  }
  return {
    PodiumBeat: vm.runInContext("PodiumBeat", ctx),
    RacePodium: vm.runInContext("RacePodium", ctx),
    ResultsStory: vm.runInContext("ResultsStory", ctx),
    dom,
    results,
    document: dom.document,
  };
}

function threeCars(playerPos = 2) {
  return [1, 2, 3].map((n) => ({
    driverId: "d" + n,
    code: "C" + n,
    name: "Driver " + n,
    team: { name: "Team " + n, color: [0.8, 0.1, 0.1] },
    isPlayer: n === playerPos,
    finPos: n,
    classified: true,
  }));
}

test("eligible only when ResultsStory reports three podium finishers", () => {
  const { PodiumBeat, RacePodium } = boot();
  assert.equal(PodiumBeat.eligible(threeCars()), true);
  assert.equal(RacePodium.eligible(threeCars()), true);
  assert.equal(PodiumBeat.eligible(threeCars().slice(0, 2)), false);
  const retired = threeCars();
  retired[2].retired = true;
  retired[2].classified = false;
  assert.equal(PodiumBeat.eligible(retired, { dnfOf: (c) => c.retired ? "DNF" : null }), false);
});

test("mount paints data-ceremony-phase=podium and CONTINUE hands off", () => {
  const { PodiumBeat, document } = boot();
  const order = threeCars();
  let continued = 0;
  const G = { cssCol: () => "#f00" };
  const m = PodiumBeat.mount(G, order, { points: [25, 18, 15] }, { onContinue: () => { continued++; } });
  assert.ok(m);
  assert.equal(PodiumBeat.visible(), true);
  assert.equal(PodiumBeat.phaseAttr(), "podium");
  const host = document.querySelector("#" + PodiumBeat.HOST_ID);
  assert.equal(host.getAttribute("data-ceremony-phase"), "podium");
  assert.equal(host.hidden, false);
  const podium = host.querySelector('[data-results-part="podium"]');
  assert.ok(podium);
  assert.equal(podium.children.length, 3);
  const btn = document.querySelector("#" + PodiumBeat.CONTINUE_ID);
  assert.equal(btn.hidden, false);
  btn.click();
  assert.equal(continued, 1);
  PodiumBeat.dismount();
  assert.equal(PodiumBeat.visible(), false);
  assert.equal(host.hidden, true);
  assert.equal(PodiumBeat.phaseAttr(), "");
});

test("RacePodium: start aims orbit, CONTINUE/timer shows #results via buildResults", () => {
  const { RacePodium, PodiumBeat, results } = boot();
  const order = threeCars(1);
  const builds = [];
  let orbit = 0;
  const dones = [];
  const cam = {
    startOrbit() { orbit++; return true; },
    subject() { return order[0]; },
  };
  const api = RacePodium.create({ cssCol: () => "#f00" }, {
    resultsCam: cam,
    buildResults(o, opts) { builds.push({ o, opts }); },
    els: { results },
  });
  assert.equal(api.start(order, { points: [25, 18, 15] }, (r) => dones.push(r)), true);
  assert.equal(orbit, 1);
  assert.equal(api.status().phase, "podium");
  assert.equal(PodiumBeat.visible(), true);
  assert.equal(results.hidden, true, "sheet stays hidden during podium");

  assert.equal(api.finish("continue"), true);
  assert.equal(builds.length, 1);
  assert.equal(builds[0].o, order);
  assert.equal(results.hidden, false);
  assert.equal(PodiumBeat.visible(), false);
  assert.equal(dones[0].phase, "results");
  assert.equal(dones[0].reason, "continue");

  results.hidden = true;
  builds.length = 0;
  dones.length = 0;
  assert.equal(api.start(order, {}, (r) => dones.push(r)), true);
  api.tick(api.PODIUM_S);
  assert.equal(results.hidden, false);
  assert.equal(dones[0].reason, "timer");
  assert.equal(builds.length, 1);
});

test("no-podium classification skips overlay and still shows results", () => {
  const { RacePodium, PodiumBeat, results } = boot();
  const order = threeCars().slice(0, 1);
  const builds = [];
  const dones = [];
  const api = RacePodium.create({}, {
    buildResults(o) { builds.push(o); },
    els: { results },
  });
  assert.equal(api.start(order, {}, (r) => dones.push(r)), false);
  assert.equal(PodiumBeat.visible(), false);
  assert.equal(results.hidden, false);
  assert.equal(builds.length, 1);
  assert.equal(dones[0].reason, "skip-no-podium");
});

test("CONTINUE button click finishes the live beat", () => {
  const { RacePodium, PodiumBeat, results, document } = boot();
  const order = threeCars();
  const dones = [];
  const api = RacePodium.create({ cssCol: () => "#0f0" }, {
    buildResults() {},
    els: { results },
    resultsCam: { startOrbit() { return true; } },
  });
  api.start(order, { points: [25, 18, 15] }, (r) => dones.push(r));
  document.querySelector("#" + PodiumBeat.CONTINUE_ID).click();
  assert.equal(dones.length, 1);
  assert.equal(dones[0].phase, "results");
  assert.equal(dones[0].reason, "continue");
  assert.equal(results.hidden, false);
});
