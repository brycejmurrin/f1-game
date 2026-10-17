/**
 * @doc Per-car AI stuck / rescue event tracker (pure; the VM loop lives in tools/check/ai-stuck.mjs).
 * @skill ai-racecraft
 *
 * Fed one sample per car per frame: { stuckT, rescueT, threshold, pitBox }.
 *   stuck episode  stuckT rises through `threshold` (AiDrive.stuckThreshold: the
 *                  point where game.js sets unstuckActive and starts digging out);
 *                  it re-arms once stuckT falls back under half the threshold.
 *   rescue         rescueT falls from > 0.1 to exactly 0 in ONE frame. The idle
 *                  decay is dt * 1.5 per frame, so only the teleport (game.js
 *                  rescue block) can do that. A car in its pit box zeroes
 *                  rescueT too, and is excluded via `pitBox`.
 */
export function createStuckTracker() {
  const cars = new Map();
  function rec(id) {
    let r = cars.get(id);
    if (!r) { r = { id, stuckEpisodes: 0, rescues: 0, stuckS: 0, maxStuckT: 0, armed: true, prevRescueT: 0 }; cars.set(id, r); }
    return r;
  }
  function sample(id, s, dt) {
    const r = rec(id);
    const stuckT = s.stuckT || 0, rescueT = s.rescueT || 0;
    if (stuckT > r.maxStuckT) r.maxStuckT = stuckT;
    if (stuckT > s.threshold) {
      r.stuckS += dt;
      if (r.armed) { r.stuckEpisodes++; r.armed = false; }
    } else if (stuckT < s.threshold * 0.5) r.armed = true;
    if (!s.pitBox && r.prevRescueT > 0.1 && rescueT === 0) r.rescues++;
    r.prevRescueT = rescueT;
  }
  const report = () => [...cars.values()].map((r) => ({
    id: r.id, stuckEpisodes: r.stuckEpisodes, rescues: r.rescues,
    stuckS: +r.stuckS.toFixed(2), maxStuckT: +r.maxStuckT.toFixed(2),
  }));
  return { sample, report };
}
