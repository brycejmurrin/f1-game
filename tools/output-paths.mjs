// Tool/CLI path containment helpers for scratch/artifacts defaults.
// @doc Path-containment helpers for the `artifacts/` vs `scratch/` output contract; gated by `output-paths.spec.js`.
// Playwright gallery writers use tests/helpers/output-paths.js instead.
import { isAbsolute, relative, resolve } from "node:path";

const SAFE_TOKEN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export function assertSafePathToken(value, name) {
  if (typeof value !== "string" || !SAFE_TOKEN.test(value)) {
    throw new Error(`invalid ${name}: ${value}`);
  }
  return value;
}

export function assertContainedPath(base, target, name = "path") {
  const rel = relative(base, target);
  if (rel === "" || (!rel.startsWith("..") && !isAbsolute(rel))) {
    return target;
  }
  throw new Error(`${name} escapes ${base}: ${target}`);
}

export function resolveRepoDefault(root, ...segments) {
  return assertContainedPath(
    root,
    resolve(root, ...segments),
    "default output path"
  );
}

export function resolveContainedChild(base, child, name = "path") {
  return assertContainedPath(base, resolve(base, child), name);
}
