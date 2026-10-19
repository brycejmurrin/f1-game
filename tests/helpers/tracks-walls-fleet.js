// @ts-check
// The per-circuit boundary walk shared by tests/specs/tracks-walls-a.spec.js and
// -b.spec.js. The two files are shards of ONE roster (shardIds, 2 ways) so
// select-specs can pack each leg; the assertions live here once, so the halves
// cannot drift apart (TK2-11).
import { expect } from "@playwright/test";

/** @param {import("@playwright/test").Page} page @param {string} id */
export async function assertDrivingBoundary(page, id) {
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
}
