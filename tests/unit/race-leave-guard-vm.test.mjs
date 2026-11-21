// #5945 2A: a refresh or close mid-race loses the race (there is no resume), so
// a running race asks first through `beforeunload` (js/ui/platform-session.js).
// Time trial, the menus and automation never ask.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

function leaving(g) {
  const ev = { type: "beforeunload", prevented: false, returnValue: undefined, preventDefault() { this.prevented = true; } };
  g.ctx.dispatchEvent(ev);
  return ev.prevented;
}

async function start(tt) {
  const g = await createGame({ track: "monza" });
  g.G.daily.stop(); g.G.raceWeather = "dry";
  if (tt) g.G.timeTrial = true;
  await g.G.startRace(); g.apex.go(); g.apex.headless(true);
  return g;
}

test("a running race asks before the page unloads; the results and the menu do not", async () => {
  const g = await start(false);
  try {
    g.apex.step(1 / 60, 1);
    assert.equal(g.G.state, "race");
    assert.equal(leaving(g), true, "a running race asks before leaving");
    g.G.endRace();
    assert.equal(leaving(g), false, "the results never ask (the race is over)");
    g.G.quitToMenu();
    assert.equal(g.G.state, "menu");
    assert.equal(leaving(g), false, "the menu never asks");
    await g.G.startRace(); g.apex.go();
    assert.equal(leaving(g), true);
    g.ctx.navigator.webdriver = true;
    assert.equal(leaving(g), false, "automation never sees the prompt (a test's reload would hang)");
  } finally { g.close(); }
});

test("time trial never asks before the page unloads", async () => {
  const g = await start(true);
  try {
    g.apex.step(1 / 60, 1);
    assert.equal(g.G.state, "race");
    assert.equal(leaving(g), false);
  } finally { g.close(); }
});
