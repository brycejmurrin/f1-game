#!/usr/bin/env node
// LAYOUT AUDIT — every screen, on every shape of display, measured the same way.
//
// WHY THIS EXISTS. The layout bugs in this app are not bugs in a screen, they are
// bugs in a CELL of a matrix: a screen crossed with a viewport. The circuit list
// stopped 49px above the sheet floor only in the two-column branch; the garage
// stacked its categories only at the sheet's 430px floor width; the preview card
// clipped its chip row only where the column was shorter than the card. Every one
// of those was found by looking at one screenshot and missed everywhere else,
// because nothing enumerated the matrix.
//
// So: MEASURE FIRST, LOOK SECOND. Screenshots are slow (SwiftShader, seconds to
// minutes each) and prove nothing you can grep. The probe below reads geometry
// out of the live DOM — what overflows, what is clipped, what is off screen, what
// is too small to tap, what scrolls and whether it reaches the floor — for every
// (screen, viewport) pair, and writes both JSON and a gallery page. Shots are
// opt-in (--shots) and are for the eye, after the numbers say where to look.
//
//   node tools/layout-audit.mjs                  # measure every cell, write JSON + HTML
//   node tools/layout-audit.mjs --shots          # also capture a PNG per cell (slow)
//   node tools/layout-audit.mjs --screens=select,garage --viewports=ios-*
//   node tools/layout-audit.mjs --scale=100,130,150   # each viewport at each UI size
//   node tools/layout-audit.mjs --circuits             # the two map screens, per circuit aspect
//   node tools/layout-audit.mjs --circuits=jeddah,baku # or name them
//
// --scale JOINS THE VIEWPORT AXIS rather than becoming a third dimension of the
// grid: a cell is identified as `ios-15-landscape@130`, so the queue, the merge
// and the HTML table all keep working unchanged, and the scaled variants sit in
// their own columns next to the size they came from — which is where you want
// them when the question is "what did two notches up cost this screen?".
//
// Output: artifacts/layout-audit/{audit.json,index.html,shots/*.png}
import { createRequire } from "node:module";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { applyScale, parseScales, scaleTag } from "./ui-scale-axis.mjs";
import { parseCircuits, circuitTag, pickCircuit } from "./circuit-axis.mjs";
import { pickChromium } from "./harness.mjs";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const require = createRequire(ROOT + "/");
const { chromium, devices } = require("playwright");

const OUT = path.join(ROOT, "artifacts", "layout-audit");
const SHOT_DIR = path.join(OUT, "shots");

// ---------------------------------------------------------------- the matrix
// VIEWPORTS: the shapes a display can be, not the devices people own. Each one
// exists because some layout branch turns on or off at it.
const VIEWPORTS = [
  // The 4th element is the SAFE-AREA INSET to inject (see applyInsets): Chromium
  // reports env(safe-area-inset-*) as 0 under device emulation, so a notch has
  // to be simulated or it is never tested at all. iPhone 15 Pro, measured:
  // 59/34 top/bottom upright; on its side the notch moves to the LEADING edge.
  ["ios-iphone-portrait",   { ...devices["iPhone 15 Pro"], deviceScaleFactor: 2 },
    "the phone as most people hold it", { t: 59, r: 0, b: 34, l: 0 }],
  ["ios-iphone-landscape",  { ...devices["iPhone 15 Pro landscape"], deviceScaleFactor: 2 },
    "the shape the game is PLAYED in — 343px of height for everything",
    { t: 0, r: 59, b: 21, l: 59 }],
  ["ios-ipad-portrait",     { ...devices["iPad Pro 11"], deviceScaleFactor: 1 },
    "wide sheet, tall window: the case that wants bands, not columns"],
  ["ios-ipad-landscape",    { ...devices["iPad Pro 11 landscape"], deviceScaleFactor: 1 },
    "wide and short: the two-column case at its smallest"],
  ["desktop-1280x800",      { viewport: { width: 1280, height: 800 } },
    "a small laptop"],
  ["desktop-1440x900",      { viewport: { width: 1440, height: 900 } },
    "the common desktop"],
  ["desktop-1920x1080",     { viewport: { width: 1920, height: 1080 } },
    "full screen on a 1080p monitor"],
  ["desktop-windowed-1920x937", { viewport: { width: 1920, height: 937 } },
    "the same monitor with browser chrome — 143px less"],
  ["desktop-narrow-860x560", { viewport: { width: 860, height: 560 } },
    "a small window, or a maximised one at 125% zoom"],
  ["desktop-portrait-1080x1920", { viewport: { width: 1080, height: 1920 } },
    "a rotated monitor: portrait window, but the sheet is capped landscape"],
];

// The CIRCUIT ASPECT axis lives in circuit-axis.mjs, beside the UI SIZE axis
// in ui-scale-axis.mjs. It joins the SCREEN axis (`select#jeddah`) the same
// way --scale joins the viewport axis, so the queue, the merge and the HTML
// grid below need no knowledge of it.

// SCREENS: how to get there, and what the eye is supposed to land on. `open`
// runs in Playwright; anything that throws marks the cell skipped rather than
// failing the sweep, because a screen that cannot be reached is itself a finding.
const SCREENS = [
  { id: "title", name: "Title / main menu", root: "#overlay", open: async () => {} },
  { id: "select", name: "Circuit select", root: "#select", mapAxis: true, open: async (p, circuit) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await pickCircuit(p, circuit); } },
  { id: "garage", name: "Garage", root: "#carsetup", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        (t.find((e) => /ENGINE/i.test(e.textContent)) || t[1] || t[0])?.click(); }); } },
  { id: "career", name: "Career hub", root: "#career", open: async (p) => {
      await p.click("#mb-career"); await p.waitForSelector("#career:not([hidden])", { timeout: 15000 }); } },
  { id: "datahub", name: "F1 data hub", root: "#datahub", open: async (p) => {
      await p.click("#mb-data"); await p.waitForSelector("#datahub:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(1200); } },
  { id: "howtoplay", name: "How to play", root: "#howtoplay", open: async (p) => {
      await p.click("#mb-help"); await p.waitForSelector("#howtoplay:not([hidden])", { timeout: 15000 }); } },
  { id: "settings", name: "Settings", root: "#pmsettings", open: async (p) => {
      await p.click("#mb-settings"); await p.waitForSelector("#pmsettings:not([hidden])", { timeout: 15000 }); } },
  // The VS FRIEND lobby is the densest sheet in the game — two multi-hundred-
  // character code boxes, a QR, copy buttons and a room code — and it was the
  // one screen the grid did not cover. It is also all of css/overlays.css's
  // trailing block, the part that spent this long outside its cascade layer.
  // No peer is dialled: the lobby opens on its own and the layout is the same
  // whether or not anyone answers.
  { id: "vsfriend", name: "VS friend lobby", root: "#vsfriend", open: async (p) => {
      await p.click("#mb-vs"); await p.waitForSelector("#vsfriend:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(600); } },
  // The garage owns the team card now (#cs-team-card, TEAM tab) — the select
  // screen's #sel-team-card is gone. Reaching a screen by the route a player
  // takes is the point; when the route moves, the audit's own path has to move.
  { id: "teampicker", name: "Team picker", root: "#teampicker", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        (t.find((e) => /TEAM/i.test(e.textContent)) || t[0])?.click(); });
      await p.waitForTimeout(400);
      await p.click("#cs-team-card");
      await p.waitForSelector("#teampicker:not([hidden])", { timeout: 15000 }); } },
  // START on the select screen goes to the GARAGE, not to race settings — the
  // garage is a step on the way now, and its DONE carries on to the settings.
  { id: "racesettings", name: "Race settings", root: "#race-settings", open: async (p) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await p.click("#sel-go"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.click("#cs-done");
      await p.waitForSelector("#race-settings:not([hidden])", { timeout: 15000 }); } },
  { id: "results", name: "Results", root: "#results", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.setLap(3); window.__apex.finishRace(); });
      await p.waitForSelector("#results:not([hidden])", { timeout: 20000 }); } },
  { id: "pause", name: "Pause menu", root: "#pausemenu", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(300); } },
  { id: "hud", name: "In-race HUD", root: "#hud", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 45); window.__apex.snapCam(); });
      await p.waitForTimeout(600); } },

  // ---------------------------------------------------------- the second half
  // Everything above was the grid's first draft, and it measured twelve screens
  // in ONE STATE EACH while the app has twenty-one screen roots and several of
  // them change shape entirely between states. "130 cells, 0 red" read as full
  // coverage and was not: qualifying, the livery editor, the standings table,
  // the tuner panels and every career sub-screen had never been measured once.
  // A screen nobody measures is exactly where the last four bugs were found.

  // THE CIRCUIT DETAIL DIALOG, absent from this list until 2026-08-08 — 38 screens
  // were being surveyed and this was not one of them, which is how a landscape
  // dead-band in it survived a 380-cell run and had to be found by hand. It opens
  // from the preview MAP in #select, not from a button with its own id.
  { id: "trackdetail", name: "Circuit detail", root: "#track-detail", mapAxis: true, open: async (p, circuit) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await pickCircuit(p, circuit);
      await p.click("#sel-preview-map");
      await p.waitForSelector("#track-detail:not([hidden])", { timeout: 15000 });
      // The modal fits its map on a ResizeObserver after the open transition
      // (js/game/menus.js), so the first frame is not the final size.
      await p.waitForTimeout(500); } },
  { id: "quali", name: "Qualifying", root: "#quali", open: async (p) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await p.click("#sel-go"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.click("#cs-done"); await p.waitForSelector("#race-settings:not([hidden])", { timeout: 15000 });
      // QUALIFYING LAP ships OFF, so the chip has to be turned on before GO —
      // the chips are generated, hence the text match rather than an id.
      await p.evaluate(() => { const c = [...document.querySelectorAll("#rs-quali .sel-chip")];
        (c.find((e) => /^on$/i.test(e.textContent.trim())) || c[c.length - 1])?.click(); });
      await p.click("#rs-go");
      await p.waitForSelector("#quali:not([hidden])", { timeout: 60000 }); } },

  { id: "standings", name: "Championship standings", root: "#standings", open: async (p) => {
      // #mb-standings is hidden until a season exists; the pause menu's copy is
      // always reachable, and it is the same screen.
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40);
        document.getElementById("pausemenu").hidden = false; });
      await p.evaluate(() => document.getElementById("pm-standings")?.click());
      await p.waitForSelector("#standings:not([hidden])", { timeout: 15000 }); } },

  { id: "customize", name: "Livery editor", root: "#customize", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      // EDIT MY TEAM is rendered by the TEAM tab (js/game/setup-ui.js), not the
      // LIVERY one — an easy thing to assume wrong, and it costs a whole cell.
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        t.find((e) => /TEAM/i.test(e.textContent))?.click(); });
      await p.waitForTimeout(400);
      await p.evaluate(() => document.getElementById("cs-customize")?.click());
      await p.waitForSelector("#customize:not([hidden])", { timeout: 15000 }); } },

  { id: "advanced", name: "Advanced steering", root: "#advanced", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      // Open SETTINGS through the app's own door (pause -> SETTINGS), not by
      // forcing `hidden = false`. The screen keeps internal state, and a cell
      // that had already opened it left that state saying "open" while the
      // between-cell reset hid the element — so the next click on a panel button
      // did nothing at all. Every tuner cell in the sweep skipped from that, and
      // in isolation they all passed, which is what made it look like a route bug.
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(200);
      await p.evaluate(() => document.getElementById("pm-settings")?.click());
      await p.waitForFunction(() => !document.getElementById("pmsettings").hidden,
        null, { timeout: 15000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => document.getElementById("pm-advanced")?.click());
      await p.waitForSelector("#advanced:not([hidden])", { timeout: 15000 }); } },

  { id: "audioset", name: "Music & sound", root: "#audioset", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      // Open SETTINGS through the app's own door (pause -> SETTINGS), not by
      // forcing `hidden = false`. The screen keeps internal state, and a cell
      // that had already opened it left that state saying "open" while the
      // between-cell reset hid the element — so the next click on a panel button
      // did nothing at all. Every tuner cell in the sweep skipped from that, and
      // in isolation they all passed, which is what made it look like a route bug.
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(200);
      await p.evaluate(() => document.getElementById("pm-settings")?.click());
      await p.waitForFunction(() => !document.getElementById("pmsettings").hidden,
        null, { timeout: 15000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => document.getElementById("pm-audio")?.click());
      await p.waitForSelector("#audioset:not([hidden])", { timeout: 15000 }); } },

  { id: "spotify", name: "Spotify player", root: "#spotifypanel", open: async (p) => {
      // The mid-session player, not the setup block inside MUSIC & SOUND. It is
      // shown directly: connecting a real Spotify account is not something an
      // audit can or should do, and the panel's LAYOUT is the same either way.
      await p.evaluate(() => { document.getElementById("spotifypanel").hidden = false; });
      await p.waitForTimeout(400); } },

  { id: "careerguide", name: "Career guide", root: "#career-guide", open: async (p) => {
      await p.click("#mb-career"); await p.waitForSelector("#career:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(400);
      await p.evaluate(() => { const b = [...document.querySelectorAll("#career button")];
        (b.find((e) => /HOW (CAREER|MY TEAM) WORKS/i.test(e.textContent))
          || b.find((e) => e.id && e.id.startsWith("cr-guide")))?.click(); });
      await p.waitForSelector("#career-guide:not([hidden])", { timeout: 15000 }); } },

  { id: "careerhub", name: "Career hub (season)", root: "#career", open: async (p) => {
      // #career shows the NEW-CAREER SETUP on a fresh profile and the SEASON HUB
      // once one exists — two different layouts behind one root. The default
      // `career` cell measures the first; this measures the second.
      // __apex.career() OPENS #career itself and hides #overlay, so a follow-up
      // click on #mb-career lands on a zero-sized button and times out.
      await p.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 42 }));
      await p.waitForFunction(() => !document.getElementById("career").hidden, null, { timeout: 15000 });
      await p.waitForTimeout(600); } },

  { id: "careerhistory", name: "Career history", root: "#career-history", open: async (p) => {
      await p.evaluate(() => window.__apex.career({ teamId: "haas", seat: 1, seed: 42 }));
      await p.waitForFunction(() => !document.getElementById("career").hidden, null, { timeout: 15000 });
      await p.waitForTimeout(600);
      await p.evaluate(() => { [...document.querySelectorAll("#career button")]
        .find((e) => /SEASON BY SEASON/i.test(e.textContent))?.click(); });
      await p.waitForSelector("#career-history:not([hidden])", { timeout: 15000 }); } },

  { id: "careeroffers", name: "Career contract offers", root: "#career-offers", open: async (p) => {
      // Offers exist only after a season rolls over, so the rollover is forced.
      await p.evaluate(() => { window.__apex.career({ teamId: "haas", seat: 1, seed: 42 });
        window.__apex.careerRollover(); });
      await p.waitForFunction(() => !document.getElementById("career").hidden, null, { timeout: 15000 });
      await p.waitForTimeout(600);
      await p.evaluate(() => document.getElementById("cr-go")?.click());
      await p.waitForSelector("#career-offers:not([hidden])", { timeout: 15000 }); } },

  // ---- sub-views: same root, materially different layout ----

  { id: "garagelivery", name: "Garage — livery tab", root: "#carsetup", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        t.find((e) => /LIVERY/i.test(e.textContent))?.click(); });
      await p.waitForTimeout(500); } },

  { id: "garageteam", name: "Garage — team tab", root: "#carsetup", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        t.find((e) => /TEAM/i.test(e.textContent))?.click(); });
      await p.waitForTimeout(500); } },

  { id: "datatelemetry", name: "Data hub — telemetry", root: "#datahub", open: async (p) => {
      await p.click("#mb-data"); await p.waitForSelector("#datahub:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(1200);
      await p.evaluate(() => document.getElementById("dh-tab-telemetry")?.click());
      await p.waitForTimeout(1500); } },

  { id: "dataschedule", name: "Data hub — schedule", root: "#datahub", open: async (p) => {
      await p.click("#mb-data"); await p.waitForSelector("#datahub:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(1200);
      await p.evaluate(() => document.getElementById("dh-tab-schedule")?.click());
      await p.waitForTimeout(1500); } },

  { id: "lightingtuner", name: "Lighting tuner", root: "#lighting", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      // Open SETTINGS through the app's own door (pause -> SETTINGS), not by
      // forcing `hidden = false`. The screen keeps internal state, and a cell
      // that had already opened it left that state saying "open" while the
      // between-cell reset hid the element — so the next click on a panel button
      // did nothing at all. Every tuner cell in the sweep skipped from that, and
      // in isolation they all passed, which is what made it look like a route bug.
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(200);
      await p.evaluate(() => document.getElementById("pm-settings")?.click());
      await p.waitForFunction(() => !document.getElementById("pmsettings").hidden,
        null, { timeout: 15000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => document.getElementById("pm-lighting")?.click());
      // waitForSelector requires VISIBILITY, and the panel is un-hidden a frame
      // before its rows are built, so it has a zero box at that instant. Wait on
      // the attribute instead, then let the layout settle.
      await p.waitForFunction(() => !document.querySelector("#lighting").hidden, null, { timeout: 15000 });
      await p.waitForTimeout(400); } },

  { id: "cameratuner", name: "Camera tuner", root: "#camtune", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      // Open SETTINGS through the app's own door (pause -> SETTINGS), not by
      // forcing `hidden = false`. The screen keeps internal state, and a cell
      // that had already opened it left that state saying "open" while the
      // between-cell reset hid the element — so the next click on a panel button
      // did nothing at all. Every tuner cell in the sweep skipped from that, and
      // in isolation they all passed, which is what made it look like a route bug.
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(200);
      await p.evaluate(() => document.getElementById("pm-settings")?.click());
      await p.waitForFunction(() => !document.getElementById("pmsettings").hidden,
        null, { timeout: 15000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => document.getElementById("pm-camtune")?.click());
      // waitForSelector requires VISIBILITY, and the panel is un-hidden a frame
      // before its rows are built, so it has a zero box at that instant. Wait on
      // the attribute instead, then let the layout settle.
      await p.waitForFunction(() => !document.querySelector("#camtune").hidden, null, { timeout: 15000 });
      await p.waitForTimeout(400); } },

  // ---- THE LIGHTING TUNER WHILE FLYING, a DIFFERENT LAYOUT, not a mood ----
  //
  // The panel changes shape in FREE CAMERA and nothing here ever opened it. In
  // that state `--dock-w` drops from 560 to 300 so two thumbsticks and a
  // climb/dive column have somewhere to live, TIME and WEATHER stand down, and
  // the panel abandons its two-column rail for a single column. That is three
  // layout branches the docked cells cannot reach.
  //
  // THE LIGHTING TUNER ONLY, and that is a fact about the app rather than a gap
  // here. `#pc-toggle` is the sole way into photo mode and it lives in this
  // panel; `closeLightTuner` (js/game/tuner.js) calls `exitPhotoMode()` on the
  // way out; and the camera tuner is opened from pause SETTINGS, which the
  // lighting tuner hides while it is open. So `#camtune-inner` under
  // `body.photo-mode` is unreachable, and a cell for it measures nothing — which
  // is precisely what it did when this was written for both: it skipped, every
  // time, because the class never arrived.
  //
  // What it cost: SEVEN rules implementing exactly that were written with `body`
  // as a DESCENDANT of the panel (`#lighting-inner … body.photo-mode …`), which
  // can never match. All seven were inert for months. The panel kept its
  // 210-unit furniture column inside a 300-unit dock, leaving the sliders 76,
  // and "KEY LIGHT (SUN)" set one word per line with its explanation sliced by
  // the panel edge. 140 tuner cells scored 0 findings the whole time, because
  // every one of them measured the panel docked.
  //
  // Toggled in-page rather than with p.click: the game loop is running here (the
  // free camera is the point), and Playwright's actionability checks against a
  // rendering SwiftShader page routinely outlast the 12s cell budget — the same
  // trap the skip counting documents.
  { id: "lightingtunerfly", name: "Lighting tuner — free camera", root: "#lighting",
    open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(200);
      await p.evaluate(() => document.getElementById("pm-settings")?.click());
      await p.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { timeout: 15000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => document.getElementById("pm-lighting")?.click());
      await p.waitForFunction(() => !document.querySelector("#lighting").hidden, null, { polling: 100, timeout: 15000 });
      await p.waitForTimeout(400);
      // The panel's own FREE CAMERA button, which is what a player presses.
      await p.evaluate(() => document.getElementById("pc-toggle")?.click());
      await p.waitForFunction(() => document.body.classList.contains("photo-mode"),
        null, { polling: 100, timeout: 15000 });
      await p.waitForTimeout(500);
    } },

  // ---- the sub-views the first pass documented as gaps and did not measure ----

  // The data hub's other four tabs. SCHEDULE and TELEMETRY were already covered;
  // these three are tables and one is a form, and a table is where a narrow
  // sheet runs out of width.
  ...["standings", "lastrace", "live", "export"].map((tab) => ({
    id: "data" + tab, name: "Data hub — " + tab, root: "#datahub", open: async (p) => {
      await p.click("#mb-data"); await p.waitForSelector("#datahub:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(1200);
      await p.evaluate((t) => document.getElementById("dh-tab-" + t)?.click(), tab);
      await p.waitForTimeout(1500); } })),

  // RESULTS has two layouts behind one root: a Grand Prix classification, and
  // the same screen carrying a championship table after a season round. The
  // second is taller by ten rows and was never measured.
  { id: "resultsseason", name: "Results — season round", root: "#results", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.career({ teamId: "haas", seat: 1, seed: 42 }); });
      await p.evaluate(() => { window.__apex.go(); window.__apex.setLap(3); window.__apex.finishRace(); });
      await p.waitForSelector("#results:not([hidden])", { timeout: 20000 });
      await p.waitForTimeout(400); } },

  // The other two STEERING MODES. Each changes which touch controls exist —
  // "touch" hides the gas pedal entirely (autoThrottle), "buttons" adds an
  // explicit GAS — so the control stack is a different shape, not a restyle.
  //
  // Reached by CYCLING #pm-steer, which is the player's own route and takes
  // effect immediately. The first version set localStorage and reloaded, which
  // worked for these two cells and wrecked the sweep: `page.reload()` destroys
  // the execution context, so every screen AFTER them failed with "Execution
  // context was destroyed" or a null deref in the reset, and two whole viewports
  // ran out of budget and failed to boot — 98 skipped cells, none of them a
  // layout finding. A screen that has to reload the page is a screen that
  // corrupts its neighbours.
  ...[["touch", "touch steering"], ["buttons", "button steering"]].map(([mode, label]) => ({
    id: "hud" + mode, name: "In-race HUD — " + label, root: "#hud", open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 45); });
      // #pm-steer cycles TILT -> BUTTONS -> TOUCH; click until it reads the one
      // we want, bounded so a renamed mode cannot spin forever.
      await p.evaluate((want) => {
        const btn = document.getElementById("pm-steer");
        for (let i = 0; i < 6; i++) {
          if (new RegExp(want, "i").test(btn.textContent)) return;
          btn.click();
        }
      }, mode);
      await p.evaluate(() => window.__apex.snapCam());
      await p.waitForTimeout(600); } })),

  // ONE more parts tab, to MEASURE the claim that the garage's ten remaining
  // categories share one layout rather than assert it. WHEELS is the last tab,
  // so it also exercises the rail scrolled to its end.
  { id: "garagewheels", name: "Garage — wheels tab (last)", root: "#carsetup", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        (t.find((e) => /WHEELS/i.test(e.textContent)) || t[t.length - 1])?.click(); });
      await p.waitForTimeout(500); } },

  { id: "hudmanual", name: "In-race HUD — manual gears", root: "#hud", open: async (p) => {
      // MANUAL moves the gearbox into the right thumb column and pushes BOOST/OT
      // /AERO elsewhere — a different control stack, not a restyle of the same
      // one, and it is the arrangement most likely to collide on a short screen.
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { document.body.classList.add("manual");
        window.__apex.go(); window.__apex.jump(0.2, 45); window.__apex.snapCam(); });
      await p.waitForTimeout(600); } },
];

// ------------------------------------------------------------------ the probe
// Runs in the page. Everything here is geometry — no screenshots, no judgement
// calls that depend on colour or style, so a result can be diffed build to build.
const PROBE = (rootSel) => {
  const vw = innerWidth, vh = innerHeight;
  const root = document.querySelector(rootSel);
  const px = (n) => Math.round(n);
  const SCROLLERS = ".pane,#sel-body,.panel-scroll,.scroll-y,.dh-content,#track-detail-body";
  const FOCUSABLE = "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])";

  // A COLLAPSED <details> STILL HAS GEOMETRY, and that is not the same as being
  // on screen. Chromium hides a closed disclosure with `content-visibility:
  // hidden` on the `::details-content` PSEUDO-element: the contents are not
  // rendered and cannot be focused or tapped, but every descendant still
  // answers getBoundingClientRect() with a real box, laid out below the sheet.
  //
  // Two things follow, and both bit this tool. An ancestor walk cannot find the
  // cause — there is no ELEMENT carrying `content-visibility: hidden`, only a
  // pseudo-element, so a loop over parentElement reports nothing while the
  // computed styles of the element itself look perfectly ordinary. And the
  // offscreen check below then reads those phantom boxes as controls sitting
  // past the viewport with no scroller to reach them.
  //
  // MEASURED on the ADVANCED panel, whose "Advanced" disclosure ships closed:
  // #adv-details is 50px tall while its own content box is 604px tall at y=819,
  // outside a sheet that ends at 909 — so #pm-lock, #pm-speedsteer, #pm-line,
  // #pm-help, #pm-rate and #pm-expo were reported offscreen in six cells of the
  // matrix. Raising type to the --fs-micro floor grew those notional boxes and
  // pushed more of them past the line (ipad-portrait 1 -> 3, windowed 3 -> 6),
  // which read exactly like a regression and was nothing a player could see.
  //
  // checkVisibility() is the question actually being asked — "is this being
  // rendered" — and it returns false inside a collapsed disclosure where the
  // three computed properties below all look fine. Same family as the
  // `display: contents` trap documented on `clipper` further down: a box that
  // exists in the geometry API but not on the screen.
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    if (typeof el.checkVisibility === "function" && !el.checkVisibility()) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && cs.opacity !== "0";
  };
  const desc = (el) => el.id ? "#" + el.id
    : (el.className && typeof el.className === "string"
        ? el.tagName.toLowerCase() + "." + el.className.trim().split(/\s+/).slice(0, 2).join(".")
        : el.tagName.toLowerCase());
  // The nearest ancestor that CLIPS: overflow hidden/auto/scroll in either axis
  // AND actually generates a box to clip against.
  //
  // `display: contents` is the trap here. Such an element is replaced by its
  // children for layout, so it has a 0x0 rect while those children lay out
  // normally — and an overflow declaration on it clips nothing. Counting it as a
  // clipper makes every child look like it escapes by hundreds of pixels in BOTH
  // directions at once, which is the tell. The lighting tuner's #lt-rail goes
  // `display: contents` on a wide sheet so its children become grid items of the
  // sheet, and that alone produced 34 phantom findings the first time this
  // screen was ever measured. A zero-area box is excluded for the same reason.
  const clipper = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/(hidden|auto|scroll|clip)/.test(cs.overflowY + cs.overflowX)) continue;
      if (cs.display === "contents") continue;
      const nr = n.getBoundingClientRect();
      if (nr.width < 1 || nr.height < 1) continue;
      return n;
    }
    return null;
  };

  const out = {
    // NOT `viewport`: the cell already carries the viewport's NAME, and
    // Object.assign(cell, probe) would overwrite it with this box — which is
    // exactly what happened, leaving every row keyed "[object Object]".
    box: { w: vw, h: vh, dpr: devicePixelRatio },
    bodyClass: [...document.body.classList].join(" "),
    rootPresent: !!root && visible(root),
    clipped: [], offscreen: [], smallTaps: [], truncated: [], scrollers: [],
    docOverflowX: document.documentElement.scrollWidth > vw + 1,
  };
  if (!root) return out;

  // CLIPPED: a visible element whose box escapes the thing that clips it. Text
  // nodes are excluded via the element list; a 1px slack absorbs sub-pixel layout.
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const c = clipper(el);
    if (!c) continue;
    const cr = c.getBoundingClientRect();
    const cs = getComputedStyle(c);
    // A scroll container legitimately holds content past its box on the axis it
    // SCROLLS — that is what scrolling is. Both axes count: the data hub's tab
    // strip is `overflow-x: auto`, and flagging its off-screen tabs as clipped
    // reported two false findings on a strip that works exactly as designed.
    const canScrollY = /(auto|scroll)/.test(cs.overflowY);
    const canScrollX = /(auto|scroll)/.test(cs.overflowX);
    const overBottom = r.bottom > cr.bottom + 1, overTop = r.top < cr.top - 1;
    const overRight = r.right > cr.right + 1, overLeft = r.left < cr.left - 1;
    const bad = (!canScrollY && (overBottom || overTop)) || (!canScrollX && (overRight || overLeft));
    if (bad && r.height > 2 && r.width > 2) {
      out.clipped.push({ el: desc(el), by: desc(c),
        past: { top: px(cr.top - r.top), bottom: px(r.bottom - cr.bottom),
                left: px(cr.left - r.left), right: px(r.right - cr.right) },
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) });
    }
  }

  // OFFSCREEN / SMALL TAPS: only things a player is meant to hit.
  //
  // A row scrolled below the fold of a LIST is not off screen, it is the list —
  // the first run of this probe called 35 circuit rows a finding on a phone and
  // buried the real ones. Only a control with no scrollable ancestor, which
  // therefore nothing can bring into view, counts as unreachable. The rest are
  // counted separately as `belowFold`, which is information, not a defect.
  //
  // The tap floor is the project's own `--tap` token, not a hard 44: the density
  // ladder in css/tokens.css drops it to 40 on a landscape phone deliberately,
  // and a probe that argues with a design decision every run gets ignored.
  //
  // READ IT OFF <body>, NOT :root. THE TOUCH LADDER IS DECLARED ON `body`, not
  // on `:root` — `css/tokens.css` raises the floor with
  // `body:not(.desktop) { --tap: 52px }`, because the class game.js toggles
  // lives there. Asking `documentElement` therefore returns the 44px DESKTOP
  // floor on every device, phones included, and this probe spent its whole life
  // measuring touch layouts against the mouse target. Measured on a 852x393
  // coarse-pointer phone: :root says 44px, body says 52px. That 8px is not a
  // rounding difference — it is the entire touch ladder, so every "soft" count
  // this tool has ever reported for a phone was an UNDERCOUNT, and the circuit
  // list's 45px rows passed a floor they miss by 7px.
  const tapFloor = parseFloat(getComputedStyle(document.body)
    .getPropertyValue("--tap")) || 44;
  out.tapFloor = tapFloor;
  // Two thresholds, because they mean different things. WCAG 2.2 SC 2.5.8 (AA)
  // is 24x24 CSS px and is a CONFORMANCE floor — under it is a real defect.
  // 44 (2.5.5 AAA, Apple HIG) and our own `--tap` are house comfort targets, so
  // a 40px full-width circuit row with 24px of spacing around it is compliant
  // and merely below our preference. Counting both as one number had the grid
  // reporting 40 "violations" on a screen that has none.
  const WCAG_MIN = 24;
  out.tinyTaps = [];
  out.belowFold = 0;
  // ANY ancestor that can actually scroll to it, in either axis — not the
  // project's named `.pane` list. The data hub's tab strip is a plain
  // `overflow-x: auto` div, so a selector-based check called its last tab
  // unreachable when a swipe brings it in. Ask the computed style, not a list.
  const scrollerAncestor = (el) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const scrollsY = /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight - n.clientHeight > 1;
      const scrollsX = /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth - n.clientWidth > 1;
      if (scrollsY || scrollsX) return n;
      if (n === root) break;
    }
    return null;
  };
  // THE TAP TARGET IS THE LABEL, NOT THE BOX THE BROWSER PAINTS. A checkbox or
  // radio wrapped in a <label> (or pointed at by one via `for`) is activated by
  // clicking anywhere in that label, so the label's rect is what a finger has to
  // hit. Measuring the <input> alone reports every checkbox in the app at the
  // ~13x13 the platform paints it and calls each one a WCAG failure — which is
  // both wrong and, worse, wrong in a way that hides the real ones. WCAG SC
  // 2.5.8 measures the ACTIVATION target, and that is the union of the two.
  const targetRect = (el) => {
    const r = el.getBoundingClientRect();
    if (!/^(checkbox|radio)$/.test(el.type || "")) return r;
    const lab = el.closest("label")
      || (el.id && root.querySelector(`label[for="${CSS.escape(el.id)}"]`));
    if (!lab) return r;
    const lr = lab.getBoundingClientRect();
    if (lr.width < 1 || lr.height < 1) return r;
    return {
      left: Math.min(r.left, lr.left), top: Math.min(r.top, lr.top),
      right: Math.max(r.right, lr.right), bottom: Math.max(r.bottom, lr.bottom),
      width: Math.max(r.right, lr.right) - Math.min(r.left, lr.left),
      height: Math.max(r.bottom, lr.bottom) - Math.min(r.top, lr.top),
    };
  };
  for (const el of root.querySelectorAll(FOCUSABLE)) {
    if (!visible(el)) continue;
    const r = targetRect(el);
    const off = r.right < -0.5 || r.bottom < -0.5 || r.left > vw + 0.5 || r.top > vh + 0.5;
    if (off) {
      if (scrollerAncestor(el)) out.belowFold++;
      else out.offscreen.push({ el: desc(el), box: [px(r.left), px(r.top), px(r.width), px(r.height)],
        text: (el.textContent || "").trim().slice(0, 24) });
    }
    if (r.height < tapFloor - 0.5 || r.width < tapFloor - 0.5) {
      const rec = { el: desc(el), w: px(r.width), h: px(r.height),
        text: (el.textContent || "").trim().slice(0, 24) };
      out.smallTaps.push(rec);
      if (r.height < WCAG_MIN - 0.5 || r.width < WCAG_MIN - 0.5) out.tinyTaps.push(rec);
    }
  }

  // TRUNCATED: ellipsised text. Not always a bug — often the point — but it is
  // the difference between "SUSPENSION" and "SUSPENSI…" and worth counting.
  for (const el of root.querySelectorAll("*")) {
    if (!visible(el) || el.children.length) continue;
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).textOverflow === "ellipsis")
      out.truncated.push({ el: desc(el), text: (el.textContent || "").trim().slice(0, 30) });
  }

  // UNDER THE HARDWARE: does anything interactive sit inside the safe-area
  // inset — behind a notch, a Dynamic Island, or a home indicator?
  //
  // This is the axis the project claims to handle and never verified. The tokens
  // are right (`--safe-t/r/b/l` over `env(safe-area-inset-*)`, with
  // viewport-fit=cover), which is the half most projects get wrong — but nothing
  // asserted that every screen actually uses them. And the insets are NOT the
  // same in both orientations: held sideways the notch moves to the SIDE, which
  // is the orientation this game is played in and the one where a mis-inset
  // control is least likely to be noticed by eye.
  //
  // Playwright cannot emulate a physical notch — `env(safe-area-inset-*)` is 0
  // in Chromium's device emulation — so the sweep INJECTS the insets by setting
  // `--sat/--sar/--sab/--sal` on :root before probing (see applyInsets below).
  // That matters: the tokens are what `.screen`'s padding is built from, so the
  // layout actually REFLOWS, and the question the check asks becomes the right
  // one — does this screen move its content out of the way when the insets are
  // real? A screen that positions from the viewport edge instead of the tokens
  // does not move, and is flagged.
  // Comparing un-inset emulator geometry against real-device inset numbers, as
  // the first version of this did, flags 47 cells out of 60 and means nothing.
  const cssPx = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const rs = getComputedStyle(document.documentElement);
  const inset = {
    t: cssPx(rs.getPropertyValue("--sat")), r: cssPx(rs.getPropertyValue("--sar")),
    b: cssPx(rs.getPropertyValue("--sab")), l: cssPx(rs.getPropertyValue("--sal")),
  };
  out.inset = inset;
  // CHROME, NOT CONTENT. A row inside a scroll region that happens to sit low in
  // its list is not under the hardware in any meaningful sense — you scroll it.
  // What matters is whether the things that CANNOT move — close buttons, action
  // bars, tab strips, absolutely-positioned toggles — and the scroll REGIONS
  // themselves stay clear. Checking every focusable element instead reported the
  // circuit list, the garage's option list and the career slot picker on every
  // phone cell, which is the same mistake `belowFold` already exists to avoid.
  out.underHardware = [];
  if (inset.t || inset.r || inset.b || inset.l) {
    const intrusion = (r) => {
      const into = {
        top: px(inset.t - r.top), bottom: px(r.bottom - (vh - inset.b)),
        left: px(inset.l - r.left), right: px(r.right - (vw - inset.r)),
      };
      return { into, worst: Math.max(into.top, into.bottom, into.left, into.right) };
    };
    const onScreen = (r) => r.width >= 1 && r.height >= 1
      && r.right >= 0 && r.bottom >= 0 && r.left <= vw && r.top <= vh;
    const seen = new Set();
    const consider = (el, r, label) => {
      if (seen.has(el) || !onScreen(r)) return;
      seen.add(el);
      const { into, worst } = intrusion(r);
      if (worst > 1) out.underHardware.push({ el: desc(el), into, worst, kind: label,
        text: (el.textContent || "").trim().slice(0, 24) });
    };
    for (const el of root.querySelectorAll(FOCUSABLE)) {
      if (!visible(el) || scrollerAncestor(el)) continue;
      consider(el, targetRect(el), "control");
    }
    for (const el of root.querySelectorAll(SCROLLERS)) {
      // Matching `.pane` is not the same as BEING a scroll region: #cr-left and
      // #cr-right carry the class but go `overflow: visible` in the stacked
      // layout, where they are ordinary full-height blocks inside a scrolling
      // body. Measured as scrollers they read as 858px of intrusion, which is
      // just their content height. Ask the computed style, as everywhere else.
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (!/(auto|scroll)/.test(cs.overflowY + cs.overflowX)) continue;
      consider(el, el.getBoundingClientRect(), "scroll region");
    }
  }

  // SCROLLERS: how much is hidden, and how close to the floor of its sheet the
  // region reaches — the measurement that caught the action bar stealing a row.
  const sheet = root.querySelector(".sheet") || root;
  const sr = sheet.getBoundingClientRect();
  for (const el of root.querySelectorAll(SCROLLERS)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    out.scrollers.push({ el: desc(el), box: [px(r.width), px(r.height)],
      hidden: px(el.scrollHeight - el.clientHeight), toFloor: px(sr.bottom - r.bottom) });
  }

  // STARVED: a scroll region with content to show and no height to show it in.
  //
  // THIS IS THE FINDING THE FIRST SIX MONTHS OF THIS TOOL COULD NOT SEE, and it
  // has cost three separate investigations. Every other check here asks whether
  // something is in the wrong PLACE — clipped, off screen, under the notch. A
  // list crushed to two pixels is in exactly the right place. It clips nothing,
  // it overflows nothing, it sits inside its parent, and the cell scores GREEN.
  //
  // Three real ones, all found by eye, none by this tool:
  //   - js/game/sheetshape.js exists because #sel-tracks got TWO PIXELS on a
  //     rotated monitor. The header of that file is the write-up.
  //   - #sel-tracks again, 2026-08-12, on a landscape phone at UI SIZE 150% —
  //     the same two pixels down a different path (flex shrink), and portrait
  //     scored green at 80/100/130 the whole time it was broken.
  //   - #cs-options, the garage's parts list, NINE PIXELS on a portrait phone at
  //     150%: a screen whose entire purpose is choosing parts, showing none.
  //
  // The shape is always identical: `scrollHeight` says there is content,
  // `clientHeight` says there is nowhere to put it. Both numbers were already
  // being recorded in `scrollers` above and nothing compared them.
  //
  // The floor is 44 DEVICE px, not own units: this is a question about what a
  // player can see and touch, so it is measured in the pixels their eyes are on,
  // the same reasoning as `tinyTaps`. Under one tap target of height, a vertical
  // list is not a short list, it is an absent one. `hidden > 8` keeps a region
  // that genuinely has nothing to scroll out of it — an empty list is a data
  // state, not a layout defect. overflow-y only, so a horizontal chip strip
  // (`overflow-x: auto; overflow-y: hidden`) is not dragged in by its height.
  out.starved = [];
  for (const el of root.querySelectorAll(SCROLLERS)) {
    if (!visible(el)) continue;
    if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
    const r = el.getBoundingClientRect();
    const hidden = el.scrollHeight - el.clientHeight;
    if (hidden > 8 && r.height < 44) {
      out.starved.push({ el: desc(el), h: px(r.height), hidden: px(hidden),
        text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 40) });
    }
  }

  // DEEP SCROLL: the other end of the same axis, and the other thing this tool
  // cannot see. `starved` catches a region with NO room. This catches one with
  // far too little — a body the player has to wind through five screens of.
  //
  // It is not a clipping bug and it never will be: everything is reachable,
  // nothing overflows, no control is under the notch, and the cell is GREEN.
  // MEASURED by hand, pause SETTINGS: 5.2 screens of scroll on a landscape phone
  // at UI SIZE 150%, 3.4 in portrait, and 1.0 on an iPad. Nothing in this probe
  // could tell those apart, so "the settings menu is a mile long on a phone" was
  // only ever findable by opening it and scrolling.
  //
  // INFORMATION, NOT A FINDING — and that is a correction, made by running it.
  // It shipped as amber on the reasoning below, and the first 84 cells of the
  // full matrix flagged 21 of them: #select (a list of FORTY circuits), HOW TO
  // PLAY and the career guide (prose documents), the garage's livery list. Those
  // are not defects. They are long lists, and a long list is allowed to be long.
  //
  // The measurement cannot tell "a form that should have been arranged better"
  // from "a list with forty things in it" — that distinction is about what the
  // content MEANS, and nothing here has access to that. A check that is wrong a
  // quarter of the time trains the eye to skip it, which is exactly how the
  // skipped-cell count came to be ignored for three runs. So it is reported as a
  // ranked table for a human to read, the same standing `belowFold` already has
  // in this file, and it colours nothing.
  //
  // It still earns its place: pause SETTINGS at 5.2 screens is the number that
  // started this, and no other check in the tool could produce it. 3.0 stays as
  // the reporting threshold because the interesting cases sit above it — but it
  // is a threshold for ATTENTION, not for failure.
  out.deepScroll = [];
  for (const el of root.querySelectorAll(SCROLLERS)) {
    if (!visible(el)) continue;
    if (!/(auto|scroll)/.test(getComputedStyle(el).overflowY)) continue;
    const ch = el.clientHeight;
    if (ch < 44) continue;             // that is `starved`, already reported above
    const screens = el.scrollHeight / ch;
    if (screens > 3) {
      out.deepScroll.push({ el: desc(el), screens: Math.round(screens * 10) / 10,
        h: px(ch), content: px(el.scrollHeight) });
    }
  }
  // MAPS: what is INSIDE a circuit canvas, which nothing else here can see.
  //
  // A canvas passes every check above while being completely wrong. Its box is
  // present, visible, unclipped, on screen and big enough to tap — and the
  // drawing in it is a sliver in the corner, or a bitmap stretched out of
  // shape, or an outline running off the edge. That is precisely the defect
  // that shipped: a DOM probe cannot fail on it, because in the DOM nothing is
  // wrong. So read the pixels.
  out.maps = [];
  for (const sel of ["#sel-preview-map", "#track-detail-canvas"]) {
    const cv = root.querySelector(sel);
    if (!cv || !visible(cv)) continue;
    const r = cv.getBoundingClientRect();
    // Local (pre-zoom) px: everything here lives inside `zoom: var(--ui-scale)`
    // and a raw rect would mix visual px into ratios taken against layout px.
    const z = cv.currentCSSZoom || 1;
    const cssW = r.width / z, cssH = r.height / z;
    const m = { el: desc(cv), buffer: { w: cv.width, h: cv.height }, css: { w: px(cssW), h: px(cssH) } };

    // SQUISH, by its own name: the bitmap's aspect against the box it is
    // painted into. A fixed 520x300 buffer shown in a 128x255 slot is the
    // original bug, and it is a single number.
    const bufAR = cv.width / Math.max(1, cv.height);
    const boxAR = cssW / Math.max(1, cssH);
    m.aspectSkewPct = Math.round(Math.abs(bufAR - boxAR) / Math.max(bufAR, boxAR, 0.001) * 1000) / 10;

    // FILL: how much of the space it was given the map actually occupies. Low
    // fill is not automatically a defect — a tall circuit in a wide slot cannot
    // fill it — but it is where the dead space is, and dead space is the
    // question this whole axis was added to answer.
    const slot = cv.parentElement;
    if (slot && slot.clientWidth > 0 && slot.clientHeight > 0) {
      m.fillPct = Math.round((cssW * cssH) / (slot.clientWidth * slot.clientHeight) * 100);
    }

    // INK: where the drawing actually landed inside its own buffer. A 2D canvas
    // drawn by this app is same-origin and untainted, so getImageData is safe.
    try {
      const g = cv.getContext("2d");
      if (g && cv.width > 0 && cv.height > 0) {
        const W = cv.width, H = cv.height;
        const d = g.getImageData(0, 0, W, H).data;
        const at = (x, y) => d[(y * W + x) * 4 + 3] > 8;
        let x0 = W, y0 = H, x1 = -1, y1 = -1, ink = 0;
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            if (at(x, y)) {
              ink++;
              if (x < x0) x0 = x;
              if (x > x1) x1 = x;
              if (y < y0) y0 = y;
              if (y > y1) y1 = y;
            }
          }
        }
        if (x1 < 0) {
          m.blank = true;            // a canvas that drew NOTHING reads as a fine box
        } else {
          m.inkPct = Math.round((ink / (W * H)) * 100);
          m.inkSpanPct = { w: Math.round(((x1 - x0 + 1) / W) * 100),
            h: Math.round(((y1 - y0 + 1) / H) * 100) };
          // CROPPED, measured rather than asserted. "Any ink on the border" is
          // useless here — corner labels are deliberately clamped flush to the
          // edge, so a boolean is true on every healthy render (measured: all
          // of them). What separates a cut-off outline from a tangent label is
          // the LENGTH of the inked run along an edge. Measured on Baku:
          // correctly fitted 2% / 2%, the same circuit drawn with no padding
          // 13% / 19%, and squashed into a narrow buffer 10% / 20%.
          let edge = 0, longest = 0;
          for (let x = 0; x < W; x++) { if (at(x, 0)) edge++; if (at(x, H - 1)) edge++; }
          for (let y = 1; y < H - 1; y++) { if (at(0, y)) edge++; if (at(W - 1, y)) edge++; }
          const run = (get, n) => {
            let cur = 0;
            for (let i = 0; i < n; i++) { if (get(i)) { cur++; if (cur > longest) longest = cur; } else cur = 0; }
          };
          run((i) => at(i, 0), W); run((i) => at(i, H - 1), W);
          run((i) => at(0, i), H); run((i) => at(W - 1, i), H);
          m.edgeInkPct = Math.round((edge / (2 * W + 2 * (H - 2))) * 100);
          m.longestEdgeRunPct = Math.round((longest / Math.max(W, H)) * 100);
          m.cropped = m.longestEdgeRunPct >= 10;
        }
      }
    } catch (e) { m.inkError = String(e).slice(0, 60); }
    out.maps.push(m);
  }

  out.sheet = sheet === root ? null : { el: desc(sheet), w: px(sr.width), h: px(sr.height) };
  return out;
};

// ------------------------------------------------------------------ the runner
const argv = process.argv.slice(2);
const wantShots = argv.includes("--shots");
const pick = (flag, all) => {
  const a = argv.find((x) => x.startsWith(flag));
  if (!a) return all;
  const pats = a.split("=")[1].split(",");
  return all.filter((x) => pats.some((p) => p.endsWith("*") ? x[0].startsWith(p.slice(0, -1)) : x[0] === p || x.id === p));
};
const viewports = pick("--viewports=", VIEWPORTS);
const SCALES = parseScales(argv);
const CIRCUITS_AXIS = parseCircuits(argv);
const screens = argv.find((x) => x.startsWith("--screens="))
  ? SCREENS.filter((s) => argv.find((x) => x.startsWith("--screens=")).split("=")[1].split(",").includes(s.id))
  : SCREENS;

fs.mkdirSync(OUT, { recursive: true });
if (wantShots) fs.mkdirSync(SHOT_DIR, { recursive: true });

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const f = path.join(ROOT, path.normalize(p).replace(/^(\.\.[/\\])+/, ""));
  fs.readFile(f, (e, b) => {
    if (e) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": MIME[path.extname(f)] || "application/octet-stream" });
    res.end(b);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: pickChromium(),
  args: ["--use-angle=swiftshader", "--hide-scrollbars"] });

// ONE BOOT PER VIEWPORT, not one per cell. Booting this game means compiling
// shaders and building a circuit; measured at 2-4 minutes per load on the
// software renderer, which made a 120-cell sweep a nine-hour job. The overlays
// are all `hidden`-toggled, so a cell can be reached by closing whatever is open
// and opening the next one — 10 loads instead of 120.
const OVERLAY_IDS = ["select", "carsetup", "career", "career-offers", "career-history",
  "career-guide", "teampicker", "race-settings", "quali", "standings", "results", "customize",
  "howtoplay", "advanced", "pmsettings", "pausemenu", "datahub", "track-detail", "vsfriend",
  // The panels reached from SETTINGS, plus the mid-session music player. Left off
  // this list they stay open into the NEXT cell and swallow its clicks — which is
  // how fourteen consecutive cells came back "SKIPPED: page.click timeout" from
  // one screen that had opened a session and never closed it.
  "audioset", "spotifypanel", "lighting", "camtune", "photo-controls"];
// Viewports run in PARALLEL, a few at a time. Each one is an independent browser
// context doing mostly single-threaded work, and the sweep is dominated by boot
// and by waits, not by CPU — three at once measured ~3x the throughput, which is
// the difference between a coffee and an afternoon. Raise with --jobs=N.
const JOBS = Number((argv.find((a) => a.startsWith("--jobs=")) || "--jobs=3").split("=")[1]) || 3;
const rows = [];
// Every (viewport, scale) pair is its own sweep — its own context, its own boot.
// Rescaling a live context would be cheaper, but the reset-and-reload recovery
// below can fire at any cell, and a job whose identity is one column is far
// easier to reason about than one that changes size halfway down it.
const queue = [];
for (const vp of viewports) for (const sc of SCALES) queue.push([vp, sc]);
await Promise.all(Array.from({ length: Math.min(JOBS, queue.length) }, () => worker()));
async function worker() { while (queue.length) { const job = queue.shift(); if (job) await sweepViewport(job[0], job[1]); } }

async function sweepViewport([baseName, vpOpts, why, insets], scale) {
  const vpName = baseName + scaleTag(scale);
  const ctx = await browser.newContext({ ...vpOpts, colorScheme: "dark" });
  const page = await ctx.newPage();
  let errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
  let booted = false;
  try {
    // 90s, NOT the 30s default. The three largest desktop viewports
    // (1440x900, 1920x1080, 1920x937) ALL failed `page.goto` at exactly 30000ms
    // in the 2026-08-08 sweep — 114 cells, every screen in three columns,
    // recorded as "boot failed" and read at a glance as a broken app. They are
    // the three biggest WebGL surfaces in the matrix and `--jobs=3` had them
    // competing against each other on a 4-core SwiftShader box: the failure is a
    // measurement of the machine, not of the page. docs/LAYOUT-AUDIT.md already
    // records the same trap costing 98 cells once before.
    await page.goto(base, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { timeout: 60000 });
    // Stop the render loop first: the 3D scene starves the compositor, which
    // makes every later wait and every screenshot an order slower.
    await page.evaluate(() => window.__apex.headless(true));
    // Persisted to localStorage, so it survives the reload recovery below.
    await applyScale(page, scale);
    // A cell that cannot be reached should cost seconds, not the 30s default —
    // there are 120 of them and "skipped" is a perfectly good result.
    page.setDefaultTimeout(12000);
    booted = true;
  } catch (e) {
    console.log(`${vpName}: BOOT FAILED — ${e.message.split("\n")[0]}`);
  }
  // In-race screens need a track built, which is the one slow step left; run
  // them last so the cheap overlay cells are already recorded if it times out.
  const ordered = [...screens].sort((a, b) =>
    (["hud", "pause", "results"].indexOf(a.id) + 1 ? 1 : 0) - (["hud", "pause", "results"].indexOf(b.id) + 1 ? 1 : 0));
  // Expand only the screens that DRAW a circuit. Crossing the whole screen list
  // with the circuit axis would multiply a 15-minute column by five to re-measure
  // fourteen screens that never show a map.
  const expanded = [];
  for (const s of ordered) {
    if (s.mapAxis && CIRCUITS_AXIS[0] != null) {
      for (const c of CIRCUITS_AXIS) expanded.push({ ...s, id: s.id + circuitTag(c), circuit: c });
    } else expanded.push(s);
  }
  for (const screen of expanded) {
    const cell = { viewport: vpName, why, screen: screen.id, screenName: screen.name };
    errors = [];
    if (!booted) cell.skipped = "boot failed";
    else try {
      // Back to the title: closing the overlays is not enough, because the app
      // hides #overlay when one opens — leaving nothing for the next cell to
      // click. Geometry probing does not need the state machine to agree, only
      // the buttons to be hittable.
      await page.evaluate((ids) => {
        for (const id of ids) { const el = document.getElementById(id); if (el) el.hidden = true; }
        const ov = document.getElementById("overlay");
        if (ov) { ov.hidden = false; ov.style.removeProperty("display"); }
        document.body.classList.remove("in-race");
      }, OVERLAY_IDS);
      await page.waitForTimeout(200);
      // VERIFY THE RESET, DO NOT ASSUME IT. Hiding the overlays gets the title
      // back for most screens, but one that started a SESSION (qualifying, a
      // race) leaves state that no amount of `hidden = true` undoes, and the
      // symptom is the next cell timing out on a click against a zero-sized
      // button — a harness failure that reads exactly like a broken route.
      // Cheap check, expensive fallback, and the fallback only fires when the
      // cheap check says it must.
      const titleUsable = await page.evaluate(() => {
        const b = document.getElementById("mb-race");
        if (!b) return false;
        const r = b.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      });
      if (!titleUsable) {
        await page.goto(base, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.__apex, null, { timeout: 60000 });
        await page.evaluate(() => window.__apex.headless(true));
        await page.waitForTimeout(300);
        errors = [];
      }
      await screen.open(page, screen.circuit);
      // WAIT FOR THE OPEN TRANSITION, DO NOT GUESS AT IT. Every `.screen` is a
      // <dialog> that fades in (js/game/topmodal.js), and a flat 400ms measured
      // it MID-FADE on a loaded box: the probe's own `visible()` test reads
      // `opacity: 0` and reports the root absent. That is what produced
      // `rootPresent: false` on 19 of 38 screens per viewport in the 2026-08-08
      // sweep, while their sheets measured normally two lines later — a cell
      // that looks like a missing screen and is really a stopwatch. Measured
      // live on #pmsettings at 852x393: opacity 0 at 800 ms, 1 by ~1.2 s.
      //
      // `polling` is mandatory, not decoration. Playwright polls a predicate on
      // requestAnimationFrame by default, and a page running the game loop
      // starves that poll badly enough that the declared timeout never fires
      // (CLAUDE.md measures a 3s wait running 109,665 ms). The render loop is
      // stopped here, but a wait that only bounds itself when the caller
      // remembers a flag is not bounded.
      //
      // Swallow the timeout deliberately: a screen that genuinely never becomes
      // visible must still be MEASURED and reported as absent. Turning that
      // into a thrown "skipped" would hide a real defect behind a harness error.
      await page.waitForFunction((sel) => {
        const el = document.querySelector(sel);
        if (!el) return true;   // no root at all is a finding, not something to wait for
        const anims = el.getAnimations ? el.getAnimations({ subtree: true }) : [];
        if (anims.some((a) => a.playState === "running")) return false;
        return getComputedStyle(el).opacity !== "0";
      }, screen.root, { polling: 50, timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(150);
      // Simulate the notch by writing the tokens the layout is built on, then
      // let it reflow. Applied per cell rather than once per context because a
      // cell may reload the page (see the reset check above).
      if (insets) {
        await page.evaluate((i) => {
          const d = document.documentElement.style;
          d.setProperty("--sat", i.t + "px"); d.setProperty("--sar", i.r + "px");
          d.setProperty("--sab", i.b + "px"); d.setProperty("--sal", i.l + "px");
        }, insets);
        await page.waitForTimeout(150);
      }
      Object.assign(cell, await page.evaluate(PROBE, screen.root));
      if (wantShots) {
        const file = `${screen.id}__${vpName}.png`;
        await page.screenshot({ path: path.join(SHOT_DIR, file), timeout: 300000 });
        cell.shot = "shots/" + file;
      }
    } catch (e) {
      cell.skipped = e.message.split("\n")[0].slice(0, 120);
    }
    cell.errors = errors;
    rows.push(cell);
    const n = (a) => (a ? a.length : 0);
    console.log(`${cell.screen.padEnd(13)} ${vpName.padEnd(28)} ` +
      (cell.skipped ? `SKIPPED: ${cell.skipped}`
        : `clipped ${String(n(cell.clipped)).padStart(2)}  offscreen ${String(n(cell.offscreen)).padStart(2)}` +
          `  tapUnder24 ${String(n(cell.tinyTaps)).padStart(2)}  tapSoft ${String(n(cell.smallTaps)).padStart(2)}` +
          `  trunc ${String(n(cell.truncated)).padStart(2)}  underHW ${String(n(cell.underHardware)).padStart(2)}` +
          `  starved ${String(n(cell.starved)).padStart(2)}` +
          `  deepScroll ${String(n(cell.deepScroll)).padStart(2)}` +
          `  xOverflow ${cell.docOverflowX ? "YES" : "no "}  err ${n(cell.errors)}` +
          // Only the map screens carry this, and only they print it — a squished
          // or blank canvas should be readable in the running log, not just in
          // the JSON afterwards.
          ((cell.maps || []).length
            ? "  map " + cell.maps.map((m) => `${m.buffer.w}x${m.buffer.h}` +
                (m.blank ? " BLANK" : "") +
                (m.aspectSkewPct > 2 ? ` SKEW${m.aspectSkewPct}%` : "") +
                (m.cropped ? ` CROP${m.longestEdgeRunPct}%` : "") +
                (m.fillPct != null ? ` fill${m.fillPct}%` : "")).join(" ")
            : "")));
  }
  await page.close();
  await ctx.close();
}

await browser.close();
server.close();

// MERGE, don't clobber: a filtered run (--screens / --viewports) must top up the
// grid rather than replace it with its own twelve cells, or re-running one
// viewport silently throws the other hundred away.
let prior = [];
try { prior = JSON.parse(fs.readFileSync(path.join(OUT, "audit.json"), "utf8")).rows || []; } catch {}
const key = (r) => r.screen + "|" + r.viewport;
// Sorted back into the canonical matrix order, so a filtered run's rows land in
// their own columns instead of appending new ones to the right of the grid.
const vpOrder = VIEWPORTS.flatMap(([n]) => SCALES.map((s) => n + scaleTag(s)));
const scOrder = SCREENS.map((s) => s.id);
const rank = (r) => [scOrder.indexOf(r.screen), vpOrder.indexOf(r.viewport)];
const merged = [...prior.filter((p) => !rows.some((r) => key(r) === key(p))), ...rows]
  .sort((a, b) => { const [as, av] = rank(a), [bs, bv] = rank(b); return as - bs || av - bv; });
fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify({
  when: null, build: JSON.parse(fs.readFileSync(path.join(ROOT, "version.json"), "utf8")).build,
  viewports: viewports.flatMap(([n, , w]) => SCALES.map((s) => ({ name: n + scaleTag(s), why: w }))),
  screens: screens.map((s) => ({ id: s.id, name: s.name })),
  rows: merged,
}, null, 2));
writeIndex(merged);
// COUNT SKIPS SEPARATELY, AND SAY SO. A skipped cell is neither a pass nor a
// finding: nothing was measured. Folding it into one "something to look at"
// number made both readings wrong at once — a run with 40 skips looked like a
// run with 40 defects, and once the eye learned to discount that number a run
// with 5 skips read as clean. Measured 2026-08-12: five cells skipped on
// `page.click: Timeout 12000ms exceeded` across a full matrix, survived a
// `--jobs=1` re-run, and looked for an afternoon like a button that could not be
// clicked. Re-probed on a quiet box, every one of those clicks landed in ~200 ms
// and the same two viewports came back 78 cells / 0 findings / 0 skips. The 12 s
// budget was measuring the machine, exactly as CLAUDE.md warns a timeout does.
// So: name the skips, and name the retry, because the answer to a skip is never
// "read the grid harder", it is "run that cell alone".
const skipped = rows.filter((r) => r.skipped);
const bad = rows.filter((r) => !r.skipped && ((r.clipped || []).length || (r.offscreen || []).length
  || r.docOverflowX || (r.errors || []).length || (r.tinyTaps || []).length
  || (r.underHardware || []).length || (r.starved || []).length));
const deep = rows.filter((r) => !r.skipped && (r.deepScroll || []).length);
console.log(`\n${rows.length} cells, ${bad.length} with something to look at, ` +
  `${skipped.length} skipped (nothing measured) -> ${path.relative(ROOT, OUT)}/index.html`);
if (deep.length) {
  // Amber, and tallied apart from the red count on purpose — see the probe.
  const worst = deep.flatMap((r) => (r.deepScroll || []).map((d) => ({ ...d, cell: `${r.screen} ${r.viewport}` })))
    .sort((a, b) => b.screens - a.screens).slice(0, 8);
  console.log(`  ${deep.length} cells scroll more than 3 screens — INFORMATION, not findings.`);
  console.log("  A long list is allowed to be long; read the worst and judge:");
  for (const w of worst) console.log(`    ${String(w.screens).padStart(5)} screens  ${w.el} — ${w.cell}`);
}
if (skipped.length) {
  const byReason = new Map();
  for (const r of skipped) {
    const k = r.skipped.replace(/\d+/g, "N").slice(0, 60);
    byReason.set(k, (byReason.get(k) || 0) + 1);
  }
  for (const [k, c] of [...byReason].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(3)}x ${k}`);
  // --viewports= matches the BASE name; the scale lives on --scale=, so strip
  // the tag before deduping or the same viewport is named once per scale.
  const vps = [...new Set(skipped.map((r) => r.viewport.replace(/@\d+$/, "")))].join(",");
  const scr = [...new Set(skipped.map((r) => r.screen))].join(",");
  console.log(`  a skip is NOT a pass. Re-run those cells alone before believing them:\n` +
    `    node tools/layout-audit.mjs --viewports=${vps} --screens=${scr} --jobs=1` +
    (SCALES[0] == null ? "" : ` --scale=${SCALES.join(",")}`));
}

function writeIndex(rows) {
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  const cellHtml = (r) => {
    if (r.skipped) return `<td class="skip" title="${esc(r.skipped)}">skipped</td>`;
    const issues = (r.clipped || []).length + (r.offscreen || []).length + (r.errors || []).length
      + (r.docOverflowX ? 1 : 0) + (r.tinyTaps || []).length + (r.underHardware || []).length
      + (r.starved || []).length;
    const cls = issues ? "bad" : (r.smallTaps || []).length ? "warn" : "ok";
    const detail = [
      ...(r.clipped || []).map((c) => `clipped ${c.el} past ${c.by}`),
      ...(r.offscreen || []).map((c) => `offscreen ${c.el}`),
      ...(r.starved || []).map((c) => `starved ${c.el}: ${c.h}px tall, ${c.hidden}px of content it cannot show`),
      ...(r.deepScroll || []).map((c) => `deep scroll ${c.el}: ${c.screens} screens (${c.h}px showing ${c.content}px)`),
      ...(r.docOverflowX ? ["horizontal overflow"] : []),
      ...(r.errors || []).map((e) => "error " + e),
      ...(r.underHardware || []).slice(0, 4).map((u) => `under hardware: ${u.el} by ${u.worst}px`),
      ...(r.tinyTaps || []).slice(0, 4).map((t) => `under WCAG 24px: ${t.el} ${t.w}x${t.h}`),
      ...(r.smallTaps || []).slice(0, 4).map((t) => `below house tap floor ${t.el} ${t.w}x${t.h}`),
    ].join("\n");
    const shot = r.shot ? `<a href="${r.shot}">shot</a>` : "";
    return `<td class="${cls}" title="${esc(detail)}">${issues || "&check;"} ${shot}</td>`;
  };
  const vps = [...new Set(rows.map((r) => r.viewport))];
  const scr = [...new Set(rows.map((r) => r.screen))];
  const head = vps.map((v) => `<th>${esc(v)}</th>`).join("");
  const body = scr.map((s) => `<tr><th>${esc(s)}</th>` +
    vps.map((v) => cellHtml(rows.find((r) => r.screen === s && r.viewport === v) || { skipped: "not run" })).join("") +
    "</tr>").join("\n");
  fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset="utf-8">
<title>Apex 26 layout audit</title>
<style>
 body{background:#0b0b10;color:#e8e8ee;font:13px/1.5 ui-sans-serif,system-ui;padding:24px}
 h1{font-size:18px;letter-spacing:.08em} table{border-collapse:collapse;margin-top:16px}
 th,td{border:1px solid #26262e;padding:6px 10px;text-align:center}
 th{font-weight:600;color:#a9a9b6;font-size:11px} tbody th{text-align:left;color:#e8e8ee}
 td.ok{background:#12301c;color:#7fd89a} td.warn{background:#3a3212;color:#e2c766}
 td.bad{background:#3a1414;color:#ff9c9c;font-weight:700} td.skip{background:#1a1a20;color:#6b6b78}
 p{color:#9a9aa5;max-width:70ch}
</style>
<h1>APEX 26 — LAYOUT AUDIT</h1>
<p>One cell per screen x viewport. Green means nothing clipped, nothing off screen,
no horizontal overflow and no page errors. Amber means every finding is a control
below the house <code>--tap</code> floor but at or above WCAG 2.2 SC 2.5.8's
24&times;24 &mdash; a preference, not a defect. Red is the count of real findings,
tap targets under 24px among them &mdash; hover a cell for the list.</p>
<p><b>STARVED</b> is the one finding here that is not about position. A scroll
region crushed to a couple of pixels is in exactly the right place &mdash; it
clips nothing, overflows nothing, sits inside its parent &mdash; and every other
check scores it green. It has cost three investigations, always the same shape:
<code>scrollHeight</code> says there is content, <code>clientHeight</code> says
there is nowhere to put it.</p>
<p>Grey means SKIPPED: the cell was never measured, so it is not a pass and not a
finding. Hover it for the reason. A click timeout there is usually the box, not
the app &mdash; re-run that cell alone at <code>--jobs=1</code> before drawing any
conclusion from it.</p>
<table><thead><tr><th></th>${head}</tr></thead><tbody>${body}</tbody></table>`);
}
