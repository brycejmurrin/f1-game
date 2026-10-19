---
name: preview-must-look-different
description: Design-variant preview sheets must visibly differ in the picture itself; mm metrics are not enough
metadata:
  node_type: memory
  type: feedback
  originSessionId: 906201f1-dc4e-5e9e-926d-5f0ea39f1e1f
  modified: 2026-10-18T06:57:16.555Z
---

When sending Bryce a sheet of new designs (parts, bodies, finishes), each variant must look clearly different in the image he sees on his phone. A geometry metric (parts-sweep "OK", 25–300 mm) is not evidence.

**Why:** 2026-10-18 he stopped a commit with "Wait review those screenshots they all look the same". Whole-car stills of the 24 STYLE parts and 17 body styles changed only ~1–7% of pixels against each other, though every one passed the sweep.

**How to apply:** before sending a sheet, pixel-diff the shots against the baseline (PIL, % of pixels changed). Frame each variant on the part that changes (close-up per category), and make the design itself bolder when even the close-up barely differs. Say plainly when a batch is subtle. Related: [rejected design hold immediately](../rules/fleet-core.md).
