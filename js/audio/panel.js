"use strict";
/* MUSIC & SOUND panel — the mixer screen plus the master-sound plumbing.
   The mixer lives on its own screen: two sliders and a now-playing readout do
   not fit the settings grid, which is one control per line. Levels persist.

   Owns: the ♪ master button, MUSIC/SFX switches, both volume sliders, the
   music-source row (ALL / DEFAULT / MY TRACKS / SPOTIFY) and the transport.
   game.js keeps the race start/end soundbtn writes and the first-gesture
   audio unlock — those belong to race flow, not to this panel.

   create(G) wires the DOM immediately (netLobby.wire() pattern) and returns
   { init } — game.js calls init() at the old boot-restore position, AFTER
   the saved settings are loaded but before the first frame. setSound at
   create time would run ~2800 lines early, ahead of CamModes/DataHub. */
const AudioPanel = (() => {
  function create(G) {
    Log.info("audio", "AudioPanel.create");
    const { $, els, store } = G;

    function setSound(b, fromGesture) {
      G.soundOn = b; store.set("sound", b);
      GameAudio.setEnabled(b);
      // AudioContext creation/resume must stay in the trusted click that turns
      // sound back on (not in a promise or the boot restore below), otherwise
      // iOS/Safari may leave it suspended. Setting the master first also makes
      // createCtx() build the gain graph at the right level immediately.
      if (b && fromGesture) GameAudio.init();
      // "♪ ON" read as ambiguous — the state of what? The word makes it a
      // labelled state (this is the MASTER gate: engine and SFX too, so
      // SOUND, not MUSIC). index.html's static markup is the other writer
      // and must carry the same strings.
      els.soundbtn.textContent = b ? "♪ SOUND ON" : "♪ SOUND OFF";
      els.soundbtn.setAttribute("aria-pressed", b ? "true" : "false");
      if (!b) { GameAudio.stopMusic(); GameAudio.stopEngine(); GameAudio.stopRain(); }
      else {
        if (G.state === "menu") GameAudio.startMusic(-1);
        else if (G.state === "race" || G.state === "count") {   // the countdown is the race's first seconds
          GameAudio.startMusic(G.trackIdx);
          GameAudio.startEngine();
          if (G.raceWeather === "rain") GameAudio.startRain();
        }
      }
      // SOUND is the master, so the panel's music controls follow it.
      syncAudioPanel();
    }
    els.soundbtn.onclick = () => setSound(!G.soundOn, true);

    function setMusic(b, fromGesture = true) {
      // The master gates both buses and its only button lives on the title
      // screen, so asking for music mid-race has to lift it — otherwise the
      // switch reads ON and nothing plays, which is exactly the confusion the
      // duplicated pause-menu toggle used to cause.
      // During boot, MUSIC ON is only the saved state of that bus; it must not
      // override a separately saved master SOUND OFF. A real user click still
      // lifts the master and unlocks WebAudio synchronously.
      if (b && !G.soundOn && fromGesture) { setSound(true, true); }
      G.musicEnabled = b; store.set("music", b);
      GameAudio.setMusicEnabled(b);
      syncAudioPanel();
    }

    let musicVol = GameAudio.setMusicVolume(store.get("volMusic", 0.5));
    let sfxVol = GameAudio.setSfxVolume(store.get("volSfx", 1));
    let sfxOn = store.get("sfx", true);
    GameAudio.setSfxEnabled(sfxOn);

    function setSfx(b) {
      if (b && !G.soundOn) { setSound(true, true); }
      sfxOn = b; store.set("sfx", b);
      GameAudio.setSfxEnabled(b);
      syncAudioPanel();
    }

    /* MUSIC SOURCE — ALL / DEFAULT / MY TRACKS pick which part of the local
       library plays; SPOTIFY hands the music role to js/audio/spotify.js. It is
       a four-way choice rather than a Spotify on/off switch because "my
       uploads only" and "the shipped songs only" are both things people
       actually want. */
    let musicSrc = store.get("musicSource", "all");

    function spotifyReady() {
      return typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse &&
        SpotifyMusic.status().state === "connected";
    }

    function setMusicSrc(v) {
      if (v === "spotify") {
        if (!spotifyReady()) { syncAudioPanel(); return; }   // not connected: ignore, the note says why
        musicSrc = "spotify";
        store.set("musicSource", musicSrc);
        SpotifyMusic.useAsMusic(true);
        syncAudioPanel();
        return;
      }
      if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.useAsMusic) SpotifyMusic.useAsMusic(false);
      const applied = GameAudio.setMusicSource(v);
      musicSrc = applied;                        // refused (nothing in that set) -> keep the old one
      store.set("musicSource", musicSrc);
      syncAudioPanel();
    }

    function syncMusicSrcRow() {
      const counts = GameAudio.sourceCounts ? GameAudio.sourceCounts() : { builtin: 0, user: 0 };
      const spot = spotifyReady();
      const on = (typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse && SpotifyMusic.inUse())
        ? "spotify" : GameAudio.musicSource();
      [["as-src-all", "all"], ["as-src-builtin", "builtin"],
       ["as-src-user", "user"], ["as-src-spotify", "spotify"]].forEach(([id, v]) => {
        const b = $(id);
        if (!b) return;
        b.classList.toggle("active", on === v);
        b.disabled = v === "user" ? counts.user === 0 : v === "spotify" ? !spot : false;
      });
      const note = $("as-src-note");
      if (note) {
        // The SELECTED source first: with DEFAULT lit and nothing uploaded the
        // note used to describe the disabled MY TRACKS button instead.
        note.textContent = on === "spotify"
            ? "Spotify is driving the music. The controls above drive it too."
          : on === "user" ? "Playing your " + counts.user + " uploaded track" + (counts.user === 1 ? "" : "s") + " only."
          : on === "builtin" ? "Playing the " + counts.builtin + " shipped tracks only."
          : counts.user === 0
            ? "Playing the " + counts.builtin + " shipped tracks. Add your own under YOUR TRACKS to use MY TRACKS."
          : "Playing everything: " + counts.builtin + " shipped + " + counts.user + " of yours.";
      }
    }

    function syncAudioPanel() {
      const musicLive = G.musicEnabled && G.soundOn;
      const sfxLive = sfxOn && G.soundOn;
      $("as-music-on").classList.toggle("active", G.musicEnabled);
      $("as-music-off").classList.toggle("active", !G.musicEnabled);
      $("as-sound-on").classList.toggle("active", sfxOn);
      $("as-sound-off").classList.toggle("active", !sfxOn);
      $("as-mvol").disabled = !musicLive;
      $("as-svol").disabled = !sfxLive;
      $("as-mvol").closest(".tune-row").classList.toggle("tune-off", !musicLive);
      $("as-svol").closest(".tune-row").classList.toggle("tune-off", !sfxLive);
      $("as-mvol").value = String(Math.round(musicVol * 10));
      $("as-mvol-v").textContent = String(Math.round(musicVol * 10));
      $("as-svol").value = String(Math.round(sfxVol * 10));
      $("as-svol-v").textContent = String(Math.round(sfxVol * 10));
      // The master gate is what silences music when SOUND is off, and the MUSIC
      // switch still reads ON then — so the readout names the gate that is
      // actually shut instead of contradicting the switch beside it. The title
      // line ellipsises (css/tuner.css .as-now-title), so the way out goes on
      // the caption under it, which wraps.
      const nowText = musicLive ? (GameAudio.trackName() || "—") : G.soundOn ? "Music off" : "Sound off";
      $("as-now").textContent = nowText;
      $("as-now").title = nowText;
      // Same words as the source buttons (ALL / DEFAULT / MY TRACKS / SPOTIFY):
      // the caption said "Built-in" for the button labelled DEFAULT.
      const SRC_LABEL = { all: "All music", builtin: "Default", user: "My tracks", spotify: "Spotify" };
      $("as-now-src").textContent = musicLive ? (SRC_LABEL[musicSrc] || "") : G.soundOn ? "" : "Master sound is off — MUSIC ON or SOUND EFFECTS ON turns it on";
      $("as-play").innerHTML = G.musicEnabled ? "&#10074;&#10074;" : "&#9654;";
      $("as-play").setAttribute("aria-label", G.musicEnabled ? "Pause music" : "Play music");
      for (const id of ["as-prev", "as-skip"]) $(id).disabled = !musicLive;
      $("as-play").disabled = !G.soundOn;
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncMusicSrcRow();
    }

    $("pm-audio").onclick = () => { syncAudioPanel(); $("audioset").hidden = false; };
    if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.onChange) {
      SpotifyMusic.onChange(() => { if (!$("audioset").hidden) syncMusicSrcRow(); });
    }
    $("as-src-all").onclick = () => { setMusicSrc("all"); if (G.soundOn) GameAudio.uiTick(); };
    $("as-src-builtin").onclick = () => { setMusicSrc("builtin"); if (G.soundOn) GameAudio.uiTick(); };
    $("as-src-user").onclick = () => { setMusicSrc("user"); if (G.soundOn) GameAudio.uiTick(); };
    $("as-src-spotify").onclick = () => { setMusicSrc("spotify"); if (G.soundOn) GameAudio.uiTick(); };
    $("as-sp-open").onclick = () => {
      if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.openPanel) SpotifyMusic.openPanel();
    };
    $("as-close").onclick = () => { $("audioset").hidden = true; };
    $("as-music-on").onclick = (e) => { e.stopPropagation(); setMusic(true); if (G.soundOn) GameAudio.uiTick(); };
    $("as-music-off").onclick = (e) => { e.stopPropagation(); setMusic(false); if (G.soundOn) GameAudio.uiTick(); };
    $("as-sound-on").onclick = (e) => { e.stopPropagation(); setSfx(true); GameAudio.uiTick(); };
    $("as-sound-off").onclick = (e) => { e.stopPropagation(); GameAudio.uiTick(); setSfx(false); };
    // `input` not `change`: the level should follow the thumb while dragged.
    $("as-mvol").oninput = (e) => {
      musicVol = GameAudio.setMusicVolume((+e.target.value || 0) / 10);
      store.set("volMusic", musicVol);
      $("as-mvol-v").textContent = String(Math.round(musicVol * 10));
    };
    $("as-svol").oninput = (e) => {
      sfxVol = GameAudio.setSfxVolume((+e.target.value || 0) / 10);
      store.set("volSfx", sfxVol);
      $("as-svol-v").textContent = String(Math.round(sfxVol * 10));
    };
    function audioTransport(fn) {
      const name = fn();
      if (name) { $("as-now").textContent = name; $("as-now").title = name; }
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncAudioPanel();
      if (G.soundOn) GameAudio.uiTick();
    }
    $("as-skip").onclick = () => audioTransport(() => GameAudio.skipTrack());
    $("as-prev").onclick = () => audioTransport(() => GameAudio.prevTrack());
    $("as-play").onclick = () => { setMusic(!G.musicEnabled); if (G.soundOn) GameAudio.uiTick(); };

    function init() {
      Log.info("audio", "AudioPanel.init sound=" + !!G.soundOn);
      setSound(G.soundOn, false);
      setMusic(G.musicEnabled, false);
      // A STORED "spotify" IS NOT WHAT IS PLAYING. Spotify never auto-connects,
      // so the restore below deliberately skips it — but `musicSrc` was left
      // holding the stored word, and the now-playing caption reads it: after a
      // reload it said "Spotify" while the source row lit ALL and the built-in
      // soundtrack played. Follow the audio engine for the caption instead, and
      // leave the STORED preference alone so it still means something the next
      // time the player connects.
      if (musicSrc === "spotify" && !spotifyReady()) musicSrc = GameAudio.musicSource();
      if (musicSrc && musicSrc !== "spotify") {
        const applySrc = () => { musicSrc = GameAudio.setMusicSource(musicSrc); syncMusicSrcRow(); };
        if (typeof MusicLib !== "undefined" && MusicLib.init) MusicLib.init().then(applySrc, applySrc);
        else applySrc();
      }
    }

    return { init };
  }
  return { create };
})();
