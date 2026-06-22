// @ts-check
// Mock F1 API responses for Playwright tests.
// api.jolpi.ca and api.openf1.org are blocked by network egress in CI.
// Call setupApiMocks(page) before opening the data hub to inject realistic data.

// ──────────────────────────────────────────────────────────────────────────────
// Jolpica (Ergast) data
// ──────────────────────────────────────────────────────────────────────────────

const SCHEDULE = {
  MRData: { RaceTable: { Races: [
    { round: "1",  raceName: "Bahrain Grand Prix",        Circuit: { circuitName: "Bahrain International Circuit", Location: { locality: "Sakhir",      country: "Bahrain" } },      date: "2026-03-01", time: "15:00:00Z" },
    { round: "2",  raceName: "Saudi Arabian Grand Prix",  Circuit: { circuitName: "Jeddah Corniche Circuit",        Location: { locality: "Jeddah",       country: "Saudi Arabia" } }, date: "2026-03-15", time: "17:00:00Z" },
    { round: "3",  raceName: "Australian Grand Prix",     Circuit: { circuitName: "Albert Park Circuit",            Location: { locality: "Melbourne",     country: "Australia" } },    date: "2026-04-05", time: "05:00:00Z" },
    { round: "4",  raceName: "Japanese Grand Prix",       Circuit: { circuitName: "Suzuka International Circuit",   Location: { locality: "Suzuka",        country: "Japan" } },        date: "2026-04-19", time: "05:00:00Z" },
    { round: "5",  raceName: "Chinese Grand Prix",        Circuit: { circuitName: "Shanghai International Circuit", Location: { locality: "Shanghai",       country: "China" } },        date: "2026-05-03", time: "07:00:00Z" },
    { round: "6",  raceName: "Miami Grand Prix",          Circuit: { circuitName: "Miami International Autodrome",  Location: { locality: "Miami",          country: "USA" } },          date: "2026-05-17", time: "19:00:00Z", Sprint: {} },
    { round: "7",  raceName: "Emilia Romagna Grand Prix", Circuit: { circuitName: "Autodromo Enzo e Dino Ferrari",  Location: { locality: "Imola",          country: "Italy" } },        date: "2026-05-31", time: "13:00:00Z" },
    { round: "8",  raceName: "Monaco Grand Prix",         Circuit: { circuitName: "Circuit de Monaco",              Location: { locality: "Monte-Carlo",    country: "Monaco" } },       date: "2026-06-07", time: "13:00:00Z" },
    { round: "9",  raceName: "Spanish Grand Prix",        Circuit: { circuitName: "Circuit de Barcelona-Catalunya", Location: { locality: "Montmeló",       country: "Spain" } },        date: "2026-06-14", time: "13:00:00Z" },
    { round: "10", raceName: "Canadian Grand Prix",       Circuit: { circuitName: "Circuit Gilles Villeneuve",      Location: { locality: "Montréal",       country: "Canada" } },       date: "2026-06-21", time: "18:00:00Z" },
    { round: "11", raceName: "Austrian Grand Prix",       Circuit: { circuitName: "Red Bull Ring",                  Location: { locality: "Spielberg",      country: "Austria" } },      date: "2026-07-05", time: "13:00:00Z", Sprint: {} },
    { round: "12", raceName: "British Grand Prix",        Circuit: { circuitName: "Silverstone Circuit",            Location: { locality: "Silverstone",    country: "UK" } },           date: "2026-07-19", time: "14:00:00Z" },
    { round: "13", raceName: "Hungarian Grand Prix",      Circuit: { circuitName: "Hungaroring",                    Location: { locality: "Budapest",       country: "Hungary" } },      date: "2026-08-02", time: "13:00:00Z" },
    { round: "14", raceName: "Belgian Grand Prix",        Circuit: { circuitName: "Circuit de Spa-Francorchamps",   Location: { locality: "Stavelot",       country: "Belgium" } },      date: "2026-08-16", time: "13:00:00Z" },
    { round: "15", raceName: "Dutch Grand Prix",          Circuit: { circuitName: "Circuit Zandvoort",              Location: { locality: "Zandvoort",      country: "Netherlands" } },  date: "2026-08-30", time: "13:00:00Z" },
    { round: "16", raceName: "Italian Grand Prix",        Circuit: { circuitName: "Autodromo Nazionale Monza",      Location: { locality: "Monza",          country: "Italy" } },        date: "2026-09-13", time: "13:00:00Z" },
    { round: "17", raceName: "Azerbaijan Grand Prix",     Circuit: { circuitName: "Baku City Circuit",              Location: { locality: "Baku",           country: "Azerbaijan" } },   date: "2026-09-27", time: "11:00:00Z" },
    { round: "18", raceName: "Singapore Grand Prix",      Circuit: { circuitName: "Marina Bay Street Circuit",      Location: { locality: "Singapore",      country: "Singapore" } },    date: "2026-10-11", time: "12:00:00Z" },
    { round: "19", raceName: "United States Grand Prix",  Circuit: { circuitName: "Circuit of the Americas",        Location: { locality: "Austin",         country: "USA" } },          date: "2026-10-25", time: "19:00:00Z", Sprint: {} },
    { round: "20", raceName: "Mexico City Grand Prix",    Circuit: { circuitName: "Autodromo Hermanos Rodriguez",   Location: { locality: "Mexico City",    country: "Mexico" } },       date: "2026-11-01", time: "20:00:00Z" },
    { round: "21", raceName: "São Paulo Grand Prix",      Circuit: { circuitName: "Autodromo Jose Carlos Pace",     Location: { locality: "São Paulo",      country: "Brazil" } },       date: "2026-11-15", time: "16:00:00Z", Sprint: {} },
    { round: "22", raceName: "Las Vegas Grand Prix",      Circuit: { circuitName: "Las Vegas Strip Circuit",        Location: { locality: "Las Vegas",      country: "USA" } },          date: "2026-11-22", time: "06:00:00Z" },
    { round: "23", raceName: "Qatar Grand Prix",          Circuit: { circuitName: "Lusail International Circuit",   Location: { locality: "Lusail",         country: "Qatar" } },        date: "2026-11-29", time: "14:00:00Z", SprintQualifying: {} },
    { round: "24", raceName: "Abu Dhabi Grand Prix",      Circuit: { circuitName: "Yas Marina Circuit",             Location: { locality: "Abu Dhabi",      country: "UAE" } },          date: "2026-12-06", time: "13:00:00Z" }
  ]}}
};

const DRIVER_STANDINGS = { MRData: { StandingsTable: { StandingsLists: [{ season: "2026", round: "10", DriverStandings: [
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
]}]}}};

const CONSTRUCTOR_STANDINGS = { MRData: { StandingsTable: { StandingsLists: [{ season: "2026", round: "10", ConstructorStandings: [
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
]}]}}};

const LAST_RACE = { MRData: { RaceTable: { Races: [{ raceName: "Canadian Grand Prix", round: "10", date: "2026-06-21",
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
}]}}};

// ──────────────────────────────────────────────────────────────────────────────
// OpenF1 data  (session_key=9999 = Canadian GP Race)
// ──────────────────────────────────────────────────────────────────────────────

const OPENF1_SESSIONS_LATEST = [
  { session_key: 9999, meeting_key: 1234, year: 2026, session_name: "Race", session_type: "Race",
    circuit_short_name: "Montreal", country_name: "Canada", date_start: "2026-06-21T18:00:00Z" }
];

const OPENF1_MEETINGS_2026 = [
  { meeting_key: 1220, meeting_name: "Bahrain Grand Prix",    country_name: "Bahrain",      circuit_short_name: "Bahrain",    date_start: "2026-02-27T10:00:00Z" },
  { meeting_key: 1221, meeting_name: "Saudi Arabian GP",      country_name: "Saudi Arabia", circuit_short_name: "Jeddah",     date_start: "2026-03-12T10:00:00Z" },
  { meeting_key: 1222, meeting_name: "Australian Grand Prix", country_name: "Australia",    circuit_short_name: "Melbourne",  date_start: "2026-04-03T10:00:00Z" },
  { meeting_key: 1223, meeting_name: "Japanese Grand Prix",   country_name: "Japan",        circuit_short_name: "Suzuka",     date_start: "2026-04-17T10:00:00Z" },
  { meeting_key: 1234, meeting_name: "Canadian Grand Prix",   country_name: "Canada",       circuit_short_name: "Montreal",   date_start: "2026-06-19T10:30:00Z" }
];

const OPENF1_SESSIONS_MEETING_1234 = [
  { session_key: 9994, meeting_key: 1234, year: 2026, session_name: "Practice 1",  session_type: "Practice",    circuit_short_name: "Montreal", country_name: "Canada", date_start: "2026-06-19T13:30:00Z" },
  { session_key: 9995, meeting_key: 1234, year: 2026, session_name: "Practice 2",  session_type: "Practice",    circuit_short_name: "Montreal", country_name: "Canada", date_start: "2026-06-19T17:00:00Z" },
  { session_key: 9996, meeting_key: 1234, year: 2026, session_name: "Practice 3",  session_type: "Practice",    circuit_short_name: "Montreal", country_name: "Canada", date_start: "2026-06-20T12:30:00Z" },
  { session_key: 9997, meeting_key: 1234, year: 2026, session_name: "Qualifying",  session_type: "Qualifying",  circuit_short_name: "Montreal", country_name: "Canada", date_start: "2026-06-20T16:00:00Z" },
  { session_key: 9999, meeting_key: 1234, year: 2026, session_name: "Race",        session_type: "Race",        circuit_short_name: "Montreal", country_name: "Canada", date_start: "2026-06-21T18:00:00Z" }
];

const OPENF1_DRIVERS = [
  { driver_number: 1,  name_acronym: "NOR", full_name: "Lando Norris",       team_name: "McLaren",               team_colour: "FF8000" },
  { driver_number: 63, name_acronym: "RUS", full_name: "George Russell",      team_name: "Mercedes",              team_colour: "27F4D2" },
  { driver_number: 16, name_acronym: "LEC", full_name: "Charles Leclerc",     team_name: "Ferrari",               team_colour: "E8002D" },
  { driver_number: 44, name_acronym: "HAM", full_name: "Lewis Hamilton",       team_name: "Ferrari",               team_colour: "E8002D" },
  { driver_number: 81, name_acronym: "PIA", full_name: "Oscar Piastri",        team_name: "McLaren",               team_colour: "FF8000" },
  { driver_number: 12, name_acronym: "ANT", full_name: "Kimi Antonelli",       team_name: "Mercedes",              team_colour: "27F4D2" },
  { driver_number: 33, name_acronym: "VER", full_name: "Max Verstappen",       team_name: "Red Bull Racing",       team_colour: "3671C6" },
  { driver_number: 10, name_acronym: "GAS", full_name: "Pierre Gasly",         team_name: "Alpine",                team_colour: "0093CC" },
  { driver_number: 55, name_acronym: "SAI", full_name: "Carlos Sainz",         team_name: "Williams",              team_colour: "64C4FF" },
  { driver_number: 23, name_acronym: "ALB", full_name: "Alexander Albon",      team_name: "Williams",              team_colour: "64C4FF" },
  { driver_number: 6,  name_acronym: "HAD", full_name: "Isack Hadjar",         team_name: "Red Bull Racing",       team_colour: "3671C6" },
  { driver_number: 31, name_acronym: "OCO", full_name: "Esteban Ocon",         team_name: "Haas",                  team_colour: "B6BABD" },
  { driver_number: 87, name_acronym: "BEA", full_name: "Oliver Bearman",       team_name: "Haas",                  team_colour: "B6BABD" },
  { driver_number: 40, name_acronym: "LAW", full_name: "Liam Lawson",          team_name: "Racing Bulls",          team_colour: "6692FF" },
  { driver_number: 41, name_acronym: "LIN", full_name: "Arvid Lindblad",       team_name: "Racing Bulls",          team_colour: "6692FF" },
  { driver_number: 14, name_acronym: "ALO", full_name: "Fernando Alonso",      team_name: "Aston Martin",          team_colour: "358C75" },
  { driver_number: 18, name_acronym: "STR", full_name: "Lance Stroll",         team_name: "Aston Martin",          team_colour: "358C75" },
  { driver_number: 27, name_acronym: "HUL", full_name: "Nico Hulkenberg",      team_name: "Audi",                  team_colour: "C0C0C0" },
  { driver_number: 5,  name_acronym: "BOR", full_name: "Gabriel Bortoleto",    team_name: "Audi",                  team_colour: "C0C0C0" },
  { driver_number: 11, name_acronym: "PER", full_name: "Sergio Perez",         team_name: "Cadillac",              team_colour: "4A90D9" },
  { driver_number: 43, name_acronym: "COL", full_name: "Franco Colapinto",     team_name: "Alpine",                team_colour: "0093CC" },
  { driver_number: 77, name_acronym: "BOT", full_name: "Valtteri Bottas",      team_name: "Cadillac",              team_colour: "4A90D9" }
];

const OPENF1_WEATHER = [
  { air_temperature: 24.3, track_temperature: 42.1, humidity: 52.0, rainfall: 0.0,
    wind_speed: 2.3, wind_direction: 180, date: "2026-06-21T18:05:00Z" }
];

const OPENF1_POSITIONS = (function () {
  const t = "2026-06-21T20:10:00Z";
  return [
    {driver_number:  1, position:  1, date: t}, {driver_number: 63, position:  2, date: t},
    {driver_number: 16, position:  3, date: t}, {driver_number: 81, position:  4, date: t},
    {driver_number: 44, position:  5, date: t}, {driver_number: 12, position:  6, date: t},
    {driver_number: 33, position:  7, date: t}, {driver_number: 10, position:  8, date: t},
    {driver_number: 55, position:  9, date: t}, {driver_number: 23, position: 10, date: t},
    {driver_number: 31, position: 11, date: t}, {driver_number: 87, position: 12, date: t},
    {driver_number: 40, position: 13, date: t}, {driver_number: 14, position: 14, date: t},
    {driver_number: 18, position: 15, date: t}, {driver_number: 41, position: 16, date: t},
    {driver_number: 27, position: 17, date: t}, {driver_number:  5, position: 18, date: t},
    {driver_number: 43, position: 19, date: t}, {driver_number:  6, position: 20, date: t},
    {driver_number: 11, position: 21, date: t}, {driver_number: 77, position: 22, date: t}
  ];
})();

// NOR's fastest lap: L45 of 69, 75.123s
const OPENF1_LAPS = [
  { driver_number: 1, lap_number: 45, lap_duration: 75.123,
    duration_sector_1: 22.456, duration_sector_2: 31.234, duration_sector_3: 21.433,
    is_pit_out_lap: false, date_start: "2026-06-21T19:35:00.000Z" },
  { driver_number: 1, lap_number: 44, lap_duration: 75.918,
    duration_sector_1: 22.801, duration_sector_2: 31.650, duration_sector_3: 21.467,
    is_pit_out_lap: false, date_start: "2026-06-21T19:33:44.000Z" }
];

const OPENF1_STINTS = [
  { driver_number: 1, compound: "SOFT",   lap_start: 1,  lap_end: 22, tyre_age_at_start: 0, stint_number: 1 },
  { driver_number: 1, compound: "MEDIUM", lap_start: 23, lap_end: 49, tyre_age_at_start: 0, stint_number: 2 },
  { driver_number: 1, compound: "HARD",   lap_start: 50, lap_end: 69, tyre_age_at_start: 0, stint_number: 3 }
];

const OPENF1_PITS = [
  { driver_number: 1, lap_number: 22, pit_duration: 2.4 },
  { driver_number: 1, lap_number: 49, pit_duration: 2.8 }
];

// Synthetic car telemetry: NOR fastest lap (L45, 75.1s) — Montreal-ish profile
const OPENF1_CAR_DATA = (function () {
  const t0 = Date.parse("2026-06-21T19:35:00.000Z");
  const LAP = 75.123;
  const N = 140;
  // keyframes: [frac, speed_kmh, throttle%, brake%, gear]
  const K = [
    [0.00, 268, 100,  0, 7], [0.05, 312, 100,  0, 8],
    [0.09,  78,   0,100, 2], [0.12, 118,  72,  0, 3],
    [0.15, 202, 100,  0, 6], [0.19,  82,   0, 88, 2],
    [0.22,  60,  38,  0, 2], [0.26, 194, 100,  0, 5],
    [0.32, 287, 100,  0, 8], [0.37,  92,   0, 96, 2],
    [0.40, 112,  68,  0, 3], [0.44, 228, 100,  0, 6],
    [0.50, 118,   0, 74, 3], [0.53, 132,  76,  0, 3],
    [0.58, 248, 100,  0, 7], [0.64, 282, 100,  0, 8],
    [0.69,  64,   0,100, 1], [0.72,  54,  36,  0, 2],
    [0.76, 168, 100,  0, 5], [0.81, 212, 100,  0, 6],
    [0.86, 288, 100,  0, 8], [0.93, 312, 100,  0, 8],
    [1.00, 268, 100,  0, 7]
  ];
  function lerp(a, b, t) { return a + (b - a) * t; }
  function kfAt(f) {
    for (let i = 0; i < K.length - 1; i++) {
      if (f <= K[i + 1][0]) {
        const t = (f - K[i][0]) / ((K[i + 1][0] - K[i][0]) || 1);
        return [lerp(K[i][1], K[i+1][1], t), lerp(K[i][2], K[i+1][2], t),
                lerp(K[i][3], K[i+1][3], t), Math.round(lerp(K[i][4], K[i+1][4], t))];
      }
    }
    return K[K.length - 1].slice(1);
  }
  const data = [];
  for (let i = 0; i < N; i++) {
    const f = i / (N - 1);
    const [spd, thr, brk, gear] = kfAt(f);
    const rpm = Math.round(3500 + (spd / 312) * 9200);
    const drs = (f < 0.08 || f > 0.83) ? 10 : 0;
    data.push({
      date: new Date(t0 + f * LAP * 1000).toISOString(),
      speed: Math.round(spd),
      throttle: Math.max(0, Math.min(100, Math.round(thr))),
      brake: Math.max(0, Math.min(100, Math.round(brk))),
      n_gear: gear, rpm, drs
    });
  }
  return data;
})();

// Synthetic GPS: irregular oval approximating Circuit Gilles Villeneuve
const OPENF1_LOCATION = (function () {
  const t0 = Date.parse("2026-06-21T19:35:00.000Z");
  const LAP = 75.123;
  const N = 140;
  const data = [];
  for (let i = 0; i < N; i++) {
    const f = i / N;
    const a = f * Math.PI * 2;
    const r = 3600 + Math.sin(a + 0.6) * 2100 + Math.cos(a * 2 + 0.9) * 720 + Math.sin(a * 3 - 0.4) * 260;
    data.push({
      date: new Date(t0 + f * LAP * 1000).toISOString(),
      x: Math.round(r * Math.cos(a) * 0.52),
      y: Math.round(r * Math.sin(a))
    });
  }
  return data;
})();

// ──────────────────────────────────────────────────────────────────────────────
// Route installer
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Intercept all F1 API requests and return mock data.
 * Must be called before page.goto() to ensure routes are registered first.
 * @param {import("@playwright/test").Page} page
 */
export async function setupApiMocks(page) {
  // ── Jolpica (Ergast) ──────────────────────────────────────────────────────
  await page.route("**api.jolpi.ca**/2026.json**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(SCHEDULE) }));

  await page.route("**api.jolpi.ca**/driverstandings**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(DRIVER_STANDINGS) }));

  await page.route("**api.jolpi.ca**/constructorstandings**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(CONSTRUCTOR_STANDINGS) }));

  await page.route("**api.jolpi.ca**/current/last/results**", route =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(LAST_RACE) }));

  // ── OpenF1: single handler dispatches by URL path ─────────────────────────
  await page.route("**api.openf1.org**", (route, request) => {
    const url = request.url();
    const json = (obj) => route.fulfill({ contentType: "application/json", body: JSON.stringify(obj) });

    if (url.includes("/sessions") && url.includes("session_key=latest"))  return json(OPENF1_SESSIONS_LATEST);
    if (url.includes("/sessions") && url.includes("meeting_key="))        return json(OPENF1_SESSIONS_MEETING_1234);
    if (url.includes("/meetings"))                                          return json(OPENF1_MEETINGS_2026);
    if (url.includes("/drivers"))                                           return json(OPENF1_DRIVERS);
    if (url.includes("/weather"))                                           return json(OPENF1_WEATHER);
    if (url.includes("/position"))                                          return json(OPENF1_POSITIONS);
    if (url.includes("/laps"))                                              return json(OPENF1_LAPS);
    if (url.includes("/car_data"))                                          return json(OPENF1_CAR_DATA);
    if (url.includes("/location"))                                          return json(OPENF1_LOCATION);
    if (url.includes("/stints"))                                            return json(OPENF1_STINTS);
    if (url.includes("/pit"))                                               return json(OPENF1_PITS);
    return json([]);
  });
}
