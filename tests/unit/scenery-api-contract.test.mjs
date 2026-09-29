// scenery-api-contract.test.mjs — freezes the shape of the `scenery(api)`
// object that TrackBuildProps.build (js/track/scenery/build-props.js) hands to
// every circuit's bespoke scenery callback (40 consumer files in js/circuits/).
//
// The api members below are the de-facto public contract those files were
// written against (docs/SCENERY-API.md). Any split/refactor of buildProps
// must keep this surface intact — this test catches an accidentally dropped
// or renamed member headlessly in seconds, without building every circuit.
//
// If you ADD a member intentionally, append it here (additions are safe;
// removals/renames break circuit files and need a sweep of js/circuits/*.js).
//
// Run: node --test tests/unit/scenery-api-contract.test.mjs  (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const fs = require("node:fs");
const path = require("node:path");
const { buildContext } = require("../../tools/track/verify-track.cjs");
const MANIFEST = require("../../tools/manifest.cjs");

const CONTRACT = [
  "ATM", "COL", "K", "MAT",
  "acacia", "addBox", "addCone", "addCyl", "addFrustum", "addMountain", "addPrism", "addPyramid",
  "along", "anchor", "backdrop", "bakedModel", "bankedKerbStrip",
  "billboard", "bleacher", "bowlSeatWall",
  "broadcastCompound", "broadleafFall", "building", "bush", "cameraTower", "cantilever", "circuitKit",
  "cityFront", "concreteCanyon", "conifer",
  "cross", "cypress", "def", "drape", "drapeRun", "ds", "every", "fence", "ferrisWheel", "floodMast",
  "floodMastRing", "forestEdge", "foundation", "frameAt", "gantry", "grandstand", "grandstandEx",
  "gridshellCanopy",
  "groundPatch", "groundPlane", "groundUnder", "groundYAt", "groundedSegments", "guardrail",
  "hash", "hedge", "house", "hw", "indexSolid", "lampPost", "landmarkKit", "lapBounds", "ledFacadeBands", "lerp",
  "marshalPost", "modelDiagnostics", "modelGroup", "motorhome", "mountain",
  "n", "night", "norm", "onTrack", "out", "overheadSpan", "pal", "palm",
  "pastelStreetRow", "peak", "pine", "place", "plane", "prop", "px", "py", "pyMin",
  "pz", "recordBarrier", "ridge", "runoffApron", "sailCanopy", "scaffoldStand",
  "sceneryTheme", "seat",
  "signBoard", "signDigit", "spectatorHill", "sponsorHoarding", "stonePine", "terrace", "terrainYAt", "theme",
  "tieredBowl", "tower", "track", "tree",
  "tyreWall",
  "underpassPortal", "upOf", "vadd", "wall", "waterBand", "waterField", "waterSurface",
];

// The member COUNT is asserted separately from the deepEqual above it: a paste
// that drops one name while adding another still satisfies "these are sorted and
// equal" if BOTH lists are edited together, and the count is the cheap tripwire
// that says how many things circuits may call. Bump it deliberately.
// 111 -> 112 (2026-09-10): `bakedModels` dropped (no circuit ever called it);
// `K` (frac -> un-shifted node) and `lapBounds()` (cached lap centroid +
// radius) added — the two pieces of boilerplate 37 and 30 files carried.
// 112 -> 114 (2026-09-25): `drape` + `drapeRun` (terrain-fitted flat decals,
// TrackModels.drapeKit) — promoted from four identical ~100-line circuit-local
// copies (paul_ricard, dijon, okayama, miami), vertex-identical to them.
const CONTRACT_SIZE = 114;

test("the frozen contract is the size it declares", () => {
  assert.equal(CONTRACT.length, CONTRACT_SIZE);
  assert.equal(new Set(CONTRACT).size, CONTRACT_SIZE, "duplicate member in CONTRACT");
  assert.deepEqual(CONTRACT, [...CONTRACT].sort(), "CONTRACT must stay sorted");
});

test("buildProps sceneryApi surface matches the frozen contract", () => {
  const Tracks = buildContext();
  // A non-reversed, non-source-coordinate def sees the raw (unwrapped) api.
  // The shipped closures live in window.TrackScenery now (LAZY_SCENERY), so
  // "has a scenery callback" is a question about the manifest roster, not about
  // def.scenery — which is undefined on every shipped circuit today. The probe
  // below is assigned to def.scenery, which tracks.js resolves FIRST precisely
  // so an explicit override still beats the registry.
  const withScenery = new Set(MANIFEST.LAZY_SCENERY.map((f) => f.split("/").pop().replace(/\.js$/, "")));
  const def = Tracks.LIST.find(
    (d) => !d.reverse && d.sceneryCoordinates !== "source" && (d.scenery || withScenery.has(d.id)),
  );
  assert.ok(def, "need at least one plain circuit with a scenery callback");
  let keys = null;
  def.scenery = (api) => { keys = Object.keys(api).sort(); };
  Tracks.build(def);
  assert.ok(keys, "scenery callback was not invoked during Tracks.build");
  assert.deepEqual(keys, CONTRACT);
});

test("reversed/source-coordinate defs get the same surface (wrapped)", () => {
  const Tracks = buildContext();
  const def = Tracks.LIST.find(
    (d) => (d.reverse || d.sceneryCoordinates === "source") && d.scenery,
  );
  if (!def) return; // no such circuit currently — nothing to check
  let keys = null;
  def.scenery = (api) => { keys = Object.keys(api).sort(); };
  Tracks.build(def);
  assert.ok(keys, "scenery callback was not invoked during Tracks.build");
  // transformSceneryApi must wrap helpers without adding/dropping members.
  assert.deepEqual(keys, CONTRACT);
});

const landmarkSource = (id) =>
  fs.readFileSync(path.resolve(`js/circuits/scenery/${id}.js`), "utf8");

const requiredLandmark = (body, id) => {
  const start = body.indexOf(`modelGroup("${id}"`);
  assert.notEqual(start, -1, `${id} model group is missing`);
  assert.match(body.slice(start, start + 2200), /\{\s*required:\s*true\s*\}\s*\)/,
    `${id} must be structurally required`);
};

test("BATCH-01 Must landmarks are explicit required scenery assemblies", () => {
  const expected = {
    monaco: ["monaco-tabac-shop", "monaco-mirabeau-apartments", "monaco-rascasse-bar"],
    singapore: ["singapore-parliament-house", "singapore-fullerton-hotel", "singapore-anderson-bridge"],
    suzuka: ["suzuka-crossover-portal", "suzuka-spoon-terrace", "suzuka-130r-bank"],
    // Wave 4 — Interlagos / COTA / Mexico / Yas Marina
    interlagos: ["interlagos-senna-s", "interlagos-main-tribuna", "interlagos-sp-skyline"],
    // Wave 6 — Imola (Partenza opposite pits + Racetrack Tower over Tilke pit)
    imola: ["imola-partenza-stands", "imola-racetrack-tower"],
    cota: ["cota-amphitheater", "cota-turn1-big-red", "cota-main-grandstand"],
    // Wave 6 — Portimão / Algarve: six independent paddock blocks (Dimeconsult
    // A–F) + Grandstand Norte at the T1 downhill; race-control + moinho kept.
    portimao: [
      "portimao-pit-blocks",
      "portimao-t1-stands",
      "portimao-race-control",
      "portimao-moinho",
    ],
    mexico: ["mexico-foro-sol-entry", "mexico-peraltada-stand", "foro-scoreboard"],
    // Wave 6 — Sochi Olympic Park venues + Ice Cube + Olympic Park station
    sochi: [
      "sochi-fisht-stadium",
      "sochi-bolshoy-dome",
      "sochi-adler-arena",
      "sochi-flame-tower",
      "sochi-iceberg-palace",
      "sochi-olympic-rings",
      "sochi-race-control",
      "sochi-shayba-arena",
      "sochi-ice-cube",
      "sochi-olympic-park-station",
    ],
    abudhabi: ["abudhabi-ferrari-world", "abudhabi-marina", "abudhabi:pit-exit-tunnel-portal"],
    // Wave 6 — Albert Park (Piastri stand 2026, MSAC, Lakeside Stadium)
    albert_park: ["albert-piastri-stand", "albert-msac", "albert-lakeside-stadium"],
    // Nürburgring GP-Strecke — Burg + Coca-Cola Kurve + race control
    nurburgring: ["nurburgring-burg-nurburg", "nurburgring-coca-cola-kurve", "nurburgring-race-control"],
    // Wave 6 — Indianapolis Motor Speedway road course (Pagoda / pylon /
    // pit stalls already required; continuous Paddock–Tower Terrace wall)
    indianapolis: [
      "indy-pagoda",
      "indy-scoring-pylon",
      "indy-pit-stalls",
      "indy-main-stands",
    ],
    // Wave 5 — Shanghai International Circuit (wing piers are literal
    // modelGroups; decks stay on overheadSpan. pudong/boardwalk stay required
    // at runtime but their emit bodies exceed the 2200-char BATCH-01 window).
    shanghai: [
      "shanghai-wing-east", "shanghai-wing-west",
      "shanghai-circles-stand", "shanghai-yu-pavilions",
    ],
    // Wave 5 — Lusail (Qatar): record pit slab, Lusail Hill GA mound, T1 VVIP,
    // paddock media, city backdrops (no mosque / Aspire / oasis — deliberate).
    qatar: [
      "qatar-pit-slab",
      "qatar-paddock-media-centre",
      "qatar-t1-vvip-canopy",
      "qatar-lusail-hill",
      "qatar-katara-towers",
      "qatar-lusail-stadium",
    ],
    // Wave 5 — Hungaroring 2024–25 paddock / main tribune
    hungaroring: ["hungaroring-pit-complex", "hungaroring-main-tribune"],
    // Wave 5 — Catalunya landmarks (Tilke main stand + pit-end scoreboard)
    catalunya: ["catalunya-main-grandstand", "catalunya-pit-end-scoreboard", "catalunya-race-control"],
    // Bahrain hollow-stand fix — T1 naming marker (Michael Schumacher Corner, 2014)
    bahrain: ["bahrain-sakhir-tower", "bahrain-university-grandstand", "bahrain-schumacher-corner"],
    // Wave 6 — Baku Old City (Shirvanshah palace + İçerişəhər wall)
    baku: ["baku-shirvanshah-palace", "baku-icheri-sheher-wall"],
    // Wave 6 — Red Bull Ring (Steiermark / Niki Lauda Kurve stand at T1)
    redbull: ["redbull-lauda-kurve-stand"],
    // Wave 6 — Madring / La Monumental inside rake + masts
    madrid: ["madrid-monumental-stands"],
    // Wave 6 — Istanbul Park (T8 hospitality + race control + stone portal)
    istanbul: ["istanbul-turn8-hospitality", "istanbul-race-control", "istanbul-stone-portal"],
    // Wave 6 — Zandvoort F1 Fanzone Ferris wheel (festival landmark)
    zandvoort: ["zandvoort-ferris-wheel"],
    // Wave 6 — Montreal hairpin / Wall of Champions / Biosphère
    montreal: [
      "montreal-hairpin-grandstands",
      "montreal-wall-of-champions-stand",
      "montreal-biosphere",
    ],
    // Wave 6 — Mugello Centrale + Poggio Secco + Materassi (hillside GA at
    // Arrabbiata / San Donato is spectatorHill, not a required modelGroup).
    mugello: [
      "mugello-centrale-stand",
      "mugello-poggio-secco-stand",
      "mugello-materassi-stand",
    ],
    // Wave 6 — Kyalami Highveld landmarks (pit/race-control already required;
    // main GS + headgear/windpump/clubhouse made explicit this wave).
    kyalami: [
      "kyalami-pit-block",
      "kyalami-race-control",
      "kyalami-main-grandstand",
      "kyalami-headgear",
      "kyalami-windpump",
      "kyalami-clubhouse",
    ],
    // Wave 6 — Hockenheim Motodrom ring (Süd + Nord permanent stands)
    hockenheim: [
      "hockenheim-motodrom-screen",
      "hockenheim-mercedes-tribune",
      "hockenheim-sued-tribune",
      "hockenheim-nord-tribune",
      "hockenheim-race-control",
      "hockenheim-infield-compound",
    ],
    // Wave 6 — Paul Ricard F1-era landmarks (Blue Zone already draped;
    // main stand / Beausset hill / 2019 pit entry / aerodrome / Provençal hut)
    paul_ricard: [
      "paul-ricard-main-grandstand",
      "paul-ricard-beausset-hill",
      "paul-ricard-pit-entry-2019",
      "paul-ricard-race-control",
      "paul-ricard-aerodrome",
      "paul-ricard-airfield-tower",
      "paul-ricard-cabanon",
      "paul-ricard-drywall",
    ],
    // Wave 6 — Buenos Aires (Gálvez): classic pit/tower/portico + Curvón
    // terrace, Confitería café, 27 de Febrero talud gate. Flag avenue is
    // UNCERTAIN — generic poles only, no required modelGroup.
    buenos_aires: [
      "baires-pit-block",
      "baires-control-tower",
      "baires-portico",
      "baires-terrace-curvon",
      "baires-confiteria",
      "baires-talud-gate",
    ],
    // Wave 6 — Fuji Speedway Hotel + Motorsports Museum (west side, 2022)
    fuji: ["fuji-speedway-hotel"],
    // Wave 6 — Donington Park: 2017–18 MSV Hollywood grandstand (grandstandEx
    // suppressed on the Craner fold; bespoke positive-rake modelGroup).
    donington: ["donington-hollywood-stand"],
    // Wave 6 — Sepang hibiscus main canopy + K1/F corner stands
    sepang: ["sepang-main-grandstand-canopy", "sepang-t1-grandstand", "sepang-t7-grandstand"],
    // Wave 6 — Mosport / CTMP: club pit run, Moss Corner bank, Whites tunnel,
    // Grand Prix Event Centre (rooftop). Speedway oval NOT built — closed /
    // outside the road course (Wikipedia).
    mosport: [
      "mosport-pit-garages",
      "mosport-moss-corner-bank",
      "mosport-whites-tunnel",
      "mosport-event-centre",
    ],
    // Wave 6 — Estoril: 30-bay pit terrace (official boxes 17×6.70 m) +
    // existing timing tower / aldeia / depósito / moinho made required.
    // Moinho kept but UNCERTAIN as an on-site feature (leave, do not extend).
    estoril: [
      "estoril-pit-terrace",
      "estoril-timing-tower",
      "estoril-aldeia",
      "estoril-deposito",
      "estoril-moinho",
    ],
    // Wave 6 — Brands Hatch Indy amphitheatre stands + Kentagon
    brands_hatch: [
      "brands-pit-straight-stand",
      "brands-desire-wilson-stand",
      "brands-paddock-hill-stand",
      "brands-hailwoods-stand",
      "brands-kentagon",
    ],
    // Wave 6 — Mont-Tremblant (Laurentians): control tower, The Hump crest,
    // service bridge, Namerow bank, Paddock Bend fascia. Devil's Elbow /
    // Casino / Le Nordique are Montreal names — deliberately omitted.
    mont_tremblant: [
      "tremblant-control-tower",
      "tremblant-hump-crest",
      "tremblant-bridge",
      "tremblant-namerow-bank",
      "tremblant-paddock-bend-stand",
    ],
    // Wave 6 — Jerez: El Ovni VIP deck on the finish line, Tío Pepe control
    // tower, Dani Pedrosa (Dry Sack) + Jorge Lorenzo corner markers.
    jerez: [
      "jerez-ovni",
      "jerez-control-tower",
      "jerez-lorenzo-corner",
      "jerez-dani-pedrosa",
    ],
    // Wave 6 — Watkins Glen: 2006 control-tower booths, Nazareth pit terrace,
    // Sahlen Esses hillside (positive-slope GA bank + timber stand)
    watkins_glen: ["glen-pit-terrace", "glen-esses-hill", "glen-timing-tower"],
    // Wave 6 — Okayama / TI Circuit Aida: 4-storey control tower (OIRC),
    // pit garage run (superseded by engine pit complex — same as mosport/
    // estoril), A/B paddock club block. Dunlop bridge is overheadSpan
    // (required at runtime; not a modelGroup so not listed here).
    okayama: [
      "okayama-pit-garages",
      "okayama-control-tower",
      "okayama-paddock-block",
    ],
  };
  for (const [track, ids] of Object.entries(expected)) {
    const body = landmarkSource(track);
    for (const id of ids) requiredLandmark(body, id);
  }

  const monaco = landmarkSource("monaco");
  assert.match(monaco, /monaco-tabac-shop[\s\S]{0,2200}TABAC/);
  assert.match(monaco, /monaco-rascasse-bar[\s\S]{0,2200}RASCASSE/);
  assert.match(monaco, /const harbourStations = \[0\.365, 0\.545, 0\.59\]/);
  assert.equal((landmarkSource("singapore").match(/\bcityFront\s*\(/g) || []).length, 5,
    "Must landmarks must not densify cityFront");
});

// ── K: the frac -> node index must be a valid index for EVERY frac ─────────────
// JS `%` keeps the dividend's sign, so `Math.round(s * n) % n` handed a NEGATIVE
// slot to any prop placed `s - 0.002` behind a node just past the start line.
// Ten circuit-local copies carried that form (Okayama's alone wrapped) until
// 2026-09-22, when the copies were retired for this member and it was
// normalised. The whole lap and one turn either side must land in [0, n).
test("api.K wraps negative and over-lap fracs into [0, n)", () => {
  const Tracks = buildContext();
  const withScenery = new Set(MANIFEST.LAZY_SCENERY.map((f) => f.split("/").pop().replace(/\.js$/, "")));
  const def = Tracks.LIST.find((d) => !d.reverse && d.sceneryCoordinates !== "source" && withScenery.has(d.id));
  let K = null, n = 0;
  def.scenery = (api) => { K = api.K; n = api.n; };
  Tracks.build(def);
  assert.ok(K && n > 0, "the probe saw api.K and api.n");
  for (const s of [-0.5, -0.002, -1e-9, 0, 0.5, 0.999999, 1, 1.002, 1.5]) {
    const k = K(s);
    assert.ok(Number.isInteger(k) && k >= 0 && k < n, `K(${s}) = ${k} must index [0, ${n})`);
  }
  assert.equal(K(-0.002), K(1 - 0.002), "a frac just behind the line is the node just behind the line");
});
