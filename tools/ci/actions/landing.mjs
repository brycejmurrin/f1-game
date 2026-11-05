// @doc Check current-head evidence, owner approval and live pause/base state before trusted merge.
import crypto from "node:crypto";
import { REPO, DEPLOY } from "../github-api.mjs";
import { verifyCoverage } from "./coverage.mjs";
import { requestComplete, isoTime, timeMs } from "./state.mjs";
import { requestFromPR } from "./requests.mjs";
import { LABELS, namesOf } from "./policy.mjs";

const SHA = /^[a-f0-9]{40}$/;
const testedIntegration = (commit, candidate) => commit.tree?.sha === candidate.treeSha && commit.parents?.length === 2
  && commit.parents.some((p) => p.sha === candidate.headSha) && commit.parents.some((p) => p.sha === candidate.baseSha);
export const sensitivePath = (name) => /^(\.claude\/(?:hooks\/|settings\.json$)|\.github\/(?:workflows\/|actions\/)|\.githooks\/|tools\/ci\/(?:actions\/|github-api\.mjs$|github-token\.mjs$|dispatch\.mjs$))/.test(name || "");
export const approvalDigest = (files) => crypto.createHash("sha256").update(JSON.stringify(files.map(({ filename, sha, status }) => ({ filename, sha, status })).sort((a, b) => a.filename.localeCompare(b.filename)))).digest("hex");

/** Strict checks must apply even to privileged callers. Without server-side
 * enforcement GitHub's merge API cannot compare-and-swap the expected base tip. */
export async function verifyStrictMergeProtection(get, baseBranch, requiredContext = "gate") {
  try {
    const protection = await get(`branches/${encodeURIComponent(baseBranch)}/protection`);
    const checks = protection.required_status_checks;
    if (checks?.strict === true && protection.enforce_admins?.enabled === true
      && [...(checks.contexts || []), ...(checks.checks || []).map((c) => c.context)].includes(requiredContext)) return true;
  } catch { /* Repositories can implement equivalent protection with rulesets. */ }
  try {
    const rules = await get(`rules/branches/${encodeURIComponent(baseBranch)}`);
    if (!Array.isArray(rules)) return false;
    const strict = rules.filter((r) => r.type === "required_status_checks" && r.parameters?.strict_required_status_checks_policy === true
      && r.parameters.required_status_checks?.some((c) => c.context === requiredContext));
    for (const rule of strict) {
      if (rule.ruleset_source_type !== "Repository" || !Number.isInteger(rule.ruleset_id)) continue;
      const source = await get(`rulesets/${rule.ruleset_id}`);
      if (source.enforcement === "active" && Array.isArray(source.bypass_actors) && source.bypass_actors.length === 0) return true;
    }
  } catch { /* Unknown permissions/protection never authorize a merge. */ }
  return false;
}

function fullCoverage(state, candidate) {
  try {
    return !state.controls.validation && !candidate.blockers?.length && candidate.plan?.mode === "ready"
      && requestComplete(state, candidate.id) && verifyCoverage(candidate.plan, Object.values(candidate.results)).ok;
  } catch { return false; }
}
function eligible(state, candidate) {
  return state.mode === "active" && !state.controls.merges && candidate.kind === "pr" && candidate.mergeRequested
    && !candidate.draft && !candidate.paused && !candidate.superseded && fullCoverage(state, candidate);
}

/** One pinned merge at a time. No source checkout, PR code, old land label, or auto-arm. */
export async function landNext({ store, request, now = Date.now(), repo = REPO, baseBranch = DEPLOY, owner = "brycejmurrin" } = {}) {
  const at = isoTime(now), prefix = `/repos/${repo}/`;
  let reservationHeld = false;
  const result = (status, candidate, reason, extra = {}) => {
    // A reserved attempt has provably not called the merge API. A stale/paused
    // candidate must not keep every unrelated PR behind its abandoned reservation.
    if (status === "deferred" && candidate && reservationHeld) {
      try {
        store.update((live) => {
          if (live.landing?.requestId !== candidate.id || live.landing.status !== "reserved") return;
          delete live.landing;
          if (live.requests[candidate.id]?.landing?.status === "reserved") delete live.requests[candidate.id].landing;
        });
      } catch { /* failed release remains reserved and safe to reconcile */ }
    }
    return { status, requestId: candidate?.id || null, reason, ...extra };
  };
  async function get(path, options) {
    const response = await request(`${prefix}${path}`, options);
    if (!response || response.error || response.status < 200 || response.status >= 300) {
      const error = new Error(response?.error || response?.json?.message || `HTTP ${response?.status || 0}`);
      error.response = response; throw error;
    }
    return response.json;
  }
  async function rows(path) {
    const out = [];
    for (let page = 1; page <= 30; page++) {
      const batch = await get(`${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`);
      if (!Array.isArray(batch)) throw new Error("Incomplete authoritative listing");
      out.push(...batch); if (batch.length < 100) return out;
    }
    throw new Error("Authoritative listing truncated");
  }
  function persist(candidate, status, extra = {}) {
    store.update((state) => {
      if (state.landing?.requestId !== candidate.id) throw new Error("Landing owner changed");
      Object.assign(state.landing, { status, updatedAt: at, ...extra });
      state.requests[candidate.id].landing = { ...state.landing };
    });
  }
  async function publish(candidate, mergeSha) {
    try {
      await get("actions/workflows/pages.yml/dispatches", { method: "POST", body: { ref: baseBranch } });
      persist(candidate, "merged", { mergeSha, publication: "dispatched" });
      return result("merged", candidate, null, { mergeSha, publication: "dispatched" });
    } catch (error) {
      try { persist(candidate, "merged", { mergeSha, publication: "pending", publicationError: error.message }); } catch { /* never claim the write succeeded */ }
      return result("merged", candidate, "Pages dispatch not confirmed", { mergeSha, publication: "pending" });
    }
  }
  async function confirm(candidate, mergeSha) {
    const commit = await get(`git/commits/${mergeSha}`);
    if (!testedIntegration(commit, candidate)) {
      persist(candidate, "merged-unverified", { mergeSha, reason: "merged tree or parents differ from tested integration" });
      return result("merged-unverified", candidate, "Merged tree or parents differ from tested integration; deployment not dispatched", { mergeSha });
    }
    persist(candidate, "merged", { mergeSha, publication: "pending" });
    return publish(candidate, mergeSha);
  }
  let state;
  try { state = store.read().state; } catch { return result("deferred", null, "ledger unavailable"); }
  if (state.mode !== "active" || state.controls.merges) return result("deferred", null, "merges paused");
  const active = state.landing;
  reservationHeld = active?.status === "reserved";
  if (active && ["firing", "ambiguous", "merged"].includes(active.status)) {
    const candidate = state.requests[active.requestId];
    if (!candidate) return result("deferred", null, "landing request missing");
    if (active.status === "merged" && active.publication === "dispatched") {
      // This attempt is complete. It must never be PUT again.
    } else {
      try {
        const current = await get(`pulls/${candidate.number}`);
        if (!current.merged || current.head?.sha !== candidate.headSha || !SHA.test(current.merge_commit_sha || "")) return result("ambiguous", candidate, "previous merge not authoritatively resolved");
        return await confirm(candidate, current.merge_commit_sha);
      } catch (error) { return result("ambiguous", candidate, error.message); }
    }
  }
  const candidates = Object.values(state.requests).filter((r) => eligible(state, r) && !["merged", "merged-unverified", "rejected", "firing", "ambiguous"].includes(r.landing?.status))
    .sort((a, b) => Number(!!b.priority) - Number(!!a.priority) || timeMs(a.mergeRequestedAt || a.acceptedAt) - timeMs(b.mergeRequestedAt || b.acceptedAt) || a.id.localeCompare(b.id));
  const candidate = state.landing?.status === "reserved" ? state.requests[state.landing.requestId] : candidates[0];
  if (!candidate || !eligible(state, candidate)) return result("deferred", candidate, "no eligible complete landing request");
  try {
    const current = await get(`pulls/${candidate.number}`);
    const issue = await get(`issues/${candidate.number}`);
    const events = await rows(`issues/${candidate.number}/events`);
    // pulls/N.base.sha can lag a recent merge; the branch endpoint and exact
    // synthetic merge parents below establish the current base identity.
    if (current.state !== "open" || current.merged || current.draft || current.head?.sha !== candidate.headSha || current.base?.ref !== baseBranch) return result("deferred", candidate, "PR state, head or base branch changed");
    if (namesOf(issue).includes(LABELS.paused) || requestFromPR({ ...current, labels: issue.labels }, { events, previous: candidate, owner })?.paused) return result("deferred", candidate, "PR paused");
    const base = await get(`branches/${encodeURIComponent(baseBranch)}`);
    if (base.commit?.sha !== candidate.baseSha) return result("deferred", candidate, "deploy base moved");
    const comparison = await get(`compare/${candidate.baseSha}...${candidate.headSha}`);
    if (!["ahead", "identical"].includes(comparison.status) || comparison.merge_base_commit?.sha !== candidate.baseSha) return result("deferred", candidate, "PR must include the current deploy base");
    if (!SHA.test(candidate.sourceSha || "") || !SHA.test(current.merge_commit_sha || "")) return result("deferred", candidate, "tested merge commit identity unavailable");
    const merge = await get(`git/commits/${candidate.sourceSha}`);
    if (!testedIntegration(merge, candidate)) return result("deferred", candidate, "tested integration tree or parents mismatch");
    // GitHub can recreate its synthetic merge commit with another timestamp.
    // Reuse evidence only after reading both commits and proving the exact same
    // tested tree and current head/base parents, never by SHA similarity.
    if (current.merge_commit_sha !== candidate.sourceSha && !testedIntegration(await get(`git/commits/${current.merge_commit_sha}`), candidate)) return result("deferred", candidate, "current synthetic merge tree or parents mismatch");
    const files = await rows(`pulls/${candidate.number}/files`);
    if (!Number.isInteger(current.changed_files) || files.length !== current.changed_files || files.some((f) => typeof f.filename !== "string" || !SHA.test(f.sha || "") || typeof f.status !== "string")) return result("deferred", candidate, "changed-file evidence incomplete");
    const sensitive = files.some((f) => sensitivePath(f.filename) || sensitivePath(f.previous_filename));
    if (sensitive && (candidate.approvedBy !== owner || candidate.approvedViaApp !== null || candidate.approvedSha !== candidate.headSha || candidate.approvedDiffSha !== approvalDigest(files))) return result("deferred", candidate, "owner approval required for this head and diff");
    if (!await verifyStrictMergeProtection(get, baseBranch)) return result("deferred", candidate, "strict up-to-date gate protection without privileged bypass is required");
    const reserved = store.update((live) => {
      const record = live.requests[candidate.id];
      if (!record || !eligible(live, record)) return false;
      if (live.landing && ["reserved", "firing", "ambiguous"].includes(live.landing.status) && live.landing.requestId !== candidate.id) return false;
      if (record.landing && record.landing.status !== "reserved") return false;
      live.landing = { requestId: candidate.id, headSha: candidate.headSha, baseSha: candidate.baseSha, status: "reserved", reservedAt: at };
      record.landing = { ...live.landing }; return true;
    }).result;
    if (!reserved) return result("deferred", candidate, "landing admission changed");
    reservationHeld = true;
    // Re-read immediately before the irreversible API call. GitHub pins only head;
    // branch protection must enforce strict up-to-date checks to close the base race.
    const latest = await get(`pulls/${candidate.number}`), tip = await get(`branches/${encodeURIComponent(baseBranch)}`);
    if (latest.head?.sha !== candidate.headSha || latest.base?.ref !== baseBranch || latest.draft || latest.state !== "open" || namesOf(latest).includes(LABELS.paused) || tip.commit?.sha !== candidate.baseSha) return result("deferred", candidate, "final head, pause or base changed");
    if (!SHA.test(latest.merge_commit_sha || "")) return result("deferred", candidate, "final synthetic merge identity unavailable");
    if (latest.merge_commit_sha !== current.merge_commit_sha && !testedIntegration(await get(`git/commits/${latest.merge_commit_sha}`), candidate)) return result("deferred", candidate, "final synthetic merge tree or parents mismatch");
    const firing = store.update((live) => {
      if (!eligible(live, live.requests[candidate.id]) || live.landing?.requestId !== candidate.id || live.landing.status !== "reserved") return false;
      live.landing.status = "firing"; live.landing.firedAt = at;
      live.requests[candidate.id].landing = { ...live.landing }; return true;
    }).result;
    if (!firing) return result("deferred", candidate, "merge permission changed");
    let response;
    try { response = await request(`${prefix}pulls/${candidate.number}/merge`, { method: "PUT", body: { merge_method: "merge", sha: candidate.headSha } }); }
    catch { response = { status: 0, error: "merge response unavailable" }; }
    if (response?.status >= 200 && response.status < 300 && response.json?.merged === true && SHA.test(response.json.sha || "")) return await confirm(candidate, response.json.sha);
    if (response?.status >= 400 && response.status < 500) {
      persist(candidate, "rejected", { reason: response.error || response.json?.message || `HTTP ${response.status}` });
      return result("rejected", candidate, response.error || response.json?.message || `HTTP ${response.status}`);
    }
    persist(candidate, "ambiguous", { reason: response?.error || response?.json?.message || "merge outcome unknown" });
    const observed = await get(`pulls/${candidate.number}`);
    if (observed.merged && observed.head?.sha === candidate.headSha && SHA.test(observed.merge_commit_sha || "")) return await confirm(candidate, observed.merge_commit_sha);
    return result("ambiguous", candidate, "merge outcome unknown; not retried");
  } catch (error) {
    try {
      const attempt = store.read().state.landing;
      if (attempt?.requestId === candidate.id && ["firing", "ambiguous"].includes(attempt.status)) return result("ambiguous", candidate, error.message);
    } catch { /* unavailable ledger is already an uncertainty */ }
    return result("deferred", candidate, error.message);
  }
}
