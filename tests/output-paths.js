// @ts-check
import { mkdirSync } from "node:fs";
import { dirname, posix, resolve } from "node:path";

const REPO_ROOT = resolve(import.meta.dirname, "..");
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
