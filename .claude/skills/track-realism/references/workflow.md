# Research and author multiple circuits

## Contents
- Establish the baseline
- Build a dated reference packet
- Divide ownership and schedule
- Add detail that carries the place
- Acceptance and handoff
- Skill format references

## Establish the baseline

Choose the actual event/layout/year. A permanent circuit, temporary F1
installation and historic layout can differ. Inspect the current brief
(`docs/tracks/<id>.md`) and code before trusting either; refresh durable findings in the circuit brief or
PR. Per-session logs, downloaded imagery and captures stay in `scratch/` or
`artifacts/`, not committed reports.

Record starting SHA, built road length, corner sequence, width, elevation
range and grade windows, sector/start offsets, required landmarks and mesh
cost. Evaluate the **built** road: a normalized raw-outline comparison can
hide scale, start-line, smoothing, elevation and corner errors. State sampling
method and confidence. A grade over 40 m is not interchangeable with an
operator's approximate instantaneous gradient.

The parent uses the existing survey/capture tools for a wide context view,
driver approach and close orbit of each changed landmark. Save exact camera,
renderer, viewport, weather, light settings and model/material readiness.
Screenshots are visual review; use geometry/probe data for assertions.
Repeat these settings after changes. A stale promotional still is not a
baseline of the current SHA.

## Build a dated reference packet

Prefer circuit operators and FIA event documents for layout and changes;
architects/contractors for building dimensions; dated aerial photography,
track walks and onboard footage for visible relationships. Check current
public sources with available web tools. Collect images or page screenshots
and inspect them before asserting what they show. Record canonical URL,
publisher, publication date or unknown, reference era, retrieval date, exact
image URL, local artifact and the claims each source supports.

Identify turn/straight, side, viewing direction and recognizable landmarks.
Separate measured facts, inferred relationships and proposed design. Maps
may be schematic; architectural renders may depict an unbuilt proposal;
inauguration portraits may show no useful structure. Satellite tiles can mix
dates. Seek corroboration when images disagree. Do not infer unseen dimensions
or treat a photograph's filename as a verified publication date.

For layout, register reliable plan data to game coordinates using fixed
metre scale and known anchors, then compare road edges, apexes and runoffs.
For height, seek an official survey or suitable DEM/LiDAR with known datum,
resolution and licence. Photos support relative height and silhouette;
perspective alone does not supply a precise elevation profile.

Keep reference photographs separate from reusable game assets. Do not import
a research screenshot as a texture by default. Imported models/textures need
supported provenance/licensing and the asset-pack verification path.

## Divide ownership and schedule

| Work | Owner | May run in parallel |
|---|---|---|
| Public-source research and source-only audits | Circuit researchers | Yes |
| `js/circuits/<id>.js` + `js/circuits/scenery/<id>.js` | One author per circuit pair | Disjoint pairs, outside a live run in that checkout |
| Track engine, new definition fields, landmark registry | Named integration owner | Read-only review; dependent edits wait |
| Asset importer, pack manifest/binaries, renderer support | One shared-model owner | Separate from circuit pairs |
| Tests, baselines, generated files, workflow/catalog | Parent | Integrate centrally |
| Captures and browser verification | Parent only | Serial locally |

Pin each task's SHA and paths. Children return edits plus evidence; they request
shared changes rather than quietly editing shared contracts. Do not give two
authors the same pair. Use the existing frame-aware helpers: control-point
index fractions and built racing arc fractions are different; apply the
scenery shift exactly once. Shared new fields must survive definition copying.
Corner metadata can also affect bank-zone reseating, generated braking boards
and authored aero-zone turn pairs. Re-key dependent tables when corner numbers
change and prove their intended runtime intervals. Compare built road/banking
arrays when correcting labels. Run both aero-table resolution and interval
equivalence checks: a stale pair can still resolve successfully to the wrong
straight. Unchanged
control points alone do not establish unchanged geometry. Number physical
bends from the event map, since one hairpin can have multiple curvature peaks.
Do not assume symmetric narrowing-only width zones model asymmetric widening.

First research independent circuits and shared models concurrently. Reconcile
3–5 changes per circuit; land prerequisite shared contracts before dependent
authors proceed. Integrate one small batch, finish source edits, then freeze
`js/`, `css/`, `assets/pack/` and other shared runtime inputs in the checkout
while the parent captures/tests. Other agents
can interpret artifacts or research the next batch. A separate worktree must
start at the intended current SHA and must not own shared-contract edits.
Avoid CPU-heavy VM audits beside software-rendered captures. Parallel authoring
does not authorize simultaneous local browsers or another session's CI cancel.

## Add detail that carries the place

Fix road shape, elevation, terrain continuity and landmark placement before
small props. Focus on silhouettes seen while driving. Use actual forest edges,
clearings and species mix instead of a uniform ring of identical trees.
Make a bounded set of conifer/broadleaf crown variants with deterministic
scale/tint/lean. Reuse instance recipes; do not create a key per tree. Spend
detail near selected approaches and reduce it with distance. Verify an existing
distance/LOD path first; new model LOD or detail culling is shared renderer work.
Check wind,
shadow and renderer parity instead of assuming imported foliage inherits sway.

For buildings, establish footprint, height, continuous roofline, seating rake,
support rhythm and glazing before signage and furniture. Repeated bays should
share geometry. Ground long structures/supports individually along slopes;
one anchor can leave the opposite end floating. Route glass through the
dedicated reflective glass buffer/pass; `MAT.GLASS` alone does not establish
that draw path. Do not assume transparency support.
Preserve required hero ids and their sightlines.

Inspect current asset capabilities before choosing a source model. The current
AX26 pipeline is material/triplanar oriented; UV leaf cards, alpha cutouts and
embedded multi-LOD glTF scenes are not automatic drop-in improvements. Flattening
all LODs can render overlapping trees. Opaque low-poly crowns are a practical
first step; cutout foliage needs explicit importer, shadow and backend support.
Check that a synthetic rebake preserves imported catalogue entries before
using it on a mixed pack. Verify loaded baked models and fallback appearance.

Set **incremental** per-circuit budgets from measured baseline and visibility:
fused vertices/triangles, canonical model vertices, recipe keys, live batches,
actual instances, glass/water cost and pack bytes. State replacements/savings.
Use graph node counts for fused VM instances; an `instancedOnly` batch list
can legitimately be empty there. Measure actual live batches separately.
Do not substitute a VM's fallback prop counts for live baked-model upload cost,
or claim target-GPU frame rate from SwiftShader captures.
Terrain rail positions alone do not prove that interpolated grounding remains
unchanged between rails. Check retained foreground tree ranks and complete
building support bounds in matched views; a lower prop count can mean that
placement guards dropped scenery rather than that a model became cheaper.

## Acceptance and handoff

Choose 3–5 observable criteria, backed by evidence ids. Require finite geometry,
correct landmark side/orientation, continuous ground, supported structures,
clear driving sightlines and agreement between visible boundaries/collision.
Name before/after discrepancies, exact audit deltas and remaining uncertainties.
Existing audit caps are regression ratchets, not a licence to add defects.

Children run the appropriate offline checks only, including
`node tools/track/verify-track.cjs <id>` for circuit edits, and report browser evidence unverified. Parent selects the most
specific foundation/subsystem specs and runs the existing validation ladder;
broaden only when shared geometry or new failures require it. Keep source,
offline-contract, rendered and native-device evidence separate. Update the
packet at the integrated SHA, then put status and not-run coverage in the draft
PR using the repository template. Do not merge or publish as part of this skill.

## Skill format references

Checked 2026-10-04: [Agent Skills specification](https://agentskills.io/specification)
for frontmatter and progressive disclosure; [Claude Code skills](https://code.claude.com/docs/en/skills)
for project discovery, invocation and fork semantics. Repository AGENTS.md
and the existing linked skills govern local ownership and verification.
