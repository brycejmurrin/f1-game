/* ai-field-spread-vm.test.mjs — the AI field's race spread stays in a real-F1 band (#6564).
 *
 * Bryce (2026-11-25): "they still seem way more bunched up … the spread should
 * be larger". The calibration study (#6565, real 2026, 15 dry races) found the
 * AI field already AS WIDE as real F1 or wider in percent; what bunched it was
 * the RANDOM grid default (fast cars stuck behind slow ones). This pins the
 * shipped default (QUALIFYING; a scripted start grids on team tier, the proxy
 * for a qualifying order the VM does not drive) so
 * the field neither collapses into a train nor blows apart:
 *
 *   - lap 1: P10's gap to the leader (real median 6.5 s; ours runs ~2x on
 *     longer laps and a calm start, so the band is the measured one);
 *   - the flag: gaps grow with position (P2 <= P5 <= P10 <= last);
 *   - race pace by pace rank (median green lap vs the fastest): P10 and P20
 *     (real +1.89 % / +4.16 %);
 *   - teammates (real 0.39 %, worst pair 1.0 %), lap-time CV (real 0.95 %);
 *   - not processional: most cars finish somewhere other than their grid slot.
 *
 * Bands from tools/check/ai-spread.mjs on this tree (HARD, wear off, 5 laps):
 * bahrain/monza seeds 1-2 measured lap1 P10 11.5-13.1 s, flag last 44.7-49.2 s,
 * P10 pace 2.11-3.71 %, P20 5.58-7.03 %, teammates 0.67-1.49 %, lap CV
 * 0.49-0.97 %, moved 15-18 of 21. On the old RANDOM grid the same instrument read
 * teammates 1.43 % and lap CV 1.57 % (16-race medians), outside these bands.
 * #6575 (a chaser past 0.25 s no longer puts a car on its home lane) tightened
 * them: the same four races read lap1 P10 10.65-13.1 s, flag last 38.5-44.1 s,
 * P10 pace 2.18-2.93 %, P20 3.95-6.09 %, teammates 0.53-1.07 %, lap CV
 * 0.24-0.59 %, moved 14-17 (docs/notes/AI-FIELD-SPREAD-2026-11-26.md).
 * Deterministic per seed (sim time, fixed step).
 *
 * Run: node --test tests/unit/ai-field-spread-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { raceSpread, summarize } from "../../tools/check/ai-spread.mjs";

const CASES = [["bahrain", 1], ["bahrain", 2], ["monza", 1], ["monza", 2]];

for (const [track, seed] of CASES) {
  test(`${track} seed ${seed}: the shipped-grid AI field spreads like a real race`, { timeout: 240_000 }, async () => {
    const s = summarize(await raceSpread({ track, laps: 5, seed, diff: "hard", wear: "off", storage: { raceGrid: null } }));
    const tag = JSON.stringify(s);
    assert.equal(s.laps, 5, tag);
    assert.ok(s.lap1.p10 >= 8 && s.lap1.p10 <= 14.5, `lap-1 P10 gap ${s.lap1.p10} s outside [8, 14.5] — ${tag}`);
    const f = s.flag;
    assert.ok(f.p2 <= f.p5 && f.p5 <= f.p10 && f.p10 <= f.last, `flag gaps grow with position — ${tag}`);
    assert.ok(f.last >= 25 && f.last <= 60, `P1 to last ${f.last} s outside [25, 60] — ${tag}`);
    assert.ok(s.racePacePct.p10 >= 1.0 && s.racePacePct.p10 <= 3.8, `race pace P10 ${s.racePacePct.p10} % outside [1.0, 3.8] — ${tag}`);
    assert.ok(s.racePacePct.p20 >= 3.0 && s.racePacePct.p20 <= 7.5, `race pace P20 ${s.racePacePct.p20} % outside [3.0, 7.5] — ${tag}`);
    // 1.5 (was 1.4): Bryce, `decision: A` on #7155 (2026-11-27): the PACE-scaled wall/side-rub scrubs put monza seed 1 at 1.47 %.
    assert.ok(s.mateGapPct.mean <= 1.5, `teammate gap ${s.mateGapPct.mean} % over 1.5 — ${tag}`);
    assert.ok(s.lapCvMedPct >= 0.2 && s.lapCvMedPct <= 1.2, `lap-time CV ${s.lapCvMedPct} % outside [0.2, 1.2] (a metronome is as wrong as a lottery) — ${tag}`);
    assert.ok(s.moved >= 10, `only ${s.moved} cars finished off their grid slot: processional — ${tag}`);
  });
}
