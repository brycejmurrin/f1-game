# B·D3 aero design preview — handoff (round 2, 2026-10-19)

## Round 2 (B·W6·D3b, branch @ bd6b3506) — fit pass done
- Every suspect join below was measured and fixed (js/car/car3d.js preview builders only); numbers per part in
  fit/fit.json and the gallery's Fit check section. Probe: `node fit-joints.mjs <id> all` (per-component contact /
  gap / buried, all 11 chassis; 0 floating groups now), `node fit-teams.mjs` (seat surfaces per team).
- L22 audit: `scratch/l22/` holds tools/car/car-fit-audit.mjs + lib (from cursor/fit-audit-420b); copy into
  tools/car/ to run, then MOVE OUT before committing (tools/README guard). `--base` with explicit preview
  --styles throws in plan() on the base tree; compare instead with fit-audit-compare.py (preview vs its clone row,
  failures within 4 cm of the part): 0 NEW except x_wings pylon foot PENETRATION 28-50 mm, which direct rays put
  at 3-7 mm — reported to L22 as a calibration case.
- Round-1 frames are recovered from the artifact into r1/ (bases unchanged); run-studio-r2.sh reshoots changed ids.
- Round 3 ideas: monkey_seat still 0.01 % from the side (endplates hide it): try plates outboard/taller or move it
  aft-and-down under the main plane like W05; spoon_wing still under the flat flap (#3116 owns it).


- Gallery (living, republish to the SAME url): https://claude.ai/artifact/14NZUdiTMpNKRTu4u9ZP3m
  From a new session: Artifact publish with `url` set to that link (read it first).
- Branch: cursor/design-preview-aero-a3e7 (throwaway, NO PR). Fields default off; the 11
  factory cars hash bit-identical to the base (grid-before.json == grid-after.json).
- Candidates (stable ids): x_wings(xwing) bridge_wing(fwBridge) double_diffuser(floor ddiff)
  beam_twin(beam2) spoon_wing(rwSpoon) monkey_seat(monkey). Code: js/car/car3d.js (grep the
  field names), rows tagged PREVIEW in js/car/parts.js, test tests/unit/aero-preview-fields.test.mjs.
- Rebuild a round: python3 -m http.server 3456 &; bash run-studio.sh (skips ids already
  captured: delete studio/<id> to reshoot); python3 diff.py; update the Round block and
  ranking (round-1 step is in the commit history; template gallery-template.html ->
  gallery-template.built.html); python3 build-gallery.py; publish aero-preview.html.
  Images are gitignored: reshoot after a container loss.
- Round 2 ideas: monkey_seat is hidden (side diff 0.00 %), make it larger/higher;
  spoon_wing hides under the flat active-aero flap (owned by B·W3·L11 #3116; do not touch
  car3d.js ~1883); bridge_wing could sit higher over the nose. Wikimedia 429'd: fetch the
  Brawn/MP4-23 refs listed in refs/manifest-front.json; no real Tyrrell 025 photo on Commons.

## Suspect joins for the FIT pass (from the builder numbers in car3d.js; NOT measured — run tools/car/fit-audit.mjs)
Frames: studio/<id>/{q34,side,top,phone}.png (regenerate with run-studio.sh).
- x_wings: pylon box (x ±0.62, y 0.57–0.87, z −0.02) is not seated on the sidepod top surface (may float or bury); the
  two end fences (x ±0.47/±0.77, y 0.845–0.915) only touch the winglet plate by its thickness. Frames: side, q34.
- bridge_wing: strut bottoms end at y 0.14 at z 2.16–2.42, likely floating above or cutting the cascade elements;
  the bridge foil (y 0.455–0.49) may clip the nose top on long-nose teams (TEAM_STYLE noseTipZ/noseDroop). Frames: q34, side.
- beam_twin: side mounts (x ±0.445) are free-standing, not tied to the rear endplates (x 0.50); upper-beam tips
  (half 0.42) stop ~2.5 cm short of the mount; lower beam (y 0.455–0.48, z −2.28..−2.44) may cut the diffuser
  ceiling and the crash-structure loft. Frames: q34, side.
- double_diffuser: upper ceiling sits 0.035 above the main ceiling and overlaps the strakes and the exit gurney bar
  (likely z-fight / interpenetration); feed-slot boxes at z −1.96 float at the throat. Frames: q34, top.
- monkey_seat: pylon (y 0.54–0.74, z −2.08..−2.16) runs into the crash-structure loft and rain-light housing; plates
  are buried inside the rear-wing assembly (side Δ 0.00 %). Frames: q34, top.
- spoon_wing: tapered, dropped main-plane tips meet the endplate over a shorter chord than the plate slot, and the
  flat active-aero flap above leaves an uneven slot gap toward the tips. Frames: q34, top.
