// TrackMaps.planPreview — how the circuit-preview card spends its space.
//
// WHY THIS FILE EXISTS. Every defect this planner has had was an arithmetic
// bug, and every one of them was found by opening a browser at one particular
// viewport, at one particular UI SIZE, on one particular circuit — minutes per
// look under SwiftShader, and only if you thought to try that cell. The maths
// needs no browser, so the regressions live here instead, in milliseconds.
//
// Regressions this guards, each measured before it was fixed:
//   1. a TALL circuit fitted into a full-width slot — Jeddah (aspect 0.50) came
//      out 128x255 in a 406x416 card, a sliver with ~190px of dead card beside
//      it and its corner numbers piled into an unreadable blob
//   2. the caption's height subtracted from the budget even when the caption is
//      NOT stacked under the map (it sits beside it in the `beside` shape)
//   3. `beside` chosen for a WIDE circuit that was merely starved of height —
//      Singapore went 181x117 beside where stacking gives 315x204
//   4. the budget going negative at UI SIZE 175% and collapsing the map onto
//      its floor (36x72), because visual px were subtracted from local px
//   5. a phone-width card being torn into two columns it cannot seat

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

// planPreview touches nothing but Math, so the module can be evaluated on its
// own — no circuits, no spline engine, no DOM.
function loadPlanPreview() {
  const sandbox = { Math, Object, JSON, Array, isNaN, isFinite, parseInt, parseFloat };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const src = fs.readFileSync(path.join(ROOT, "js/track/maps.js"), "utf8")
    .replace(/^const\b/gm, "var");
  vm.runInContext(src, ctx, { filename: "js/track/maps.js" });
  vm.runInContext("this.TrackMaps = TrackMaps;", ctx);
  return ctx.TrackMaps.planPreview;
}

const planPreview = loadPlanPreview();

// MEASURED, not invented — Chromium at 1280x720 with the 50/50 column split:
// a 487px card less its 22px of padding, in a 563px scrolling section. The 175%
// row is the same card at UI SIZE 175%, where every LOCAL px shrinks by 1.75
// while the caption inside it grows taller as its text wraps. That divergence
// is the whole reason case 4 below exists.
const DESKTOP = { cardInnerW: 465, sectionH: 563, labelH: 21, infoH: 94, padY: 22, gap: 14 };
const DESKTOP_175 = { cardInnerW: 266, sectionH: 322, labelH: 21, infoH: 150, padY: 22, gap: 14 };
// A phone card: too narrow to seat a map and a caption side by side.
const PHONE = { cardInnerW: 306, sectionH: 700, labelH: 20, infoH: 120, padY: 20, gap: 12 };

// Real circuit aspects, spanning the range the picker actually shows.
const JEDDAH = 0.50, MONZA = 0.58, BAHRAIN = 0.67, BAKU = 1.37, SINGAPORE = 1.55;

test("a tall circuit puts the caption beside the map rather than strand the card", () => {
  const p = planPreview({ ...DESKTOP, aspect: JEDDAH });
  assert.equal(p.shape, "beside");
  // The whole point: it must be bigger than the 128x255 sliver that shipped.
  assert.ok(p.slotW >= 200, `expected a usable width, got ${p.slotW}`);
  assert.ok(p.slotH >= 400, `expected the column's height to be spent, got ${p.slotH}`);
});

test("a wide circuit stacks and uses the card's full width", () => {
  for (const [name, a] of [["baku", BAKU], ["singapore", SINGAPORE]]) {
    const p = planPreview({ ...DESKTOP, aspect: a });
    assert.equal(p.shape, "stacked", `${name} should stack`);
    assert.equal(p.slotW, Math.floor(DESKTOP.cardInnerW), `${name} should fill the width`);
  }
});

test("the caption's height is only charged to the budget when it is stacked", () => {
  // Same card, same circuit, the two shapes: `beside` must not pay for a
  // caption that is sitting next to the map rather than under it.
  const tall = planPreview({ ...DESKTOP, aspect: JEDDAH });
  const wide = planPreview({ ...DESKTOP, aspect: BAKU });
  assert.equal(tall.shape, "beside");
  assert.equal(wide.shape, "stacked");
  assert.ok(tall.slotH > wide.slotH,
    `beside should get the taller budget (${tall.slotH} vs ${wide.slotH})`);
});

test("a wide circuit starved of height stacks anyway — sideways makes it worse", () => {
  // Regression 3. At 175% the dead-space test alone would flip Singapore to
  // `beside`, where it measured 181x117 against 315x204 stacked.
  const p = planPreview({ ...DESKTOP_175, aspect: SINGAPORE });
  assert.equal(p.shape, "stacked");
  assert.ok(p.slotW > p.slotH, "a wide circuit's slot should stay wider than it is tall");
});

test("no UI SIZE collapses the map to a thumbnail", () => {
  // Regression 4. Every circuit, at the most cramped card the sliders can make.
  for (const [name, a] of [["jeddah", JEDDAH], ["monza", MONZA], ["bahrain", BAHRAIN],
    ["baku", BAKU], ["singapore", SINGAPORE]]) {
    const p = planPreview({ ...DESKTOP_175, aspect: a });
    assert.ok(p.slotW >= 120, `${name}: width collapsed to ${p.slotW}`);
    assert.ok(p.slotH >= 130, `${name}: height collapsed to ${p.slotH}`);
  }
});

test("a phone-width card is never torn into two columns", () => {
  for (const a of [JEDDAH, MONZA, BAHRAIN, BAKU, SINGAPORE]) {
    assert.equal(planPreview({ ...PHONE, aspect: a }).shape, "stacked");
  }
});

test("a 340px card seats a tall circuit beside its caption", () => {
  // iPad landscape at 150%: stacking used 240px of map plus a 175px caption
  // in a 378px card, clipping the last fact chip. Side-by-side fits both.
  const p = planPreview({ cardInnerW: 347, sectionH: 412, labelH: 21,
    infoH: 175, padY: 20, gap: 10, aspect: BAHRAIN });
  assert.equal(p.shape, "beside");
  assert.ok(p.slotW >= 120 && p.slotH >= 170);
});

test("the slot always honours the circuit's aspect and its own caps", () => {
  for (const card of [DESKTOP, DESKTOP_175, PHONE]) {
    for (const a of [JEDDAH, MONZA, BAHRAIN, 1.0, BAKU, SINGAPORE, 2.5]) {
      const p = planPreview({ ...card, aspect: a });
      assert.ok(p.slotW > 0 && p.slotH > 0, "a slot must have positive extent");
      assert.ok(p.slotW <= card.cardInnerW,
        `slot ${p.slotW} must fit the card's ${card.cardInnerW}`);
      // slotW is the width the height implies, clamped by the card — so it can
      // be narrower than slotH*a, never wider.
      assert.ok(p.slotW <= Math.round(p.slotH * a) + 1,
        `slot ${p.slotW}x${p.slotH} is wider than aspect ${a} allows`);
    }
  }
});

test("noScroll caps the slot at the measured ceiling — the floor cannot win", () => {
  // The pair-on select section clips (overflow: hidden), so the 240px
  // scroll-column floor cannot be spent there: it pinned a 162x240 bitmap
  // into a 63px band (852x393 @200%) and object-fit painted a sliver.
  const band = { aspect: BAHRAIN, cardInnerW: 162, sectionH: 96, labelH: 18,
    infoH: 0, padY: 10, gap: 6, noScroll: true };
  const p = planPreview(band);
  const scrolly = planPreview({ ...band, noScroll: false });
  assert.ok(p.slotH <= band.sectionH, `noScroll slot ${p.slotH} must fit the ${band.sectionH}px section`);
  assert.ok(scrolly.slotH > band.sectionH, "without noScroll the floor exceeds the section (the old behaviour)");
  assert.ok(p.slotH >= 40, "the 40px transient floor still guards degenerate frames");
});

test("a card measured before layout still gets a usable slot", () => {
  // First paint: no section height yet. The width and the aspect are all there
  // is, and the result must still be drawable rather than zero or NaN.
  const p = planPreview({ aspect: JEDDAH, cardInnerW: 385 });
  assert.ok(Number.isFinite(p.slotW) && Number.isFinite(p.slotH));
  assert.ok(p.slotW >= 120 && p.slotH >= 72);
});

test("garbage in does not produce NaN out", () => {
  for (const bad of [{}, { aspect: 0 }, { aspect: -3, cardInnerW: -100 },
    { aspect: NaN, sectionH: NaN }, { aspect: "x", cardInnerW: null }]) {
    const p = planPreview(bad);
    assert.ok(Number.isFinite(p.slotW) && Number.isFinite(p.slotH),
      `non-finite slot from ${JSON.stringify(bad)}`);
    assert.ok(p.slotW > 0 && p.slotH > 0);
  }
  const none = planPreview();
  assert.ok(Number.isFinite(none.slotW) && Number.isFinite(none.slotH));
});
