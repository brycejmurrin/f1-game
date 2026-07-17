// @ts-check
import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { galleryDir, galleryPath, galleryUrl } from "./output-paths.js";

test("gallery paths are port-scoped and create their parent directories", () => {
  const port = process.env.APEX_PORT || "3456";
  const dir = galleryDir("output-paths", "nested");
  const file = galleryPath("output-paths", "nested", "frame.png");

  expect(dir).toBe(resolve(import.meta.dirname, "..", "artifacts", `galleries-${port}`, "output-paths", "nested"));
  expect(file).toBe(resolve(dir, "frame.png"));
  expect(existsSync(dir)).toBe(true);
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
