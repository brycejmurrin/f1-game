"use strict";
var AudioPanel = (() => {
  function create(G) {
    Log.info("audio", "AudioPanel.create");
    const { $, els, store } = G;

    function setText(el, value) {
      if (!el) return;
      const v = String(value);
      if (el.textContent === v) return;
      const t = el.firstChild;
      if (t && t.nodeType === 3 && !t.nextSibling && v !== "") t.data = v;
      else el.textContent = v;
    }
    function setAttr(el, name, value) {
      if (el && (!el.getAttribute || el.getAttribute(name) !== value)) el.setAttribute(name, value);
    }
    function setDisabled(el, off) { if (el && el.disabled !== !!off) el.disabled = !!off; }
    function setValue(el, value) { if (el && el.value !== value) el.value = value; }

    function setSound(b, fromGesture) {
      G.soundOn = b; store.set("sound", b);
      GameAudio.setEnabled(b);
      if (!b) {
        stopBattlePreview();
        if (G.announcer && G.announcer.stop) G.announcer.stop();
        if (G.radio && G.radio.stop) G.radio.stop();
        if (G.radio && G.radio.pack) G.radio.pack.stop();
      }
      if (b && fromGesture) GameAudio.init();
      els.soundbtn.textContent = b ? "SOUND ON" : "SOUND OFF";
      els.soundbtn.setAttribute("aria-pressed", b ? "true" : "false");
      if (!b) { GameAudio.stopMusic(); GameAudio.stopEngine(); GameAudio.stopRain(); }
      else if (G.state === "menu") GameAudio.startMusic(-1);
      else if (G.state === "race" || G.state === "count") {
        if (G.player && G.player.team && GameAudio.setVoice) GameAudio.setVoice(G.player.team.engine);
        if (G.track && G.track.def && GameAudio.setVenue) GameAudio.setVenue(G.track.def);
        if (!G.paused) {
          GameAudio.startMusic(G.trackIdx);
          GameAudio.startEngine();
          if (G.viewRainfall() > 0.01) GameAudio.startRain();
        }
      }
      syncAudioPanel();
    }
    els.soundbtn.onclick = () => {
      const c = GameAudio.context ? GameAudio.context() : null;
      // A context that has not yet run (or only started in this very press) has made no sound:
      // SOUND ON was not true yet, so this press unlocks audio instead of muting it.
      if (G.soundOn && !(c && c.state === "running" && c.currentTime > 0.3)) { setSound(true, true); return; }
      setSound(!G.soundOn, true);
    };

    let radioOn = store.get("radioVoice", false);
    let radioVol = store.get("volRadio", 0.8);
    const FOCUS_VALUES = [[0, "STANDARD"], [4, "4 dB"], [8, "8 dB"], [12, "12 dB"]];
    const focusNow = () => {
      const value = !GameAudio._stub && GameAudio.getRadioFocusDb ? GameAudio.getRadioFocusDb() : store.get("radioFocusDb", 0);
      return [0, 4, 8, 12].indexOf(value) >= 0 ? value : 0;
    };
    function restoreFocus() {
      if (GameAudio.setRadioFocusDb) GameAudio.setRadioFocusDb(store.get("radioFocusDb", 0));
    }
    const annOn = () => !!(G.announcer && G.announcer.enabled && G.announcer.enabled());
    const CHAT_VALUES = [["off", "OFF"], ["key", "KEY CALLS"], ["normal", "NORMAL"], ["chatty", "CHATTY"]];
    const COMM_VALUES = [["off", "OFF"], ["tv", "TV CAMERAS"], ["on", "ALWAYS"]];
    const rr = () => { try { const r = G.raceRadio; return r && !r._stub ? r : null; } catch (e) { return null; } };
    const chatNow = () => (rr() ? rr().chat() : store.get("radioChat", "normal"));
    const commNow = () => (rr() ? rr().comm() : store.get("commentary", "tv"));
    const PACK_VALUES = [["rec", "RECORDED"], ["sys", "SYSTEM"]];
    const SLANG_VALUES = [["auto", "AUTO"], ["en", "ENGLISH"], ["es", "ESPAÑOL"], ["pt", "PORTUGUÊS"], ["it", "ITALIANO"], ["de", "DEUTSCH"], ["fr", "FRANÇAIS"], ["ja", "日本語"], ["nl", "NEDERLANDS"]];
    const slangNow = () => { const v = String(store.get("spokenLang", "auto")); return SLANG_VALUES.some((x) => x[0] === v) ? v : "auto"; };
    const packNow = () => ((G.radio && G.radio.pack ? G.radio.packOn() : store.get("radioPack", true) !== false) ? "rec" : "sys");
    const recordedFor = (ch) => ch === "announcer" && G.radio && G.radio.announcerPackOn ? G.radio.announcerPackOn() : packNow() === "rec";
    const spotNow = () => (store.get("spotter", false) !== false ? "on" : "off");

    const battlePreview = typeof BattleEarcon !== "undefined" ? BattleEarcon.create(GameAudio) : null;
    const battleButtons = [
      [$("as-battle-ahead-closing"), "ahead:closing"], [$("as-battle-ahead-opening"), "ahead:opening"],
      [$("as-battle-behind-closing"), "behind:closing"], [$("as-battle-behind-opening"), "behind:opening"],
    ];
    const battleNow = () => (rr() && rr().battleEarcon ? rr().battleEarcon() : !!store.get("battleEarcon", false));
    function stopBattlePreview() {
      if (battlePreview) battlePreview.stop();
      if (rr() && rr().stopBattleEarcon) rr().stopBattleEarcon();
    }
    function battleNote(text) { const n = $("as-battle-status"); if (n) n.textContent = text; }
    let voicePreview = null;
    function stopPanelPreviews() {
      stopBattlePreview();
      if (voicePreview) {
        const owned = voicePreview; voicePreview = null;
        owned.radio.stopPreviewIfGeneration(owned.generation);
      }
    }
    if (typeof SettingsNav !== "undefined" && SettingsNav.onLeave) SettingsNav.onLeave((id) => {
      if (id === "audio") stopPanelPreviews();
    });
    const battlePanel = $("audioset"), battleSettings = $("pmsettings");
    if (typeof MutationObserver === "function") {
      for (const el of [battlePanel, battleSettings]) if (el) {
        new MutationObserver(() => { if (el.hidden) stopPanelPreviews(); })
          .observe(el, { attributes: true, attributeFilter: ["hidden"] });
      }
    }
    if (battleSettings && battleSettings.addEventListener) {
      battleSettings.addEventListener("close", stopPanelPreviews);
      battleSettings.addEventListener("cancel", stopPanelPreviews);
    }
    function setRadio(b) {
      if (b && !G.soundOn) setSound(true, true);
      radioOn = b; store.set("radioVoice", b);
      if (G.radio) { G.radio.setEnabled(b); if (b) G.radio.unlock(); }
      syncAudioPanel();
    }

    function setMusic(b, fromGesture = true) {
      if (b && !G.soundOn && fromGesture) { setSound(true, true); }
      G.musicEnabled = b; store.set("music", b);
      GameAudio.setMusicEnabled(b);
      syncAudioPanel();
    }

    let musicVol = GameAudio.setMusicVolume(store.get("volMusic", 0.6));
    let sfxVol = GameAudio.setSfxVolume(store.get("volSfx", 0.2));
    let sfxOn = store.get("sfx", true);
    GameAudio.setSfxEnabled(sfxOn);
    let menuSfxOn = store.get("menuSfx", true) !== false;
    GameAudio.setUiEnabled(menuSfxOn);
    GameAudio.setRadioFx(store.get("radioFx", 1));
    if (GameAudio.setRadioPreset) GameAudio.setRadioPreset(store.get("radioPreset", "modern"));

    function setSfx(b) {
      if (b && !G.soundOn) { setSound(true, true); }
      sfxOn = b; store.set("sfx", b);
      GameAudio.setSfxEnabled(b);
      syncAudioPanel();
    }

    let musicSrc = store.get("musicSource", "all");

    function spotifyReady() {
      return typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse &&
        SpotifyMusic.status().state === "connected";
    }

    function setMusicSrc(v) {
      if (v === "spotify") {
        if (!spotifyReady()) { syncAudioPanel(); return; }
        musicSrc = "spotify";
        store.set("musicSource", musicSrc);
        SpotifyMusic.useAsMusic(true);
        syncAudioPanel();
        return;
      }
      if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.useAsMusic) SpotifyMusic.useAsMusic(false);
      const applied = GameAudio.setMusicSource(v);
      musicSrc = applied;
      store.set("musicSource", musicSrc);
      syncAudioPanel();
    }

    function paintAudioFolds() {
      const SRC_FOLD = { all: "ALL", builtin: "DEFAULT", user: "MY TRACKS", spotify: "SPOTIFY" };
      const activeSrc = (typeof SpotifyMusic !== "undefined" && SpotifyMusic.inUse && SpotifyMusic.inUse())
        ? "spotify" : ((typeof GameAudio !== "undefined" && GameAudio.musicSource)
          ? GameAudio.musicSource() : musicSrc);
      const bus = (on) => (!on ? ["off", "OFF"] : G.soundOn ? ["on", "ON"] : ["off", "MUTED"]);
      Dom.paintFold($("as-music-sum"), [
        ["k", "MUSIC"],
        bus(G.musicEnabled),
        ["val", SRC_FOLD[activeSrc] || "ALL"],
      ]);
      Dom.paintFold($("as-sound-sum"), [
        ["k", "SOUND"],
        bus(sfxOn),
      ]);
      const label = (list, v) => (list.find((r) => r[0] === v) || [, ""])[1];
      Dom.paintFold($("as-radio-sum"), [
        ["k", "TEAM RADIO"],
        bus(radioOn),
        ["val", label(CHAT_VALUES, chatNow())],
        [spotNow() === "on" ? "on" : "off", "SPOTTER " + (spotNow() === "on" ? "ON" : "OFF")],
      ]);
      Dom.paintFold($("as-ann-sum"), [
        ["k", "ANNOUNCER"],
        bus(annOn()),
        ["val", label(COMM_VALUES, commNow())],
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

    const SRC_VALUES = [["all", "ALL"], ["builtin", "DEFAULT"], ["user", "MY TRACKS"], ["spotify", "SPOTIFY"]];
    const ONOFF = [["on", "ON"], ["off", "OFF"]];
    const MASTER_HINT = "Master sound is off — MASTER SOUND ON, at the top of this page, turns it on.";
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
        setText(note, on === "spotify"
            ? "Spotify is driving the music. The controls above drive it too."
          : on === "user" ? "Playing your " + counts.user + " uploaded track" + (counts.user === 1 ? "" : "s") + " only."
          : on === "builtin" ? "Playing the " + counts.builtin + " shipped tracks only."
          : counts.user === 0
            ? "Playing the " + counts.builtin + " shipped tracks. Add your own under YOUR TRACKS to use MY TRACKS."
          : "Playing everything: " + counts.builtin + " shipped + " + counts.user + " of yours.");
      }
      paintAudioFolds();
    }

    function syncNowPlaying(pauseOnly = false) {
      const stalled = !!(G.musicEnabled && G.soundOn && GameAudio.musicStalled && GameAudio.musicStalled());
      const musicLive = G.musicEnabled && G.soundOn && !stalled;
      const nowText = musicLive ? (GameAudio.trackName() || "—")
        : stalled ? (typeof navigator !== "undefined" && navigator.onLine === false ? "Music needs a connection" : "Music could not load")
        : G.soundOn ? "Music off" : "Sound off";
      const SRC_LABEL = { all: "All music", builtin: "Default", user: "My tracks", spotify: "Spotify" };
      const srcText = musicLive ? (SRC_LABEL[srcOn()] || "") : G.soundOn ? "" : "Master sound is off — \u25b6 turns it on";
      for (const p of (pauseOnly ? ["pm"] : ["as", "pm"])) {
        const now = $(p + "-now"), src = $(p + "-now-src"), play = $(p + "-play");
        if (!now || !play) continue;
        setText(now, nowText);
        if (now.title !== nowText) now.title = nowText;
        setText(src, srcText);
        setText(play, musicLive ? "\u275a\u275a" : "\u25b6");
        setAttr(play, "aria-label", musicLive ? "Pause music" : G.soundOn ? "Play music" : "Turn sound on and play music");
        for (const id of [p + "-prev", p + "-skip"]) setDisabled($(id), !musicLive);
      }
      const pmCard = $("pm-now-card"), pm = $("pausemenu");
      const show = G.musicEnabled || !!(pmCard && pm && !pmCard.hidden && !pm.hidden);
      if (pmCard && pmCard.hidden === show) pmCard.hidden = !show;
    }

    function syncAudioPanel() {
      const musicLive = G.musicEnabled && G.soundOn;
      const sfxLive = sfxOn && G.soundOn;
      SettingRow.paint($("as-music"), G.musicEnabled ? "on" : "off", ONOFF);
      SettingRow.paint($("as-sound"), sfxOn ? "on" : "off", ONOFF);
      SettingRow.paint($("as-ui"), menuSfxOn ? "on" : "off", ONOFF);
      SettingRow.disable($("as-ui"), !sfxLive);
      setDisabled($("as-mvol"), !musicLive);
      setDisabled($("as-svol"), !sfxLive);
      $("as-mvol").closest(".tune-row").classList.toggle("tune-off", !musicLive);
      $("as-svol").closest(".tune-row").classList.toggle("tune-off", !sfxLive);
      $("as-mvol").value = String(Math.round(musicVol * 10));
      setText($("as-mvol-v"), String(Math.round(musicVol * 10)));
      $("as-svol").value = String(Math.round(sfxVol * 10));
      setText($("as-svol-v"), String(Math.round(sfxVol * 10)));
      const radioReady = !!(G.radio && G.radio.available());
      const radioLive = radioOn && G.soundOn && radioReady;
      SettingRow.paint($("as-radio"), radioOn ? "on" : "off", ONOFF);
      SettingRow.disable($("as-radio"), !radioReady);
      setDisabled($("as-rvol"), !G.soundOn);
      $("as-rvol").closest(".tune-row").classList.toggle("tune-off", !G.soundOn);
      $("as-rvol").value = String(Math.round(radioVol * 10));
      setText($("as-rvol-v"), String(Math.round(radioVol * 10)));
      const fx = GameAudio.radioFxLevel();
      setDisabled($("as-rfx"), !(sfxOn && G.soundOn));
      $("as-rfx").closest(".tune-row").classList.toggle("tune-off", !(sfxOn && G.soundOn));
      $("as-rfx").value = String(Math.round(fx * 10));
      setText($("as-rfx-v"), String(Math.round(fx * 10)));
      buildVoiceRows();
      const vh = $("as-voices");
      if (vh && vh.classList) vh.classList.toggle("tune-off", !(G.soundOn && radioReady));
      if (vh && typeof vh.querySelectorAll === "function") {
        for (const el of vh.querySelectorAll("select,input,button")) setDisabled(el, !(G.soundOn && radioReady) || (packNow() === "rec" && el.tagName === "INPUT"));
      }
      const rnote = $("as-radio-note");
      const dbg = (G.radio && G.radio.debug && G.radio.debug()) || null;
      const REASON = {
        off: "TEAM RADIO is off.",
        "master-off": "Master sound is off.",
        "no-api": "This browser has no speech synthesiser.",
        "not-racing": "Nothing is read aloud outside a race — that is on purpose.",
        empty: "That card had nothing speakable on it.",
        "too-long": "The last line was too long for the time its card was up.",
        "not-recorded": "That line has words no recorded voice has yet, so it stayed written.",
        "pack-loading": "The recorded voice was still downloading.",
      };
      if (rnote) {
        let note = !radioReady ? "This browser has no speech voices, so the radio stays written."
          : !G.soundOn ? MASTER_HINT
          : "Race control, your engineer and the coach read their messages aloud. The cards are unchanged.";
        if (radioLive && dbg) {
          if (dbg.asked > 0 && dbg.started === 0) {
            note = "This device accepted " + dbg.asked + " radio line" + (dbg.asked === 1 ? "" : "s") +
              " and played none. Tap TEAM RADIO off and on — that tap is what lets the voice start.";
          } else if (dbg.started > 0) {
            note = "Spoken " + dbg.started + " line" + (dbg.started === 1 ? "" : "s") + " so far. " + note;
          } else if (dbg.last && dbg.last.reason && dbg.last.reason !== "spoke" && REASON[dbg.last.reason]) {
            note = "Last card was not read aloud: " + REASON[dbg.last.reason];
          }
        }
        if (radioLive && dbg && dbg.synth && dbg.synth.slow > 0) {
          note += " This browser's speech engine held the game up (worst " + Math.round(dbg.synth.maxMs) +
            " ms). RADIO VOICE: RECORDED never uses it.";
        }
        setText(rnote, note);
      }
      const annReady = !!(G.announcer && G.announcer.available());
      const annLive = G.soundOn && annReady;
      SettingRow.paint($("as-ann"), annOn() ? "on" : "off", ONOFF);
      SettingRow.disable($("as-ann"), !annReady);
      const ah = $("as-ann-voice");
      if (ah && ah.classList) ah.classList.toggle("tune-off", !annLive);
      if (ah && typeof ah.querySelectorAll === "function") {
        for (const el of ah.querySelectorAll("select,input,button")) setDisabled(el, !annLive || (recordedFor("announcer") && el.tagName === "INPUT"));
      }
      SettingRow.paint($("as-chat"), chatNow(), CHAT_VALUES);
      SettingRow.paint($("as-comm"), commNow(), COMM_VALUES);
      SettingRow.paint($("as-rpack"), packNow(), PACK_VALUES);
      SettingRow.paint($("as-slang"), slangNow(), SLANG_VALUES);
      if (GameAudio.radioPresets) SettingRow.paint($("as-rpreset"), GameAudio.radioPreset(), GameAudio.radioPresets());
      SettingRow.paint($("as-spot"), spotNow(), ONOFF);
      SettingRow.paint($("as-focus"), focusNow(), FOCUS_VALUES);
      SettingRow.paint($("as-battle"), battleNow() ? "on" : "off", ONOFF);
      const battleStatus = $("as-battle-status");
      if (battleStatus && battleNow() && battleStatus.textContent === "Battle tones are off. RADIO CHECK gives the usual status.") {
        battleStatus.textContent = "Battle tones are on. Learn the four samples below; RADIO CHECK requests one on a quiet straight.";
      }
      for (const [button] of battleButtons) setDisabled(button, !battleNow() || !G.soundOn);
      const cnote = $("as-chat-note");
      if (cnote) {
        const c = chatNow();
        setText(cnote, c === "off" ? "The engineer only talks tyres and pit stops."
          : c === "key" ? "Flags, places won and lost, the last lap and the result — nothing else."
          : c === "chatty" ? "Everything: gaps every lap, pace, battery, who is closing and how fast."
          : "Places, gaps when a fight is on, laps to go, flags and the result. RADIO CHECK (see Controls) asks for the gaps.");
      }
      const anote = $("as-ann-note");
      setText(anote, !annReady ? "This browser has no speech voices, so the loading card stays written."
        : !G.soundOn ? MASTER_HINT
        : packNow() === "rec" ? "The introduction and race commentary use your recorded announcer. Unrecorded story details stay on the loading card."
        : "The introduction and race commentary use your system voice; network-only voices are used during the introduction. VOICE VOLUME sets the level.");
      SettingRow.paint($("as-master"), G.soundOn ? "on" : "off", ONOFF);
      syncNowPlaying();
      if (typeof MusicLib !== "undefined" && MusicLib.refresh) MusicLib.refresh();
      syncMusicSrcRow();
      syncTonePanel();
      paintAudioFolds();
    }

    $("pm-audio").addEventListener("click", () => { syncAudioPanel(); });
    function audioMotionReduced() {
      try {
        if (typeof window !== "undefined" && window.matchMedia &&
            window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
        const d = typeof document !== "undefined" && document.documentElement &&
          document.documentElement.dataset;
        return !!(d && d.motion === "reduce");
      } catch (e) { return false; }
    }
    function scrollOpenedAudioFold(det) {
      if (!det || !det.open) return;
      const behavior = audioMotionReduced() ? "auto" : "smooth";
      const opts = { block: "nearest", inline: "nearest", behavior };
      let target = null;
      for (let i = 0; i < det.children.length; i++) {
        const ch = det.children[i];
        if (ch && ch.tagName !== "SUMMARY") { target = ch; break; }
      }
      if (!target) {
        if (det.querySelector) target = det.querySelector("summary");
        if (!target) target = det;
      }
      if (target && target.scrollIntoView) target.scrollIntoView(opts);
      if (typeof ScrollFade !== "undefined" && ScrollFade.refresh) ScrollFade.refresh();
    }
    const audioInner = $("audioset-inner");
    if (audioInner && audioInner.addEventListener) {
      audioInner.addEventListener("toggle", (ev) => {
        const det = ev.target;
        if (!det || det.tagName !== "DETAILS" || !det.open) return;
        if (audioInner.contains && !audioInner.contains(det)) return;
        scrollOpenedAudioFold(det);
      });
    }
    if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.onChange) {
      SpotifyMusic.onChange(() => { if (!$("audioset").hidden) syncMusicSrcRow(); });
    }
    SettingRow.wire("as-src", { values: SRC_VALUES, read: srcOn,
      write: (v) => { setMusicSrc(v); if (G.soundOn) GameAudio.uiTick(); } });
    $("as-sp-open").onclick = () => {
      if (typeof SpotifyMusic !== "undefined" && SpotifyMusic.openPanel) SpotifyMusic.openPanel();
    };
    const masterHost = $("audioset-inner");
    if (masterHost && masterHost.insertBefore && SettingRow.build && typeof document !== "undefined" && document.createElement) {
      masterHost.insertBefore(SettingRow.build("as-master", "MASTER SOUND").row, masterHost.firstChild || null);
    }
    SettingRow.wire("as-master", { values: ONOFF, read: () => (G.soundOn ? "on" : "off"),
      write: (v) => { if (v === "on") { setSound(true, true); GameAudio.uiTick(); } else { GameAudio.uiTick(); setSound(false, true); } } });
    SettingRow.wire("as-music", { values: ONOFF, read: () => (G.musicEnabled ? "on" : "off"),
      write: (v) => { setMusic(v === "on"); if (G.soundOn) GameAudio.uiTick(); } });
    SettingRow.wire("as-radio", { values: ONOFF, read: () => (radioOn ? "on" : "off"),
      write: (v) => { if (v === "on") { setRadio(true); GameAudio.uiTick(); } else { GameAudio.uiTick(); setRadio(false); } } });
    SettingRow.wire("as-chat", { values: CHAT_VALUES, read: chatNow,
      write: (v) => { if (rr()) rr().setChat(v); else store.set("radioChat", v); GameAudio.uiTick(); syncAudioPanel(); } });
    const rpreset = $("as-rpreset");
    if (rpreset && rpreset.parentNode && !$("as-slang")) {
      const label = typeof I18n !== "undefined" ? I18n.t("settings.spokenLang", null, "SPOKEN LANGUAGE") : "SPOKEN LANGUAGE";
      const built = SettingRow.build("as-slang", label, SLANG_VALUES);
      built.label.setAttribute("data-i18n", "settings.spokenLang");
      rpreset.parentNode.insertBefore(built.row, rpreset.nextSibling);
    }
    SettingRow.wire("as-slang", { values: SLANG_VALUES, read: slangNow,
      write: (v) => { store.set("spokenLang", v); GameAudio.uiTick(); syncAudioPanel(); } });
    SettingRow.wire("as-rpack", { values: PACK_VALUES, read: packNow,
      write: (v) => { if (G.radio && G.radio.setPackOn) G.radio.setPackOn(v === "rec"); store.set("radioPack", v === "rec"); GameAudio.uiTick(); syncAudioPanel(); } });
    if (GameAudio.radioPresets) SettingRow.wire("as-rpreset", { values: GameAudio.radioPresets(), read: () => GameAudio.radioPreset(),
      write: (v) => { store.set("radioPreset", GameAudio.setRadioPreset(v)); syncAudioPanel(); preview("radio"); } });
    SettingRow.wire("as-spot", { values: ONOFF, read: spotNow,
      write: (v) => { if (rr()) rr().setSpotter(v === "on"); else store.set("spotter", v === "on"); GameAudio.uiTick(); syncAudioPanel(); } });
    SettingRow.wire("as-battle", { values: ONOFF, read: () => (battleNow() ? "on" : "off"),
      write: (v) => {
        const on = v === "on";
        stopBattlePreview();
        if (on && !G.soundOn) setSound(true, true);
        else if (on) GameAudio.init();
        if (rr() && rr().setBattleEarcon) rr().setBattleEarcon(on);
        else store.set("battleEarcon", on);
        if (on && battlePreview) battlePreview.prepare();
        battleNote(on ? "Use the four samples to learn the tones. RADIO CHECK requests one during a quiet straight." : "Battle tones are off. RADIO CHECK gives the usual status.");
        syncAudioPanel();
      } });
    for (const [button, key] of battleButtons) {
      if (button) button.onclick = () => {
        const watching = typeof RealRace !== "undefined" && RealRace.status && RealRace.status().watch;
        const p = G.player;
        const raceUnsafe = G.state === "race" && ((G.cautionLevel && G.cautionLevel() !== 0)
          || (p && ((p.brakeDemand || 0) > 0.15 || Math.abs(p.lateralAccel || 0) > (G.LAT_MAX || 30) * 0.5)));
        if (!battleNow() || !G.soundOn || !battlePreview || watching || raceUnsafe
            || (G.state !== "menu" && !G.paused)
            || (rr() && rr().trafficBusy && rr().trafficBusy())
            || (G.radio && G.radio.busy && G.radio.busy())
            || (G.announcer && G.announcer.speaking && G.announcer.speaking())
            || (GameAudio.radioVoicesLive && GameAudio.radioVoicesLive() > 0)) {
          battleNote("Samples wait until sound is on and the radio is quiet, in a menu or pause."); return;
        }
        GameAudio.init();
        if (!battlePreview.ready()) {
          battlePreview.prepare(); battleNote("Preparing the tones. Press the sample again in a moment."); return;
        }
        const volume = 0.3 * Math.max(0, Math.min(1, +store.get("volRadio", 0.8) || 0));
        if (battlePreview.play(key, volume)) battleNote(key.replace(":", " ") + ".");
        else battleNote("The sample could not play. Check sound and voice volume.");
      };
    }
    SettingRow.wire("as-focus", { values: FOCUS_VALUES, read: focusNow,
      write: (v) => {
        const db = +v, value = [0, 4, 8, 12].indexOf(db) >= 0 ? db : 0;
        store.set("radioFocusDb", value);
        if (GameAudio.setRadioFocusDb) GameAudio.setRadioFocusDb(value);
        syncAudioPanel();
      } });
    SettingRow.wire("as-comm", { values: COMM_VALUES, read: commNow,
      write: (v) => { if (rr()) rr().setComm(v); else store.set("commentary", v); GameAudio.uiTick(); syncAudioPanel(); } });
    SettingRow.wire("as-ann", { values: ONOFF, read: () => (annOn() ? "on" : "off"),
      write: (v) => {
        const want = v === "on";
        if (want && !G.soundOn) setSound(true, true);
        if (G.announcer && G.announcer.setEnabled) G.announcer.setEnabled(want);
        GameAudio.uiTick();
        syncAudioPanel();
      } });
    const VOICE_CHANNELS = [
      ["control", "RACE CONTROL", "Penalties, warnings and flags. Any of the six recorded voices."],
      ["coach", "COACH", "Practice drills and driving advice, through a clean headset. Any of the six recorded voices."],
      ["radio", "TEAM RADIO", "Your engineer and spotter share this voice — any of the six recorded voices. TEST plays a race call."],
    ];
    const ANN_CHANNEL = ["announcer", "ANNOUNCER",
      "A recorded voice — any of the six — introduces the circuit and commentates during the race. A system voice changes the pre-race welcome; race commentary follows RADIO VOICE. TEST plays the welcome."];
    let voiceRowsFor = null;

    function voiceRow(ch, label, blurb) {
      const wrap = document.createElement("div");
      wrap.className = "as-voice";
      const list = (G.radio && G.radio.voiceList && G.radio.voiceList(ch)) || [];
      const tune = (G.radio && G.radio.tuneFor && G.radio.tuneFor(ch)) || { pitch: 1, rate: 1, name: "" };

      const head = document.createElement("div");
      head.className = "set-row";
      const name = document.createElement("span");
      name.className = "tune-label"; name.id = "as-v-" + ch + "-label"; name.textContent = label;
      const sel = document.createElement("select");
      sel.id = "as-v-" + ch;
      sel.setAttribute("aria-labelledby", name.id);
      const auto = document.createElement("option");
      auto.value = ""; auto.textContent = list.length ? "DEFAULT" : "SYSTEM DEFAULT";
      const recorded = (G.radio && G.radio.recordedVoices) ? G.radio.recordedVoices(ch) : [];
      const recGroup = document.createElement("optgroup"); recGroup.label = "RECORDED";
      for (const v of recorded) {
        const o = document.createElement("option"); o.value = "recorded:" + v.id; o.textContent = v.name;
        recGroup.appendChild(o);
      }
      if (recorded.length) sel.appendChild(recGroup);
      const sysGroup = document.createElement("optgroup"); sysGroup.label = "SYSTEM";
      sysGroup.appendChild(auto); sel.appendChild(sysGroup);
      for (const v of list) {
        const o = document.createElement("option");
        o.value = v.name; o.textContent = v.name;
        sysGroup.appendChild(o);
      }
      sel.value = recordedFor(ch) && recorded.length ? "recorded:" + G.radio.recordedVoice(ch)
        : list.some((v) => v.name === tune.name) ? tune.name : "";
      sel.onchange = () => {
        if (sel.value.startsWith("recorded:")) { G.radio.setRecordedVoice(ch, sel.value.slice(9)); syncAudioPanel(); }
        else setTune(ch, { name: sel.value });
        preview(ch);
      };
      const test = document.createElement("button");
      test.type = "button"; test.className = "cz-liv-none"; test.id = "as-v-" + ch + "-test";
      test.textContent = "TEST";
      test.setAttribute("aria-label", "Hear " + label);
      test.onclick = () => preview(ch);
      const box = document.createElement("div");
      box.append(sel);
      head.append(name, box);
      const testRow = document.createElement("div");
      testRow.className = "set-row";
      testRow.appendChild(test);

      wrap.append(head, slider(ch, "pitch", "PITCH", tune.pitch, RadioVoice.PITCH_MIN, RadioVoice.PITCH_MAX),
                  slider(ch, "rate", "RATE", tune.rate, RadioVoice.RATE_MIN, RadioVoice.RATE_MAX), testRow);
      const note = document.createElement("p");
      note.className = "as-note"; note.textContent = blurb;
      wrap.appendChild(note);
      return wrap;
    }

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
      inp.onchange = () => preview(ch);
      row.append(cap, inp);
      return row;
    }

    const setTune = (ch, patch) => {
      if (G.radio && G.radio.setTune) G.radio.setTune(ch, patch);
      if (ch !== "announcer" && G.radio && G.radio.setPackOn) G.radio.setPackOn(false);
      syncAudioPanel();
    };
    const preview = (ch) => {
      if (ch === "announcer" && !recordedFor(ch)) { if (G.announcer && G.announcer.sample) G.announcer.sample(); return; }
      const radio = G.radio;
      if (radio && radio.preview && radio.preview(ch) && radio.previewGeneration && radio.stopPreviewIfGeneration)
        voicePreview = { radio, generation: radio.previewGeneration() };
    };

    function rememberVoiceFocus(host) {
      const index = host.querySelectorAll ? Array.from(host.querySelectorAll("select,input,button")).indexOf(document.activeElement) : -1;
      return () => {
        const control = index >= 0 && host.querySelectorAll("select,input,button")[index];
        if (control && control.focus) control.focus({ preventScroll: true });
      };
    }

    function buildVoiceRows() {
      buildAnnVoiceRow();
      const host = $("as-voices");
      if (!host || typeof host.appendChild !== "function" || !host.children) return;
      if (typeof RadioVoice === "undefined" || typeof document === "undefined"
          || typeof document.createElement !== "function") return;
      const n = (G.radio && G.radio.voiceList && G.radio.voiceList().length) || 0;
      const key = JSON.stringify([G.radio && G.radio.voiceList ? G.radio.voiceList() : [], packNow(),
        VOICE_CHANNELS.map(([ch]) => G.radio && G.radio.recordedVoice ? G.radio.recordedVoice(ch) : "")]);
      if (voiceRowsFor === key && host.children.length > 1) return;
      const restoreFocus = rememberVoiceFocus(host);
      voiceRowsFor = key;
      while (host.children.length > 1) host.removeChild(host.lastChild);
      for (const [ch, label, blurb] of VOICE_CHANNELS) host.appendChild(voiceRow(ch, label, blurb));
      restoreFocus();
      const note = $("as-voices-note");
      if (note) {
        note.textContent = packNow() === "rec" ? "Recorded voices are generated speech. Common calls play as complete recordings. Choosing a system race voice switches race channels to SYSTEM; pitch and rate apply there."
          : n + " system voices available. Choosing a recorded race voice returns race channels to RECORDED. The pre-race announcer has its own voice choice.";
      }
    }

    let annRowFor = null;
    function buildAnnVoiceRow() {
      const host = $("as-ann-voice");
      if (!host || typeof host.appendChild !== "function" || !host.children) return;
      if (typeof RadioVoice === "undefined" || typeof document === "undefined"
          || typeof document.createElement !== "function") return;
      const key = JSON.stringify([G.radio && G.radio.voiceList ? G.radio.voiceList(ANN_CHANNEL[0]) : [], recordedFor("announcer"),
        G.radio && G.radio.recordedVoice ? G.radio.recordedVoice("announcer") : ""]);
      if (annRowFor === key && host.children.length > 1) return;
      const restoreFocus = rememberVoiceFocus(host);
      annRowFor = key;
      while (host.children.length > 1) host.removeChild(host.lastChild);
      host.appendChild(voiceRow.apply(null, ANN_CHANNEL));
      restoreFocus();
    }

    $("as-rfx").oninput = (e) => {
      const lvl = GameAudio.setRadioFx((+e.target.value || 0) / 10);
      store.set("radioFx", lvl);
      $("as-rfx-v").textContent = String(Math.round(lvl * 10));
    };
    $("as-rvol").oninput = (e) => {
      radioVol = G.radio ? G.radio.setVolume((+e.target.value || 0) / 10) : (+e.target.value || 0) / 10;
      store.set("volRadio", radioVol);
      setText($("as-rvol-v"), String(Math.round(radioVol * 10)));
    };
    SettingRow.wire("as-sound", { values: ONOFF, read: () => (sfxOn ? "on" : "off"),
      write: (v) => { if (v === "on") { setSfx(true); GameAudio.uiTick(); } else { GameAudio.uiTick(); setSfx(false); } } });
    SettingRow.wire("as-ui", { values: ONOFF, read: () => (menuSfxOn ? "on" : "off"),
      write: (v) => {
        menuSfxOn = v === "on"; store.set("menuSfx", menuSfxOn);
        GameAudio.setUiEnabled(menuSfxOn);
        if (menuSfxOn) GameAudio.uiTick();
        syncAudioPanel();
      } });
    $("as-mvol").oninput = (e) => {
      musicVol = GameAudio.setMusicVolume((+e.target.value || 0) / 10);
      store.set("volMusic", musicVol);
      setText($("as-mvol-v"), String(Math.round(musicVol * 10)));
    };
    $("as-svol").oninput = (e) => {
      sfxVol = GameAudio.setSfxVolume((+e.target.value || 0) / 10);
      store.set("volSfx", sfxVol);
      setText($("as-svol-v"), String(Math.round(sfxVol * 10)));
    };
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
      { k: "boost",      id: "as-t-boost",  lo: 0,    step: 0.04 },
      { k: "boostPitch", id: "as-t-boostlift", lo: 0, step: 0.25 },
      { k: "whine",      id: "as-t-whine",  lo: 0,    step: 0.02 },
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
    const PROFILE_VALUES = [["team", "TEAM"], ["broadcast", "BROADCAST"], ["trackside", "TRACKSIDE"],
      ["cockpit", "COCKPIT"], ["v10", "V10"], ["custom", "CUSTOM", true]];
    const PROFILE_NOTE = {
      team: "Follows your team's engine — the default sound.",
      broadcast: "Bright and forward, with the turbo up and the idle clean. The TV mix.",
      trackside: "Darker, further away, lumpier at idle, more air, tyre and brake.",
      cockpit: "Heavy and muffled, with the rev limiter, brakes and gearbox loud. From inside the car.",
      v10: "Low lazy idle, then a late climb to a scream. Hard fast limiter, no turbo, no hybrid.",
    };
    const toneProfile = () => GameAudio.profile();

    function toneSlider(t) { return $(t.id); }

    function applyStoredTone() {
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
        setValue(el, String(Math.round((tune[t.k] - t.lo) / t.step)));
        setText($(t.id + "-v"), String(Math.round(tune[t.k] * 100)));
      }
      const layers = GameAudio.layers();
      for (const l of TONE_LAYERS) {
        const b = $(l.id);
        if (!b) continue;
        b.classList.toggle("active", !!layers[l.k]);
        setAttr(b, "aria-pressed", layers[l.k] ? "true" : "false");
      }
      SettingRow.paint($("as-p"), toneProfile(), PROFILE_VALUES);
      const note = $("as-p-note");
      setText(note, toneProfile() === "custom"
        ? "Your own tune. RESET returns to your team's engine sound."
        : (PROFILE_NOTE[toneProfile()] || ""));
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
      el.oninput = () => {
        GameAudio.setTune({ [t.k]: t.lo + (+el.value || 0) * t.step });
        setText($(t.id + "-v"), String(Math.round(GameAudio.tune()[t.k] * 100)));
        syncTonePanel();
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
      syncAudioPanel();
      if (G.soundOn) GameAudio.uiTick();
    }
    for (const p of ["as", "pm"]) {
      const skip = $(p + "-skip"), prev = $(p + "-prev"), play = $(p + "-play");
      if (skip) skip.onclick = () => audioTransport(() => GameAudio.skipTrack());
      if (prev) prev.onclick = () => audioTransport(() => GameAudio.prevTrack());
      if (play) play.onclick = () => { setMusic(!(G.musicEnabled && G.soundOn)); if (G.soundOn) GameAudio.uiTick(); };
    }
    const pauseMenu = $("pausemenu");
    if (pauseMenu && typeof MutationObserver !== "undefined" && typeof setInterval === "function") {
      let tick = 0;
      const follow = () => {
        if (pauseMenu.hidden) { if (tick) { clearInterval(tick); tick = 0; } syncNowPlaying(true); return; }
        syncNowPlaying(true);
        if (!tick) tick = setInterval(() => syncNowPlaying(true), 1000);
      };
      new MutationObserver(follow).observe(pauseMenu, { attributes: true, attributeFilter: ["hidden"] });
    }

    function init() {
      Log.info("audio", "AudioPanel.init sound=" + !!G.soundOn);
      applyStoredTone();
      restoreFocus();
      setMusic(G.musicEnabled, false);
      setSound(G.soundOn, false);
      if (musicSrc === "spotify" && !spotifyReady()) musicSrc = GameAudio.musicSource();
      const applySrc = () => {
        if (musicSrc && musicSrc !== "spotify") musicSrc = GameAudio.setMusicSource(musicSrc);
        syncMusicSrcRow();
      };
      if (typeof MusicLib !== "undefined" && MusicLib.init) MusicLib.init().then(applySrc, applySrc);
      else applySrc();
    }

    return { init };
  }
  return { create };
})();
