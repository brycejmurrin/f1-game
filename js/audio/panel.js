"use strict";
/* MUSIC & SOUND panel — the mixer plus the master-sound plumbing.
   The mixer is a SettingsNav page (same sheet as DISPLAY), not its own dialog.
   Levels persist.

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
      else if (G.state === "menu") GameAudio.startMusic(-1);
      else if (G.state === "race" || G.state === "count") {   // the countdown is the race's first seconds
        GameAudio.startMusic(G.trackIdx);
        GameAudio.startEngine();
        if (G.raceWeather === "rain") GameAudio.startRain();
      }
      // SOUND is the master, so the panel's music controls follow it.
      syncAudioPanel();
    }
    els.soundbtn.onclick = () => setSound(!G.soundOn, true);

    // TEAM RADIO — the banner spoken aloud (js/audio/radio-voice.js). Same shape
    // as SOUND EFFECTS above, including the ordering: the master gates it, so
    // asking for it mid-race lifts SOUND rather than leaving a switch that reads
    // ON over silence. OFF by default — the reasons are in radio-voice.js, and
    // the short one is that #announce is already role="status", so a screen
    // reader user hears every card twice if we default this on.
    let radioOn = store.get("radioVoice", false);
    let radioVol = store.get("volRadio", 0.8);
    /* The announcer's switch is READ FROM THE MODULE, never mirrored here. It
     * is the one spoken setting a second surface also flips — the flyby editor
     * previews it — and a `let annOn` in this closure would have gone stale the
     * moment it did, which is the exact shape of bug the lighting tuner's
     * "read the live profile back" rule exists to prevent. */
    const annOn = () => !!(G.announcer && G.announcer.enabled && G.announcer.enabled());
    function setRadio(b) {
      if (b && !G.soundOn) setSound(true, true);
      radioOn = b; store.set("radioVoice", b);
      if (G.radio) { G.radio.setEnabled(b); if (b) G.radio.unlock(); }   // this click IS the gesture iOS wants
      syncAudioPanel();
    }

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

    let musicVol = GameAudio.setMusicVolume(store.get("volMusic", 0.6));
    let sfxVol = GameAudio.setSfxVolume(store.get("volSfx", 0.2));
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

    function paintAudioFolds() {
      const SRC_FOLD = { all: "ALL", builtin: "DEFAULT", user: "MY TRACKS", spotify: "SPOTIFY" };
      const activeSrc = (typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse && SpotifyMusic.inUse())
        ? "spotify" : ((typeof GameAudio !== "undefined" && GameAudio.musicSource)
          ? GameAudio.musicSource() : musicSrc);
      Dom.paintFold($("as-music-sum"), [
        ["k", "MUSIC"],
        [G.musicEnabled ? "on" : "off", G.musicEnabled ? "ON" : "OFF"],
        ["val", SRC_FOLD[activeSrc] || "ALL"],
      ]);
      Dom.paintFold($("as-sound-sum"), [
        ["k", "SOUND"],
        [sfxOn ? "on" : "off", sfxOn ? "ON" : "OFF"],
      ]);
      Dom.paintFold($("as-radio-sum"), [
        ["k", "TEAM RADIO"],
        [radioOn ? "on" : "off", radioOn ? "ON" : "OFF"],
      ]);
      Dom.paintFold($("as-ann-sum"), [
        ["k", "ANNOUNCER"],
        [annOn() ? "on" : "off", annOn() ? "ON" : "OFF"],
      ]);
      const prof = (typeof GameAudio !== "undefined" && GameAudio.profile) ? GameAudio.profile() : "team";
      Dom.paintFold($("as-engine-sum"), [
        ["k", "ENGINE TONE"],
        ["val", (prof || "team").toUpperCase()],
      ]);
      const counts = (typeof GameAudio !== "undefined" && GameAudio.sourceCounts)
        ? GameAudio.sourceCounts() : { user: 0 };
      const n = counts.user || 0;
      Dom.paintFold($("as-tracks-sum"), n
        ? [["k", "YOUR TRACKS"], ["val", String(n)]]
        : [["k", "YOUR TRACKS"]]);
      let spKind = "off", spWord = "OFF";
      if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.debug) {
        const st = (SpotifyMusic.debug().state || "off");
        if (st === "connected") { spKind = "on"; spWord = "ON"; }
        else if (st === "configured" || st === "connecting") { spKind = "val"; spWord = "SAVED"; }
        else if (st === "error") { spKind = "off"; spWord = "ERR"; }
      }
      Dom.paintFold($("as-sp-sum"), [["k", "SPOTIFY"], [spKind, spWord]]);
    }

    // SOURCE is a setting row (js/ui/setting-row.js): MY TRACKS and SPOTIFY
    // are shown but unpickable until there is something behind them.
    const SRC_VALUES = [["all", "ALL"], ["builtin", "DEFAULT"], ["user", "MY TRACKS"], ["spotify", "SPOTIFY"]];
    const ONOFF = [["on", "ON"], ["off", "OFF"]];
    function srcOn() {
      return (typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse && SpotifyMusic.inUse())
        ? "spotify" : GameAudio.musicSource();
    }
    function syncMusicSrcRow() {
      const counts = GameAudio.sourceCounts ? GameAudio.sourceCounts() : { builtin: 0, user: 0 };
      const spot = spotifyReady();
      const on = srcOn();
      SettingRow.paint($("as-src"), on, SRC_VALUES);
      SettingRow.optionDisabled($("as-src"), "user", counts.user === 0);
      SettingRow.optionDisabled($("as-src"), "spotify", !spot);
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
      paintAudioFolds();
    }

    function syncAudioPanel() {
      const musicLive = G.musicEnabled && G.soundOn;
      const sfxLive = sfxOn && G.soundOn;
      SettingRow.paint($("as-music"), G.musicEnabled ? "on" : "off", ONOFF);
      SettingRow.paint($("as-sound"), sfxOn ? "on" : "off", ONOFF);
      $("as-mvol").disabled = !musicLive;
      $("as-svol").disabled = !sfxLive;
      $("as-mvol").closest(".tune-row").classList.toggle("tune-off", !musicLive);
      $("as-svol").closest(".tune-row").classList.toggle("tune-off", !sfxLive);
      $("as-mvol").value = String(Math.round(musicVol * 10));
      $("as-mvol-v").textContent = String(Math.round(musicVol * 10));
      $("as-svol").value = String(Math.round(sfxVol * 10));
      $("as-svol-v").textContent = String(Math.round(sfxVol * 10));
      // The radio row explains WHICH of the three reasons it is unusable for,
      // because "greyed out" with no sentence is the worst version of this.
      const radioReady = !!(G.radio && G.radio.available());
      const radioLive = radioOn && G.soundOn && radioReady;
      SettingRow.paint($("as-radio"), radioOn ? "on" : "off", ONOFF);
      SettingRow.disable($("as-radio"), !radioReady);
      $("as-rvol").disabled = !radioLive;
      $("as-rvol").closest(".tune-row").classList.toggle("tune-off", !radioLive);
      $("as-rvol").value = String(Math.round(radioVol * 10));
      $("as-rvol-v").textContent = String(Math.round(radioVol * 10));
      // The voice rows follow the same live gate as the volume: tuning a voice
      // that cannot speak is a control that does nothing. Built here rather than
      // at wire time because getVoices() is empty on Chrome's first read and
      // fills in later — opening the panel is when we know what is installed.
      buildVoiceRows();
      // CAPABILITY, not existence. $() here answers from a DOM that is a STUB in
      // the node suites — tests/unit/async-lifecycle.test.mjs hands back a
      // truthy element with only the handful of members the audio path needed
      // before this row existed. `if (vh)` passed and vh.querySelectorAll threw,
      // taking three unrelated audio-boot tests down with it and failing the
      // deploy. Ask for what is about to be called.
      const vh = $("as-voices");
      if (vh && vh.classList) vh.classList.toggle("tune-off", !radioLive);
      if (vh && typeof vh.querySelectorAll === "function") {
        for (const el of vh.querySelectorAll("select,input,button")) el.disabled = !radioLive;
      }
      const rnote = $("as-radio-note");
      if (rnote) rnote.textContent = !radioReady ? "This browser has no speech voices, so the radio stays written."
        : !G.soundOn ? "Master sound is off — TEAM RADIO ON turns it on."
        : "Race control, your engineer and the coach read their messages aloud. The cards are unchanged.";
      // THE ANNOUNCER, on the same three-part gate and for the same reason: a
      // greyed row with no sentence is the worst version of this.
      const annReady = !!(G.announcer && G.announcer.available());
      const annLive = annOn() && G.soundOn && annReady;
      SettingRow.paint($("as-ann"), annOn() ? "on" : "off", ONOFF);
      SettingRow.disable($("as-ann"), !annReady);
      const ah = $("as-ann-voice");
      if (ah && ah.classList) ah.classList.toggle("tune-off", !annLive);
      if (ah && typeof ah.querySelectorAll === "function") {
        for (const el of ah.querySelectorAll("select,input,button")) el.disabled = !annLive;
      }
      const anote = $("as-ann-note");
      if (anote) anote.textContent = !annReady ? "This browser has no speech voices, so the loading card stays written."
        : !G.soundOn ? "Master sound is off — ANNOUNCER ON turns it on."
        : "The welcome is written from the circuit itself, so every track gets one. VOICE VOLUME above sets the level.";
      // The master gate is what silences music when SOUND is off, and the MUSIC
      // switch still reads ON then — so the readout names the gate that is
      // actually shut instead of contradicting the switch beside it. The title
      // line ellipsises (css/tuner.css .as-now-title), so the way out goes on
      // the caption under it, which wraps.
      const nowText = musicLive ? (GameAudio.trackName() || "—") : G.soundOn ? "Music off" : "Sound off";
      // Same words as the SOURCE row (ALL / DEFAULT / MY TRACKS / SPOTIFY):
      // the caption said "Built-in" for the value labelled DEFAULT.
      const SRC_LABEL = { all: "All music", builtin: "Default", user: "My tracks", spotify: "Spotify" };
      const srcText = musicLive ? (SRC_LABEL[musicSrc] || "") : G.soundOn ? "" : "Master sound is off — MUSIC ON or SOUND EFFECTS ON turns it on";
      // Two copies of the NOW PLAYING card: the MUSIC page's (as-*) and the
      // pause menu's (pm-*), which is only shown while music is live.
      for (const p of ["as", "pm"]) {
        const now = $(p + "-now"), src = $(p + "-now-src"), play = $(p + "-play");
        if (!now || !play) continue;
        now.textContent = nowText;
        now.title = nowText;
        if (src) src.textContent = srcText;
        play.innerHTML = G.musicEnabled ? "&#10074;&#10074;" : "&#9654;";
        play.setAttribute("aria-label", G.musicEnabled ? "Pause music" : "Play music");
        for (const id of [p + "-prev", p + "-skip"]) if ($(id)) $(id).disabled = !musicLive;
        play.disabled = !G.soundOn;
      }
      const pmCard = $("pm-now-card");
      if (pmCard) pmCard.hidden = !musicLive;
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncMusicSrcRow();
      syncTonePanel();
      paintAudioFolds();
    }

    $("pm-audio").addEventListener("click", () => { syncAudioPanel(); });
    if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.onChange) {
      SpotifyMusic.onChange(() => { if (!$("audioset").hidden) syncMusicSrcRow(); });
    }
    SettingRow.wire("as-src", { values: SRC_VALUES, read: srcOn,
      write: (v) => { setMusicSrc(v); if (G.soundOn) GameAudio.uiTick(); } });
    $("as-sp-open").onclick = () => {
      if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.openPanel) SpotifyMusic.openPanel();
    };
    SettingRow.wire("as-music", { values: ONOFF, read: () => (G.musicEnabled ? "on" : "off"),
      write: (v) => { setMusic(v === "on"); if (G.soundOn) GameAudio.uiTick(); } });
    // ON enables before the tick so the tick has a context to play in; OFF
    // ticks first, while the bus is still open.
    SettingRow.wire("as-radio", { values: ONOFF, read: () => (radioOn ? "on" : "off"),
      write: (v) => { if (v === "on") { setRadio(true); GameAudio.uiTick(); } else { GameAudio.uiTick(); setRadio(false); } } });
    // THE PRE-RACE ANNOUNCER (js/audio/announcer.js). Same shape, same master
    // lift — but its own switch, because it speaks on the loading screen and
    // the radio speaks in the race, and a player who wants one rarely wants
    // both. The module owns the stored value; this row only asks it.
    SettingRow.wire("as-ann", { values: ONOFF, read: () => (annOn() ? "on" : "off"),
      write: (v) => {
        const want = v === "on";
        if (want && !G.soundOn) setSound(true, true);
        if (G.announcer && G.announcer.setEnabled) G.announcer.setEnabled(want);
        GameAudio.uiTick();
        syncAudioPanel();
      } });
    /* THE PER-CHANNEL VOICE ROWS, built rather than written into the shell: the
     * voice list is the machine's installed voices, so the <option>s cannot be
     * static markup. Three groups, one per speaker in RadioVoice.SPEAKERS.
     *
     * Built ONCE and then only re-synced. getVoices() is famously empty on the
     * first read in Chrome and fills in later, so the rebuild is driven by the
     * voice list actually changing — not by a timer, and not by a re-open that
     * would throw away a half-made selection. */
    const VOICE_CHANNELS = [
      ["control", "RACE CONTROL", "Penalties, warnings and flags."],
      ["coach", "COACH", "Practice drills and driving advice."],
      ["radio", "TEAM RADIO", "Your engineer: box calls, position, tyres."],
    ];
    /* THE ANNOUNCER'S ROW IS THE SAME ROW, IN A DIFFERENT SECTION. It is a
     * RadioVoice channel (js/audio/radio-voice.js TONE) so it gets a voice, a
     * pitch and a rate for free — but it is NOT gated on the TEAM RADIO switch,
     * so it cannot live under that switch's heading where every other control
     * greys out with it. Its own <details>, its own host, one shared builder. */
    const ANN_CHANNEL = ["announcer", "ANNOUNCER",
      "Daniel on a Mac, another British voice elsewhere — or pick your own."];
    let voiceRowsFor = null;   // the voice-list length the rows were built against

    function voiceRow(ch, label, blurb) {
      const wrap = document.createElement("div");
      wrap.className = "as-voice";
      const list = (G.radio && G.radio.voiceList && G.radio.voiceList()) || [];
      const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(ch)) || { pitch: 1, rate: 1, name: "" };

      const head = document.createElement("div");
      head.className = "set-row";
      const name = document.createElement("span");
      name.className = "tune-label"; name.id = "as-v-" + ch + "-label"; name.textContent = label;
      const sel = document.createElement("select");
      sel.id = "as-v-" + ch;
      sel.setAttribute("aria-labelledby", name.id);
      // SYSTEM DEFAULT is a real choice, not a placeholder: on iOS getVoices()
      // returns nothing and the platform picks for itself, so this is the only
      // entry there and the pitch/rate below are what carry the channel.
      const auto = document.createElement("option");
      auto.value = ""; auto.textContent = list.length ? "DEFAULT" : "SYSTEM DEFAULT";
      sel.appendChild(auto);
      for (const v of list) {
        const o = document.createElement("option");
        o.value = v.name; o.textContent = v.name;
        sel.appendChild(o);
      }
      sel.value = list.some((v) => v.name === tune.name) ? tune.name : "";
      sel.onchange = () => { setTune(ch, { name: sel.value }); preview(ch); };
      const test = document.createElement("button");
      test.type = "button"; test.className = "cz-liv-none"; test.id = "as-v-" + ch + "-test";
      test.textContent = "TEST";
      test.setAttribute("aria-label", "Hear " + label);
      test.onclick = () => preview(ch);
      const box = document.createElement("div");
      box.append(sel, test);
      head.append(name, box);

      wrap.append(head, slider(ch, "pitch", "PITCH", tune.pitch, RadioVoice.PITCH_MIN, RadioVoice.PITCH_MAX),
                  slider(ch, "rate", "RATE", tune.rate, RadioVoice.RATE_MIN, RadioVoice.RATE_MAX));
      const note = document.createElement("p");
      note.className = "as-note"; note.textContent = blurb;
      wrap.appendChild(note);
      return wrap;
    }

    // Sliders speak in HUNDREDTHS. The range is 0.5..1.6 for pitch and 0.6..1.35
    // for rate — a step of 0.05 in float steps is where <input type=range> starts
    // handing back 1.0500000000000003, and the store then carries that forever.
    function slider(ch, key, label, value, lo, hi) {
      const row = document.createElement("label");
      row.className = "tune-row";
      const cap = document.createElement("span");
      cap.className = "tune-label";
      const b = document.createElement("b");
      b.id = "as-v-" + ch + "-" + key + "-v";
      b.textContent = value.toFixed(2);
      cap.append(document.createTextNode(label + " "), b);
      const inp = document.createElement("input");
      inp.type = "range"; inp.id = "as-v-" + ch + "-" + key;
      inp.min = String(Math.round(lo * 100)); inp.max = String(Math.round(hi * 100));
      inp.step = "5"; inp.value = String(Math.round(value * 100));
      inp.setAttribute("aria-label", label + " for " + ch);
      inp.oninput = () => {
        const v = (+inp.value || 0) / 100;
        b.textContent = v.toFixed(2);
        setTune(ch, { [key]: v });
      };
      // The change, not every drag frame: speaking on `input` would queue a
      // sample per pixel of thumb travel and the synth would stutter through
      // them long after the drag stopped.
      inp.onchange = () => preview(ch);
      row.append(cap, inp);
      return row;
    }

    const setTune = (ch, patch) => { if (G.radio && G.radio.setTune) G.radio.setTune(ch, patch); };
    /* WHICH preview. RadioVoice.preview() refuses unless the TEAM RADIO switch
     * is on — correct for the three race channels, wrong for the announcer,
     * which is on by default while that switch is off by default. Sending the
     * announcer's TEST through the radio would have made it the one button on
     * this sheet that does nothing with its own switch ON. */
    const preview = (ch) => {
      if (ch === "announcer") { if (G.announcer && G.announcer.sample) G.announcer.sample(); return; }
      if (G.radio && G.radio.preview) G.radio.preview(ch);
    };

    function buildVoiceRows() {
      buildAnnVoiceRow();
      const host = $("as-voices");
      // The same capability guard as the sync block below, and for the same
      // reason: $() answers from a STUB element in the node suites, with only
      // the members the audio path happened to need. This one escaped by luck —
      // its harness never defines RadioVoice, so the check below returned first
      // — and would have thrown on host.children the moment a suite loaded both.
      if (!host || typeof host.appendChild !== "function" || !host.children) return;
      if (typeof RadioVoice === "undefined" || typeof document === "undefined"
          || typeof document.createElement !== "function") return;
      const n = (G.radio && G.radio.voiceList && G.radio.voiceList().length) || 0;
      if (voiceRowsFor === n && host.children.length > 1) return;   // already right for this list
      voiceRowsFor = n;
      while (host.children.length > 1) host.removeChild(host.lastChild);
      for (const [ch, label, blurb] of VOICE_CHANNELS) host.appendChild(voiceRow(ch, label, blurb));
      const note = $("as-voices-note");
      if (note) {
        note.textContent = n
          ? n + " system voices. A long message is sped up to fit its card, so RATE is a floor, not a promise."
          : "This browser does not list its voices, so it picks one itself — PITCH and RATE are what separate the three channels here.";
      }
    }

    /** The announcer's single voice row, into its own host. Same guards and the
     *  same rebuild rule as the three above — the voice list is the machine's,
     *  and Chrome's first getVoices() is empty. Tracked separately because the
     *  two hosts can be built on different opens. */
    let annRowFor = null;
    function buildAnnVoiceRow() {
      const host = $("as-ann-voice");
      if (!host || typeof host.appendChild !== "function" || !host.children) return;
      if (typeof RadioVoice === "undefined" || typeof document === "undefined"
          || typeof document.createElement !== "function") return;
      const n = (G.radio && G.radio.voiceList && G.radio.voiceList().length) || 0;
      if (annRowFor === n && host.children.length > 1) return;
      annRowFor = n;
      while (host.children.length > 1) host.removeChild(host.lastChild);
      host.appendChild(voiceRow.apply(null, ANN_CHANNEL));
    }

    $("as-rvol").oninput = (e) => {
      radioVol = G.radio ? G.radio.setVolume((+e.target.value || 0) / 10) : (+e.target.value || 0) / 10;
      store.set("volRadio", radioVol);
      $("as-rvol-v").textContent = String(Math.round(radioVol * 10));
    };
    SettingRow.wire("as-sound", { values: ONOFF, read: () => (sfxOn ? "on" : "off"),
      write: (v) => { if (v === "on") { setSfx(true); GameAudio.uiTick(); } else { GameAudio.uiTick(); setSfx(false); } } });
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
    /* ENGINE TONE — profiles, tuner sliders and layer switches over the
       manufacturer voice. The engine owns the clamping and the timbre contract
       (js/audio/engine.js); this is the surface and the persistence.

       Each slider is an integer 0..max in the DOM mapped through {lo, step},
       chosen per field so that an EXACT integer lands on 1.0 — a slider whose
       centre is 0.9975 would mean the panel could not express the shipped
       sound, which is the one value it must always be able to return to. */
    // Same order as the shell: PITCH CURVE (idle end, whole-curve transpose,
    // span, bend), CHARACTER, the three LIMITER knobs, the two BOOST knobs,
    // then the LAYER levels.
    const TONE = [
      { k: "idle",       id: "as-t-idle",   lo: 0.50, step: 0.05 },
      { k: "pitch",      id: "as-t-pitch",  lo: 0.60, step: 0.05 },
      { k: "revRange",   id: "as-t-range",  lo: 0.20, step: 0.10 },
      { k: "curve",      id: "as-t-curve",  lo: 0.40, step: 0.10 },
      { k: "gravel",     id: "as-t-gravel", lo: 0,    step: 0.25 },
      { k: "detune",     id: "as-t-detune", lo: 0,    step: 0.25 },
      { k: "brightness", id: "as-t-bright", lo: 0.30, step: 0.05 },
      { k: "sub",        id: "as-t-sub",    lo: 0,    step: 0.25 },
      { k: "limiter",    id: "as-t-lim",    lo: 0,    step: 0.25 },
      { k: "limRate",    id: "as-t-limrate", lo: 0.40, step: 0.10 },
      { k: "limPitch",   id: "as-t-limsag", lo: 0,    step: 0.25 },
      { k: "boost",      id: "as-t-boost",  lo: 0,    step: 0.25 },
      { k: "boostPitch", id: "as-t-boostlift", lo: 0, step: 0.25 },
      { k: "whine",      id: "as-t-whine",  lo: 0,    step: 0.25 },
      { k: "harvest",    id: "as-t-harvest", lo: 0,   step: 0.25 },
      { k: "wind",       id: "as-t-wind",   lo: 0,    step: 0.25 },
      { k: "screech",    id: "as-t-tyres",  lo: 0,    step: 0.25 },
      { k: "brakes",     id: "as-t-brakes", lo: 0,    step: 0.25 },
      { k: "shift",      id: "as-t-shift",  lo: 0,    step: 0.25 },
      { k: "rivals",     id: "as-t-rivals", lo: 0,    step: 0.25 },
      { k: "reverb",     id: "as-t-rev",    lo: 0,    step: 0.25 },
      { k: "overrun",    id: "as-t-ovr",    lo: 0,    step: 0.25 },
    ];
    const TONE_LAYERS = [
      { k: "whine",   id: "as-l-whine" },   { k: "harvest", id: "as-l-harvest" },
      { k: "ers",     id: "as-l-ers" },     { k: "wind",    id: "as-l-wind" },
      { k: "limiter", id: "as-l-limiter" }, { k: "screech", id: "as-l-screech" },
      { k: "sub",     id: "as-l-sub" },     { k: "gravel",  id: "as-l-gravel" },
      { k: "brakes",  id: "as-l-brakes" },  { k: "rivals",  id: "as-l-rivals" },
      { k: "reverb",  id: "as-l-reverb" },  { k: "overrun", id: "as-l-overrun" },
    ];
    // PROFILE setting row; CUSTOM is shown, not pickable — it is the state the
    // trim sliders leave behind.
    const PROFILE_VALUES = [["team", "TEAM"], ["broadcast", "BROADCAST"], ["trackside", "TRACKSIDE"],
      ["cockpit", "COCKPIT"], ["v10", "V10"], ["custom", "CUSTOM", true]];
    const PROFILE_NOTE = {
      team: "Follows your team's engine — the default sound.",
      broadcast: "Bright and forward, with the turbo up and the idle clean. The TV mix.",
      trackside: "Darker, further away, lumpier at idle, more air, tyre and brake.",
      cockpit: "Heavy and muffled, with the rev limiter, brakes and gearbox loud. From inside the car.",
      v10: "Low lazy idle, then a late climb to a scream. Hard fast limiter, no turbo, no hybrid.",
    };
    // The engine owns which profile is live — it flips itself to "custom" the
    // moment a trim stops matching the named preset (setTune, js/audio/engine.js).
    // The panel deliberately keeps no second copy: two records of the same fact
    // is how the row ends up lighting a preset the tune has been edited away
    // from. "custom" is not in profiles(), so the row simply lights nothing.
    const toneProfile = () => GameAudio.profile();

    function toneSlider(t) { return $(t.id); }

    function applyStoredTone() {
      // No need to validate the stored name first: setProfile already falls back
      // to "team" for anything it does not recognise, so a hand-edited or
      // stale-schema value lands on the shipped sound either way.
      GameAudio.setProfile(store.get("sndProfile", "team"));
      const savedTune = store.get("sndTune", null);
      if (savedTune && typeof savedTune === "object") GameAudio.setTune(savedTune);
      const savedLayers = store.get("sndLayers", null);
      if (savedLayers && typeof savedLayers === "object") {
        for (const l of TONE_LAYERS) if (typeof savedLayers[l.k] === "boolean") GameAudio.setLayer(l.k, savedLayers[l.k]);
      }
    }

    function syncTonePanel() {
      const tune = GameAudio.tune();
      for (const t of TONE) {
        const el = toneSlider(t);
        if (!el) continue;
        el.value = String(Math.round((tune[t.k] - t.lo) / t.step));
        $(t.id + "-v").textContent = String(Math.round(tune[t.k] * 100));
      }
      const layers = GameAudio.layers();
      for (const l of TONE_LAYERS) {
        const b = $(l.id);
        if (!b) continue;
        b.classList.toggle("active", !!layers[l.k]);
        b.setAttribute("aria-pressed", layers[l.k] ? "true" : "false");
      }
      SettingRow.paint($("as-p"), toneProfile(), PROFILE_VALUES);
      // Guarded like every other lookup in this section, and for the reason
      // js/game.js already records: optional markup must not turn one missing
      // element into a whole-panel failure. Measured, not assumed — with the
      // ENGINE TONE block absent these two were the only unguarded reads left,
      // and create() threw here and took the music transport and both volume
      // sliders down with it.
      const note = $("as-p-note");
      if (note) note.textContent = toneProfile() === "custom"
        ? "Your own tune. RESET returns to your team's engine sound."
        : (PROFILE_NOTE[toneProfile()] || "");
      paintAudioFolds();
    }

    function setToneProfile(name) {
      GameAudio.setProfile(name);
      persistTone();
      syncTonePanel();
    }
    function persistTone() {
      store.set("sndProfile", toneProfile());
      store.set("sndTune", GameAudio.tune());
    }

    SettingRow.wire("as-p", { values: PROFILE_VALUES, read: toneProfile,
      write: (name) => { setToneProfile(name); if (G.soundOn) GameAudio.uiTick(); } });
    for (const t of TONE) {
      const el = toneSlider(t);
      if (!el) continue;
      // `input` so the engine follows the thumb — the whole point is hearing the
      // change while dragging. The WRITE is on `change`: oninput fires per pixel
      // of drag and every one of those would be a localStorage round-trip.
      el.oninput = () => {
        GameAudio.setTune({ [t.k]: t.lo + (+el.value || 0) * t.step });
        $(t.id + "-v").textContent = String(Math.round(GameAudio.tune()[t.k] * 100));
        syncTonePanel();   // the engine may have just flipped itself to "custom"
      };
      el.onchange = persistTone;
    }
    for (const l of TONE_LAYERS) {
      const b = $(l.id);
      if (!b) continue;
      b.onclick = () => {
        const on = !GameAudio.layers()[l.k];
        GameAudio.setLayer(l.k, on);
        store.set("sndLayers", GameAudio.layers());
        syncTonePanel();
        if (G.soundOn) GameAudio.uiTick();
      };
    }
    const resetBtn = $("as-t-reset");
    if (resetBtn) resetBtn.onclick = () => {
      for (const l of TONE_LAYERS) GameAudio.setLayer(l.k, true);
      store.set("sndLayers", GameAudio.layers());
      setToneProfile("team");
      if (G.soundOn) GameAudio.uiTick();
    };

    function audioTransport(fn) {
      fn();
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncAudioPanel();   // repaints both NOW PLAYING cards
      if (G.soundOn) GameAudio.uiTick();
    }
    for (const p of ["as", "pm"]) {
      const skip = $(p + "-skip"), prev = $(p + "-prev"), play = $(p + "-play");
      if (skip) skip.onclick = () => audioTransport(() => GameAudio.skipTrack());
      if (prev) prev.onclick = () => audioTransport(() => GameAudio.prevTrack());
      if (play) play.onclick = () => { setMusic(!G.musicEnabled); if (G.soundOn) GameAudio.uiTick(); };
    }
    // The pause card must read the track that is playing WHEN THE MENU OPENS,
    // and a track that ends while the menu is up advances underneath it — so
    // repaint on open and tick while it is visible. Attribute observer, not a
    // hook in game.js's setPaused: the panel owns its own cards.
    const pauseMenu = $("pausemenu");
    if (pauseMenu && typeof MutationObserver !== "undefined" && typeof setInterval === "function") {
      let tick = 0;
      const follow = () => {
        if (pauseMenu.hidden) { if (tick) { clearInterval(tick); tick = 0; } return; }
        syncAudioPanel();
        if (!tick) tick = setInterval(syncAudioPanel, 1000);
      };
      new MutationObserver(follow).observe(pauseMenu, { attributes: true, attributeFilter: ["hidden"] });
    }

    function init() {
      Log.info("audio", "AudioPanel.init sound=" + !!G.soundOn);
      // Before setSound: it can start the engine, and the engine reads the tune
      // on its first frame. Restoring after would run one race's worth of
      // frames on the default voice and only correct on the next setEngine.
      applyStoredTone();
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
