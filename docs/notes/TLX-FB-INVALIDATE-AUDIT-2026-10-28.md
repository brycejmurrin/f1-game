# FB-invalidate audit after resolve (2026-10-28)

Issue #2649 remaining slice: whether three's WebGL backend (and our post/shadow paths) leave unread
attachment stores on a tile GPU after resolve.

## Already answered (code + prior notes)

| site | mechanism | reader when discarded |
|---|---|---|
| Scene depth | `depthEnd()` → `invalidateFramebuffer(DEPTH)` (WebGL2) or `apexDiscardDepth` (WebGPU patch 17) | none this frame (`needsDepth` false) |
| Scene ssrTag | same path, `COLOR_ATTACHMENT1` / `apexDiscardColor` bit | none this frame (`needsTag` false) |
| MSAA resolve | three WebGLBackend invalidates the multisample FBO after blit (~1640/1665 upstream) | resolved single-sample holds the keep |
| Shadow R8 colour | `discardColor` after depth pass (WebGL2); `apexDiscardColor` (WebGPU) | only PCSS sun colour is read |
| Mirror depth + tag | `post.discardAttachments(mirRT, …)` from `tlx.js` | HUD inset reads colour only |

## Post ping-pong (SSAO / godray blur / bloom)

`runPass` sets `renderer.autoClear = !load` and every overwrite pass uses `load === undefined/false`, so three
issues a **Clear** loadOp, not a Load, for SSAO/godray blur pairs and bloom DOWN/bright. On a tile GPU that is
the same bandwidth win as an invalidate of the previous contents: the prior colour is never reloaded. Additive
bloom UP passes intentionally load (`runPass(..., true)`). No extra `invalidateFramebuffer` on those colour-only,
depth-less targets after V-blur: the FBO that still holds the unread blur buffer is no longer bound, and the
next H pass clears it on bind.

## Header drift fixed

`tlx-post.js`'s SCENE MSAA comment claimed "No invalidateFramebuffer either"; that predated A-P1/A-P2. The
comment now points at `depthEnd` / discardHint and this note.

## Verdict

**Audit complete — no further invalidate call sites owed for #2649.** Remaining bandwidth trims are format/size
(godray11, depth-only shadow on r187), not missing DontCare stores on the resolve path.
