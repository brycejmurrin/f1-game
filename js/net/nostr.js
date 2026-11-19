"use strict";

const NetNostr = (function () {
  const JOIN_TIMEOUT_MS = 12000;
  const HOST_TIMEOUT_MS = 120000;
  const LISTEN_TIMEOUT_MS = 300000;
  const REPLY_TIMEOUT_MS = 20000;
  const RELAY_CHECK_MS = 6000;
  const REPOST_MS = 5000;
  const MAX_HANDSHAKE_CHARS = 512 * 1024;
  const MAX_CONTENT_CHARS = Math.ceil((MAX_HANDSHAKE_CHARS + 28) / 3) * 4;
  const MAX_FRAME_CHARS = MAX_CONTENT_CHARS + 8192;
  const MAX_SEEN = 64;
  const MAX_SEEN_CHARS = MAX_CONTENT_CHARS * 2;
  const MAX_HEARD_ACTIVE = 4;
  const OFFER_CREATED_SLACK_S = 300;
  const REANSWER_MAX = 3;
  const REANSWER_WINDOW_MS = 60000;
  const CLOCK_REFUSAL = /created_at|too (?:old|early|late|far)|in the future|expired|timestamp|clock/i;
  const CLOCK_MESSAGE = "This device's clock looks wrong, so the room service is refusing its messages."
    + " Set the date and time to automatic and try again, or use the invite link or QR,"
    + " which do not depend on the clock.";

  let modPromise = null;

  function load() {
    if (!modPromise) {
      modPromise = import("@trystero-p2p/nostr").catch((e) => {
        modPromise = null;
        throw e;
      });
    }
    return modPromise;
  }

  const available = () => typeof WebSocket !== "undefined";

  function nostrLog(r) {
    if (r && r.ok) Log.info("net", "nostr ok");
    else if (r && (r.error === "stopped" || r.error === "cancelled")) Log.info("net", "nostr " + r.error);
    else Log.warn("net", "nostr fail " + ((r && r.error) || "error"));
    return r;
  }


  const RELAYS = [
    "wss://relay.primal.net",
    "wss://nostr.mom",
    "wss://relay.snort.social",
    "wss://nostr-pub.wellorder.net",
    "wss://relay.damus.io",
    "wss://nostr.bitcoiner.social",
    "wss://nostr.oxtr.dev",
  ];

  function validRelay(u) {
    if (typeof u !== "string" || !u) return false;
    try {
      const p = new URL(u).protocol;
      return p === "ws:" || p === "wss:";
    } catch (e) { return false; }
  }

  function relayUrls() {
    try {
      const raw = localStorage.getItem("apex26.nostrRelays");
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          const good = list.filter(validRelay);
          if (good.length) return good;
        }
      }
    } catch (e) {  }
    return RELAYS;
  }

  function readRelayFrame(data) {
    if (typeof data !== "string" || data.length > MAX_FRAME_CHARS) {
      return { close: true, message: null };
    }
    try { return { close: false, message: JSON.parse(data) }; }
    catch (e) { return { close: false, message: null }; }
  }

  function createBoundedInbox(consume, minCreatedAt) {
    const seen = new Set();
    let seenChars = 0, active = 0, failed = 0;
    const remember = (content) => {
      seen.add(content);
      seenChars += content.length;
      while (seen.size > MAX_SEEN || seenChars > MAX_SEEN_CHARS) {
        const oldest = seen.values().next().value;
        if (oldest == null) break;
        seen.delete(oldest);
        seenChars -= oldest.length;
      }
    };
    const accept = (content, createdAt) => {
      if (typeof content !== "string" || !content || content.length > MAX_CONTENT_CHARS) return false;
      if (minCreatedAt != null && typeof createdAt === "number" && createdAt < minCreatedAt) return true;
      if (seen.has(content)) return true;
      if (active >= MAX_HEARD_ACTIVE) return "busy";
      remember(content);
      active++;
      Promise.resolve().then(() => consume(content, createdAt)).catch((e) => {
        if (failed++ === 0) Log.warn("net", "nostr relay message handler failed:", e && e.message);
      }).finally(() => { active--; });
      return true;
    };
    return { accept, stats: () => ({ seen: seen.size, seenChars, active }) };
  }

  async function directExchange(opts) {
    const { code, send, reply, token, onTick, mintOffer, onJoiner, onFail, listen, reanswer } = opts;
    Log.info("net", "nostr start");
    if (!available()) {
      return nostrLog({ ok: false, error: "unsupported",
               message: "This browser cannot reach the room service." });
    }
    let mod;
    try { mod = await load(); }
    catch (e) {
      const why = (e && (e.message || String(e))) || "unknown";
      return nostrLog({ ok: false, error: "no_module", detail: why,
               message: "Could not load the room service (" + why.slice(0, 90) + ")."
                      + " Use the invite link or QR instead." });
    }

    const hosting = !reply;
    const mineSlot = hosting ? "offer" : "answer";
    const theirSlot = hosting ? "answer" : "offer";
    let mineTopic, theirTopic;
    try {
      mineTopic  = await NetRendezvous.topic(code, mineSlot);
      theirTopic = await NetRendezvous.topic(code, theirSlot);
    } catch (e) {
      return nostrLog({ ok: false, error: "crypto",
               message: "This browser could not protect the room code. Use the invite link instead." });
    }

    const sockets = [];
    const socketUrl = new Map();
    let current = send || null;
    const rejectedBy = new Set();
    const pubIds = new Set();
    let subId = null;
    let advisedRejected = false;
    let clockRefused = false, advisedClock = false;

    return new Promise((resolve) => {
      let done = false, settled = false;
      const shut = () => {
        for (const w of sockets) { try { w.close(); } catch (e) {  } }
        sockets.length = 0;
        if (unlisten) { unlisten(); unlisten = null; }
      };
      const timers = [];
      const later = (fn, ms) => { const id = setTimeout(fn, ms); timers.push(id); return id; };
      let unlisten = null;
      let again = null;
      let expireTimer = null;
      const clearExpire = () => {
        if (expireTimer == null) return;
        clearTimeout(expireTimer);
        const i = timers.indexOf(expireTimer);
        if (i >= 0) timers.splice(i, 1);
        expireTimer = null;
      };
      const finish = (r) => {
        if (done) return;
        done = true;
        clearInterval(tick); clearInterval(repost); clearInterval(again);
        for (const id of timers) clearTimeout(id);
        timers.length = 0;
        expireTimer = null;
        shut();
        nostrLog(r);
        if (!settled) { settled = true; resolve(r); return; }
        if (onFail) { try { onFail(r); } catch (e) {  } }
      };

      const publish = async (text) => {
        if (!text) return;
        let frame;
        try {
          const sealed = await NetRendezvous.seal(code, text, mineSlot);
          frame = await mod.createEvent(mineTopic, NetBytes.bytesToB64(sealed));
          try {
            const parsed = JSON.parse(frame);
            if (parsed[1] && parsed[1].id) {
              pubIds.add(parsed[1].id);
              if (pubIds.size > 64) pubIds.delete(pubIds.values().next().value);
            }
          } catch (e) {  }
        } catch (e) { return; }
        for (const w of sockets) { if (w.readyState === 1) { try { w.send(frame); } catch (e) {  } } }
      };

      const heard = async (b64, createdAt) => {
        let text = null;
        try {
          text = await NetRendezvous.open(code, NetBytes.b64ToBytes(b64), theirSlot);
        } catch (e) { text = null; }
        if (!text || done) return;

        if (hosting) {
          if (onJoiner) {
            Promise.resolve().then(() => onJoiner(null, text))
              .catch((e) => { Log.warn("net", "nostr joiner answer handler failed:", e && e.message); });
            return;
          }
          finish({ ok: true, payload: text });
          return;
        }
        const at = typeof createdAt === "number" && Number.isFinite(createdAt) ? createdAt : -Infinity;
        if (answering) {
          if (!reanswer || replying || text === answeredText || !(at > answeredAt) || reanswers >= REANSWER_MAX) return;
          reanswers++;
          await answerOffer(text, at, true);
          return;
        }
        answering = true;
        await answerOffer(text, at, false);
      };
      const answerOffer = async (text, at, redo) => {
        answeredText = text; answeredAt = at;
        replying = true;
        let replyTimer = null;
        if (!redo) { clearExpire(); replyTimer = later(expire, REPLY_TIMEOUT_MS); }
        let out = null;
        try { out = await reply(text); } catch (e) { out = null; }
        replying = false;
        if (done) return;
        if (!out) {
          if (redo) return;
          answering = false;
          finish({ ok: false, error: "reply_failed", message: "Could not answer that invite." });
          return;
        }
        await publish(out);
        clearExpire();
        if (replyTimer != null) clearTimeout(replyTimer);
        let n = 0;
        clearInterval(again);
        const iv = again = setInterval(async () => {
          if (done || ++n > 3) { clearInterval(iv); return; }
          await publish(out);
        }, 1200);
        if (settled) return;
        if (settleTimer != null) clearTimeout(settleTimer);
        settleTimer = later(() => {
          clearInterval(iv);
          if (!reanswer) { finish({ ok: true, payload: text }); return; }
          settled = true;
          resolve(nostrLog({ ok: true, payload: text }));
          later(() => finish({ ok: false, error: "stopped", message: "" }), REANSWER_WINDOW_MS);
        }, 5200);
      };
      let answering = false, replying = false, answeredText = null, answeredAt = -Infinity;
      let reanswers = 0, settleTimer = null;
      const expire = () => finish({ ok: false, error: "expired",
        message: clockRefused ? CLOCK_MESSAGE
          : "Nobody answered that code. Check the letters, or ask "
               + "your friend for a fresh one — if it keeps happening, both "
               + "reload the game and try a new code." });
      const hostStartedAt = Math.floor(Date.now() / 1000);
      const inbox = createBoundedInbox(heard, hostStartedAt - OFFER_CREATED_SLACK_S);

      const tick = setInterval(() => {
        if (token && token.cancelled) finish({ ok: false, error: "cancelled", message: "" });
        else if (onTick && !answering) {
          try { onTick(); } catch (e) {  }
        }
      }, 1000);

      const repost = setInterval(() => { if (!done && current) publish(current); }, REPOST_MS);

      const windowMs = listen && !hosting ? LISTEN_TIMEOUT_MS : (hosting ? HOST_TIMEOUT_MS : JOIN_TIMEOUT_MS);
      const startedAt = Date.now(), deadlineAt = startedAt + windowMs;
      expireTimer = later(expire, windowMs);

      let opened = 0;
      const RECONNECT_MS = [1000, 2000, 4000, 8000, 15000];
      const connect = (url, attempt) => {
        if (done) return;
        let w;
        try { w = new WebSocket(url); } catch (e) { return; }
        sockets.push(w);
        socketUrl.set(w, url);
        let openAt = 0;
        w.onopen = () => {
          opened++;
          openAt = Date.now();
          if (!subId) subId = "s" + Math.floor(Date.now() % 1e6);
          try {
            const req = JSON.parse(mod.subscribe(subId, theirTopic));
            if (req[2]) delete req[2].since;
            w.send(JSON.stringify(req));
          } catch (e) {  }
          if (current) publish(current);
        };
        w.onclose = () => {
          const i = sockets.indexOf(w);
          if (i >= 0) sockets.splice(i, 1);
          socketUrl.delete(w);
          if (done) return;
          if (openAt && Date.now() - openAt >= 5000) attempt = 0;
          const n = Math.min(attempt, RECONNECT_MS.length - 1);
          later(() => { if (!done && !sockets.some((s) => socketUrl.get(s) === url)) connect(url, attempt + 1); }, RECONNECT_MS[n]);
        };
        w.onmessage = (ev) => {
          const frame = readRelayFrame(ev.data);
          if (frame.close) { try { w.close(); } catch (e) {  } return; }
          const m = frame.message;
          if (!Array.isArray(m)) return;
          if (m[0] === "OK" || m[0] === "CLOSED") {
            const who = socketUrl.get(w) || String(opened);
            const refused =
              (m[0] === "OK" && pubIds.has(m[1]) && m[2] === false && !/^duplicate:/i.test(String(m[3] || ""))) ||
              (m[0] === "CLOSED" && subId && m[1] === subId);
            if (refused) {
              rejectedBy.add(who);
              if (m[0] === "OK" && CLOCK_REFUSAL.test(String(m[3] || ""))) { clockRefused = true; adviseClock(); }
              maybeAdviseRejected();
            }
            return;
          }
          if (m[0] === "EVENT" && m[2] && typeof m[2].content === "string" &&
              inbox.accept(m[2].content, m[2].created_at) === false) {
            try { w.close(); } catch (e) {  }
          }
        };
        w.onerror = () => {};
      };
      for (const url of relayUrls()) connect(url, 0);
      const onVisible = () => {
        if (done || typeof document === "undefined" || document.hidden) return;
        for (const url of relayUrls()) if (!sockets.some((s) => socketUrl.get(s) === url)) connect(url, 0);
      };
      if (typeof document !== "undefined" && document.addEventListener) document.addEventListener("visibilitychange", onVisible);
      unlisten = () => { try { if (typeof document !== "undefined" && document.removeEventListener) document.removeEventListener("visibilitychange", onVisible); } catch (e) {  } };

      const maybeAdviseRejected = () => {
        if (done || advisedRejected || !onFail) return;
        const live = sockets.filter((w) => w.readyState === 1).length;
        if (!live || rejectedBy.size < live) return;
        advisedRejected = true;
        if (clockRefused) { adviseClock(); return; }
        try {
          onFail({ ok: false, error: "all_rejected", advisory: true,
            message: "Every room relay is refusing this code. It may still connect —"
                   + " if it does not, use the invite link or QR, which need no"
                   + " third party." });
        } catch (e) {  }
      };
      const adviseClock = () => {
        if (done || advisedClock || !onFail) return;
        advisedClock = true;
        try { onFail({ ok: false, error: "clock_skew", advisory: true, message: CLOCK_MESSAGE }); }
        catch (e) {  }
      };
      later(maybeAdviseRejected, RELAY_CHECK_MS);

      if (!current && mintOffer) {
        Promise.resolve(mintOffer(null)).then((o) => {
          if (!done && o) { current = o; publish(o); }
        }).catch((e) => { Log.warn("net", "nostr offer mint failed, room has nothing to publish:", e && e.message); });
      }

      later(() => {
        if (done) return;
        if (!sockets.some((w) => w.readyState === 1)) {
          finish({ ok: false, error: "no_relay",
            message: "Could not reach any room service — this network may be blocking it."
                   + " Use the invite link or QR instead." });
        }
      }, RELAY_CHECK_MS);

      if (onJoiner && !settled) {
        settled = true;
        nostrLog({ ok: true, subscribed: true });
        resolve({
          ok: true, subscribed: true, startedAt, deadlineAt,
          rotate: (next) => {
            current = next || null;
            if (!current && mintOffer) {
              return Promise.resolve(mintOffer(null)).then((o) => {
                if (!done && o) { current = o; return publish(o); }
              }).catch((e) => { Log.warn("net", "nostr offer re-mint on rotate failed:", e && e.message); });
            }
            return publish(current);
          },
          stop: () => finish({ ok: false, error: "stopped", message: "" }),
        });
      }
    });
  }

  return { JOIN_TIMEOUT_MS, HOST_TIMEOUT_MS, LISTEN_TIMEOUT_MS, available, directExchange,
    RELAYS, relayUrls,
    MAX_CONTENT_CHARS, MAX_FRAME_CHARS, MAX_SEEN, MAX_SEEN_CHARS, MAX_HEARD_ACTIVE, OFFER_CREATED_SLACK_S,
    REANSWER_MAX, CLOCK_REFUSAL,
    readRelayFrame, createBoundedInbox };
})();
Object.freeze(NetNostr);
