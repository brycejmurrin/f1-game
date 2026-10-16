#!/usr/bin/env node
// Explicit maintenance tool. Tests never call this or access the network.
// @doc Explicit maintenance tool that refreshes the offline F1 circuit reference data; tests never call it or the network.
// @skill new-track
import fs from "node:fs/promises";

const SOURCE = "https://raw.githubusercontent.com/bacinger/f1-circuits/master/f1-circuits.geojson";
const OUTPUT = new URL("../../tests/data/f1-circuit-reference.geojson", import.meta.url);
const ids = new Set(process.argv.slice(2));

if (!ids.size) {
  throw new Error("pass the bacinger feature ids to pin (see CIRCUIT_MAP in f1-track-accuracy.spec.js)");
}

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`reference fetch failed: HTTP ${response.status}`);
const source = await response.json();
const features = source.features.filter((feature) => ids.has(feature.properties.id));
if (features.length !== ids.size) {
  const found = new Set(features.map((feature) => feature.properties.id));
  throw new Error(`missing requested ids: ${[...ids].filter((id) => !found.has(id)).join(", ")}`);
}

const pinned = {
  type: "FeatureCollection",
  source: "https://github.com/bacinger/f1-circuits",
  license: "ODbL-1.0",
  retrieved: new Date().toISOString().slice(0, 10),
  features,
};
await fs.writeFile(OUTPUT, `${JSON.stringify(pinned, null, 2)}\n`);
console.log(`wrote ${features.length} pinned circuits to ${OUTPUT.pathname}`);
