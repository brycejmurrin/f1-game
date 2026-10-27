// @doc Github fleet: canonical F1 environment and plugin support.
"use strict";
// Connector adapter for the existing Apex fleet branch; no shell credentials.
const REPOSITORY = "brycejmurrin/f1-game";
const BRANCH = "claude/fleet-bus";
const API = "https://api.github.com/repos/" + REPOSITORY;
const SHA = /^[0-9a-f]{40}$/;
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const SLUG = "[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{4,}";
const SESSION = new RegExp("^(?:codex:(?:" + UUID + "|" + SLUG + ")|claude:(?:session_[A-Za-z0-9]{20,}|cse_[A-Za-z0-9]{20,}|" + UUID + ")|cursor:(?:bc-[A-Za-z0-9-]{8,}|" + UUID + "|" + SLUG + ")|grok:(?:" + UUID + "|" + SLUG + "))$");
const ADDRESS = /^(?:\*|#\d+|[A-Z](?:·[A-Z0-9][A-Za-z0-9]*)*|orchestrator|merge-holder|merge-desk|tools|track-engine)$/;
const TYPES = ["READY", "GREEN", "BLOCKED", "HANDOFF", "DONE", "INCIDENT"];

function messageLine({ type, to, from, text }) {
  if (!TYPES.includes(type)) throw new Error("Unsupported coordination message type");
  if (!SESSION.test(from || "")) throw new Error("Use the actual host session address as from");
  if (!SESSION.test(to || "") && !ADDRESS.test(to || "")) throw new Error("Invalid recipient address");
  if (typeof text !== "string" || !text.trim() || text.length > 4000 || /[\r\n\x00-\x1f]/.test(text))
    throw new Error("Message must be one nonempty line, at most 4000 characters");
  // Coordination only: lease changes and GAME-SLOT claims remain repo-gated.
  return type + " to:" + to + " from:" + from + " " + text.trim();
}

function payload(value, depth = 0) {
  if (depth > 8) throw new Error("Unreadable connector response");
  if (value?.isError) throw new Error("GitHub connector reported failure");
  if (typeof value === "string") return payload(JSON.parse(value), depth + 1);
  if (Array.isArray(value)) return value;
  if (value?.object?.sha || value?.sha || value?.status) return value;
  if (value?.structuredContent) return payload(value.structuredContent, depth + 1);
  if (typeof value?.content === "string") return payload(value.content, depth + 1);
  if (Array.isArray(value?.content)) {
    for (const block of value.content) {
      if (block.type === "text" && /^[\[{]/.test(block.text?.trim() || ""))
        return payload(block.text, depth + 1);
    }
  }
  throw new Error("Unreadable connector response");
}

function createFleetBridge({ fetch, createCommit, updateRef }) {
  if (typeof fetch !== "function") throw new Error("GitHub fetch callback is required");
  const get = async route => payload(await fetch({ url: API + route }));
  const head = async () => {
    const ref = await get("/git/ref/heads/" + BRANCH);
    if (ref.ref !== "refs/heads/" + BRANCH || !SHA.test(ref.object?.sha || ""))
      throw new Error("Cannot verify fleet branch identity");
    return ref.object.sha;
  };
  async function read({ limit = 20, sinceSha = null, to = [] } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Array.isArray(to) ||
        to.some(address => !SESSION.test(address) && !ADDRESS.test(address)) ||
        (sinceSha !== null && !SHA.test(sinceSha))) throw new Error("Invalid bounded read");
    const rows = await get("/commits?sha=" + encodeURIComponent(BRANCH) + "&per_page=" + limit);
    if (!Array.isArray(rows)) throw new Error("Unreadable fleet log");
    const boundary = sinceSha === null ? -1 : rows.findIndex(row => row.sha === sinceSha);
    const selected = boundary < 0 ? rows : rows.slice(0, boundary);
    const messages = selected.flatMap(row => {
      const subject = String(row.commit?.message || "").split("\n")[0];
      const match = /^([A-Z-]+) to:(\S+) from:(\S+) (.*)$/.exec(subject);
      return match && SHA.test(row.sha || "") && TYPES.includes(match[1]) &&
        (!to.length || match[2] === "*" || to.includes(match[2]))
        ? [{ sha: row.sha, type: match[1], to: match[2], from: match[3], text: match[4] }] : [];
    });
    return { messages, latestSha: rows[0]?.sha || null,
      continuity: sinceSha === null ? "INITIAL_WINDOW" : boundary >= 0 ? "BOUNDARY_FOUND" : "GAP" };
  }
  async function send(input) {
    const message = messageLine(input); // validate before any network operation
    if (typeof createCommit !== "function" || typeof updateRef !== "function")
      throw new Error("GitHub commit and ref callbacks are required for sending");
    for (let attempt = 1; attempt <= 3; attempt++) {
      const parent = await head();
      const commit = await get("/git/commits/" + parent);
      if (commit.sha !== parent || !SHA.test(commit.tree?.sha || ""))
        throw new Error("Cannot verify fleet tree");
      const created = payload(await createCommit({ repository_full_name: REPOSITORY,
        parent_sha: parent, tree_sha: commit.tree.sha, message }));
      if (!SHA.test(created.sha || "")) throw new Error("Cannot verify created commit");
      let advanced = true;
      try {
        payload(await updateRef({ repository_full_name: REPOSITORY, branch_name: BRANCH,
          sha: created.sha, expected_sha: parent, force: false }));
      } catch {
        advanced = false;
      }
      const current = await head();
      if (current === created.sha) return { outcome: "RECORDED", sha: created.sha,
        branch: BRANCH, attempts: attempt, receipt: "REF_READBACK", recipientAcknowledged: false };
      // A response can be lost after a successful update, or another writer can
      // append immediately. Confirm ancestry before considering a retry.
      if (current !== parent) {
        const compare = await get("/compare/" + created.sha + "..." + current);
        if (compare.status === "ahead" || compare.status === "identical")
          return { outcome: "RECORDED", sha: created.sha, branch: BRANCH, attempts: attempt,
            receipt: "ANCESTRY_READBACK", recipientAcknowledged: false };
        if (!advanced && attempt < 3) continue; // actual concurrent branch movement
      }
      // Auth/permission failures with no branch movement are not races.
      throw new Error("Fleet write unconfirmed; inspect permissions and current head before retrying");
    }
    throw new Error("Fleet branch changed repeatedly; message not confirmed");
  }
  return { read, send };
}
module.exports = { REPOSITORY, BRANCH, messageLine, payload, createFleetBridge };
