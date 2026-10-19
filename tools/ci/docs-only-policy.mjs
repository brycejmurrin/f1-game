// @doc Dependency-free docs-only selection policy shared by the selector and background runner.
// Shared docs-only selection policy. Keep this leaf dependency-free: test-bg
// is imported during MCP boot, before node_modules is necessarily installed.
// This intentionally differs from change-kind.DOCS: .codex is not included.
// DOCS-ONLY IS "NOTHING TO SELECT", NOT "UNMATCHED". ci.yml's own push trigger
// already ignores these paths, so a docs commit never reaches the selected gate
// by push — but pages.yml CALLS the workflow, and workflow_call does not honour
// paths-ignore. So the DEPLOY path saw a docs diff, matched no rule, and failed
// closed: a red Pages run for a change that ships no code. Measured on an
// AGENTS.md-only deploy. This list mirrors ci.yml's paths-ignore deliberately —
// if one grows, so must the other, and select-specs.test.mjs pins that.
export const DOCS_ONLY = [/^docs\//, /\.md$/, /^\.claude\//, /^\.cursor\//];
export const isDocsOnly = (changed) =>
  changed.length > 0 && changed.every((f) => DOCS_ONLY.some((re) => re.test(f)));

