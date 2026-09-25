/* Apex 26 — RACE RADIO: the race engineer's situational awareness and the TV
 * commentator, on the one radio card (js/game.js announce()).
 *
 * WHAT WAS THERE. The engineer (js/race/engineer.js) knew the TYRES and the pit
 * plan and nothing else; the race around the player — who passed whom, whether
 * the car ahead is coming back, how many laps are left, a safety car — reached
 * the banner as a flag chip or not at all. And the announcer spoke once, over
 * the loading screen, then left the race in silence.
 *
 * THE SHAPE, from how Crew Chief (the open-source sim-racing engineer) and
 * Valve's dynamic dialogue do it:
 *
 *   FACTS  js/race/race-facts.js: a timing loop, held passes, edge events.
 *   RULES  below: each one is a situation, a tier and a phrasebook pool. Event
 *          rules fire on an edge ("you gained a place"); state rules are
 *          re-checked twice a second ("the gap ahead is closing").
 *   QUEUE  per channel, newest-per-rule. A pending line EXPIRES (ttl) and is
 *          DROPPED the moment it stops being true (`still`) — a "defend" call
 *          for a car that has already dropped back is a lie, not a message.
 *   GATE   tier 5 (flags, the result, the last lap) always goes; below that,
 *          the card must be free, the chatter level must allow it, the spacing
 *          since the last line must have run out, and the driver must NOT be
 *          braking or loaded up in a corner — the rule real engineers keep and
 *          Crew Chief's "don't talk in corners" option is named after.
 *   WORDS  js/race/radio-lines.js deals the phrasing from a deck, so no line
 *          repeats until its pool has been used up.
 *
 * TWO CHANNELS. The ENGINEER talks to the driver ("info", or "race" at tier 5).
 * The COMMENTATOR talks to the viewer ("comm", the lowest priority): by default
 * only while a TV camera is up, the HUD is in broadcast mode, or the player's
 * own race is over — the moments the player is watching rather than driving.
 * The Commentary setting can turn it on for every camera, or off.
 *
 * READ-ONLY on the sim: it reads the G façade and writes nothing but announce()
 * calls and its own settings, so it can never move a car (docs/PHYSICS.md).
 */
const RaceRadio = (function () {
  "use strict";

  const CHAT = Object.freeze(["off", "key", "normal", "chatty"]);
  const COMM = Object.freeze(["off", "tv", "on"]);
  // Minimum seconds between two engineer lines, by chatter level. Tier 5 ignores it.
  const GAP_S = Object.freeze([Infinity, 18, 9, 5]);
  // Between two commentary lines. 6 s read as a line every breath on ALWAYS
  // (a 22-car soak, 2026-09-24: ~60 lines in six minutes); a broadcast booth
  // leaves room. Colour (battles, the gap, a charge) waits half as long again.
  const COMM_GAP_S = 10;
  const AFTER_ENG_S = 2.5;      // commentary lets an engineer line breathe
  const EVAL_S = 0.5;           // state rules are re-checked this often
  const SETTLE_S = 10;
  const POS_HOLD_S = 8;         // a position call waits this long after the last one, then says the net change          // no gap talk in the opening seconds: the field is still sorting itself out
  const TV_CAMS = Object.freeze(["heli", "side", "cinematic", "low", "overhead"]);
  // THE CORNER RULE. Braking, or leaning on the tyres through a corner, is
  // where the driver has no attention to spare: below tier 5 the line waits for
  // the straight. Fractions of the car's own lateral limit (G.LAT_MAX).
  const LOAD_BRAKE = 0.15, LOAD_LAT = 0.5;

  /** Card duration for a line — long enough to read and to speak it. */
  function durFor(text) {
    const words = String(text).split(/\s+/).filter(Boolean).length;
    return Math.min(5, Math.max(2.4, words * 0.38 + 1.0));
  }

  function create(G, opts) {
    Log.info("race", "RaceRadio.create");
    const o = opts || {};
    const facts = RaceFacts.create();
    let lines = RadioLines.create(o.seed || 1);
    const store = G.store;
    const readSetting = (k, list, def) => {
      const v = store && store.get ? store.get(k, def) : def;
      return list.indexOf(v) >= 0 ? v : def;
    };
    let chat = readSetting("radioChat", CHAT, "normal");
    let comm = readSetting("commentary", COMM, "tv");

    let live = false, evalT = 0, t = 0, lastCars = null;
    let m = null;
    const queue = { eng: new Map(), tv: new Map() };
    const log = [];

    function freshMemory() {
      return {
        said: new Map(),          // rule/cooldown key -> t last said
        once: new Set(),          // once-per-race keys
        passedBy: new Map(),      // car -> t it passed the player
        tvPairs: new Set(),       // "a>b" passes already told on TV
        charged: new Set(),       // cars already called "on a charge"
        laps: [],                 // the player's recent valid lap times
        defending: null,          // the car the last defend call named
        toldPos: null,            // the position the driver was last told
        wasPit: false,            // the player was in the pit lane last tick
        pitLap: -9,               // the lap the player was last in the pit lane (in-lap / out-lap are not pace)
        cautionLap: -9,           // …and last ran under a caution: a lap that ends green was mostly neutralised
        bestPos: 99,
        eng: -99, tv: -99,        // t of the last line on each channel
      };
    }

    function reset() {
      facts.reset();
      lines = RadioLines.create((o.seed || 1) + ((G.raceRound | 0) * 7919));
      queue.eng.clear(); queue.tv.clear();
      m = freshMemory(); evalT = 0; t = 0;
    }
    reset();

    const S = RadioLines.surname, gapT = RadioLines.gapText, timeT = RadioLines.timeText;
    const lvl = () => CHAT.indexOf(chat);
    const inPits = (c) => !!(c && c.pitState && c.pitState !== "none");
    const cool = (key, cd) => !(m.said.has(key) && t - m.said.get(key) < cd);
    /** A `still` for a line that names a position: dropped once the player's
     *  place (or whatever `and` checks) is no longer what it says — the line
     *  waited behind others and would otherwise be read out stale. */
    const samePos = (pos, and) => () => { const g = f2(); return (g.rawPos || g.pos) === pos && (!and || and()); };

    /** Offer a line. `c` = { id, ch, tier, chat, key, vars, ttl, cd, cdKey, once, still, onSaid, hold } */
    function offer(c) {
      if (c.ch === "eng" && (c.chat || 2) > lvl()) return;
      const cdKey = c.cdKey || c.id;
      if (c.once && m.once.has(c.once)) return;
      if (c.cd && !cool(cdKey, c.cd)) return;
      c.cdKey = cdKey;
      c.born = t; c.exp = t + (c.ttl || 6);
      queue[c.ch].set(c.id, c);
    }

    function best(ch) {
      let out = null;
      for (const [id, c] of queue[ch]) {
        if (t > c.exp || (c.still && !c.still())) { queue[ch].delete(id); continue; }
        if (c.hold && m.said.has(c.cdKey) && t - m.said.get(c.cdKey) < c.hold) continue;   // waits, is not dropped
        if (!out || c.tier > out.tier || (c.tier === out.tier && c.born > out.born)) out = c;
      }
      return out;
    }

    function speak(c, kind) {
      const text = lines.pick(c.key, c.vars);
      if (!text) { queue[c.ch].delete(c.id); return false; }
      // Refused (a full card queue): an URGENT line stays queued and is offered
      // again until its ttl — "LAST LAP" is a once line, and dropping it here
      // lost it for the race. Anything else is dropped, as before.
      if (!G.announce(text, durFor(text), kind)) { if (c.tier < 5) queue[c.ch].delete(c.id); return false; }
      queue[c.ch].delete(c.id);
      m.said.set(c.cdKey, t);
      if (c.once) m.once.add(c.once);
      m[c.ch] = t;
      if (c.onSaid) c.onSaid();
      // The result is the last word: whatever else was queued is now history.
      if (c.id === "result" && c.ch === "eng") queue.eng.clear();
      log.push({ t: +t.toFixed(1), ch: c.ch, id: c.id, tier: c.tier, text });
      if (log.length > 40) log.shift();
      return true;
    }

    function camId() {
      const cams = typeof CamModes !== "undefined" && CamModes.CAM_MODES;
      const cm = cams && cams[G.camMode];
      return cm ? cm.id : "";
    }
    function tvLive(f) {
      if (comm === "off") return false;
      if (comm === "on") return true;
      return TV_CAMS.indexOf(camId()) >= 0 || G.hudProfile === "broadcast" || !!(f && (f.finished || f.retired));
    }

    function underLoad(p) {
      const lat = Math.abs(p.lateralAccel || 0), max = G.LAT_MAX || 30;
      return (p.brakeDemand || 0) > LOAD_BRAKE || lat > max * LOAD_LAT;
    }

    // ── ENGINEER: events ────────────────────────────────────────────────────
    function engineerEvent(e, f, p) {
      // A driver who has taken the flag or retired is off the radio: only their
      // own result is still to come. (Solo that is 2.2 s; in VS FRIEND it is
      // the rest of the race, which used to hear safety cars and "UP TO P5".)
      if ((f.finished || f.retired) && e.type !== "finish" && !(e.type === "retire" && e.car === p)) return;
      const pos = f.rawPos || f.pos;
      switch (e.type) {
        case "playerLap": {
          if (p.finished) break;                        // the flag has its own call; nothing after it
          if (e.lap === 2 && f.gridPos) {
            const d = f.gridPos - pos;
            offer({ id: "lap1", ch: "eng", tier: 3, chat: 1, once: "lap1",
              key: d > 0 ? "eng.lap1Up" : d < 0 ? "eng.lap1Down" : "eng.lap1Same", vars: { pos, n: d }, ttl: 12, still: samePos(pos),
              onSaid: () => { m.toldPos = pos; } });
          }
          if (f.toGo === 1 && f.laps > 1) {
            const vars = { pos, ahead: S(f.ahead), behind: S(f.behind) };
            let key = "eng.lastCalm";
            if (pos === 1) key = "eng.lastLead";
            else if (f.gapA != null && f.gapA < 1.5) { key = "eng.lastAttack"; vars.gap = gapT(f.gapA); }
            else if (f.gapB != null && f.gapB < 1.5) { key = "eng.lastDefend"; vars.gap = gapT(f.gapB); }
            if (key === "eng.lastCalm" && f.gapB != null && f.gapB < 1.5) { key = "eng.lastDefend"; vars.gap = gapT(f.gapB); }
            offer({ id: "last", ch: "eng", tier: 5, chat: 1, once: "last", key, vars, ttl: 10 });
          } else if (f.toGo != null && [10, 5, 3, 2].indexOf(f.toGo) >= 0 && f.toGo < f.laps) {
            offer({ id: "toGo", ch: "eng", tier: 3, chat: f.toGo === 10 ? 3 : 2, once: "toGo" + f.toGo,
              key: "eng.toGo", vars: { left: f.toGo, pos }, ttl: 15, still: samePos(pos) });
          } else if (e.lap > 2 && f.gapA != null && f.gapB != null) {
            offer({ id: "status", ch: "eng", tier: 1, chat: 3, cd: 50, key: "eng.status",
              vars: { pos, gapA: gapT(f.gapA), gapB: gapT(f.gapB) }, ttl: 12, still: samePos(pos) });
          }
          break;
        }
        case "lap": {
          if (e.car !== p || p.finished) break;
          m.laps.push(e.time); if (m.laps.length > 4) m.laps.shift();
          if (f.fastest && f.fastest.car === p && f.fastest.time === e.time && f.lap > 2) {
            offer({ id: "fastest", ch: "eng", tier: 3, chat: 1, cd: 45, key: "eng.fastest", vars: { time: timeT(e.time) }, ttl: 12 });
          } else if (e.pb && f.lap > 2) {
            offer({ id: "pb", ch: "eng", tier: 2, chat: 2, cd: 70, key: "eng.pb", vars: { time: timeT(e.time) }, ttl: 12 });
          } else if (f.best > 0 && e.time > f.best + 1.5 && f.caution === 0 && f.lap > 3 && f.lap - m.pitLap > 1 && f.lap - m.cautionLap > 1) {
            offer({ id: "slow", ch: "eng", tier: 2, chat: 3, cd: 120, key: "eng.slow",
              vars: { time: timeT(e.time), delta: gapT(e.time - f.best) }, ttl: 10 });
          } else if (m.laps.length >= 3) {
            const r = m.laps.slice(-3);
            if (Math.max.apply(null, r) - Math.min.apply(null, r) < 0.35) {
              offer({ id: "steady", ch: "eng", tier: 1, chat: 3, cd: 240, key: "eng.steady", vars: {}, ttl: 10 });
            }
          }
          break;
        }
        case "playerPos": {
          if (f.pitting || p.finished) break;
          m.bestPos = Math.min(m.bestPos, e.prev);
          if (m.toldPos == null) m.toldPos = f.gridPos || e.prev;
          // NET CHANGE SINCE THE LAST CALL. A car swallowed by the field on lap
          // one changes place every second; an engineer does not read out each
          // one — they wait a beat and say "P18, lost five". So one "pos" line
          // is pending at a time (newest wins), it waits POS_HOLD_S after the
          // last position call, and it says the difference from what the
          // driver was last TOLD.
          const told = m.toldPos, n = Math.abs(told - e.pos);
          const onSaid = () => { m.toldPos = e.pos; };
          const base = { id: "pos", ch: "eng", tier: 3, chat: 1, ttl: 10, hold: POS_HOLD_S, cdKey: "pos", onSaid,
            still: () => (f2().rawPos || f2().pos) === e.pos };
          if (n === 0) { queue.eng.delete("pos"); break; }   // back where the driver was told they were
          if (e.pos === 1) { offer(Object.assign(base, { tier: 4, key: "eng.lead", vars: {} })); break; }
          if (e.pos < told) {
            const passed = f.behind;
            if (n >= 2) { offer(Object.assign(base, { key: "eng.gainMany", vars: { pos: e.pos, n } })); break; }
            if (!passed || inPits(passed)) break;       // a stop ahead is not a move
            const back = m.passedBy.has(passed) && t - m.passedBy.get(passed) < 300;
            offer(Object.assign(base, { key: back ? "eng.repass" : "eng.gain", vars: { pos: e.pos, passed: S(passed) } }));
            if (back) m.passedBy.delete(passed);
          } else {
            const by = f.ahead;
            if (by && !inPits(by)) m.passedBy.set(by, t);
            if (n >= 2) offer(Object.assign(base, { key: "eng.lostMany", vars: { pos: e.pos, n } }));
            else if (by && !inPits(by)) {
              offer(Object.assign(base, { key: told === 1 ? "eng.leadLost" : "eng.lost", vars: { pos: e.pos, by: S(by) } }));
            }
            if (e.pos - Math.min(m.bestPos, f.gridPos || 99) >= 3) {
              if (f.toGo == null || f.toGo >= 4) offer({ id: "hurt", ch: "eng", tier: 1, chat: 2, cd: 300, key: "eng.hurt", vars: {}, ttl: 20 });
            }
          }
          break;
        }
        case "retire": {
          if (e.car === p) { offer({ id: "result", ch: "eng", tier: 5, chat: 1, once: "result", key: "eng.out", vars: {}, ttl: 10 }); break; }
          // AHEAD only. `pos` is already the new place (the retired car left the
          // order this tick), and the place is TOLD here, so the playerPos event
          // that lands a second later nets to zero instead of reading as a pass.
          if (!(e.pos > 0) || e.pos > pos) break;
          m.toldPos = pos;
          offer({ id: "rivalOut", ch: "eng", tier: 3, chat: 2, key: "eng.rivalOut", vars: { name: S(e.car), pos }, ttl: 10 });
          break;
        }
        case "pitIn": {
          if (e.car !== f.ahead || f.gapA == null || f.gapA > 4 || f.pitting || f.caution !== 0) break;
          offer({ id: "rivalPit", ch: "eng", tier: 3, chat: 2, cd: 60, key: "eng.rivalPit", vars: { name: S(e.car) }, ttl: 8 });
          break;
        }
        case "caution": {
          const L = e.level;
          if (L === 4) offer({ id: "flag", ch: "eng", tier: 5, chat: 1, key: "eng.red", vars: {}, ttl: 8 });
          else if (L === 3) offer({ id: "flag", ch: "eng", tier: 5, chat: 1, key: "eng.sc", vars: {}, ttl: 8 });
          else if (L === 2) offer({ id: "flag", ch: "eng", tier: 5, chat: 1, key: "eng.vsc", vars: {}, ttl: 8 });
          else if (L === 1 && e.prev === 0) offer({ id: "flag", ch: "eng", tier: 4, chat: 2, key: "eng.yellow", vars: {}, ttl: 6,
            still: () => f2().caution === 1 });
          else if (L === 0 && e.prev > 0 && e.prev < 4) offer({ id: "flag", ch: "eng", tier: e.prev >= 2 ? 5 : 3, chat: e.prev >= 2 ? 1 : 3,
            key: "eng.green", vars: {}, ttl: 6 });
          break;
        }
        case "hit": {
          if (e.rose && e.sev >= 0.5) offer({ id: "hit", ch: "eng", tier: 3, chat: 2, cd: 40, key: "eng.hit", vars: {}, ttl: 6 });
          break;
        }
        case "finish": {
          if (e.car !== p) break;
          const fp = e.pos || pos, grid = f.gridPos || fp;
          const podium = (G.cars ? G.cars.length : 0) > 3;   // P2 of a two-car duel is not a podium
          const key = fp === 1 ? "eng.win" : fp <= 3 && podium ? "eng.podium" : grid - fp >= 5 ? "eng.recover"
            : fp <= 10 && podium ? "eng.points" : "eng.finish";   // "good points" means nothing in a duel
          offer({ id: "result", ch: "eng", tier: 5, chat: 1, once: "result", key, vars: { pos: fp, grid }, ttl: 12 });
          break;
        }
      }
    }

    // ── ENGINEER: situations, re-checked twice a second ─────────────────────
    function engineerState(f, p) {
      if (f.finished || f.retired || f.pitting || !f.started || t < SETTLE_S) return;
      const green = f.caution === 0;
      // The last lap has its own call — except in a one-lap race, which is
      // all last lap and would otherwise have no attack or defend call at all.
      const racing = f.toGo == null || f.toGo > 1 || f.laps <= 1;
      // A car that has taken the flag is not someone to attack or defend from.
      const a = f.ahead && !f.ahead.finished ? f.ahead : null, b = f.behind && !f.behind.finished ? f.behind : null;
      if (a && green && racing && f.gapA != null) {
        if (f.gapA < 1.0) {
          const armed = !!p.otArmed;
          offer({ id: "attack", ch: "eng", tier: 3, chat: 2, cd: 40, cdKey: "attack:" + S(a),
            key: armed ? "eng.attackOt" : "eng.attack", vars: { gap: gapT(f.gapA), ahead: S(a) }, ttl: 5,
            still: () => { const g = f2(); return g.ahead === a && g.gapA != null && g.gapA < 1.2; } });
        } else if (f.gapA < 6 && f.rateA != null && f.rateA < -0.2) {
          const laps = Math.ceil((f.gapA - 0.5) / -f.rateA);
          const catchable = f.toGo != null && laps >= 2 && laps < f.toGo - 1;
          offer({ id: "closing", ch: "eng", tier: 2, chat: 2, cd: 75, cdKey: "closing:" + S(a),
            key: catchable ? "eng.catchIn" : "eng.closing",
            vars: { gap: gapT(f.gapA), ahead: S(a), rate: gapT(-f.rateA), laps }, ttl: 8,
            still: () => f2().ahead === a });
        } else if (f.gapA < 6 && f.rateA != null && f.rateA > 0.3) {
          offer({ id: "pulling", ch: "eng", tier: 1, chat: 3, cd: 120, cdKey: "pulling:" + S(a), key: "eng.pulling",
            vars: { gap: gapT(f.gapA), ahead: S(a), rate: gapT(f.rateA) }, ttl: 8, still: () => f2().ahead === a });
        // "Out of reach" is an END-of-race verdict: the last 3 laps of a long
        // race, the last third of a short one — in a 3-lap sprint "3 to go"
        // is lap one, and "BRING HOME P22" 38 s after the lights is nonsense.
        } else if (f.toGo != null && f.toGo <= Math.min(3, Math.ceil(f.laps / 3)) && f.gapA > 4 && (f.rateA == null || -f.rateA * f.toGo < f.gapA)) {
          offer({ id: "reach", ch: "eng", tier: 1, chat: 3, once: "reach", key: "eng.outOfReach",
            vars: { gap: gapT(f.gapA), ahead: S(a), pos: f.pos }, ttl: 8, still: samePos(f.pos, () => f2().ahead === a) });
        }
      }
      if (b && green && racing && f.gapB != null) {
        if (f.gapB < 1.0) {
          // "Good defending" follows a defend call the driver actually HEARD.
          offer({ id: "defend", ch: "eng", tier: 3, chat: 1, cd: 35, cdKey: "defend:" + S(b), key: "eng.defend",
            vars: { gap: gapT(f.gapB), behind: S(b) }, ttl: 5, onSaid: () => { m.defending = b; },
            still: () => { const g = f2(); return g.behind === b && g.gapB != null && g.gapB < 1.2; } });
        } else if (f.gapB < 3 && f.rateB != null && f.rateB < -0.25) {
          offer({ id: "threat", ch: "eng", tier: 2, chat: 2, cd: 90, cdKey: "threat:" + S(b), key: "eng.threat",
            vars: { gap: gapT(f.gapB), behind: S(b), rate: gapT(-f.rateB) }, ttl: 8, still: () => f2().behind === b });
        } else if (m.defending === b && f.gapB > 2.0) {
          m.defending = null;
          offer({ id: "clear", ch: "eng", tier: 2, chat: 2, key: "eng.clear", vars: { gap: gapT(f.gapB), behind: S(b) }, ttl: 8,
            still: () => f2().behind === b });
        } else if (f.pos === 1 && f.gapB > 3 && f.toGo != null && f.toGo <= Math.ceil(f.laps / 2)) {
          offer({ id: "manage", ch: "eng", tier: 1, chat: 2, cd: 150, key: "eng.manage", vars: { gap: gapT(f.gapB), behind: S(b) }, ttl: 10,
            still: samePos(1, () => f2().behind === b) });
        }
      }
      if (f.energy != null && green) {
        if (f.energy < 0.1 && (p.speed || 0) > G.vTop() * 0.25) {
          offer({ id: "batt", ch: "eng", tier: 2, chat: 2, cd: 100, key: "eng.battLow", vars: {}, ttl: 8 });
        } else if (f.energy > 0.97 && a && f.gapA != null && f.gapA < 1.5 && racing) {
          offer({ id: "batt", ch: "eng", tier: 1, chat: 3, cd: 120, key: "eng.battFull", vars: { ahead: S(a) }, ttl: 6, still: () => f2().ahead === a });
        }
      }
    }

    // ── COMMENTARY: events ──────────────────────────────────────────────────
    function tvEvent(e, f) {
      switch (e.type) {
        case "start":
          offer({ id: "start", ch: "tv", tier: 4, once: "tvStart", key: "tv.start", vars: { leader: S(e.leader) }, ttl: 6 });
          break;
        case "pass": {
          const pairKey = S(e.a) + ">" + S(e.b), back = m.tvPairs.has(S(e.b) + ">" + S(e.a));
          m.tvPairs.add(pairKey);
          // Under a safety car or VSC a place changing is a pit stop, a
          // retirement or a car waved through, never a "great move".
          if (f.caution >= 2) break;
          const vars = { a: S(e.a), b: S(e.b), pos: e.pos };
          // One lead change per 30 s, and only if it is still true when said: two
          // cars swapping P1 corner after corner read as eight "CHANGE AT THE
          // FRONT" calls in three minutes (a full-race soak, 2026-09-24).
          if (e.pos === 1) offer({ id: "lead", ch: "tv", tier: 4, cd: 30, key: "tv.leadChange", vars, ttl: 7,
            still: () => { const o = facts.order(); return o[0] === e.a; } });
          else if (e.pos <= 6 || e.a.isPlayer || e.b.isPlayer) {
            // One call per PAIR per 40 s: two cars trading a place corner after
            // corner are one story, not seven "returns the favour" lines.
            offer({ id: "pass", ch: "tv", tier: 3, cd: 40, cdKey: "pass:" + [S(e.a), S(e.b)].sort().join("|"),
              key: back ? "tv.repass" : "tv.pass", vars, ttl: 5 });
          }
          const grid = facts.gridOf(e.a);
          if (grid && grid - e.pos >= 5 && e.pos <= 10 && !m.charged.has(e.a)) {
            m.charged.add(e.a);
            offer({ id: "charge", ch: "tv", tier: 2, key: "tv.charge", vars: { a: S(e.a), pos: e.pos, grid }, ttl: 12 });
          }
          break;
        }
        case "fastest":
          if (f.lap > 2 && e.prev) offer({ id: "fastest", ch: "tv", tier: 2, cd: 40, key: "tv.fastest", vars: { a: S(e.car), time: timeT(e.time) }, ttl: 10 });
          break;
        case "retire":
          offer({ id: "retire", ch: "tv", tier: 3, key: "tv.retire",
            vars: { a: S(e.car), why: RadioLines.WHY[e.why] || RadioLines.WHY.mechanical }, ttl: 12 });
          break;
        case "pitIn":
          if (e.pos > 0 && e.pos <= 5) offer({ id: "pit", ch: "tv", tier: 2, key: "tv.pit", vars: { a: S(e.car), pos: e.pos }, ttl: 8 });
          break;
        case "caution":
          if (e.level === 4) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.red", vars: {}, ttl: 8 });
          else if (e.level === 3) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.sc", vars: {}, ttl: 8 });
          else if (e.level === 2) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.vsc", vars: {}, ttl: 8 });
          else if (e.level === 0 && e.prev >= 2 && e.prev < 4) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.green", vars: {}, ttl: 6 });
          break;
        case "finish":
          if (e.pos === 1) {
            const second = facts.order().filter((c) => c !== e.car)[0];
            const g = second ? facts.gap(e.car, second) : null;
            const close = g != null && g < 1.0;
            offer({ id: "win", ch: "tv", tier: 5, once: "tvWin", key: close ? "tv.closeWin" : "tv.win",
              vars: { a: S(e.car), gap: gapT(g) }, ttl: 10 });
          }
          break;
        case "playerLap":
          if (f.leaderToGo === 1 && f.laps > 1) {
            offer({ id: "arc", ch: "tv", tier: 3, once: "tvLast", key: "tv.lastLap", vars: { a: S(f.leader), gap: gapT(f.leadGap) }, ttl: 10 });
          } else if ([10, 5, 3].indexOf(f.leaderToGo) >= 0 && f.leaderToGo < f.laps) {
            offer({ id: "arc", ch: "tv", tier: 2, once: "tvToGo" + f.leaderToGo, key: "tv.toGo",
              vars: { left: f.leaderToGo, a: S(f.leader), gap: gapT(f.leadGap) }, ttl: 12 });
          }
          break;
      }
    }

    // ── COMMENTARY: situations ──────────────────────────────────────────────
    function tvState(f) {
      if (f.caution >= 2) return;
      for (const bt of facts.battles()) {
        if (t - bt.since < 8 || !(bt.pos <= 10 || bt.a.isPlayer || bt.b.isPlayer)) continue;
        const key = S(bt.a) + "|" + S(bt.b);
        offer({ id: "battle", ch: "tv", tier: 2, cd: 45, cdKey: "battle:" + key,
          key: "tv.battle", vars: { a: S(bt.a), b: S(bt.b), gap: gapT(bt.gap), pos: bt.pos }, ttl: 6 });
        break;
      }
      if (f.leader && f.second && !f.leader.finished && f.leadGap != null && f.leadGap > 1.5) {
        offer({ id: "leadGap", ch: "tv", tier: 1, cd: 75, key: "tv.lead",
          vars: { a: S(f.leader), b: S(f.second), gap: gapT(f.leadGap) }, ttl: 10 });
      }
    }

    let last = null;
    const f2 = () => last || {};

    // The spotter (js/race/spotter.js) rides this tick: car left / right / clear,
    // from the recorded voice only.
    const spotter = typeof Spotter !== "undefined" ? Spotter.create(G) : null;
    function update(dt) {
      if (!(dt > 0)) return;
      if (spotter) spotter.update(dt);
      // RADIO CHECK (js/input/input.js): consumed on every tick, raced or not, so
      // a press in a menu cannot fire at the next green light.
      const asked = typeof Input !== "undefined" && Input.consumeRadio ? Input.consumeRadio() : false;
      const racing = G.state === "race" && !G.timeTrial && !G.practice && G.cars && G.cars.length > 1;
      if (!racing) { live = false; return; }
      // A NEW RACE. game.js only ticks this inside a race, so the gap between
      // two races is never seen as "not racing": a new race is recognised by
      // its new field (makeCars builds a new array) or by the clock going back.
      // A red flag keeps both, and keeps the memory with them.
      const now = G.raceT || 0;
      // NOT on `!live`: a red flag's restart countdown is "not racing" too, and
      // resetting there forgot the grid, every once-only line and the told
      // place — and read the re-grid as a lap of passes.
      if (G.cars !== lastCars || now + 1 < t) { reset(); lastCars = G.cars; }
      live = true;
      t = now;
      const { f, ev } = facts.observe(G, dt);
      if (!f) return;
      last = f;
      // Not an early return: this tick's events are one-shot, and a safety car
      // deployed on the tick the driver asked must still be offered.
      if (asked) request();
      const p = G.player;
      // OUT OF THE PITS, the driver is told their place again from scratch:
      // positions are not called during a stop, so the next pass was measured
      // from the pre-stop place — gaining one from P7 read as "DOWN 4 TO P6".
      if (m.wasPit && !f.pitting) { m.toldPos = f.rawPos || f.pos; queue.eng.delete("pos"); }
      m.wasPit = !!f.pitting;
      if (f.pitting) m.pitLap = f.lap;
      if (f.caution > 0) m.cautionLap = f.lap;
      const tv = tvLive(f);
      for (const e of ev) {
        engineerEvent(e, f, p);
        if (tv) tvEvent(e, f);
      }
      evalT -= dt;
      if (evalT <= 0) {
        evalT = EVAL_S;
        engineerState(f, p);
        if (tv) tvState(f);
      }
      if (!tv) queue.tv.clear();
      if (lvl() === 0) queue.eng.clear();
      pump(f, p, tv);
    }

    // Pick at most one line per tick: the engineer's best if it may speak now,
    // else the commentator's.
    function pump(f, p, tv) {
      // A VS FRIEND race keeps running under the pause menu; the radio waits.
      if (G.paused) return;
      const e = best("eng");
      if (e) {
        const urgent = e.tier >= 5;
        const kind = urgent ? "race" : "info";
        const ok = urgent
          || (!G.announceBusy && t - m.eng >= GAP_S[lvl()] * (e.tier >= 3 ? 0.5 : 1) && !underLoad(p) && !(f.pitting && e.tier < 4));
        // In a TV camera an "info" card is dropped by announce() (a film shot is
        // not captioned); the commentator speaks there instead, so hold it.
        const tvCam = TV_CAMS.indexOf(camId()) >= 0 && G.hudProfile !== "broadcast";
        if (ok && !(tvCam && !urgent) && speak(e, kind)) return;
      }
      if (!tv) return;
      const c = best("tv");
      if (!c) return;
      const urgent = c.tier >= 4;
      if (G.announceBusy && !urgent) return;
      if (!urgent && (t - m.tv < (c.tier <= 2 ? COMM_GAP_S * 1.5 : COMM_GAP_S) || t - m.eng < AFTER_ENG_S)) return;
      speak(c, "comm");
    }

    /** The driver asks for a status check — the one line that answers on demand. */
    function request() {
      const f = last;
      if (!live || !f) return "";
      const text = f.ahead && f.gapA != null && f.behind && f.gapB != null
        ? lines.pick("eng.status", { pos: f.pos, gapA: gapT(f.gapA), gapB: gapT(f.gapB) })
        : f.ahead && f.gapA != null ? "P" + f.pos + ". " + gapT(f.gapA) + " TO " + S(f.ahead)
        : f.behind && f.gapB != null ? "P" + f.pos + ". " + gapT(f.gapB) + " TO " + S(f.behind) + " BEHIND"
        : "P" + f.pos;
      return G.announce(text, durFor(text), "race") ? text : "";
    }

    function setChat(v) {
      if (CHAT.indexOf(v) < 0) return chat;
      chat = v; if (store && store.set) store.set("radioChat", v);
      return chat;
    }
    function setComm(v) {
      if (COMM.indexOf(v) < 0) return comm;
      comm = v; if (store && store.set) store.set("commentary", v);
      return comm;
    }

    return {
      update, request, reset, setChat, setComm,
      chat: () => chat, comm: () => comm,
      spotter: () => !!(store && store.get && store.get("spotter", true) !== false),
      setSpotter(b) { if (store && store.set) store.set("spotter", !!b); return !!b; },
      spotterDebug: () => (spotter ? spotter.debug() : null),
      debug: () => ({ live, chat, comm, tv: live && tvLive(last), t: +t.toFixed(1),
        pending: { eng: Array.from(queue.eng.keys()), tv: Array.from(queue.tv.keys()) },
        facts: last && { pos: last.pos, n: last.n, lap: last.lap, toGo: last.toGo,
          ahead: S(last.ahead), gapA: last.gapA, rateA: last.rateA, behind: S(last.behind), gapB: last.gapB, rateB: last.rateB,
          leader: S(last.leader), leadGap: last.leadGap, caution: last.caution },
        log: log.slice() }),
    };
  }

  return Object.freeze({ create, durFor, CHAT, COMM, GAP_S, TV_CAMS });
})();
Object.freeze(RaceRadio);
