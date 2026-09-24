/* Apex 26 — RADIO LINES: the phrasebook the race engineer and the TV
 * commentator speak from (js/race/race-radio.js decides WHEN; this decides the
 * WORDS).
 *
 * DATA, NOT CODE. Every pool is a list of interchangeable templates for one
 * situation, with `{slot}` holes filled from the facts the rule matched on — the
 * "fuzzy pattern matching" split Valve's dynamic dialogue made famous (Elan
 * Ruskin, GDC 2012): the rule knows the situation, the pool knows the ways of
 * saying it, and a writer adds a variant without touching a rule.
 *
 * ANTI-REPETITION IS A DECK, NOT A DICE ROLL. A pool is dealt like cards: every
 * variant is said once before any is said twice, and the first card of a fresh
 * deal is never the last card of the previous one. A random pick with five
 * variants repeats the previous line one time in five, and a repeated sentence is
 * what makes a radio sound canned. The shuffle draws from its OWN seeded stream,
 * never Math.random and never the sim RNG, so a replay says the same things.
 *
 * STYLE. Terse, capitalised, numbers where a real engineer gives numbers ("GAP
 * 1.2 TO HAMILTON"), surnames rather than three-letter codes because the voice
 * reads a code as a word. Every template must fit its card when spoken — the
 * radio drops a line it cannot finish (RadioVoice.plan "too-long"), and
 * tests/unit/race-radio.test.mjs speaks every one to prove it. Keep them short.
 */
const RadioLines = (function () {
  "use strict";

  const POOLS = Object.freeze({
    // ── ENGINEER: positions ────────────────────────────────────────────────
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
    // ── ENGINEER: the car ahead ────────────────────────────────────────────
    "eng.attack": ["{gap} TO {ahead}. YOU'RE IN RANGE", "WITHIN A SECOND OF {ahead}. GO FOR IT",
      "{ahead} IS {gap} AHEAD. ATTACK", "{gap} TO {ahead}. LINE IT UP"],
    "eng.attackOt": ["OVERTAKE IS ARMED. {gap} TO {ahead}", "USE THE OVERTAKE ON {ahead}", "{ahead} {gap} AHEAD. OVERTAKE IS YOURS"],
    "eng.closing": ["GAP TO {ahead} {gap}. CLOSING {rate} A LAP", "{ahead} {gap} AHEAD, YOU'RE {rate} QUICKER",
      "KEEP PUSHING. {gap} TO {ahead}, CLOSING"],
    "eng.catchIn": ["YOU'LL CATCH {ahead} IN {laps} LAPS", "AT THIS PACE, {ahead} IN {laps} LAPS"],
    "eng.pulling": ["{ahead} IS PULLING AWAY. {gap} NOW", "LOSING {rate} A LAP TO {ahead}. DIG IN"],
    "eng.outOfReach": ["{ahead} IS {gap} AHEAD. HOLD P{pos}", "TOO FAR TO {ahead}. BRING HOME P{pos}"],
    // ── ENGINEER: the car behind ───────────────────────────────────────────
    "eng.defend": ["{behind} IS {gap} BEHIND. DEFEND", "{behind} CLOSING, {gap}. COVER THE INSIDE",
      "MIRRORS. {behind} IS {gap} BACK", "{behind} WITHIN A SECOND. STAY TIGHT"],
    "eng.threat": ["{behind} IS CLOSING, {rate} A LAP", "{behind} {gap} BEHIND AND QUICKER. PUSH"],
    "eng.clear": ["GOOD DEFENDING. {behind} DROPPING BACK", "{behind} FALLING AWAY, {gap} NOW. NICE"],
    "eng.manage": ["GAP {gap} TO {behind}. MANAGE IT", "{gap} IN HAND. NO RISKS", "COMFORTABLE, {gap} BEHIND. KEEP IT CLEAN"],
    "eng.status": ["P{pos}. {gapA} AHEAD, {gapB} BEHIND", "GAP AHEAD {gapA}, BEHIND {gapB}"],
    // ── ENGINEER: pace ─────────────────────────────────────────────────────
    "eng.pb": ["PERSONAL BEST, {time}", "GOOD LAP. {time}, YOUR BEST", "THAT'S A {time}. PERSONAL BEST"],
    "eng.fastest": ["FASTEST LAP OF THE RACE! {time}", "PURPLE! FASTEST LAP, {time}", "{time}. THAT'S FASTEST LAP"],
    "eng.slow": ["{time}, {delta} OFF. RESET", "LOST TIME THERE, {delta}. REFOCUS"],
    "eng.steady": ["GOOD RHYTHM. KEEP THOSE LAPS COMING", "NICE AND CONSISTENT. KEEP IT UP"],
    // ── ENGINEER: race arc ─────────────────────────────────────────────────
    "eng.toGo": ["{left} LAPS TO GO. P{pos}", "{left} TO GO, P{pos}. STAY FOCUSED", "{left} LAPS LEFT. KEEP IT TIDY"],
    "eng.lastAttack": ["{gap} TO {ahead}. EVERYTHING YOU'VE GOT", "LAST ONE. {ahead} IS {gap} AHEAD, GO"],
    "eng.lastDefend": ["HOLD {behind} OFF, {gap} BEHIND", "LAST ONE. {behind} IS {gap} BACK, NO MISTAKES"],
    "eng.lastLead": ["LAST LAP, YOU'RE LEADING. BRING IT HOME", "ONE MORE. NICE AND CLEAN FOR THE WIN"],
    "eng.lastCalm": ["LAST LAP. BRING HOME P{pos}", "ONE TO GO. KEEP IT ON THE ROAD"],
    "eng.win": ["YES! YOU WIN THE RACE!", "GET IN THERE! RACE WINNER!", "P1! WHAT A DRIVE!"],
    "eng.podium": ["P{pos}! PODIUM, GREAT JOB", "ON THE PODIUM! P{pos}, WELL DRIVEN"],
    "eng.points": ["P{pos}. GOOD POINTS TODAY", "P{pos}, SOLID RESULT. THANK YOU"],
    "eng.recover": ["P{pos} FROM P{grid}. GREAT RECOVERY", "UP FROM P{grid} TO P{pos}. MEGA"],
    "eng.finish": ["P{pos}. WE'LL LEARN FROM THAT ONE", "CHEQUERED FLAG, P{pos}. THANKS FOR THE EFFORT"],
    // ── ENGINEER: incidents and flags ─────────────────────────────────────
    "eng.sc": ["SAFETY CAR, SAFETY CAR. NO OVERTAKING", "SAFETY CAR DEPLOYED. HOLD POSITION"],
    "eng.vsc": ["VSC, VSC. SLOW DOWN, HOLD POSITION", "VIRTUAL SAFETY CAR. BACK OFF"],
    "eng.yellow": ["YELLOW FLAG AHEAD. CAREFUL", "YELLOWS IN THE NEXT SECTOR. TAKE CARE"],
    "eng.green": ["GREEN FLAG. RACE ON", "GREEN, GREEN. GO GO GO", "TRACK IS CLEAR. PUSH NOW"],
    "eng.out": ["WE'RE STOPPING THE CAR. SORRY", "THAT'S THE END OF OUR RACE. SORRY"],
    "eng.red": ["RED FLAG, RED FLAG. SLOW DOWN", "RED FLAG. BACK OFF, THE RACE IS STOPPED"],
    "eng.hit": ["BIG HIT. ARE YOU OKAY?", "THAT WAS A BIG ONE. CHECK THE CAR", "CONTACT. KEEP IT CALM"],
    "eng.rivalOut": ["{name} IS OUT. THAT'S P{pos}", "{name} HAS RETIRED. UP TO P{pos}"],
    "eng.rivalPit": ["{name} HAS PITTED. PUSH NOW", "{name} IN THE PITS. CLEAR AIR, GO"],
    "eng.battLow": ["BATTERY LOW. LIFT AND COAST", "ENERGY LOW, HARVEST THIS LAP"],
    "eng.battFull": ["BATTERY FULL. USE IT ON {ahead}", "FULL CHARGE. DEPLOY ON {ahead}"],
    "eng.hurt": ["STAY CALM. LONG RACE STILL", "KEEP YOUR HEAD. IT'S A LONG RACE"],
    // ── COMMENTARY ─────────────────────────────────────────────────────────
    "tv.start": ["AND IT'S LIGHTS OUT AND AWAY WE GO!", "LIGHTS OUT! {leader} LEADS THEM AWAY"],
    "tv.leadChange": ["{a} TAKES THE LEAD FROM {b}!", "AND {a} IS THROUGH INTO THE LEAD!", "CHANGE AT THE FRONT. {a} LEADS"],
    "tv.pass": ["{a} GETS PAST {b} FOR P{pos}", "{a} MAKES THE MOVE ON {b}", "GREAT MOVE FROM {a} ON {b}. P{pos}"],
    "tv.repass": ["{a} TAKES P{pos} BACK FROM {b}", "{a} RETURNS THE FAVOUR ON {b}"],
    "tv.battle": ["{a} AND {b}, {gap} APART FOR P{pos}", "WHAT A SCRAP FOR P{pos}. {a} AND {b}", "{b} HUNTING {a} FOR P{pos}"],
    "tv.charge": ["{a} IS ON A CHARGE. P{pos} FROM P{grid}", "{a} CARVING THROUGH, UP TO P{pos}"],
    "tv.fastest": ["FASTEST LAP FOR {a}. {time}", "{a} GOES FASTEST, A {time}"],
    "tv.retire": ["{a} IS OUT OF THE RACE. {why}", "HEARTBREAK FOR {a}. {why}"],
    "tv.pit": ["{a} PITS FROM P{pos}", "PIT STOP FOR {a}, RUNNING P{pos}"],
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

  // Retirement codes (js/race/reliability.js REASONS, and retireCar reasons) as
  // words a commentator says.
  const WHY = Object.freeze({ engine: "ENGINE FAILURE", gearbox: "GEARBOX TROUBLE", accident: "A BIG ACCIDENT",
    mechanical: "MECHANICAL TROUBLE", damage: "TOO MUCH DAMAGE" });

  /** Fill `{slot}` holes; "" when any slot is missing — a half-filled line is a lie. */
  function fill(tpl, vars) {
    let ok = true;
    const out = String(tpl).replace(/\{(\w+)\}/g, (m, k) => {
      const v = vars ? vars[k] : undefined;
      if (v == null || v === "") { ok = false; return ""; }
      return String(v);
    });
    return ok ? out : "";
  }

  /** "1.2" for a gap in seconds — one decimal under 10, whole seconds above. */
  function gapText(s) {
    if (!(s >= 0) || !Number.isFinite(s)) return null;
    // Never "0.0": two cars that close are a tenth apart on any real timing screen.
    return s < 10 ? Math.max(0.1, s).toFixed(1) : String(Math.round(s));
  }
  /** "1:32.4" — the tenth is what an engineer reads out, not the thousandth. */
  function timeText(s) {
    if (!(s > 0) || !Number.isFinite(s)) return null;
    const m = Math.floor(s / 60), r = s - m * 60;
    const t = r.toFixed(1);
    return m > 0 ? m + ":" + (r < 10 ? "0" : "") + t : t;
  }
  /** A surname a voice can say: "Lewis Hamilton" -> "HAMILTON". */
  function surname(c) {
    if (!c) return null;
    const n = c.name ? String(c.name).trim().split(/\s+/).pop() : "";
    return (n || c.code || "").toUpperCase() || null;
  }

  // mulberry32 — small, seeded, and nobody else's stream.
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

  /** A dealer over POOLS (or `pools`), with its own per-pool decks. */
  function create(seed, pools) {
    const P = pools || POOLS;
    const rand = rng(seed);
    const decks = new Map();   // key -> { order: [idx…], at, last }
    function deal(key) {
      const pool = P[key];
      if (!pool || !pool.length) return -1;
      let d = decks.get(key);
      if (!d) { d = { order: [], at: 0, last: -1 }; decks.set(key, d); }
      if (d.at >= d.order.length) {
        d.order = pool.map((_, i) => i);
        for (let i = d.order.length - 1; i > 0; i--) {
          const j = Math.floor(rand() * (i + 1));
          const t = d.order[i]; d.order[i] = d.order[j]; d.order[j] = t;
        }
        // Never the same line twice in a row across a reshuffle.
        if (d.order.length > 1 && d.order[0] === d.last) {
          const t = d.order[0]; d.order[0] = d.order[1]; d.order[1] = t;
        }
        d.at = 0;
      }
      const i = d.order[d.at++];
      d.last = i;
      return i;
    }
    /** The next line for `key` with `vars` filled, or "". A variant that cannot
     *  be filled (a slot missing) is skipped for one that can. */
    function pick(key, vars) {
      const pool = P[key];
      if (!pool) return "";
      for (let tries = 0; tries < pool.length; tries++) {
        const i = deal(key);
        if (i < 0) return "";
        const line = fill(pool[i], vars);
        if (line) return line;
      }
      return "";
    }
    return { pick, reset() { decks.clear(); } };
  }

  return Object.freeze({ POOLS, WHY, create, fill, gapText, timeText, surname });
})();
Object.freeze(RadioLines);
