// @doc Apply owner-direct queue commands and sticky pause intent without creating duplicate validation.
import { byOwner, classifyEvent, CONTROL_ISSUE, LABELS } from "./policy.mjs";

function commentIdentity(comment) {
  if (!comment || !/^[1-9]\d*$/.test(String(comment.id || "")) || !Number.isFinite(Date.parse(comment.created_at || ""))) return null;
  return { commentId: String(comment.id), at: new Date(comment.created_at).toISOString() };
}
function laterThan(identity, previous) {
  if (!previous) return true;
  const previousTime = Date.parse(previous.at || "");
  if (!Number.isFinite(previousTime)) return false;
  const difference = Date.parse(identity.at) - previousTime;
  if (difference) return difference > 0;
  return /^[1-9]\d*$/.test(String(previous.commentId || "")) && BigInt(identity.commentId) > BigInt(previous.commentId);
}

/** TRUE means paused. This reducer never performs I/O and never creates validation requests. */
export function applyControls(state, eventName, payload = {}, options = {}) {
  const next = structuredClone(state);
  next.controls = { validation: !!next.controls?.validation, merges: !!next.controls?.merges };
  const event = classifyEvent(eventName, payload, options);
  if (!event.relevant) return next;
  const provenance = options.provenance || payload.comment;
  const authentic = byOwner(provenance, options.owner);
  if (event.kind === "label") {
    // A hint without a fetched authoritative event cannot clear a sticky owner pause.
    const labelEvent = options.provenance;
    const ownerEvent = byOwner(labelEvent, options.owner);
    for (const request of Object.values(next.requests || {})) {
      if (request.kind !== "pr" || Number(request.number) !== event.number) continue;
      if (event.label === LABELS.paused) {
        if (event.action === "labeled") { request.paused = true; request.pauseOwner ||= ownerEvent; }
        else if (labelEvent && Object.hasOwn(labelEvent, "performed_via_github_app") && (!request.pauseOwner || ownerEvent)) { request.paused = false; request.pauseOwner = false; }
      }
      if (event.label === LABELS.priority) request.priority = event.action === "labeled" && ownerEvent;
    }
    return next;
  }
  if (event.kind !== "command") return next;
  const command = event.command;
  const identity = commentIdentity(provenance);
  if (!identity || String(payload.comment?.id) !== identity.commentId) return next;
  const { at } = identity;
  if (next.acceptedCommands?.[identity.commentId]) return next;
  if (["pause", "resume"].includes(command.type)) {
    if (!authentic || event.number !== (options.controlIssue ?? CONTROL_ISSUE)) return next;
    next.acceptedCommands ||= {};
    next.acceptedCommands[identity.commentId] = { ...identity, number: event.number, type: command.type, scope: command.scope };
    next.controlProvenance ||= {};
    for (const scope of command.scope === "all" ? ["validation", "merges"] : [command.scope]) {
      if (!laterThan(identity, next.controlProvenance[scope])) continue;
      next.controls[scope] = command.type === "pause";
      next.controlProvenance[scope] = { at, actor: options.owner || "brycejmurrin", commentId: provenance.id, paused: command.type === "pause", source: "owner" };
    }
    return next;
  }
  if (command.type === "approve" && !authentic) return next;
  if (["merge", "recover"].includes(command.type)
    && options.commandAllowed !== true
    && !["OWNER", "MEMBER", "COLLABORATOR"].includes(provenance.author_association)) return next;
  next.acceptedCommands ||= {};
  next.acceptedCommands[identity.commentId] = { ...identity, number: event.number, type: command.type,
    ...(command.type === "approve" ? { sha: command.sha, diffSha: options.diffSha || null } : {}) };
  next.intents ||= {};
  const intent = next.intents[event.number] ||= {};
  intent.commandProvenance ||= {};
  if (!laterThan(identity, intent.commandProvenance[command.type])) return next;
  intent.commandProvenance[command.type] = identity;
  if (command.type === "merge") { intent.mergeRequested = true; intent.mergeRequestedAt ||= at; }
  if (command.type === "recover") intent.recoverRequested = true;
  if (command.type === "approve") { intent.approvedSha = command.sha; intent.approvedAt = at; intent.approvedDiffSha = options.diffSha || null; intent.approvedBy = options.owner || "brycejmurrin"; intent.approvedViaApp = null; }
  for (const request of Object.values(next.requests || {})) {
    if (request.kind !== "pr" || Number(request.number) !== event.number) continue;
    if (command.type === "merge") { request.mergeRequested = true; request.mergeRequestedAt ||= at; }
    if (command.type === "recover") request.recoverRequested = true;
    if (command.type === "approve" && (request.headSha || request.sourceSha) === command.sha) { request.approvedSha = command.sha; request.approvedDiffSha = options.diffSha || null; request.approvedBy = intent.approvedBy; request.approvedViaApp = null; }

  }
  return next;
}
