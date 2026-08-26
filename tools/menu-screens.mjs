#!/usr/bin/env node
// menu-screens.mjs — canonical screen routes for layout-audit.mjs.
import { createRequire } from "node:module";
import { pickCircuit } from "./circuit-axis.mjs";

const require = createRequire(import.meta.url);
const { devices } = require("playwright");

export const VIEWPORTS = [
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

export const SCREENS = [
  { id: "title", name: "Title / main menu", root: "#overlay", open: async () => {} },
  { id: "select", name: "Circuit select", root: "#select", mapAxis: true, open: async (p, circuit) => {
      await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await pickCircuit(p, circuit); } },
  { id: "garage", name: "Garage", root: "#carsetup", open: async (p) => {
      await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])", { timeout: 15000 });
      await p.evaluate(() => { const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
        (t.find((e) => /ENGINE/i.test(e.textContent)) || t[1] || t[0])?.click(); }); } },
  // SEASON SETUP is reached through the season select screen, not the title: the
  // CUSTOMISE button only exists in #select's season branch (js/game/menus.js),
  // which is what keeps it out of the Grand Prix pixel golden.
  { id: "season-setup", name: "Season setup", root: "#season-setup", open: async (p) => {
      await p.click("#mb-season"); await p.waitForSelector("#select:not([hidden])", { timeout: 15000 });
      await p.click("#sel-customise");
      await p.waitForSelector("#season-setup:not([hidden])", { timeout: 15000 }); } },
  { id: "career", name: "Career hub", root: "#career", open: async (p) => {
      await p.click("#mb-career"); await p.waitForSelector("#career:not([hidden])", { timeout: 15000 }); } },
  { id: "datahub", name: "F1 data hub", root: "#datahub", open: async (p) => {
      await p.click("#mb-data"); await p.waitForSelector("#datahub:not([hidden])", { timeout: 15000 });
      await p.waitForTimeout(1200); } },
  { id: "howtoplay", name: "How to play", root: "#howtoplay", open: async (p) => {
      await p.click("#mb-settings"); await p.waitForSelector("#pmsettings:not([hidden])", { timeout: 15000 });
      await p.click("#pm-tab-more");
      await p.click("#pm-howto"); await p.waitForSelector("#howtoplay:not([hidden])", { timeout: 15000 }); } },
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

  // The fly-cam's OWN controls (sticks, climb/dive column, FOV bar, EXIT /
  // PANEL / HUD). They live under #photo-controls, which was in OVERLAY_IDS
  // for the reset but never a root — so none of them had ever been measured,
  // which is how three of them missed the --tap-min floor pass. Same route as
  // the cell above; only the measured root differs.
  { id: "photocontrols", name: "Free camera — photo controls", root: "#photo-controls",
    open: async (p) => {
      await p.evaluate(async () => { await window.__apex.race("monza"); });
      await p.waitForFunction(() => window.__apex.info().track === "monza", null, { timeout: 40000 });
      await p.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 40); });
      await p.evaluate(() => { document.getElementById("pausemenu").hidden = false; });
      await p.waitForTimeout(200);
      await p.evaluate(() => document.getElementById("pm-settings")?.click());
      // 30s, not the fly cell's 15s: this cell always runs as the SECOND
      // consecutive full race build in a sweep, and under that load the 15s
      // waits timed out on every scale-axis viewport (6 skips, first run).
      await p.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { timeout: 30000 });
      await p.waitForTimeout(250);
      await p.evaluate(() => document.getElementById("pm-lighting")?.click());
      await p.waitForFunction(() => !document.querySelector("#lighting").hidden, null, { polling: 100, timeout: 30000 });
      await p.waitForTimeout(400);
      await p.evaluate(() => document.getElementById("pc-toggle")?.click());
      await p.waitForFunction(() => document.body.classList.contains("photo-mode"),
        null, { polling: 100, timeout: 30000 });
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

export const OVERLAY_IDS = [
  "select", "carsetup", "career", "career-offers", "career-history",
  "career-guide", "teampicker", "race-settings", "quali", "standings", "results", "customize",
  "season-setup", "howtoplay", "advanced", "pmsettings", "pausemenu", "datahub", "track-detail", "vsfriend",
  "audioset", "spotifypanel", "lighting", "camtune", "photo-controls",
];

export function listScreenIds() {
  return SCREENS.map((s) => s.id);
}

export function getScreen(id) {
  return SCREENS.find((s) => s.id === id) || null;
}

export function pickScreens(all, patternArg) {
  if (!patternArg) return all;
  const pats = patternArg.split(",");
  return all.filter((x) => pats.some((p) =>
    p.endsWith("*") ? x.id.startsWith(p.slice(0, -1)) : x.id === p));
}

export function pickViewports(all, patternArg) {
  if (!patternArg) return all;
  const pats = patternArg.split(",");
  return all.filter(([n]) => pats.some((p) =>
    p.endsWith("*") ? n.startsWith(p.slice(0, -1)) : n === p));
}
