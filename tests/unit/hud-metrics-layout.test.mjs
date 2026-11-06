import { readCssSource } from "../helpers/css-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const root = path.resolve(import.meta.dirname, "../..");

test("HUD metrics layout AUTO keeps every cluster and lets fitHud adapt", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  assert.match(game, /HUD_MET_LAYOUTS\s*=\s*\["auto", "full", "timing", "driver", "compact"\]/);
  assert.match(game, /HUD_VIS_MODES\s*=\s*\["auto", "on", "off"\]/);
  assert.match(game, /store\.get\("hudMapVis", "on"\)/);
  assert.match(game, /store\.get\("hudGapsVis", "on"\)/);
  assert.match(game, /hud-met-\(\[a-z\]\+\)/);
  // MAP / GAPS / LAYOUT are setting rows painted from one refresh (js/ui/setting-row.js).
  assert.match(game, /SettingRow\.paint\(\$\("pm-hudmap"\), hudMapVis\)/);
  assert.match(game, /SettingRow\.paint\(\$\("pm-hudgaps"\), hudGapsVis\)/);
  assert.match(game, /wireHudChips\("pm-hudmetrics", HUD_MET_LAYOUTS/);
  assert.match(game, /hudMapVis === "off" \? "off" : "on"/,
    "HUD fold paints MAP gold when the map is on, red NO MAP when off");
  assert.match(game, /hudGapsVis === "off" \? "off" : "on"/,
    "HUD fold paints GAPS the same gold/red pair");
  assert.match(game, /\["val", hudMetricsLayout\.toUpperCase\(\)\]/,
    "LAYOUT AUTO is a named cycle — fold chip stays text, not agency green");
  assert.match(game, /function hudLayoutNote\(\)/, "the LAYOUT help line names what AUTO resolved to");
  assert.match(game, /" Here AUTO is " \+ m\[1\]\.toUpperCase\(\)/);
  // Behaviour, not source text: the layout resolver and the class sync run over a stub body.
  const fn = (name, next) => { const a = hud.indexOf("function " + name); return hud.slice(a, hud.indexOf(next, a + 1)); };
  const bodyClasses = new Set();
  const body = { classList: { toggle: (c, on) => { if (on) bodyClasses.add(c); else bodyClasses.delete(c); return !!on; },
    contains: (c) => bodyClasses.has(c) } };
  const G = {};
  const ctx = { G, document: { body }, ONBOARD_IDS: { cockpit: 1 }, BCAM_IDS: {}, _fitKey: "", _cssRootKey: "",
    _hudVis: { map: null, gaps: null, mode: null, prof: null, hideMap: null, hideGaps: null, mapLow: null },
    _hudCamMode: "", _hudCamProf: "", CamModes: { CAM_MODES: [{ id: "chase" }, { id: "cockpit" }] } };
  vm.createContext(ctx);
  vm.runInContext([fn("resolveMetricsLayout", "let _hudLayoutKey"), fn("resolveHudVis", "// The last inputs"),
    fn("syncHudVisClasses", "function syncHudLayoutClasses"), fn("syncHudCamClasses", "\nfunction ")
      .replace(/\n\s*if \(typeof HudLayout[^\n]*/, "")].join("\n") +
    "\n;this.api = { resolveMetricsLayout, syncHudVisClasses, syncHudCamClasses };", ctx, { filename: absSrc("js/ui/hud.js") });
  const api = ctx.api;
  for (const want of [undefined, "auto"]) { G.hudMetricsLayout = want; assert.equal(api.resolveMetricsLayout(), "full", `${want} resolves to full`); }
  for (const want of ["timing", "driver", "compact"]) { G.hudMetricsLayout = want; assert.equal(api.resolveMetricsLayout(), want, "a forced name passes through"); }
  assert.equal(hud.includes("bandCapped"), false);
  // MAP AUTO hides on an onboard camera; MAP ON keeps it; MAP OFF hides it whatever the camera.
  G.hudMapVis = "auto"; api.syncHudVisClasses("cockpit");
  assert.ok(bodyClasses.has("hud-hide-map"), "MAP AUTO hides on an onboard camera");
  G.camMode = 0; G.hudMapVis = "on"; api.syncHudCamClasses();
  assert.ok(!bodyClasses.has("hud-hide-map"), "the camera sync re-resolves MAP: ON shows it again");
  G.hudMapVis = "off"; api.syncHudVisClasses("chase");
  assert.ok(bodyClasses.has("hud-hide-map"), "MAP OFF hides it on the chase camera too");
});

// A FORCED LAYOUT NAME HIDES; AUTO NEVER DOES, AND NOTHING TOUCHES MAP/GAPS.
// This assertion used to read "LAYOUT modes do not hide clusters" full stop —
// pinned while the hide rules were pulled out of AUTO, which had let a layout
// overrule the player's own MAP toggle. It pinned too much: with no rule behind
// ANY of the three forced names the control changed a body class and nothing
// else, and it was reported twice as doing nothing. resolveMetricsLayout()
// emits hud-met-timing / -driver / -compact ONLY for a name the player picked,
// so a rule keyed on one of them cannot fire from AUTO — which is what makes
// the hiding safe here and unsafe there.
test("a forced LAYOUT name hides; AUTO and MAP/GAPS are untouched", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  assert.match(css, /body\.hud-hide-map #minimap/);
  assert.match(css, /body\.hud-hide-gaps \.hud-gaps/);
  assert.match(css, /body\.hud-map-low #minimap/);
  // The three forced names each drop something.
  assert.match(css, /body\.hud-met-timing #hud-energy/);
  assert.match(css, /body\.hud-met-driver #hud-sectors/);
  assert.match(css, /body\.hud-met-compact #hud-sectors/);
  assert.match(css, /body\.hud-met-compact #hud-energy/);
  // AUTO resolves to `full`, and `full` is the base state: no rule may key on it.
  assert.equal(/body\.hud-met-full\b/.test(css), false);
  // And no layout may reach the two clusters that have their own controls.
  for (const sel of ["#minimap", ".hud-gaps"])
    for (const name of ["timing", "driver", "compact"])
      assert.equal(css.includes("body.hud-met-" + name + " " + sel), false,
        `LAYOUT ${name} must not touch ${sel} — MAP and GAPS are the player's`);
});

// MINIMAL MEANS FEWER WIDGETS, NOT SMALLER ONES. The profile used to hide the
// sector box and stop, while a fit-maths defect (a hidden #hud-sectors made
// fitHud read the right safe-area inset as the whole viewport) floored every
// cluster to the 0.4 zoom guard — reported as "the simple HUD just makes things
// tiny". Both halves are pinned: the profile drops real widgets, and fitHud
// never derives an inset from an element that has no box.
test("MINIMAL drops widgets, and a hidden anchor cannot poison the fit", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  for (const sel of ["#hud-sectors", "#hud-box-best", "#hud-energy", "#hud-ot", "#hud-aero", "#hud-bb"])
    assert.match(css, new RegExp("body\\.hud-prof-minimal " + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  // The inset reads are guarded on the rect having a WIDTH, and each falls back
  // to the other side rather than to a viewport-wide number.
  assert.match(hud, /mmR && mmR\.width \? Math\.max\(0, mmR\.left - 10 \* mz\) : null/);
  assert.match(hud, /scR && scR\.width \? Math\.max\(0, window\.innerWidth - scR\.right - 10 \* sz\) : null/);
  assert.match(hud, /const sal = salM != null \? salM : \(sarM != null \? sarM : 0\);/);
  assert.match(hud, /const sar = sarM != null \? sarM : \(salM != null \? salM : 0\);/);
});

// THE TWO MEASURED OFFSETS THE HUD CHROME HANGS OFF. Both replaced a literal
// that was only ever right for one layout: the dropped gap strip parked 62px
// down whatever the band's real height, and the track-limits chip hung 4.8em
// below a sector box that three configurations hide outright.
test("dropped gaps and the limits chip ride measured offsets", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  assert.match(css, /:root\[data-gap-drop\] \.hud-gaps \{\s*\n\s*top: calc\(8px \+ var\(--sat\) \/ var\(--hud-z\) \+ var\(--hud-top-h, var\(--hud-top-h-0\)\) \+ 4px\);/);
  assert.match(css, /var\(--hud-sec-h, 4\.8em\)/);
  assert.match(hud, /(?:setProperty\(|hStyle\(root, )"--hud-top-h"/);
  assert.match(hud, /(?:setProperty\(|hStyle\(root, )"--hud-sec-h"/);
  // The dock stand-off is CONDITIONAL: an unconditional one dragged a top-right
  // chip into the middle of the screen on every viewport tall enough for the
  // two never to meet.
  assert.match(hud, /limBot > dockR\.top/);
  // And when the right column really is full the chip crosses to the LEFT one
  // rather than walking into the middle — the stand-off is the last resort, not
  // the first answer, so the two are mutually exclusive.
  assert.match(css, /:root\[data-limits-left\] #hud-limits/);
  // The chip clears the LOWER of the two things that can occupy this column:
  // the map/strip edge, and the metrics panel when it is parked here. Both
  // widgets used to resolve to the same slot and the panel won, which the chip
  // being `hidden` until a real strike kept out of every fixture.
  assert.match(css, /top: calc\(max\(var\(--hud-left-h, 112px\), var\(--hud-metrics-b, 0px\)\) \+ 8px\)/);
  assert.match(hud, /(?:setProperty\(|hStyle\(root, )"--hud-left-h"/);
  assert.match(hud, /(?:setProperty\(|hStyle\(root, )"--hud-metrics-b"/);
  // ONE DIRECTION: the map decides where the panel goes, the panel decides
  // where the chip goes. The panel's own bottom must never feed back into the
  // column edge it is positioned from — that is a latch, and this file has been
  // bitten by one before.
  const leftPxCall = (hud.match(/(?:setProperty\(|hStyle\(root, )"--hud-left-px",[^;]*;/) || [""])[0];
  assert.ok(leftPxCall, "--hud-left-px is not published at all");
  assert.ok(!/gm/i.test(leftPxCall),
    "--hud-left-px must not read the metrics panel's own box: " + leftPxCall);
  assert.match(hud, /\blimLeft = hitsRight && leftRoom && /);   // a let since #2797: the stored restack replays it
  // Dock inset is published AFTER zoom caps, from BOOST / leftmost dock
  // control, using the plate's painted zoom + screen-px air, then one
  // painted-overlap grow (CI oversize workers=2: stale dockLeft vs BOOST).
  assert.match(hud, /btn-boost/);
  assert.match(hud, /DOCK_AIR \/ z/);
  assert.match(hud, /secR\.right > left - DOCK_AIR/);
  // After --hud-z-top, flush #minimap so currentCSSZoom catches the cap
  // (selected-2 ui-redesign: compact mmCss 142 = 110×staleZoom/zTop).
  assert.match(hud, /if \(els\.minimap\) void els\.minimap\.offsetHeight/);
  // Painted announce collapse must be terminal in the fit: a trailing
  // radioTopSlot re-lit hud-radio-top and cleared data-lane-collapsed.
  // fitHud runs its cap pass and its paint pass through fitPass: the fit is both.
  const fitBody = hud.slice(hud.indexOf("function fitHud"), hud.indexOf("\nfunction ", hud.indexOf("function fitPass") + 1));
  const paintCollapse = fitBody.indexOf("radioPaintedCollapse(root)");
  assert.ok(paintCollapse > 0, "fitHud runs the painted announce collapse");
  assert.equal(fitBody.indexOf("radioTopSlot(", paintCollapse), -1,
    "no radioTopSlot after painted announce collapse (undoes the collapse)");
  const lane = fs.readFileSync(path.join(root, "js/ui/hud-radio-lane.js"), "utf8");   // the helper left hud.js (#3261)
  const helper = lane.slice(lane.indexOf("function radioPaintedCollapse"), lane.indexOf("// PERF #2151"));
  assert.ok(helper.includes('toggleAttribute("data-lane-collapsed", true)'), "the helper paints data-lane-collapsed on a hit");
  // invalidateFit re-picks the slot, so it must run the same guard right after (it used to leave a relit top slot until the next tick).
  const inv = hud.slice(hud.indexOf("function invalidateFit"), hud.indexOf("_invalidateFit = invalidateFit"));
  assert.ok(inv.indexOf("radioPaintedCollapse(root)") > inv.indexOf("radioTopSlot("), "invalidateFit runs the painted collapse after its own radioTopSlot");
});

test("HUD layout options live in a full-width pause submenu", () => {
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const css = readCssSource("css/components.css");
  assert.match(html, /id="pm-hud-details"/);
  assert.match(html, /id="pm-hud-details"[\s\S]*id="pm-hidehud"/);
  assert.match(html, /id="pm-hud-details"[\s\S]*id="pm-hudscale"/);
  // Setting rows (js/ui/setting-row.js), one per HUD setting, not KEY: VALUE cycles.
  for (const id of ["pm-hidehud", "pm-hudprofile", "pm-hudmetrics", "pm-hudmap", "pm-hudgaps"]) {
    assert.match(html, new RegExp(`id="${id}" class="set-row" role="group" aria-labelledby="${id}-label"`), id + " is a setting row");
    assert.match(html, new RegExp(`<select id="${id}-sel" aria-labelledby="${id}-label">`), id + " has its select");
  }
  assert.doesNotMatch(html, /HUD: ON|STYLE: STANDARD|LAYOUT: AUTO/);
  assert.match(css, /#pm-hud-details > \[role="group"\]/, "the fold's own group is child-scoped so the chip rows inside stay rows");
  assert.match(css, /grid-area:\s*hudopts/);
});

test("a hidden HUD does not keep measuring or painting the map", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const fit = hud.slice(hud.indexOf("function fitHud"), hud.indexOf("function updateHud"));
  assert.match(fit, /classList.contains\("hud-hidden"\)/);
  const mmSrc = fs.readFileSync(path.join(root, "js/ui/hud-minimap.js"), "utf8");   // #1656: the minimap's own file
  const start = mmSrc.indexOf("function drawMinimap");
  const draw = mmSrc.slice(start, mmSrc.indexOf("\nfunction ", start + 1));
  const hidden = new Set();
  const mctx = { G: { player: {}, cars: [], track: { map: {} } }, _mmKey: "measured", document: { body: { classList: { contains: (c) => hidden.has(c) } } } };
  vm.createContext(mctx);
  vm.runInContext(draw + "\n;this.draw = drawMinimap;", mctx, { filename: absSrc("js/ui/hud-minimap.js") });
  hidden.add("hud-hidden");
  mctx.draw();
  assert.equal(mctx._mmKey, null, "a hidden HUD stops at the class test and forgets its measurement");
  hidden.clear(); hidden.add("hud-hide-map"); mctx._mmKey = "measured";
  mctx.draw();
  assert.equal(mctx._mmKey, null, "so does a hidden map");
  mctx.G.player = null; mctx._mmKey = "measured";
  hidden.clear();
  mctx.draw();   // would throw on the missing player if it got past the guard
  assert.equal(mctx._mmKey, "measured", "no player: it returns before it touches anything");
});

// ONE DEFAULT. The store default is "full" (and settings-export.js's def), but
// an unknown stored value and the façade setter fell back to "auto": a garage
// file listed it as CHANGED, and the appearance studio — which offered no AUTO
// chip — showed no layout selected (review 2026-10-04, verify-core #16).
test("an unknown HUD layout falls back to the shipped FULL, and the studio jumps to the row that shows AUTO", () => {
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  const studio = fs.readFileSync(path.join(root, "js/ui/appearance-studio.js"), "utf8");
  const exp = fs.readFileSync(path.join(root, "js/ui/settings-export.js"), "utf8");
  assert.match(game, /store\.get\("hudMetricsLayout", "full"\)/);
  assert.match(game, /if \(HUD_MET_LAYOUTS\.indexOf\(hudMetricsLayout\) < 0\) hudMetricsLayout = "full";/);
  assert.match(game, /if \(HUD_MET_LAYOUTS\.indexOf\(v\) < 0\) v = "full";\s*\n\s*hudMetricsLayout = v;/);
  assert.match(exp, /k: "hudMetricsLayout", lane: "json", group: "hud", def: "full"/);
  // One home (#2846): the studio jumps to the HUD & CAMERA LAYOUT row, which offers AUTO.
  assert.match(studio, /"HUD LAYOUT is in HUD & CAMERA", "display", "pm-hudmetrics-sel"/,
    "the studio's HUD layout entry is a jump to the pause-menu row that shows AUTO");
});

// A LAYOUT hides READOUTS, never a CUE. TIMING and COMPACT once hid #hud-pit
// (the only thing that makes the hold-to-pit gesture discoverable) and every
// state of #hud-tyre, whose data-pit commit / lane / box fill is the only sign
// the dwell is registering — so in those layouts a stop could not be called
// on purpose.
test("TIMING and COMPACT drop the tyre readout but never the pit cue or the dwell feedback", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  for (const name of ["timing", "compact"]) {
    assert.equal(new RegExp("body\\.hud-met-" + name + " #hud-pit").test(css), false,
      `LAYOUT ${name} must not hide #hud-pit — it is already hidden unless a cue is live`);
    assert.match(css, new RegExp("body\\.hud-met-" + name + " #hud-tyre"), `LAYOUT ${name} still drops the idle tyre chip`);
  }
  const back = css.match(/body:is\(\.hud-met-timing, \.hud-met-compact\)([^{]*)#hud-tyre\[data-pit\]([^{]*)\{([^}]*)\}/);
  assert.ok(back, "a pit state brings the tyre chip back in TIMING / COMPACT");
  assert.match(back[3], /display:\s*flex\s*!important/, "…over the layout's own !important hide");
  assert.match(back[1], /:not\(\[data-hud-hide~="tyre"\]\)/, "the player's own TYRE toggle still wins");
  assert.match(back[2], /:not\(\[hidden\]\)/, "and a chip hidden because TYRE WEAR is off stays hidden");
});

// NEW-4: cockpit float + wheel LCD share one SPD plate (HudReadouts.spdPlate).
// paintInstruments must not call AppearanceOpts.speed / unitLabel alone — that
// left KM/H on the float while the LCD said KPH/MPH.
test("paintInstruments paints SPD via HudReadouts.spdPlate (one MPH|KPH plate)", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const roCtx = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(root, "js/ui/hud-readouts.js"), "utf8") + "\n;this.RO = HudReadouts;", roCtx, { filename: absSrc("js/ui/hud-readouts.js") });
  const RO = roCtx.RO;
  assert.deepEqual({ ...RO.spdPlate(160.934, "mph") }, { n: 100, unit: "MPH" }, "one MPH plate: the digits and the unit agree");
  assert.deepEqual({ ...RO.spdPlate(100, "kmh") }, { n: 100, unit: "KPH" }, "and never KM/H");
  const paint = hud.slice(hud.indexOf("function paintInstruments"), hud.indexOf("function updateHud"));
  const unitEl = {}, speedEl = {};
  const pctx = { clamp: (v, a, b) => Math.max(a, Math.min(b, v)), IDLE_RPM: 4000, MAX_RPM: 12000, _redline: false, _rpmPct: -1,
    document: { body: { classList: { contains: (c) => c === "cockpit-cam" } } }, G: { dashKph: (v) => v },
    _ro: { spdPlate: (k) => ({ n: Math.round(k), unit: "MPH" }) },
    els: { speed: speedEl }, hText: (el, s) => { el.text = s; }, speedUnitEl: () => unitEl };
  vm.createContext(pctx);
  vm.runInContext(paint + ";this.paintInstruments = paintInstruments;", pctx, { filename: absSrc("js/ui/hud.js") });
  pctx.paintInstruments({ rpm: 5000, speed: 80 });
  assert.equal(speedEl.text, "80", "SPD digits come from the shared plate");
  assert.equal(unitEl.text, "MPH", "and the unit from the same plate — AppearanceOpts is not even in scope here");
});

test("paintInstruments never paints a negative speed in reverse; the wheel LCD and phone pad clamp to 0 (hunt3 4-F4)", () => {
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  const paint = hud.slice(hud.indexOf("function paintInstruments"), hud.indexOf("function updateHud"));
  const els = { speed: {} };
  const ctx = {
    clamp: (v, a, b) => Math.max(a, Math.min(b, v)), IDLE_RPM: 4000, MAX_RPM: 12000, _redline: false, _rpmPct: -1,
    document: { body: { classList: { contains: (c) => c === "cockpit-cam" } } },
    G: { dashKph: (v) => v * 3.6 * 1.43 },   // the sign passes through dashKph (vStd scale) as on the tip
    _ro: { spdPlate: (k) => ({ n: Math.round(k), unit: "KPH" }) },   // spdPlate passes the sign through too
    els, hText: (el, s) => { el.text = s; }, speedUnitEl: () => ({}),
  };
  vm.createContext(ctx);
  vm.runInContext(paint + ";this.paintInstruments = paintInstruments;", ctx);
  ctx.paintInstruments({ rpm: 5000, speed: -5 });   // REVERSE_MAX: brake held at a standstill
  assert.equal(els.speed.text, "0", "reverse reads 0, not a minus sign");
  ctx.paintInstruments({ rpm: 5000, speed: 50 });
  assert.equal(els.speed.text, "257", "forward speed is untouched");
});

// THE TOWER'S WIDTH MAY NOT DEPEND ON WHICH FACE IS PAINTING (#3064). Slots reserved in `ch` measured
// ~1.32x wider in the fallback face than in Barlow Condensed, so whichever HUD SIZE stamped its fit
// before fonts-hud.css swapped in capped the band lower (667x375: 0.89 at HUD 200 vs 0.97 at HUD 100).
test("tower slots reserve in em, and a late font load refits (#3064)", () => {
  const css = fs.readFileSync(path.join(root, "css/hud.css"), "utf8");
  const hud = fs.readFileSync(path.join(root, "js/ui/hud.js"), "utf8");
  for (const id of ["hud-pos", "hud-lap", "hud-time", "hud-best", "hud-delta-n"]) {
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].filter(([, sel, body]) =>
      new RegExp(`#${id}(?![\\w-])`).test(sel) && /min-width/.test(body));
    assert.ok(rules.length, `#${id} reserves a min-width`);
    for (const [, sel, body] of rules) assert.doesNotMatch(body, /\d\s*ch\b/, `${sel.trim()}: min-width in ch follows the fallback face`);
  }
  assert.match(hud, /document\.fonts\.addEventListener\("loadingdone"/);
});
