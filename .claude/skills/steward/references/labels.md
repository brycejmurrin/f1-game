# PR queue labels

The complete catalog is `.github/labels.json`: `queue:paused` and `queue:priority`, both on PRs. Ready PRs queue
validation automatically; explicit `/apex merge` authorizes the landing request. Neither label launches a coding
agent or adds test work. Commands, provenance and shadow rollout are defined in `docs/ACTIONS.md`.

Use additive label APIs rather than replacing the whole list. MCP `issue_write.labels` replaces labels and may
accidentally clear a pause. An owner-established pause stays until the owner resumes it through an authoritative
action. An app using the owner login cannot grant owner-direct priority, resume or exact-head approval.
