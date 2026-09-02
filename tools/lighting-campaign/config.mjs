// @doc lighting-campaign: the condition lattice (TODS × WEATHERS × TRACKS), shards, camera fractions, slider groups.
// @skill lighting-tuner
export const TODS = Object.freeze(["dawn", "day", "dusk", "night"]);
export const WEATHERS = Object.freeze(["dry", "wet", "rain", "fog", "overcast"]);
export const TRACKS = Object.freeze([
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring",
  "imola", "interlagos", "jeddah", "madrid", "mexico", "miami",
  "monaco", "montreal", "monza", "qatar", "redbull", "shanghai",
  "silverstone", "singapore", "spa", "suzuka", "vegas", "zandvoort",
  // Retired / off-calendar circuits (def `classic: true`).
  "hockenheim", "nurburgring", "catalunya", "sepang", "istanbul",
  "paul_ricard", "portimao", "sochi", "mugello", "magny_cours",
  "estoril", "kyalami", "watkins_glen", "indianapolis", "buenos_aires",
  "jacarepagua",
]);

export const SHARDS = Object.freeze([
  ["abudhabi", "albert_park", "baku", "cota"],
  ["bahrain", "hungaroring", "jeddah", "madrid"],
  ["imola", "interlagos", "miami", "monaco"],
  ["mexico", "montreal", "qatar", "redbull"],
  ["shanghai", "silverstone", "singapore", "spa"],
  ["suzuka", "vegas", "zandvoort", "monza"],
  ["hockenheim", "nurburgring", "catalunya", "sepang"],
  ["istanbul", "paul_ricard", "portimao", "sochi"],
  ["mugello", "magny_cours", "estoril", "kyalami"],
  ["watkins_glen", "indianapolis", "buenos_aires", "jacarepagua"],
].map(Object.freeze));

export const CAMERA_FRACTIONS = Object.freeze(Object.fromEntries(Object.entries({
  abudhabi: [0.08, 0.45, 0.88], albert_park: [0.10, 0.50, 0.88],
  bahrain: [0.01, 0.45, 0.81], baku: [0.15, 0.45, 0.75],
  cota: [0.15, 0.50, 0.85], hungaroring: [0.00, 0.35, 0.70],
  imola: [0.10, 0.40, 0.75], interlagos: [0.05, 0.40, 0.75],
  jeddah: [0.10, 0.40, 0.70], madrid: [0.05, 0.35, 0.70],
  mexico: [0.10, 0.45, 0.80], miami: [0.23, 0.50, 0.70],
  monaco: [0.05, 0.22, 0.45], montreal: [0.15, 0.50, 0.80],
  monza: [0.30, 0.55, 0.85], qatar: [0.40, 0.70, 0.90],
  redbull: [0.10, 0.45, 0.80], shanghai: [0.10, 0.40, 0.75],
  silverstone: [0.40, 0.65, 0.97], singapore: [0.35, 0.58, 0.72],
  spa: [0.10, 0.35, 0.70], suzuka: [0.00, 0.30, 0.86],
  vegas: [0.25, 0.66, 0.98], zandvoort: [0.30, 0.55, 0.80],
  // Retired / off-calendar circuits. Fractions pick the pit straight, a
  // mid-lap corner and the circuit's signature feature.
  hockenheim: [0.02, 0.45, 0.88], nurburgring: [0.02, 0.42, 0.78],
  catalunya: [0.03, 0.50, 0.90], sepang: [0.00, 0.34, 0.88],
  istanbul: [0.02, 0.40, 0.75], paul_ricard: [0.00, 0.44, 0.72],
  portimao: [0.04, 0.36, 0.78], sochi: [0.09, 0.43, 0.81],
  mugello: [0.05, 0.47, 0.88], magny_cours: [0.00, 0.40, 0.58],
  estoril: [0.02, 0.42, 0.90], kyalami: [0.02, 0.40, 0.70],
  watkins_glen: [0.02, 0.24, 0.62], indianapolis: [0.00, 0.30, 0.66],
  buenos_aires: [0.02, 0.38, 0.85], jacarepagua: [0.02, 0.47, 0.88],
}).map(([track, fractions]) => [track, Object.freeze(fractions)])));

export const SLIDER_GROUPS = Object.freeze([
  { id: "foundation", labels: ["SUN & MOON", "AMBIENT & BOUNCE"] },
  { id: "shadows", labels: ["SHADOWS"] },
  { id: "night", labels: ["TRACK LIGHTS", "NIGHT GLOW & BLOOM"] },
  { id: "weather", labels: ["ATMOSPHERE", "SKY & WEATHER", "RAIN & LIGHTNING"] },
  { id: "surface", labels: ["REFLECTIONS & WET ROAD", "CAR"] },
  { id: "grade", labels: ["IMAGE & COLOUR"] },
].map((group) => Object.freeze({ ...group, labels: Object.freeze(group.labels) })));

export const REGIONS = Object.freeze(Object.fromEntries(Object.entries({
  frame: [0, 0, 1, 1], road: [0.30, 0.60, 0.40, 0.16],
  near: [0.28, 0.74, 0.44, 0.14], fogwall: [0.34, 0.38, 0.32, 0.16],
  sky: [0.28, 0.05, 0.44, 0.20], wallL: [0.02, 0.34, 0.16, 0.22],
}).map(([region, bounds]) => [region, Object.freeze(bounds)])));

export const GATES = Object.freeze({
  maxBlackClip: 0.08, maxWhiteClip: 0.03, minTonalRange: 45,
});

export function conditionKey(track, tod, weather) {
  if (!TRACKS.includes(track)) throw new Error(`unknown track: ${track}`);
  if (!TODS.includes(tod)) throw new Error(`unknown time: ${tod}`);
  if (!WEATHERS.includes(weather)) throw new Error(`unknown weather: ${weather}`);
  return `${track}|${tod}|${weather}`;
}

export function enumerateConditions(trackIds = TRACKS) {
  return trackIds.flatMap((track) => TODS.flatMap((tod) =>
    WEATHERS.map((weather) => ({ track, tod, weather, key: conditionKey(track, tod, weather) }))));
}

export function validateConfig() {
  const shardTracks = SHARDS.flat();
  if (shardTracks.length !== TRACKS.length ||
      new Set(shardTracks).size !== TRACKS.length ||
      !shardTracks.every((track) => TRACKS.includes(track)))
    throw new Error("invalid shard coverage");
  for (const track of TRACKS) {
    const fractions = CAMERA_FRACTIONS[track];
    if (!fractions || fractions.length !== 3 ||
        new Set(fractions).size !== 3 ||
        !fractions.every((value) => Number.isFinite(value) && value >= 0 && value < 1))
      throw new Error(`invalid camera coverage: ${track}`);
  }
}
