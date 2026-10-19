/* select-screen-fixes.test.mjs — two picker behaviours that moved the player's
 * selection without being asked (round-2 hunt, G3 and M3).
 *
 *  - G3: tapping the team you ALREADY have in the team picker is a dismiss. It
 *    used to fall through and reset the driver seat to the first free one
 *    (seat 1 -> 0), and on LEGENDS that switched to Schumacher and reseeded the
 *    tuned build.
 *  - M3: unstarring the ACTIVE circuit under the FAVOURITES filter snapped the
 *    selection to the first remaining favourite while CIRCUIT DETAIL still
 *    described the old one. The active tile now stays until another is picked.
 *
 * select-screen.js runs in a Node VM on tests/helpers/mini-dom.mjs.
 * Run: node --test tests/unit/select-screen-fixes.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot(disk = {}, o = {}) {
  const dom = makeDom();
  let appearanceApplied = 0;
  dom.body.insertAdjacentHTML = () => {};
  const data = new Map(Object.entries(disk).map(([k, v]) => [k, JSON.stringify(v)]));
  const store = {
    broken: null, rev: 0, subscribe: () => () => {},
    get: (k, d) => (data.has(k) ? JSON.parse(data.get(k)) : d),
    set: (k, v) => { if (v === undefined) data.delete(k); else data.set(k, JSON.stringify(v)); store.rev++; return true; },
    rawDel: (k) => { data.delete(k); return true; },
  };
  const LIST = [
    { id: "monza", name: "Monza", country: "Italy" },
    { id: "spa", name: "Spa", country: "Belgium" },
    { id: "imola", name: "Imola", country: "Italy", classic: true },
  ];
  const TEAMS = [
    { id: "ferrari", name: "Ferrari", color: [1, 0, 0], color2: [1, 1, 1], drivers: [{ name: "A B", code: "AAA", num: 1 }, { name: "C D", code: "CCC", num: 2 }] },
    { id: "legends", name: "Legends", legends: true, color: [1, 0, 0], color2: [1, 1, 1], drivers: [{ name: "E F", code: "EEE", num: 3 }, { name: "G H", code: "GGG", num: 4 }] },
  ];
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Promise, Date, parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    getComputedStyle: () => ({ getPropertyValue: () => "", display: "flex", flexDirection: "row", gridTemplateColumns: "none", paddingTop: "0px", paddingBottom: "0px" }),
    innerWidth: 1000, innerHeight: 600, requestAnimationFrame: () => 0,
    Tracks: { LIST }, Teams: { LIST: TEAMS }, Flags: { svg: () => "" },
    AppearanceOpts: { applyAll() { appearanceApplied++; } },
    SeasonCal: { canRace: () => true, rounds: () => 0 },
    TrackMaps: {
      corners: () => [], direction: () => "CW", elevRange: () => 0,
      drsZones: o.trackMapsDrs || (() => []),
      aspect: () => 1.5, elevProfile: () => null,
      fitCanvas: () => ({ w: 100, h: 60 }), draw() {},
    },
  };
  sb.window = sb;
  vm.runInNewContext(src("js/ui/select-screen.js"), sb, { filename: "js/ui/select-screen.js" });
  const $ = (id) => dom.byId(id);
  const selTracks = $("sel-tracks");
  Object.defineProperty(selTracks, "textContent", { get: () => "", set() { selTracks.children.length = 0; } });
  const selTeams = $("sel-teams");
  Object.defineProperty(selTeams, "textContent", { get: () => "", set() { selTeams.children.length = 0; } });
  let built = 0;
  const G = {
    $, store, cssCol: () => "#000", fmtTime: String, ttBoard: () => [], tickUi() {}, scheduleFlybyTrack() {},
    getLiveryId: (id) => store.get("livery." + id, "default"),
    getLiveries: (team) => [{ id: "default", c1: team.color, c2: team.color2 }].concat(store.get("livery.custom." + team.id, [])),
    els: { select: $("select"), selTracks, selGo: $("sel-go"), selTitle: $("sel-title"), selTrackSection: $("sel-track-section"),
      selCircuitLabel: $("sel-circuit-label"), selPreviewMap: $("sel-preview-map"), selPreviewName: $("sel-preview-name"),
      selPreviewGp: $("sel-preview-gp"), selPreviewMeta: $("sel-preview-meta"), selPreviewRec: $("sel-preview-rec"), selTeams },
    trackIdx: 1, teamIdx: 0, driverIdx: 0, timeTrial: false, seasonMode: false, netRoom: false, daily: null, soundOn: false,
    announce() {}, buildSetup: () => { built++; }, ...o,
  };
  const menus = sb.Menus.create(G);
  menus.buildSelect();
  const tiles = () => selTracks.querySelectorAll(".track-row");
  return { dom, data, G, menus, tiles, selTeams, built: () => built, appearanceApplied: () => appearanceApplied, LIST,
    teamPicker: () => dom.byId("teampicker") };
}

test("G3: tapping the ACTIVE team tile does not touch the seat or the stored driver", () => {
  const h = boot({ team: 0, driver: 1 }, { teamIdx: 0, driverIdx: 1 });
  h.menus.setTeamPicker(true);
  const tile = h.selTeams.querySelectorAll(".team-tile")[0];
  tile.onclick();
  assert.equal(h.G.teamIdx, 0);
  assert.equal(h.G.driverIdx, 1, "seat 1 stays seat 1");
  assert.equal(JSON.parse(h.data.get("driver")), 1, "nothing written");
  assert.equal(h.built(), 0, "no garage rebuild for a no-op");
  assert.equal(h.teamPicker().hidden, true, "the tap still dismisses the sheet");
});

test("G3: the LEGENDS tile re-tapped while active keeps the legend seat", () => {
  const h = boot({}, { teamIdx: 1, driverIdx: 1 });
  h.menus.setTeamPicker(true);
  h.selTeams.querySelectorAll(".team-tile")[1].onclick();
  assert.equal(h.G.driverIdx, 1, "legend seat unchanged (it used to reset to 0 = Schumacher)");
});

test("G3: picking ANOTHER team still takes the first free seat", () => {
  const h = boot({}, { teamIdx: 1, driverIdx: 1 });
  h.menus.setTeamPicker(true);
  h.selTeams.querySelectorAll(".team-tile")[0].onclick();
  assert.equal(h.G.teamIdx, 0);
  assert.equal(h.G.driverIdx, 0);
  assert.equal(h.built(), 1);
});

test("team selection reapplies TEAM appearance accents immediately", () => {
  const h = boot({}, { teamIdx: 1, driverIdx: 1 });
  h.menus.setTeamPicker(true);
  h.selTeams.querySelectorAll(".team-tile")[0].onclick();
  assert.equal(h.G.teamIdx, 0);
  assert.equal(h.appearanceApplied(), 1);
});

test("M3: unstarring the ACTIVE circuit under FAVOURITES keeps it selected and on the strip", () => {
  // spa (idx 1, active) and imola (idx 2) are favourites, filter = fav.
  const h = boot({ favTracks: ["spa", "imola"], trackFilter: "fav" }, { trackIdx: 1 });
  assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["1", "2"]);
  h.menus.openTrackDetail();
  const btn = h.dom.byId("track-detail-fav");
  assert.equal(btn.getAttribute("aria-pressed"), "true");
  btn.onclick();                                   // unstar the circuit being read
  assert.deepEqual(JSON.parse(h.data.get("favTracks")), ["imola"]);
  assert.equal(h.G.trackIdx, 1, "the selection did not jump to the first remaining favourite");
  assert.equal(h.data.has("trackId"), false, "no selection write either");
  assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["1", "2"], "the active tile is not filtered out");
});

test("M3: the pin ends when another circuit is picked", () => {
  const h = boot({ favTracks: ["spa", "imola"], trackFilter: "fav" }, { trackIdx: 1 });
  h.menus.openTrackDetail();
  h.dom.byId("track-detail-fav").onclick();
  const imola = h.tiles().find((r) => r.dataset.trackIdx === "2");
  imola.onclick();
  assert.equal(h.G.trackIdx, 2);
  h.menus.buildSelect();
  assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["2"], "the unstarred circuit leaves the strip once it is not active");
});

test("M3: unstarring a circuit that is NOT active still filters as before", () => {
  const h = boot({ favTracks: ["spa", "imola"], trackFilter: "fav" }, { trackIdx: 1 });
  // toggle imola (not active) through the F key on its tile
  const imola = h.tiles().find((r) => r.dataset.trackIdx === "2");
  h.dom.dispatch(imola, { type: "keydown", key: "f", bubbles: true });
  assert.equal(h.G.trackIdx, 1);
  assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["1"]);
});

test("CLASSICS filter refreshes the hero preview when the active circuit is hidden", () => {
  const h = boot({}, { trackIdx: 1 });
  assert.equal(h.G.els.selPreviewName.textContent, "Spa");
  h.dom.body.querySelectorAll(".sel-chip").find((c) => c.dataset.filter === "classic")
    .onclick({ stopPropagation() {} });
  assert.equal(h.G.trackIdx, 2);
  assert.equal(h.G.els.selPreviewName.textContent, "Imola", "preview follows the snapped classic");
});

for (const [filter, index, visible] of [["season", 0, ["0", "1"]], ["classic", 2, ["2"]], ["fav", 1, ["1"]]]) {
  test(`explicit ${filter} filter leaves a selected custom circuit`, () => {
    const h = boot({ trackFilter: "season", favTracks: ["spa"] });
    h.LIST.push({ id: "custom-test", name: "Test Loop", country: "Test", custom: true });
    h.G.trackIdx = 3;
    h.menus.buildSelect();
    assert.equal(h.G.trackIdx, 3, "passive designer entry preserves its custom selection");
    assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), ["0", "1", "2", "3"], "custom is visible despite saved season filter");
    h.dom.body.querySelectorAll(".sel-chip").find((c) => c.dataset.filter === filter)
      .onclick({ stopPropagation() {} });
    assert.equal(h.G.trackIdx, index, "the explicit filter selects a matching circuit");
    assert.deepEqual(h.tiles().map((r) => r.dataset.trackIdx), visible);
    const chip = h.dom.body.querySelectorAll(".sel-chip").find((c) => c.dataset.filter === filter);
    assert.equal(chip.getAttribute("aria-pressed"), "true");
    assert.equal(h.G.els.selPreviewName.textContent, h.LIST[index].name);
    assert.equal(JSON.parse(h.data.get("trackId")), h.LIST[index].id);
    assert.equal(JSON.parse(h.data.get("trackFilter")), filter);
  });
}

test("DRS zone labels name an S/F wrap with arrow markers", () => {
  const h = boot({}, {
    trackIdx: 0,
    trackMapsDrs: () => [{ a: 0.93, b: 0.1, wrap: true }],
  });
  h.LIST[0].lengthKm = 5.771;
  const menus = h.menus;
  assert.equal(menus.drsZoneWraps({ a: 0.5, b: 0.4 }), true);
  assert.equal(menus.drsZoneWraps({ a: 0.2, b: 0.8 }), false);
  const html = menus.drsZoneRangeHtml({ a: 0.93, b: 0.09, wrap: true }, 5771);
  assert.match(html, /5367 m.*S\/F.*519 m/);
  assert.match(html, /crossing start\/finish/);
  h.menus.openTrackDetail();
  const list = h.dom.byId("track-detail-drs-list").innerHTML;
  assert.match(list, /Zone 1:.*S\/F/);
  assert.doesNotMatch(list, /5370 m &ndash; 519 m/);
});

test("track detail names its map and elevation canvases for the selected circuit", () => {
  const h = boot({}, { trackIdx: 1 });
  h.menus.openTrackDetail();
  assert.equal(h.dom.byId("track-detail-canvas").getAttribute("aria-label"), "Spa circuit layout diagram");
  assert.equal(h.dom.byId("track-detail-elev").getAttribute("aria-label"), "Spa elevation profile");
});
