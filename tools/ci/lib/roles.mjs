// roles.mjs — fleet roles, not environment ids (#6887 phases 2 and 5, #7049).
// @doc Fleet roles → env ids (tests/data/fleet-roles.json), env-literal scan, rotation-block parser, routine reaper.
// @section runner
// @skill dispatcher
//
// WHY. Skills and briefs carried literal `env_…` ids; a rebuilt environment left stale ids in three files and a
// launch into the wrong one. A skill names a ROLE (`worker`, `orchestrator`); tests/data/fleet-roles.json is the one
// place an id lives, and `resolveRole` turns the role into { role, name, id, permissionMode }.
//
// Rotation (phase 5). An orchestrator that hands off writes a fenced ```orchestrator block (skill `handoff`,
// Orchestrator ending) on the orchestration issue: its successor's session, account tag, environment ROLE and the
// standing-routine trigger ids. `parseOrchestratorBlocks` reads every such block from comment bodies; `reapActs`
// is the FULL routine's step 0: one `disable trig_…` act per enabled trigger the newest block does not own.
//
// Readers: tools/ci/brief.mjs (role, reap), tests/unit/brief.test.mjs. Every function is pure except
// loadRoles, which reads the data file.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROLES_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../../tests/data/fleet-roles.json");
/** A literal cloud-environment id (the platform's form: `env_` and a long base62 tail). */
export const ENV_LITERAL_RE = /\benv_[A-Za-z0-9]{20,}\b/g;
export const SESSION_RE = /^session_[A-Za-z0-9]+$/;
export const TRIGGER_RE = /^trig_[A-Za-z0-9]+$/;

/** The roles table from tests/data/fleet-roles.json (or `file`). */
export function loadRoles(file = ROLES_FILE) {
  const j = JSON.parse(fs.readFileSync(file, "utf8"));
  return j.roles || {};
}

/** Every env-id literal in a text, once each, in order. Pure. */
export function findEnvLiterals(text) {
  return [...new Set(String(text || "").match(ENV_LITERAL_RE) || [])];
}

/** A role key, or an environment's display name, to its row; null when unknown. A literal id is never resolved:
 *  briefs and skills name the role. Pure. */
export function resolveRole(nameOrRole, roles = loadRoles()) {
  const k = String(nameOrRole ?? "").trim();
  if (!k || findEnvLiterals(k).length) return null;
  const hit = roles[k] ? [k, roles[k]] : Object.entries(roles).find(([, r]) => r.name === k);
  return hit ? { role: hit[0], name: hit[1].name, id: hit[1].id, permissionMode: hit[1].permissionMode || "auto" } : null;
}

const FENCE_RE = /^[ \t]*```orchestrator[ \t]*\n([\s\S]*?)^[ \t]*```[ \t]*$/gm;
const KEYS = Object.freeze(["session", "account", "env-role", "triggers", "at"]);

/** Every ```orchestrator block in one or more texts (comment bodies, oldest first). A block reads
 *      session: session_…        account: <tag>        env-role: orchestrator
 *      triggers: trig_…, trig_…  at: <ISO UTC>
 *  Returns { blocks: [{ session, account, envRole, triggers, at, index }], problems: [string] }; a block with a
 *  problem is still listed (its problem names its index). Pure. */
export function parseOrchestratorBlocks(texts, roles = null) {
  const blocks = [], problems = [];
  for (const t of [].concat(texts || [])) {
    for (const m of String(t || "").matchAll(FENCE_RE)) {
      const kv = {};
      for (const line of m[1].split("\n")) {
        const mm = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/.exec(line);
        if (mm) kv[mm[1]] = mm[2];
      }
      const index = blocks.length;
      const b = { session: kv.session || "", account: kv.account || "", envRole: kv["env-role"] || "",
        triggers: (kv.triggers || "").split(/[,\s]+/).filter(Boolean), at: kv.at || "", index };
      const bad = (why) => problems.push(`block ${index}: ${why}`);
      for (const k of KEYS) if (!(k in kv)) bad(`missing ${k}:`);
      if (b.session && !SESSION_RE.test(b.session)) bad(`session "${b.session}" is not a session_… id`);
      if (findEnvLiterals(m[1]).length) bad("names an env_… id: write the role (env-role: orchestrator)");
      else if (b.envRole && roles && !roles[b.envRole]) bad(`env-role "${b.envRole}" is not a role in tests/data/fleet-roles.json`);
      for (const tr of b.triggers) if (!TRIGGER_RE.test(tr)) bad(`trigger "${tr}" is not a trig_… id`);
      if (b.at && Number.isNaN(Date.parse(b.at))) bad(`at "${b.at}" is not a timestamp`);
      blocks.push(b);
    }
  }
  return { blocks, problems };
}

/** The newest block: the latest `at`, ties to the later one in the texts. Pure. */
export function newestBlock(blocks) {
  let best = null;
  for (const b of blocks || []) if (!best || (Date.parse(b.at) || 0) >= (Date.parse(best.at) || 0)) best = b;
  return best;
}

/** Does a session row (list_sessions / get_session) read as archived? Pure. */
export const isArchived = (s) => !!s && (s.archived === true || /archived/i.test(String(s.status || "")) || /archived/i.test(String(s.status_bucket || "")));

/** FULL routine step 0. One act per ENABLED trigger to disable:
 *   - bound to an archived session (any trigger: nothing can resume there), or
 *   - a RECURRING trigger (cron_expression set) bound to a session other than the newest block's.
 *  One-shot check-ins (`send_later`, run_once_at) on a live session are a worker's own and are left alone, as are
 *  fresh-session triggers (no persistent_session_id). With no block, only the archived rule applies.
 *  `triggers`: list_triggers rows; `sessions`: list_sessions rows (or get_session results). Pure.
 *  @returns {{ trigger: string, session: string, why: string, line: string }[]} */
export function reapActs({ blocks = [], triggers = [], sessions = [] }) {
  const newest = newestBlock(blocks);
  const byId = new Map((sessions || []).map((s) => [s.id, s]));
  const acts = [];
  for (const t of triggers || []) {
    if (!t || t.enabled === false || !t.persistent_session_id) continue;
    const sid = t.persistent_session_id;
    let why = "";
    if (isArchived(byId.get(sid))) why = `bound to archived session ${sid}`;
    else if (newest && t.cron_expression && sid !== newest.session) why = `recurring, bound to ${sid}, not the newest orchestrator block's ${newest.session}`;
    if (why) acts.push({ trigger: t.id, session: sid, why, line: `disable ${t.id} (${t.name || "unnamed"}) — ${why}` });
  }
  return acts;
}
