/* desktop-version.test.mjs — "<apexVersion>.<build>" from stamped version.json.
 *
 * Run: node --test tests/unit/desktop-version.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { desktopVersionFromBuild } from "../../tools/desktop/stage.mjs";
import { versionFromInputs } from "../../desktop/scripts/set-version.mjs";

const require = createRequire(import.meta.url);
const { appVersionFrom } = require("../../desktop/lib/version.cjs");

test("appVersionFrom maps {apexVersion, build} → MAJOR.MINOR.BUILD", () => {
  assert.equal(appVersionFrom({ apexVersion: "1.0", build: 2110 }), "1.0.2110");
  assert.equal(appVersionFrom({ apexVersion: "1.0", build: 1695 }), "1.0.1695");
  assert.throws(() => appVersionFrom({ apexVersion: "1.0", build: 0 }));
  assert.throws(() => appVersionFrom({ apexVersion: "1", build: 10 }));
  assert.throws(() => appVersionFrom({ apexVersion: "1.0", build: "x" }));
});

test("set-version versionFromInputs is the same pure mapping", () => {
  assert.equal(versionFromInputs({ apexVersion: "1.0", build: 2110 }), "1.0.2110");
});

test("desktopVersionFromBuild uses desktop/package.json apexVersion by default", () => {
  assert.equal(desktopVersionFromBuild(1695, "1.0"), "1.0.1695");
  assert.equal(desktopVersionFromBuild(1, "2.3"), "2.3.1");
});
