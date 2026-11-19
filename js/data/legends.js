const Legends = (function () {
  "use strict";

  const LIST = [
    { id: "schumacher", code: "MSC", marque: "ferrari", era: "vten04", name: "Michael Schumacher", nat: "DE",
      years: "1991–2012", teams: "Jordan, Benetton, Ferrari, Mercedes", car: "Ferrari F2004",
      record: { starts: 306, wins: 91, poles: 68, podiums: 155, titles: 7 },
      trait: "Relentless over a stint, and the era's benchmark in the wet.",
      livery: { name: "Maranello '04", c1: [0.88, 0.11, 0.02], c2: [0.93, 0.93, 0.95],
                stripe: [0.98, 0.82, 0.10], accent: [0.10, 0.10, 0.12],
                finShape: "none", spineHeight: "dorsal", spineLogo: "cap" } },

    { id: "senna", code: "SEN", marque: "mclaren", era: "turbo88", name: "Ayrton Senna", nat: "BR",
      years: "1984–1994", teams: "Toleman, Lotus, McLaren, Williams", car: "McLaren MP4/4",
      num: 12,
      record: { starts: 161, wins: 41, poles: 65, podiums: 80, titles: 3 },
      trait: "A qualifying lap nobody has bettered for rate; untouchable in rain.",
      livery: { name: "Interlagos '88", c1: [0.94, 0.94, 0.96], c2: [0.86, 0.06, 0.09],
                stripe: [0.86, 0.06, 0.09], accent: [0.98, 0.78, 0.06],
                finShape: "none", spineHeight: "dorsal", spineLogo: "number" } },

    { id: "fangio", code: "FAN", marque: "mercedes", era: "front50", name: "Juan Manuel Fangio", nat: "AR",
      years: "1950–1958", teams: "Alfa Romeo, Maserati, Mercedes, Ferrari", car: "Mercedes-Benz W196",
      record: { starts: 51, wins: 24, poles: 29, podiums: 35, titles: 5 },
      trait: "Won at the slowest speed that still won — the car always finished.",
      parts: { suspension: "torsion_bar" },
      livery: { name: "Silver Arrow '55", c1: [0.78, 0.79, 0.82], c2: [0.16, 0.17, 0.19],
                accent: [0.55, 0.57, 0.60], finish: "brushed",
                finShape: "none", spineHeight: "standard", spineLogo: "number" } },

    { id: "clark", code: "CLK", marque: null, era: "slim60", name: "Jim Clark", nat: "GB",
      years: "1960–1968", teams: "Lotus", car: "Lotus 25",
      record: { starts: 72, wins: 25, poles: 33, podiums: 32, titles: 2 },
      trait: "Never bullied a car — caressed it, and wore it out slower than anyone.",
      livery: { name: "Lotus Green '63", c1: [0.00, 0.26, 0.145], c2: [0.85, 0.70, 0.22],
                stripe: [0.90, 0.76, 0.28], accent: [0.93, 0.94, 0.96],
                finShape: "none", spineHeight: "standard", spineLogo: "fade" } },

    { id: "lauda", code: "LAU", marque: "ferrari", era: "wing70", name: "Niki Lauda", nat: "AT",
      years: "1971–1985", teams: "March, BRM, Ferrari, Brabham, McLaren", car: "Ferrari 312T",
      record: { starts: 171, wins: 25, poles: 24, podiums: 54, titles: 3 },
      trait: "Engineer first: tested more than he raced and drove to the number.",
      parts: { aero: "medium" },
      livery: { name: "Rat's Red '75", c1: [0.55, 0.02, 0.05], c2: [0.14, 0.14, 0.16],
                stripe: [0.92, 0.93, 0.95], accent: [0.86, 0.72, 0.20],
                finShape: "none", spineHeight: "standard", spineLogo: "carbon" } },

    { id: "prost", code: "PRO", marque: "williams", era: "active92", name: "Alain Prost", nat: "FR",
      years: "1980–1993", teams: "McLaren, Renault, Ferrari, Williams", car: "Williams FW15C",
      record: { starts: 199, wins: 51, poles: 33, podiums: 106, titles: 4 },
      trait: "The Professor: tyres and brakes saved early, the race taken late.",
      livery: { name: "Professor '93", c1: [0.09, 0.12, 0.30], c2: [0.93, 0.94, 0.96],
                stripe: [0.93, 0.94, 0.96], accent: [0.96, 0.74, 0.12],
                finShape: "swept", spineHeight: "dorsal", spineLogo: "fade" } },

    { id: "stewart", code: "STE", marque: null, era: "wing70", name: "Jackie Stewart", nat: "GB",
      years: "1965–1973", teams: "BRM, Matra, Tyrrell", car: "Tyrrell 003",
      record: { starts: 99, wins: 27, poles: 17, podiums: 43, titles: 3 },
      trait: "Ruthless in the wet, and the reason half the safety rules exist.",
      parts: { suspension: "standard" },
      livery: { name: "Tartan Blue '71", c1: [0.04, 0.24, 0.70], c2: [0.93, 0.94, 0.96],
                stripe: [0.90, 0.20, 0.20], accent: [0.96, 0.96, 0.98],
                finShape: "none", spineHeight: "standard", spineLogo: "number" } },

    { id: "moss", code: "MOS", marque: null, era: "front50", name: "Stirling Moss", nat: "GB",
      years: "1951–1961", teams: "HWM, Mercedes, Vanwall, Rob Walker, Lotus", car: "Vanwall VW5",
      noTitle: "runner-up four years running; lost 1958 by one point having won four races to Hawthorn's one",
      record: { starts: 66, wins: 16, poles: 16, podiums: 24, titles: 0 },
      trait: "The best never to win it — and he defended the rival who beat him.",
      parts: { brakes: "drilled" },
      livery: { name: "Vanwall '58", c1: [0.05, 0.42, 0.20], c2: [0.93, 0.94, 0.96],
                stripe: [0.90, 0.76, 0.28], accent: [0.10, 0.12, 0.14],
                finShape: "none", spineHeight: "standard", spineLogo: "number" } },

    { id: "ghill", code: "GHL", marque: null, era: "wing68", name: "Graham Hill", nat: "GB",
      years: "1958–1975", teams: "BRM, Lotus, Brabham, Embassy Hill", car: "Lotus 49B",
      record: { starts: 176, wins: 14, poles: 13, podiums: 36, titles: 2 },
      trait: "The only Triple Crown: Indy, Le Mans and Monaco, and five Monacos.",
      livery: { name: "Gold Leaf '68", c1: [0.86, 0.60, 0.10], c2: [0.93, 0.94, 0.96],
                stripe: [0.80, 0.08, 0.10], accent: [0.15, 0.13, 0.10],
                finShape: "none", spineHeight: "standard", spineLogo: "cap" } },

    { id: "hakkinen", code: "HAK", marque: "mclaren", era: "narrow98", name: "Mika Häkkinen", nat: "FI",
      years: "1991–2001", teams: "Lotus, McLaren", car: "McLaren MP4/13",
      record: { starts: 161, wins: 20, poles: 26, podiums: 51, titles: 2 },
      trait: "An oversteering driver who came alive late in a season.",
      livery: { name: "Espoo '98", c1: [0.42, 0.44, 0.50], c2: [0.05, 0.05, 0.07],
                stripe: [0.88, 0.09, 0.10], accent: [0.90, 0.92, 0.95],
                finish: "brushed", finShape: "none", spineHeight: "dorsal", spineLogo: "fade" } },

    { id: "vettel", code: "VET", marque: "redbull", era: "blown13", name: "Sebastian Vettel", nat: "DE",
      years: "2007–2022", teams: "BMW Sauber, Toro Rosso, Red Bull, Ferrari, Aston Martin", car: "Red Bull RB9",
      record: { starts: 299, wins: 53, poles: 57, podiums: 122, titles: 4 },
      trait: "Youngest champion at 23, and nine wins in a row in 2013.",
      livery: { name: "Milton Keynes '13", c1: [0.04, 0.07, 0.48], c2: [0.96, 0.84, 0.10],
                stripe: [0.85, 0.08, 0.10], accent: [0.93, 0.94, 0.96],
                finShape: "swept", spineHeight: "dorsal", spineLogo: "number" } },

    { id: "mansell", code: "MAN", marque: "williams", era: "active92", name: "Nigel Mansell", nat: "GB",
      years: "1980–1995", teams: "Lotus, Williams, Ferrari, McLaren", car: "Williams FW14B",
      num: 5,
      record: { starts: 187, wins: 31, poles: 32, podiums: 59, titles: 1 },
      trait: "Il Leone — overtook where there was no room and made the room.",
      livery: { name: "Red Five '92", c1: [0.95, 0.95, 0.97], c2: [0.10, 0.32, 0.78],
                stripe: [0.90, 0.07, 0.09], accent: [0.99, 0.86, 0.06],
                finShape: "swept", spineHeight: "dorsal", spineLogo: "number" } }
  ];

  const clamp = M4.clamp;
  const roundClamp = (v, lo, hi) => Math.round(clamp(v, lo, hi));

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

  function ratings(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    return l ? ratingsFor(l.record) : null;
  }

  function statsFor(r) {
    const mix = (a, b) => Math.round((a * 2 + b) / 3);
    return { speed: r.pace, accel: mix(r.pace, r.craft),
             cornering: mix(r.craft, r.awareness), braking: r.consistency };
  }

  function team(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    if (!l) return null;
    const r = ratingsFor(l.record);
    const st = statsFor(r);
    const head = (st.speed + st.cornering) / 2;
    return {
      id: "legends", legends: true, legend: l.id,
      factory: parts(l.id),
      crest: l.marque || null,
      name: "Legends", short: "LGD", engine: l.car,
      tier: head >= 95 ? 0 : head >= 90 ? 1 : head >= 85 ? 2 : 3,
      color: l.livery.c1.slice(), color2: l.livery.c2.slice(),
      livery: Object.assign({}, l.livery, { name: undefined }),
      stats: st,
      drivers: LIST.map((d) => ({ name: d.name, code: d.code, num: d.num || 1 }))
    };
  }

  function raceTeam(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    const t = team(l && l.id);
    if (!t) return null;
    t.id = `legend_${l.id}`;
    t.factory = parts(l.id);
    t.drivers = [{ name: l.name, code: l.code, num: l.num || 1 }];
    return t;
  }

  function seatOf(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    return l ? LIST.indexOf(l) : -1;
  }

  const PERIOD = {
    front50: { engine: "lean_burn", aero: "minimal", suspension: "comfort", brakes: "standard",
               tyres: "hard", ers: "standard", gearbox: "long_ratio", fuel: "standard",
               exhaust: "megaphone", floor: "stripped", cockpit: "standard", wheels: "spoked" },
    slim60: { engine: "lean_burn", aero: "minimal", suspension: "torsion_bar", brakes: "drilled",
              tyres: "hard", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "megaphone", floor: "stripped", cockpit: "standard", wheels: "open_spoke" },
    wing68: { engine: "torque_curve", aero: "low", suspension: "standard", brakes: "drilled",
              tyres: "medium", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "megaphone", floor: "stripped", cockpit: "standard", wheels: "open_spoke" },
    wing70: { engine: "torque_curve", aero: "low", suspension: "sport", brakes: "ventilated",
              tyres: "slick_track", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "free_flow", floor: "stripped", cockpit: "standard", wheels: "mag_forged" },
    turbo88: { engine: "turbo", aero: "medium", suspension: "low_ride", brakes: "carbon",
               tyres: "soft", ers: "standard", gearbox: "close_ratio", fuel: "high_octane",
               exhaust: "twin_gate", floor: "stripped", cockpit: "standard", wheels: "dished" },
    active92: { engine: "highrev", aero: "high", suspension: "active", brakes: "carbon",
                tyres: "soft", ers: "standard", gearbox: "sequential_pro", fuel: "standard",
                exhaust: "free_flow", floor: "standard", cockpit: "standard", wheels: "dished" },
    narrow98: { engine: "highrev", aero: "rake_setup", suspension: "racing", brakes: "carbon",
                tyres: "medium", ers: "standard", gearbox: "carbon_case", fuel: "standard",
                exhaust: "inconel", floor: "step_plank", cockpit: "twin_cam", wheels: "taped" },
    vten04: { engine: "race", aero: "diffuser", suspension: "triple_damper", brakes: "carbon",
              tyres: "medium", ers: "standard", gearbox: "close_ratio", fuel: "standard",
              exhaust: "inconel", floor: "step_plank", cockpit: "twin_cam", wheels: "taped_dish" },
    blown13: { engine: "performance", aero: "active_aero", suspension: "carbon_pushrods", brakes: "drilled",
               tyres: "medium", ers: "harvest", gearbox: "close_ratio", fuel: "standard",
               exhaust: "tri_exit", floor: "gurney_edge", cockpit: "twin_cam", wheels: "aero_disc" },
  };

  const ERA_YEAR = {
    front50: 1954, slim60: 1962, wing68: 1968, wing70: 1973, turbo88: 1988,
    active92: 1992, narrow98: 1998, vten04: 2004, blown13: 2013,
  };

  function parts(idOrCode) {
    const l = byId(idOrCode) || byCode(idOrCode);
    const p = l && PERIOD[l.era];
    return p ? Object.assign({}, p, l.parts || {}) : null;
  }

  function liveries() {
    return LIST.map((l) => Object.assign({ id: `legend_${l.id}`, legend: l.id }, l.livery));
  }

  return { LIST, PERIOD, ERA_YEAR, seatOf, ratings, team, raceTeam, parts, liveries, byId, byCode };
})();
Object.freeze(Legends);
