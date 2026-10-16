---
name: merge-method-verify-parents
description: "A merge_pull_request call with merge_method \"merge\" can still land as a squash; verify the merge commit has two parents"
metadata:
  node_type: memory
  type: project
  originSessionId: e5b0c8b0-1941-5851-8b48-3b95216dc5b6
  modified: 2026-10-14T21:54:53.596Z
---

On 2026-10-14 #1743 was merged through the GitHub MCP `merge_pull_request` with `merge_method: "merge"` and
`expectedHeadSha`, and GitHub returned a single-parent squash commit (b699da32a). The same call produced a real
merge commit for #1490 that morning. The repo allowed merge, squash and rebase at the time
(`gh api repos/brycejmurrin/f1-game` → all true), so nothing on GitHub's side refused a squash.

**Why:** AGENTS.md requires merge commits only ([[pr-auto-merge]]); a squash cannot be undone without a force-push.

**How to apply:** after any merge, run `git log --format="%h %p" -1 <sha>` and confirm two parents; report a
squash to the user at once. The durable fix is the owner turning off "Allow squash merging" and
"Allow rebase merging" in the repo settings — suggested to Bryce 2026-10-14, his call.
