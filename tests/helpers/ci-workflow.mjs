// ci-workflow — the workflow slices the ci-*.test.mjs guards read (split out of ci-coverage.test.mjs, T2-16).
//
// Every slice is bounded at the next job head and MUST exist: a renamed job used to leave `undefined` and the guard
// died with a TypeError on `.includes`/`.match` instead of naming the job that moved.
import fs from "node:fs";
import { SELECTED_GATE } from "../../tools/ci/select-specs.mjs";

export const SELECTED_TIMEOUT_MS = SELECTED_GATE.perTestTimeoutSec * 1000;

const read = (rel) => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

/** A slice that must exist: throws a diagnosis naming `what`, never returns undefined. */
export function must(what, slice) {
  if (typeof slice !== "string" || !slice.trim()) throw new Error(`ci workflow slice "${what}" not found — was the job or step renamed?`);
  return slice;
}

export const ciWorkflow = read(".github/workflows/ci.yml");
export const pagesWorkflow = read(".github/workflows/pages.yml");
export const gpuWorkflow = read(".github/workflows/gpu-census.yml");
export const selectStep = read("tools/ci/ci-select-specs-step.sh");

// Both job slices are bounded at the next job head. An unbounded `split("\n  selected:")[1]` reads every job appended
// after it as part of it, so a later job's `continue-on-error: true` (the golden-menu trial) fails the gate assertion
// against a gate nobody touched — the parser defect first fixed on 2026-09-10.
export const selectJob = must("select job", ciWorkflow.split("\n  select:")[1]?.split("\n  selected:")[0]);
export const selectedJob = must("selected job", (ciWorkflow.split("\n  selected:")[1] || "").split(/^  [a-z][\w-]*:$/m)[0]);
// The ship filter is a STEP of the `select` plan job since 2026-10-15 (a job of its own from 2026-09-22).
export const shipFilter = must("ship filter step",
  (ciWorkflow.split("      - name: Does this diff change anything that ships?\n")[1] || "").split("\n      - name: ")[0]);
export const rendererJob = must("renderer-macos job", ciWorkflow.split("\n  renderer-macos:")[1]?.split("\n  xr:")[0]);
// A step of the `select` plan job since 2026-10-15 (a job of its own before).
export const rendererFilter = must("renderer filter step",
  ciWorkflow.split("      - name: Does this diff touch the renderer?\n")[1]?.split("\n      - name: ")[0]);
// THE BODY MARKER (2026-10-26): a PR-body line starting `CI: run` opts a draft in like the run-ci label. The colon is
// `:` because a literal `: ` ends a YAML plain scalar; ci.yml's `on:` notes say why each piece is there.
export const ciRunMarker = (x) => `contains(format('{0}{1}', fromJSON('"\\n"'), ${x}), fromJSON('"\\nCI\\u003a run"'))`;
export const RUN_CI_LABEL = "contains(github.event.pull_request.labels.*.name, 'run-ci')";
export const PR_ACTIVE =
  `(github.event_name != 'pull_request' || !github.event.pull_request.draft || ${RUN_CI_LABEL} || ${ciRunMarker("github.event.pull_request.body")})`;
export const LABEL_OK = "(github.event.action != 'labeled' || (github.event.label.name == 'run-ci' && github.event.pull_request.draft))";
export const EDIT_START = `(github.event.pull_request.draft && github.event.changes.body && !${RUN_CI_LABEL} && `
  + `${ciRunMarker("github.event.pull_request.body")} && !${ciRunMarker("github.event.changes.body.from")})`;
export const EDIT_OK = `(github.event.action != 'edited' || ${EDIT_START})`;
export const LABEL_NOISE = "(github.event_name == 'pull_request' && github.event.action == 'labeled' && (github.event.label.name != 'run-ci' || !github.event.pull_request.draft))";
export const EDIT_NOISE = `(github.event_name == 'pull_request' && github.event.action == 'edited' && !${EDIT_START})`;

/**
 * Evaluate a workflow template (`text ${{ expr }} text`) for the expression subset ci.yml's gates use: string
 * literals ('' escapes), context paths with `.*.` filters, ! && || == != and parentheses (JS has the same
 * precedence), and contains/startsWith/endsWith/format/fromJSON/toJSON plus the status functions. Strings fold case
 * in the functions as Actions does (https://docs.github.com/en/actions/reference/workflows-and-actions/expressions);
 * `==` stays JS loose equality, so a fixture must supply every value a gate compares (Actions coerces null to ''
 * there, JS does not). Cross-checked against @actions/expressions 0.3.61 on the BODY MARKER cases (2026-10-26).
 */
export function evalTemplate(template, ctx) {
  const lower = (v) => String(v ?? "").toLowerCase();
  const fns = {
    contains: (a, b) => (Array.isArray(a) ? a.some((x) => lower(x) === lower(b)) : lower(a).includes(lower(b))),
    startsWith: (a, b) => lower(a).startsWith(lower(b)),
    endsWith: (a, b) => lower(a).endsWith(lower(b)),
    format: (f, ...args) => String(f).replace(/\{(\d+)\}/g, (_, n) => String(args[n] ?? "")),
    fromJSON: (s) => JSON.parse(s),
    toJSON: (v) => JSON.stringify(v),
    always: () => true, success: () => true, cancelled: () => false, failure: () => false,
  };
  const get = (path) => path.split(".").reduce((v, seg) => {
    if (v == null) return undefined;
    return seg === "*" ? (Array.isArray(v) ? v : Object.values(v)) : Array.isArray(v) ? v.map((x) => x?.[seg]) : v[seg];
  }, ctx);
  const compile = (expr) => {
    let js = "";
    for (let i = 0; i < expr.length;) {
      if (expr[i] === "'") {
        let s = "", j = i + 1;
        for (; j < expr.length; j++) {
          if (expr[j] === "'" && expr[j + 1] === "'") { s += "'"; j++; } else if (expr[j] === "'") break; else s += expr[j];
        }
        if (j >= expr.length) throw new Error(`unterminated string in ${expr}`);
        js += JSON.stringify(s); i = j + 1;
      } else {
        const m = /^[A-Za-z_][\w-]*(?:\.(?:\*|[A-Za-z_][\w-]*))*/.exec(expr.slice(i));
        if (m && !/[\w.]/.test(expr[i - 1] || "")) {
          const word = m[0];
          if (word in fns && expr.slice(i + word.length).trimStart().startsWith("(")) js += `$f.${word}`;
          else if (word === "true" || word === "false" || word === "null") js += word;
          else js += `$g(${JSON.stringify(word)})`;
          i += word.length;
        } else js += expr[i++];
      }
    }
    return new Function("$f", "$g", `return (${js});`)(fns, get);
  };
  const parts = template.split(/\$\{\{([\s\S]*?)\}\}/);
  if (parts.length === 3 && !parts[0] && !parts[2]) return compile(parts[1]);
  return parts.map((p, n) => (n % 2 ? String(compile(p) ?? "") : p)).join("");
}
