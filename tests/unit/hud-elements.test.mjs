/* hud-elements — per-element HUD visibility store + body[data-hud-hide]. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-elements.js"), "utf8");

function load(stored = {}, opts = {}) {
  const written = {};
  const classes = new Set(opts.classes || []);
  const listeners = [];
  const body = {
    dataset: {},
    classList: {
      toggle(c, on) { if (on === false) classes.delete(c); else classes.add(c); },
      contains(c) { return classes.has(c); },
      add(c) { classes.add(c); },
      remove(c) { classes.delete(c); },
    },
  };
  const doc = {
    body,
    readyState: "complete",
    getElementById: () => null,
    addEventListener() {},
  };
  const ctx = {
    console,
    document: doc,
    GameStore: {
      store: {
        get(k, d) { return k in written ? written[k] : (k in stored ? stored[k] : d); },
        set(k, v) {
          written[k] = v;
          for (let i = 0; i < listeners.length; i++) listeners[i]({ key: k, local: true });
        },
        subscribe(fn) { listeners.push(fn); return () => {}; },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudElements = HudElements;", ctx);
  ctx.__written = written;
  ctx.__body = body;
  ctx.__setProfile = (p) => { ctx.GameStore.store.set("hudProfile", p); };
  return ctx;
}

test("defaults every chrome element on; hide writes data-hud-hide", () => {
  const ctx = load();
  const H = ctx.HudElements;
  assert.equal(H.isOn("speed"), true);
  H.set("speed", false);
  assert.equal(H.isOn("speed"), false);
  assert.match(ctx.__body.dataset.hudHide, /\bspeed\b/);
  assert.equal(ctx.__written.hudElements.speed, "off");
  H.set("speed", true);
  // Only the opt-in readouts (shipped off) are left in the hide list.
  assert.equal(ctx.__body.dataset.hudHide, "rel strat inputs");
});

test("stored offs restore on load", () => {
  const ctx = load({ hudElements: { tyre: "off", ot: "off" } });
  const H = ctx.HudElements;
  assert.equal(H.isOn("tyre"), false);
  assert.equal(H.isOn("ot"), false);
  assert.equal(H.isOn("speed"), true);
  assert.match(ctx.__body.dataset.hudHide, /\btyre\b/);
  assert.match(ctx.__body.dataset.hudHide, /\bot\b/);
});

test("opt-in readouts ship OFF, store only an explicit on, and hide via data-hud-hide", () => {
  const ctx = load();
  const H = ctx.HudElements;
  for (const id of ["rel", "strat", "inputs"]) assert.equal(H.isOn(id), false, id);
  assert.match(ctx.__body.dataset.hudHide, /\brel\b.*\bstrat\b.*\binputs\b/);
  H.set("rel", true);
  assert.equal(ctx.__written.hudElements.rel, "on");
  assert.doesNotMatch(ctx.__body.dataset.hudHide, /\brel\b/);
  H.set("rel", false);
  assert.deepEqual({ ...ctx.__written.hudElements }, {}, "back to the shipped default: nothing stored");
  const back = load({ hudElements: { inputs: "on", speed: "off" } }).HudElements;
  assert.equal(back.isOn("inputs"), true);
  assert.equal(back.isOn("speed"), false);
  assert.equal(back.isOn("strat"), false);
});

test("CSS contracts: hide selectors and no new class sprawl for the checklist", () => {
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  assert.match(css, /body\[data-hud-hide~="speed"\] #hud-speed/);
  assert.match(css, /body\[data-hud-hide~="tyre"\] #hud-tyre/);
  assert.match(css, /#pm-hud-elements-list/);
});

test("REL ships ON for the broadcast profile only; STRATEGY and INPUTS stay off", () => {
  const std = load();
  assert.equal(std.HudElements.profileOf(), "standard");
  assert.equal(std.HudElements.shippedOf("rel"), "off");
  assert.equal(std.HudElements.isOn("rel"), false);
  assert.match(std.__body.dataset.hudHide, /\brel\b/);

  const min = load({ hudProfile: "minimal" });
  assert.equal(min.HudElements.isOn("rel"), false, "MINIMAL keeps REL off");
  assert.equal(min.HudElements.isOn("strat"), false);
  assert.equal(min.HudElements.isOn("inputs"), false);

  const bcast = load({ hudProfile: "broadcast" });
  assert.equal(bcast.HudElements.profileOf(), "broadcast");
  assert.equal(bcast.HudElements.shippedOf("rel"), "on");
  assert.equal(bcast.HudElements.isOn("rel"), true, "BROADCAST ships REL on");
  assert.equal(bcast.HudElements.isOn("strat"), false, "STRATEGY stays opt-in");
  assert.equal(bcast.HudElements.isOn("inputs"), false, "INPUTS stays opt-in");
  assert.doesNotMatch(bcast.__body.dataset.hudHide, /\brel\b/);
  assert.match(bcast.__body.dataset.hudHide, /\bstrat\b/);
  assert.match(bcast.__body.dataset.hudHide, /\binputs\b/);

  const viaClass = load({}, { classes: ["hud-prof-broadcast"] });
  assert.equal(viaClass.HudElements.isOn("rel"), true, "live hud-prof-broadcast class is enough");
});

test("broadcast REL default yields to an explicit store override and follows a style switch", () => {
  const keptOff = load({ hudProfile: "broadcast", hudElements: { rel: "off" } });
  assert.equal(keptOff.HudElements.isOn("rel"), false, "stored off wins on broadcast");
  assert.match(keptOff.__body.dataset.hudHide, /\brel\b/);

  const keptOn = load({ hudProfile: "standard", hudElements: { rel: "on" } });
  assert.equal(keptOn.HudElements.isOn("rel"), true, "stored on wins on standard");
  assert.doesNotMatch(keptOn.__body.dataset.hudHide, /\brel\b/);

  const bcast = load({ hudProfile: "broadcast" });
  bcast.HudElements.set("rel", false);
  assert.equal(bcast.__written.hudElements.rel, "off", "turning REL off on broadcast is stored");
  bcast.HudElements.set("rel", true);
  assert.deepEqual({ ...bcast.__written.hudElements }, {}, "back to the broadcast default: nothing stored");

  const live = load();
  assert.equal(live.HudElements.isOn("rel"), false);
  live.__setProfile("broadcast");
  assert.equal(live.HudElements.isOn("rel"), true, "switching STYLE to broadcast lights REL");
  assert.doesNotMatch(live.__body.dataset.hudHide, /\brel\b/);
  live.__setProfile("standard");
  assert.equal(live.HudElements.isOn("rel"), false, "switching back to standard hides REL again");
  assert.match(live.__body.dataset.hudHide, /\brel\b/);
});

test("HudLayout eval survives HudElements.apply reading profile() (no TDZ abort)", () => {
  const cam = fs.readFileSync(path.join(ROOT, "js/camera/cam-groups.js"), "utf8");
  const layout = fs.readFileSync(path.join(ROOT, "js/ui/hud-layout.js"), "utf8");
  const written = {};
  const classes = new Set(["hud-prof-broadcast"]);
  const ctx = {
    console,
    document: {
      body: {
        dataset: {},
        classList: { contains: (c) => classes.has(c), toggle() {}, add() {}, remove() {} },
        setAttribute() {},
      },
      readyState: "loading",
      getElementById: () => null,
      querySelector: () => null,
      addEventListener() {},
    },
    GameStore: {
      store: {
        get(k, d) { return k === "hudProfile" ? "broadcast" : (k in written ? written[k] : d); },
        set(k, v) { written[k] = v; },
        subscribe() { return () => {}; },
      },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + "; this.HudElements = HudElements;", ctx);
  vm.runInContext(cam + "\n" + layout + "; this.HudLayout = HudLayout;", ctx);
  assert.equal(typeof ctx.HudLayout, "object", "hud-layout.js finished; HudLayout is published");
  assert.equal(typeof ctx.HudLayout.profile, "function");
  assert.equal(typeof ctx.HudLayout.apply, "function");
  assert.equal(ctx.HudElements.isOn("rel"), true, "broadcast class + store keep REL on after both evals");
});

test("SPEED hide covers the whole #hud-speed plate (number + unit), not a second chip", () => {
  const shell = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  const H = load().HudElements;
  // One container, one unit plate — toggling SPEED cannot leave a stray KM/H.
  assert.match(shell, /id="hud-speed"[^>]*>\s*<span id="hud-speed-n">[\s\S]*?<span class="hud-unit">/);
  assert.match(css, /body\[data-hud-hide~="speed"\] #hud-speed/);
  assert.equal(H.ELEMENTS.filter((e) => e[0] === "speed").length, 1);
});

test("effective HUD reasons distinguish saved OFF, style/camera suppression and missing session data", () => {
  const ctx = load({ hudElements: { inputs: "on", strat: "on", rel: "on" } }), H = ctx.HudElements;
  assert.equal(H.effective("inputs", { profile: "minimal" }).text, "Hidden by Minimal HUD style");
  assert.equal(H.effective("inputs", { profile: "standard", broadcastCamera: true }).status, "hidden");
  assert.equal(H.effective("strat", { profile: "standard", tyreWear: false }).target, "rs-tyres-sel");
  assert.equal(H.effective("strat", { timeTrial: true, tyreWear: true }).status, "unavailable");
  assert.equal(H.effective("rel", { timeTrial: true }).status, "unavailable");
  assert.equal(H.effective("damage", { damageVisible: false }).status, "waiting");
  assert.equal(H.effective("delta", { deltaReady: false }).text, "Waiting for a reference lap");
  assert.equal(H.effective("speed", { state: "menu" }).status, "waiting");
  assert.equal(H.effective("inputs", { profile: "standard", tyreWear: true }).status, "enabled");
  H.set("inputs", false); assert.equal(H.effective("inputs", { profile: "minimal" }).status, "off", "explicit preference stays authoritative");
  assert.equal(H.isOn("strat"), true, "availability never writes another preference");
});

test("actual HUD checklist refreshes contextual reasons and keeps requirement navigation separate from checkbox", async () => {
  const { makeDom } = await import("../helpers/mini-dom.mjs");
  const dom = makeDom({ readyState: "loading" });
  dom.document.getElementById = (id) => dom.document.querySelector("#" + id);
  const fold = dom.makeElement("details", "pm-hud-details"); dom.body.appendChild(fold);
  const stored = { hudElements: { inputs: "on", strat: "on" } }, writes = [], nav = [];
  let context = { profile: "minimal", tyreWear: true, state: "race" };
  const sandbox = vm.createContext({ document: dom.document, GameStore: { store: { get: (k, d) => stored[k] ?? d, set: (k, v) => { writes.push(k); stored[k] = v; }, subscribe() {} } } });
  vm.runInContext(SRC + ";this.H=HudElements;", sandbox); const H = sandbox.H;
  H.initUI(); H.configure({ context: () => context, navigate: (page, target) => nav.push([page, target]) });
  const inputRow = fold.querySelector('[data-hud-el-row="inputs"]'), box = inputRow.querySelector("input"), reason = inputRow.querySelector("[data-hud-reason]"), link = inputRow.querySelector("button");
  assert.equal(box.checked, true); assert.equal(box.getAttribute("aria-describedby"), reason.id); assert.match(reason.textContent, /Minimal/);
  assert.equal(link.closest("label"), null, "link activation cannot toggle the checkbox"); link.onclick(); assert.deepEqual(nav, [["display", "pm-hudprofile-sel"]]); assert.deepEqual(writes, []);
  context = { profile: "standard", tyreWear: false, state: "race" }; H.refreshVisibility();
  assert.equal(link.hidden, true); assert.equal(reason.textContent, "Enabled when live data is available");
  const strat = fold.querySelector('[data-hud-el-row="strat"]'); assert.match(strat.querySelector("[data-hud-reason]").textContent, /Requires tyre wear/); strat.querySelector("button").onclick(); assert.deepEqual(nav[1], ["race-settings", "rs-tyres-sel"]);
  context = { profile: "standard", tyreWear: true, state: "race" }; H.refreshVisibility(); assert.equal(strat.querySelector("button").hidden, true); assert.equal(box.checked, true); assert.deepEqual(writes, []);
});
