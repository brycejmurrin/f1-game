// @doc Does the colour picked in the TEAM LOGO row get painted? Scores `LiveryTex.markPalette` over team × livery × colours.
// @skill car-viewer
/* logo-authored-sweep.mjs — does the colour a player picks in the editor's
 * TEAM LOGO row actually get painted, or does markPalette substitute one?
 *
 * `liv.logo` is written by js/garage/setup-sheet.js and markPalette is the ONLY
 * thing between that value and the pixels, so scoring markPalette scores the
 * whole chain. Offline via crest-sweep's node:vm loader — no browser.
 *
 * Baseline 2026-08-29, before the authored-halo path: cover kept 17.2%, badge
 * kept 33.9%. Audi's fin is [0.96,0.02,0.22] and only near-white and
 * near-black clear MARK_FLOOR against it, so every mid-tone in the picker
 * collapsed to the same fallback — the reported "TEAM LOGO does nothing on the
 * tail". After: cover 37.4%, badge 91.2%.
 *
 * The cover cannot reach the badge's number and that is geometry, not a bug:
 * drawTailGraphic washes it with an alpha gradient of stripe||c2, so the mark
 * is scored against c1 AND c2 at once, and for Audi (near-black + bright red)
 * NO colour clears 4.2 against both — a halo included.
 *
 * The companion row is LOGO DETAIL (`liv.logo2`), scored the same way: it
 * lands in whichever slot that mark's second colour occupies, so "kept"
 * means it reached plate, alt or outline, not one fixed field.
 *
 * Run: node tools/car/logo-authored-sweep.mjs
 */
import { loadCrests } from "./crest-sweep.mjs";
const { LiveryTex: LT, Teams, Liveries } = loadCrests();
const fieldsFor = (liv, bare) =>
  bare ? [(liv && liv.fin) || (liv && liv.c2)] : [liv && liv.c1, liv && liv.c2];
// A spread a player would actually reach for in a hex picker.
const PICKS = [
  ["white",  [0.97, 0.97, 0.98]], ["black",  [0.06, 0.06, 0.08]],
  ["orange", [1.00, 0.55, 0.00]], ["cyan",   [0.10, 0.80, 0.90]],
  ["lime",   [0.55, 0.90, 0.20]], ["magenta",[0.90, 0.20, 0.70]],
  ["gold",   [0.90, 0.72, 0.20]], ["navy",   [0.10, 0.16, 0.45]],
];
let kept = 0, dropped = 0;
const byTeam = {};
const bySurface = { cover: [0, 0], badge: [0, 0] };
const second = [0, 0];
for (const team of Teams.LIST) {
  for (const liv of Liveries.forTeam(team)) {
    for (const [name, logo] of PICKS) {
      for (const [where, bare] of [["cover", false], ["badge", true]]) {
        const L = { ...liv, logo };
        const P = LT.markPalette(team.id, L, fieldsFor(L, bare), bare);
        const same = P.mark.every((v, i) => Math.abs(v - logo[i]) < 1e-6);
        bySurface[where][same ? 0 : 1]++;
        // The DETAIL row, scored on the same grid: did the second colour reach
        // any slot at all? A slot is per-mark, so compare against all FOUR —
        // `part` was missing here and it is where Mercedes' ring and Audi's
        // second and fourth rings land, so those two marks read as swallowing
        // every DETAIL colour when they were painting all of them.
        const P2 = LT.markPalette(team.id, { ...L, logo2: logo }, fieldsFor(L, bare), bare);
        const eq = (c) => c && c.every((v, i) => Math.abs(v - logo[i]) < 1e-6);
        second[eq(P2.plate) || eq(P2.alt) || eq(P2.part) || eq(P2.outline) ? 0 : 1]++;
        if (same) kept++;
        else {
          dropped++;
          (byTeam[team.id] ||= []).push(`${liv.id}/${where}/${name}`);
        }
      }
    }
  }
}
const total = kept + dropped;
console.log(JSON.stringify({
  total, kept, dropped, keptPct: +(100 * kept / total).toFixed(1),
  bySurface: Object.fromEntries(Object.entries(bySurface).map(([k, [a, b]]) =>
    [k, { kept: a, dropped: b, keptPct: +(100 * a / (a + b)).toFixed(1) }])),
  logoDetail: { kept: second[0], dropped: second[1] },
  audiDropped: (byTeam.audi || []).length,
  audiBadgeDropped: (byTeam.audi || []).filter((s) => s.includes("/badge/")).length,
  audiSample: (byTeam.audi || []).slice(0, 10),
  worstTeams: Object.entries(byTeam).map(([k, v]) => [k, v.length])
    .sort((a, b) => b[1] - a[1]).slice(0, 6),
}, null, 1));
