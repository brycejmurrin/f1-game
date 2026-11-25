// #6583 / #6602 D5(a): `live` in tools/lib/bryce-phone.mjs is the newest dated settings export, picked by the date in
// its name, and that file carries the landscape shape at the top level with the portrait shape parked. Pure: no browser.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LIVE_EXPORT_RE, OWNER_PROFILES, newestLiveExport, pickNewestLiveExport, readProfile } from "../../tools/lib/bryce-phone.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

test("pickNewestLiveExport picks the newest date in the name and ignores names that do not match", () => {
  assert.equal(pickNewestLiveExport([
    "settings-live-export-2026-11-09.json", "settings-live-export-2026-12-01.json", "settings-live-export-2026-11-25.json",
    "settings-live-export-2027-01-01.json.bak", "settings-live-export-2099-1-1.json", "settings-live-export-latest.json",
    "settings-defaults-export.json", "x-settings-live-export-2099-12-31.json", "settings-live-export-2099-12-31.txt",
  ]), "settings-live-export-2026-12-01.json");
  assert.equal(pickNewestLiveExport(["settings-defaults-export.json"]), null);
  assert.equal(pickNewestLiveExport([]), null);
  assert.equal(LIVE_EXPORT_RE.test("settings-live-export-2026-11-25.json"), true);
});

test("live resolves to the newest dated file in tests/data, not a pinned date", () => {
  const names = fs.readdirSync(path.join(ROOT, "tests/data")).filter((n) => LIVE_EXPORT_RE.test(n));
  assert.ok(names.length >= 2, "more than one dated export exists, so the pick is a real choice");
  const newest = names.map((n) => n.match(LIVE_EXPORT_RE).slice(1).join("")).sort().pop();
  assert.equal(OWNER_PROFILES.live, newestLiveExport());
  assert.equal(OWNER_PROFILES.live.replace(/\D/g, ""), newest);
  assert.equal(OWNER_PROFILES.legacy, "tests/data/settings-defaults-export.json", "legacy stays fixed");
});

test("the chosen export parses with landscape at the top level and portrait parked", () => {
  const exp = readProfile("live");
  const shapes = exp.settings.appearance.appearanceShapes;
  assert.equal(shapes.live, "wide", "the top-level values are the landscape (wide) shape");
  assert.equal(typeof shapes.park, "object", "the portrait shape is parked under appearanceShapes.park");
  assert.ok(shapes.park && "hudBtnScale" in shapes.park, "the parked shape carries its own scale values");
});
