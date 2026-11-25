---
name: phone-checks-via-claude-link
description: "Bryce wants every phone/device check run over CLAUDE LINK (the phone bridge), with the orchestrator driving and posting results"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-25T01:30:00Z
---

Bryce (2026-11-24 ~21:50Z): "I want to use Claude connect for any phone checks."
"Claude connect" means CLAUDE LINK, the phone bridge (skill `phone-bridge`: an open bridge issue, `?apex=1&bridge=<n>`).

**Why:** a manual checklist with paste-ready comments is slow for him, and the results come back unstructured. Over the bridge, the orchestrator reads the game's own state (render path, DPR, frames, physState, viewState) and posts the evidence itself.

**How to apply:**
- For every PR or issue with a phone device check, plan a bridge session: open or reuse a bridge issue, give Bryce ONE link, and say exactly which physical action to do and when. Once the bridge's `nav`/`tap` commands are live (PR #6389), drive the menus yourself.
- Read the outcome with bridge commands (`call info/physState/viewState/perf`, `frames`, `snap`), then post the `device check:` comment on each PR yourself, with the hello's sha and the numbers.
- Only the purely tactile part is his: feel, a finger on the glass, a second device or a controller.
- **Hands-off (Bryce 2026-11-25 ~00:44Z):** "I can't leave my game session on phone to come back and tell you anything."
  Never ask him to report back mid-run. Give ONE link plus the full steps up front, detect the link from the hello
  yourself, read every outcome with bridge commands, and post the results. Anything he must do (drive into the box,
  confirm a dialog) is a gap in the bridge to close, not a step for him: he asked that Claude Link "drive the whole
  game" (bridge `drive` + broad allow-list, no eval: his pick of "Broad allow-list" over full eval).
- **Desktop too (2026-11-25):** the same bridge works on his MacBook. Browser tab: `?apex=1&bridge=<n>`. Installed
  app: SETTINGS › CLAUDE LINK… with the issue number. Use one issue per device when running in parallel. The window
  must stay in front: Chrome throttles a covered window (0 frames, or 30 Hz rAF), so frame numbers from a run where
  he switched windows are void.
- The bridge URL opens in a Safari tab, whose settings are separate from the Home Screen app's. When Bryce switches to the Claude app on the same phone, iOS suspends the Safari tab, so a command sent then waits until Safari is back in front. Ask him to keep Safari in front during a run.

Related: [[user-plays-on-phone]], [[bryce-iphone-tlx-webgpu]], [[orchestrator-questions-via-tool]].
