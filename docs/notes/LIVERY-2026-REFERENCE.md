# 2026 launch liveries — what is sourced, and what is not

Written 2026-09-08, after adding the ENGINE COVER colour zone (`liv.cover`) and
giving Ferrari a white cover and Mercedes a silver one from the owner's own
launch photographs. The question this note answers: **which other teams should
get a cover colour?** This note exists so the next session does not redo the
research to reach the same conclusion — a NEGATIVE answer is recorded here just
as carefully as a positive one, because re-deriving "no" costs the same as
re-deriving "yes".

Answered so far: Ferrari (white) and Mercedes (silver) from the owner's photos;
Williams (black) and Audi (silver body, black cover) from launch galleries;
Alpine (**no** — same blue as the body); Aston Martin (a dark SPINE STRIPE, not
a cover, and the model cannot say it yet). McLaren, Racing Bulls, Haas, Red Bull
and Cadillac are answered in the table below without needing a photograph.

## The blocker, and the way round it

Direct page fetches are egress-blocked in this container: formula1.com,
williamsf1.com, mclaren.com, motorsport.com, skysports, racefans and Wikipedia
all refuse. The FIRST pass of this note therefore inspected no photograph at
all — every line was search-result summary text, and since no team publishes hex
values, any colour would have been a name-to-hex guess. That is not a standard
worth committing as the shipped look of a car, which is why the first pass
changed nothing.

**The REMOTE browser reads those hosts.** That is what settled Williams, Audi
and Alpine, and it is the route to try first — not a local fetch, not the local
browser, both of which the proxy denies by organization policy. Two rules came
out of using it, and both are load-bearing:

1. **Make it describe what it sees before it answers.** The first Williams run
   confidently reported a white cover while describing a white, green and navy
   1981 FW07C tribute — a right-looking answer about the wrong car. A confident
   answer about the wrong car is indistinguishable from a correct one unless the
   tool is made to say which car it is looking at.
2. **Ask whether the angle even shows the part.** A low side-on shot cannot
   settle a crown colour, and a tool that is not asked will guess rather than
   say so.

## Findings

| team | cover | why we did nothing |
|---|---|---|
| Audi | **RESOLVED: silver body, carbon-black cover** — applied | The photograph settled it; see below. |
| McLaren | sourced DISTINCT: black sweeps across the cover | **Already modelled.** McLaren's team livery carries `spineLogo: "panel"` — "a hard-edged panel down the crown with a raked leading edge" — over an anthracite `c2`. That IS the black cover sweep. |
| Williams | **RESOLVED: black** — applied | See "What the photograph settled" below. The white-cover claim was wrong. |
| Aston Martin | **RESOLVED but NOT APPLICABLE**: dark spine stripe on a green cover | The colour question is answered and the model cannot express the answer. See "The Aston Martin gap" below. |
| Alpine | **RESOLVED: same blue as the body — no cover colour** | Settled 2026-09-09 off the official launch photograph. See "What the photograph settled (Alpine)" below. (f1technical.net is behind a Cloudflare bot check no automated read gets past — do not retry that page; formula1.com's own article is the route that worked.) |
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

## What the photographs settled (Audi, Aston Martin)

The same remote browser that settled Williams was pointed at the Audi and
Aston Martin launch galleries.

**Audi was wrong here, not merely missing a cover.** Roughly 24 gallery
photographs show a titanium-SILVER car with a carbon-BLACK engine cover and red
accents toward the rear; the launch report says the same in words. This tree had
a BLACK Audi, and the comment justifying it cited no source while itself
mentioning titanium. The earlier refusal to change it was right at the time — it
declined to restyle a shipped livery on an inference — but direct observation is
not inference, so the body is now silver with a black cover.

**Aston Martin: the colour is known and the model cannot say it.** The cover is
the same metallic green as the body, with a DARK STRIPE down its spine starting
at the airbox. There is no field for that:

- `cover` paints the WHOLE cover, which the photographs contradict.
- `stripe` runs the full body spine — nose tip through monocoque to the cover
  ridge — so it would darken the nose, which the photographs also contradict.
- `spineLogo: "stripe"` draws a band on the crown ALONE, which is the right
  extent, but `drawSpineTop` colours that band `stripe || accent`: with no
  `stripe` it takes the accent, and Aston's accent is lime. Setting `stripe`
  dark to fix the band re-introduces the nose problem.

So the honest answer is a FEATURE GAP: a crown band whose colour is independent
of the body stripe. Recorded rather than forced, because every way of forcing it
today paints something the launch car does not have.

## What the photograph settled (Alpine)

**A NEGATIVE answer, which is still an answer.** The engine cover is the same
blue as the rest of the body. Alpine therefore gets no `cover` colour, and the
question is closed rather than left open for the next session to re-research.

Route, recorded because it is the one that works: the container's egress proxy
denies formula1.com, but the REMOTE browser reads it, and the launch article's
own hero shot is a three-quarter front studio photograph that shows the top of
the car. Asked to describe what it saw before answering (the Williams lesson,
below), it confirmed the blue-and-pink BWT launch livery — not a special — and
reported the cover as "primarily vibrant metallic blue, the same blue as the
rest of the main body… NOT a different colour". Two independent texts agree by
omission: the official F1 article calls it a continued "blue and pink colour
scheme" with no cover callout, and The Race describes "a largely unchanged
blue-and-pink gloss paint livery", noting only that the SIDEPODS return to the
main blue. Nothing anywhere names a distinct cover.

**One thing seen but NOT applied.** The same reading reports "a distinct bright
pink stripe or band running down the centre of the engine cover", starting at
the cockpit. That is single-source — one automated look at one photograph, with
no textual confirmation in either article — and the standard this file already
sets (Audi changed on ~24 photographs plus a launch report agreeing in words) is
higher than that. So Alpine keeps its shipped `spineLogo: "tricolour"` and this
is recorded, not acted on. If it is ever confirmed, note that the fix needs the
SAME crown-band colour field Aston Martin needs (see "The Aston Martin gap"):
Alpine's accent is already pink, so `spineLogo: "stripe"` alone would come close
without it, but the two teams want the same feature.

**Beware the shakedown car.** A technical article describing the A526 at
Silverstone mentions "the use of black paint in this region" around the engine
cover. That car ran the 2025 livery — the Barcelona launch used a showcar
"representative of the new 2026 regulations, rather than its real A526". Two
different cars, and the black belongs to neither the launch livery nor this
question.

## If someone picks this up

Williams, Audi, Aston Martin and Alpine are all settled now. The galleries that
did it exist
(formula1.com "GALLERY: every angle of…", media.alpinecars.com) and need a
session whose fetch reaches them, or an owner-supplied photograph — which is
exactly how Ferrari and Mercedes got theirs, and why those two are the only
covers in the tree.
