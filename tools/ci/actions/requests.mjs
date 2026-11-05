// @doc Build immutable PR validation requests while preserving queue age, intent and exact-head evidence.
import { byOwner, LABELS, namesOf } from "./policy.mjs";

function latest(events, name) {
  return (events || []).filter((e) => e.label?.name === name && ["labeled", "unlabeled"].includes(e.event))
    .reduce((a, b) => !a || Date.parse(b.created_at) > Date.parse(a.created_at) ||
      Date.parse(b.created_at) === Date.parse(a.created_at) && Number(b.id || 0) > Number(a.id || 0) ? b : a, null);
}
function controls(item, { events, owner, previous = {} } = {}) {
  const labels = namesOf(item), pause = latest(events, LABELS.paused), priority = latest(events, LABELS.priority);
  const lastSet = latest((events || []).filter((e) => e.event === "labeled"), LABELS.paused);
  const ownerPause = !!previous.pauseOwner || (lastSet && byOwner(lastSet, owner));
  const lifted = pause?.event === "unlabeled" && byOwner(pause, owner);
  return { priority: !!(labels.includes(LABELS.priority) && priority?.event === "labeled" && byOwner(priority, owner)),
    paused: !!(labels.includes(LABELS.paused) || (ownerPause && !lifted) || (previous.paused && !pause)), pauseOwner: !!(ownerPause && !lifted) };
}
/** PR events request validation automatically; implementation agents are outside this coordinator. */
export function requestFromPR(pr, options = {}) {
  if (!pr?.head?.sha || pr.state === "closed" || pr.merged) return null;
  const previous = options.previous || {}, intent = options.intent || {};
  const { owner, workerLaunch, members, pendingMembership, batch, batchParent, intakeWithdrawn, agentHost, codingHost, workerHost, ...retained } = previous;
  const headChanged = !!(previous.headSha || previous.sourceSha) && (previous.headSha || previous.sourceSha) !== pr.head.sha;
  return { ...retained, id: `pr:${pr.number}:${pr.head.sha}`, kind: "pr", number: Number(pr.number),
    sourceSha: pr.head.sha, headSha: pr.head.sha, draft: !!pr.draft,
    baseSha: pr.base?.sha || options.baseSha || null, treeSha: options.treeSha || null,
    acceptedAt: previous.acceptedAt || options.now || new Date().toISOString(),
    ...controls(pr, options), blockers: [...(options.blockers || [])],
    tasks: headChanged ? [] : previous.tasks || [], results: headChanged ? {} : previous.results || {},
    mergeRequested: intent.mergeRequested === true || previous.mergeRequested === true,
    mergeRequestedAt: intent.mergeRequestedAt || previous.mergeRequestedAt || null,
    approvedSha: intent.approvedSha || previous.approvedSha || null,
    approvedDiffSha: intent.approvedDiffSha || previous.approvedDiffSha || null,
    approvedBy: intent.approvedBy || previous.approvedBy || null,
    approvedViaApp: Object.hasOwn(intent, "approvedViaApp") ? intent.approvedViaApp : previous.approvedViaApp,
    recoverRequested: intent.recoverRequested === true || previous.recoverRequested === true };
}
/** Cheap trusted admission before any integration code executes. Inputs are authoritative adapter evidence. */
export function trustedLandingEligibility(pr, options = {}) {
  const blockers = [];
  if (!pr || pr.state !== "open" || pr.merged) blockers.push("not-open");
  if (pr?.draft) blockers.push("draft");
  if (options.baseBranch && pr?.base?.ref !== options.baseBranch) blockers.push("wrong-base");
  if (!options.mergeRequested) blockers.push("merge-not-requested");
  if (options.paused || options.controls?.merges) blockers.push("paused");
  if (!pr?.head?.sha || (options.sourceSha && pr.head.sha !== options.sourceSha)) blockers.push("head-moved");
  if (options.trustedRowsOk !== true) blockers.push("trusted-rows-not-passed");
  if (options.requiresApproval && (options.approvedSha !== pr?.head?.sha || (options.diffSha && options.approvedDiffSha !== options.diffSha))) blockers.push("approval-required");
  if (options.ciSuccess !== true) blockers.push("ci-not-successful");
  return { ok: blockers.length === 0, blockers };
}
