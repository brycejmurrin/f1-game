#!/usr/bin/env node
// @doc Worker brief: render from a JSON spec, lint a hand-written one (STOP AT, TIP), refuse a duplicate launch.
//
//   node tools/ci/brief.mjs render --spec <spec.json> [--sessions <list_sessions.json>] [--no-dup]
//   node tools/ci/brief.mjs lint <brief.txt>
//   node tools/ci/brief.mjs dup --issue <n> | --pr <n> [--sessions <list_sessions.json>]
//   node tools/ci/brief.mjs role <role>          (the environment id to pass to create_session; tests/data/fleet-roles.json)
//   node tools/ci/brief.mjs reap --triggers <list_triggers.json> --blocks <comments.json|txt> [--sessions <list_sessions.json>]
//
// WHY (retro 2026-11-25, item 10). Hand-written briefs dropped STOP AT and the tip state, left the human steps a diff
// would need unpredicted, and PR #6349 was launched twice. This is the template of skill `dispatcher`
// references/orchestrator-brief.md as code: `render` prints it from task facts and refuses a duplicate launch, `lint`
// checks a brief written by hand, `dup` answers "is someone already on it?" alone.
//
// Spec (JSON): { kind: "ISSUE"|"CONTINUE PR", number, orchestrator, role, ask, askAt, task, evidence, scope,
//   owned: [paths], forbidden: [paths], stopAt: "start+150k", humanSteps: [lines], tip: { state: "green"|"red"|"paused",
//   sha, note }, report: [moments], env: "worker", permissionMode: "auto" }.
// `env` is a ROLE from tests/data/fleet-roles.json (or its display name); the brief prints the resolved name, never
// the id. A literal `env_…` id anywhere in a spec or a brief is refused (#7049): `role` prints the id for the launch.
// `reap` is the FULL routine's step 0 (lib/roles.mjs reapActs): one `disable trig_…` line per stale routine trigger.
// HUMAN STEPS are predicted from `owned`: a CONFIG_PATH (merge-gate.mjs) needs `config-ok` (routine: the orchestrator
// adds it after reading the diff; PROTECTED: Bryce's own tap, so propose instead), a ratchet file needs `ratchet-raise`.
// The prediction is added to `humanSteps`, never replaces it.
// Duplicates: an OPEN pull request whose body closes the issue (`Closes|Fixes|Resolves #n`) or, for CONTINUE PR, a
// second worker on that PR; and a LIVE session (from a saved `list_sessions` page) tagged `apex:issue-<n>` /
// `apex:pr-<n>` or titled with the same address. `render` prints the tag to pass to create_session so the next check
// sees this launch. The shell cannot call MCP: save the `list_sessions {children:true}` result to a file and pass it.
//
// Exit: 0 ok, 1 refused (duplicate, or a lint finding), 2 usage, 3 cannot judge (no token / API error / bad file).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { api } from "./github-api.mjs";
import { findEnvLiterals, resolveRole, loadRoles, parseOrchestratorBlocks, reapActs } from "./lib/roles.mjs";
import { isConfigPath, isProtectedConfigPath, RATCHET_FILE } from "./merge-gate.mjs";

const USAGE = "usage: node tools/ci/brief.mjs render --spec <spec.json> [--sessions <file>] [--no-dup] | lint <brief.txt> | dup --issue <n>|--pr <n> [--sessions <file>] | role <role> | reap --triggers <file> --blocks <file> [--sessions <file>]";
export const KINDS = Object.freeze(["ISSUE", "CONTINUE PR"]);
export const TIP_STATES = Object.freeze(["green", "red", "paused"]);
export const STOP_AT_RE = /^STOP AT:\s*(start\+\d+k|\d+k)\b/m;
export const TIP_RE = /^TIP:\s*(green|red|paused)\b/m;
/** The lines a brief must carry, as [label, regex]; order is print order. */
export const REQUIRED = Object.freeze([
  ["address line (ISSUE <n> | CONTINUE PR <n>)", /^(ISSUE|CONTINUE PR) \d+\b/m],
  ["ROLE:", /^ROLE:\s*\S/m],
  ["SCOPE:", /^SCOPE:\s*\S/m],
  ["OWNED:", /^OWNED:\s*\S/m],
  ["FORBIDDEN:", /^FORBIDDEN:\s*\S/m],
  ["HUMAN STEPS:", /^HUMAN STEPS:\s*\S/m],
  ["TIP: green|red|paused (the deploy tip's state at launch)", TIP_RE],
  ["STOP AT: start+<N>k (context-cap.py reads this form)", STOP_AT_RE],
  ["ENV: <environment> · permission_mode <mode>", /^ENV:\s*\S.*permission_mode\s+\S/m],
  ["MESSAGE ME ONLY WHEN:", /^MESSAGE ME ONLY WHEN:\s*\S/m],
]);

export const sessionTag = (kind, n) => `apex:${kind === "ISSUE" ? "issue" : "pr"}-${n}`;
export const address = (kind, n) => `${kind} ${n}`;

/** Human steps the owned paths predict. Pure. */
export function predictSteps(owned = []) {
  const files = (owned || []).map((p) => String(p).replace(/^\.\//, ""));
  const prot = files.filter(isProtectedConfigPath), routine = files.filter((f) => isConfigPath(f) && !isProtectedConfigPath(f));
  const ratchet = files.filter((f) => RATCHET_FILE.test(f));
  const out = [];
  if (routine.length) out.push(`config-ok (routine: ${routine.join(", ")}): the orchestrator adds it after reading the diff; send the head sha once pushed`);
  if (prot.length) out.push(`PROTECTED (${prot.join(", ")}): only Bryce's own config-ok tap covers it; propose the change instead of making it`);
  if (ratchet.length) out.push(`ratchet-raise (${ratchet.join(", ")}): Bryce's own click; send the raise and its CEILING-HISTORY reason`);
  return out;
}

/** Validate a spec; returns the problems (empty = good). Pure. */
export function specProblems(s, roles = loadRoles()) {
  const p = [];
  if (!s || typeof s !== "object") return ["spec is not an object"];
  if (!KINDS.includes(s.kind)) p.push(`kind must be one of ${KINDS.join(" | ")}`);
  if (!/^\d{1,7}$/.test(String(s.number ?? ""))) p.push("number must be the issue or PR number");
  for (const k of ["orchestrator", "role", "task", "scope"]) if (!String(s[k] || "").trim()) p.push(`${k} is required`);
  if (!/^(start\+\d+k|\d+k)$/.test(String(s.stopAt || ""))) p.push('stopAt must read "start+<N>k" (or "<N>k")');
  if (!TIP_STATES.includes(s.tip?.state)) p.push(`tip.state must be one of ${TIP_STATES.join(" | ")}`);
  if (s.tip?.state && s.tip.state !== "green" && !String(s.tip?.note || "").trim()) p.push("tip.note is required when the tip is not green (what to do until it is)");
  if (!Array.isArray(s.owned) || !s.owned.length) p.push("owned must list the paths the worker may edit");
  if (s.forbidden != null && !Array.isArray(s.forbidden)) p.push("forbidden must be a list");
  const ids = findEnvLiterals(JSON.stringify(s));
  if (ids.length) p.push(`a literal environment id (${ids.join(", ")}): name the role (env: "worker"); brief.mjs role <role> prints the id`);
  else if (!resolveRole(s.env || "worker", roles)) p.push(`env "${s.env}" is not a role in tests/data/fleet-roles.json (${Object.keys(roles).join(" | ")})`);
  return p;
}

/** The brief text. Pure (the spec must be valid). */
export function renderBrief(s, roles = loadRoles()) {
  const env = resolveRole(s.env || "worker", roles);
  const steps = [...(s.humanSteps || []), ...predictSteps(s.owned).filter((x) => !(s.humanSteps || []).some((h) => h.startsWith(x.split(" ")[0])))];
  const tip = s.tip;
  const lines = [
    `${address(s.kind, s.number)} for orchestrator ${s.orchestrator}. AGENTS.md and skill \`steward\` bind; this brief adds only task facts.`,
    "",
    `ROLE: ${s.role}`,
    ...(s.ask ? [`ASK (Bryce's words${s.askAt ? `, ${s.askAt}` : ""}): "${s.ask}"`] : []),
    `TASK: ${s.task}`,
    ...(s.evidence ? [`EVIDENCE: ${s.evidence}`] : []),
    `SCOPE: ${s.scope}`,
    `OWNED: ${s.owned.join(", ")}`,
    `FORBIDDEN: ${(s.forbidden || []).length ? s.forbidden.join(", ") : "everything outside OWNED"}; nothing in PROTECTED_CONFIG_PATH (tools/ci/merge-gate.mjs) without Bryce's tap`,
    `HUMAN STEPS: ${steps.length ? steps.join(" | ") : "none predicted"}`,
    `TIP: ${tip.state}${tip.sha ? ` at ${String(tip.sha).slice(0, 8)}` : ""}${tip.note ? ` — ${tip.note}` : ""}`,
    `STOP AT: ${s.stopAt}`,
    `ENV: ${env.role} ("${env.name}") · permission_mode ${s.permissionMode || env.permissionMode} · tags ["${sessionTag(s.kind, s.number)}"]`,
    `MESSAGE ME ONLY WHEN: ${(s.report || ["blocked", "refused (facts only)", "a decision is needed", "merged", "handing off"]).join(", ")} (send_message session_id ${s.orchestrator})`,
  ];
  return lines.join("\n");
}

/** Lint a written brief: the missing required lines, and any literal env id. Pure. */
export function lintBrief(text) {
  const t = String(text || "");
  const missing = REQUIRED.filter(([, re]) => !re.test(t)).map(([label]) => label);
  const tip = TIP_RE.exec(t);
  const ids = findEnvLiterals(t);
  if (ids.length) missing.push(`no literal environment id (${ids.join(", ")}): name the role on the ENV: line`);
  if (tip && tip[1] !== "green" && !/^TIP:\s*\S+.*\S\s*[—-]\s*\S/m.test(t)) missing.push("TIP: a red or paused tip names what to do until it is green (`TIP: red — …`)");
  return missing;
}

const CLOSES_RE = (n) => new RegExp(`\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s+(?:[\\w.-]+\\/[\\w.-]+)?#${n}\\b`, "i");
const LIVE_BUCKETS = new Set(["working", "blocked", "review_ready"]);
/** Is a session (list_sessions row) live? Archived / completed / failed rows are not. Pure. */
export const isLive = (s) => s && !s.archived && (s.status_bucket ? LIVE_BUCKETS.has(s.status_bucket) : !/archived|completed|failed/i.test(String(s.status || "")));

/** Duplicate launches for an address. `pulls`: open PR rows (number, body, draft); `sessions`: list_sessions rows. Pure.
 *  @returns {string[]} one line per duplicate */
export function duplicates({ kind, number, pulls = [], sessions = [], self = "" }) {
  const n = Number(number);
  const out = [];
  if (kind === "ISSUE") for (const p of pulls) if (CLOSES_RE(n).test(String(p.body || ""))) out.push(`open PR #${p.number} already closes issue #${n}: launch CONTINUE PR ${p.number} (if its lease lapsed), not a second ISSUE ${n}`);
  const tag = sessionTag(kind, n), addr = address(kind, n);
  const titleRe = new RegExp(`(^|\\W)${addr.replace(" ", "\\s+")}(\\D|$)`, "i");
  for (const s of sessions) {
    if (!isLive(s) || (self && s.id === self)) continue;
    if ((s.tags || []).includes(tag) || titleRe.test(String(s.title || ""))) out.push(`live session ${s.id} (${s.status_bucket || s.status || "?"}) is already on ${addr}${(s.tags || []).includes(tag) ? ` (tag ${tag})` : " (title)"}: message it instead of launching`);
  }
  return out;
}

/** A saved list_sessions result: an array, or { data | sessions: [...] }. */
export function readSessions(file) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  return Array.isArray(j) ? j : j.data || j.sessions || [];
}

const flag = (argv, name) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };

function dupCheck({ kind, number, sessionsFile, log, listOpen }) {
  let sessions = [];
  if (sessionsFile) {
    try { sessions = readSessions(sessionsFile); } catch (e) { log(`= brief cannot-judge — ${sessionsFile}: ${e.message}`); return 3; }
  } else log(`warning: no --sessions file: live sessions NOT checked (save list_sessions {children:true} and pass it)`);
  const l = listOpen();
  if (l.error) { log(`= brief cannot-judge — open pulls: ${l.error}`); return 3; }
  const d = duplicates({ kind, number, pulls: l.json || [], sessions });
  if (d.length) { d.forEach((x) => log(x)); log(`= brief duplicate — ${address(kind, number)}: ${d.length} already on it; do not launch`); return 1; }
  log(`= brief clear — no open PR or live session on ${address(kind, number)}`);
  return 0;
}

export function main(argv, { log = console.log, read = (f) => fs.readFileSync(f, "utf8"), listOpen = () => api("pulls?state=open&per_page=100") } = {}) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === "--help" || cmd === "-h") { log(USAGE); return cmd ? 0 : 2; }
  if (cmd === "lint") {
    if (!rest[0]) { log(USAGE); return 2; }
    let text;
    try { text = read(rest[0]); } catch (e) { log(`= brief cannot-judge — ${e.message}`); return 3; }
    const m = lintBrief(text);
    m.forEach((x) => log(`missing: ${x}`));
    log(m.length ? `= brief lint-refused — ${m.length} missing line(s)` : "= brief lint-ok");
    return m.length ? 1 : 0;
  }
  if (cmd === "dup") {
    const issue = flag(rest, "--issue"), pr = flag(rest, "--pr");
    const number = issue || pr;
    if (!/^\d{1,7}$/.test(number || "")) { log(USAGE); return 2; }
    return dupCheck({ kind: issue ? "ISSUE" : "CONTINUE PR", number, sessionsFile: flag(rest, "--sessions"), log, listOpen });
  }
  if (cmd === "role") {
    let r;
    try { r = resolveRole(rest[0], loadRoles()); } catch (e) { log(`= brief cannot-judge — fleet roles: ${e.message}`); return 3; }
    if (!r) { log(`= brief role-unknown — "${rest[0] ?? ""}" (name a role from tests/data/fleet-roles.json)`); return rest[0] ? 1 : 2; }
    log(`${r.id}`);
    log(`= brief role ${r.role} — environment "${r.name}", permission_mode ${r.permissionMode}`);
    return 0;
  }
  if (cmd === "reap") {
    const tf = flag(rest, "--triggers"), bf = flag(rest, "--blocks"), sf = flag(rest, "--sessions");
    if (!tf || !bf) { log(USAGE); return 2; }
    let triggers, texts, sessions = [];
    try {
      const tj = JSON.parse(read(tf));
      triggers = Array.isArray(tj) ? tj : tj.triggers || tj.data || [];
      const braw = read(bf);
      let bj = null;
      try { bj = JSON.parse(braw); } catch { /* a plain text file of comment bodies */ }
      texts = bj == null ? [braw] : (Array.isArray(bj) ? bj : bj.comments || bj.data || []).map((c) => (typeof c === "string" ? c : c.body || ""));
      if (sf) { const sj = JSON.parse(read(sf)); sessions = Array.isArray(sj) ? sj : sj.data || sj.sessions || []; }
    } catch (e) { log(`= brief cannot-judge — ${e.message}`); return 3; }
    let roles = null;
    try { roles = loadRoles(); } catch { /* the block's env-role is then unchecked */ }
    const { blocks, problems } = parseOrchestratorBlocks(texts, roles);
    problems.forEach((x) => log(`block: ${x}`));
    if (!sf) log("warning: no --sessions file: archived sessions NOT detected (save list_sessions and pass it)");
    if (!blocks.length) log("warning: no ```orchestrator block found: only the archived rule applies");
    const acts = reapActs({ blocks, triggers, sessions });
    acts.forEach((a) => log(a.line));
    log(`= brief reap — ${acts.length} trigger(s) to disable (update_trigger enabled:false; log each act)`);
    return 0;
  }
  if (cmd === "render") {
    const specFile = flag(rest, "--spec");
    if (!specFile) { log(USAGE); return 2; }
    let spec;
    try { spec = JSON.parse(read(specFile)); } catch (e) { log(`= brief cannot-judge — ${specFile}: ${e.message}`); return 3; }
    const p = specProblems(spec);
    if (p.length) { p.forEach((x) => log(`spec: ${x}`)); log(`= brief spec-refused — ${p.length} problem(s)`); return 1; }
    if (!rest.includes("--no-dup")) {
      const code = dupCheck({ kind: spec.kind, number: spec.number, sessionsFile: flag(rest, "--sessions"), log, listOpen });
      if (code) return code;
    }
    log(renderBrief(spec));
    return 0;
  }
  log(USAGE);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
