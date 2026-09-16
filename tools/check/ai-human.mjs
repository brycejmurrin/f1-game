#!/usr/bin/env node
/**
 * @doc Does the AI race a HUMAN as it races another AI? Yield elections, lean dwell and contact with a player on the line.
 * @skill ai-racecraft
 * ai-human.mjs — the case every other racecraft bench excludes.
 *
 * ai-pace / ai-field / ai-line all measure the field against ITSELF, and
 * deliberately: ai-field.mjs states it outright ("Deliberately AI-ONLY: no
 * player, so the rubber band never fires"). That is the right call for what
 * they measure — and it left the one interaction a player actually experiences
 * with no instrument at all.
 *
 * It is not a hypothetical gap. AiDrive.sideYieldsA elects exactly ONE car of
 * an alongside pair to concede, and only the elected car backs off (the rub
 * clamp in js/game.js). Between two AI cars that resolves, because both sides
 * run the rule. A human runs none — and must not, since the arc may not reach
 * the driver — so an election that lands on the player leaves the pair with NO
 * yielder, and the AI holds its racing-line target through a car that was never
 * going to move. Measured here on the pre-fix tree (monza, 240 s): of 276
 * frames alongside inside the clear gap, the rule elected the HUMAN 276 times
 * and the AI zero, while AI-AI pairs resolved at +0.169 m/s over 22,524 frames.
 *
 *   node tools/check/ai-human.mjs                     monza, 240 s
 *   node tools/check/ai-human.mjs --track monaco --seconds 180
 *   node tools/check/ai-human.mjs --json
 *
 * THE PLAYER MODEL, and its limits — read these before quoting a number.
 *
 * The "player" is scripted: it holds the baked racing line at the field's
 * median pace. That is the reported complaint ("it drives into my side while
 * I'm already on the line") turned into something reproducible, not a model of
 * how anyone drives. Two consequences bound every reading below.
 *
 * It is steered to the line at a BOUNDED lateral rate (PLAYER_LAT m/s), never
 * teleported. The first cut of this bench assigned `player.x` outright each
 * frame, which manufactures the very dx changes the bench then attributes to
 * the AI — it reported the AI closing at 1.47 m/s where the honest number was
 * separating. A pinned coordinate is not a driver.
 *
 * ENCOUNTER DENSITY IS THE THING TO WATCH, and it swings hard: three seeds at
 * 240 s on monza gave 12, 448 and 14 alongside frames. A single seed can
 * report almost nothing and mean nothing by it, so run --runs 3 or more and
 * read the seed that actually produced traffic. The `elections` block breaks
 * the verdict out by branch precisely so a thin run is visible as thin rather
 * than mistaken for a clean one; across those three seeds the human was
 * elected 58 %, 91 % and 50 % of alongside frames, and all three branches
 * (behind / ahead / level on arc) do get exercised.
 *
 * Counts are NOT comparable across a behaviour change. A 240 s race is chaotic
 * and any AI edit reshuffles it — the same seed measured 44 and 395 alongside
 * frames across one A/B here. Compare the RATES this prints, over several
 * seeds, and treat a difference inside the run-to-run range as unproven, the
 * same discipline ai-field.mjs's --runs flag exists to enforce.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const TRACK = flag("track", "monza");
const SECONDS = Math.max(30, +flag("seconds", 240));
const RUNS = Math.max(1, Math.min(9, +flag("runs", 1) || 1));
const JSON_OUT = argv.includes("--json");
const DT = 1 / 60, SETTLE = 10;
const PLAYER_LAT = 3.0;          // m/s the scripted player may move sideways

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: "normal" } });
  await g.race(TRACK); if (g.go) await g.go();
  if (g.apex && typeof g.apex.seed === "function") {
    g.apex.seed(seed); await g.race(TRACK); if (g.go) await g.go();
  }
  const S = g.sandbox, Ai = S.AiDrive, TL = S.TrackLine;
  const track = g.G.track, cars = g.G.cars;
  const player = cars.find((c) => c.isPlayer || c.human);
  if (!player) throw new Error("ai-human: no player car in the field");
  const ai = cars.filter((c) => c !== player && !c.human);
  const L = track.total, wrap = (d) => ((d + L / 2) % L + L) % L - L / 2;
  const CLEAR = Ai.minLatGap(5, !!track.street);
  const medSpeed = () => { const s = ai.map((c) => c.speed).sort((a, b) => a - b); return s[s.length >> 1]; };

  for (let f = 0; f < Math.round(SETTLE / DT); f++) g.step(1, DT);

  let along = 0, aiElected = 0, humanElected = 0, contact = 0, sumDx = 0, noContactRead = 0;
  let behind = 0, ahead = 0, level = 0, leanMax = 0, aiAI = 0, aiAIelected = 0;
  for (let f = 0; f < Math.round(SECONDS / DT); f++) {
    const want = TL.at(track, player.s).x, d = want - player.x, cap = PLAYER_LAT * DT;
    player.x += Math.max(-cap, Math.min(cap, d));
    player.speed = medSpeed();
    g.step(1, DT);
    for (const c of ai) {
      if (c.retired || c.finished) continue;
      if ((c.hYieldT || 0) > leanMax) leanMax = c.hYieldT || 0;
      const dp = wrap(c.prog - player.prog);
      if (Math.abs(dp) >= 5.5 || Math.abs(player.x - c.x) >= CLEAR) continue;
      along++; sumDx += Math.abs(player.x - c.x);
      // An ABSENT reading is not a zero reading: coercing it would let this
      // bench report a clean 0 % contact for a field it never actually read.
      if (c.contactT == null) noContactRead++; else if (c.contactT > 0) contact++;
      if (Ai.sideYieldsA(dp, c.x, player.x)) aiElected++; else humanElected++;
      if (dp < -Ai.sideLevel()) behind++; else if (dp > Ai.sideLevel()) ahead++; else level++;
    }
    // the AI-AI control, same window, same race
    for (let i = 0; i < ai.length; i++) for (let j = i + 1; j < ai.length; j++) {
      const a = ai[i], b = ai[j];
      if (a.retired || b.retired || a.finished || b.finished) continue;
      const dp = wrap(a.prog - b.prog);
      if (Math.abs(dp) >= 5.5 || Math.abs(a.x - b.x) >= CLEAR) continue;
      aiAI++; if (Ai.sideYieldsA(dp, a.x, b.x) || Ai.sideYieldsA(-dp, b.x, a.x)) aiAIelected++;
    }
  }
  const pct = (n, d0) => d0 ? +(100 * n / d0).toFixed(1) : 0;
  return {
    seed,
    alongsideFrames: along,
    meanGapM: +(sumDx / (along || 1)).toFixed(2),
    contactPct: pct(contact, along),
    // Surfaced, not swallowed — a contactPct of 0 next to a non-zero count here
    // means "not measured", which is a different claim entirely.
    framesWithNoContactReading: noContactRead,
    // THE ASYMMETRY. Against another AI exactly one car is always elected, so
    // the pair resolves; against a player, every frame elected to the human is
    // a frame with no yielder in the pair at all.
    elections: {
      aiTakesIt: pct(aiElected, along),
      humanTakesIt: pct(humanElected, along),
      byBranch: { playerBehindOnArc: pct(behind, along), playerAheadOnArc: pct(ahead, along), levelOnArc: pct(level, along) },
    },
    aiVsAiControl: { frames: aiAI, pairsWithAYielderPct: pct(aiAIelected, aiAI) },
    // The longest the per-car intrusion timer (c.hYieldT) ran. It keeps counting
    // AFTER the AI takes the role at AiDrive.humanYieldGrace (the timer only
    // clears on separation), so this is the longest intruding EPISODE, not the
    // lean before conceding: 1.2 s here is a 0.3 s lean plus 0.9 s of yielding
    // alongside. 0 on a tree without the grace: nothing ever takes the role.
    longestLeanSec: +leanMax.toFixed(2),
    graceSec: Ai.humanYieldGrace(),
  };
}

const rows = [];
for (let r = 0; r < RUNS; r++) rows.push(await measure(r + 1));
const out = { track: TRACK, seconds: SECONDS, runs: RUNS, playerModel: "holds the racing line at median field pace", rows };
if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`ai-human — ${TRACK}, ${SECONDS}s, ${RUNS} run(s); player holds the racing line at median pace\n`);
for (const r of rows) {
  console.log(`  seed ${r.seed}: ${r.alongsideFrames} alongside frames, mean gap ${r.meanGapM} m, contact ${r.contactPct}%` +
              (r.framesWithNoContactReading ? `  [!] ${r.framesWithNoContactReading} frames had NO contact reading` : ""));
  console.log(`    elected to yield — AI ${r.elections.aiTakesIt}% / HUMAN ${r.elections.humanTakesIt}%` +
              `   (branches: behind ${r.elections.byBranch.playerBehindOnArc}% / ahead ${r.elections.byBranch.playerAheadOnArc}% / level ${r.elections.byBranch.levelOnArc}%)`);
  console.log(`    AI-vs-AI control: ${r.aiVsAiControl.frames} frames, a yielder in ${r.aiVsAiControl.pairsWithAYielderPct}%`);
  console.log(`    longest intruding episode (the AI took the role at ${r.graceSec}s of it): ${r.longestLeanSec}s\n`);
}
console.log("  Counts are not comparable across a behaviour change (the race reshuffles); compare rates over several seeds.");
