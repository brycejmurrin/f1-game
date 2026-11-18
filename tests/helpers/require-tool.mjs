/* require-tool.mjs — what a test does when an external tool it needs is absent.
 *
 * By default a missing tool SKIPS, loudly: the skip reason names the tool and how to install it,
 * and when the test file's process exits every skip is counted as `# skipped N: <tool> missing`,
 * so a run summary names what was NOT checked.
 *
 * A missing tool is a FAILURE (the whole file throws at load) when the job has OPTED IN:
 *   - APEX_REQUIRE_TOOLS=1               every tool is required;
 *   - APEX_REQUIRE_TOOLS=pillow,numpy    the tools whose ids are listed (case-insensitive);
 *   - opts.strict === true               the caller's own switch (shader-validate / workflow-lint pass
 *                                        requireBins([]), i.e. APEX_REQUIRE_LINT_BINS=1, which the CI
 *                                        `lints` job sets).
 * NOT on bare process.env.CI (W30, coordinator decision B): GitHub sets CI=true in every job, and the
 * tooling-fast shards that run these files install none of the tools, so CI-means-fail would red
 * them all. A job that installs a tool opts in by name.
 *
 * Usage:
 *   const pil = requireTool("Pillow/numpy", hasPil(), { ids: ["pillow", "numpy"], hint: "pip install pillow numpy" });
 *   test("…", { skip: pil.skip() }, () => { … });
 */

/** Is `ids` required by APEX_REQUIRE_TOOLS? "1"/"all"/"*" require everything; else a comma list. */
export function toolRequired(ids, env = process.env) {
  const raw = String(env.APEX_REQUIRE_TOOLS || "").trim().toLowerCase();
  if (!raw || raw === "0" || raw === "false") return false;
  if (raw === "1" || raw === "all" || raw === "*" || raw === "true") return true;
  const want = new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
  return ids.some((id) => want.has(String(id).toLowerCase()));
}

/** The summary lines for a { tool -> skipped count } map, in insertion order. */
export function skipSummary(counts) {
  return [...counts].filter(([, n]) => n > 0).map(([tool, n]) => `# skipped ${n}: ${tool} missing`);
}

const COUNTS = new Map();
const hooked = new WeakSet();

/**
 * @param {string} tool      name shown in the skip reason and the summary
 * @param {boolean} present  whether the tool was found
 * @param {{ ids?: string[], hint?: string, env?: object, strict?: boolean,
 *           counts?: Map<string, number>, log?: (s: string) => void, onExit?: (fn: () => void) => void }} [opts]
 * @returns {{ missing: boolean, reason: string|false, skip: () => string|false }}
 */
export function requireTool(tool, present, opts = {}) {
  const {
    ids = [tool], hint = "", env = process.env, strict = false, counts = COUNTS,
    log = (s) => console.error(s), onExit = (fn) => process.once("exit", fn),
  } = opts;
  if (present) return { missing: false, reason: false, skip: () => false };
  const reason = `${tool} not installed - NOT CHECKED${hint ? ` (${hint})` : ""}`;
  if (strict || toolRequired(ids, env)) {
    throw new Error(`${reason}. This run requires it (APEX_REQUIRE_TOOLS / APEX_REQUIRE_LINT_BINS): a missing tool is a failure here, not a skip.`);
  }
  if (!counts.has(tool)) counts.set(tool, 0);
  if (!hooked.has(counts)) {
    hooked.add(counts);
    onExit(() => { for (const line of skipSummary(counts)) log(line); });
  }
  return {
    missing: true,
    reason,
    skip: () => { counts.set(tool, counts.get(tool) + 1); return reason; },
  };
}
