var RaceRadio = (function () {
  "use strict";

  const CHAT = Object.freeze(["off", "key", "normal", "chatty"]);
  const COMM = Object.freeze(["off", "tv", "on"]);
  const GAP_S = Object.freeze([Infinity, 18, 9, 5]);
  const COMM_GAP_S = 10;
  const AFTER_ENG_S = 2.5;
  const EVAL_S = 0.5;
  const SETTLE_S = 10;
  const POS_HOLD_S = 8;
  const TV_CAMS = Object.freeze(["heli", "side", "cinematic", "low", "overhead"]);
  const LOAD_BRAKE = 0.15, LOAD_LAT = 0.5;

  function durFor(text, kind) {
    kind = kind || "info";
    const sp = RadioVoice.SPEAKERS[kind] || "radio";
    let lead = kind === "comm" ? 0 : null;
    if (lead == null && typeof GameAudio !== "undefined" && GameAudio.radioLeadS) {
      lead = GameAudio.radioLeadS(sp === "control" ? "control" : "radio");
    }
    if (lead == null) lead = sp === "control" ? RadioVoice.CONTROL_LEAD_S : RadioVoice.RADIO_LEAD_S;
    return RadioVoice.cardDurS({ msg: text, kind, lead });
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

    let battleOn = !!(store && store.get && store.get("battleEarcon", false));
    let battle = null;
    function battleService() {
      if (!battle && typeof BattleEarcon !== "undefined" && typeof GameAudio !== "undefined") battle = BattleEarcon.create(GameAudio);
      return battle;
    }
    function stopBattleEarcon() { if (battle) battle.stop(); }
    function battleEarcon() { return battleOn; }
    function setBattleEarcon(on) {
      battleOn = !!on;
      if (store && store.set) store.set("battleEarcon", battleOn);
      stopBattleEarcon();
      const b = battleOn && battleService();
      if (b && G.soundOn) b.prepare();
      return battleOn;
    }
    function battleSafe() {
      const p = G.player;
      if (!p || !live || watch || G.state !== "race" || G.paused || !last
          || last.caution !== 0 || last.finished || last.retired || last.pitting
          || Math.abs((G.raceT || 0) - last.t) > 0.5 || underLoad(p)
          || (spotter && spotter.occupied()) || G.announceBusy
          || (G.radio && G.radio.busy && G.radio.busy())
          || (G.announcer && G.announcer.speaking && G.announcer.speaking())) return false;
      for (const c of queue.eng.values()) if (c.tier >= 5) return false;
      return !(typeof GameAudio !== "undefined" && GameAudio.radioVoicesLive && GameAudio.radioVoicesLive() > 0);
    }

    let live = false, evalT = 0, t = 0, lastCars = null, last = null;
    let watch = null, timeline = 0, commentaryGeneration = 0, engineerGeneration = 0;
    let m = null;
    const queue = { eng: new Map(), tv: new Map() };
    const log = [], drops = [];
    function drop(c, reason) {
      if (drops.length > 200) drops.shift();
      drops.push({ t: +t.toFixed(1), ch: c.ch, id: c.id, reason });
    }

    function freshMemory() {
      return {
        said: new Map(),
        once: new Set(),
        passedBy: new Map(),
        tvPairs: new Set(),
        charged: new Set(),
        laps: [],
        defending: null,
        toldPos: null,
        wasPit: false,
        pitLap: -9,
        cautionLap: -9,
        bestPos: 99,
        eng: -99, tv: -99,
      };
    }

    function reset() {
      stopBattleEarcon();
      timeline++;
      facts.reset();
      lines = RadioLines.create((o.seed || 1) + ((G.raceRound | 0) * 7919));
      queue.eng.clear(); queue.tv.clear();
      m = freshMemory(); evalT = 0; t = 0; last = null; live = false; log.length = 0; drops.length = 0;
    }
    reset();

    function resetTimeline() {
      stopBattleEarcon();
      if (!watch) return;
      timeline++;
      if (G.radio && G.radio.halt) G.radio.halt();
      facts.reset(); queue.eng.clear(); queue.tv.clear();
      m.said.clear(); m.eng = m.tv = -Infinity;
      evalT = 0; t = G.raceT || 0;
      last = facts.observe(G, 0).f;
    }

    const gapT = RadioLines.gapText, timeT = RadioLines.timeText;
    const S = (c) => (watch && watch.nameOf && c ? watch.nameOf(c) || RadioLines.surname(c) : RadioLines.surname(c));
    const lvl = () => CHAT.indexOf(chat);
    const inPits = (c) => !!(c && c.pitState && c.pitState !== "none");
    const cool = (key, cd) => !(m.said.has(key) && t - m.said.get(key) < cd);
    const samePos = (pos, and) => () => { const g = f2(); return (g.rawPos || g.pos) === pos && (!and || and()); };

    function offer(c) {
      if (c.driving) {
        const still = c.still;
        c.still = () => { const f = f2(); return f.started && !f.finished && !f.retired && !f.pitting
          && f.caution === 0 && (!still || still()); };
      }
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
        if (t > c.exp) { drop(c, "expired"); queue[ch].delete(id); continue; }
        if (c.still && !c.still()) { drop(c, "stale"); queue[ch].delete(id); continue; }
        if (c.hold && m.said.has(c.cdKey) && t - m.said.get(c.cdKey) < c.hold) continue;
        if (!out || c.tier > out.tier || (c.tier === out.tier && c.born > out.born)) out = c;
      }
      return out;
    }

    function speak(c, kind) {
      if (c.id === "last" && c.ch === "eng") refreshLastLap(c, f2());
      const text = lines.pick(c.key, c.vars, true);
      if (!text) { queue[c.ch].delete(c.id); return false; }
      const gen = timeline, field = G.cars, watching = watch, cg = commentaryGeneration, eg = engineerGeneration, still = c.still;
      const valid = () => gen === timeline && field === G.cars && watch === watching
        && (c.ch !== "tv" || (cg === commentaryGeneration && comm !== "off"))
        && (c.ch !== "eng" || (eg === engineerGeneration && chat !== "off")) && (!still || still());
      if (!G.announce(text, durFor(text, kind), kind, valid)) {
        if (c.ch === "eng" || c.tier >= 5) { drop(c, "announce-refused"); return false; }
        drop(c, "announce-refused");
        queue[c.ch].delete(c.id);
        return false;
      }
      queue[c.ch].delete(c.id);
      lines.commit();
      m.said.set(c.cdKey, t);
      if (c.once) m.once.add(c.once);
      m[c.ch] = t;
      if (c.onSaid) c.onSaid();
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
      if (comm === "on" || watch) return true;
      return TV_CAMS.indexOf(camId()) >= 0 || G.hudProfile === "broadcast" || !!(f && (f.finished || f.retired));
    }

    function underLoad(p) {
      const lat = Math.abs(p.lateralAccel || 0), max = G.LAT_MAX || 30;
      return (p.brakeDemand || 0) > LOAD_BRAKE || lat > max * LOAD_LAT;
    }

    function refreshLastLap(c, f) {
      const pos = f.rawPos || f.pos;
      c.vars = { pos, ahead: S(f.ahead), behind: S(f.behind) };
      c.key = "eng.lastCalm";
      if (pos === 1) c.key = "eng.lastLead";
      else if (f.ahead && f.gapA != null && f.gapA < 1.5) {
        c.key = "eng.lastAttack"; c.vars.gap = gapT(f.gapA);
      } else if (f.behind && f.gapB != null && f.gapB < 1.5) {
        c.key = "eng.lastDefend"; c.vars.gap = gapT(f.gapB);
      }
    }

    function engineerEvent(e, f, p) {
      if ((f.finished || f.retired) && e.type !== "finish" && !(e.type === "retire" && e.car === p)) return;
      const pos = f.rawPos || f.pos;
      switch (e.type) {
        case "playerLap": {
          if (p.finished) break;
          if (e.lap === 2 && f.gridPos) {
            const d = f.gridPos - pos;
            offer({ id: "lap1", ch: "eng", tier: 3, chat: 1, once: "lap1",
              key: d > 0 ? "eng.lap1Up" : d < 0 ? "eng.lap1Down" : "eng.lap1Same", vars: { pos, n: d }, ttl: 12, still: samePos(pos),
              onSaid: () => { m.toldPos = pos; } });
          }
          if (f.toGo === 1 && f.laps > 1) {
            offer({ id: "last", ch: "eng", tier: 5, chat: 1, once: "last", ttl: 10 });
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
          const told = m.toldPos, n = Math.abs(told - e.pos);
          const onSaid = () => { m.toldPos = e.pos; };
          const base = { id: "pos", ch: "eng", tier: 3, chat: 1, ttl: 10, hold: POS_HOLD_S, cdKey: "pos", onSaid,
            still: () => (f2().rawPos || f2().pos) === e.pos };
          if (n === 0) { queue.eng.delete("pos"); break; }
          if (e.pos === 1) { offer(Object.assign(base, { tier: 4, key: "eng.lead", vars: {} })); break; }
          if (e.pos < told) {
            const passed = f.behind;
            if (n >= 2) { offer(Object.assign(base, { key: "eng.gainMany", vars: { pos: e.pos, n } })); break; }
            if (!passed || inPits(passed)) break;
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
        case "mistake": {
          if (f.pitting || f.caution !== 0) break;
          const near = e.car === f.ahead || e.car === f.behind;
          const gap = e.car === f.ahead ? f.gapA : e.car === f.behind ? f.gapB : null;
          if (!near || gap == null || gap > 3.5) break;
          offer({ id: "rivalErr", ch: "eng", tier: 2, chat: 2, cd: 45,
            cdKey: "rivalErr:" + S(e.car), key: "eng.rivalErr",
            vars: { name: S(e.car) }, ttl: 6 });
          break;
        }
        case "caution": {
          const L = e.level;
          if (L === 4) offer({ id: "flag", ch: "eng", tier: 5, chat: 1, key: "eng.red", vars: {}, ttl: 8, still: () => f2().caution === 4 });
          else if (L === 3) offer({ id: "flag", ch: "eng", tier: 5, chat: 1, key: "eng.sc", vars: {}, ttl: 8, still: () => f2().caution === 3 });
          else if (L === 2) offer({ id: "flag", ch: "eng", tier: 5, chat: 1, key: "eng.vsc", vars: {}, ttl: 8, still: () => f2().caution === 2 });
          else if (L === 1 && e.prev === 0) offer({ id: "flag", ch: "eng", tier: 4, chat: 2, key: "eng.yellow", vars: {}, ttl: 6,
            still: () => f2().caution === 1 });
          else if (L === 0 && e.prev > 0 && e.prev < 4) offer({ id: "flag", ch: "eng", tier: e.prev >= 2 ? 5 : 3, chat: e.prev >= 2 ? 1 : 3,
            key: "eng.green", vars: {}, ttl: 6, still: () => f2().caution === 0 });
          break;
        }
        case "hit": {
          if (e.rose && e.sev >= 0.5) offer({ id: "hit", ch: "eng", tier: 3, chat: 2, cd: 40, key: "eng.hit", vars: {}, ttl: 6 });
          break;
        }
        case "finish": {
          if (e.car !== p) break;
          const fp = e.pos || pos, grid = f.gridPos || fp;
          const podium = (G.cars ? G.cars.length : 0) > 3;
          const key = fp === 1 ? "eng.win" : fp <= 3 && podium ? "eng.podium" : grid - fp >= 5 ? "eng.recover"
            : fp <= 10 && podium ? "eng.points" : "eng.finish";
          offer({ id: "result", ch: "eng", tier: 5, chat: 1, once: "result", key, vars: { pos: fp, grid }, ttl: 12 });
          break;
        }
      }
    }

    function engineerState(f, p) {
      if (f.finished || f.retired || f.pitting || !f.started || t < SETTLE_S) return;
      const green = f.caution === 0;
      const racing = f.toGo == null || f.toGo > 1 || f.laps <= 1;
      const a = f.ahead && !f.ahead.finished ? f.ahead : null, b = f.behind && !f.behind.finished ? f.behind : null;
      if (a && green && racing && f.gapA != null) {
        if (f.gapA < 1.0) {
          const armed = !!p.otArmed;
          offer({ driving: true, id: "attack", ch: "eng", tier: 3, chat: 2, cd: 40, cdKey: "attack:" + S(a),
            key: armed ? "eng.attackOt" : "eng.attack", vars: { gap: gapT(f.gapA), ahead: S(a) }, ttl: 5,
            still: () => { const g = f2(); return g.ahead === a && g.gapA != null && g.gapA < 1.2 && !a.finished && !inPits(a) && (!armed || !!p.otArmed); } });
        } else if (f.gapA < 6 && f.rateA != null && f.rateA < -0.2) {
          const laps = Math.ceil((f.gapA - 0.5) / -f.rateA);
          const catchable = f.toGo != null && laps >= 2 && laps < f.toGo - 1;
          offer({ driving: true, id: "closing", ch: "eng", tier: 2, chat: 2, cd: 75, cdKey: "closing:" + S(a),
            key: catchable ? "eng.catchIn" : "eng.closing",
            vars: { gap: gapT(f.gapA), ahead: S(a), rate: gapT(-f.rateA), laps }, ttl: 8,
            still: () => f2().ahead === a && f2().rateA != null && f2().rateA < -0.2 });
        } else if (f.gapA < 6 && f.rateA != null && f.rateA > 0.3) {
          offer({ driving: true, id: "pulling", ch: "eng", tier: 1, chat: 3, cd: 120, cdKey: "pulling:" + S(a), key: "eng.pulling",
            vars: { gap: gapT(f.gapA), ahead: S(a), rate: gapT(f.rateA) }, ttl: 8, still: () => f2().ahead === a && f2().rateA != null && f2().rateA > 0.3 });
        } else if (f.toGo != null && f.toGo <= Math.min(3, Math.ceil(f.laps / 3)) && f.gapA > 4 && (f.rateA == null || -f.rateA * f.toGo < f.gapA)) {
          offer({ driving: true, id: "reach", ch: "eng", tier: 1, chat: 3, once: "reach", key: "eng.outOfReach",
            vars: { gap: gapT(f.gapA), ahead: S(a), pos: f.pos }, ttl: 8, still: samePos(f.pos, () => f2().ahead === a) });
        }
      }
      if (b && green && racing && f.gapB != null) {
        if (f.gapB < 1.0) {
          offer({ driving: true, id: "defend", ch: "eng", tier: 3, chat: 1, cd: 35, cdKey: "defend:" + S(b), key: "eng.defend",
            vars: { gap: gapT(f.gapB), behind: S(b) }, ttl: 5, onSaid: () => { m.defending = b; },
            still: () => { const g = f2(); return g.behind === b && g.gapB != null && g.gapB < 1.2 && !b.finished && !inPits(b); } });
        } else if (f.gapB < 3 && f.rateB != null && f.rateB < -0.25) {
          offer({ driving: true, id: "threat", ch: "eng", tier: 2, chat: 2, cd: 90, cdKey: "threat:" + S(b), key: "eng.threat",
            vars: { gap: gapT(f.gapB), behind: S(b), rate: gapT(-f.rateB) }, ttl: 8, still: () => f2().behind === b && f2().rateB != null && f2().rateB < -0.25 });
        } else if (m.defending === b && f.gapB > 2.0) {
          m.defending = null;
          offer({ driving: true, id: "clear", ch: "eng", tier: 2, chat: 2, key: "eng.clear", vars: { gap: gapT(f.gapB), behind: S(b) }, ttl: 8,
            still: () => f2().behind === b && f2().gapB > 2 });
        } else if (f.pos === 1 && f.gapB > 3 && f.toGo != null && f.toGo <= Math.ceil(f.laps / 2)) {
          offer({ driving: true, id: "manage", ch: "eng", tier: 1, chat: 2, cd: 150, key: "eng.manage", vars: { gap: gapT(f.gapB), behind: S(b) }, ttl: 10,
            still: samePos(1, () => f2().behind === b) });
        }
      }
      if (f.energy != null && green) {
        if (f.energy < 0.1 && (p.speed || 0) > G.vTop() * 0.25) {
          offer({ driving: true, id: "batt", ch: "eng", tier: 2, chat: 2, cd: 100, key: "eng.battLow", vars: {}, ttl: 8, still: () => f2().energy != null && f2().energy < 0.1 });
        } else if (f.energy > 0.97 && a && f.gapA != null && f.gapA < 1.5 && racing) {
          offer({ driving: true, id: "batt", ch: "eng", tier: 1, chat: 3, cd: 120, key: "eng.battFull", vars: { ahead: S(a) }, ttl: 6, still: () => f2().ahead === a && f2().energy > 0.97 && f2().gapA != null && f2().gapA < 1.5 });
        }
      }
    }

    const WATCH_SKIP = { start: 1, pass: 1, fastest: 1, retire: 1, pitIn: 1, finish: 1, mistake: 1 };
    function tvEvent(e, f) {
      if (watch && WATCH_SKIP[e.type]) return;
      switch (e.type) {
        case "start":
          offer({ id: "start", ch: "tv", tier: 4, once: "tvStart", key: "tv.start", vars: { leader: S(e.leader) }, ttl: 6 });
          break;
        case "pass": {
          const pairKey = S(e.a) + ">" + S(e.b), back = m.tvPairs.has(S(e.b) + ">" + S(e.a));
          m.tvPairs.add(pairKey);
          if (f.caution >= 2) break;
          const vars = { a: S(e.a), b: S(e.b), pos: e.pos };
          if (e.pos === 1) offer({ id: "lead", ch: "tv", tier: 4, cd: 30, key: "tv.leadChange", vars, ttl: 7,
            still: () => { const o = facts.order(); return o[0] === e.a; } });
          else if (e.pos <= 6 || e.a.isPlayer || e.b.isPlayer) {
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
            vars: { a: S(e.car), why: RadioLines.why(e.why) }, ttl: 12 });
          break;
        case "mistake": {
          if (f.caution >= 2) break;
          if (e.pos > 6 && e.car !== f.ahead && e.car !== f.behind) break;
          offer({ id: "mistake", ch: "tv", tier: 2, cd: 40,
            cdKey: "mistake:" + S(e.car), key: "tv.mistake",
            vars: { a: S(e.car) }, ttl: 5 });
          break;
        }
        case "pitIn":
          if (e.pos > 0 && e.pos <= 5) offer({ id: "pit", ch: "tv", tier: 2, key: "tv.pit", vars: { a: S(e.car), pos: e.pos }, ttl: 8 });
          break;
        case "caution":
          if (e.level === 4) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.red", vars: {}, ttl: 8, still: () => f2().caution === 4 });
          else if (e.level === 3) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.sc", vars: {}, ttl: 8, still: () => f2().caution === 3 });
          else if (e.level === 2) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.vsc", vars: {}, ttl: 8, still: () => f2().caution === 2 });
          else if (e.level === 0 && e.prev >= 2 && e.prev < 4) offer({ id: "flag", ch: "tv", tier: 4, key: "tv.green", vars: {}, ttl: 6, still: () => f2().caution === 0 });
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
        case "leaderLap": {
          const p = G.player, len = (G.track && G.track.total) || 0;
          const onLeadLap = p && !p.finished && !p.retired && len > 0 && (f.leader.prog || 0) - (p.prog || 0) < len;
          if (f.leaderToGo === 1 && f.laps > 1) {
            if (!onLeadLap) offer({ id: "arc", ch: "tv", tier: 3, once: "tvLast", key: "tv.lastLap", vars: { a: S(f.leader), gap: gapT(f.leadGap) }, ttl: 10 });
          } else if ([10, 5, 3].indexOf(f.leaderToGo) >= 0 && f.leaderToGo < f.laps) {
            offer({ id: "arc", ch: "tv", tier: 2, once: "tvToGo" + f.leaderToGo, key: "tv.toGo",
              vars: { left: f.leaderToGo, a: S(f.leader), gap: gapT(f.leadGap) }, ttl: 12 });
          }
          break;
        }
      }
    }

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

    const f2 = () => last || {};

    const spotter = typeof Spotter !== "undefined" ? Spotter.create(G) : null;
    let _s8Done = null;
    function update(dt) {
      const stamp = G._s8Stamp;
      if (stamp != null && stamp === _s8Done) return;
      if (!Number.isFinite(dt) || dt <= 0) return;
      if (stamp != null) _s8Done = stamp;
      if (spotter) spotter.update(dt, !!watch);
      const asked = typeof Input !== "undefined" && Input.consumeRadio ? Input.consumeRadio() : false;
      const racing = G.state === "race" && !G.timeTrial && !G.practice && G.cars && G.cars.length > 1;
      if (!racing) { live = false; return; }
      const now = G.raceT || 0;
      if (G.cars !== lastCars) { reset(); lastCars = G.cars; }
      else if (now + 1 < t) {
        if (watch) resetTimeline();
        else reset();
      }
      live = true;
      t = now;
      const { f, ev } = facts.observe(G, dt);
      if (!f) return;
      last = f;
      if (asked) request();
      const p = G.player;
      if (m.wasPit && !f.pitting) { m.toldPos = f.rawPos || f.pos; queue.eng.delete("pos"); }
      m.wasPit = !!f.pitting;
      if (f.pitting) m.pitLap = f.lap;
      if (f.caution > 0) m.cautionLap = f.lap;
      const tv = tvLive(f);
      for (const e of ev) {
        if (!watch) engineerEvent(e, f, p);
        if (tv) tvEvent(e, f);
      }
      evalT -= dt;
      if (evalT <= 0) {
        evalT = EVAL_S;
        if (!watch) engineerState(f, p);
        if (tv) tvState(f);
      }
      if (!tv) queue.tv.clear();
      if (lvl() === 0 || watch) queue.eng.clear();
      pump(f, p, tv);
    }

    function pump(f, p, tv) {
      if (G.paused) return;
      if (watch && watch.radioBusy && watch.radioBusy()) return;
      if (watch && watch.paused && watch.paused()) return;
      const traffic = spotter && spotter.occupied();
      const e = best("eng");
      if (e) {
        const urgent = e.tier >= 5;
        const kind = e.id === "flag" ? "warning" : urgent || e.tier >= 4 ? "race" : "info";
        const ok = urgent
          || (!traffic && t - m.eng >= GAP_S[lvl()] * (e.tier >= 3 ? 0.5 : 1) && !underLoad(p) && !(f.pitting && e.tier < 4));
        const tvCam = TV_CAMS.indexOf(camId()) >= 0 && G.hudProfile !== "broadcast";
        if (ok && !(tvCam && !urgent) && speak(e, kind)) return;
      }
      if (!tv || traffic) return;
      const c = best("tv");
      if (!c) return;
      const urgent = c.tier >= 4;
      if (G.announceBusy && !urgent) return;
      if (!urgent && (t - m.tv < (c.tier <= 2 ? COMM_GAP_S * 1.5 : COMM_GAP_S) || t - m.eng < AFTER_ENG_S)) return;
      speak(c, "comm");
    }

    function request() {
      const f = last;
      if (!live || !f || watch) return "";
      if (battleOn) {
        const b = battleService();
        if (!G.soundOn) stopBattleEarcon();
        else {
          if (!battleSafe()) { stopBattleEarcon(); return ""; }
          const key = typeof BattleEarcon !== "undefined" ? BattleEarcon.select(f) : "";
          if (b && !b.ready()) b.prepare();
          const volume = 0.3 * Math.max(0, Math.min(1, +(store && store.get ? store.get("volRadio", 0.8) : 0.8) || 0));
          if (key && b && b.play(key, volume)) return "";
        }
      }
      const text = f.ahead && f.gapA != null && f.behind && f.gapB != null
        ? lines.pick("eng.status", { pos: f.pos, gapA: gapT(f.gapA), gapB: gapT(f.gapB) })
        : f.ahead && f.gapA != null ? "P" + f.pos + ". " + gapT(f.gapA) + " TO " + S(f.ahead)
        : f.behind && f.gapB != null ? "P" + f.pos + ". " + gapT(f.gapB) + " TO " + S(f.behind) + " BEHIND"
        : "P" + f.pos;
      return G.announce(text, durFor(text, "race"), "race") ? text : "";
    }

    function replayEvent(h, a, b) {
      if (!watch || !live || comm === "off" || !h) return false;
      if (h.kind === "ending") return false;
      if (h.kind === "sc") {
        const level = h.level >= 4 ? 4 : h.level === 2 ? 2 : 3;
        const key = level === 4 ? "tv.red" : level === 2 ? "tv.vsc" : "tv.sc";
        offer({ id: "flag", ch: "tv", tier: 4, key, vars: {}, ttl: 8, still: () => f2().caution === level });
        return true;
      }
      if (h.kind === "green") { offer({ id: "flag", ch: "tv", tier: 4, key: "tv.green", vars: {}, ttl: 6, still: () => f2().caution === 0 }); return true; }
      if (!a) return false;
      switch (h.kind) {
        case "pass": {
          if (!b) return false;
          const vars = { a: S(a), b: S(b), pos: h.pos || 0 };
          if (h.pos === 1) offer({ id: "lead", ch: "tv", tier: 4, cd: 30, key: "tv.leadChange", vars, ttl: 7 });
          else offer({ id: "pass", ch: "tv", tier: 3, cd: 40, cdKey: "pass:" + [vars.a, vars.b].sort().join("|"), key: "tv.pass", vars, ttl: 5 });
          return true;
        }
        case "pit": {
          const pos = facts.order().indexOf(a) + 1 || h.pos || 0;
          offer({ id: "pit", ch: "tv", tier: 2, key: "tv.pit", vars: { a: S(a), pos }, ttl: 8 });
          return true;
        }
        case "out":
          offer({ id: "retire", ch: "tv", tier: 3, key: "tv.retire", vars: { a: S(a), why: RadioLines.why("mechanical") }, ttl: 12 });
          return true;
        case "fastest":
          if (!(h.dur > 0)) return false;
          offer({ id: "fastest", ch: "tv", tier: 2, cd: 40, key: "tv.fastest", vars: { a: S(a), time: timeT(h.dur) }, ttl: 10 });
          return true;
      }
      return false;
    }
    function setWatching(hooks) {
      stopBattleEarcon();
      timeline++;
      watch = hooks || null;
      queue.tv.clear(); queue.eng.clear();
    }

    function setChat(v) {
      if (CHAT.indexOf(v) < 0) return chat;
      if (v === "off" && chat !== "off") { engineerGeneration++; queue.eng.clear(); }
      chat = v; if (store && store.set) store.set("radioChat", v);
      return chat;
    }
    function setComm(v) {
      if (COMM.indexOf(v) < 0) return comm;
      if (v === "off" && comm !== "off") { commentaryGeneration++; queue.tv.clear(); }
      comm = v; if (store && store.set) store.set("commentary", v);
      return comm;
    }

    return {
      update, request, reset, resetTimeline, setChat, setComm, replayEvent, setWatching,
      battleEarcon, setBattleEarcon, stopBattleEarcon,
      commentates: () => comm !== "off",
      chat: () => chat, comm: () => comm,
      callsLastLap: () => live && lvl() >= 1,
      callsResult: () => live && lvl() >= 1,
      spotter: () => !!(store && store.get && store.get("spotter", false) !== false),
      setSpotter(b) { if (store && store.set) store.set("spotter", !!b); return !!b; },
      trafficBusy: () => !!(spotter && spotter.occupied()),
      trafficSide: () => (spotter ? spotter.side() : 0),
      debug: () => ({ live, chat, comm, tv: live && tvLive(last), watch: !!watch, t: +t.toFixed(1),
        pending: { eng: Array.from(queue.eng.keys()), tv: Array.from(queue.tv.keys()) },
        facts: last && { pos: last.pos, n: last.n, lap: last.lap, toGo: last.toGo,
          ahead: S(last.ahead), gapA: last.gapA, rateA: last.rateA, behind: S(last.behind), gapB: last.gapB, rateB: last.rateB,
          leader: S(last.leader), leadGap: last.leadGap, caution: last.caution },
        log: log.slice(), drops: drops.slice(),
        dropCounts: drops.reduce((m, d) => { m[d.reason] = (m[d.reason] || 0) + 1; return m; }, {}) }),
    };
  }

  return Object.freeze({ create, durFor });
})();
Object.freeze(RaceRadio);
