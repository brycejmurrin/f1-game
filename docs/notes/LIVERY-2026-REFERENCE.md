# 2026 launch liveries — what is sourced, and what is not

Written 2026-09-08, after adding the ENGINE COVER colour zone (`liv.cover`) and
giving Ferrari a white cover and Mercedes a silver one from the owner's own
launch photographs. The question this note answers: **which other teams should
get a cover colour?** The answer, for now, is **none** — and this note exists so
the next session does not redo the research to reach the same conclusion.

## The blocker

Direct page fetches are egress-blocked in this container: formula1.com,
williamsf1.com, mclaren.com, motorsport.com, skysports, racefans and Wikipedia
all refuse. **No launch photograph was inspected for any team below.** Every
line here is search-result summary text quoting those articles, and no team
publishes hex values, so any colour would be a name-to-hex guess. That is not a
standard worth committing as the shipped look of a car.

## Findings

| team | cover | why we did nothing |
|---|---|---|
| Audi | sourced DISTINCT: carbon black over titanium silver | **Our Audi is a BLACK car** (`#0E0F10`, deliberate, commented in js/data/teams.js). A black cover on a black car is invisible; matching the source would mean flipping the BODY to silver, which contradicts a decision another session made and documented. Left alone: one search summary is not enough to overturn that. **Worth resolving with a photograph.** |
| McLaren | sourced DISTINCT: black sweeps across the cover | **Already modelled.** McLaren's team livery carries `spineLogo: "panel"` — "a hard-edged panel down the crown with a raked leading edge" — over an anthracite `c2`. That IS the black cover sweep. |
| Williams | **RESOLVED: black** — applied | See "What the photograph settled" below. The white-cover claim was wrong. |
| Aston Martin | "darker airbox" over satin green | Real but unnamed. Could be near-black or a deep green; no source picks one. |
| Alpine | — | No source addresses the cover at all. |
| Racing Bulls | same as body (white) | Blue *streaks* on the cover, not a cover colour. |
| Haas | same as body (white) | The cover is named only as a branding location. |
| Red Bull | same as body (gloss blue) | Already carries its own treatment (`spineLogo: "wrap"`, `spineHeight: "dorsal"`, `finShape: "none"`). |
| Cadillac | body is split LEFT/RIGHT | The cover follows a black/white split down the centreline. **We cannot express this**: the livery model has no per-side body colour. A real feature request, not a colour. |

## What the photograph settled (Williams)

The first pass could not open a launch gallery and left Williams as the
highest-risk entry. A second pass got at the images through a REMOTE browser
(the container's own egress proxy denies these hosts by organization policy, so
neither a direct download nor a local browser can reach them). Two things came
out of it.

**A wrong answer that announced itself.** The first automated look reported a
white engine cover — while describing a white, green and navy car built as a
tribute to the 1981 FW07C. That is a special-edition livery, not the gloss-blue
2026 launch car, so the answer was discarded. The lesson is cheap and worth
keeping: when asking a tool to read an image, make it describe what it sees, not
just answer the question, or a confident answer about the wrong car looks
exactly like a right one.

**Then the actual launch photograph, on the official article.** The engine cover
reads BLACK, not white. That agrees with the official release's own wording — "a
flowing section of black, sweeping from the chassis side through to the rear of
the car, framed by an iconic red and white keyline" — while the white is listed
only "across the sidepod, front wing and rear wing". So the secondary source
claiming a white cover is contradicted twice over, and Williams now carries
`cover: [0.055, 0.058, 0.070]`.

Residual uncertainty, recorded rather than hidden: "from the chassis side"
could describe black running along the FLANK rather than over the crown, and
this model has separate fields for those (`cover` vs `spineSide`). The
photograph reads the crown as black, so the cover is where it went; a top-down
shot would settle it beyond doubt.

## If someone picks this up

The launch galleries that would settle Williams, Aston Martin and Alpine exist
(formula1.com "GALLERY: every angle of…", media.alpinecars.com) and need a
session whose fetch reaches them, or an owner-supplied photograph — which is
exactly how Ferrari and Mercedes got theirs, and why those two are the only
covers in the tree.
