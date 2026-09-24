/* FLYBY POSE INVERSE — FlybySeq.poseFromWorld / shotFromView (js/camera/flyby-seq.js)
 *
 * The free camera's "copy as flyby pose" turns a world eye/target into a
 * TRACK-RELATIVE pose the shot editor can hold. The contract is a round trip:
 * posePoint(poseFromWorld(p)) lands back on p. Pure geometry over one built
 * circuit, no browser.
 */
import { test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const require = createRequire(import.meta.url);
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const TOL = 0.25;   // metres: poses are rounded to the centimetre, r vectors are lerped

test("poseFromWorld round-trips every anchor kind on a built circuit", async () => {
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza", "day", "dry");
    const track = g.G.track, F = g.sandbox.FlybySeq, T = g.sandbox.Tracks;
    const out = [0, 0, 0];
    const back = (pose) => F.posePoint(track, pose, out).slice();
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

    // 1. Points beside the road, all the way round the lap: auto → corner/start.
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 10 };
    const kinds = new Set();
    for (let i = 0; i < 40; i++) {
      const s = (i + 0.37) / 40 * track.total, lat = ((i % 5) - 2) * 9;
      T.sample(track, s, smp);
      const p = [smp.p[0] + smp.r[0] * lat, smp.p[1] + 3 + (i % 4) * 5, smp.p[2] + smp.r[2] * lat];
      const { pose, err } = F.poseFromWorld(track, p);
      kinds.add(pose.at);
      assert.ok(pose.at === "corner" || pose.at === "start", `near-road point anchored ${pose.at}`);
      assert.ok(err < TOL, `s=${s.toFixed(0)} ${JSON.stringify(pose)} misses by ${err} m`);
      assert.ok(dist(back(pose), p) < TOL);
    }
    assert.ok(kinds.has("corner") && kinds.has("start"), `both road anchors used: ${[...kinds]}`);

    // 2. A corner pose's x is the OUTSIDE of the turn, whichever way it turns.
    const cs = F.cornerS(track, 1);
    T.sample(track, cs, smp);
    const side = F.cornerSide(track, 1);   // +1: left-hander, outside = road +right
    const outside = [smp.p[0] + smp.r[0] * 15 * side, smp.p[1] + 6, smp.p[2] + smp.r[2] * 15 * side];
    const c = F.poseFromWorld(track, outside).pose;
    assert.strictEqual(c.at, "corner");
    assert.strictEqual(c.n, 1);
    assert.ok(c.x > 14 && c.x < 16, `outside of T1 reads x=+15, got ${c.x}`);
    assert.ok(Math.abs(c.off) < 1 && Math.abs(c.y - 6) < 0.3, JSON.stringify(c));

    // 3. The whole-circuit helicopter: forced centre, inside posePoint's clamps.
    const b = F.bounds(track);
    const heli = [b.x + Math.cos(b.face + 0.7) * 500, b.y + 120, b.z + Math.sin(b.face + 0.7) * 500];
    const h = F.poseFromWorld(track, heli, { at: "centre" });
    assert.strictEqual(h.pose.at, "centre");
    assert.ok(Math.abs(h.pose.bear - 0.7) < 1e-3, `bear ${h.pose.bear}`);
    assert.ok(h.err < TOL, `centre misses by ${h.err}`);
    // ...and above the height clamp the remainder rides in `y`.
    const high = [heli[0], b.y + 400, heli[2]];
    const hh = F.poseFromWorld(track, high, { at: "centre" });
    assert.ok(hh.pose.y > 0 && hh.err < TOL, JSON.stringify(hh));
    // Too close to the centroid for a centre pose: falls back to the road, exactly.
    const tooNear = [b.x + 20, b.y + 80, b.z];
    const tn = F.poseFromWorld(track, tooNear, { at: "centre" });
    assert.notStrictEqual(tn.pose.at, "centre");
    assert.ok(tn.err < TOL);

    // 4. Landmarks, when the circuit has any.
    const lm = F.landmarks(track);
    if (lm.length) {
      const r = lm[0];
      const p = [r.x + 70, r.y + 20, r.z - 40];
      const l = F.poseFromWorld(track, p, { at: "landmark", rank: 0 });
      assert.strictEqual(l.pose.at, "landmark");
      assert.ok(l.err < TOL, `landmark misses by ${l.err}`);
    }

    // 5. shotFromView: a held shot that the SOLVER renders where the camera was.
    T.sample(track, 900, smp);
    const eye = [smp.p[0] + smp.r[0] * 20, smp.p[1] + 8, smp.p[2] + smp.r[2] * 20];
    const tgt = [smp.p[0] + smp.t[0] * 40, smp.p[1] + 1, smp.p[2] + smp.t[2] * 40];
    const sv = F.shotFromView(track, eye, tgt, 48);
    assert.ok(sv.err.eye < TOL && sv.err.look < TOL, JSON.stringify(sv.err));
    F.reset();
    const v = F.solve(track, 0.5, [sv.shot]);
    assert.ok(dist(v.tgt, tgt) < TOL, `solver look ${v.tgt} vs ${tgt}`);
    // The eye may be lifted by clearEye if it sits in a prop; report, don't hide.
    assert.ok(dist(v.eye, eye) - (v.lift || 0) < TOL, `solver eye ${v.eye} vs ${eye} (lift ${v.lift})`);
    assert.strictEqual(v.fov, 48);
    // Plain JSON, so it pastes into the editor / a shot list verbatim (compared
    // as text: the shot comes from the VM's realm, whose Object is not ours).
    const json = JSON.stringify(sv.shot);
    assert.strictEqual(JSON.stringify(JSON.parse(json)), json);
    assert.ok(!/NaN|null/.test(json), json);
  } finally { g.close(); }
});
