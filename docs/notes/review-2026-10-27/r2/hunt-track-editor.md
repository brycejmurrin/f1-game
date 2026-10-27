# R2 Opus hunt: js/track, js/circuits, js/editor
F1 MED js/editor/validate.js:217-231 — pit-opening check (pitReach 13.1 m) runs over every close pair on the lap, ignoring pit window and side: hairpin straights 24-27 m apart anywhere get RED "pit opening crosses" and block SAVE/RACE/SHARE. Gate on the pit window around s=0 (+ side). CODE-TRACED
F2 low validate.js:228-233 — clearance loop stops at the first matching pair (sorted by raw distance, thresholds differ), so a closer amber pair masks a farther red. Report the most severe. CODE-TRACED
F3 low dead validate.js:87 — slice(0, max(3, min(n,3))) is slice(0,3). PLAUSIBLE
Clean: codec↔storage round trip, TrackShape Dubins/menger, spline project grid, TrackSpace full lap, previewKey.
Not covered: designer.js (R1 G1 stamp bug lives there), canvas/insight/fixes/stamps…, track/core mesh/geom/line/surface, scenery/, circuits.
