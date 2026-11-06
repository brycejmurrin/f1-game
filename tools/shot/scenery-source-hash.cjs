"use strict";
// @doc Fingerprint all scenery geometry/build inputs used by the named screenshot catalog.
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const MANIFEST_SLICE = "tools/manifest.cjs#TRACK_VM";

function filesUnder(root, dir, include = () => true) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap(entry => {
    const rel = `${dir}/${entry.name}`;
    return entry.isDirectory() ? filesUnder(root, rel, include) : include(rel) ? [rel] : [];
  });
}

function manifestAt(root) {
  return require(path.join(root, "tools/manifest.cjs"));
}

// Membership only. The manifest file also lists UI, career and renderer modules;
// hashing those bytes turns the tip red on any unrelated addition (#2718).
function sceneryManifestMaterial(manifest) {
  return JSON.stringify(manifest.TRACK_VM);
}

function scenerySourceDigest(root) {
  root = path.resolve(root);
  const manifest = manifestAt(root);
  const paths = [
    "tools/shot/gen-scenery-locations.cjs",
    "tools/shot/scenery-source-hash.cjs",
    "tools/lib/track-build-vm.cjs", "tools/lib/pack-assets.cjs",
    ...manifest.TRACK_VM.filter(file => file !== "@circuits"),
    ...filesUnder(root, "assets/pack", file => file.endsWith(".bin") || file.endsWith("manifest.json")),
  ];
  for (const dir of ["js/circuits", "js/circuits/scenery", "tests/data/landmarks"]) {
    paths.push(...filesUnder(root, dir, file => file.endsWith(dir.includes("landmarks") ? ".json" : ".js")));
  }
  const hash = createHash("sha256");
  for (const file of [...new Set(paths)].sort()) hash.update(file).update("\0").update(fs.readFileSync(path.join(root, file))).update("\0");
  hash.update(MANIFEST_SLICE).update("\0").update(sceneryManifestMaterial(manifest)).update("\0");
  return hash.digest("hex");
}

module.exports = { scenerySourceDigest, sceneryManifestMaterial, MANIFEST_SLICE };
