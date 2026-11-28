/* learn-drill-reach.test.mjs — every registered LEARN drill is reachable from its lesson page (#6559).
 * Six drills shipped registered with no button on their lesson (grip, lines, wake, charge, rain, torque; telemetry
 * too), so nothing could launch them. This pins both halves of the path, with the ids read from the registry:
 * 1. Source: the drill's lesson is in the LEARN curriculum, and its page posts {type:"apex-learn-scenario", id}
 *    (LearnAppearance.drill(id, …) in learn/appearance.js, or the literal postMessage).
 * 2. Runtime, in the game VM: open LEARN, open that lesson, deliver the lab's scenario message from the lesson frame,
 *    and the REAL handler (js/ui/learn-door.js → G.drills().launch) starts that drill's race.
 * 3. The time-trial drills on a phone: FlyingStart's countdown frame inside race entry must not arm the TT rolling
 *    start ahead of drill.begin() (game.js flyingStartDeps, #7479 option A); the VM pumps that one frame by hand.
 *
 * Run: node --test tests/unit/learn-drill-reach.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import vm from "node:vm";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

async function boot() {
  const g = await createGame({ carMeshes: false });
  const ev = (src) => vm.runInContext(src, g.ctx, { filename: "learn-drill-reach:ev" });
  return { g, ev };
}

async function openLearn(g, ev) {
  assert.equal(ev("UiLayers.top()?.id"), "overlay", "the title is the top layer");
  ev('document.getElementById("mb-learn").click()');
  const ok = await g.settleAsync(() => ev('typeof LearnDoor !== "undefined" && document.getElementById("learn")?.tagName === "DIALOG"'));
  assert.ok(ok, "LAZY_LEARN loaded and LearnDoor built #learn");
}

/** The registry's drills, {id, lesson}, once LAZY_LEARN has loaded and LearnDoor defined them. */
function drills(ev) {
  return plain(ev("DrillRegistry.ids().map(id => ({ id, lesson: DrillRegistry.get(id).lesson }))"));
}

test("every registered drill's lesson is in the curriculum and its page posts the drill's scenario", async () => {
  const { g, ev } = await boot();
  try {
    await openLearn(g, ev);
    const list = drills(ev), lessons = new Set(plain(ev("LearnDoor.lessonIds()")));
    assert.ok(list.length >= 11, "the registry lists the drills: " + JSON.stringify(list));
    for (const { id, lesson } of list) {
      assert.ok(lessons.has(lesson), `drill ${id}: lesson "${lesson}" is a LEARN door`);
      const src = ["index.html", "lab.js"].map((f) => "learn/" + lesson + "/" + f).filter((p) => existsSync(new URL(p, ROOT))).map(read).join("\n");
      const q = `["']${id.replace(/[-]/g, "\\-")}["']`;
      const helper = new RegExp(`LearnAppearance\\.drill(?:\\?\\.)?\\(\\s*${q}`).test(src);
      const literal = new RegExp(`type:\\s*["']apex-learn-scenario["'],\\s*id:\\s*${q}`).test(src);
      assert.ok(helper || literal, `drill ${id}: learn/${lesson}/ posts apex-learn-scenario for it (LearnAppearance.drill("${id}", …))`);
    }
  } finally { g.close(); }
});

test("each drill's scenario message, from its own lesson, launches that drill through the real LEARN handler", async () => {
  const { g, ev } = await boot();
  try {
    await openLearn(g, ev);
    const list = drills(ev);
    ev('document.getElementById("learn-close").click()');
    for (const { id, lesson } of list) {
      const ready = await g.settleAsync(() => g.G.state === "menu" && ev('UiLayers.top()?.id') === "overlay");
      assert.ok(ready, `before ${id}: the title is back on top (top=${ev("UiLayers.top()?.id")})`);
      ev('document.getElementById("mb-learn").click()');
      await g.settleAsync(() => ev('document.getElementById("learn").hidden === false'));
      // A drill's end() reopens LEARN on its lesson; from the index or a lesson, BACK leads to the index.
      if (ev('document.getElementById("learn-lab").hidden === false')) ev('document.getElementById("learn-close").click()');
      ev(`document.getElementById("learn-open-${lesson}").click()`);
      assert.equal(ev('document.getElementById("learn-lab").getAttribute("src")'), `learn/${lesson}/index.html`);
      ev(`dispatchEvent({ type: "message", origin: location.origin, source: document.getElementById("learn-lab").contentWindow, data: { type: "apex-learn-scenario", id: ${JSON.stringify(id)} } })`);
      await g.settleAsync(() => g.G.state !== "menu" || g.apex.drillState().active);
      assert.equal(ev('document.getElementById("learn").hidden'), true, `${id}: LEARN closed for the drill`);
      assert.equal(g.apex.drillState().id, id, `${id}: the registry launched it from ${lesson}`);
      const raced = await g.stepUntil(() => g.G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
      assert.ok(raced.ok, `${id}: the drill race started: ` + JSON.stringify(g.apex.drillState()));
      g.G.quitToMenu();
      assert.equal(g.apex.drillState().active, false, `${id}: quitting ended it`);
      // end() reopens the lesson once the title is back: close it so the next drill starts from the index.
      await g.settleAsync(() => ev('document.getElementById("learn").hidden === false'));
      if (ev('document.getElementById("learn").hidden === false')) {
        ev('document.getElementById("learn-close").click()');
        if (ev('document.getElementById("learn").hidden === false')) ev('document.getElementById("learn-close").click()');
      }
    }
    // A message for a drill from another lesson's page is refused (learn-door.js: drill.lesson === the open lesson).
    await g.settleAsync(() => ev('UiLayers.top()?.id') === "overlay");
    ev('document.getElementById("mb-learn").click()');
    await g.settleAsync(() => ev('document.getElementById("learn").hidden === false'));
    if (ev('document.getElementById("learn-lab").hidden === false')) ev('document.getElementById("learn-close").click()');
    ev('document.getElementById("learn-open-chassis").click()');
    ev('dispatchEvent({ type: "message", origin: location.origin, source: document.getElementById("learn-lab").contentWindow, data: { type: "apex-learn-scenario", id: "grip" } })');
    await g.settleAsync(() => false, 50);
    assert.equal(g.apex.drillState().active, false, "grip's message from the Chassis page launched nothing");
    assert.equal(ev('document.getElementById("learn").hidden'), false, "and LEARN stayed open");
  } finally { g.close(); }
});

// The TT drills' failure on a phone (#7479 option A): FlyingStart armed the time-trial rolling start on the first
// countdown frame while startRaceBody still awaited (rigWarm / mirrorPrepare), so drill.begin() then saw "race" and
// refused. The VM pumps no frames there, so this pumps the one FlyingStart frame a phone runs, just before begin().
test("a time-trial drill's countdown frame does not arm FlyingStart, so the drill's begin() succeeds", async () => {
  const { g, ev } = await boot();
  try {
    await openLearn(g, ev);
    ev('document.getElementById("learn-close").click()');
    await g.settleAsync(() => g.G.state === "menu" && ev("UiLayers.top()?.id") === "overlay");
    assert.equal(g.G.drills().launch("taper"), true, "taper launched from the menu");
    const drill = g.G.drills().active(), begin = drill.begin;
    let seen = null;
    drill.begin = function () {
      const st = g.G.state;
      g.G.flyingStart.update(1 / 60);   // the countdown frame a phone runs inside race entry
      seen = { before: st, timeTrial: !!g.G.timeTrial, after: g.G.state, handover: g.G.flyingStart.active() };
      return begin.call(this);
    };
    const raced = await g.stepUntil(() => g.G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
    assert.deepEqual(seen, { before: "count", timeTrial: true, after: "count", handover: false },
      "FlyingStart left the time-trial drill's countdown alone (no goRolling, no hand-over)");
    assert.ok(raced.ok, "the drill race started: " + JSON.stringify(g.apex.drillState()));
    assert.equal(drill.failed, false, "taper's begin() succeeded");
    assert.equal(g.apex.drillState().id, "taper", "and the drill is live");
  } finally { g.close(); }
});
