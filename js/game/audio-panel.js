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
    const { $, els, store } = G;

    // (No `hidden = false` here any more: #soundbtn is a child of #overlay, so
    // its visibility is the title screen's, not this module's. It carried a
    // `hidden` attribute purely so it would not flash before boot, and it no
    // longer needs one.)
    function setSound(b) {
      G.soundOn = b; store.set("sound", b);
      GameAudio.setEnabled(b);
      els.soundbtn.textContent = b ? "♪ ON" : "♪ OFF";
      // Mirror the state for assistive tech — it is a real toggle button now
      // that AriaState does not own (it is not in an option group).
      els.soundbtn.setAttribute("aria-pressed", b ? "true" : "false");
      if (!b) { GameAudio.stopMusic(); GameAudio.stopEngine(); }
      else {
        if (G.state === "menu") GameAudio.startMusic(-1);
        else if (G.state === "race") GameAudio.startMusic(G.trackIdx);
      }
      // SOUND is the master, so the panel's music controls follow it.
      syncAudioPanel();
    }
    els.soundbtn.onclick = () => setSound(!G.soundOn);

    // Music on/off, independent of the master sound toggle: engine + SFX keep
    // playing with music off.
    function setMusic(b) {
      // The master gates both buses and its only button lives on the title
      // screen, so asking for music mid-race has to lift it — otherwise the
      // switch reads ON and nothing plays, which is exactly the confusion the
      // duplicated pause-menu toggle used to cause.
      if (b && !G.soundOn) { setSound(true); }
      G.musicEnabled = b; store.set("music", b);
      GameAudio.setMusicEnabled(b);
      syncAudioPanel();
    }

    // setMusicVolume/setSfxVolume clamp to 0..1 internally and RETURN the
    // clamped value — take that, not the raw store read, so a value outside
    // 0..1 (corrupted storage, an older build's scale) can't leave musicVol/
    // sfxVol reading something the slider's own [0,10] input has to silently
    // clamp on assignment, while its TEXT label (driven by these variables,
    // not the input) kept showing the unclamped number.
    let musicVol = GameAudio.setMusicVolume(store.get("volMusic", 0.5));
    let sfxVol = GameAudio.setSfxVolume(store.get("volSfx", 1));
    let sfxOn = store.get("sfx", true);
    GameAudio.setSfxEnabled(sfxOn);

    // SOUND EFFECTS on/off. Only the sfx bus is muted, so the soundtrack keeps
    // playing — the sources stay alive at zero gain rather than being torn
    // down, so there is nothing to rebuild when it comes back on.
    function setSfx(b) {
      if (b && !G.soundOn) { setSound(true); }
      sfxOn = b; store.set("sfx", b);
      GameAudio.setSfxEnabled(b);
      syncAudioPanel();
    }

    /* MUSIC SOURCE — ALL / DEFAULT / MY TRACKS pick which part of the local
       library plays; SPOTIFY hands the music role to js/game/spotify.js. It is
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
      // Leaving Spotify releases the music role but keeps the session, so
      // coming back does not cost another sign-in.
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
        note.textContent = on === "spotify"
            ? "Spotify is driving the music. The controls above drive it too."
          : counts.user === 0
            ? "Add your own files under YOUR TRACKS to use MY TRACKS."
          : on === "user" ? "Playing your " + counts.user + " uploaded track" + (counts.user === 1 ? "" : "s") + " only."
          : on === "builtin" ? "Playing the " + counts.builtin + " shipped tracks only."
          : "Playing everything: " + counts.builtin + " shipped + " + counts.user + " of yours.";
      }
    }

    function syncAudioPanel() {
      // The two switches are INDEPENDENT — music with no sound effects is a
      // normal way to play. Each only follows its own switch and the master
      // (the ♪ button / SOUND in the settings grid), which mutes everything.
      const musicLive = G.musicEnabled && G.soundOn;
      const sfxLive = sfxOn && G.soundOn;
      $("as-music-on").classList.toggle("active", G.musicEnabled);
      $("as-music-off").classList.toggle("active", !G.musicEnabled);
      $("as-sound-on").classList.toggle("active", sfxOn);
      $("as-sound-off").classList.toggle("active", !sfxOn);
      // Disabled, not hidden: the row keeps its slot so nothing reflows under
      // a thumb mid-tap, and .tune-row greys to say the control is inert.
      $("as-mvol").disabled = !musicLive;
      $("as-svol").disabled = !sfxLive;
      $("as-mvol").closest(".tune-row").classList.toggle("tune-off", !musicLive);
      $("as-svol").closest(".tune-row").classList.toggle("tune-off", !sfxLive);
      $("as-mvol").value = String(Math.round(musicVol * 10));
      $("as-mvol-v").textContent = String(Math.round(musicVol * 10));
      $("as-svol").value = String(Math.round(sfxVol * 10));
      $("as-svol-v").textContent = String(Math.round(sfxVol * 10));
      $("as-now").textContent = musicLive ? (GameAudio.trackName() || "—") : "Music off";
      // The caption says WHERE the track came from, which is the question the
      // old single line could not answer — "Now playing X" with four sources.
      const SRC_LABEL = { all: "All music", builtin: "Built-in", user: "My tracks", spotify: "Spotify" };
      $("as-now-src").textContent = musicLive ? (SRC_LABEL[musicSrc] || "") : "";
      $("as-play").innerHTML = G.musicEnabled ? "&#10074;&#10074;" : "&#9654;";
      $("as-play").setAttribute("aria-label", G.musicEnabled ? "Pause music" : "Play music");
      for (const id of ["as-prev", "as-skip"]) $(id).disabled = !musicLive;
      $("as-play").disabled = !G.soundOn;
      // The uploaded-track rows carry a "playing" marker, so they have to be
      // re-rendered whenever the panel is opened or the track changes —
      // MusicLib owns the list, we only tell it the picture is stale.
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncMusicSrcRow();
    }

    $("pm-audio").onclick = () => { syncAudioPanel(); $("audioset").hidden = false; };
    // The SPOTIFY entry is owned by js/game/spotify.js — it knows whether there
    // is anything to control, and keeps its own button's disabled state in
    // sync. Spotify's state changes on its own schedule (a redirect completing,
    // a device dropping); the source row has to follow it, not just panel-open.
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
    // stopPropagation: these four buttons live inside MUSIC/SOUND EFFECTS'
    // <summary> (their section header), and a click on ANY element inside a
    // summary still reaches the summary's own click handling by default —
    // without this, pressing ON/OFF would also open or close the section.
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
    // One handler for all three transport buttons: they differ only in which
    // GameAudio call they make, and all three then have to refresh the same
    // now-playing card and the uploaded-track list's "playing" marker.
    function audioTransport(fn) {
      const name = fn();
      if (name) $("as-now").textContent = name;
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncAudioPanel();
      if (G.soundOn) GameAudio.uiTick();
    }
    $("as-skip").onclick = () => audioTransport(() => GameAudio.skipTrack());
    $("as-prev").onclick = () => audioTransport(() => GameAudio.prevTrack());
    // PLAY/PAUSE is the music switch, not a separate transport state — there
    // is one music bus and `musicEnabled` already owns whether it is running,
    // so a third notion of "paused" here would be a second source of truth.
    $("as-play").onclick = () => { setMusic(!G.musicEnabled); if (G.soundOn) GameAudio.uiTick(); };

    // Boot restore — game.js calls this at the old restore position, after the
    // saved settings load and before the first frame.
    function init() {
      setSound(G.soundOn);
      setMusic(G.musicEnabled);
      // A STORED "spotify" IS NOT WHAT IS PLAYING. Spotify never auto-connects,
      // so the restore below deliberately skips it — but `musicSrc` was left
      // holding the stored word, and the now-playing caption reads it: after a
      // reload it said "Spotify" while the source row lit ALL and the built-in
      // soundtrack played. Follow the audio engine for the caption instead, and
      // leave the STORED preference alone so it still means something the next
      // time the player connects.
      if (musicSrc === "spotify" && !spotifyReady()) musicSrc = GameAudio.musicSource();
      // Restore the saved source once the uploaded tracks are in the playlist —
      // "MY TRACKS" is refused while the library looks empty, which it does
      // until MusicLib's IndexedDB read lands.
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
