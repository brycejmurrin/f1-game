// Tool/CLI path containment helpers for scratch/artifacts defaults.
// @doc Path-containment helpers for the `artifacts/` vs `scratch/` output contract; gated by `output-paths.spec.js`.
// Playwright gallery writers use tests/helpers/output-paths.js instead.
import { isAbsolute, relative, resolve, sep } from "node:path";

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

export const OUTPUT_ROOTS = Object.freeze(["artifacts", "scratch"]);

/**
 * Absolute path of `dir` when it is STRICTLY inside <root>/artifacts or
 * <root>/scratch; throws otherwise. For tools that clear or unzip into a
 * user-supplied --out (2026-10-10, S1: `garage-angles --reset --out .` removed
 * the working tree).
 */
export function assertOutputDir(dir, root, name = "--out") {
  if (typeof dir !== "string" || !dir || dir.startsWith("-")) throw new Error(`${name} needs a directory, got ${JSON.stringify(dir)}`);
  const abs = resolve(dir);
  for (const r of OUTPUT_ROOTS) {
    const rel = relative(resolve(root, r), abs);
    if (rel && rel !== ".." && !rel.startsWith(".." + sep) && !isAbsolute(rel)) return abs;
  }
  throw new Error(`${name} ${abs} is not inside ${OUTPUT_ROOTS.map((r) => r + "/").join(" or ")} of ${root} - refusing to clear or overwrite it`);
}
