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
- **CI Watch** — sole merge pacer, Actions, Pages
- **Audio** — radio, SFX, mute, spotter
- **Net** — multiplayer, TURN, lobby, VS Friend net
- **Docs** — indexes, handoffs, docs-only PRs
- **Insights** — transcript digests, collision detection

## Handoff shape (required)
1. Paths (shots, plans, digests)
2. PR / bc links
3. Ranked next ≤3
4. Blockers

## Messaging
- `priority: true` only if they must act or someone is waiting.
- FYI / status → `priority: false`.
- Do not fan out the same ask to every specialist unless the user asked.
