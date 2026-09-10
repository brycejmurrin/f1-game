"use strict";
// Collide — car-to-car contact in the Frenet (prog, x) plane: the arc-bucket
// broadphase, the mass-weighted relaxation passes, the hard separation pass,
// the barrier clamp and the world-pose writeback. Extracted from game.js
// (Collide.create(G, collideFx)); game.js keeps collideFx (shake/hit-stop/
// rumble — game feel state) and hands it in as the second argument, the rest
// (track/player/netPlay/PACE/wrapS/worldFromTrack) through G. The takeover
// owner is IncidentSim's static owns()/notifyCar(). Physics-visible: every
// number here is gated by tests/specs/physics-characterization.spec.js.
const Collide = (() => {
  const clamp = M4.clamp;   // js/core/mat4.js (eval-time: HARD_EDGES mat4 -> collide)
  const LCAR = 4.8, WCAR = 2.0;
  // "This frame actually separated them" is a millimetre, never `corr > 0`: at
  // the slop distance the penetration is `LCAR - |dProg|` with LCAR's own
  // rounding still in it, so corr lands at ~3e-16 — positive, and therefore true
  // — while nothing moves. Measured at dProg = -4.75.
  const CORR_EPS = 1e-3;

  function create(G, collideFx) {
    Log.info("game", "Collide.create");
    const wrapS = G.wrapS;
    const incidentSim = IncidentSim;   // static owns()/notifyCar() — one instance per page
    let track = null, player = null, netPlay = null;   // bound at resolveCollisions entry

    // Shift a car along the track. Both s and prog advance together so multi-pass
    // pairContact (which keys on prog) sees the push immediately — skipping human
    // prog left penLong stale across relaxation passes. _prevS is NOT moved: the
    // lap-line test compares c.s to _prevS, and moving both hid a shove across the
    // line (re-cross = a SECOND lap; forward shove = none). _pushD banks the push.
    function shiftLong(c, d) {
      c.s = wrapS(c.s + d);
      c.prog += d; c._pushD = (c._pushD || 0) + d;
      _colShifted = true;
    }

    // Collision masses AND separation shares for one pair.
    //
    // The two are NOT the same, and that is the whole point. `iA`/`iB` are the
    // momentum masses: a human car is "heavier" (0.5) so the AI cannot shove it
    // around, and between two humans they are equal so neither out-muscles the
    // other. The SPEED exchange uses those, because both cars are real and both
    // genuinely slow down.
    //
    // `sA`/`sB` are how much of the POSITIONAL correction each car absorbs, and a
    // car posed from the network takes none of it. Its owner integrates it on
    // their machine and we re-pose it from their next packet, so any push we apply
    // is discarded a frame later — splitting 50/50 with a car whose half is thrown
    // away leaves the pair still overlapping, frame after frame. The car we own
    // absorbs all of it. That is the ownership rule made concrete: contact moves
    // YOUR car, based on where you see the other one.
    //
    // Returns a shared scratch object; every call site destructures it immediately,
    // so nothing aliases across a pair and the relaxation loop stays allocation-free.
    const _sep = { iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5 };
    const _ct = { dProg: 0, dX: 0, penLong: 0, penLat: 0, iA: 1, iB: 1, iSum: 2, sA: 0.5, sB: 0.5, aSp: 0, bSp: 0, sideContact: false };  // shared like _sep: both pairContact call sites destructure at once, keeping the relaxation loop allocation-free as its own comment promises
    // Reused AiDrive ctxs — updateCar used to pass a fresh object literal to
    // wantBoost / otShouldFire / brakeDecision / wantX / adaptLane / otPull /
    // defendPull / isBoxed every physics step (~8 × 20 cars × 60 Hz). Same
    // read-before-next-call contract as _ct / AiDrive.traits.
    // Arc-bucket broadphase for resolveCollisions. Bucket width = LCAR so any
    // contacting pair shares a bucket or sits in adjacent ones (wrap-aware).
    const COL_BUCKET_M = LCAR;
    const _colBuckets = [];   // sparse: bucketId → car[]
    const _colBucketIds = []; // compact list of occupied bucket ids this pass
    let _colShifted = false;  // shiftLong this step — skip idle re-buckets

    function _colClearBuckets() {
      for (let i = 0; i < _colBucketIds.length; i++) {
        const id = _colBucketIds[i];
        const arr = _colBuckets[id];
        if (arr) arr.length = 0;
      }
      _colBucketIds.length = 0;
    }

    function _colFillBuckets(ranked) {
      _colClearBuckets();
      const L = track.total || 1;
      // floor, not ceil: ceil made the LAST bucket a sliver (L mod width < LCAR),
      // so a touching pair straddling the seam could sit two buckets apart and the
      // (id+1)%nB neighbour walk never met them — no contact resolution right at
      // the line. floor folds the tail into bucket 0 (the trailing %nB below),
      // keeping every bucket >= a car length and the seam pair adjacent.
      const nB = Math.max(1, Math.floor(L / COL_BUCKET_M) | 0);
      for (let i = 0; i < ranked.length; i++) {
        const c = ranked[i];
        const prog = c._nOk ? c._nProg : c.prog;
        let b = Math.floor((((prog % L) + L) % L) / COL_BUCKET_M) % nB;
        if (b < 0) b += nB;
        let arr = _colBuckets[b];
        if (!arr) { arr = _colBuckets[b] = []; }
        if (arr.length === 0) _colBucketIds.push(b);
        arr.push(c);
      }
      return nB;
    }
    function sepShares(a, b) {
      const hum = AiDrive.humanInvMass(!!track.street);
      const iA = a.human ? hum : 1, iB = b.human ? hum : 1;
      const netA = netPlay.owns(a), netB = netPlay.owns(b);
      _sep.iA = iA; _sep.iB = iB; _sep.iSum = iA + iB;
      _sep.sA = netA ? 0 : (netB ? 1 : iA / _sep.iSum);
      _sep.sB = netB ? 0 : (netA ? 1 : iB / _sep.iSum);
      return _sep;
    }

    // Bucket-pair callbacks + per-pass inputs in module state — no closure per pass.
    let _colCbLast = false, _colCbRub = 1;
    const COL_SLOP = 0.05;   // separation slop — small, avoids a hard per-frame snap
    function _colResolveCB(a, b) { _colResolvePair(a, b, _colCbLast, _colCbRub); }
    function _colSepCB(a, b) { _colSepPair(a, b, COL_SLOP); }

    // Wrap-aware (prog, x) overlap + rear-vs-side decision. Hoisted out of
    // resolveCollisions so each phys step does not allocate a nested function.
    // Exact cheap-reject before wrap: |dProg| in (LCAR, L-LCAR) cannot contact.
    function pairContact(a, b) {
      // Net remotes draw from delayed sample() but contact must use predict()
      // (netplay tick writes _nOk/_nProg/_nX/_nSpd). Local cars keep prog/x/speed.
      const aProg = a._nOk ? a._nProg : a.prog;
      const bProg = b._nOk ? b._nProg : b.prog;
      const aX = a._nOk ? a._nX : a.x;
      const bX = b._nOk ? b._nX : b.x;
      const aSp = a._nOk ? a._nSpd : a.speed;
      const bSp = b._nOk ? b._nSpd : b.speed;
      let dProg = aProg - bProg;
      if (!Number.isFinite(dProg)) return null;
      const L = track.total;
      const adProg = dProg < 0 ? -dProg : dProg;
      if (adProg > LCAR && adProg < L - LCAR) return null;
      dProg = ((dProg + L / 2) % L + L) % L - L / 2;
      if (Math.abs(dProg) > LCAR) return null;
      const dX = aX - bX;
      if (!Number.isFinite(dX)) return null;
      const penLong = LCAR - Math.abs(dProg);
      const penLat = WCAR - Math.abs(dX);
      if (penLong <= 0 || penLat <= 0) return null;
      const { iA, iB, iSum, sA, sB } = sepShares(a, b);
      const closing = (dProg >= 0 ? bSp - aSp : aSp - bSp) > 0.5;
      const nestEdge = closing && penLong > 1.0 && penLat < 0.5;
      const forceRear = nestEdge && ((dProg >= 0 && b.human) || (dProg < 0 && a.human));
      _ct.dProg = dProg; _ct.dX = dX; _ct.penLong = penLong; _ct.penLat = penLat;
      _ct.iA = iA; _ct.iB = iB; _ct.iSum = iSum; _ct.sA = sA; _ct.sB = sB;
      _ct.aSp = aSp; _ct.bSp = bSp;
      _ct.sideContact = penLat < penLong && !forceRear;
      return _ct;
    }

    // Frenet-frame collisions: (prog, x) is treated as a 2D plane. Each car is a
    // capsule ~4.8 m long and ~2.0 m wide (combined extents). We pick the axis of
    // least penetration as the contact normal — lateral penetration => a side rub
    // (separate on x, scrub speed); longitudinal => a rear-end (separate along the
    // track, transfer speed rear->front). Mass-weighted, several relaxation passes
    // to settle clusters, then a hard min-separation pass so cars can never render
    // merged. The player is "heavier" (AiDrive.humanInvMass) so the AI can't shove them off.
    function _colResolvePair(a, b, last, rubScrub) {
      if (incidentSim.owns(a) || incidentSim.owns(b)) return;
      const ct = pairContact(a, b);
      if (!ct) return;
      const { dProg, dX, penLong, penLat, iA, iB, iSum, sA, sB, sideContact, aSp, bSp } = ct;
      if (sideContact) {
        // side-by-side contact: separate laterally, scrub a little speed. Mark
        // both cars "in contact" so the AI eases off steering this way and
        // stops fighting the push (the cause of the side-by-side vibration).
        const sgn = dX >= 0 ? 1 : -1;
        const corr = Math.max(penLat - 0.05, 0) * 0.35;   // gentler push -> rub, not bounce
        a.x += sgn * corr * sA;
        b.x -= sgn * corr * sB;
        // Skip scrub when corr≈0 (nest-edge / at-slop) — perpetual zero-corr side
        // contact was draining speed without separating the cars, and CORR_EPS is
        // what makes that guard actually hold. The FLAG takes the same gate:
        // contactT is not cosmetic (it gates the player's own stuck rescue), so it
        // must mean "we are colliding", not "we rounded".
        // AI vs AI: ONE car yields (AiDrive.sideYieldsA — behind on arc, or the
        // outer car when level) and only it is scrubbed AND flagged. Scrubbing and
        // softening BOTH gave neither priority, so both mirrored each other and
        // both sank to the throttle-vs-scrub balance (17.4 m/s at vmax 70) for as
        // long as the corner geometry kept them touching; flagging both while
        // scrubbing one was measured too (bench: prolonged-contact pairs 0 -> 3 on
        // monza) — the leader going compliant is what keeps the rub alive.
        // With a HUMAN in the pair there is no planner to mirror, so both flags keep
        // their original meaning: the human's gates their stuck rescue (a car
        // rubbing another is shuffling, not wedged), the AI's makes it compliant so
        // a player leaning on it can move it. The yielder still pays the scrub.
        // `rubScrub` is this STEP's speed loss (AiDrive.rubDecel x dt) and this runs
        // once per relaxation pass — four times a frame — so it is taken on the last
        // pass only. The old form was a 0.995 factor applied on every pass: 2 % a
        // frame, 48 m/s^2 at 40 m/s, and a player rubbing wheels lost 18 m/s in a
        // second (collision bench S5). The flag is idempotent and stays.
        if (corr > CORR_EPS) {
          if (a.human || b.human) a.contactT = b.contactT = 0.22;
          if (AiDrive.sideYieldsA(dProg, a.x, b.x)) { if (last) a.speed = Math.max(0, a.speed - rubScrub); a.contactT = 0.22; }
          else { if (last) b.speed = Math.max(0, b.speed - rubScrub); b.contactT = 0.22; }
        }
        if (last) collideFx(a, b, Math.abs(aSp - bSp) * 0.02 + 0.18);
      } else {
        // rear-end: separate along the track and nudge speeds together (gentle,
        // so hitting a car ahead doesn't slam you to a stop — you bump and tuck in)
        const sgn = dProg >= 0 ? 1 : -1;
        const corr = Math.max(penLong - 0.05, 0) * 0.4;
        shiftLong(a, sgn * corr * sA);
        shiftLong(b, -sgn * corr * sB);
        const relV = sgn >= 0 ? bSp - aSp : aSp - bSp;   // >0 means the rear car is closing
        if (relV > 0) {
          // Soft momentum exchange (was 1.15). Skip only cars Rapier already
          // owns — a relV≥15 skip used to drop jImp even when promoteCarDynamic
          // failed later, leaving the pair with no resolver. owns() cars are
          // also skipped in _colSepPair; this is the same rule at the impulse.
          // notifyCar still queues a shunt; below threshold it no-ops (C3).
          if (!(incidentSim.owns(a) || incidentSim.owns(b))) {
            // A real impulse: j = (1 + e) * relV / (invA + invB). The old 0.5 was
            // (1 + e) = 0.5, i.e. e = -0.5 — after it the cars were STILL closing at
            // half speed, and penetration plus the position passes ate the rest over
            // ~30 frames: a bump read as being pushed along (collision bench S1,
            // both cars welded at the slop distance at one speed). Real cars are
            // near-inelastic at racing speeds (COR ~0.1 above ~7 m/s); below 1 m/s
            // closing the contact is resting and e is 0 (Box2D's velocity
            // threshold), so a following car does not jitter off a bumper.
            const e = AiDrive.bumpRestitution(relV);
            const jImp = (1 + e) * relV / iSum;
            // The car in front takes the punt in full — that is the kick you feel
            // and see. A HUMAN in front is capped: an AI misjudging a braking zone
            // must not launch the player down the road (the cap is a closing speed,
            // pace-scaled), while the AI behind still pays its whole share.
            const capV = AiDrive.humanPuntCap() * Math.max(G.PACE, 0.05);
            if (sgn >= 0) {
              b.speed = Math.max(0, b.speed - iB * jImp);
              a.speed += iA * (a.human ? Math.min(jImp, (1 + e) * capV / iSum) : jImp);
            } else {
              a.speed = Math.max(0, a.speed - iA * jImp);
              b.speed += iB * (b.human ? Math.min(jImp, (1 + e) * capV / iSum) : jImp);
            }
          }
          if (corr > CORR_EPS) a.contactT = b.contactT = 0.22;   // see the side branch: settled pairs must let it decay
          if (last) collideFx(a, b, clamp(relV * 0.03 + penLong * 0.05, 0.15, 1));
          // Debris hook (render-only side-world): closing speed = severity.
          if (last && DebrisWorld.active()) DebrisWorld.carImpact(a, b, relV);
          // Incident sim (R3/C3 + C1): a hard closing contact queues a
          // candidate. Only clears the R3 threshold for a real shunt (see
          // incidentsim); below it the cheap (prog,x) plane above stays the
          // resolver — THAT event-scoping is C3. Self-guarding no-op otherwise.
          if (last) incidentSim.notifyCar(a, b, relV);
        }
      }
    }

    function _colSepPair(a, b, SLOP) {
      if (incidentSim.owns(a) || incidentSim.owns(b)) return;
      const ct = pairContact(a, b);
      if (!ct) return;
      const { dProg, dX, penLong, penLat, sA, sB, sideContact } = ct;
      if (sideContact) {
        const c = Math.max(penLat - SLOP, 0) * 0.6;
        if (c <= 0) return;
        const sgn = dX >= 0 ? 1 : -1;
        a.x += sgn * c * sA;
        b.x -= sgn * c * sB;
      } else {
        const c = Math.max(penLong - SLOP, 0) * 0.6;
        if (c <= 0) return;
        const sgn = dProg >= 0 ? 1 : -1;
        shiftLong(a, sgn * c * sA);
        shiftLong(b, -sgn * c * sB);
      }
    }

    // Walk each occupied bucket against itself and the next bucket (mod nB).
    // Bucket width = LCAR → any contacting pair is co-bucketed or adjacent.
    // Each unordered pair is visited once (within-bucket i<j; across only b→b+1).
    function _colForBucketPairs(nB, fn) {
      for (let bi = 0; bi < _colBucketIds.length; bi++) {
        const id = _colBucketIds[bi];
        const A = _colBuckets[id];
        if (!A || !A.length) continue;
        for (let i = 0; i < A.length; i++) {
          const a = A[i];
          for (let j = i + 1; j < A.length; j++) fn(a, A[j]);
        }
        // Forward neighbour only — each undirected cross edge is visited once,
        // including the wrap edge (nB-1 → 0).
        if (nB < 2) continue;
        const id2 = (id + 1) % nB;
        const B = _colBuckets[id2];
        if (!B || !B.length) continue;
        for (let i = 0; i < A.length; i++) {
          const a = A[i];
          for (let j = 0; j < B.length; j++) fn(a, B[j]);
        }
      }
    }

    function resolveCollisions(ranked, dt) {
      track = G.track; player = G.player; netPlay = G.netPlay;   // once per step, not per pair
      const PASSES = 4;
      // Snapshot the player's road coords so the writeback at the end can tell
      // whether this pass actually shoved it (see there for why that matters).
      const _preColS = player ? player.s : 0, _preColX = player ? player.x : 0;
      // AI cars mirrored their world pose BEFORE this pass (updateCar's tail), so a
      // shove rendered one step late; snapshot so the clamp loop can re-mirror.
      for (const c of ranked) if (!c.human) { c._preColS = c.s; c._preColX = c.x; }
      // Side-rub speed loss for this step, in m/s: a deceleration (AiDrive.rubDecel)
      // times the step, so the headless harness's arbitrary dt scrubs per second.
      const rubScrub = AiDrive.rubDecel(!!track.street) * (dt || 1 / 60);
      // Tiny fields: all-pairs is fine and avoids bucket rebuild cost. Larger
      // fields (MP / expanded AI) use arc buckets so pairContact stays O(n·k).
      const useBuckets = ranked.length > 12;
      let nB = 0;
      if (useBuckets) { nB = _colFillBuckets(ranked); _colShifted = false; }
      else if (Log.enabled("game", Log.DEBUG)) {
        Log.debug("game", "resolveCollisions all-pairs n=" + ranked.length);
      }
      for (let pass = 0; pass < PASSES; pass++) {
        const last = pass === PASSES - 1;
        if (useBuckets) {
          // Re-bucket only when shiftLong moved someone — idle passes keep the grid.
          if (pass > 0 && _colShifted) { nB = _colFillBuckets(ranked); _colShifted = false; }
          _colCbLast = last; _colCbRub = rubScrub;
          _colForBucketPairs(nB, _colResolveCB);
        } else {
          const fwd = (pass & 1) === 0;
          for (let ii = 0; ii < ranked.length; ii++) {
            const i = fwd ? ii : ranked.length - 1 - ii;
            const a = ranked[i];
            if (incidentSim.owns(a)) continue;
            for (let j = i + 1; j < ranked.length; j++) {
              _colResolvePair(a, ranked[j], last, rubScrub);
            }
          }
        }
      }
      // separation pass: enforce the car boundary firmly so they don't visibly
      // overlap. A small slop is kept to avoid a hard per-frame snap (the proactive
      // steering separation now keeps cars spaced, so collisions rarely fire and a
      // tighter boundary no longer causes the old vibration).
      if (useBuckets) {
        if (_colShifted) nB = _colFillBuckets(ranked);
        _colForBucketPairs(nB, _colSepCB);
      } else {
        for (let i = 0; i < ranked.length; i++) {
          const a = ranked[i];
          if (incidentSim.owns(a)) continue;   // Rapier owns this car's separation
          for (let j = i + 1; j < ranked.length; j++) {
            _colSepPair(a, ranked[j], COL_SLOP);
          }
        }
      }
      // keep everyone inside the per-side barriers after being shoved around
      for (const c of ranked) {
        if (incidentSim.owns(c)) continue;   // Rapier owns the clamp for this car
        const wr = Tracks.wallAt(track, c.s, 1), wl = Tracks.wallAt(track, c.s, -1);
        if (c.x > wr) c.x = wr; else if (c.x < -wl) c.x = -wl;
        if (!c.human && (c.s !== c._preColS || c.x !== c._preColX)) {
          const w = G.worldFromTrack(c.s, c.x);
          c.px = w.x; c.pz = w.z;
        }
      }
      // The player runs world-space physics; if this pass actually MOVED its (s, x)
      // — a bump, a shove, a barrier clamp — feed that back into px/pz, or the next
      // frame's integration would overwrite the push and cars would slide through
      // each other. Heading is unchanged by a bump.
      //
      // ONLY when it moved. This used to run every frame unconditionally, which
      // quietly turned world → (s, x) → world into a per-frame feedback loop; with a
      // reconstruction that wasn't quite the inverse of the read (see
      // worldFromTrack) the loop had gain < 1 and dragged the car onto the
      // centreline. Untouched frames must leave the car's own integration alone.
      if (player && player.px != null && !player.finished && !incidentSim.owns(player) &&
          (player.s !== _preColS || player.x !== _preColX)) {
        const w = G.worldFromTrack(player.s, player.x);
        player.px = w.x;
        player.pz = w.z;
      }
    }

    return { resolveCollisions, shiftLong, pairContact, sepShares };
  }

  return { create, LCAR, WCAR };
})();
