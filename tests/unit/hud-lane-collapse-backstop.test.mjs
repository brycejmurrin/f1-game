/* hud-lane-collapse-backstop — perf hunt P5 (#4545) row 1.
 *
 * A narrow dock lane collapses the radio card (#announce[data-lane-collapsed]);
 * HudLayout.clearReadouts then reopens it at full width in a free slot
 * (hud-radio-lane.js "collapse it, and HudLayout.clearReadouts reopens…").
 * The lane's same-key 3 s backstop re-ran announceLane from CACHED rects and
 * set the attribute again, so every ~3 s the card collapsed for a frame, the
 * clearance ResizeObserver ran clearReadouts twice and reopened it (live,
 * 844x390 touch: 12 collapse→reopen pairs in 22 s, each exactly one frame
 * apart). Nothing the lane reads had changed, so the backstop must not undo a
 * later owner's reopen; a key change or a forced refresh still decides afresh.
 *
 * Run: node --test tests/unit/hud-lane-collapse-backstop.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = "js/ui/hud-radio-lane.js";
const R = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });

function boot() {
  const dom = makeDom();
  const doc = dom.document;
  const sb = {
    Math, Object, Array, Number, String, JSON, Map, Set, parseFloat, isFinite, Infinity,
    document: doc, window: null,
    getComputedStyle: () => ({ getPropertyValue: () => "0" }),
  };
  sb.window = sb;
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, SRC), "utf8").replace(/^const\b/gm, "var"), sb, { filename: absSrc(SRC) });

  const mk = (cls, parent, rect) => { const e = doc.createElement("div"); e.className = cls; parent.appendChild(e); e._rect = rect; return e; };
  const tower = mk("hud-top", doc.body, R(40, 8, 240, 54));
  const dockL = mk("dock", doc.body, R(0, 100, 380, 200)), dockR = mk("dock", doc.body, R(470, 100, 374, 200));
  // One lit group per dock, both in the card's rows: the lane between them is 74 px (< RADIO_UNDER_MIN 96).
  mk("grp", dockL, R(0, 100, 380, 200));
  mk("grp", dockR, R(470, 100, 374, 200));
  const announce = dom.byId("announce");
  announce.hidden = false;
  announce._rect = R(388, 120, 74, 60);
  const els = { announce, hudSectors: null, minimap: null, tyre: null, flag: null, gapA: null, gapB: null, hudLimits: null };

  const root = doc.documentElement;
  const set = (el, k, v) => { if (el.style.getPropertyValue(k) !== String(v)) el.style.setProperty(k, v); };
  const lane = sb.HudRadioLane.create({ els }, {
    vpW: () => 844, vpH: () => 390,
    hStyle: set, hUnstyle: (el, k) => el.style.removeProperty(k),
    hToggle: (el, c, on) => el.classList.toggle(c, !!on),
    fitKey: () => "fit", top: () => tower, docks: () => [dockL, dockR],
  });
  let collapses = 0;
  const raw = announce.toggleAttribute ? announce.toggleAttribute.bind(announce) : null;
  announce.toggleAttribute = (name, force) => {
    const had = announce.hasAttribute(name);
    const on = force === undefined ? !had : !!force;
    if (on && !had && name === "data-lane-collapsed") collapses++;
    if (raw) return raw(name, force);
    if (on) announce.setAttribute(name, ""); else announce.removeAttribute(name);
    return on;
  };
  return { lane, root, announce, collapses: () => collapses };
}

const collapsed = (h) => h.announce.hasAttribute("data-lane-collapsed");
// clearReadouts' "stale lane collapse" branch (js/ui/hud-layout.js): reopen at full width in a free slot.
const reopenLikeClearReadouts = (h) => { h.announce.style.setProperty("--announce-lane-w", "844px"); h.announce.removeAttribute("data-lane-collapsed"); };

test("a narrow lane collapses the card on a decided (forced) pass", () => {
  const h = boot();
  h.lane.announceLaneTick(h.root, true);
  assert.equal(collapsed(h), true, "74 px lane < 96: collapsed");
  assert.equal(h.root.style.getPropertyValue("--announce-lane-w"), "0px", "the zero-width pin stays (sector-plate guard)");
});

test("the same-key backstop does not re-collapse a card clearReadouts reopened", () => {
  const h = boot();
  h.lane.announceLaneTick(h.root, true);
  reopenLikeClearReadouts(h);
  const before = h.collapses();
  for (let i = 0; i < 95; i++) h.lane.announceLaneTick(h.root, false);   // ~9.5 s of 10 Hz ticks: three backstops
  assert.equal(h.collapses() - before, 0, `backstop re-collapsed the reopened card ${h.collapses() - before}× (want 0)`);
  assert.equal(collapsed(h), false, "the card stays where clearReadouts placed it");
  assert.equal(h.root.style.getPropertyValue("--announce-lane-w"), "0px", "lane vars are still re-applied");
});

test("a forced refresh still decides afresh and re-collapses", () => {
  const h = boot();
  h.lane.announceLaneTick(h.root, true);
  reopenLikeClearReadouts(h);
  h.lane.announceLaneTick(h.root, true);
  assert.equal(collapsed(h), true, "force = a decided pass, not the backstop");
});

test("a lane-key change still re-collapses", () => {
  const h = boot();
  h.lane.announceLaneTick(h.root, true);
  reopenLikeClearReadouts(h);
  h.announce.hidden = true; h.lane.announceLaneTick(h.root, false);    // card hides (key: A → a)
  h.announce.hidden = false; h.lane.announceLaneTick(h.root, false);   // next call shows: key changes again
  assert.equal(collapsed(h), true, "a new key re-measures and re-decides");
});
