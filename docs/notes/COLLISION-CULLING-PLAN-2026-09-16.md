# Collisions and hidden-face culling — plan (2026-09-16)

A plan, not a change. Read against the contact solver, the wall block, the
Rapier side-world, the chunked renderer and the existing perf ledger.

**Verdict up front: collisions are where the work is. The culling is already
mature, and two culling proposals in this repository have already been
closed by measurement.**

## 1. Culling today — do not re-derive this

- Backface culling is on by default and never globally off; the draw state
  re-enables it every frame, and the box emitter flips winding by basis
  handedness so the outward face survives.
- Frustum culling runs per chunk over 72 metre cells, and adjacent visible
  chunks merge into a single draw call. Measured visible chunks per frame:
  about 147 at Spa, 101 at Las Vegas, 79 at Monza.
- A radial cull sits on top, using the frustum's bounding sphere, or the fog
  visibility distance when fog is dense.
- Instanced batches are culled against cells, with a cache keyed on the
  surviving cell set. That change shipped with a measured drop in buffer
  uploads from 27.9 to 17.8 calls per frame.
- Shadow passes cull separately to the light's own frustum.
- Measured baseline at Las Vegas at night with a full field: 144 draw calls
  per frame.

There is one genuinely unclaimed culling item, and it is a bake-time change
rather than a draw-path one: **the box emitter unconditionally emits all six
faces, including the bottom.** It is the hottest emitter in the build, at
about 85,000 calls on Las Vegas, which is 78 % of that circuit's prop
vertices. Dropping the bottom face from every box proven to be grounded
removes roughly 340,000 vertices and 170,000 triangles, about 13 % of prop
vertices. It is safe in principle because a face against terrain is
anti-parallel coplanar, which the coplanar audit already excludes, and the
terrain ground query never reads props. It is not free in practice, because
37 of 40 circuits have known floaters, so it must be gated on a grounding
test rather than applied blindly. The exact instrument already exists and
needs no GPU.

Rejected on the culling side, each with a reason: occlusion culling, because
there is no depth pre-pass and adding one doubles vertex submission to save
fragment work in a frame whose measured cost is draw calls and uploads;
merging empty chunks, already closed by measurement at about two draws a
frame; backface culling on the road, which is double-sided on purpose for
visible ribbon undersides; extending the mobile city detail reduction to
desktop, which is a build-time count and cannot respond to camera distance;
and merging coplanar faces, which would hide a city-generator placement
defect rather than fix it.

## 2. Collisions today

A two-dimensional rectangle solver in the track's own curved coordinate
frame, with one real impulse path bolted on. Cars are a 4.8 by 2.0 metre
box. Yaw is read only for the human, blended in between 20 and 60 degrees;
**every AI car collides as an axis-aligned rectangle no matter how it is
drawn.** The broadphase buckets by arc length; the narrowphase uses
penetration extents, or exact separating-axis tests when a car is yawed. A
single continuous sweep per car per step rejects any car rotating faster
than 0.15 radians, which is exactly the spinning car you most want caught.

Response splits in two. When a car is yawed it goes through a real impulse
with restitution hard-coded to zero and rotational inertia granted to the
human only. Otherwise it takes a heuristic: the contact is classified side
or rear by comparing penetration ratios against the car's aspect ratio, and
a side contact gets a positional push plus a one-sided speed scrub with no
impulse at all.

Walls are not contacts. They are a per-node lateral scalar clamp built from
a conservative minimum, so the barrier tangent is a finite difference of a
staircase. Props are not collidable in the main solver at all; the build
guarantees no primitive covers the road. The Rapier side-world uses a 4.0 by
1.5 metre car box against the solver's 4.8 by 2.0, and takes over on scalar
triggers rather than geometry.

### The named weaknesses

1. **No wheels.** The solid rectangle fills the 1.8 metres of open air
   between the front and rear wheel, so wheel-to-wheel interlock, the
   defining Formula One contact and the one that launches cars, is
   geometrically unreachable.
2. **Wing overhang.** A 4.8 metre box against a roughly 5.6 metre car. The
   front-wing endplate, the first thing that touches on a dive up the
   inside, is 0.4 metres short.
3. **AI yaw is absent from the collider**, so contact normals in corners are
   systematically wrong for every AI pairing.
4. **The curved frame is not the world frame.** Arc length 8 metres either
   side of centre on a 40 metre hairpin differs by about 40 %, and nothing
   corrects the fixed longitudinal extent for it.
5. **No friction impulse anywhere.** Leaning on a rival cannot transfer
   lateral momentum or yaw.
6. **The side and rear classification is a cliff** that can flip branch
   mid-contact.
7. **Two car sizes in two worlds**: a pair touching in the plane solver is
   0.4 metres apart in the physics island.
8. **Only the player can be rotated by a contact.**
9. **Launches trigger on a closing-speed scalar rather than a ramp angle
   over a wheel.**

## 3. Collision work, ranked

1. **Restitution and Coulomb friction inside the impulse resolver.** About
   fifteen lines in one pure frozen module whose mass, inertia and lever-arm
   machinery already exists. Only the oriented path calls it, and that path
   only fires past the 20 degree yaw floor, so the unyawed field stays
   bit-identical by construction. Every later item collapses into it.
2. **A three-disc footprint replacing the rectangle**, which fixes the AI
   yaw, the curved-frame distortion and the classification cliff at once: a
   disc-to-disc normal is rotation-exact for free, with no separating-axis
   test and no aspect-ratio heuristic. Large re-baseline; not first.
3. **Per-wheel contact points** plus a narrow tub and two wing bars, which
   makes the notch between the wheels real and turns interlock and
   wing-under-tyre launches into geometric events rather than scalar
   triggers. Expect a racecraft re-tune, because every AI lateral separation
   constant is tuned against a shape that would no longer exist.
4. **The wall as a contact rather than a clamp**, reusing the same resolver,
   and interpolating the barrier line instead of differencing a staircase.
5. **Sweeping rotating bodies**, which falls out of item 2 for free.
6. **Reconciling the two car boxes** between the solver and the physics
   island. Two lines of hygiene that silently change every takeover, so it
   needs its own gate.

Rejected: moving all car-to-car contact into the physics island, because a
remote car would need full six-degree-of-freedom state against a thirteen
byte snapshot; and replacing the positional passes with warm-started
sequential impulses, because four separate systems read the positional push
and the pileup tests only assert boundedness, so the new solver would be
tuned against assertions that cannot tell it improved.

## 4. Recommended first step, and its gate

Add restitution and a friction-clamped tangential impulse to the contact
resolver, and change no call site.

It is the smallest possible surface, it is provably bit-identical for the
unyawed field, and it is the resolver every later item needs. The gate, in
order: the seven-test contact-geometry suite with its energy assertion
restated and one new tangential test; the contact classification suite
passing **untouched**, which is the proof the change stayed inside the
oriented path; the deep collision invariants, where a sign error would show
up as a rub increasing the player's speed; the determinism replay; and a
counted oracle rather than a timed one, because contact-resolution passes
are exactly countable in this container and frame rate is not.

## 5. The rule this plan keeps

Count the work avoided; do not time it. The hardware census measured 26.9
against 41.4 frames per second on identical code, a 54 % spread, with the
governor picking different rungs between runs. Draw calls, triangles,
vertices and resolution passes are exact here. Frame rate is not, on this
box or on that one.
