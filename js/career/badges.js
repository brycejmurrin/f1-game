/* Apex 26 — LICENCE BADGES: local achievements unlocked from facts the game already computes (a classified result, a pole, a daily streak), persisted at `apex26.badges`. Rules are pure; no physics, no sim RNG. */
const Badges = (function () {
  "use strict";

  const { store } = GameStore;
  const KEY = "badges";      // store adds the apex26. prefix
  const STREAK_DAYS = 7;

  // The fixed badges, in the order the panel lists them. The per-venue wins
  // are derived from SeasonCal.REAL_2026 (the real 2026 calendar), so they
  // follow that table rather than a second copy of it.
  const DEFS = Object.freeze([
    { id: "first_win", label: "FIRST WIN", desc: "Win a race" },
    { id: "podium", label: "PODIUM", desc: "Finish a race in the top three" },
    { id: "pole", label: "POLE POSITION", desc: "Qualify on pole with a driven lap" },
    { id: "fastest_lap", label: "FASTEST LAP", desc: "Set the fastest lap of a race you finish" },
    { id: "clean_race", label: "CLEAN SHEET", desc: "Finish a race without a single track-limits strike" },
    { id: "daily_streak", label: "DAILY DEVOTION", desc: STREAK_DAYS + "-day daily challenge streak" },
    { id: "tour_2026", label: "2026 WORLD TOUR", desc: "Win at every venue of the real 2026 calendar" },
  ].map(Object.freeze));

  function venues() {
    return typeof SeasonCal !== "undefined" && SeasonCal.REAL_2026 ? SeasonCal.REAL_2026.map((r) => r.id) : [];
  }
  const venueId = (trackId) => "win_" + trackId;
  function trackName(id) {
    const t = typeof Tracks !== "undefined" && Tracks.LIST ? Tracks.LIST.find((x) => x.id === id) : null;
    return t ? t.name : String(id).toUpperCase();
  }
  function labelOf(id) {
    const d = DEFS.find((x) => x.id === id);
    if (d) return d.label;
    return id.indexOf("win_") === 0 ? trackName(id.slice(4)) + " WINNER" : id.toUpperCase();
  }

  // NORMALISE ON READ: whatever is in storage — nothing, a corrupt value, an
  // array, a map with junk timestamps — becomes { got: { id: ts } }. A copy,
  // never the store's cached object, so a caller cannot mutate the cache.
  function read() {
    let raw = null;
    try { raw = store.get(KEY, null); } catch (e) { raw = null; }
    const got = {};
    const src = raw && typeof raw === "object" && !Array.isArray(raw) && raw.got
      && typeof raw.got === "object" && !Array.isArray(raw.got) ? raw.got : {};
    for (const [id, ts] of Object.entries(src)) {
      if (typeof id === "string" && id && Number.isFinite(ts) && ts > 0) got[id] = ts;
    }
    return { v: 1, got };
  }

  let notify = null;   // (labels[]) => void — the toast; game wiring sets it
  function setNotifier(fn) { notify = typeof fn === "function" ? fn : null; }

  // Unlock every id not yet held, in ONE write, and toast the new ones once.
  // Returns the newly unlocked ids ([] when nothing was new).
  function unlock(ids, now) {
    const d = read();
    const ts = Number.isFinite(now) && now > 0 ? now : Date.now();
    const fresh = [];
    for (const id of ids || []) {
      if (typeof id !== "string" || !id || d.got[id] || fresh.indexOf(id) >= 0) continue;
      fresh.push(id);
      d.got[id] = ts;
    }
    const all = venues();
    if (all.length && !d.got.tour_2026 && all.every((v) => d.got[venueId(v)])) {
      fresh.push("tour_2026");
      d.got.tour_2026 = ts;
    }
    if (!fresh.length) return fresh;
    try { store.set(KEY, d); } catch (e) { Log.warn("game", "Badges.unlock write failed: " + e); }
    Log.info("game", "Badges.unlock " + fresh.join(","));
    if (notify) {
      try { notify(fresh.map(labelOf)); } catch (e) { Log.warn("game", "Badges notify failed: " + e); }
    }
    return fresh;
  }

  // PURE: which badges a classified race earns. `r` is the player's result:
  //   { pos, retired, finished, cuts, penalty, trackId, fastest }
  // A retired car earns nothing; a race win at a 2026 venue is that venue.
  function forRace(r) {
    const out = [];
    if (!r || r.retired || !(r.pos >= 1)) return out;
    if (r.pos === 1) out.push("first_win");
    if (r.pos <= 3) out.push("podium");
    if (r.finished && r.fastest) out.push("fastest_lap");
    if (r.finished && !(r.cuts > 0) && !(r.penalty > 0)) out.push("clean_race");
    if (r.pos === 1 && r.trackId && venues().indexOf(r.trackId) >= 0) out.push(venueId(r.trackId));
    return out;
  }
  function forStreak(count) { return count >= STREAK_DAYS ? ["daily_streak"] : []; }

  function onRace(r, now) { return unlock(forRace(r), now); }
  function onPole(now) { return unlock(["pole"], now); }
  function onStreak(count, now) { return unlock(forStreak(count), now); }

  // The panel's rows: every fixed badge, then the venue tally.
  function summary() {
    const d = read();
    const all = venues();
    const won = all.filter((v) => d.got[venueId(v)]);
    return {
      held: DEFS.filter((b) => d.got[b.id]).length,
      total: DEFS.length,
      rows: DEFS.map((b) => ({ id: b.id, label: b.label, desc: b.desc, got: !!d.got[b.id] })),
      venues: { won: won.map(trackName), count: won.length, total: all.length },
    };
  }

  // SETTINGS ▸ DRIVING ▸ LICENCE BADGES. Static DOM lives in index.html; this
  // only fills #pm-badges-summary and #pm-badges-list.
  function render(doc) {
    const d = doc || (typeof document !== "undefined" ? document : null);
    if (!d) return;
    const sum = d.getElementById("pm-badges-summary");
    const list = d.getElementById("pm-badges-list");
    if (!sum || !list) return;
    const s = summary();
    sum.textContent = `${s.held} of ${s.total} badges. 2026 venues won: ${s.venues.count} of ${s.venues.total}`
      + (s.venues.count ? ` (${s.venues.won.join(", ")}).` : ".");
    list.textContent = "";
    for (const r of s.rows) {
      const li = d.createElement("li");
      li.textContent = `${r.got ? "✓" : "–"} ${r.label} — ${r.desc}`;
      li.setAttribute("aria-label", `${r.label}: ${r.got ? "unlocked" : "locked"}. ${r.desc}`);
      list.appendChild(li);
    }
  }

  // The fold paints on open, so it always reads the stored badges fresh.
  // Scripts are `defer`red: the shell's DOM exists when this evaluates.
  const fold = typeof document !== "undefined" && document.getElementById
    ? document.getElementById("pm-badges-panel") : null;
  if (fold) fold.addEventListener("toggle", () => { if (fold.open) render(); });

  return { KEY, DEFS, STREAK_DAYS, read, unlock, forRace, forStreak, onRace, onPole, onStreak, summary, render, setNotifier, labelOf };
})();
Object.freeze(Badges);
