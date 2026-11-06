#!/usr/bin/env node
// Generate screenshot targets from required, actually emitted scenery models.
// Camera stations use source viewpoints where possible, else the built road.
// @doc Regenerate/check the all-circuit emitted-scenery screenshot location catalog.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { buildContext } = require("../lib/track-build-vm.cjs");
const { scenerySourceDigest } = require("./scenery-source-hash.cjs");

const root = path.resolve(__dirname, "../..");
const dir = path.join(root, "tests/data/landmarks");
const outFile = path.join(__dirname, "scenery-locations.json");
const round = (v, digits) => Number(v.toFixed(digits));
// A model can sit nearer a different road segment from the one it was authored
// to be seen from. These viewpoints are explicit in the current scenery source
// or circuit brief; "authored" values pass through the BUILT TrackSpace shift.
const VIEWPOINTS = {
  "baires-control-tower": { authored: .995, source: "js/circuits/scenery/buenos_aires.js anchor K(0.995)" },
  "donington-hollywood-stand": { authored: .188, source: "js/circuits/scenery/donington.js sHollywood" },
  "donington-ema-airliner": { authored: .640, source: "js/circuits/scenery/donington.js sAir" },
  "estoril-aldeia": { authored: .260, source: "js/circuits/scenery/estoril.js anchor K(0.26)" },
  "estoril-deposito": { authored: .620, source: "js/circuits/scenery/estoril.js anchor K(0.62)" },
  "estoril-moinho": { authored: .440, source: "js/circuits/scenery/estoril.js anchor K(0.44); geographic identity uncertain" },
  "fuji-speedway-hotel": { authored: .168, source: "js/circuits/scenery/fuji.js anchor K(0.168)" },
  "fuji-mount-fuji": { racing: .120, source: "docs/tracks/fuji.md §4 skyline viewing station" },
  "hockenheim-infield-compound": { authored: .890, source: "js/circuits/scenery/hockenheim.js anchor K(0.890)" },
  "imola-hill-villas": { racing: .355, source: "js/circuits/scenery/imola.js anchor R(0.355)" },
  "interlagos-guarapiranga": { authored: .420, source: "js/circuits/scenery/interlagos.js anchor K(0.42)" },
  "interlagos-guarapiranga-shore": { authored: .400, source: "js/circuits/scenery/interlagos.js anchor K(0.40)" },
  "jacarepagua-fishing-skiff": { authored: .448, source: "js/circuits/scenery/jacarepagua.js anchor K(0.448)" },
  "jacarepagua-sail-skiff-a": { authored: .478, source: "js/circuits/scenery/jacarepagua.js anchor K(0.478)" },
  "jacarepagua-sail-skiff-b": { authored: .508, source: "js/circuits/scenery/jacarepagua.js anchor K(0.508)" },
  "jeddah-blue-sail": { authored: .275, source: "js/circuits/scenery/jeddah.js anchor K(0.275)" },
  "jeddah-flagpole": { authored: .300, source: "js/circuits/scenery/jeddah.js anchor K(0.30)" },
  "jeddah-fountain": { authored: .200, source: "js/circuits/scenery/jeddah.js anchor K(0.20)" },
  "jerez-ovni": { racing: .002, source: "js/circuits/scenery/jerez.js anchor K(sl(0.002))" },
  "kyalami-headgear": { authored: .340, source: "js/circuits/scenery/kyalami.js anchor K(0.34)" },
  "magny-cours-ferme": { authored: .340, source: "js/circuits/scenery/magny_cours.js anchor K(0.34)" },
  "magny-cours-bourg": { authored: .620, source: "js/circuits/scenery/magny_cours.js anchor K(0.62)" },
  "mexico-peraltada-stand": { authored: .935, source: "js/circuits/scenery/mexico.js anchor K(0.935)" },
  "montreal-biosphere": { authored: .300, source: "js/circuits/scenery/montreal.js anchor K(0.30)" },
  "paul-ricard-cabanon": { authored: .235, source: "js/circuits/scenery/paul_ricard.js anchor K(0.235)" },
  "paul-ricard-drywall": { authored: .235, source: "js/circuits/scenery/paul_ricard.js anchor K(0.235)" },
  "portimao-moinho": { authored: .415, source: "js/circuits/scenery/portimao.js anchor K(0.415)" },
  "sepang-klia-skyline": { authored: .420, source: "js/circuits/scenery/sepang.js anchor K(0.42)" },
  "sochi-adler-arena": { authored: .225, source: "js/circuits/scenery/sochi.js anchor K(0.225)" },
  "sochi-flame-tower": { authored: .115, source: "js/circuits/scenery/sochi.js anchor K(0.115)" },
  "sochi-iceberg-palace": { authored: .290, source: "js/circuits/scenery/sochi.js anchor K(0.290)" },
  "sochi-olympic-rings": { authored: .062, source: "js/circuits/scenery/sochi.js anchor K(0.062)" },
  "sochi-shayba-arena": { authored: .245, source: "js/circuits/scenery/sochi.js anchor K(0.245)" },
  "spa-raidillon-gold-dual-jumbotron": { authored: .159, source: "js/circuits/scenery/spa.js anchor K(0.159)" },
  "spa-eau-rouge-brook-crossing": { authored: .184, source: "js/circuits/scenery/spa.js anchor K(0.184)" },
  "spa-timing-tower": { authored: .985, source: "js/circuits/scenery/spa.js timingTower K(0.985)" },
  "zolder-sterrenwacht": { authored: .1802, source: "js/circuits/scenery/zolder.js anchor K(0.1802)" },
};
const DISPLAY_NAMES = {
  "albert-msac": "MSAC",
  "baires-terrace-curvon": "Curvón Terrace",
  "donington-ema-airliner": "EMA Airliner",
  "hockenheim-sued-tribune": "Süd Tribune",
  "jerez-ovni": "El Ovni",
  "madrid-sf-tribuna": "Start/Finish Tribuna",
  "miami-msc-yacht-club": "MSC Yacht Club",
  "miami-mia-sign": "MIA Sign",
  "qatar-t1-vvip-canopy": "Turn 1 VVIP Canopy",
  "sepang-klia-skyline": "KLIA Skyline",
  "zolder-sf-museum": "Start/Finish Museum",
};
const MODEL_PREFIXES = {
  brands_hatch: "brands-", buenos_aires: "baires-", indianapolis: "indy-",
  magny_cours: "magny-cours-", mont_tremblant: "tremblant-",
  paul_ricard: "paul-ricard-", watkins_glen: "glen-",
};

function bounds(pos) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) for (let j = 0; j < 3; j++) {
    lo[j] = Math.min(lo[j], pos[i + j]);
    hi[j] = Math.max(hi[j], pos[i + j]);
  }
  if (!Number.isFinite(lo[0])) throw new Error("Empty model geometry");
  return { center: lo.map((v, j) => (v + hi[j]) / 2), groundY: lo[1] };
}

function generate() {
  const context = buildContext();
  const rows = [], omitted = [];
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort()) {
    const trackId = path.basename(file, ".json");
    const ids = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8")).ids;
    const def = context.Tracks.LIST.find(d => d.id === trackId);
    if (!def) throw new Error(`Unknown landmark track ${trackId}`);
    const mark = context.mark();
    const track = context.Tracks.build(def);
    const blocks = track.propsGeo.__blocks || [];
    for (const id of ids) {
      const matches = blocks.filter(b => b.id === id);
      const localId = id.replace(new RegExp(`^${trackId}[-:]`), "");
      const prefix = MODEL_PREFIXES[trackId];
      const slug = (prefix && localId.startsWith(prefix) ? localId.slice(prefix.length) : localId)
        .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      if (!slug) throw new Error(`${id}: empty scenery slug`);
      if (!matches.length) {
        const diag = track.modelDiagnostics || {};
        const issue = [...(diag.suppressed || []), ...(diag.invalid || [])].find(d => d.id === id);
        omitted.push({ track: trackId, modelId: id, reason: issue?.reason || "model did not emit" });
        continue;
      }
      if (matches.length !== 1) throw new Error(`${trackId}/${id}: expected one emitted model group, got ${matches.length}`);
      const { center, groundY } = bounds(matches[0].from.pos);
      const projected = context.Tracks.project(track, center[0], center[2], null, groundY);
      if (!Number.isFinite(projected.s) || !Number.isFinite(projected.dist)) throw new Error(`${id}: non-finite projection`);
      const viewpoint = VIEWPOINTS[id];
      const frac = viewpoint ? (viewpoint.racing ?? context.sandbox.TrackSpace.sceneryFrac(def, viewpoint.authored)) : projected.s / track.total;
      const k = Math.round(frac * track.n) % track.n;
      rows.push({ id: `${trackId}/${slug}`, modelId: id, track: trackId,
        name: DISPLAY_NAMES[id] || slug.split("-").map(w => w[0].toUpperCase() + w.slice(1)).join(" "),
        nameSource: "authored model ID; real-world identity unverified",
        frac: round(frac, 6), target: center.map(v => round(v, 2)),
        stationMethod: viewpoint ? "source-viewpoint" : "nearest-road-projection",
        ...(viewpoint ? { viewpointSource: viewpoint.source, projectedFrac: round(projected.s / track.total, 6) } : {}),
        nearestRoadDistanceM: round(projected.dist, 1),
        viewDistanceM: round(Math.hypot(center[0] - track.px[k], center[2] - track.pz[k]), 1),
        source: `tests/data/landmarks/${trackId}.json; js/circuits/scenery/${trackId}.js`,
      });
    }
    context.release(track);
    context.trim(mark);
  }
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate scenery location IDs");
  for (const id of Object.keys(VIEWPOINTS)) if (!rows.some(r => r.modelId === id)) throw new Error(`Viewpoint ${id} no longer emits`);
  return { schema: 2, method: "emitted model bounds plus source viewpoints where available; nearest built racing-road projection otherwise", sourceDigest: scenerySourceDigest(root), locations: rows, omitted };
}

const actual = JSON.stringify(generate(), null, 2) + "\n";
if (process.argv.includes("--check")) {
  if (!fs.existsSync(outFile) || fs.readFileSync(outFile, "utf8") !== actual) {
    console.error("scenery location catalog is stale; run node tools/shot/gen-scenery-locations.cjs");
    process.exitCode = 1;
  } else console.log(`OK scenery catalog: ${JSON.parse(actual).locations.length} emitted locations`);
} else {
  fs.writeFileSync(outFile, actual);
  console.log(`Wrote ${outFile}: ${JSON.parse(actual).locations.length} emitted locations`);
}
