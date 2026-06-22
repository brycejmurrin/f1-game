// @ts-check
// Mock F1 API responses for Playwright tests.
// api.jolpi.ca and api.openf1.org are blocked by network egress in CI.
// Call setupApiMocks(page) before opening the data hub to inject realistic data.

const SCHEDULE = {
  MRData: {
    RaceTable: {
      Races: [
        { round: "1",  raceName: "Bahrain Grand Prix",        Circuit: { circuitName: "Bahrain International Circuit", Location: { locality: "Sakhir",         country: "Bahrain" } },       date: "2026-03-01", time: "15:00:00Z" },
        { round: "2",  raceName: "Saudi Arabian Grand Prix",  Circuit: { circuitName: "Jeddah Corniche Circuit",        Location: { locality: "Jeddah",          country: "Saudi Arabia" } },  date: "2026-03-15", time: "17:00:00Z" },
        { round: "3",  raceName: "Australian Grand Prix",     Circuit: { circuitName: "Albert Park Circuit",            Location: { locality: "Melbourne",        country: "Australia" } },     date: "2026-04-05", time: "05:00:00Z" },
        { round: "4",  raceName: "Japanese Grand Prix",       Circuit: { circuitName: "Suzuka International Circuit",   Location: { locality: "Suzuka",           country: "Japan" } },         date: "2026-04-19", time: "05:00:00Z" },
        { round: "5",  raceName: "Chinese Grand Prix",        Circuit: { circuitName: "Shanghai International Circuit", Location: { locality: "Shanghai",          country: "China" } },         date: "2026-05-03", time: "07:00:00Z" },
        { round: "6",  raceName: "Miami Grand Prix",          Circuit: { circuitName: "Miami International Autodrome",  Location: { locality: "Miami",             country: "USA" } },           date: "2026-05-17", time: "19:00:00Z", Sprint: {} },
        { round: "7",  raceName: "Emilia Romagna Grand Prix", Circuit: { circuitName: "Autodromo Enzo e Dino Ferrari",  Location: { locality: "Imola",             country: "Italy" } },         date: "2026-05-31", time: "13:00:00Z" },
        { round: "8",  raceName: "Monaco Grand Prix",         Circuit: { circuitName: "Circuit de Monaco",              Location: { locality: "Monte-Carlo",        country: "Monaco" } },        date: "2026-06-07", time: "13:00:00Z" },
        { round: "9",  raceName: "Spanish Grand Prix",        Circuit: { circuitName: "Circuit de Barcelona-Catalunya", Location: { locality: "Montmeló",           country: "Spain" } },         date: "2026-06-14", time: "13:00:00Z" },
        { round: "10", raceName: "Canadian Grand Prix",       Circuit: { circuitName: "Circuit Gilles Villeneuve",      Location: { locality: "Montréal",           country: "Canada" } },        date: "2026-06-21", time: "18:00:00Z" },
        { round: "11", raceName: "Austrian Grand Prix",       Circuit: { circuitName: "Red Bull Ring",                  Location: { locality: "Spielberg",          country: "Austria" } },       date: "2026-07-05", time: "13:00:00Z", Sprint: {} },
        { round: "12", raceName: "British Grand Prix",        Circuit: { circuitName: "Silverstone Circuit",            Location: { locality: "Silverstone",         country: "UK" } },           date: "2026-07-19", time: "14:00:00Z" },
        { round: "13", raceName: "Hungarian Grand Prix",      Circuit: { circuitName: "Hungaroring",                    Location: { locality: "Budapest",            country: "Hungary" } },       date: "2026-08-02", time: "13:00:00Z" },
        { round: "14", raceName: "Belgian Grand Prix",        Circuit: { circuitName: "Circuit de Spa-Francorchamps",   Location: { locality: "Stavelot",            country: "Belgium" } },       date: "2026-08-16", time: "13:00:00Z" },
        { round: "15", raceName: "Dutch Grand Prix",          Circuit: { circuitName: "Circuit Zandvoort",              Location: { locality: "Zandvoort",           country: "Netherlands" } },   date: "2026-08-30", time: "13:00:00Z" },
        { round: "16", raceName: "Italian Grand Prix",        Circuit: { circuitName: "Autodromo Nazionale Monza",      Location: { locality: "Monza",               country: "Italy" } },         date: "2026-09-13", time: "13:00:00Z" },
        { round: "17", raceName: "Azerbaijan Grand Prix",     Circuit: { circuitName: "Baku City Circuit",              Location: { locality: "Baku",                country: "Azerbaijan" } },    date: "2026-09-27", time: "11:00:00Z" },
        { round: "18", raceName: "Singapore Grand Prix",      Circuit: { circuitName: "Marina Bay Street Circuit",      Location: { locality: "Singapore",           country: "Singapore" } },     date: "2026-10-11", time: "12:00:00Z" },
        { round: "19", raceName: "United States Grand Prix",  Circuit: { circuitName: "Circuit of the Americas",        Location: { locality: "Austin",              country: "USA" } },           date: "2026-10-25", time: "19:00:00Z", Sprint: {} },
        { round: "20", raceName: "Mexico City Grand Prix",    Circuit: { circuitName: "Autodromo Hermanos Rodriguez",   Location: { locality: "Mexico City",          country: "Mexico" } },        date: "2026-11-01", time: "20:00:00Z" },
        { round: "21", raceName: "São Paulo Grand Prix",      Circuit: { circuitName: "Autodromo Jose Carlos Pace",     Location: { locality: "São Paulo",            country: "Brazil" } },        date: "2026-11-15", time: "16:00:00Z", Sprint: {} },
        { round: "22", raceName: "Las Vegas Grand Prix",      Circuit: { circuitName: "Las Vegas Strip Circuit",        Location: { locality: "Las Vegas",            country: "USA" } },           date: "2026-11-22", time: "06:00:00Z" },
        { round: "23", raceName: "Qatar Grand Prix",          Circuit: { circuitName: "Lusail International Circuit",   Location: { locality: "Lusail",              country: "Qatar" } },         date: "2026-11-29", time: "14:00:00Z", SprintQualifying: {} },
        { round: "24", raceName: "Abu Dhabi Grand Prix",      Circuit: { circuitName: "Yas Marina Circuit",             Location: { locality: "Abu Dhabi",            country: "UAE" } },           date: "2026-12-06", time: "13:00:00Z" }
      ]
    }
  }
};

const DRIVER_STANDINGS = {
  MRData: {
    StandingsTable: {
      StandingsLists: [{
        season: "2026",
        round: "10",
        DriverStandings: [
          { position: "1",  points: "185", wins: "4", Driver: { givenName: "Lando",     familyName: "Norris",     code: "NOR", permanentNumber: "1"  }, Constructors: [{ name: "McLaren" }] },
          { position: "2",  points: "172", wins: "3", Driver: { givenName: "George",    familyName: "Russell",    code: "RUS", permanentNumber: "63" }, Constructors: [{ name: "Mercedes-AMG Petronas" }] },
          { position: "3",  points: "158", wins: "2", Driver: { givenName: "Charles",   familyName: "Leclerc",    code: "LEC", permanentNumber: "16" }, Constructors: [{ name: "Scuderia Ferrari HP" }] },
          { position: "4",  points: "134", wins: "1", Driver: { givenName: "Lewis",     familyName: "Hamilton",   code: "HAM", permanentNumber: "44" }, Constructors: [{ name: "Scuderia Ferrari HP" }] },
          { position: "5",  points: "123", wins: "0", Driver: { givenName: "Oscar",     familyName: "Piastri",    code: "PIA", permanentNumber: "81" }, Constructors: [{ name: "McLaren" }] },
          { position: "6",  points: "102", wins: "0", Driver: { givenName: "Kimi",      familyName: "Antonelli",  code: "ANT", permanentNumber: "12" }, Constructors: [{ name: "Mercedes-AMG Petronas" }] },
          { position: "7",  points: "87",  wins: "0", Driver: { givenName: "Max",       familyName: "Verstappen", code: "VER", permanentNumber: "33" }, Constructors: [{ name: "Red Bull Racing" }] },
          { position: "8",  points: "56",  wins: "0", Driver: { givenName: "Pierre",    familyName: "Gasly",      code: "GAS", permanentNumber: "10" }, Constructors: [{ name: "Alpine" }] },
          { position: "9",  points: "45",  wins: "0", Driver: { givenName: "Carlos",    familyName: "Sainz",      code: "SAI", permanentNumber: "55" }, Constructors: [{ name: "Williams" }] },
          { position: "10", points: "38",  wins: "0", Driver: { givenName: "Alexander", familyName: "Albon",      code: "ALB", permanentNumber: "23" }, Constructors: [{ name: "Williams" }] },
          { position: "11", points: "35",  wins: "0", Driver: { givenName: "Isack",     familyName: "Hadjar",     code: "HAD", permanentNumber: "6"  }, Constructors: [{ name: "Red Bull Racing" }] },
          { position: "12", points: "28",  wins: "0", Driver: { givenName: "Esteban",   familyName: "Ocon",       code: "OCO", permanentNumber: "31" }, Constructors: [{ name: "Haas" }] },
          { position: "13", points: "22",  wins: "0", Driver: { givenName: "Oliver",    familyName: "Bearman",    code: "BEA", permanentNumber: "87" }, Constructors: [{ name: "Haas" }] },
          { position: "14", points: "19",  wins: "0", Driver: { givenName: "Liam",      familyName: "Lawson",     code: "LAW", permanentNumber: "40" }, Constructors: [{ name: "Racing Bulls" }] },
          { position: "15", points: "15",  wins: "0", Driver: { givenName: "Arvid",     familyName: "Lindblad",   code: "LIN", permanentNumber: "41" }, Constructors: [{ name: "Racing Bulls" }] },
          { position: "16", points: "14",  wins: "0", Driver: { givenName: "Fernando",  familyName: "Alonso",     code: "ALO", permanentNumber: "14" }, Constructors: [{ name: "Aston Martin" }] },
          { position: "17", points: "12",  wins: "0", Driver: { givenName: "Lance",     familyName: "Stroll",     code: "STR", permanentNumber: "18" }, Constructors: [{ name: "Aston Martin" }] },
          { position: "18", points: "10",  wins: "0", Driver: { givenName: "Nico",      familyName: "Hülkenberg", code: "HUL", permanentNumber: "27" }, Constructors: [{ name: "Audi" }] },
          { position: "19", points: "8",   wins: "0", Driver: { givenName: "Gabriel",   familyName: "Bortoleto",  code: "BOR", permanentNumber: "5"  }, Constructors: [{ name: "Audi" }] },
          { position: "20", points: "6",   wins: "0", Driver: { givenName: "Sergio",    familyName: "Perez",      code: "PER", permanentNumber: "11" }, Constructors: [{ name: "Cadillac" }] },
          { position: "21", points: "4",   wins: "0", Driver: { givenName: "Franco",    familyName: "Colapinto",  code: "COL", permanentNumber: "43" }, Constructors: [{ name: "Alpine" }] },
          { position: "22", points: "2",   wins: "0", Driver: { givenName: "Valtteri",  familyName: "Bottas",     code: "BOT", permanentNumber: "77" }, Constructors: [{ name: "Cadillac" }] }
        ]
      }]
    }
  }
};

const CONSTRUCTOR_STANDINGS = {
  MRData: {
    StandingsTable: {
      StandingsLists: [{
        season: "2026",
        round: "10",
        ConstructorStandings: [
          { position: "1",  points: "308", wins: "4", Constructor: { name: "McLaren" } },
          { position: "2",  points: "292", wins: "3", Constructor: { name: "Scuderia Ferrari HP" } },
          { position: "3",  points: "274", wins: "3", Constructor: { name: "Mercedes-AMG Petronas" } },
          { position: "4",  points: "122", wins: "0", Constructor: { name: "Red Bull Racing" } },
          { position: "5",  points: "83",  wins: "0", Constructor: { name: "Williams" } },
          { position: "6",  points: "60",  wins: "0", Constructor: { name: "Alpine" } },
          { position: "7",  points: "50",  wins: "0", Constructor: { name: "Haas" } },
          { position: "8",  points: "34",  wins: "0", Constructor: { name: "Racing Bulls" } },
          { position: "9",  points: "26",  wins: "0", Constructor: { name: "Aston Martin" } },
          { position: "10", points: "18",  wins: "0", Constructor: { name: "Audi" } },
          { position: "11", points: "8",   wins: "0", Constructor: { name: "Cadillac" } }
        ]
      }]
    }
  }
};

const LAST_RACE = {
  MRData: {
    RaceTable: {
      Races: [{
        raceName: "Canadian Grand Prix",
        round: "10",
        date: "2026-06-21",
        Circuit: { circuitName: "Circuit Gilles Villeneuve", Location: { locality: "Montréal", country: "Canada" } },
        Results: [
          { position: "1",  points: "25", grid: "1",  Driver: { givenName: "Lando",     familyName: "Norris",     code: "NOR" }, Constructor: { name: "McLaren" },               Time: { time: "1:28:34.560" }, status: "Finished" },
          { position: "2",  points: "18", grid: "3",  Driver: { givenName: "George",    familyName: "Russell",    code: "RUS" }, Constructor: { name: "Mercedes-AMG Petronas" }, Time: { time: "+4.312" },      status: "Finished" },
          { position: "3",  points: "15", grid: "2",  Driver: { givenName: "Charles",   familyName: "Leclerc",    code: "LEC" }, Constructor: { name: "Scuderia Ferrari HP" },   Time: { time: "+8.791" },      status: "Finished" },
          { position: "4",  points: "12", grid: "5",  Driver: { givenName: "Oscar",     familyName: "Piastri",    code: "PIA" }, Constructor: { name: "McLaren" },               Time: { time: "+12.445" },     status: "Finished" },
          { position: "5",  points: "10", grid: "4",  Driver: { givenName: "Lewis",     familyName: "Hamilton",   code: "HAM" }, Constructor: { name: "Scuderia Ferrari HP" },   Time: { time: "+18.003" },     status: "Finished" },
          { position: "6",  points: "8",  grid: "6",  Driver: { givenName: "Kimi",      familyName: "Antonelli",  code: "ANT" }, Constructor: { name: "Mercedes-AMG Petronas" }, Time: { time: "+23.677" },     status: "Finished" },
          { position: "7",  points: "6",  grid: "8",  Driver: { givenName: "Max",       familyName: "Verstappen", code: "VER" }, Constructor: { name: "Red Bull Racing" },       Time: { time: "+31.220" },     status: "Finished" },
          { position: "8",  points: "4",  grid: "7",  Driver: { givenName: "Pierre",    familyName: "Gasly",      code: "GAS" }, Constructor: { name: "Alpine" },                Time: { time: "+38.904" },     status: "Finished" },
          { position: "9",  points: "2",  grid: "10", Driver: { givenName: "Carlos",    familyName: "Sainz",      code: "SAI" }, Constructor: { name: "Williams" },              Time: { time: "+44.112" },     status: "Finished" },
          { position: "10", points: "1",  grid: "9",  Driver: { givenName: "Alexander", familyName: "Albon",      code: "ALB" }, Constructor: { name: "Williams" },              Time: { time: "+51.338" },     status: "Finished" },
          { position: "11", points: "0",  grid: "11", Driver: { givenName: "Esteban",   familyName: "Ocon",       code: "OCO" }, Constructor: { name: "Haas" },                  Time: { time: "+59.001" },     status: "Finished" },
          { position: "12", points: "0",  grid: "12", Driver: { givenName: "Oliver",    familyName: "Bearman",    code: "BEA" }, Constructor: { name: "Haas" },                  Time: { time: "+1:04.458" },   status: "Finished" },
          { position: "13", points: "0",  grid: "14", Driver: { givenName: "Liam",      familyName: "Lawson",     code: "LAW" }, Constructor: { name: "Racing Bulls" },          Time: { time: "+1:11.220" },   status: "Finished" },
          { position: "14", points: "0",  grid: "15", Driver: { givenName: "Fernando",  familyName: "Alonso",     code: "ALO" }, Constructor: { name: "Aston Martin" },          Time: { time: "+1:18.334" },   status: "Finished" },
          { position: "15", points: "0",  grid: "16", Driver: { givenName: "Lance",     familyName: "Stroll",     code: "STR" }, Constructor: { name: "Aston Martin" },          Time: { time: "+1:25.007" },   status: "Finished" },
          { position: "16", points: "0",  grid: "13", Driver: { givenName: "Arvid",     familyName: "Lindblad",   code: "LIN" }, Constructor: { name: "Racing Bulls" },          Time: { time: "+1:31.890" },   status: "Finished" },
          { position: "17", points: "0",  grid: "18", Driver: { givenName: "Nico",      familyName: "Hülkenberg", code: "HUL" }, Constructor: { name: "Audi" },                  Time: { time: "+1 lap" },      status: "+1 Lap" },
          { position: "18", points: "0",  grid: "19", Driver: { givenName: "Gabriel",   familyName: "Bortoleto",  code: "BOR" }, Constructor: { name: "Audi" },                  Time: { time: "+1 lap" },      status: "+1 Lap" },
          { position: "19", points: "0",  grid: "17", Driver: { givenName: "Franco",    familyName: "Colapinto",  code: "COL" }, Constructor: { name: "Alpine" },                status: "Accident" },
          { position: "20", points: "0",  grid: "20", Driver: { givenName: "Isack",     familyName: "Hadjar",     code: "HAD" }, Constructor: { name: "Red Bull Racing" },       status: "Mechanical" },
          { position: "21", points: "0",  grid: "21", Driver: { givenName: "Sergio",    familyName: "Perez",      code: "PER" }, Constructor: { name: "Cadillac" },              status: "Engine" },
          { position: "22", points: "0",  grid: "22", Driver: { givenName: "Valtteri",  familyName: "Bottas",     code: "BOT" }, Constructor: { name: "Cadillac" },              status: "Collision" }
        ]
      }]
    }
  }
};

const OPENF1_LATEST_SESSION = [
  {
    session_key: 9999,
    meeting_key: 1234,
    year: 2026,
    session_name: "Race",
    session_type: "Race",
    circuit_short_name: "Montreal",
    country_name: "Canada",
    date_start: "2026-06-21T18:00:00"
  }
];

/**
 * Intercept all api.jolpi.ca and api.openf1.org requests and return mock data.
 * Call this before navigating to a page that opens the data hub.
 * @param {import("@playwright/test").Page} page
 */
export async function setupApiMocks(page) {
  await page.route("**api.jolpi.ca**/2026.json**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(SCHEDULE) }));

  await page.route("**api.jolpi.ca**/driverstandings**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(DRIVER_STANDINGS) }));

  await page.route("**api.jolpi.ca**/constructorstandings**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(CONSTRUCTOR_STANDINGS) }));

  await page.route("**api.jolpi.ca**/current/last/results**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(LAST_RACE) }));

  // OpenF1: return a session so LIVE/TELEMETRY tabs don't show "No live data"
  await page.route("**api.openf1.org**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(OPENF1_LATEST_SESSION) }));
}
