# B·D3 aero design preview — handoff (round 1, 2026-10-19)

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
