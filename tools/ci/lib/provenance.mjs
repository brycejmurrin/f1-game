// provenance.mjs — "did Bryce decide this": a GitHub label event or comment is the owner's only when its actor is the
// owner AND it was not performed through a GitHub App. byAgent names the other kind (owner login through the Claude
// app), which only the config row's routine paths accept (#5455).
// @doc Provenance of GitHub label events and comments: byOwner (owner, no app), byAgent, decision: comments, label events.
// @section runner
// @skill steward
//
// Why (docs/plans/2026-11-03-agent-surface-reset.md §4.3): every agent in this repo writes to GitHub as `brycejmurrin`
// through the Claude GitHub App, so the login alone proves nothing. The one field that separates Bryce's own click on
// GitHub Mobile from an agent's write is `performed_via_github_app`: null on his clicks, the app object (`claude`) on
// agent writes. Verified on this repo's events 2026-11-03 (plan §4.1 "Platform facts"). A grant is therefore a label
// event or a `decision:` comment that passes `byOwner`; a quoted relay of his words in a PR body or comment is not.
//
// Readers: tools/ci/dispatch.mjs (`priority`, `dispatch:pause`, `dispatch:merge-pause`, clearing `needs-decision`)
// and tools/ci/merge-gate.mjs (the `hold` and `config` rows). Issue events and issue comments share the fields read
// here: the actor (`actor` on an event, `user` on a comment) and `performed_via_github_app`.
//   https://docs.github.com/en/rest/issues/events#list-issue-events
//   https://docs.github.com/en/rest/issues/comments#list-issue-comments
// Every function is pure except readIssueEvents / readIssueComments, which take the GitHub client as an argument.
import { api as githubApi, REPO } from "../github-api.mjs";

/** The repository owner whose clicks and `decision:` comments are grants. tools/ci/dispatch.json `owner` overrides. */
export const OWNER = "brycejmurrin";
/** Rows per list page; a page shorter than this is the last one. */
export const PAGE_SIZE = 100;
/** `decision:` at the start of a comment (case-insensitive, leading whitespace allowed): Bryce's one-channel answer. */
export const DECISION_RE = /^\s*decision:/i;

/** The login that performed an event or wrote a comment (`actor` on an event, `user` on a comment). Pure. */
export const actorOf = (evt) => evt?.actor?.login ?? evt?.user?.login ?? null;

/** Did `owner` perform this event or write this comment, in person (no GitHub App)? The API always sends
 *  `performed_via_github_app`; a row without the field (or with any non-null value) is not the owner's. Pure. */
export function byOwner(evt, owner = OWNER) {
  if (!evt || !owner) return false;
  return actorOf(evt) === owner && Object.hasOwn(evt, "performed_via_github_app") && evt.performed_via_github_app === null;
}

/** The GitHub App slug every agent in this repo writes through (the Claude GitHub App). */
export const AGENT_APP_SLUG = "claude";

/** Did an agent perform this event: the owner's login AND `performed_via_github_app.slug` is AGENT_APP_SLUG? GitHub
 *  cannot tell one Claude session from another (the orchestrator, a PR's own worker), so this proves "an agent", not
 *  which one. Only merge-gate's config row reads it, for ROUTINE config paths (#5455). Pure. */
export function byAgent(evt, owner = OWNER) {
  if (!evt || !owner) return false;
  const app = evt.performed_via_github_app;
  return actorOf(evt) === owner && !!app && typeof app === "object" && app.slug === AGENT_APP_SLUG;
}

/** Was this comment edited after it was posted (`updated_at` later than `created_at`)? Pure. */
export const isEdited = (c) => !!c?.updated_at && (Date.parse(c.updated_at) || 0) > (Date.parse(c.created_at || "") || 0);

/** Why an event is not the owner's, for a gate's evidence line: "<login> via app <slug>" / "not the owner". Pure. */
export function describeActor(evt) {
  const who = actorOf(evt) || "unknown";
  const app = evt?.performed_via_github_app;
  return app ? `${who} via app ${app.slug || app.name || "?"}` : who;
}

/** An unedited comment by the owner in person whose body starts with `decision:`. Pure. */
export const isDecisionComment = (c, owner = OWNER) => byOwner(c, owner) && !isEdited(c) && DECISION_RE.test(String(c?.body || ""));

/** The `labeled` / `unlabeled` events for one label, in the order given (the API lists oldest first). Pure. */
export const labelEvents = (events, label) => (events || [])
  .filter((e) => (e?.event === "labeled" || e?.event === "unlabeled") && e.label?.name === label);

/** The label events for `label` the owner performed in person. Pure. */
export const ownerLabelEvents = (events, owner = OWNER, label) => labelEvents(events, label).filter((e) => byOwner(e, owner));

/** The newest `labeled` / `unlabeled` event for `label` (by created_at, then list order), or null. Pure. */
export function newestLabelEvent(events, label) {
  const t = (e) => Date.parse(e?.created_at || "") || 0;
  let best = null;
  for (const e of labelEvents(events, label)) if (!best || t(e) >= t(best)) best = e;
  return best;
}

/** Is `label` currently on `labels` AND was it last ADDED by the owner in person? A label with no fetched events
 *  (`events` null/undefined) is not honoured: provenance unknown is not a grant. Pure. */
export function ownerSet(labels, events, label, owner = OWNER) {
  const names = (labels || []).map((l) => (typeof l === "string" ? l : l?.name)).filter(Boolean);
  if (!names.includes(label)) return false;
  const e = newestLabelEvent(events, label);
  return !!e && e.event === "labeled" && byOwner(e, owner);
}

const pathFor = (repo, tail) => (!repo || repo === REPO ? tail : `https://api.github.com/repos/${repo}/${tail}`);

/** Every page of a list endpoint through the repo's GitHub client → { rows } | { error }. A full last allowed page
 *  is an error: rows past it (the newest, on an oldest-first list) would be unseen. */
function readAll(pathQs, { request = githubApi, maxPages = 10 } = {}) {
  const rows = [];
  for (let page = 1; page <= maxPages; page++) {
    const r = request(`${pathQs}${pathQs.includes("?") ? "&" : "?"}per_page=${PAGE_SIZE}&page=${page}`);
    if (r?.error) return { error: r.error };
    const batch = Array.isArray(r?.json) ? r.json : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return { rows };
  }
  return { error: `more than ${maxPages} pages of ${PAGE_SIZE}: the list is truncated` };
}

/** The issue/PR's events (labeled, unlabeled, closed, … oldest first), every page. { events } | { error }. */
export function readIssueEvents(repo, n, opts = {}) {
  const r = readAll(pathFor(repo, `issues/${n}/events`), opts);
  return r.error ? r : { events: r.rows };
}

/** The issue/PR's comments (oldest first), every page. { comments } | { error }. */
export function readIssueComments(repo, n, opts = {}) {
  const r = readAll(pathFor(repo, `issues/${n}/comments`), opts);
  return r.error ? r : { comments: r.rows };
}
