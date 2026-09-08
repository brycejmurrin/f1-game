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
| Williams | claimed white cover | The one secondary source asserting it is contradicted by omission: the official Williams release lists white "across the sidepod, front wing and rear wing" and does not mention the engine cover. Highest-risk entry of the set. |
| Aston Martin | "darker airbox" over satin green | Real but unnamed. Could be near-black or a deep green; no source picks one. |
| Alpine | — | No source addresses the cover at all. |
| Racing Bulls | same as body (white) | Blue *streaks* on the cover, not a cover colour. |
| Haas | same as body (white) | The cover is named only as a branding location. |
| Red Bull | same as body (gloss blue) | Already carries its own treatment (`spineLogo: "wrap"`, `spineHeight: "dorsal"`, `finShape: "none"`). |
| Cadillac | body is split LEFT/RIGHT | The cover follows a black/white split down the centreline. **We cannot express this**: the livery model has no per-side body colour. A real feature request, not a colour. |

## If someone picks this up

The launch galleries that would settle Williams, Aston Martin and Alpine exist
(formula1.com "GALLERY: every angle of…", media.alpinecars.com) and need a
session whose fetch reaches them, or an owner-supplied photograph — which is
exactly how Ferrari and Mercedes got theirs, and why those two are the only
covers in the tree.
