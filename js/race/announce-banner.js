const AnnounceBanner = (function () {
  "use strict";

  const ANN_PRI = { comm: 1, coach: 1, practice: 2, info: 2, warning: 3, "penalty-warn": 4, box: 4, race: 4, "penalty-hit": 5 };
  const ANN_MIN_S = 3;
  const ANN_QUEUE_MAX = 2;
  const ANN_STALE_MS = 8000;

  function create(deps) {
    let announceT = 0, _annPri = 0, _annFloor = 0;
    const _annQueue = [];
    function radioWho(kind) {
      if (typeof Captions !== "undefined" && Captions.radioWho) return Captions.radioWho(kind, deps.player());
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
      (deps.els()).announceNum.textContent = radioNum();
      if (kind === "comm") (deps.els()).announceNum.textContent = "";
      (deps.els()).announce.className = "";
      if (kind && kind !== "race") (deps.els()).announce.dataset.kind = kind;
      else delete (deps.els()).announce.dataset.kind;
      (deps.els()).announce.hidden = false;
      if ((deps.history())) (deps.history()).delivered(msg, { kind, who: (deps.els()).announceWho.textContent, quiet });
      if (typeof Captions !== "undefined" && Captions.onRadio) {
        Captions.onRadio({ who: (deps.els()).announceWho.textContent, text: msg, kind, quiet });
      }
      const said = (deps.els()).announceWho.textContent + ": " + msg;
      if (!quiet) {
        if (typeof LiveRegion !== "undefined") LiveRegion.say(said, kind);
        else if ((deps.els()).announceLive) (deps.els()).announceLive.textContent = said;
      }
      announceT = Math.max(ANN_MIN_S, (dur || 1.6) + 0.5);
      _annFloor = ANN_MIN_S;
      const _annCh = RadioVoice.SPEAKERS[kind] || "radio";
      const _annLead = (deps.state()) === "race" || (deps.state()) === "count" ? GameAudio.radioLeadS(_annCh) : 0;
      if (quiet) return;
      (deps.radioVoice()).say(msg, announceT, kind, _annLead);
      if ((deps.state()) === "race" || (deps.state()) === "count") GameAudio.radioSting(_annCh, announceT);
    }

    function announce(msg, dur, kind, still, quiet) {
      kind = kind || "race";
      const pri = ANN_PRI[kind] || 2;
      if ((deps.hudProfile()) !== "broadcast") {
        const camId = (deps.camModes())[(deps.camMode())].id;
        if (camId === "heli" || camId === "side" || camId === "cinematic" || camId === "low" || camId === "overhead"
            || camId === "rival" || camId === "pitwall" || camId === "drone") {
          if (kind === "info" || kind === "coach") return false;
        }
      }
      if (announceT > 0 && (pri <= _annPri || _annFloor > 0)) {
        const low = _annQueue.length ? _annQueue[_annQueue.length - 1].pri : 0;
        const cap = pri > low ? ANN_QUEUE_MAX + 3 : ANN_QUEUE_MAX;
        while (_annQueue.length >= cap) {
          const tail = _annQueue[_annQueue.length - 1];
          if (!tail || tail.pri >= pri) return false;
          _annQueue.pop();
        }
        let at = _annQueue.length;
        while (at > 0 && _annQueue[at - 1].pri < pri) at--;
        _annQueue.splice(at, 0, { msg, dur, kind, pri, still, age: 0 });
        return true;
      }
      showAnnounce(msg, dur, kind, quiet);
      return true;
    }

    function tick(dt) {
      for (let i = 0; i < _annQueue.length; i++) _annQueue[i].age += dt;
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
            if (q.pri <= ANN_PRI.info && q.age * 1000 > ANN_STALE_MS) continue;
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
