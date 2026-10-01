#!/usr/bin/env node
/**
 * @doc AI racecraft over N laps: intervals in s, stuck-behind-slower, attack conversion, swap-backs (+ --mode human).
 * @skill ai-racecraft
 * ai-tactics.mjs — the questions ai-field cannot answer, over N laps and N seeds.
 *
 * ai-field counts what the field DOES in a window (flips, dwell in metres,
 * attacks). This one asks whether it RACES: are the gaps a train or a race
 * (intervals in SECONDS off 10 m checkpoints, F1-style), does a faster car get
 * stuck behind a slower one (episodes over 10 s / 30 s), do attacks convert,
 * does a pass stick or swap straight back (swapBackPct: a pair's flip within
 * 15 s of its previous flip), how long side-by-side lasts, AI-AI contact, and
 * lap 1 separately (byLap[0].within05: the share of intervals under 0.5 s).
 *
 * AI-ONLY BY DEFAULT, AND REALLY: the VM's player has no input, and before
 * 2026-10-01 every AI instrument raced around it PARKED on its grid box (the AI
 * attacked it 7-10 times a race; 11-21 % of passes were within 60 m of it).
 * game-vm's aiOnly() hands it to the AI and retires it, so it is out of every
 * scan. `atkOnPlayer` must read 0 in field mode — the self-check.
 *
 * --mode human races a SCRIPTED player (tools/check/ai-human.mjs's model: the
 * baked line at --pace x the field's median pace, driven through setInput,
 * re-inserted into traffic when alone). vsPlayer adds: AI attacks on the player
 * and how many began in a corner, contact episodes per 100 s, and
 * zeroYieldPct — frames an AI is alongside the player inside the clear gap
 * while AiDrive.sideYieldsA elects the HUMAN and the AI's grace timer has not
 * flipped it (nobody yields: the human runs no protocol).
 *
 *   node tools/check/ai-tactics.mjs --track monza --laps 8 --runs 5
 *   node tools/check/ai-tactics.mjs --mode human --pace 0.97 --runs 5
 *   node tools/check/ai-tactics.mjs --track monaco --json --out artifacts/x.json
 *
 * --wear off|light|real (default off, the VM pin). Sim time: deterministic per
 * seed; a run is ~1-3 min wall per 8 laps. --runs varies the seed (and so the
 * FIELD, as ai-field explains) — compare medians, not single runs.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wearArg } from "../lib/cli-args.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] != null && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
if (argv.includes("--help") || argv.includes("-h")) {
  console.log("ai-tactics [--track monza] [--laps 8] [--runs 1] [--seed 1] [--diff normal] [--mode field|human] [--pace 0.97] [--wear off] [--json] [--out file.json]");
  process.exit(0);
}
const TRACK = flag("track", "monza"), LAPS = Math.max(1, +flag("laps", 8) || 8), RUNS = Math.max(1, Math.min(25, +flag("runs", 1) || 1)), SEED0 = +flag("seed", 1) || 1;
const DIFF = flag("diff", "normal"), MODE = flag("mode", "field"), PACE = +flag("pace", 0.97), OUT = flag("out", null), JSON_OUT = argv.includes("--json");
const WEAR = wearArg(argv);
const DT = 1 / 60;
const med = (a) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2; };
const pctl = (a, p) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y); return q[Math.min(q.length - 1, Math.floor(p * q.length))]; };
const r2 = (v, d = 2) => v == null ? null : +v.toFixed(d);
const share = (a, f) => a.length ? r2(100 * a.filter(f).length / a.length, 1) : null;
function spearman(a, b) { const n = a.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (a[i] - b[i]) ** 2; return 1 - 6 * d2 / (n * (n * n - 1)); }

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: DIFF, tyreWear: WEAR } });
  g.apex.seed(seed); await g.race(TRACK, null, null, { laps: LAPS });
  const humanMode = MODE === "human";
  const player = g.G.cars.find((c) => c.isPlayer || c.human);
  if (!humanMode) g.aiOnly();   // the player is OUT of the field, not parked in it
  const S = g.sandbox, Ai = S.AiDrive, TL = S.TrackLine, Tr = S.Tracks;
  const track = g.G.track, all = g.G.cars, L = track.total, N = track.n;
  const ai = all.filter((c) => c !== player && !c.human);
  const wrap = (d) => ((d + L / 2) % L + L) % L - L / 2;
  const curvAt = (s) => Tr.curvature(track, ((s % L) + L) % L);
  const hwAt = (s) => track.hw[Math.floor(((s % L) + L) % L / L * N) % N];
  const CLEAR = Ai.minLatGap(5, !!track.street);
  const pace = new Map(ai.map((c) => [c, c.tierV * c.skill]));
  const racers = humanMode ? ai.concat([player]) : ai;   // AI-only metrics always exclude the player
  const paceMed = med([...pace.values()]);
  if (humanMode) pace.set(player, paceMed * PACE);
  let atkOnPlayer = 0;

  // --- scripted player (verbatim model from tools/check/ai-human.mjs) ---
  const vp = new Float64Array(N), DS = L / N;
  for (let i = 0; i < N; i++) vp[i] = Math.min(55, Math.sqrt(22 * 0.8 / Math.max(Math.abs(track.curv[i]), 1e-5)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = N - 1; i >= 0; i--) { const nx = (i + 1) % N; vp[i] = Math.min(vp[i], Math.sqrt(vp[nx] * vp[nx] + 2 * 16 * DS)); }
    for (let i = 0; i < N; i++) { const pv = (i - 1 + N) % N; vp[i] = Math.min(vp[i], Math.sqrt(vp[pv] * vp[pv] + 2 * 6 * DS)); }
  }
  const profileAt = (s) => vp[Math.floor(((s % L) + L) % L / L * N) % N];
  let aloneT = 0, reinserts = 0, insertedAt = -1e9;
  const reinsert = (t) => {
    const live = ai.filter((c) => !c.retired && !c.finished).sort((a, b) => a.prog - b.prog);
    if (live.length < 4) return;
    const lo = live.length >> 2, hi = live.length - lo; let best = null, bestGap = -1;
    for (let i = lo; i < hi - 1; i++) { const gap = live[i + 1].prog - live[i].prog; if (gap > bestGap) { bestGap = gap; best = i; } }
    if (best == null) return;
    const a = live[best], b = live[best + 1];
    player.prog = (a.prog + b.prog) / 2; player.s = ((player.prog % L) + L) % L;
    player.x = TL.at(track, player.s).x; player.speed = a.speed; reinserts++; insertedAt = t;
    cp.set(player, null);   // checkpoint history invalid after a teleport
  };
  function drivePlayer(t) {
    const lineX = TL.at(track, player.s).x; let want = lineX;
    for (const c of ai) {
      if (c.retired || c.finished) continue;
      const dp = wrap(c.prog - player.prog); if (Math.abs(dp) > 6.5) continue;
      const dx = c.x - player.x; if (Math.abs(dx) >= CLEAR + 0.6) continue;
      if ((want - player.x) * dx > 0) want = player.x;
      if (Math.abs(dx) < CLEAR) want = dx > 0 ? Math.min(want, c.x - CLEAR) : Math.max(want, c.x + CLEAR);
    }
    want = Math.max(-(hwAt(player.s) - 0.8), Math.min(hwAt(player.s) - 0.8, want));
    const psiD = Math.atan(4 * (want - player.x) / Math.max(player.speed, 5));
    const steer = Math.max(-1, Math.min(1, 8 * (psiD - (player.yawVis || 0))));
    let vT = PACE * 0.95 * profileAt(player.s + 8);
    for (const c of ai) {
      if (c.retired || c.finished) continue;
      const dd = wrap(c.prog - player.prog);
      if (dd > 0 && dd < 30 && Math.abs(c.x - player.x) < 2.6) vT = Math.min(vT, c.speed - (dd < 10 ? 1.5 : 0));
    }
    g.apex.setInput({ steer, throttle: player.speed < vT - 0.5, brake: player.speed > vT + 1.0 });
    if (PACE < 1 && t > 12) {
      const near = ai.some((c) => !c.retired && !c.finished && Math.abs(wrap(c.prog - player.prog)) < 40);
      aloneT = near ? 0 : aloneT + DT;
      if (aloneT >= 4) { reinsert(t); aloneT = 0; }
    }
  }

  // --- checkpoint histories for time intervals (every 10 m of prog) ---
  const CPM = 10, OFF = 100;
  const cp = new Map(racers.map((c) => [c, null]));
  function cpUpdate(c, t) {
    let h = cp.get(c);
    if (!h) { h = { t: [], base: Math.floor(c.prog / CPM) + 1 }; cp.set(c, h); }
    while ((h.base + h.t.length) * CPM <= c.prog) h.t.push(t);
  }
  function interval(f, l, t) {   // seconds since leader l passed follower f's current position
    const h = cp.get(l); if (!h) return null;
    const i = Math.floor(f.prog / CPM) - h.base;
    if (i < 0 || i >= h.t.length) return null;
    const frac = (f.prog / CPM) - Math.floor(f.prog / CPM);
    const t0 = h.t[i], t1 = i + 1 < h.t.length ? h.t[i + 1] : t;
    return t - (t0 + (t1 - t0) * frac);
  }

  // --- accumulators ---
  const lapStats = new Map();   // leader lap -> {iv:[], spread:[], trains:[], maxTrain:[]}
  const offFollow = { straight: [], corner: [] }, offFree = { straight: [], corner: [] };
  let followPairs = 0, inLinePairs = 0, offsetPairs = 0;
  const sbs = new Map(); const sbsDur = []; let sbsResolvedPass = 0, sbsEnded = 0;
  const flipsLog = []; const ahead = new Map();
  const attack = new Map(); const attacks = []; const myAtk = new Map(); // {by, of, t, s, ok}
  const stuck = new Map(); const stuckEp = []; let stuckS = 0, stuckBigS = 0, followS = 0;
  const contactKeys = new Set(); let aaContactEp = 0, apContactEp = 0;
  const hits0 = ai.reduce((a, c) => a + (c.hits || 0), 0);
  const covers = { vsPlayer: 0, vsAI: 0 }, wasDef = new Map();
  const vsP = { zeroYield: 0, alongFrames: 0, alongDx: [], under: 0, aiPassP: [], encounters: [], encOpen: new Map() };
  const startOrder = racers.slice().sort((a, b) => b.prog - a.prog);
  const SB_DPROG = 5.0, SB_DX = 4.5;
  let t = 0, endT = null;

  const maxF = Math.round((LAPS * L / 40 + 120) / DT);
  for (let f = 0; f < maxF; f++, t += DT) {
    if (humanMode) drivePlayer(t);
    g.step(1, DT);
    const leaderDone = ai.some((c) => c.finished);
    if (leaderDone) { endT = t; break; }
    for (const c of racers) if (!c.retired) cpUpdate(c, t);
    // per-frame edges: attack latch, cover
    for (const c of ai) {
      const po = c.passOf || null, prev = attack.get(c) || null;
      if (po !== prev) {
        const my = myAtk.get(c);
        if (prev && my) { my.ok = c.prog > prev.prog; my.dur = r2(t - my.t, 1); my.toPlayer = !!prev.human; my.closed = true; }
        if (po) { const a = { by: c.code, of: po.code, t, s: Math.round(c.s), straight: Math.abs(curvAt(c.s)) < 0.003, q: track.attackQ ? r2(track.attackQ[Math.floor(c.s / L * N) % N]) : null }; attacks.push(a); myAtk.set(c, a); }
        if (po === player) atkOnPlayer++;
        attack.set(c, po);
      }
      const d = c.defendSide || 0, wd = wasDef.get(c) || 0;
      if (d && !wd) {
        // who is the chaser? nearest racer behind within 40 m
        let ch = null, cg = 40; for (const o of racers) { if (o === c || o.finished || o.retired) continue; const g2 = wrap(c.prog - o.prog); if (g2 > 0 && g2 < cg) { cg = g2; ch = o; } }
        if (ch && ch === player) covers.vsPlayer++; else covers.vsAI++;
      }
      wasDef.set(c, d);
    }
    if (f % 15) continue;
    const st = t;
    if (st < 3) continue;
    const live = racers.filter((c) => !c.retired && !c.finished && !c.inPit).sort((a, b) => b.prog - a.prog);
    const lead = live[0]; const lap = Math.max(0, Math.floor(lead.prog / L));
    if (!lapStats.has(lap)) lapStats.set(lap, { iv: [], spread: [], trains3: [], maxTrain: [], ivAI: [] });
    const LS = lapStats.get(lap);
    // intervals and trains (AI-only chain, player excluded from train counting in field mode by construction)
    const ivs = [];
    for (let i = 1; i < live.length; i++) ivs.push(interval(live[i], live[i - 1], st));
    let run = 1, trains3 = 0, maxTrain = 1;
    for (let i = 0; i < ivs.length; i++) {
      const v = ivs[i]; if (v != null) LS.iv.push(v);
      if (v != null && v < 1.0) run++; else { if (run >= 3) trains3++; maxTrain = Math.max(maxTrain, run); run = 1; }
    }
    if (run >= 3) trains3++; maxTrain = Math.max(maxTrain, run);
    LS.trains3.push(trains3); LS.maxTrain.push(maxTrain);
    const sp = interval(live[live.length - 1], lead, st); if (sp != null) LS.spread.push(sp);

    // lateral, following vs free, in-line trains, stuck
    for (let i = 0; i < live.length; i++) {
      const c = live[i]; if (c === player) continue;
      const k = Math.abs(curvAt(c.s)); const zone = k < 0.002 ? "straight" : "corner";
      const off = Math.abs(c.x - TL.at(track, c.s).x);
      const ivA = i > 0 ? ivs[i - 1] : null, ivB = i + 1 < live.length ? ivs[i] : null;
      const following = ivA != null && ivA < 1.0;
      const free = (ivA == null || ivA > 2.0) && (ivB == null || ivB > 1.0);
      if (following) offFollow[zone].push(off); else if (free) offFree[zone].push(off);
      if (following) {
        const l = live[i - 1]; const dx = Math.abs(c.x - l.x), gap = l.prog - c.prog;
        followPairs++; followS += 0.25;
        if (gap < 25 && dx < 1.0) inLinePairs++; else if (dx >= 1.5) offsetPairs++;
        const dpace = (pace.get(c) / pace.get(l) - 1) * 100;
        const key = c.code + "<" + l.code;
        if (dpace > 0.3) { stuckS += 0.25; if (dpace > 1.0) stuckBigS += 0.25; const e = stuck.get(key) || { t0: st, dpace, f: c.code, l: l.code }; e.t1 = st; stuck.set(key, e); }
      }
    }
    for (const [key, e] of [...stuck]) if (st - e.t1 > 0.3) { stuckEp.push(e); stuck.delete(key); }

    // pairwise: flips, side-by-side, contact
    for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i], b = racers[j];
      if (a.finished || b.finished || a.retired || b.retired) continue;
      const k = a.code + "|" + b.code, isP = a === player || b === player;
      const now = a.prog > b.prog;
      if (ahead.has(k) && ahead.get(k) !== now && !(isP && st - insertedAt < 3)) {
        const over = now ? a : b, under = now ? b : a;
        const kA = curvAt(over.s + 60), kh = Math.abs(curvAt(over.s));
        const dx = over.x - under.x;
        flipsLog.push({ t: r2(st, 2), pair: k, over: over.code, under: under.code, s: Math.round(over.s),
          straight: kh < 0.002, inside: Math.abs(kA) > 0.003 ? (Math.sign(dx) === -Math.sign(kA)) : null, side: dx > 0 ? "R" : "L",
          dx: r2(dx), aero: over.aeroX > 0.5, ot: over.otT > 0, tow: over.towing > 0.05,
          q: track.attackQ ? r2(track.attackQ[Math.floor(over.s / L * N) % N]) : null,
          dpace: r2((pace.get(over) / pace.get(under) - 1) * 100), player: isP ? (over === player ? "playerPasses" : "aiPassesPlayer") : null });
      }
      ahead.set(k, now);
      if (isP && st - insertedAt < 3) { sbs.delete(k); continue; }
      const dp = wrap(a.prog - b.prog), adx = Math.abs(a.x - b.x);
      const along = Math.abs(dp) < SB_DPROG && adx < SB_DX;
      if (along) { if (!sbs.has(k)) sbs.set(k, { t0: st, aAhead0: dp > 0, isP }); sbs.get(k).t1 = st; }
      else if (sbs.has(k)) { const e = sbs.get(k); sbs.delete(k); if (!e.isP) { sbsDur.push(e.t1 - e.t0 + 0.25); sbsEnded++; if ((dp > 0) !== e.aAhead0) sbsResolvedPass++; } }
      const on = Math.abs(dp) < 4.8 && adx < 2.0;
      if (on) { if (!contactKeys.has(k)) { contactKeys.add(k); if (isP) apContactEp++; else aaContactEp++; } } else contactKeys.delete(k);
      if (isP && Math.abs(dp) < 5.5) {
        vsP.alongFrames++; vsP.alongDx.push(adx);
        if (adx < CLEAR) {
          vsP.under++;
          // WHO YIELDS? the AI's own election (sideYieldsA from the AI's side), or its grace timer.
          const aiC = a === player ? b : a, dpAi = wrap(player.prog - aiC.prog);
          const aiYields = Ai.sideYieldsA(-dpAi, aiC.x, player.x) || Ai.humanYieldTakes(aiC.hYieldT);
          if (!aiYields) vsP.zeroYield++;
        }
      }
    }
    // encounters with the player: AI within 1 s behind the player -> how long until it is past
    if (humanMode && st - insertedAt > 3) {
      for (const c of ai) {
        if (c.finished || c.retired) continue;
        const dp = wrap(player.prog - c.prog);
        const iv = dp > 0 ? interval(c, player, st) : null;
        const open = vsP.encOpen.get(c);
        if (iv != null && iv < 1.0 && dp > 0) { if (!open) vsP.encOpen.set(c, { t0: st }); }
        else if (open) { vsP.encOpen.delete(c); vsP.encounters.push({ dur: st - open.t0, passed: dp < 0 }); }
      }
    } else if (humanMode) vsP.encOpen.clear();
  }
  if (endT == null) endT = t;

  // --- reduce ---
  const pairFlips = new Map(); for (const e of flipsLog) { if (!pairFlips.has(e.pair)) pairFlips.set(e.pair, []); pairFlips.get(e.pair).push(e); }
  // SWAP-BACK: a flip that undoes the same pair's previous flip within 15 s.
  let swapBacks = 0; for (const [, es] of pairFlips) es.forEach((e, i) => { if (i > 0 && !e.player && e.t - es[i - 1].t < 15) swapBacks++; });
  const settled = [];
  for (const [, es] of pairFlips) es.forEach((e, i) => { const nx = es[i + 1]; if (!nx || nx.t - e.t > 15) { if (!(i > 0 && e.t - es[i - 1].t < 15)) settled.push(e); } });
  const aiSettled = settled.filter((e) => !e.player);
  const lapRows = [...lapStats.entries()].sort((a, b) => a[0] - b[0]).map(([lap, s]) => ({
    lap: lap + 1, medIntervalS: r2(med(s.iv)), within05: share(s.iv, (v) => v < 0.5), within1: share(s.iv, (v) => v < 1.0),
    spreadS: r2(med(s.spread), 1), trains3: r2(med(s.trains3), 1), maxTrain: r2(med(s.maxTrain), 1) }));
  const endOrder = racers.slice().sort((a, b) => (b.finished ? 1e9 - b.finPos : b.prog) - (a.finished ? 1e9 - a.finPos : a.prog));
  const aiStart = startOrder.filter((c) => c !== player), aiEnd = endOrder.filter((c) => c !== player);
  const byPace = ai.slice().sort((a, b) => pace.get(b) - pace.get(a));
  const rk = (arr) => new Map(arr.map((c, i) => [c, i]));
  const rS = rk(aiStart), rE = rk(aiEnd), rP = rk(byPace);
  const posChg = ai.map((c) => Math.abs(rS.get(c) - rE.get(c)));
  const atkAI = attacks.filter((a) => a.closed && !a.toPlayer), atkP = attacks.filter((a) => a.closed && a.toPlayer);
  const stuckAll = stuckEp.concat([...stuck.values()]).map((e) => ({ ...e, dur: e.t1 - e.t0 + 0.25 }));
  const pv = [...ai.map((c) => pace.get(c))];
  const sortedP = pv.slice().sort((a, b) => b - a); const adj = []; for (let i = 1; i < sortedP.length; i++) adj.push((sortedP[i - 1] / sortedP[i] - 1) * 100);
  const lapEst = L / 80; // rough s/lap scale for converting % -> s/lap is printed via ai-pace instead
  const res = {
    seed, track: TRACK, laps: LAPS, mode: MODE, raceSeconds: r2(endT, 0), cars: ai.length,
    pace: { spreadPct: r2((Math.max(...pv) / Math.min(...pv) - 1) * 100), medianAdjacentPct: r2(med(adj), 3),
      gridVsPace: r2(spearman(ai.map((c) => rS.get(c)), ai.map((c) => rP.get(c)))), finishVsPace: r2(spearman(ai.map((c) => rE.get(c)), ai.map((c) => rP.get(c)))) },
    byLap: lapRows,
    passes: { flipsAI: flipsLog.filter((e) => !e.player).length, settledAI: aiSettled.length,
      swapBackPct: r2(100 * swapBacks / Math.max(1, flipsLog.filter((e) => !e.player).length), 1),
      settledPerCarPerLap: r2(aiSettled.length / ai.length / LAPS, 3),
      onStraightPct: share(aiSettled, (e) => e.straight), insidePct: share(aiSettled.filter((e) => e.inside != null), (e) => e.inside),
      leftPct: share(aiSettled, (e) => e.side === "L"), aeroOpenPct: share(aiSettled, (e) => e.aero), towPct: share(aiSettled, (e) => e.tow), otModePct: share(aiSettled, (e) => e.ot),
      inAttackZoneQ05Pct: share(aiSettled, (e) => e.q != null && e.q >= 0.5), medPassDxM: r2(med(aiSettled.map((e) => Math.abs(e.dx)))),
      byFasterPct: share(aiSettled, (e) => e.dpace > 0), medPaceDeltaPct: r2(med(aiSettled.map((e) => e.dpace)), 3),
      hotSpots: Object.entries(aiSettled.reduce((m, e) => { const b = Math.round(e.s / 100) * 100; m[b] = (m[b] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 5),
      posChangeMean: r2(posChg.reduce((a, b) => a + b, 0) / posChg.length), posChangeMax: Math.max(...posChg), carsUnchanged: posChg.filter((v) => v === 0).length },
    attacks: { total: atkAI.length, success: atkAI.filter((a) => a.ok).length, successPct: share(atkAI, (a) => a.ok), medDurS: r2(med(atkAI.map((a) => a.dur)), 1),
      startedOnStraightPct: share(atkAI, (a) => a.straight), perCarPerLap: r2(atkAI.length / ai.length / LAPS, 2) },
    stuck: { followCarS: r2(followS, 0), followPctOfCarTime: r2(100 * followS / (ai.length * endT), 1),
      fasterBehindSlowerS: r2(stuckS, 0), shareOfFollowingPct: r2(100 * stuckS / Math.max(followS, 1), 1), paceGap1pctS: r2(stuckBigS, 0),
      episodesOver10s: stuckAll.filter((e) => e.dur > 10).length, episodesOver30s: stuckAll.filter((e) => e.dur > 30).length,
      longest: stuckAll.sort((a, b) => b.dur - a.dur).slice(0, 3).map((e) => `${e.f}<${e.l} ${e.dur.toFixed(0)}s +${e.dpace.toFixed(2)}%`) },
    lateral: {
      followStraightMedM: r2(med(offFollow.straight)), followStraightOnLinePct: share(offFollow.straight, (v) => v < 0.75), followStraightP90M: r2(pctl(offFollow.straight, 0.9)),
      freeStraightMedM: r2(med(offFree.straight)), freeStraightOnLinePct: share(offFree.straight, (v) => v < 0.75),
      followCornerMedM: r2(med(offFollow.corner)), followCornerOnLinePct: share(offFollow.corner, (v) => v < 0.75),
      freeCornerMedM: r2(med(offFree.corner)), freeCornerOnLinePct: share(offFree.corner, (v) => v < 0.75),
      followInLinePct: r2(100 * inLinePairs / Math.max(followPairs, 1), 1), followOffsetPct: r2(100 * offsetPairs / Math.max(followPairs, 1), 1) },
    sideBySide: { episodes: sbsDur.length, medS: r2(med(sbsDur)), p90S: r2(pctl(sbsDur, 0.9)), maxS: r2(Math.max(0, ...sbsDur)), over3s: sbsDur.filter((v) => v > 3).length, resolvedAsPassPct: r2(100 * sbsResolvedPass / Math.max(sbsEnded, 1), 1) },
    contact: { aiAiEpisodes: aaContactEp, aiPlayerEpisodes: apContactEp, aiHitsOnPlayer: ai.reduce((a, c) => a + (c.hits || 0), 0) - hits0 },
    covers, atkOnPlayer, playerXEnd: r2(player.x), playerProgEnd: r2(player.prog, 0),
  };
  if (humanMode) {
    const pf = flipsLog.filter((e) => e.player === "aiPassesPlayer"), ps = settled.filter((e) => e.player === "aiPassesPlayer");
    const enc = vsP.encounters;
    res.vsPlayer = { reinserts, aiFlipsOnPlayer: pf.length, aiSettledPassesOnPlayer: ps.length,
      passOnStraightPct: share(ps, (e) => e.straight), passLeftPct: share(ps, (e) => e.side === "L"), medPassDxM: r2(med(ps.map((e) => Math.abs(e.dx)))),
      minPassDxM: ps.length ? r2(Math.min(...ps.map((e) => Math.abs(e.dx)))) : null,
      attacksOnPlayer: atkP.length, attacksOnPlayerInCorner: atkP.filter((a) => !a.straight).length, attackSuccessPct: share(atkP, (a) => a.ok),
      contactPer100s: r2(100 * apContactEp / Math.max(endT, 1)), zeroYieldPct: r2(100 * vsP.zeroYield / Math.max(vsP.under, 1), 1),
      encounters: enc.length, encPassedPct: share(enc, (e) => e.passed), encMedS: r2(med(enc.map((e) => e.dur)), 1), encP90S: r2(pctl(enc.map((e) => e.dur), 0.9), 1),
      alongFrames: vsP.alongFrames, alongMedDxM: r2(med(vsP.alongDx)), alongUnderClearPct: r2(100 * vsP.under / Math.max(vsP.alongFrames, 1), 1), clearM: r2(CLEAR),
      coversVsPlayer: covers.vsPlayer, coversVsAI: covers.vsAI };
  }
  g.close();
  return res;
}

const rows = [];
for (let i = 0; i < RUNS; i++) { const r = await measure(SEED0 + i); rows.push(r); process.stderr.write(`run ${i + 1}/${RUNS} done (${r.raceSeconds}s sim)\n`); }
const out = { track: TRACK, laps: LAPS, mode: MODE, pace: MODE === "human" ? PACE : null, diff: DIFF, wear: WEAR, runs: RUNS, rows };
if (OUT) fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
if (JSON_OUT) { console.log(JSON.stringify(out)); process.exit(0); }
// compact console summary: medians over runs of the scalar leaves
function flat(o, p = "", acc = {}) { for (const [k, v] of Object.entries(o)) { if (v && typeof v === "object" && !Array.isArray(v)) flat(v, p + k + ".", acc); else if (typeof v === "number") acc[p + k] = v; } return acc; }
const fl = rows.map((r) => flat(r));
const keys = Object.keys(fl[0]).filter((k) => !k.startsWith("byLap") && k !== "seed");
console.log(`${TRACK} ${MODE} ${LAPS} laps x ${RUNS} runs — median [min..max]`);
for (const k of keys) { const v = fl.map((f) => f[k]).filter((x) => x != null); if (!v.length) continue; console.log(`  ${k.padEnd(38)} ${r2(med(v), 3)}  [${Math.min(...v)}..${Math.max(...v)}]`); }
console.log("  byLap (run 1):"); for (const l of rows[0].byLap) console.log("   ", JSON.stringify(l));
for (const r of rows) console.log(`  seed ${r.seed} stuck longest: ${r.stuck.longest.join("; ")} | pass hotspots ${JSON.stringify(r.passes.hotSpots)}`);
