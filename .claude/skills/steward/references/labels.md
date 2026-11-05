# Queue intent labels

The complete catalog is `.github/labels.json`; semantics, provenance, commands and shadow rollout are in
`docs/ACTIONS.md` §Labels. The three supported names are `queue:ready`, `queue:paused` and `queue:priority`.

Add one label with the additive GitHub API rather than replacing the whole list. MCP `issue_write.labels`
replaces all labels and may accidentally clear a pause. An owner-established pause is sticky until the owner
resumes it; an app acting under the owner's login cannot supply owner-direct provenance.

Labels never prove ownership, validation or approval. The ledger records these facts. New issues have no default
queue label. In shadow mode, do not migrate labels or claim that intent changes launched work.
