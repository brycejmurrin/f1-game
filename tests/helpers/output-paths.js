// @ts-check
// Port-scoped gallery paths for Playwright specs.
// Tool/CLI path containment helpers live in tools/lib/output-paths.mjs.
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";

// WALK UP FOR package.json — do not count "..".
//
// This file is scheduled to move (tests/ split, AUDIT-SYNTHESIS §R2), and a
// hardcoded hop count is the worst kind of wrong at the new depth: it still
// resolves to SOMETHING. `resolve(dirname, "..")` from tests/helpers/ lands on
// tests/, galleries start being written into the test tree, and every
// assertion still passes — including this module's own spec, which recomputed
// the identical expression and so could only ever agree with it. An absolute
// anchor cannot drift symmetrically with the thing it anchors.
function repoRoot(from) {
  let dir = from;
  for (;;) {
    if (existsSync(join(dir, "package.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error(`no package.json above ${from} — cannot locate the repo root`);
    dir = up;
  }
}

const REPO_ROOT = repoRoot(import.meta.dirname);
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function port() {
  const value = process.env.APEX_PORT || "3456";
  if (!/^\d+$/.test(value)) throw new Error(`invalid APEX_PORT: ${value}`);
  return String(Number(value));
}

function safe(parts) {
  for (const part of parts) {
    if (!SAFE_SEGMENT.test(part) || part === "." || part === "..") {
      throw new Error(`expected safe path segment, received: ${part}`);
    }
  }
  return parts;
}

export function galleryDir(suite, ...segments) {
  const dir = resolve(
    REPO_ROOT,
    "artifacts",
    `galleries-${port()}`,
    ...safe([suite, ...segments])
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function galleryPath(suite, ...segments) {
  const parts = safe([suite, ...segments]);
  if (segments.length === 0) {
    throw new Error("galleryPath requires a filename");
  }
  const file = resolve(REPO_ROOT, "artifacts", `galleries-${port()}`, ...parts);
  mkdirSync(dirname(file), { recursive: true });
  return file;
}

export function galleryUrl(suite, ...segments) {
  return "/" + posix.join(
    "artifacts",
    `galleries-${port()}`,
    ...safe([suite, ...segments]).map(encodeURIComponent)
  );
}
