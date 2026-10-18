/* Apex 26 — AnnounceBanner: the race-radio card, its floor and its queue.
   Moved out of game.js (#1654). showAnnounce / announce / the drain keep
   their statement order; game.js keeps a hoisted announce() wrapper. */
const AnnounceBanner = (function () {
  "use strict";

  const ANN_PRI = { comm: 1, coach: 1, practice: 2, info: 2, warning: 3, "penalty-warn": 4, box: 4, race: 4, "penalty-hit": 5 };   // penalty-warn over warning: a 5 s give-back window must not wait out the SC call
  // THE FLOOR. Every card gets ANN_MIN_S on screen, whatever its caller asked for
  // and whatever arrives next. Callers passed durations from 1.4 s up, and 1.4 s
  // is not a message — it is a flash you notice after it has gone. The floor is
  // enforced at BOTH ends, which is the half easy to miss: showAnnounce lengthens
  // a short card, and announce() below refuses to let even a HIGHER priority evict
  // a card still inside its floor. A penalty therefore waits behind a wear report
  // instead of blinking it away — bounded by the longest duration any caller
  // passes, and a penalty the (deps.player()) could not read is worth less than one that
  // arrives a beat late.
  const ANN_MIN_S = 3;
  // THE QUEUE, which _annQueue now IS rather than holds. One slot meant a THIRD
  // message in a burst was dropped, and so was a second of EQUAL priority — a lap
  // crossing that set a record and earned a medal showed one of them and silently
  // ate the other. Two slots, highest priority first and arrival breaking ties,
  // so a burst plays out in the order it mattered. Two and not more on purpose:
  // under the floor above a third would arrive six seconds after the thing it
  // describes, by which time it is a lie, not a message.
  const ANN_QUEUE_MAX = 2;
  // …and when a burst of warnings or penalties queues ahead of them anyway (the
  // +3 depth below), an INFO-or-lower card that has waited ANN_STALE_MS is dropped
  // at the drain rather than read out as a lie ("UP TO P5" after losing it).
  // Warnings, box calls and penalties always play.
  const ANN_STALE_MS = 8000;
  // THE RADIO. A banner is a radio message: the WHO line names the channel it
  // came in on — race control for a penalty or a warning, the coach for a tip,
  // otherwise the driver's own pit-wall channel under their name — the words sit
  // under it in quotes, and the car NUMBER sits on the plate beside both
  // (css/hud.css #announce-num), the way a broadcast captions team radio, not as
  // dim micro type at the end of the WHO line. Every channel here is
  // addressed TO the (deps.player()), so the one number serves all three.

  function create(deps) {
    let announceT = 0, _annPri = 0, _annFloor = 0;
    const _annQueue = [];
    function radioWho(kind) {
      const label = { control: "RACE CONTROL", coach: "COACH", announcer: "COMMENTARY" }[RadioVoice.SPEAKERS[kind]];
      if (label) return label;
      const p = (deps.player());
      const who = p && p.name ? String(p.name).split(" ").pop().toUpperCase() : (p && p.code) || "";
      return (who ? who + " · " : "") + "RADIO";
    }
    const radioNum = () => ((deps.player()) && (deps.player()).num != null ? String((deps.player()).num) : "");
    function showAnnounce(msg, dur, kind, quiet) {
      kind = kind || "race";
      _annPri = ANN_PRI[kind] || 2;
      (deps.els()).announceText.textContent = msg;
      (deps.els()).announceWho.textContent = radioWho(kind);
      (deps.els()).announceNum.textContent = radioNum();   // "" collapses the plate to a 3px stripe
      if (kind === "comm") (deps.els()).announceNum.textContent = "";   // the broadcaster is not talking to the (deps.player())'s car
      (deps.els()).announce.className = "";
      if (kind && kind !== "race") (deps.els()).announce.dataset.kind = kind;
      else delete (deps.els()).announce.dataset.kind;
      (deps.els()).announce.hidden = false;
      if ((deps.history())) (deps.history()).delivered(msg, { kind, who: (deps.els()).announceWho.textContent, quiet });
      // SCREEN READERS hear the card through #announce-live, an always-present polite
      // region (a region filled while hidden and unhidden in one step is missed by NVDA,
      // JAWS, VoiceOver: tetralogical.com/blog/2024/05/01). LiveRegion (js/ui/live-region.js)
      // is its ONE writer — it owns the clear-then-write beat, so a repeated line is still
      // a change and a flag or HUD line in the same tick cannot overwrite this; a QUIET
      // card (the caller's flag) is never spoken. game.js never times its own write
      // (hud-readouts.test.mjs pins that): without the module, a plain set.
      const said = (deps.els()).announceWho.textContent + ": " + msg;
      if (!quiet) {
        if (typeof LiveRegion !== "undefined") LiveRegion.say(said, kind);
        else if ((deps.els()).announceLive) (deps.els()).announceLive.textContent = said;
      }
      // A card of small type takes a beat longer to read than a billboard did, and
      // ANN_MIN_S is the floor under every caller's number — the shortest asked for
      // was 1.4 s, which nobody reads at racing speed.
      announceT = Math.max(ANN_MIN_S, (dur || 1.6) + 0.5);
      _annFloor = ANN_MIN_S;
      // THE ONLY PLACE THE RADIO SPEAKS. showAnnounce is the one place a line
      // reaches the screen, so hooking it inherits the whole ANN_PRI / _annQueue
      // policy for free: a line the cinematic camera dropped never arrives here and
      // is never spoken, a queued line is spoken when its turn comes, and a preempt
      // interrupts. There is no second priority table anywhere in the voice.
      // announceT — the card's ACTUAL life, not a second copy of the expression
      // above — is the utterance's whole budget.
      const _annCh = RadioVoice.SPEAKERS[kind] || "radio";
      const _annLead = (deps.state()) === "race" || (deps.state()) === "count" ? GameAudio.radioLeadS(_annCh) : 0;
      if (quiet) return;   // a refresh of the card already up: no second voice, squelch or screen-reader line
      (deps.radioVoice()).say(msg, announceT, kind, _annLead);
      // ...and the RADIO around it — click, hiss, squelch (engine.js radioSting).
      // On the CARD, not the utterance: the spoken radio ships off, and here it
      // inherits this function's ANN_PRI queue instead of needing a second one.
      // Gated on the session for the same reason plan() is: showAnnounce also draws
      // menu cards, and a squelch under "SAVE CONFLICT" on the title screen claims
      // a radio that is not running.
      if ((deps.state()) === "race" || (deps.state()) === "count") GameAudio.radioSting(_annCh, announceT);
    }

    function announce(msg, dur, kind, still, quiet) {   // still(): false once a queued line is no longer true; quiet: card only
      kind = kind || "race";
      const pri = ANN_PRI[kind] || 2;
      if ((deps.hudProfile()) !== "broadcast") {
        const camId = (deps.camModes())[(deps.camMode())].id;
        if (camId === "heli" || camId === "side" || camId === "cinematic" || camId === "low" || camId === "overhead"
            || camId === "rival" || camId === "pitwall" || camId === "drone") {
          // The cinematic cameras drop the two quiet channels so a film shot is not
          // captioned. That is a LOOK choice, and it must not silence the engineer:
          // the engineer's REPORTS are "info", so before this returned a verdict a
          // (deps.player()) who pressed the camera button stopped hearing them for the rest
          // of the session — the call was consumed unseen and a wear step, once
          // advanced, never re-crosses. The PIT CALL is "box" and is not on this
          // list at all: a camera angle is a look, and a look must not cost a stop.
          if (kind === "info" || kind === "coach") return false;
        }
      }
      // `_annFloor > 0` is the other half of the floor: a card still inside its
      // three seconds is not evicted even by something that outranks it — the
      // arrival queues at the head instead and takes over when that floor runs out
      // (the drain in tickBody). Without this clause the floor would only be a promise to
      // callers, not to the (deps.player()), because the very next penalty would break it.
      if (announceT > 0 && (pri <= _annPri || _annFloor > 0)) {
        // Into the queue, highest priority first, arrival breaking ties. Taking a
        // slot means the line still gets its turn, so that counts as accepted;
        // being pushed off the end means it is gone and the caller must offer it
        // again (RaceEngineer does, on its next tick).
        // A slot once given is NEVER taken back: evicting an accepted line told its
        // caller "said" for words nobody heard (RaceEngineer spends the wear step,
        // race-radio its cooldowns and the told position). A full queue refuses a
        // newcomer that outranks nothing waiting; one that does (a warning behind
        // two reports) queues deeper instead of pushing an accepted line out.
        const low = _annQueue.length ? _annQueue[_annQueue.length - 1].pri : 0;
        const cap = pri > low ? ANN_QUEUE_MAX + 3 : ANN_QUEUE_MAX;
        // A full queue used to refuse the newcomer outright (race-radio counted
        // those as announce-refused and dropped the line). Shed the lowest-priority
        // waiting cards — comm and coach first — so engineer, box and warnings still
        // land. Only refuse when nothing waiting is weaker than the newcomer.
        while (_annQueue.length >= cap) {
          const tail = _annQueue[_annQueue.length - 1];
          if (!tail || tail.pri >= pri) return false;
          _annQueue.pop();
        }
        let at = _annQueue.length;
        while (at > 0 && _annQueue[at - 1].pri < pri) at--;
        _annQueue.splice(at, 0, { msg, dur, kind, pri, still, t: performance.now() });
        return true;
      }
      showAnnounce(msg, dur, kind, quiet);
      return true;
    }

    function tick(dt) {
      if (announceT > 0) {
        announceT -= dt;
        if (_annFloor > 0 && (_annFloor -= dt) <= 0 && _annQueue.length && _annQueue[0].pri > _annPri) announceT = 0;
        if (announceT <= 0) {
          const e = deps.els();
          e.announce.hidden = true;
          e.announce.className = "";
          delete e.announce.dataset.kind;
          _annPri = 0; _annFloor = 0;
          while (_annQueue.length) {
            const q = _annQueue.shift();
            if (q.still && !q.still()) continue;
            if (q.pri <= ANN_PRI.info && performance.now() - q.t > ANN_STALE_MS) continue;
            showAnnounce(q.msg, q.dur, q.kind); break;
          }
        }
      }
    }
    function clear() {
      announceT = 0; _annPri = 0; _annFloor = 0; _annQueue.length = 0;
      const e = deps.els();
      if (e && e.announce) e.announce.hidden = true;
    }
    return { announce, tick, clear, get t() { return announceT; } };
  }

  return { create };
})();
Object.freeze(AnnounceBanner);
