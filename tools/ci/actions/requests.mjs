// @doc Build immutable issue and PR requests while preserving scheduling identity and ownership.
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
function common(item, options, kind, id) {
  const previous = options.previous || {}, intent = options.intent || {};
  const liveOwner = previous.owner && !previous.owner.terminal;
  const requestedMembers = intent.pendingMembership || intent.members || options.members || previous.members || [];
  const members = liveOwner ? previous.members || [] : requestedMembers;
  const pendingMembership = liveOwner && JSON.stringify(members) !== JSON.stringify(requestedMembers) ? [...requestedMembers] : undefined;
  const headChanged = !!previous.sourceSha && !!item.head?.sha && previous.sourceSha !== item.head.sha;
  return { ...previous, id, kind, number: Number(item.number), sourceSha: item.head?.sha || null,
    baseSha: item.base?.sha || options.baseSha || null, treeSha: options.treeSha || null,
    acceptedAt: previous.acceptedAt || options.now || new Date().toISOString(),
    ...controls(item, options), blockers: [...(options.blockers || [])], members: [...members], pendingMembership,
    owner: options.claimOwner || previous.owner || null, tasks: headChanged ? [] : previous.tasks || [], results: headChanged ? {} : previous.results || {},
    mergeRequested: intent.mergeRequested || previous.mergeRequested || false,
    mergeRequestedAt: intent.mergeRequestedAt || previous.mergeRequestedAt || null,
    approvedSha: intent.approvedSha || previous.approvedSha || null, approvedDiffSha: intent.approvedDiffSha || previous.approvedDiffSha || null,
    approvedBy: intent.approvedBy || previous.approvedBy || null, approvedViaApp: Object.hasOwn(intent, "approvedViaApp") ? intent.approvedViaApp : previous.approvedViaApp,
    recoverRequested: intent.recoverRequested || previous.recoverRequested || false };
}
/** Parent membership is authoritative metadata supplied by the adapter, never inferred from an area label. */
export function requestFromIssue(issue, options = {}) {
  if (!issue || issue.pull_request || issue.state === "closed" || !namesOf(issue).includes(LABELS.ready)) return null;
  const request = common(issue, options, "issue", `issue:${issue.number}`);
  if (options.batchParent) request.blockers.push(`batch:${options.batchParent}`);
  if (request.members.length) request.batch = true;
  return request;
}
export function requestFromPR(pr, options = {}) {
  if (!pr?.head?.sha || pr.state === "closed" || pr.merged) return null;
  return { ...common(pr, options, "pr", `pr:${pr.number}:${pr.head.sha}`), draft: !!pr.draft };
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
