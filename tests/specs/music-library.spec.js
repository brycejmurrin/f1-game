// @ts-check
/*
 * MUSIC LIBRARY + SPOTIFY BACKEND regression coverage.
 *
 *   js/game/music-lib.js  — uploaded audio files kept in IndexedDB and appended
 *                           to the GameAudio playlist as "user:<db id>" entries.
 *   js/game/spotify.js    — optional personal-use Spotify backend that must stay
 *                           COMPLETELY DORMANT until a Client ID is stored.
 *   js/game/audio.js      — PLAYLIST entries are {id,name,url,builtin} objects,
 *                           plus tracks/addTracks/removeTrack/playTrackId/
 *                           currentTrackId/setMusicBackend/musicBackend.
 *
 * The uploads are real, decodable WAVs (44-byte RIFF header + PCM silence), so
 * the fetch()+decodeAudioData path in audio.js genuinely accepts them — a faked
 * MP3 would be rejected at decode and prove nothing.
 *
 * ISOLATION: each Playwright `page` gets a fresh browser context, so IndexedDB
 * and localStorage start empty. The upload tests do not rely on that silently —
 * they call MusicLib.clear() and assert an empty library before touching it (a
 * leaked record from a previous test would fail the assertion, not the test's
 * real subject).
 */
import { test, expect } from "../helpers/fixtures.js";

/* ---------------- fixtures on disk (built in-memory) ---------------- */

/**
 * A valid mono 16-bit PCM WAV of `seconds` of silence.
 * 5 s at 8 kHz is long enough that a running AudioContext cannot reach the
 * source's `onended` (which would advance the playlist) mid-assertion.
 * @param {number} seconds
 * @param {number} sampleRate
 */
function silentWav(seconds = 5, sampleRate = 8000) {
  const frames = Math.floor(seconds * sampleRate);
  const dataLen = frames * 2;
  const buf = Buffer.alloc(44 + dataLen);           // samples stay zeroed = silence
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);                        // PCM fmt chunk size
  buf.writeUInt16LE(1, 20);                         // format = PCM
  buf.writeUInt16LE(1, 22);                         // channels = mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);            // byte rate
  buf.writeUInt16LE(2, 32);                         // block align
  buf.writeUInt16LE(16, 34);                        // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  return buf;
}

/* ---------------- page helpers ---------------- */

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 10000 });
  await page.waitForFunction(
    () => typeof MusicLib !== "undefined" && typeof GameAudio !== "undefined",
    null, { polling: 100, timeout: 10000 }
  );
}

/** Open the MUSIC & SOUND panel. #pm-audio lives in the hidden pause menu, so
 *  the click is dispatched directly (the same pattern audio-smoke.spec.js uses).
 *  YOUR TRACKS and SPOTIFY — the two sections this file exercises — collapse
 *  by default (2026-08 menu review), so force them open: this file's
 *  Playwright locators need the controls actually rendered, not just present
 *  in the DOM. */
async function openAudioPanel(page) {
  await page.locator("#pm-audio").evaluate((el) => el.click());
  await expect(page.locator("#audioset")).toBeVisible();
  await page.evaluate(() => {
    document.getElementById("as-tracks-details").open = true;
    document.getElementById("as-sp-wrap").open = true;
  });
}

/** Empty the library through MusicLib's own open DB handle (deleteDatabase would
 *  block on it) and prove we are starting from nothing. */
async function resetLibrary(page) {
  await page.evaluate(() => MusicLib.clear());
  expect(await page.evaluate(() => MusicLib.list())).toEqual([]);
  expect(await page.evaluate(() => GameAudio.tracks().filter((t) => !t.builtin))).toEqual([]);
}

async function pick(page, name, seconds = 5, mimeType = "audio/wav") {
  await page.setInputFiles("#as-file", { name, mimeType, buffer: silentWav(seconds) });
}

const userTracks = (page) =>
  page.evaluate(() => GameAudio.tracks().filter((t) => !t.builtin));

/* ================================================================== *
 * Uploads
 * ================================================================== */

test("a picked audio file joins the playlist as user:<n> and renders a row", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);
  await resetLibrary(page);

  await pick(page, "My Song.wav");

  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);
  await expect(page.locator("#as-tracks .music-row .music-name")).toHaveText("My Song");
  await expect(page.locator("#as-lib-msg")).toContainText("1 track added");

  const added = await userTracks(page);
  expect(added).toHaveLength(1);
  expect(added[0].id).toMatch(/^user:\d+$/);
  expect(added[0].builtin).toBe(false);
  expect(added[0].name).toBe("My Song");

  // The shipped soundtrack is untouched and still leads the list.
  const all = await page.evaluate(() => GameAudio.tracks());
  expect(all.slice(0, 5).map((t) => t.id)).toEqual([
    "builtin:menu", "builtin:song2", "builtin:song3", "builtin:song4", "builtin:song5",
  ]);
  expect(all[5].id).toBe(added[0].id);

  // The row is a real playlist target, not just decoration.
  await page.evaluate(() => GameAudio.init());
  const played = await page.evaluate((id) => GameAudio.playTrackId(id), added[0].id);
  expect(played).toBe(true);
  expect(await page.evaluate(() => GameAudio.currentTrackId())).toBe(added[0].id);

  expect(pageErrors).toEqual([]);
});

test("an uploaded track survives a page reload (IndexedDB, not memory)", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);
  await resetLibrary(page);

  await pick(page, "Persisted Track.wav");
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);
  const before = (await userTracks(page))[0];

  await page.reload();
  await boot(page);

  // Rehydrated straight from IndexedDB on boot — no panel interaction needed.
  await expect
    .poll(() => userTracks(page), { timeout: 10000 })
    .toEqual([{ id: before.id, name: "Persisted Track", builtin: false }]);

  await openAudioPanel(page);
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);
  await expect(page.locator("#as-tracks .music-row .music-name")).toHaveText("Persisted Track");
  expect(await page.evaluate(() => MusicLib.count())).toBe(1);

  expect(pageErrors).toEqual([]);
});

test("a non-audio file is refused with a message and never reaches the playlist", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);
  await resetLibrary(page);

  await page.setInputFiles("#as-file", {
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("this is not a song"),
  });

  await expect(page.locator("#as-lib-msg")).toContainText("not an audio file");
  await expect(page.locator("#as-lib-msg")).toContainText("notes.txt");
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(0);
  expect(await userTracks(page)).toEqual([]);
  expect(await page.evaluate(() => MusicLib.list())).toEqual([]);

  expect(pageErrors).toEqual([]);
});

test("picking the same file twice stores it once", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);
  await resetLibrary(page);

  await pick(page, "Twice.wav");
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);

  // Sequential on purpose: the dedupe check reads the in-memory cache, so the
  // first add must have landed before the second is offered.
  await pick(page, "Twice.wav");
  await expect(page.locator("#as-lib-msg")).toContainText("already in your library");
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);
  expect(await userTracks(page)).toHaveLength(1);
  expect(await page.evaluate(() => MusicLib.list())).toHaveLength(1);

  expect(pageErrors).toEqual([]);
});

test("the row's remove button drops the track everywhere, permanently", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);
  await resetLibrary(page);

  await pick(page, "Doomed.wav");
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);

  await page.locator("#as-tracks .music-row .music-del").click();

  await expect(page.locator("#as-tracks .music-row")).toHaveCount(0);
  await expect.poll(() => userTracks(page)).toEqual([]);
  expect(await page.evaluate(() => MusicLib.list())).toEqual([]);

  await page.reload();
  await boot(page);
  await openAudioPanel(page);
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(0);
  expect(await userTracks(page)).toEqual([]);
  expect(await page.evaluate(() => MusicLib.count())).toBe(0);

  expect(pageErrors).toEqual([]);
});

test("removeTrack keeps currentTrackId on the same song when an EARLIER entry goes", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);
  await resetLibrary(page);

  // Distinct name AND byte count so the dedupe guard treats them as two files.
  await pick(page, "First.wav", 5);
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(1);
  await pick(page, "Second.wav", 6);
  await expect(page.locator("#as-tracks .music-row")).toHaveCount(2);

  const ids = (await userTracks(page)).map((t) => t.id);
  expect(ids).toHaveLength(2);

  await page.evaluate(() => GameAudio.init());
  expect(await page.evaluate((id) => GameAudio.playTrackId(id), ids[1])).toBe(true);
  expect(await page.evaluate(() => GameAudio.currentTrackId())).toBe(ids[1]);

  // Removing the entry BEFORE the playing one shifts the list down; the index
  // has to follow it or an unrelated song restarts.
  expect(await page.evaluate((id) => GameAudio.removeTrack(id), ids[0])).toBe(true);
  expect(await page.evaluate(() => GameAudio.currentTrackId())).toBe(ids[1]);
  expect(await page.evaluate(() => GameAudio.trackName())).toBe("Second");
  expect((await userTracks(page)).map((t) => t.id)).toEqual([ids[1]]);

  expect(pageErrors).toEqual([]);
});

/* ================================================================== *
 * Backend delegation
 * ================================================================== */

/** Installs a recording stub backend and returns nothing; the page keeps the
 *  log on window.__mb. Calls made by setMusicBackend() itself are cleared. */
async function installStubBackend(page) {
  await page.evaluate(() => {
    window.__mb = { calls: [], volume: null };
    window.__stub = {
      start() { window.__mb.calls.push("start"); },
      stop() { window.__mb.calls.push("stop"); },
      skip() { window.__mb.calls.push("skip"); return "Stub Track — Stub Artist"; },
      setVolume(v) { window.__mb.calls.push("setVolume"); window.__mb.volume = v; return v; },
      name() { return "Stub Track — Stub Artist"; },
      active() { return true; },
    };
    GameAudio.setMusicBackend(window.__stub);
    window.__mb.calls.length = 0;      // install-time setVolume/start are not the subject
  });
}

test("an installed music backend receives every music call", async ({ page, pageErrors }) => {
  await boot(page);
  await page.evaluate(() => GameAudio.init());
  await installStubBackend(page);

  expect(await page.evaluate(() => GameAudio.musicBackend() === window.__stub)).toBe(true);

  const result = await page.evaluate(() => {
    GameAudio.startMusic();
    GameAudio.stopMusic();
    const skipped = GameAudio.skipTrack();
    const vol = GameAudio.setMusicVolume(0.3);
    return {
      calls: window.__mb.calls.slice(),
      volume: window.__mb.volume,
      skipped,
      vol,
      name: GameAudio.trackName(),
    };
  });

  expect(result.calls).toEqual(["start", "stop", "skip", "setVolume"]);
  expect(result.volume).toBeCloseTo(0.3, 6);
  expect(result.vol).toBeCloseTo(0.3, 6);
  expect(result.skipped).toBe("Stub Track — Stub Artist");
  expect(result.name).toBe("Stub Track — Stub Artist");

  expect(pageErrors).toEqual([]);
});

test("the built-in playlist is silent under a backend and comes back when it goes", async ({ page, pageErrors }) => {
  await boot(page);
  await page.evaluate(() => GameAudio.init());

  // Built-in soundtrack running on its second entry.
  expect(await page.evaluate(() => GameAudio.playTrackId("builtin:song2"))).toBe(true);
  expect(await page.evaluate(() => GameAudio.currentTrackId())).toBe("builtin:song2");

  await installStubBackend(page);

  const underBackend = await page.evaluate(() => {
    GameAudio.startMusic();
    return {
      current: GameAudio.currentTrackId(),
      replayRefused: GameAudio.playTrackId("builtin:menu"),
      stillCurrent: GameAudio.currentTrackId(),
      calls: window.__mb.calls.slice(),
    };
  });
  expect(underBackend.current).toBeNull();          // our playlist is not playing
  expect(underBackend.replayRefused).toBe(false);   // and cannot be started
  expect(underBackend.stillCurrent).toBeNull();
  expect(underBackend.calls).toEqual(["start"]);    // the call went to the backend instead

  // Handing the soundtrack back resumes where the built-in playlist left off.
  await page.evaluate(() => GameAudio.setMusicBackend(null));
  expect(await page.evaluate(() => GameAudio.musicBackend())).toBeNull();
  expect(await page.evaluate(() => GameAudio.currentTrackId())).toBe("builtin:song2");
  expect(await page.evaluate(() => GameAudio.trackName())).toBe("song2");

  expect(pageErrors).toEqual([]);
});

/* ================================================================== *
 * Spotify dormancy — the security-relevant part
 * ================================================================== */

test("with no Client ID stored, Spotify is completely dormant on a full page load", async ({ page, pageErrors }) => {
  /** @type {string[]} */
  const spotifyRequests = [];
  page.on("request", (req) => {
    const url = req.url();
    if (/(^|\.)spotify\.com|(^|\.)scdn\.co/.test(new URL(url).hostname)) spotifyRequests.push(url);
  });

  await boot(page);
  await openAudioPanel(page);
  // Give any deferred boot work a chance to misbehave before we declare silence.
  await page.waitForTimeout(1500);

  expect(spotifyRequests).toEqual([]);

  expect(await page.evaluate(() => localStorage.getItem("apex26.spotify.clientId"))).toBeNull();
  expect(await page.evaluate(() => SpotifyMusic.available())).toBe(false);
  expect(await page.evaluate(() => SpotifyMusic.status().state)).toBe("off");
  expect(await page.evaluate(() => SpotifyMusic.configured())).toBeNull();

  // No SDK script injected, and the music channel is still the built-in one.
  expect(await page.evaluate(() =>
    document.querySelectorAll('script[src*="sdk.scdn.co"]').length)).toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll("script").length > 0)).toBe(true);
  expect(await page.evaluate(() => !!window.Spotify)).toBe(false);
  expect(await page.evaluate(() => GameAudio.musicBackend())).toBeNull();

  // The panel says so, and CONNECT is disabled (disabled, never hidden).
  expect(await page.evaluate(() =>
    document.getElementById("as-sp-wrap").dataset.spState)).toBe("off");
  await expect(page.locator("#as-sp-connect")).toBeDisabled();
  // Wording is free to change; the line must SAY the feature is off and tell the
  // owner what would turn it on, so match on that rather than a fixed sentence.
  await expect(page.locator("#as-sp-status")).toContainText(/off/i);
  await expect(page.locator("#as-sp-status")).toContainText(/client id/i);

  expect(pageErrors).toEqual([]);
});

test("redirectUri() is origin + pathname with no query or hash", async ({ page }) => {
  await boot(page);
  const got = await page.evaluate(() => ({
    uri: SpotifyMusic.redirectUri(),
    expected: location.origin + location.pathname,
    shown: document.getElementById("as-sp-uri").textContent,
  }));
  expect(got.uri).toBe(got.expected);
  expect(got.uri).not.toContain("?");
  expect(got.uri).not.toContain("#");
  expect(got.shown).toBe(got.expected);
});

test("redirectUri() strips a query and hash the game was launched with", async ({ page }) => {
  await page.goto("/?track=monza#hash");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 10000 });
  const got = await page.evaluate(() => ({
    uri: SpotifyMusic.redirectUri(),
    href: location.href,
  }));
  expect(got.href).toContain("?track=monza");
  expect(got.uri).not.toContain("?");
  expect(got.uri).not.toContain("#");
  expect(got.uri).toBe(await page.evaluate(() => location.origin + location.pathname));
});

test("storing a Client ID arms the feature; clearing it disarms it — with no network either way", async ({ page, pageErrors }) => {
  /** @type {string[]} */
  const spotifyRequests = [];
  page.on("request", (req) => {
    if (/(^|\.)spotify\.com|(^|\.)scdn\.co/.test(new URL(req.url()).hostname)) {
      spotifyRequests.push(req.url());
    }
  });

  await boot(page);
  await openAudioPanel(page);
  await expect(page.locator("#as-sp-connect")).toBeDisabled();

  // NOTE: connect() is deliberately never called — it navigates to Spotify.
  const armed = await page.evaluate(() => {
    SpotifyMusic.setClientId("abc123");
    return {
      state: SpotifyMusic.status().state,
      available: SpotifyMusic.available(),
      configured: SpotifyMusic.configured(),
      stored: localStorage.getItem("apex26.spotify.clientId"),
      panel: document.getElementById("as-sp-wrap").dataset.spState,
    };
  });
  expect(armed.state).toBe("configured");
  expect(armed.available).toBe(true);
  expect(armed.configured).toEqual({ clientId: "abc123" });
  expect(armed.stored).toBe("abc123");
  expect(armed.panel).toBe("configured");
  await expect(page.locator("#as-sp-connect")).toBeEnabled();

  // Storing an ID must not by itself talk to Spotify or load the SDK.
  await page.waitForTimeout(500);
  expect(spotifyRequests).toEqual([]);
  expect(await page.evaluate(() =>
    document.querySelectorAll('script[src*="sdk.scdn.co"]').length)).toBe(0);
  expect(await page.evaluate(() => GameAudio.musicBackend())).toBeNull();

  const disarmed = await page.evaluate(() => {
    SpotifyMusic.setClientId("");
    return {
      state: SpotifyMusic.status().state,
      available: SpotifyMusic.available(),
      stored: localStorage.getItem("apex26.spotify.clientId"),
      panel: document.getElementById("as-sp-wrap").dataset.spState,
    };
  });
  expect(disarmed.state).toBe("off");
  expect(disarmed.available).toBe(false);
  expect(disarmed.stored).toBeNull();
  expect(disarmed.panel).toBe("off");
  await expect(page.locator("#as-sp-connect")).toBeDisabled();

  expect(spotifyRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

// A token belongs to the app that minted it. Correcting a mistyped Client ID —
// or replacing the secret someone pasted by mistake — used to leave the old
// token in place, and connect() would hand it straight to the new app's player:
// "Spotify rejected the session", unrecoverable until DISCONNECT was pressed.
test("changing the Client ID drops the token minted by the previous app", async ({ page, pageErrors }) => {
  await boot(page);
  await openAudioPanel(page);

  const after = await page.evaluate(() => {
    SpotifyMusic.setClientId("app-one");
    // Stand in for a completed sign-in against app-one: a live, unexpired token.
    localStorage.setItem("apex26.spotify.token", JSON.stringify({
      access_token: "tok-from-app-one",
      refresh_token: "ref-from-app-one",
      expires_at: Date.now() + 3600000,
    }));
    const before = localStorage.getItem("apex26.spotify.token");
    SpotifyMusic.setClientId("app-two");
    return { before, after: localStorage.getItem("apex26.spotify.token") };
  });

  expect(after.before).toContain("tok-from-app-one");
  expect(after.after).toBeNull();
  expect(await page.evaluate(() => SpotifyMusic.status().state)).toBe("configured");

  // Re-saving the SAME id is not a change and must not sign the player out.
  const resaved = await page.evaluate(() => {
    localStorage.setItem("apex26.spotify.token", JSON.stringify({
      access_token: "tok-two", refresh_token: "ref-two", expires_at: Date.now() + 3600000,
    }));
    SpotifyMusic.setClientId("app-two");
    return localStorage.getItem("apex26.spotify.token");
  });
  expect(resaved).toContain("tok-two");

  expect(pageErrors).toEqual([]);
});
