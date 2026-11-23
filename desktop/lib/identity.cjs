"use strict";
/**
 * Frozen desktop identifiers. Changing appId or productName orphans
 * userData / localStorage / IndexedDB (career, music library).
 *
 * The merged Electron spike (PR #422) had no lib/identity.cjs; this is the
 * single source for electron-builder and tests. Values match the existing
 * desktop/package.json appId / productName — do not "improve" them.
 */
const identity = Object.freeze({
  appId: "io.github.brycejmurrin.apex26",
  productName: "Apex 26",
  // Privileged origin app://apex/ is SCHEME/HOST in app-protocol.js (not duplicated here).
});

module.exports = identity;
