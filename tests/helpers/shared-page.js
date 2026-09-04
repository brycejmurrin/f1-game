// @ts-check
/**
 * shared-page.js — putting the `sharedTest` page back into a KNOWN state.
 *
 * `sharedTest` (tests/helpers/fixtures.js) boots ONE page per worker and its
 * between-test reset is deliberately shallow: input, headless, freeze, camera,
 * open dialogs. docs/TESTING.md §sharedTest said UI-flow specs therefore could
 * not share — "a spec whose helper clicks its way from the main menu starts each
 * test wherever the previous one left the app". These helpers are the missing
 * half: they walk the app back to the title screen and re-establish the two
 * things a fresh boot used to give for free — empty storage keys, and the
 * free-play selection the game reads out of that storage ONCE at boot.
 *
 * Every step is a DOM `.click()` inside one `evaluate`, never a Playwright
 * click: the buttons involved are hidden on the screens they lead away from,
 * and a Playwright click on a rendering page costs 80-113 s against 0.3-0.6 s
 * when it does not (docs/TESTING.md §A Playwright click costs). Nothing here is
 * a screenshot or an assertion target — it is plumbing back to the menu.
 *
 * THE THREE `let`s A STORE WRITE CANNOT REACH. js/game.js reads `team`,
 * `driver` and `unlimitedBudget` out of GameStore at boot into module-level
 * `let`s. Writing the key afterwards changes what the NEXT boot sees and
 * nothing else — which is why the old specs seeded localStorage and reloaded
 * (docs/TESTING.md §"the ERS test's per-pass reload … is not [redundant]").
 * Each has exactly one in-page path that re-reads it, and the helpers use it:
 *   team/driver     #mb-race → restoreFreePlaySelection() (pinFreePlay), or the
 *                   garage's own TEAM picker (garageTeam)
 *   unlimitedBudget #cs-unlimited's toggle (freeBuildOff)
 * GameStore's `_cache` is the other half: a bare localStorage.removeItem leaves
 * the game answering from memory, so forgetStored() also drops the cached copy
 * through store.onForeignWrite — the API that exists for exactly "forget what I
 * remembered about that key".
 */
import { BOOT_MS } from "./fixtures.js";

/** Navigate only if the app is not already live on the shared page. */
export async function ensureLive(page) {
  const live = await page.evaluate(() => window.__apex != null).catch(() => false);
  if (live) return;
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

// One peel of the menu onion, in the page. Returns what it did, or null once the
// title screen is the only thing showing. Each screen leaves through its OWN
// back control so its teardown runs (cs-back → leaveGarage drops the turntable
// and recomputes the parts maths; cz-cancel clears the MY TEAM draft preview;
// lobby.cancel() tears the RTC/loopback session down). Only a screen with no
// back control of its own — a quali sheet whose session already ran, or a
// stray hub/standings panel — is hidden directly.
function peelOnce() {
  const $ = (id) => document.getElementById(id);
  const vis = (id) => { const el = $(id); return !!el && !el.hidden; };
  const a = window.__apex;
  // A race, a countdown or a results screen: #pm-quit's handler IS quitToMenu(),
  // which also stops an active NetPlay session and hides the HUD layers.
  if (a && a.info && a.info().state !== "menu") { $("pm-quit").click(); return "pm-quit"; }
  if (vis("customize")) { $("cz-cancel").click(); return "cz-cancel"; }
  if (vis("teampicker")) { $("tp-close").click(); return "tp-close"; }
  if (vis("carsetup")) { $("cs-back").click(); return "cs-back"; }
  if (vis("race-settings")) { $("rs-cancel").click(); return "rs-cancel"; }
  if (vis("quali")) {
    // q-back refuses once the session has run (.q-done): the only door is TO THE
    // GRID, which starts a race. Nothing to tear down at that point but the sheet.
    if ($("quali").classList.contains("q-done")) { $("quali").hidden = true; return "quali:hide"; }
    $("q-back").click(); return "q-back";
  }
  if (vis("vsfriend")) {
    // cancel() works from every lobby step; #vs-close from inside a room only
    // steps back to the room.
    if (a && a.lobby) a.lobby({ cancel: true }); else $("vsfriend").hidden = true;
    return "vs-cancel";
  }
  if (vis("select")) { $("sel-back").click(); return "sel-back"; }
  const stray = [...document.querySelectorAll(".screen")].filter((el) => !el.hidden);
  if (stray.length) { for (const el of stray) el.hidden = true; return "hide:" + stray.map((el) => el.id).join(","); }
  // sel-back after a VS FRIEND room re-shows #vsfriend, not the title (netRoom is
  // cleared only by a race start) — cancelling that leaves nothing showing, so
  // put the title back ourselves.
  if (!vis("overlay")) { $("overlay").hidden = false; return "overlay"; }
  return null;
}

/**
 * Walk the shared page back to the TITLE SCREEN (#overlay visible, every other
 * screen hidden, no race running) from wherever the previous test left it.
 * Idempotent and cheap on a page already at the menu (one evaluate).
 */
export async function toMenu(page) {
  await ensureLive(page);
  const trail = [];
  for (let i = 0; i < 12; i++) {
    const did = await page.evaluate(peelOnce);
    if (!did) return trail;
    trail.push(did);
    // A beat for the deferred halves — vt() callbacks, ensureNet().then(open) —
    // before the next look at the DOM.
    await page.waitForTimeout(50);
  }
  throw new Error("toMenu: still not at the title screen after " + trail.join(" > "));
}

/**
 * Remove `apex26.<key>` from localStorage AND from GameStore's cache, so the
 * game's next read gets the default rather than the remembered value. A key
 * ending in `*` is a prefix ("parts.*" forgets every team's fitted parts).
 */
export async function forgetStored(page, keys) {
  await page.evaluate((ks) => {
    const S = GameStore.store;
    const drop = (full) => { localStorage.removeItem(full); S.onForeignWrite({ key: full }); };
    for (const k of ks) {
      const full = k.startsWith("apex26.") ? k : "apex26." + k;
      if (!full.endsWith("*")) { drop(full); continue; }
      const prefix = full.slice(0, -1);
      for (const name of Object.keys(localStorage)) if (name.startsWith(prefix)) drop(name);
    }
  }, keys);
}

/**
 * Make the LIVE game's free-play selection what a fresh boot on empty storage
 * gives — McLaren (Teams.LIST[2]), seat 0, no fitted parts — or the team/parts
 * a test names. `team` is an id or a Teams.LIST index; `parts` null forgets the
 * team's fitted parts, an object becomes them (written through the store, so
 * the cache agrees). Pass `race: [id, tod, wx]` to start the race in the SAME
 * evaluate: #mb-race schedules the menu flyby build 120 ms out and a race
 * started before that fires skips it, exactly as pressing START does.
 *
 * Call it at the menu (after toMenu). The two DOM clicks are the point, not a
 * side effect: #mb-race is the one handler that copies the store back into the
 * game's `teamIdx`/`driverIdx`, and #sel-back puts the title straight back.
 * `click: false` writes the store only — for a caller whose NEXT click is a
 * title button that re-reads it itself (#mb-race, #mb-tt, #mb-vs all call
 * restoreFreePlaySelection), which is cheaper and leaves the flyby unscheduled.
 */
export async function pinFreePlay(page, { team = "mclaren", driver = 0, parts = null, race = null, click = true } = {}) {
  return page.evaluate(([teamRef, d, p, r, c]) => {
    const S = GameStore.store;
    const idx = typeof teamRef === "number" ? teamRef : Teams.LIST.findIndex((t) => t.id === teamRef);
    if (idx < 0) throw new Error("pinFreePlay: unknown team " + teamRef);
    const id = Teams.LIST[idx].id;
    S.set("team", idx); S.set("driver", d);
    const key = "apex26.parts." + id;
    if (p) S.set("parts." + id, p);
    else { localStorage.removeItem(key); S.onForeignWrite({ key }); }
    if (c) {
      document.getElementById("mb-race").click();
      document.getElementById("sel-back").click();
    }
    const out = { team: id, idx, driver: d };
    if (r) out.race = window.__apex.race(r[0], r[1], r[2]);
    return out;
  }, [team, driver, parts, race, click]);
}

/**
 * In an OPEN garage: switch the car to `teamId` through the TEAM tab's own
 * picker when the header shows another team. This is the garage's real path
 * (menus.js: G.teamIdx = i; store.set("team", i); buildSetup()), so it is the
 * pin to use on the #mb-garage route, which never re-reads the store. Returns
 * whether a switch happened. Leaves the TEAM tab active, as a player would.
 */
export async function garageTeam(page, teamId) {
  const switched = await page.evaluate((id) => {
    const team = Teams.LIST.find((t) => t.id === id);
    if (!team) throw new Error("garageTeam: unknown team " + id);
    if (document.getElementById("cs-team").textContent === team.name.toUpperCase()) return false;
    document.querySelector('#cs-tabs [data-cs-cat="team"]').click();
    document.getElementById("cs-team-card").click();
    document.querySelectorAll("#sel-teams .team-tile")[Teams.LIST.indexOf(team)].click();
    return true;
  }, teamId);
  if (switched) await page.locator("#teampicker").waitFor({ state: "hidden" });
  return switched;
}

/**
 * In an OPEN garage: make sure FREE BUILD is OFF. `unlimitedBudget` is a `let`
 * read once at boot; the button's own toggle is the only in-page write, and it
 * rebuilds the sheet (so a parts key forgotten before the garage opened is
 * already what the sheet shows). Returns whether it had to click.
 */
export async function freeBuildOff(page) {
  return page.evaluate(() => {
    const b = document.getElementById("cs-unlimited");
    if (!b || !b.classList.contains("active")) return false;
    b.click();
    return true;
  });
}

/**
 * Back to the title with the VS FRIEND machinery reset: any NetPlay session
 * stopped, the lobby cancelled, the fake loopback peer (and its 25 ms pump)
 * dropped and — by default — re-armed, which is what every lobby spec's
 * per-test boot used to do right after `goto("/")`.
 */
export async function lobbyReset(page, fake = true) {
  await toMenu(page);
  await page.evaluate((f) => {
    const a = window.__apex;
    a.netStop();
    a.lobbyFake(false);
    a.lobby({ cancel: true });
    if (f) a.lobbyFake(true);
  }, fake);
}
