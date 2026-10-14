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
        get(k, d) { return k in stored ? stored[k] : (k in written ? written[k] : d); },
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

test("SPEED hide covers the whole #hud-speed plate (number + unit), not a second chip", () => {
  const shell = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const css = fs.readFileSync(path.join(ROOT, "css/hud.css"), "utf8");
  const H = load().HudElements;
  // One container, one unit plate — toggling SPEED cannot leave a stray KM/H.
  assert.match(shell, /id="hud-speed"[^>]*>\s*<span id="hud-speed-n">[\s\S]*?<span class="hud-unit">/);
  assert.match(css, /body\[data-hud-hide~="speed"\] #hud-speed/);
  assert.equal(H.ELEMENTS.filter((e) => e[0] === "speed").length, 1);
});
