import { readCssSource } from "../helpers/css-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

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
  assert.match(hud, /function resolveMetricsLayout\(\)/);
  assert.match(hud, /return "full";/);
  assert.equal(hud.includes("bandCapped"), false);
  assert.match(hud, /function syncHudVisClasses\(/);
  const camSync = hud.slice(hud.indexOf("function syncHudCamClasses"), hud.indexOf("function flashSector"));
  assert.match(camSync, /syncHudVisClasses\(modeId\)/);
  assert.doesNotMatch(camSync, /if \(key === _hudCamKey\) return;/);
  assert.match(hud, /hud-hide-map/);
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
  assert.match(css, /:root\[data-gap-drop\] \.hud-gaps \{\s*\n\s*top: calc\(8px \+ var\(--sat\) \/ var\(--hud-z\) \+ var\(--hud-top-h, 54px\) \+ 4px\);/);
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
  assert.match(hud, /const limLeft = hitsRight && leftRoom;/);
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
  const fitBody = hud.slice(hud.indexOf("function fitHud"), hud.indexOf("\nfunction ", hud.indexOf("function fitHud") + 1));
  const paintCollapse = fitBody.indexOf('toggleAttribute("data-lane-collapsed", true)');
  assert.ok(paintCollapse > 0, "fitHud paints data-lane-collapsed on a hit");
  assert.equal(fitBody.indexOf("radioTopSlot(", paintCollapse), -1,
    "no radioTopSlot after painted announce collapse (undoes the collapse)");
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
  const mm = hud.slice(hud.indexOf("function drawMinimap"), hud.indexOf("function drawMinimap") + 800);
  assert.match(mm, /if \(!player \|\| !track \|\| !track\.map\) return;/);
  assert.match(mm, /classList.contains\("hud-hidden"\)/);
});

// ONE DEFAULT. The store default is "full" (and settings-export.js's def), but
// an unknown stored value and the façade setter fell back to "auto": a garage
// file listed it as CHANGED, and the appearance studio — which offered no AUTO
// chip — showed no layout selected (review 2026-10-04, verify-core #16).
test("an unknown HUD layout falls back to the shipped FULL, and the studio can show AUTO", () => {
  const game = fs.readFileSync(path.join(root, "js/game.js"), "utf8");
  const studio = fs.readFileSync(path.join(root, "js/ui/appearance-studio.js"), "utf8");
  const exp = fs.readFileSync(path.join(root, "js/ui/settings-export.js"), "utf8");
  assert.match(game, /store\.get\("hudMetricsLayout", "full"\)/);
  assert.match(game, /if \(HUD_MET_LAYOUTS\.indexOf\(hudMetricsLayout\) < 0\) hudMetricsLayout = "full";/);
  assert.match(game, /if \(HUD_MET_LAYOUTS\.indexOf\(v\) < 0\) v = "full";\s*\n\s*hudMetricsLayout = v;/);
  assert.match(exp, /k: "hudMetricsLayout", lane: "json", group: "hud", def: "full"/);
  assert.match(studio, /choice\(hud, "Layout", "hudMetricsLayout", \[\["auto", "Auto"\]/,
    "AUTO is a pause-menu choice, so the studio row must be able to show it selected");
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
  const ro = fs.readFileSync(path.join(root, "js/ui/hud-readouts.js"), "utf8");
  assert.match(ro, /function spdPlate\(/);
  assert.match(ro, /return \(units \|\| spdUnits\(\)\) === "mph" \? "MPH" : "KPH"/);
  const paint = hud.slice(hud.indexOf("function paintInstruments"), hud.indexOf("function updateHud"));
  assert.match(paint, /_ro\.spdPlate\(/);
  assert.match(paint, /plate\.unit/);
  assert.doesNotMatch(paint, /AppearanceOpts\.unitLabel/);
});
