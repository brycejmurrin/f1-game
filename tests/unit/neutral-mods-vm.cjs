// THE NEUTRAL ×1 CAR for game-vm tests (tools/lib/game-vm.cjs): the player's team on statMult-only stat mods,
// the AI-equivalent car. Since #6705 (Bryce's pick B) the works car keeps a grip reserve (Parts.worksMods), so a
// recipe calibrated before it drives this car instead. One home, built from the game's own Parts.statMult, so the
// copies cannot drift (#6731).
//
//   neutralMods(g)            → { speed, accel, cornering, braking } for g.G.player's team (or `team`)
//   withMods(P, mods, fn)     → runs fn() with P.mods = mods and restores the old mods in finally
const KEYS = ["speed", "accel", "cornering", "braking"];

function neutralMods(g, team) {
  const S = g.sandbox, t = team || g.G.player.team, st = S.Career.teamStats(t) || t.stats;
  const m = {};
  for (const k of KEYS) m[k] = S.Parts.statMult(st[k]);
  return m;
}

function withMods(P, mods, fn) {
  const mods0 = P.mods;
  P.mods = mods;
  try { return fn(); } finally { P.mods = mods0; }
}

module.exports = { neutralMods, withMods, KEYS };
