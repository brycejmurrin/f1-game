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
 * It is DRIVEN through the test-input path (steering and pedals, the car's own
 * physics answering — see the follower in measure()), never teleported. The
 * first cut of this bench assigned `player.x` outright each frame, which
 * manufactures the very dx changes the bench then attributes to the AI — it
 * reported the AI closing at 1.47 m/s where the honest number was separating;
 * the second nudged `player.x` a few cm a frame, which the sim's own lateral
 * physics swamped (self-check: 3.2 m off the line whatever was asked). A
 * pinned coordinate is not a driver, and neither is a nudged one. The
 * `playerOffsetInCornersM` line is the self-check: read it before the rest.
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

import { wearArg } from "../lib/cli-args.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const TRACK = flag("track", "monza");
// Default OFF, the harness pin, so the recorded yield/contact rates hold.
// --wear light|real races the player against a field that pits and degrades.
const WEAR = wearArg(argv);
const SECONDS = Math.max(30, +flag("seconds", 240));
const RUNS = Math.max(1, Math.min(9, +flag("runs", 1) || 1));
const JSON_OUT = argv.includes("--json");
const DT = 1 / 60, SETTLE = 10;
// --offset <m>: the scripted player holds the racing line shifted this far
// toward the OUTSIDE of each corner (0 on a straight). A human rarely sits on
// the AI's exact line; a metre or two wide is where an AI aiming at the line
// aims THROUGH them. 0 = the original model.
const OFFSET = +flag("offset", 0) || 0;
// --pace <f>: the player's speed as a fraction of the field's median. Below 1
// the field comes THROUGH the player — the case the complaint is about — and
// the player is re-inserted into the pack whenever it has been alone for
// REINSERT_S (a slower car soon has nobody around it). 1 = the original model,
// which at seed 1 produced 0 alongside frames in 90 s: no instrument at all.
const PACE = +flag("pace", 0.97) || 1;
const REINSERT_S = 4;

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: "normal", tyreWear: WEAR } });
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

  for (let f = 0; f < Math.round(SETTLE / DT); f++) g.step(1, DT);

  let along = 0, aiElected = 0, humanElected = 0, contact = 0, sumDx = 0, noContactRead = 0;
  let behind = 0, ahead = 0, level = 0, leanMax = 0, aiAI = 0, aiAIelected = 0;
  // CONTACT EVENTS with the player, classified by the geometry at first touch
  // (a rising edge of contactT on an AI car overlapping the player's box).
  // Frames of contact (contactPct) say how long; this says how it started:
  //   rearEnd    nose to tail, nearly in line   (|dx| < 1.4, |dprog| > sideLevel)
  //   side       level, wheel to wheel          (|dprog| <= sideLevel)
  //   diagonal   overlapping by a part-car, offset — the turn-in / squeeze case
  // and on which side of the arc the AI was.
  const LCAR = S.Collide ? S.Collide.LCAR : 5.6;
  const events = { rearEnd: 0, side: 0, diagonal: 0, aiAhead: 0, aiBehind: 0, list: [] };
  const prevContact = new Map();
  // Re-insertion: into the LARGEST gap between consecutive cars of the pack's
  // middle half, on the line, at the field's pace — the same prog shift
  // __apex.jam()/pair() use. Not "just ahead of the median car": that dropped
  // the player into an overlap and the bench counted the contact it had
  // manufactured (first touch at t = 0). Events inside INSERT_GRACE_S of an
  // insertion are not counted either.
  const INSERT_GRACE_S = 3;
  let aloneT = REINSERT_S, reinserts = 0, insertedAt = -Infinity, offSum = 0, offN = 0;
  const insertTimes = [];
  const reinsert = (t) => {
    const live = ai.filter((c) => !c.retired && !c.finished).sort((a, b) => a.prog - b.prog);
    if (live.length < 4) return;
    const lo = live.length >> 2, hi = live.length - lo;
    let best = null, bestGap = -1;
    for (let i = lo; i < hi - 1; i++) {
      const gap = live[i + 1].prog - live[i].prog;
      if (gap > bestGap) { bestGap = gap; best = i; }
    }
    if (best == null) return;
    const a = live[best], b = live[best + 1];
    player.prog = (a.prog + b.prog) / 2; player.s = ((player.prog % L) + L) % L;
    // At the speed of the car BEHIND (a): dropped in at the pair's mean speed
    // the player was slower than the car behind from the first frame, and the
    // bench booked that closing as a rear-end (two at t = 11.8 s, measured).
    player.x = TL.at(track, player.s).x; player.speed = a.speed;
    reinserts++; insertedAt = t; insertTimes.push(+t.toFixed(1));
  };
  // THE PLAYER IS DRIVEN, not placed. Steering and pedals go in through the
  // same test-input path __apex.act() uses and the car's own physics answers.
  // The human car is a yaw model — steer commands a yaw rate, not a lateral
  // speed — so the follower is Stanley-style: a wanted heading atan(K·e/v)
  // from the cross-track error, steered to with gain Kh against the car's
  // road-relative yaw. K = 4, Kh = 8 measured 0.32 m RMS off the line over a
  // Monza half-lap with no off-road frame (a PD on position alone swung
  // ±12 m; the earlier model nudged `player.x` 5 cm a frame and let the sim
  // integrate the rest, and the self-check read 3.2 m off the line whatever
  // --offset asked — it was measuring an unsteered car). Speed: --pace times
  // a drivable profile (the cornering cap at 0.8 of the grip, braked and
  // accelerated the way driving-line.js sweeps it), never faster than a car
  // within 30 m ahead — a scripted player must not be the one ramming.
  const N = track.n, DS = L / N, vp = new Float64Array(N);
  for (let i = 0; i < N; i++) vp[i] = Math.min(55, Math.sqrt(22 * 0.8 / Math.max(Math.abs(track.curv[i]), 1e-5)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) { const nx = (i + 1) % N; vp[i] = Math.min(vp[i], Math.sqrt(vp[nx] * vp[nx] + 2 * 16 * DS)); }
    for (let i = 0; i < N; i++) { const pv = (i - 1 + N) % N; vp[i] = Math.min(vp[i], Math.sqrt(vp[pv] * vp[pv] + 2 * 6 * DS)); }
  }
  const profileAt = (s) => vp[Math.floor(((s % L) + L) % L / L * N) % N];
  const hwAt = (s) => track.hw[Math.floor(((s % L) + L) % L / L * N) % N];
  for (let f = 0; f < Math.round(SECONDS / DT); f++) {
    const k = track.curv ? track.curv[Math.floor(((player.s % L) + L) % L / L * N) % N] : 0;
    const outside = Math.abs(k) > 0.004 ? (k > 0 ? 1 : -1) : 0;   // +κ is a left turn: its outside is +x
    const lineX = TL.at(track, player.s).x;
    let want = lineX + OFFSET * outside;
    // A REASONABLE HUMAN: never steer into a car alongside, and keep the clear
    // gap off one that is already inside it. Without this the follower chases
    // its line straight into an AI beside it and the bench books the touch to
    // the AI (first cut of the driven player: 6 of 9 first touches had the AI
    // BEHIND the player, i.e. the player came across on it).
    for (const c of ai) {
      if (c.retired || c.finished) continue;
      const dp = wrap(c.prog - player.prog); if (Math.abs(dp) > 6.5) continue;
      const dx = c.x - player.x; if (Math.abs(dx) >= CLEAR + 0.6) continue;
      if ((want - player.x) * dx > 0) want = player.x;                      // do not close on it
      if (Math.abs(dx) < CLEAR) want = dx > 0 ? Math.min(want, c.x - CLEAR) : Math.max(want, c.x + CLEAR);   // open the gap
    }
    want = Math.max(-(hwAt(player.s) - 0.8), Math.min(hwAt(player.s) - 0.8, want));
    // Self-check only where the line is SETTLED (not crossing the road at a
    // chicane, where any follower lags the crossing and the lag reads as
    // "outside" in both halves — 3-4 m through Monza's first chicane at any
    // pace, measured, against 0.3-0.5 m through Curva Grande).
    if (outside && Math.abs(TL.at(track, player.s + 4).x - TL.at(track, player.s - 4).x) < 1.2) { offSum += (player.x - lineX) * outside; offN++; }
    const psiD = Math.atan(4 * (want - player.x) / Math.max(player.speed, 5));
    const steer = Math.max(-1, Math.min(1, 8 * (psiD - (player.yawVis || 0))));
    let vT = PACE * 0.95 * profileAt(player.s + 8);
    // ...and do not run into the car ahead in our lane: match it, and back off
    // when inside ten metres of it.
    for (const c of ai) {
      if (c.retired || c.finished) continue;
      const dd = wrap(c.prog - player.prog);
      if (dd > 0 && dd < 30 && Math.abs(c.x - player.x) < 2.6) vT = Math.min(vT, c.speed - (dd < 10 ? 1.5 : 0));
    }
    g.apex.setInput({ steer, throttle: player.speed < vT - 0.5, brake: player.speed > vT + 1.0 });
    if (PACE < 1) {
      const near = ai.some((c) => !c.retired && !c.finished && Math.abs(wrap(c.prog - player.prog)) < 40);
      aloneT = near ? 0 : aloneT + DT;
      if (aloneT >= REINSERT_S) { reinsert(f * DT); aloneT = 0; }
    }
    g.step(1, DT);
    const counting = f * DT - insertedAt > INSERT_GRACE_S;
    for (const c of ai) {
      if (c.retired || c.finished) continue;
      if ((c.hYieldT || 0) > leanMax) leanMax = c.hYieldT || 0;
      const dp = wrap(c.prog - player.prog);
      const ct = c.contactT || 0, was = prevContact.get(c) || 0;
      prevContact.set(c, ct);
      if (counting && ct > 0 && was <= 0 && Math.abs(dp) < LCAR + 1 && Math.abs(player.x - c.x) < CLEAR + 0.5) {
        const dx = Math.abs(player.x - c.x), adp = Math.abs(dp);
        const kind = adp <= Ai.sideLevel() ? "side" : dx < 1.4 ? "rearEnd" : "diagonal";
        events[kind]++;
        if (dp > 0) events.aiAhead++; else events.aiBehind++;
        if (events.list.length < 12) events.list.push({ t: +(f * DT).toFixed(1), s: Math.round(player.s), kind, dprog: +dp.toFixed(1), dx: +dx.toFixed(2), car: c.code });
      }
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
    // First-touch geometry, as counts and per 100 s of race (see the loop).
    reinserts, insertTimes,
    // Self-check on the player model: where the player actually sat relative
    // to the line inside settled corners (+ toward the outside; chicane
    // crossings excluded, see the loop). Should read ≈ --offset.
    playerOffsetInCornersM: +(offSum / (offN || 1)).toFixed(2),
    contactEvents: {
      total: events.rearEnd + events.side + events.diagonal,
      per100s: +((events.rearEnd + events.side + events.diagonal) * 100 / SECONDS).toFixed(2),
      rearEnd: events.rearEnd, side: events.side, diagonal: events.diagonal,
      aiAheadOnArc: events.aiAhead, aiBehindOnArc: events.aiBehind,
      first: events.list,
    },
  };
}

const rows = [];
for (let r = 0; r < RUNS; r++) rows.push(await measure(r + 1));
const model = (OFFSET ? `holds the racing line ${OFFSET} m toward the outside of each corner` : "holds the racing line") +
  (PACE < 1 ? ` at ${Math.round(PACE * 100)} % of the field's median pace, re-inserted into the pack when alone` : " at median field pace");
const out = { track: TRACK, seconds: SECONDS, wear: WEAR, runs: RUNS, offsetM: OFFSET, pace: PACE, playerModel: model, rows };
if (JSON_OUT) { console.log(JSON.stringify(out, null, 2)); process.exit(0); }
console.log(`ai-human — ${TRACK}, ${SECONDS}s, ${RUNS} run(s), tyre wear ${WEAR}; player ${model}\n`);
for (const r of rows) {
  console.log(`  seed ${r.seed}: ${r.alongsideFrames} alongside frames, mean gap ${r.meanGapM} m, contact ${r.contactPct}%` +
              `, player ${r.playerOffsetInCornersM} m off the line in corners, ${r.reinserts} re-insertion(s)${r.insertTimes.length ? " at " + r.insertTimes.join("/") + " s" : ""}` +
              (r.framesWithNoContactReading ? `  [!] ${r.framesWithNoContactReading} frames had NO contact reading` : ""));
  const e = r.contactEvents;
  console.log(`    contact events: ${e.total} (${e.per100s}/100 s) — rear-end ${e.rearEnd}, side ${e.side}, diagonal ${e.diagonal}; AI ahead on arc ${e.aiAheadOnArc}, behind ${e.aiBehindOnArc}` +
              (e.first.length ? `\n      first: ${e.first.slice(0, 6).map((v) => `${v.kind}@${v.s}m t=${v.t}s (dprog ${v.dprog}, dx ${v.dx}, ${v.car})`).join("; ")}` : ""));
  console.log(`    elected to yield — AI ${r.elections.aiTakesIt}% / HUMAN ${r.elections.humanTakesIt}%` +
              `   (branches: behind ${r.elections.byBranch.playerBehindOnArc}% / ahead ${r.elections.byBranch.playerAheadOnArc}% / level ${r.elections.byBranch.levelOnArc}%)`);
  console.log(`    AI-vs-AI control: ${r.aiVsAiControl.frames} frames, a yielder in ${r.aiVsAiControl.pairsWithAYielderPct}%`);
  console.log(`    longest intruding episode (the AI took the role at ${r.graceSec}s of it): ${r.longestLeanSec}s\n`);
}
console.log("  Counts are not comparable across a behaviour change (the race reshuffles); compare rates over several seeds.");
