var RadioLines = (function () {
  "use strict";

  const POOLS = Object.freeze({
    "eng.gain": ["P{pos}. NICE MOVE", "GOOD JOB, THAT'S P{pos}", "YES! P{pos}, KEEP IT CLEAN",
      "P{pos} NOW. GOOD PASS ON {passed}", "THAT'S P{pos}. NEXT ONE"],
    "eng.repass": ["BACK AHEAD OF {passed}! P{pos}", "{passed} SORTED. P{pos}", "THAT'S PAYBACK. P{pos}"],
    "eng.gainMany": ["UP {n} PLACES! P{pos}", "P{pos}. THAT'S {n} PLACES GAINED", "GREAT WORK. P{pos}, UP {n}"],
    "eng.lostMany": ["P{pos}. LOST {n} PLACES, KEEP GOING", "DOWN {n} TO P{pos}. RESET AND GO AGAIN"],
    "eng.lead": ["YOU'RE LEADING THE RACE!", "P1! CLEAR AIR, BRING IT HOME", "P1. YOU ARE LEADING, WELL DONE"],
    "eng.lost": ["{by} IS THROUGH. P{pos}, STAY CLOSE", "LOST ONE TO {by}. P{pos}, REGROUP",
      "P{pos}. HEADS DOWN, WE GO AGAIN", "{by} GOT BY. P{pos}, STAY IN THE FIGHT"],
    "eng.leadLost": ["{by} TAKES THE LEAD. P2, STAY IN TOUCH", "P2. {by} IS AHEAD, KEEP THE PRESSURE ON"],
    "eng.lap1Up": ["GOOD START! P{pos}, UP {n}", "GREAT FIRST LAP. P{pos}, GAINED {n}"],
    "eng.lap1Down": ["TOUGH START. P{pos}, KEEP FIGHTING", "P{pos} AFTER LAP ONE. STAY CALM"],
    "eng.lap1Same": ["P{pos} AFTER LAP ONE. SETTLE IN", "CLEAN START. P{pos}"],
    "eng.attack": ["{gap} TO {ahead}. YOU'RE IN RANGE", "WITHIN A SECOND OF {ahead}. GO FOR IT",
      "{ahead} IS {gap} AHEAD. ATTACK", "{gap} TO {ahead}. LINE IT UP",
      "CLOSING ON {ahead}. {gap} BACK"],
    "eng.attackOt": ["OVERTAKE IS ARMED. {gap} TO {ahead}", "USE THE OVERTAKE ON {ahead}", "{ahead} {gap} AHEAD. OVERTAKE IS YOURS"],
    "eng.closing": ["GAP TO {ahead} {gap}. CLOSING {rate} A LAP", "{ahead} {gap} AHEAD, YOU'RE {rate} QUICKER",
      "KEEP PUSHING. {gap} TO {ahead}, CLOSING", "YOU'RE {rate} A LAP ON {ahead}. {gap} NOW",
      "{gap} TO {ahead}. KEEP THE PRESSURE ON"],
    "eng.catchIn": ["YOU'LL CATCH {ahead} IN {laps} LAPS", "AT THIS PACE, {ahead} IN {laps} LAPS"],
    "eng.pulling": ["{ahead} IS PULLING AWAY. {gap} NOW", "LOSING {rate} A LAP TO {ahead}. DIG IN"],
    "eng.outOfReach": ["{ahead} IS {gap} AHEAD. HOLD P{pos}", "TOO FAR TO {ahead}. BRING HOME P{pos}"],
    "eng.defend": ["{behind} IS {gap} BEHIND. DEFEND", "{behind} CLOSING, {gap}. COVER THE INSIDE",
      "MIRRORS. {behind} IS {gap} BACK", "{behind} WITHIN A SECOND. STAY TIGHT"],
    "eng.threat": ["{behind} IS CLOSING, {rate} A LAP", "{behind} {gap} BEHIND AND QUICKER. PUSH"],
    "eng.clear": ["GOOD DEFENDING. {behind} DROPPING BACK", "{behind} FALLING AWAY, {gap} NOW. NICE"],
    "eng.manage": ["GAP {gap} TO {behind}. MANAGE IT", "{gap} IN HAND. NO RISKS", "COMFORTABLE, {gap} BEHIND. KEEP IT CLEAN",
      "{behind} IS {gap} BACK. HOLD THE GAP", "MIRRORS. {behind} IS {gap} BACK"],
    "eng.status": ["P{pos}. {gapA} AHEAD, {gapB} BEHIND", "GAP AHEAD {gapA}, BEHIND {gapB}",
      "P{pos}. {gapA} TO THE CAR AHEAD, {gapB} BACK", "YOU'RE P{pos}. {gapA} AHEAD, {gapB} BEHIND",
      "P{pos}. AHEAD BY {gapA}, BEHIND BY {gapB}"],
    "eng.pb": ["PERSONAL BEST, {time}", "GOOD LAP. {time}, YOUR BEST", "THAT'S A {time}. PERSONAL BEST"],
    "eng.fastest": ["FASTEST LAP OF THE RACE! {time}", "PURPLE! FASTEST LAP, {time}", "{time}. THAT'S FASTEST LAP"],
    "eng.slow": ["{time}, {delta} OFF. RESET", "LOST TIME THERE, {delta}. REFOCUS"],
    "eng.steady": ["GOOD RHYTHM. KEEP THOSE LAPS COMING", "NICE AND CONSISTENT. KEEP IT UP"],
    "eng.toGo": ["{left} LAPS TO GO. P{pos}", "{left} TO GO, P{pos}. STAY FOCUSED", "{left} LAPS LEFT. KEEP IT TIDY"],
    "eng.lastAttack": ["{gap} TO {ahead}. EVERYTHING YOU'VE GOT", "LAST ONE. {ahead} IS {gap} AHEAD, GO"],
    "eng.lastDefend": ["HOLD {behind} OFF, {gap} BEHIND", "LAST ONE. {behind} IS {gap} BACK, NO MISTAKES"],
    "eng.lastLead": ["LAST LAP, YOU'RE LEADING. BRING IT HOME", "ONE MORE. NICE AND CLEAN FOR THE WIN"],
    "eng.lastCalm": ["LAST LAP. BRING HOME P{pos}", "ONE TO GO. KEEP IT ON THE ROAD"],
    "eng.grid": ["P{pos}. SETTLE IN", "P{pos}. STAY CALM", "P{pos}. STAY FOCUSED", "P{pos}. NO MISTAKES"],
    "eng.win": ["YES! YOU WIN THE RACE!", "GET IN THERE! RACE WINNER!", "P1! WHAT A DRIVE!"],
    "eng.podium": ["P{pos}! PODIUM, GREAT JOB", "ON THE PODIUM! P{pos}, WELL DRIVEN"],
    "eng.points": ["P{pos}. GOOD POINTS TODAY", "P{pos}, SOLID RESULT. THANK YOU"],
    "eng.recover": ["P{pos} FROM P{grid}. GREAT RECOVERY", "UP FROM P{grid} TO P{pos}. MEGA"],
    "eng.finish": ["P{pos}. WE'LL LEARN FROM THAT ONE", "CHEQUERED FLAG, P{pos}. THANKS FOR THE EFFORT"],
    "eng.sc": ["SAFETY CAR, SAFETY CAR. NO OVERTAKING", "SAFETY CAR DEPLOYED. HOLD POSITION"],
    "eng.vsc": ["VSC, VSC. SLOW DOWN, HOLD POSITION", "VIRTUAL SAFETY CAR. BACK OFF"],
    "eng.yellow": ["YELLOW FLAG AHEAD. CAREFUL", "YELLOWS IN THE NEXT SECTOR. TAKE CARE"],
    "eng.green": ["GREEN FLAG. RACE ON", "GREEN, GREEN. GO GO GO", "TRACK IS CLEAR. PUSH NOW"],
    "eng.out": ["WE'RE STOPPING THE CAR. SORRY", "THAT'S THE END OF OUR RACE. SORRY"],
    "eng.red": ["RED FLAG, RED FLAG. SLOW DOWN", "RED FLAG. BACK OFF, THE RACE IS STOPPED"],
    "eng.hit": ["BIG HIT. ARE YOU OKAY?", "THAT WAS A BIG ONE. CHECK THE CAR", "CONTACT. KEEP IT CALM"],
    "eng.rivalOut": ["{name} IS OUT. THAT'S P{pos}", "{name} HAS RETIRED. UP TO P{pos}"],
    "eng.rivalPit": ["{name} HAS PITTED. PUSH NOW", "{name} IN THE PITS. CLEAR AIR, GO",
      "THAT'S {name} IN THE PITS. PUSH", "{name} IN THE PITS. GO NOW",
      "PUSH NOW. {name} HAS PITTED"],
    "eng.tyres": ["MANAGE THE TYRES, {left} TO GO", "SAVE THE TYRES. P{pos}",
      "PLAN THE STOP, P{pos}", "{ahead} IS QUICKER. MANAGE THE TYRES", "LIFT AND COAST, P{pos}"],
    "eng.rivalErr": ["{name} AHEAD. PUSH NOW", "{name} AHEAD. ATTACK",
      "{name} IS AHEAD. GO FOR IT", "{name} AHEAD. LINE IT UP"],
    "eng.battLow": ["BATTERY LOW. LIFT AND COAST", "ENERGY LOW, HARVEST THIS LAP"],
    "eng.battFull": ["BATTERY FULL. USE IT ON {ahead}", "FULL CHARGE. DEPLOY ON {ahead}"],
    "eng.hurt": ["STAY CALM. LONG RACE STILL", "KEEP YOUR HEAD. IT'S A LONG RACE"],
    "tv.start": ["AND IT'S LIGHTS OUT AND AWAY WE GO!", "LIGHTS OUT! {leader} LEADS THEM AWAY"],
    "tv.leadChange": ["{a} TAKES THE LEAD FROM {b}!", "AND {a} IS THROUGH INTO THE LEAD!", "CHANGE AT THE FRONT. {a} LEADS"],
    "tv.pass": ["{a} GETS PAST {b} FOR P{pos}", "{a} MAKES THE MOVE ON {b}", "GREAT MOVE FROM {a} ON {b}. P{pos}",
      "{a} TAKES P{pos} FROM {b}", "{a} MAKES THE MOVE ON {b} FOR P{pos}"],
    "tv.repass": ["{a} TAKES P{pos} BACK FROM {b}", "{a} RETURNS THE FAVOUR ON {b}"],
    "tv.battle": ["{a} AND {b}, {gap} APART FOR P{pos}", "WHAT A SCRAP FOR P{pos}. {a} AND {b}", "{b} HUNTING {a} FOR P{pos}"],
    "tv.charge": ["{a} IS ON A CHARGE. P{pos} FROM P{grid}", "{a} CARVING THROUGH, UP TO P{pos}"],
    "tv.fastest": ["FASTEST LAP FOR {a}. {time}", "{a} GOES FASTEST, A {time}"],
    "tv.retire": ["{a} IS OUT OF THE RACE. {why}", "HEARTBREAK FOR {a}. {why}"],
    "tv.mistake": ["OH! {a}", "{a}. OH!", "OH! {a}!"],
    "tv.pit": ["{a} PITS FROM P{pos}", "PIT STOP FOR {a}, RUNNING P{pos}",
      "PIT STOP FOR {a} FROM P{pos}", "AND {a} PITS FROM P{pos}",
      "PIT STOP FOR {a}, P{pos}"],
    "tv.sc": ["THE SAFETY CAR IS OUT!", "SAFETY CAR! THE FIELD BUNCHES UP"],
    "tv.vsc": ["VIRTUAL SAFETY CAR. THE FIELD SLOWS", "VSC DEPLOYED"],
    "tv.green": ["GREEN FLAG, WE'RE RACING AGAIN!", "AND WE ARE GREEN AGAIN"],
    "tv.toGo": ["{left} LAPS TO GO. {a} LEADS BY {gap}", "{left} TO GO, {a} {gap} CLEAR"],
    "tv.lastLap": ["LAST LAP! {a} LEADS BY {gap}", "FINAL LAP. {a} HAS {gap} IN HAND"],
    "tv.lead": ["{a} LEADS {b} BY {gap}", "{a} IN CONTROL, {gap} CLEAR OF {b}"],
    "tv.win": ["{a} WINS THE RACE!", "AND IT'S {a} WHO TAKES THE FLAG!"],
    "tv.red": ["RED FLAG! THE RACE IS STOPPED", "AND THAT'S A RED FLAG"],
    "tv.closeWin": ["BY JUST {gap}! {a} WINS IT!", "{a} HOLDS ON BY {gap}!"],
  });

  const WHY = Object.freeze({ engine: "ENGINE FAILURE", gearbox: "GEARBOX TROUBLE", accident: "A BIG ACCIDENT",
    mechanical: "MECHANICAL TROUBLE", damage: "TOO MUCH DAMAGE" });

  function fill(tpl, vars) {
    let ok = true;
    const out = String(tpl).replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars ? vars[k] : undefined;
      if (v == null || v === "") { ok = false; return ""; }
      return String(v);
    });
    return ok ? out : "";
  }

  function gapText(s) {
    if (!(s >= 0) || !Number.isFinite(s)) return null;
    const r = s < 10 ? Math.max(0.1, s).toFixed(1) : String(Math.round(s));
    return r === "10.0" ? "10" : r;
  }
  function timeText(s) {
    if (!(s > 0) || !Number.isFinite(s)) return null;
    const q = Math.round(s * 10) / 10;
    const m = Math.floor(q / 60), r = q - m * 60;
    const t = r.toFixed(1);
    return m > 0 ? m + ":" + (r < 10 ? "0" : "") + t : t;
  }
  function surname(c) {
    if (!c) return null;
    const n = c.name ? String(c.name).trim().split(/\s+/).pop() : "";
    return (n || c.code || "").toUpperCase() || null;
  }

  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function recentWindow(poolLen) {
    return poolLen > 1 ? Math.min(3, poolLen - 1) : 0;
  }

  function poolFor(key, pools) {
    if (pools) return pools[key];
    const loc = typeof I18n !== "undefined" && I18n.raw ? I18n.raw("radio." + key) : null;
    return Array.isArray(loc) && loc.length ? loc : POOLS[key];
  }
  function why(code) {
    const loc = typeof I18n !== "undefined" && I18n.raw ? I18n.raw("radio.why." + code) : null;
    return typeof loc === "string" && loc ? loc : WHY[code] || WHY.mechanical;
  }

  function create(seed, pools) {
    const rand = rng(seed);
    const recent = new Map();

    function banned(key, poolLen) {
      const n = recentWindow(poolLen);
      const h = recent.get(key);
      return n && h ? new Set(h.slice(-n)) : new Set();
    }

    function remember(key, idx, poolLen) {
      const n = recentWindow(poolLen);
      if (!n) return;
      let h = recent.get(key);
      if (!h) { h = []; recent.set(key, h); }
      h.push(idx);
      while (h.length > n) h.shift();
    }

    function chooseIndex(key, poolLen, tried) {
      const ban = banned(key, poolLen);
      const open = [];
      for (let i = 0; i < poolLen; i++) {
        if (tried.has(i)) continue;
        if (!ban.has(i)) open.push(i);
      }
      if (!open.length) {
        for (let i = 0; i < poolLen; i++) if (!tried.has(i)) open.push(i);
      }
      if (!open.length) return -1;
      return open[Math.floor(rand() * open.length)];
    }

    let pending = null;
    function pick(key, vars, peek) {
      pending = null;
      const pool = poolFor(key, pools);
      if (!pool || !pool.length) return "";
      const tried = new Set();
      for (let tries = 0; tries < pool.length; tries++) {
        const i = chooseIndex(key, pool.length, tried);
        if (i < 0) return "";
        tried.add(i);
        const line = fill(pool[i], vars);
        if (line) {
          if (peek) pending = { key, i, n: pool.length };
          else remember(key, i, pool.length);
          return line;
        }
      }
      return "";
    }
    function commit() { if (pending) remember(pending.key, pending.i, pending.n); pending = null; }
    return { pick, commit, reset() { recent.clear(); pending = null; } };
  }

  return Object.freeze({ POOLS, WHY, why, create, fill, gapText, timeText, surname });
})();
Object.freeze(RadioLines);
