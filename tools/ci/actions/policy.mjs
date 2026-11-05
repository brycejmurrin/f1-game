// @doc Classify supported queue events and parse the small public command vocabulary.
/** Pure event admission and the deliberately small public control vocabulary. */
export const LABELS = Object.freeze({ paused: "queue:paused", priority: "queue:priority" });
export const CONTROL_ISSUE = 3899;
export const namesOf = (x) => (x?.labels || []).map((l) => typeof l === "string" ? l : l.name);
export const isBot = (x) => x?.type === "Bot" || /\[bot\]$/i.test(x?.login || "");

/** Missing provenance is unknown, never an owner grant. */
export function byOwner(event, owner = "brycejmurrin") {
  return !!event && (event.actor?.login || event.user?.login) === owner
    && Object.hasOwn(event, "performed_via_github_app") && event.performed_via_github_app === null;
}

export function parseCommand(body = "") {
  const text = String(body).trim();
  if (/^\/apex (merge|recover)$/.test(text)) return { type: text.slice(6) };
  const approval = /^\/apex approve ([a-f0-9]{40})$/i.exec(text);
  if (approval) return { type: "approve", sha: approval[1].toLowerCase() };
  const pause = /^\/apex (pause|resume) (validation|merges|all)$/.exec(text);
  if (pause) return { type: pause[1], scope: pause[2] };
  return null;
}

/** Cheap webhook filtering. No reads, labels that are merely taxonomy admit no work. */
export function classifyEvent(eventName, payload = {}, { controlIssue = CONTROL_ISSUE } = {}) {
  const item = payload.pull_request || payload.issue;
  const number = Number(item?.number || payload.number) || null;
  const no = (reason) => ({ relevant: false, kind: "ignored", number, reason });
  if (!["schedule", "workflow_run", "workflow_dispatch"].includes(eventName) && (isBot(payload.sender) || isBot(payload.comment?.user))) return no("projection/bot event");
  if (eventName === "issue_comment") {
    if (payload.action !== "created") return no("only new commands are accepted");
    const command = parseCommand(payload.comment?.body);
    if (!command) return no("not a command");
    const pr = !!payload.issue?.pull_request;
    if (["pause", "resume"].includes(command.type) && (pr || number !== controlIssue)) return no("global switch belongs on control issue");
    if (["merge", "recover", "approve"].includes(command.type) && !pr) return no("PR command on an issue");
    return { relevant: true, kind: "command", number, command };
  }
  if (eventName === "issues") return no("issues are not validation requests");
  if (["pull_request", "pull_request_target"].includes(eventName)) {
    if (["labeled", "unlabeled"].includes(payload.action)) {
      const label = payload.label?.name;
      if (!Object.values(LABELS).includes(label)) return no("taxonomy or retired label");
      return { relevant: true, kind: "label", number, label, action: payload.action };
    }

    if (["opened", "synchronize", "reopened", "closed", "ready_for_review", "converted_to_draft"].includes(payload.action)) return { relevant: true, kind: "pr", number };
    return no("PR metadata does not enqueue validation");
  }
  if (["schedule", "workflow_dispatch"].includes(eventName)) return { relevant: true, kind: "reconcile", number: null };
  if (eventName === "workflow_run" && payload.action === "completed") return { relevant: true, kind: "completion", number: null };
  return no("unsupported event");
}
