// gh-rows.mjs — the GitHub REST row helpers the CI tools share: label names, paginated lists, closing keywords, a
// batch issue's members and the steward adoption line. Moved out of the retired dispatch.mjs (#6536), whose
// Action (.github/workflows/dispatch.yml) was deleted; workers are launched by the orchestrator session now.
// @doc Shared GitHub row helpers: labelsOf, paginated getAll, closingIssues, batchMembers, ADOPT_RE.
// @section runner
// @skill steward
//
// Readers: tools/ci/ready-sweep.mjs, tools/ci/issue-labels.mjs, tools/ci/pr-board.mjs. Every function is pure except
// getAll, which takes the GitHub client (tools/ci/github-api.mjs `api`) as an argument.
import { REPO } from "../github-api.mjs";

/** Rows per list page; a page shorter than this is the last one (GitHub REST pagination). */
export const PAGE_SIZE = 100;
/** The label names of an issue or PR, whether its labels are strings or {name} objects. Pure. */
export const labelsOf = (x) => (x?.labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
/** An adoption comment (skill steward §Lane 3): `adopts PR #<n> — <host>:<session>`. */
export const ADOPT_RE = /^adopts PR #(\d+) — (\S+)/m;

/** Closing declarations in prose for this repository; comments and code examples do not reserve work.
 * Syntax: https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/linking-a-pull-request-to-an-issue */
export function closingIssues(body, repo = REPO) {
  let fence = null, paragraph = false, listIndent = 0;
  const prose = String(body || "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/).map((line) => {
    if (fence) {
      const close = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (close && close[1][0] === fence[0] && close[1].length >= fence.length) fence = null;
      paragraph = false;
      return "";
    }
    const open = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (open && (open[1][0] !== "`" || !open[2].includes("`"))) { fence = open[1]; paragraph = false; return ""; }
    if (!line.trim()) { paragraph = false; return ""; }
    const expanded = line.replace(/^\t+/, (tabs) => "    ".repeat(tabs.length));
    const indent = expanded.match(/^ */)[0].length;
    if (indent < listIndent) listIndent = 0;
    const item = expanded.match(/^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/);
    if (item) listIndent = item[0].length;
    // Indented code cannot interrupt prose. List continuation indentation belongs to the list, not its code.
    if (!paragraph && !item && indent >= listIndent + 4) return "";
    paragraph = !/^ {0,3}(?:#{1,6}\s|(?:[-*_]\s*){3,}$)/.test(line);
    return line;
  }).join("\n");
  const text = prose
    .replace(/(?<!`)(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/g, "")
    .replace(/https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+)\b/gi, "$1#$2");
  const ids = new Set();
  for (const m of text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s+(?:([\w.-]+\/[\w.-]+))?#(\d+)\b/gi)) {
    if (m[1] && m[1].toLowerCase() !== repo.toLowerCase()) continue;
    const n = Number(m[2]);
    if (Number.isSafeInteger(n) && n > 0) ids.add(n);
  }
  return [...ids];
}

const sectionOf = (body, name) => {
  const out = []; let on = false;
  for (const line of String(body || "").replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    if (/^##\s/.test(line)) on = line.replace(/^##\s+/, "").trim().toLowerCase() === name;
    else if (on) out.push(line);
  }
  return out;
};
/** A batch issue's members: the first `#n` of each top-level bullet under "## Members" (issue-batching's body). Pure. */
export function batchMembers(body) {
  return [...new Set(sectionOf(body, "members").map((l) => /^[-*]\s+#(\d{1,6})\b/.exec(l)?.[1]).filter(Boolean).map(Number))];
}
const get = (api, p) => { const r = api(p); if (r.error) throw new Error(`${p}: ${r.error}`); return r.json; };
/** Every row of a list endpoint: `per_page=100&page=N` until a short page (one page silently dropped the Board once the
 *  repo passed 100 open issues). `pick` maps a page body to its rows (check-runs wrap theirs).
 *  https://docs.github.com/en/rest/using-the-rest-api/using-pagination-in-the-rest-api */
export function getAll(api, p, { pick = (j) => j, maxPages = 50 } = {}) {
  const out = [];
  for (let page = 1; page <= maxPages; page++) {
    const picked = pick(get(api, `${p}${p.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`));
    const rows = Array.isArray(picked) ? picked : [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}
