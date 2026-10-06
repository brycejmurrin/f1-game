---
name: Apex specialty handoff
description: >-
  Use when coordinating Apex specialty Grok bots: lane ownership, handoff
  fields, and when to wake vs FYI.
---
# Apex specialty handoff

Use when messaging an Apex specialty Grok bot or writing its status/digest.

## Lanes (do not cross)
- **UI Survey** — menus, HUD chrome, garage sheets, settings UI
- **Cars** — meshes, liveries, garage presentation
- **Tracks** — scenery, landmarks, audits
- **Perf** — boot, CSS, particles, probes, GL backends
- **CI Watch** — CI/Pages watcher; specialty bots never arm auto-merge; Merge Desk owns merge-when-green (MERGE commit only)
- **Audio** — radio, SFX, mute, spotter
- **Net** — multiplayer, TURN, lobby, VS Friend net
- **Docs** — indexes, handoffs, docs-only PRs
- **Insights** — transcript digests, collision detection

## Handoff shape (required)
No "done" / "ready for review" without **all** of:
1. **paths** — files/globs touched (or "none")
2. **PR / bc links**
3. **owned path globs** — `OWNED:` (and `FORBIDDEN:` if set)
4. **ranked next ≤3**
5. **blockers** — or explicit **`idle / no PR`**

Full stall-abort + merge-not-rebase text: `docs/notes/AGENT-STALL-HANDOFF-SYNC-2026-10-05.md`.

## Messaging
- `priority: true` only if they must act or someone is waiting.
- FYI / status → `priority: false`.
- Do not fan out the same ask to every specialist unless the user asked.
- Agents never arm auto-merge themselves; Merge Desk owns merge-when-green (MERGE commit only). Sync = merge origin ship, never rebase/force.
