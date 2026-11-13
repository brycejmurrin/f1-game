// track-accuracy-map.mjs — the game ↔ bacinger/f1-circuits mapping and the
// race-direction overrides, shared by the browser spec
// (tests/specs/f1-track-accuracy.spec.js) and its node port
// (tests/unit/track-accuracy-circuits.test.mjs) so the two cannot drift.
// Pure data, no imports.

// GeoJSON line order is not a race-direction guarantee. Where the source line
// runs opposite the real Grand Prix lap, orient the reference explicitly — the
// matching circuit def then carries `reverse: true` so the game drives it the
// right way round and the two still agree here.
export const RACE_DIRECTION_OVERRIDES = {
  "mc-1929": "CW",   // Monaco
  "fr-1969": "CW",   // Paul Ricard
  "za-1961": "CW",   // Kyalami
  // Marina Bay races ANTI-clockwise, and this reference line does not: of the
  // eleven circuits here that are anti-clockwise in reality, ten compute
  // anti-clockwise and sg-2008 alone computes clockwise. Sourced away from the
  // upstream dataset — Pirelli ("cars are driving anti-clockwise"), Singapore's
  // National Library Board ("the cars would run anti-clockwise"), and Turn 1 is
  // a left. Without this the test still PASSED, because it compares the game
  // against the reference and both were backwards together.
  "sg-2008": "CCW",  // Singapore
};

// game circuit id → bacinger/f1-circuits feature id
export const CIRCUIT_MAP = {
  abudhabi: "ae-2009", albert_park: "au-1953", bahrain: "bh-2002",
  baku: "az-2016", cota: "us-2012", hungaroring: "hu-1986",
  imola: "it-1953", interlagos: "br-1940", jeddah: "sa-2021",
  madrid: "es-2026", mexico: "mx-1962", miami: "us-2022",
  monaco: "mc-1929", monza: "it-1922", montreal: "ca-1978",
  qatar: "qa-2004", redbull: "at-1969", shanghai: "cn-2004",
  silverstone: "gb-1948", singapore: "sg-2008", spa: "be-1925",
  suzuka: "jp-1962", vegas: "us-2023", zandvoort: "nl-1948",
  // Retired / off-calendar circuits (def `classic: true`) — same upstream
  // dataset, so they are held to the same shape and direction bar.
  hockenheim: "de-1932", nurburgring: "de-1927", catalunya: "es-1991",
  sepang: "my-1999", istanbul: "tr-2005", paul_ricard: "fr-1969",
  portimao: "pt-2008", sochi: "ru-2014", mugello: "it-1914",
  magny_cours: "fr-1960", estoril: "pt-1972", kyalami: "za-1961",
  watkins_glen: "us-1956", indianapolis: "us-1909", buenos_aires: "ar-1952",
  jacarepagua: "br-1977",
  // Recovered from OpenStreetMap (tools/track/osm-circuits.json) because the
  // bacinger file carries exactly 40 features and the game had all of them, so
  // the feature id is just the circuit id. READ THE VERDICT DIFFERENTLY for
  // these eleven: the other 40 are compared against a survey made independently
  // of this game's traces, which is real agreement; these share an OSM extract
  // with the def they are compared to, so a pass only proves the build pipeline
  // (Catmull-Rom, startFrac, reverse) did not distort the ring it was handed.
  // The accuracy evidence for them is the stitched-vs-researched length delta
  // recorded in each def's header.
  fuji: "fuji", okayama: "okayama", korea: "korea", jerez: "jerez",
  donington: "donington", anderstorp: "anderstorp", brands_hatch: "brands_hatch",
  zolder: "zolder", dijon: "dijon", buddh: "buddh", mont_tremblant: "mont_tremblant",
  mosport: "mosport",
};
