/* Apex 26 — LEGENDS: twelve historic drivers, their record, a tribute livery
 * and the period car each of them raced.
 *
 * WHAT IS FACT AND WHAT IS THE GAME'S OPINION — the split this file exists to keep.
 *
 *   `record`  is FACT, sourced (see SOURCES below): starts, wins, poles,
 *             podiums, titles, years. Nothing here is estimated. If a number is
 *             wrong, fix it against the source; do not tune it to taste.
 *   `ratings` is DERIVED from that record by ratingsFor(), a documented formula.
 *             Nobody hand-picks a legend's pace. Change the formula and every
 *             driver moves together, which is the point: the ranking is an
 *             argument from the record, not a favourite.
 *   `livery`  is a TRIBUTE PALETTE, not a replica. Where a source states the
 *             colour it is used (Clark's British Racing Green, Stewart's French
 *             Racing Blue, the bare-alloy Silver Arrow); where it does not, the
 *             palette evokes the era and is NOT claimed to match a real car, and
 *             no sponsor mark is reproduced.
 *
 * THE ERA CAVEAT, stated because the numbers cannot state it. Rates favour the
 * small fields and short seasons of the 1950s: Fangio started 51 races against
 * Schumacher's 306, so his 57% pole rate is a thinner sample AND a weaker field.
 * The formula does not correct for this — no honest correction exists — so read
 * these as "dominance within his own era", never as a cross-era time sheet.
 *
 * NATIONAL COLOURS, where a tribute leans on one: Britain green (British
 * Racing Green, #004225), Italy red (rosso corsa, #E4002B), France blue (Bleu
 * de France), Germany white or bare metal. The Silver Arrow is bare metal for a
 * reason worth keeping: Mercedes stripped the white paint at the 1934 Eifel
 * Race to make the weight limit, and the exposed metal named the cars. Senna's
 * yellow accent is Brazil's racing colour (pale yellow with green), Fangio's
 * is Argentina's (blue with a yellow bonnet) — both national, neither a team.
 *
 * SOURCES (fetched 2026-09-16, en.wikipedia.org): the per-driver articles for
 * Michael Schumacher, Ayrton Senna, Juan Manuel Fangio, Jim Clark, Niki Lauda,
 * Alain Prost, Jackie Stewart and Nigel Mansell, plus "List of Formula One
 * World Drivers' Champions", plus "British racing green", "Rosso corsa",
 * "List of international auto racing colours" and "Silver Arrows" for the
 * palettes. Clark's podium count is from statsf1.com, which the infobox omits.
 */
const Legends = (function () {
  "use strict";

  const LIST = [
    { id: "schumacher", code: "MSC", era: "vten04", name: "Michael Schumacher", nat: "DE",
      years: "1991–2012", teams: "Benetton, Ferrari", car: "Ferrari F2004",
      record: { starts: 306, wins: 91, poles: 68, podiums: 155, titles: 7 },
      trait: "Relentless over a stint, and the era's benchmark in the wet.",
      // Ferrari's red is NOT one colour: 1996-2007 they ran a brighter, almost
      // day-glo orange-red chosen to reproduce on television, returning to the
      // original rosso corsa in 2007. Schumacher's five Ferrari titles sit
      // inside that window, so his tribute is the TV red and Lauda's below is
      // the darker original — the two must not read as the same car.
      livery: { name: "Maranello '04", c1: [0.88, 0.11, 0.02], c2: [0.93, 0.93, 0.95],
                stripe: [0.98, 0.82, 0.10], accent: [0.10, 0.10, 0.12],
                finShape: "none", spineHeight: "dorsal", spineLogo: "cap" } },

    { id: "senna", code: "SEN", era: "turbo88", name: "Ayrton Senna", nat: "BR",
      years: "1984–1994", teams: "Toleman, Lotus, McLaren, Williams", car: "McLaren MP4/4",
      num: 12,   // SOURCED: the 1988 MP4/4 ran Prost #11 and Senna #12.
      record: { starts: 161, wins: 41, poles: 65, podiums: 80, titles: 3 },
      trait: "A qualifying lap nobody has bettered for rate; untouchable in rain.",
      livery: { name: "Interlagos '88", c1: [0.94, 0.94, 0.96], c2: [0.86, 0.06, 0.09],
                stripe: [0.86, 0.06, 0.09], accent: [0.98, 0.78, 0.06],
                finShape: "none", spineHeight: "dorsal", spineLogo: "number" } },

    { id: "fangio", code: "FAN", era: "front50", name: "Juan Manuel Fangio", nat: "AR",
      years: "1950–1958", teams: "Alfa Romeo, Maserati, Mercedes, Ferrari", car: "Mercedes-Benz W196",
      record: { starts: 51, wins: 24, poles: 29, podiums: 35, titles: 5 },
      trait: "Won at the slowest speed that still won — the car always finished.",
      // VERIFIED: the W196 ran ultra-light Elektron magnesium-alloy bodywork —
      // the bare metal IS the colour, hence "Silver Arrow" and the brushed finish.
      livery: { name: "Silver Arrow '55", c1: [0.78, 0.79, 0.82], c2: [0.16, 0.17, 0.19],
                accent: [0.55, 0.57, 0.60], finish: "brushed",
                finShape: "none", spineHeight: "low", spineLogo: "number" } },

    { id: "clark", code: "CLK", era: "slim60", name: "Jim Clark", nat: "GB",
      years: "1960–1968", teams: "Lotus", car: "Lotus 25",
      record: { starts: 72, wins: 25, poles: 33, podiums: 32, titles: 2 },
      trait: "Never bullied a car — caressed it, and wore it out slower than anyone.",
      // VERIFIED: Lotus ran British Racing Green with gold lettering and accents.
      // British Racing Green as the commonly cited #004225 = rgb(0,66,37). The
      // source is explicit that no exact hue exists — BRG names a spectrum, and
      // 1960s teams each ran their own shade — so this is the standard value.
      livery: { name: "Lotus Green '63", c1: [0.00, 0.26, 0.145], c2: [0.85, 0.70, 0.22],
                stripe: [0.90, 0.76, 0.28], accent: [0.93, 0.94, 0.96],
                finShape: "none", spineHeight: "low", spineLogo: "fade" } },

    { id: "lauda", code: "LAU", era: "wing70", name: "Niki Lauda", nat: "AT",
      years: "1971–1985", teams: "March, BRM, Ferrari, Brabham, McLaren", car: "Ferrari 312T",
      record: { starts: 171, wins: 25, poles: 24, podiums: 54, titles: 3 },
      trait: "Engineer first: tested more than he raced and drove to the number.",
      // The ORIGINAL rosso corsa (#E4002B), deepened: the source notes it "may
      // appear almost dark brown" on a period television, which is the memory
      // this tribute is for — and it keeps the 1975 car off the 2004 car's red.
      livery: { name: "Rat's Red '75", c1: [0.55, 0.02, 0.05], c2: [0.14, 0.14, 0.16],
                stripe: [0.92, 0.93, 0.95], accent: [0.86, 0.72, 0.20],
                finShape: "none", spineHeight: "low", spineLogo: "carbon" } },

    { id: "prost", code: "PRO", era: "active92", name: "Alain Prost", nat: "FR",
      years: "1980–1993", teams: "McLaren, Renault, Ferrari, Williams", car: "Williams FW15C",
      record: { starts: 199, wins: 51, poles: 33, podiums: 106, titles: 4 },
      trait: "The Professor: tyres and brakes saved early, the race taken late.",
      // NAVY-DOMINANT on purpose. Rendered white-on-blue it was a near twin of
      // Mansell's Williams below — a real collision no colour assertion caught,
      // only looking at the two cars side by side did (scratch/renders/legends).
      livery: { name: "Professor '93", c1: [0.09, 0.12, 0.30], c2: [0.93, 0.94, 0.96],
                stripe: [0.93, 0.94, 0.96], accent: [0.96, 0.74, 0.12],
                finShape: "swept", spineHeight: "dorsal", spineLogo: "fade" } },

    { id: "stewart", code: "STE", era: "wing70", name: "Jackie Stewart", nat: "GB",
      years: "1965–1973", teams: "BRM, Matra, Tyrrell", car: "Tyrrell 003",
      record: { starts: 99, wins: 27, poles: 17, podiums: 43, titles: 3 },
      trait: "Ruthless in the wet, and the reason half the safety rules exist.",
      // VERIFIED: Tyrrell ran French Racing Blue under the Elf fuel sponsorship.
      livery: { name: "Tartan Blue '71", c1: [0.04, 0.24, 0.70], c2: [0.93, 0.94, 0.96],
                stripe: [0.90, 0.20, 0.20], accent: [0.96, 0.96, 0.98],
                finShape: "none", spineHeight: "low", spineLogo: "number" } },

    { id: "moss", code: "MOS", era: "front50", name: "Stirling Moss", nat: "GB",
      years: "1951–1961", teams: "HWM, Mercedes, Vanwall, Rob Walker, Lotus", car: "Vanwall VW5",
      // THE ONE LEGEND WITH NO TITLE, and the reason the roster's "champions
      // only" rule has an exception rather than a quiet omission: four
      // consecutive runner-up years (1955-58) and three thirds after, losing
      // 1958 by a single point to Hawthorn having won four races to his one.
      noTitle: "runner-up four years running; lost 1958 by one point having won four races to Hawthorn's one",
      record: { starts: 66, wins: 16, poles: 16, podiums: 24, titles: 0 },
      trait: "The best never to win it — and he defended the rival who beat him.",
      // Vanwall green. The BRG source is explicit that no exact hue exists and
      // that 1950s British teams each ran their own shade, so this is a
      // brighter green than Clark's Lotus and is meant to be.
      livery: { name: "Vanwall '58", c1: [0.05, 0.42, 0.20], c2: [0.93, 0.94, 0.96],
                stripe: [0.90, 0.76, 0.28], accent: [0.10, 0.12, 0.14],
                finShape: "none", spineHeight: "low", spineLogo: "number" } },

    { id: "ghill", code: "GHL", era: "wing68", name: "Graham Hill", nat: "GB",
      years: "1958–1975", teams: "BRM, Lotus, Brabham, Embassy Hill", car: "Lotus 49B",
      record: { starts: 176, wins: 14, poles: 13, podiums: 36, titles: 2 },
      // Still the ONLY driver to take the Triple Crown — Indianapolis 500
      // (1966), Le Mans (1972) and Monaco (five times) or the championship.
      trait: "The only Triple Crown: Indy, Le Mans and Monaco, and five Monacos.",
      livery: { name: "Gold Leaf '68", c1: [0.86, 0.60, 0.10], c2: [0.93, 0.94, 0.96],
                stripe: [0.80, 0.08, 0.10], accent: [0.15, 0.13, 0.10],
                finShape: "none", spineHeight: "low", spineLogo: "cap" } },

    { id: "hakkinen", code: "HAK", era: "narrow98", name: "Mika Häkkinen", nat: "FI",
      years: "1991–2001", teams: "Lotus, McLaren", car: "McLaren MP4/13",
      record: { starts: 161, wins: 20, poles: 26, podiums: 51, titles: 2 },
      trait: "An oversteering driver who came alive late in a season.",
      livery: { name: "Espoo '98", c1: [0.42, 0.44, 0.50], c2: [0.05, 0.05, 0.07],
                stripe: [0.88, 0.09, 0.10], accent: [0.90, 0.92, 0.95],
                finish: "brushed", finShape: "none", spineHeight: "dorsal", spineLogo: "fade" } },

    { id: "vettel", code: "VET", era: "blown13", name: "Sebastian Vettel", nat: "DE",
      years: "2007–2022", teams: "BMW Sauber, Toro Rosso, Red Bull, Ferrari, Aston Martin", car: "Red Bull RB9",
      record: { starts: 299, wins: 53, poles: 57, podiums: 122, titles: 4 },
      trait: "Youngest champion at 23, and nine wins in a row in 2013.",
      livery: { name: "Milton Keynes '13", c1: [0.04, 0.07, 0.48], c2: [0.96, 0.84, 0.10],
                stripe: [0.85, 0.08, 0.10], accent: [0.93, 0.94, 0.96],
                finShape: "swept", spineHeight: "dorsal", spineLogo: "number" } },

    { id: "mansell", code: "MAN", era: "active92", name: "Nigel Mansell", nat: "GB",
      years: "1980–1995", teams: "Lotus, Williams, Ferrari, McLaren", car: "Williams FW14B",
      num: 5,    // SOURCED: "Red 5" is his trademark, the red number 5 he carried across teams.
      record: { starts: 187, wins: 31, poles: 32, podiums: 59, titles: 1 },
      trait: "Il Leone — overtook where there was no room and made the room.",
      livery: { name: "Red Five '92", c1: [0.95, 0.95, 0.97], c2: [0.10, 0.32, 0.78],
                stripe: [0.90, 0.07, 0.09], accent: [0.99, 0.86, 0.06],
                finShape: "swept", spineHeight: "dorsal", spineLogo: "number" } }
  ];

  const clamp = M4.clamp;   // eval-time read: js/core/mat4.js loads before every data file
  const roundClamp = (v, lo, hi) => Math.round(clamp(v, lo, hi));

  /* The record -> the five axes js/data/driver-ratings.js already uses.
   * Each axis names the rate it argues from, so a reader can disagree with the
   * WEIGHT without having to guess what the number meant:
   *   pace        pole rate, mostly — a pole is a driver's fastest lap with the
   *               race taken out of it — with a little win rate so a racer who
   *               qualified modestly and won anyway is not read as slow.
   *   craft       win rate: converting a Sunday is the whole of racecraft.
   *   awareness   podium rate + titles: finishing high, repeatedly, is what
   *               reading a race buys you.
   *   consistency podium rate alone: the share of races that ended well.
   *   experience  starts and titles — the only axis where longevity should win,
   *               which is why Fangio's 51 starts sit below Prost's 199. */
  function ratingsFor(rec) {
    const poleRate = rec.poles / rec.starts;
    const winRate = rec.wins / rec.starts;
    const podRate = rec.podiums / rec.starts;
    return {
      pace:        roundClamp(76 + 34 * poleRate + 12 * winRate, 76, 99),
      craft:       roundClamp(78 + 44 * winRate, 78, 99),
      awareness:   roundClamp(72 + 26 * podRate + 2.2 * rec.titles, 72, 97),
      consistency: roundClamp(74 + 36 * podRate, 74, 97),
      experience:  roundClamp(60 + rec.starts / 8 + 4 * rec.titles, 60, 100)
    };
  }

  const byId = (id) => LIST.find((l) => l.id === id) || null;
  const byCode = (code) => LIST.find((l) => l.code === code) || null;

  /** The five axes for a legend, in the shape DriverRatings.get returns. */
  function ratings(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    return l ? ratingsFor(l.record) : null;
  }

  /* THE LEGENDS TEAM occupies the CUSTOM slot rather than adding a twelfth
   * entry to Teams.LIST, and that is a hard constraint, not a preference:
   * js/game.js's wireId() packs a team index and seat into ONE byte on the
   * assumption of "eleven fixed teams plus exactly one appended custom entry"
   * (so the grid fits inside 0..23), and tests/unit/grid-boxes.test.mjs pins
   * the field at eleven teams x two seats. A twelfth grid team is a netcode
   * and grid-geometry change, not a data edit. Taking the custom slot gives
   * the player a Legends car with a legend's own settings and leaves both
   * invariants untouched.
   *
   * SETTINGS, derived — the four garage stats come from the same five axes as
   * the ratings, so a legend's car matches the driver rather than being typed
   * in twice:
   *   speed      pace, the axis that already means one fast lap
   *   accel      pace and craft: getting the lap STARTED well
   *   cornering  craft and awareness — the two that make a car work in traffic
   *   braking    consistency, the axis that says the lap repeats
   * The team tier (0 fastest) follows the headline of those axes, so a legend
   * in a slower era does not silently get a 2026 front-running car. */
  function statsFor(r) {
    const mix = (a, b) => Math.round((a * 2 + b) / 3);
    return { speed: r.pace, accel: mix(r.pace, r.craft),
             cornering: mix(r.craft, r.awareness), braking: r.consistency };
  }

  /** A team-shaped object for one legend, ready for the custom slot.
   *  `id` stays "custom" — that is the slot it occupies; `legend` marks which. */
  function team(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    if (!l) return null;
    const r = ratingsFor(l.record);
    const st = statsFor(r);
    const head = (st.speed + st.cornering) / 2;
    return {
      id: "custom", custom: true, legend: l.id,
      name: "Legends", short: "LGD", engine: l.car,
      tier: head >= 95 ? 0 : head >= 90 ? 1 : head >= 85 ? 2 : 3,
      color: l.livery.c1.slice(), color2: l.livery.c2.slice(),
      livery: Object.assign({}, l.livery, { name: undefined }),
      stats: st,
      // NUMBERS: only Senna's 12 and Mansell's 5 are sourced above. The rest
      // fall back to 1 rather than being invented — a plausible-looking wrong
      // number is worse than an obviously neutral one, and this file's whole
      // discipline is that a fact is either sourced or is not stated.
      drivers: [{ name: l.name, code: l.code, num: l.num || 1 }]
    };
  }

  /* PERIOD CAR SHAPES. Every entry below is an EXISTING option id from the
   * js/car/parts.js catalog — no new geometry, no new visual field, no new
   * mesh path. The catalog already carries the shapes an era needs and the
   * 2026 grid simply never picks them, so an era is a SETUP, not a model:
   *   aero "minimal"    lvl 0 — no wings at all, which is the whole 1950s car
   *   cockpit "standard" halo 0 — an open cockpit, mandatory before 2018
   *   floor "stripped"  fences 0 — a flat bottom with no aero furniture
   *   wheels "spoked"   6 spokes — wire wheels; "open_spoke" is the 8-spoke
   *                     magnesium that replaced them
   *   exhaust "megaphone" one flared pipe — the period megaphone
   *   suspension "comfort" tall and soft with push 0 — no pushrods yet
   * Later eras walk the same knobs FORWARD, so the twelve legends span nine
   * visibly different cars using parts a player can already fit themselves.
   *
   * Every setup fits inside Parts.BUDGET (780). The FACTORY presets do not —
   * McLaren's is 2000 — but those are never written to a garage sheet, and this
   * one is: `parts.custom` IS the player's sheet, so an over-budget legend car
   * would show a negative balance and refuse every new fit until the player
   * downgraded something. The budget is therefore spent on the SILHOUETTE
   * rather than on stats: that is what makes it a tribute car and not a cheat.
   *
   * Ordered oldest to newest; each line says the tell that dates the car. */
  const PERIOD = {
    // W196 / Vanwall VW5 — front-engined cigar: no wings, wire wheels, a
    // megaphone pipe and a bare floor. The silhouette is the point.
    front50: { engine: "lean_burn", aero: "minimal", suspension: "comfort", brakes: "standard",
               tyres: "hard", ers: "standard", gearbox: "long_ratio", fuel: "standard",
               exhaust: "megaphone", floor: "stripped", cockpit: "standard", wheels: "spoked" },
    // Lotus 25 — the monocoque. Still wingless and still a cigar, but the
    // wheels go magnesium and the suspension stops being a road car's.
    slim60: { engine: "lean_burn", aero: "minimal", suspension: "torsion_bar", brakes: "drilled",
              tyres: "hard", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "megaphone", floor: "stripped", cockpit: "standard", wheels: "open_spoke" },
    // Lotus 49B — WINGS ARRIVE (1968). aero "low" is the first rung above
    // nothing, which is exactly what the first aerofoils were.
    wing68: { engine: "torque_curve", aero: "low", suspension: "standard", brakes: "drilled",
              tyres: "medium", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "megaphone", floor: "stripped", cockpit: "standard", wheels: "open_spoke" },
    // Tyrrell 003 / Ferrari 312T — slicks, ventilated discs and rocker-arm
    // suspension ("sport" carries rocker: 1), still on a flat floor.
    wing70: { engine: "torque_curve", aero: "low", suspension: "sport", brakes: "ventilated",
              tyres: "slick_track", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "free_flow", floor: "stripped", cockpit: "standard", wheels: "mag_forged" },
    // McLaren MP4/4 — the turbo. "turbo" brings the snorkel and two chimneys;
    // "twin_gate" brings the two wastegates that only a turbo car has.
    turbo88: { engine: "turbo", aero: "medium", suspension: "low_ride", brakes: "carbon",
               tyres: "soft", ers: "standard", gearbox: "close_ratio", fuel: "high_octane",
               exhaust: "twin_gate", floor: "stripped", cockpit: "standard", wheels: "dished" },
    // Williams FW14B / FW15C — ACTIVE SUSPENSION, the car's whole identity,
    // and the tallest wings before the 1994 rule cut.
    active92: { engine: "highrev", aero: "high", suspension: "active", brakes: "carbon",
                tyres: "soft", ers: "standard", gearbox: "sequential_pro", fuel: "standard",
                exhaust: "free_flow", floor: "standard", cockpit: "standard", wheels: "dished" },
    // McLaren MP4/13 — the narrow-track era. floor "step_plank" carries the
    // plank mandated after 1994; the cockpit grows its first camera pods.
    narrow98: { engine: "highrev", aero: "rake_setup", suspension: "racing", brakes: "carbon",
                tyres: "medium", ers: "standard", gearbox: "carbon_case", fuel: "standard",
                exhaust: "inconel", floor: "step_plank", cockpit: "twin_cam", wheels: "taped" },
    // Ferrari F2004 — the V10 peak: a full diffuser, carbon-magnesium discs
    // and the taped, dished rims of the refuelling era.
    vten04: { engine: "race", aero: "diffuser", suspension: "triple_damper", brakes: "carbon",
              tyres: "medium", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "inconel", floor: "step_plank", cockpit: "twin_cam", wheels: "taped_dish" },
    // Red Bull RB9 — DRS (aero "active_aero" sets drs: 1), KERS harvesting and
    // the blown-diffuser exhaust. Still no halo: that is 2018.
    blown13: { engine: "performance", aero: "active_aero", suspension: "carbon_pushrods", brakes: "drilled",
               tyres: "medium", ers: "harvest", gearbox: "close_ratio", fuel: "standard",
               exhaust: "tri_exit", floor: "gurney_edge", cockpit: "twin_cam", wheels: "aero_disc" },
  };

  /* The YEAR each era's car is from — the signature machine in the `car` field
   * above, not the driver's last season. Vettel raced to 2022, but the RB9 is
   * 2013; that gap is exactly why this is a separate number and not derived
   * from `years`. It is what dates a car for anything that needs to reason
   * about the era rather than just render it (the halo arrived in 2018). */
  const ERA_YEAR = {
    front50: 1954, slim60: 1962, wing68: 1968, wing70: 1973, turbo88: 1988,
    active92: 1992, narrow98: 1998, vten04: 2004, blown13: 2013,
  };

  /** The period parts setup for a legend, in the shape js/car/parts.js takes
   *  (`store.get("parts.<teamId>")`). Null for an unknown legend or era. */
  function parts(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    const p = l && PERIOD[l.era];
    return p ? Object.assign({}, p) : null;
  }

  /** Livery picker entries: `legend_<id>`, so an id can never collide with the
   *  hand-authored ids in js/car/liveries.js. */
  function liveries() {
    return LIST.map((l) => Object.assign({ id: `legend_${l.id}`, legend: l.id }, l.livery));
  }

  return { LIST, PERIOD, ERA_YEAR, ratings, ratingsFor, statsFor, team, parts, liveries, byId, byCode };
})();
Object.freeze(Legends);
