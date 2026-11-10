/* retired-card.test.mjs — W34 row 2: a retired solo player gets a RETIRED card
 * whose SKIP TO RESULTS clicks the pause menu's own #pm-skip-results, and the
 * driving controls hide (body[data-retired-wait]). The RaceControl adapter drives it.
 * Run: node --test tests/unit/retired-card.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/race/retired-card.js"), "utf8");
const CSS = readFileSync(join(ROOT, "css/touch-controls.css"), "utf8");

function fakeDom() {
  const nodes = {};
  const mk = (tag) => ({ tag, id: "", hidden: false, clicks: 0, listeners: {}, attrs: {}, children: [], textContent: "",
    addEventListener(t, f) { this.listeners[t] = f; }, click() { this.clicks++; },
    setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); } });
  const attrs = new Set();
  const index = (el) => { if (el.id) nodes[el.id] = el; for (const c of el.children) index(c); };
  nodes["pm-skip-results"] = mk("button");
  const document = { getElementById: (id) => nodes[id] || null, createElement: mk,
    body: { appendChild: index, toggleAttribute: (a, on) => (on ? attrs.add(a) : attrs.delete(a)) } };
  return { nodes, attrs, document };
}

function load(dom, now = { t: 0 }) {
  const frames = [];
  const ctx = vm.createContext({ document: dom.document, performance: { now: () => now.t },
    requestAnimationFrame: (f) => { frames.push(f); return frames.length; }, Date });
  seedLog(ctx);
  vm.runInContext(SRC, ctx, { filename: absSrc("js/race/retired-card.js") });
  return { RC: vm.runInContext("RetiredCard", ctx), frames, now };
}

const view = (over = {}) => Object.assign({ state: "race", session: "race", net: false, watch: false, timeTrial: false,
  player: { retired: true, finished: false } }, over);

test("wanted: only a retired, unfinished player in a solo Grand Prix", () => {
  const { RC } = load(fakeDom());
  assert.equal(RC.wanted(view()), true);
  assert.equal(RC.wanted(view({ player: { retired: false } })), false, "still racing");
  assert.equal(RC.wanted(view({ player: { retired: true, finished: true } })), false, "finished");
  assert.equal(RC.wanted(view({ net: true })), false, "a room: the host's classification");
  assert.equal(RC.wanted(view({ watch: true })), false);
  assert.equal(RC.wanted(view({ session: "quali" })), false);
  assert.equal(RC.wanted(view({ state: "results" })), false);
  assert.equal(RC.wanted(view({ player: null })), false);
});

test("tick shows the card, hides the driving controls, and its button clicks the pause menu's SKIP TO RESULTS", () => {
  const dom = fakeDom();
  const { RC } = load(dom);
  RC.tick(view());
  assert.equal(dom.nodes["retired-card"].hidden, false);
  assert.ok(dom.attrs.has("data-retired-wait"));
  dom.nodes["retired-skip"].listeners.click();
  assert.equal(dom.nodes["pm-skip-results"].clicks, 1, "the same path as the pause-menu item");
  RC.tick(view({ state: "results" }));
  assert.equal(dom.nodes["retired-card"].hidden, true);
  assert.ok(!dom.attrs.has("data-retired-wait"));
});

test("the card hides itself when race ticks stop (pause, quit) and returns on the next tick", () => {
  const dom = fakeDom();
  const { RC, frames, now } = load(dom);
  RC.tick(view());
  now.t = 1000;
  frames.shift()();
  assert.equal(RC.shown, false, "no race tick for 1 s: hidden");
  RC.tick(view());
  assert.equal(RC.shown, true);
});

test("the card is built once with a real 44 px-styled button, and its CSS hides the driving controls", () => {
  const dom = fakeDom();
  const { RC } = load(dom);
  RC.tick(view()); RC.tick(view({ state: "results" })); RC.tick(view());
  assert.equal(dom.nodes["retired-skip"].tag, "button");
  assert.equal(dom.nodes["retired-skip"].textContent, "SKIP TO RESULTS");
  assert.equal(dom.nodes["retired-card"].attrs.role, "status");
  assert.match(CSS, /#retired-card button \{ min-height: 44px; min-width: 44px;/);
  assert.match(CSS, /body\[data-retired-wait\] \.dock-grp, body\[data-retired-wait\] \.touchbtn \{ display: none !important; \}/);
});

test("tickG reads the façade: a retired player in a solo race shows; a room or WATCH does not", () => {
  const dom = fakeDom();
  const { RC } = load(dom);
  const G = { state: "race", session: "race", timeTrial: false, player: { retired: true, finished: false },
    netPlay: { active: () => false }, realRace: { status: () => ({ active: false, watch: false }) } };
  RC.tickG(G); assert.equal(RC.shown, true);
  G.netPlay.active = () => true; RC.tickG(G); assert.equal(RC.shown, false);
  G.netPlay.active = () => false; G.realRace.status = () => ({ watch: true }); RC.tickG(G); assert.equal(RC.shown, false);
});
