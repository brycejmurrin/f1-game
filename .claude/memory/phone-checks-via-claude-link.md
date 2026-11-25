---
name: phone-checks-via-claude-link
description: "Bryce wants every phone/device check run over CLAUDE LINK (the phone bridge), with the orchestrator driving and posting results"
metadata:
  node_type: memory
  type: feedback
  modified: 2026-11-25T03:10:00Z
---

Bryce (2026-11-24 ~21:50Z): "I want to use Claude connect for any phone checks."
"Claude connect" means CLAUDE LINK, the phone bridge (skill `phone-bridge`: an open bridge issue, `?apex=1&bridge=<n>`).

**Why:** a manual checklist with paste-ready comments is slow for him, and the results come back unstructured. Over the bridge, the orchestrator reads the game's own state (render path, DPR, frames, physState, viewState) and posts the evidence itself.

**How to apply:**
- ONE device-check window per wave (Bryce picked retro item 9, 2026-11-25 ~02:47Z; ~35 of his 115 prompts on 2026-11-24 were link plumbing): collect every pending device check of the wave, then run them all in a single hands-off bridge run (`drive`, #6425) — one bridge issue, ONE link, one ask naming the physical actions and when. Never a link session per PR.
- Read the outcome with bridge commands (`call info/physState/viewState/perf`, `frames`, `snap`), then post the `device check:` comment on each PR yourself, with the hello's sha and the numbers.
- Only the purely tactile part is his: feel, a finger on the glass, a second device or a controller.
- The bridge URL opens in a Safari tab, whose settings are separate from the Home Screen app's. When Bryce switches to the Claude app on the same phone, iOS suspends the Safari tab, so a command sent then waits until Safari is back in front. Ask him to keep Safari in front during a run.

Related: [[user-plays-on-phone]], [[bryce-iphone-tlx-webgpu]], [[orchestrator-questions-via-tool]].
