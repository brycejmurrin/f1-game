// @ts-check
// Track boundary consistency — fleet shard 1/2 (contiguous first half).
// Split so select-specs can pack ~26 tests instead of dropping the 63-test
// original (CI 2026-10-05: tracks-walls over-budget 6 times in one day).
// Honours process.env.APEX_CIRCUITS via inScope() in tests/helpers/tracks-walls-roster.js.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inScope } from "../helpers/tracks-walls-roster.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ALL = fs.readdirSync(path.join(ROOT, "js/circuits"))
  .filter((f) => f.endsWith(".js"))
  .map((f) => f.replace(/\.js$/, ""))
  .sort();
const HALF = Math.ceil(ALL.length / 2);
const IDS = ALL.slice(0, HALF).filter((id) => inScope(id));

test.describe("Apex 26 — track boundaries (fleet A)", () => {
  for (const id of IDS) {
    test(`${id}: finite, sane driving boundary on both sides`, async ({ page }) => {
      const s = await page.evaluate(async (tid) => {
        await window.__apex.race(tid, "day", "dry");
        return window.__apex.wallStats();
      }, id);
      expect(s, `${id} built`).not.toBeNull();
      expect(s.anyNaN, `${id} no NaN boundary`).toBe(false);
      expect(s.minB, `${id} keeps some track`).toBeGreaterThan(1);
      expect(s.maxB, `${id} bounded`).toBeLessThan(60);
      if (s.maxPitB != null) {
        expect(s.maxPitB, `${id} pit complex bounded`).toBeLessThan(24);
        expect(s.maxPitB, `${id} pit complex reaches past the road`).toBeGreaterThan(s.minB);
      }
      expect(s.minOverHw, `${id} boundary not deep inside edge`).toBeGreaterThan(-1.5);
    });
  }
});
