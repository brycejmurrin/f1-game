// @ts-check
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { galleryDir, galleryPath, galleryUrl } from "./output-paths.js";

// ANCHOR ABSOLUTELY, NOT BY RECOMPUTING THE THING UNDER TEST.
//
// This assertion used to read
//   expect(dir).toBe(resolve(import.meta.dirname, "..", "artifacts", …))
// against output-paths.js's own `resolve(import.meta.dirname, "..")`. Both
// files sat in tests/, so both sides computed the SAME expression and the test
// could only ever agree with the module. Under the tests/ split (they go to
// tests/specs/ and tests/helpers/) both would have resolved to tests/, the
// galleries would have been written into the test tree, and this spec would
// have stayed green through all of it — `existsSync(dir)` included, since
// galleryDir() CREATES the directory it returns and the test would have been
// confirming its own side effect.
//
// The repo root is the fixed point, so find it the way nothing else in the
// chain can fake: the directory holding package.json.
function repoRoot(from) {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`no package.json above ${from}`);
    dir = up;
  }
}
const ROOT = repoRoot(import.meta.dirname);

test("gallery paths are port-scoped and create their parent directories", () => {
  const port = process.env.APEX_PORT || "3456";
  const dir = galleryDir("output-paths", "nested");
  const file = galleryPath("output-paths", "nested", "frame.png");

  expect(dir).toBe(resolve(ROOT, "artifacts", `galleries-${port}`, "output-paths", "nested"));
  expect(file).toBe(resolve(dir, "frame.png"));
  expect(existsSync(dir)).toBe(true);
  // The failure the anchor above exists to catch, stated directly: output must
  // never land inside the test tree, at any depth those files come to sit at.
  expect(dir.startsWith(resolve(ROOT, "artifacts") + sep)).toBe(true);
  expect(dir.includes(`${sep}tests${sep}`)).toBe(false);
  expect(galleryUrl("output-paths", "nested", "frame.png"))
    .toBe(`/artifacts/galleries-${port}/output-paths/nested/frame.png`);
});

test("gallery paths reject traversal and empty segments", () => {
  expect(() => galleryPath("../escape", "frame.png")).toThrow(/safe path segment/);
  expect(() => galleryPath("suite", "..", "frame.png")).toThrow(/safe path segment/);
  expect(() => galleryPath("suite", "")).toThrow(/safe path segment/);
});

test("each producer can own a stable suite directory", () => {
  const port = process.env.APEX_PORT || "3456";
  expect(galleryPath("ui-audit", "portrait-main.png"))
    .toContain(`/artifacts/galleries-${port}/ui-audit/portrait-main.png`);
  expect(galleryPath("parts-budget", "budget-default.png"))
    .toContain(`/artifacts/galleries-${port}/parts-budget/budget-default.png`);
});
