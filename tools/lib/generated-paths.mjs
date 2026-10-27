// generated-paths.mjs — the committed files a generator rewrites from the tree.
// @doc Generator outputs, one list: deploy.mjs regenerates them at merge.
// A merge conflict in one is two stale renderings, and `tools/ci/deploy.mjs` cures it by taking a side and regenerating.
//
// One home for that list (system audit second pass, 2026-10-26, finding 5): deploy.mjs
// used to mark these HELD whenever an open PR's diff touched them, so `tools/shot/scenery-locations.json`
// (every circuit PR), `tests/data/impact-map.json` (14 open PRs) and `docs/agent-index.json` blocked lanes
// on a file nobody authors — five BLOCKED bus lines in ten minutes, cleared only by a LEND. A generated file
// is owned by its generator, and the push guard does not warn
// about it. `tests/unit/deploy-tool.test.mjs` keeps this list inside deploy.mjs's cure (every path here must
// be cureable), so the two never drift. `tests/groups.json` and `index.html` are authored and stay out;
// `tests/data/ratchets.d/<branch>.json` is per branch and never shared, so it needs no rule.
export const GENERATED_PATHS = Object.freeze([
  "version.json",
  "package.json",
  "tools/README.md",
  "docs/agent-output/catalog.json",
  "docs/agent-index.json",
  "docs/AGENT-HOOKS.md",
  "docs/TESTING-COVERAGE.md",
  "tests/data/impact-map.json",
  "tests/data/ratchets.json",
  "tools/shot/scenery-locations.json",
]);

/** Is `p` (repo-relative, forward slashes) a generator's output? Pure. */
export function isGenerated(p) {
  const s = String(p || "").replace(/^\.\//, "");
  return GENERATED_PATHS.includes(s);
}
