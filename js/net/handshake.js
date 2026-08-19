/* NetHandshake — getting two browsers connected with NO server of ours. WebRTC is peer-to-peer once connected, but every connection needs a signalling exchange fi… */
"use strict";

const NetHandshake = (function () {
  const MAGIC = "APEX1";          // format marker + version, kept human-visible
  const CORRUPT = { ok: false, error: "corrupt_code",
    message: "That code is incomplete or corrupted — copy the whole thing." };
  const NO_TRANSPORT = { ok: false, error: "no_transport",
    message: "WebRTC is unavailable in this browser." };
  const GATHER_TIMEOUT_MS = 8000; // stop waiting for stragglers; what we have is usually enough
  const MAX_CODE_CHARS = 512 * 1024;
  const MAX_DECODED_BYTES = 256 * 1024;

  function hsLog(action, res) {
    if (res && res.ok) {
      const n = res.code != null ? String(res.code).length : 0;
      Log.info("net", "handshake " + action + " ok" + (n ? " len=" + n : ""));
    } else {
      Log.warn("net", "handshake " + action + " fail " + ((res && res.error) || "error"));
    }
    return res;
  }

  function bytesToB64url(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function b64urlToBytes(str) {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "=".repeat((4 - (s.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  const enc = () => new TextEncoder();
  const dec = () => new TextDecoder();

  function canCompress() {
    return typeof CompressionStream !== "undefined" && typeof Response !== "undefined";
  }
  async function deflateBytes(bytes) {
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function inflateBytes(bytes) {
    const reader = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks = []; let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_DECODED_BYTES) { await reader.cancel(); throw new Error("inflate cap exceeded"); }
      chunks.push(value);
    }
    const out = new Uint8Array(total); let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.byteLength; }
    return out;
  }
  const deflate = (text) => deflateBytes(enc().encode(text));
  const inflate = async (bytes) => dec().decode(await inflateBytes(bytes));

  // PRESERVE THE SDP VERBATIM. An earlier version stripped "regenerable"
  // attributes (rtpmap, fmtp, extmap, ssrc, msid, rtcp-fb) to shorten the
  // paste. That was wrong twice over: every one of those is an AUDIO/VIDEO
  // attribute that never appears in a data-channel-only offer, so it removed
  // nothing — while the rejoin dropped the trailing line terminator, leaving
  // the last line (typically a=max-message-size) unterminated. Chrome then
  // refused the whole description with "Invalid SDP line", which is how this
  // was found: on a real connection, because no loopback test can reach it.
  //
  // Deflate already does the size work, so there is nothing to buy back here.
  // All this does now is normalise line endings to the CRLF the format
  // requires, and guarantee the terminator.
  function normaliseSdp(sdp) {
    const lines = String(sdp || "").split(/\r\n|\n|\r/).filter((l) => l.length);
    return lines.length ? lines.join("\r\n") + "\r\n" : "";
  }

  async function encodeCode(payload) {
    if (canCompress()) {
      try {
        const packed = payload.s ? await NetSdp.packChecked(payload.s) : null;
        if (packed) {
          const rest = enc().encode(JSON.stringify(Object.assign({}, payload, { s: undefined })));
          const joined = new Uint8Array(2 + packed.length + rest.length);
          joined[0] = packed.length >> 8; joined[1] = packed.length & 0xff;
          joined.set(packed, 2); joined.set(rest, 2 + packed.length);
          return MAGIC + ".s." + bytesToB64url(await deflateBytes(joined));
        }
      } catch (e) { /* any trouble at all: fall through to the whole-text path */ }
      try { return MAGIC + ".z." + bytesToB64url(await deflate(JSON.stringify(payload))); }
      catch (e) { /* fall through to plain */ }
    }
    return MAGIC + ".p." + bytesToB64url(enc().encode(JSON.stringify(payload)));
  }
  async function decodeCode(code) {
    const input = String(code || "");
    if (input.length > MAX_CODE_CHARS) return CORRUPT;
    const trimmed = input.trim().replace(/\s+/g, "");
    if (trimmed.length > MAX_CODE_CHARS) return CORRUPT;
    const parts = trimmed.split(".");
    if (parts.length !== 3 || parts[0] !== MAGIC) {
      return { ok: false, error: "bad_code", message: "That does not look like an Apex invite code." };
    }
    const [, mode, body] = parts;
    if (mode !== "s" && mode !== "z" && mode !== "p") return CORRUPT;
    try {
      const bytes = b64urlToBytes(body);
      if (mode === "s") {
        const raw = await inflateBytes(bytes);
        const n = (raw[0] << 8) | raw[1];
        const sdp = NetSdp.unpack(raw.slice(2, 2 + n));
        if (!sdp) return CORRUPT;
        const payload = JSON.parse(dec().decode(raw.slice(2 + n)));
        payload.s = sdp;
        return { ok: true, payload };
      }
      if (mode === "p" && bytes.byteLength > MAX_DECODED_BYTES) return CORRUPT;
      const json = mode === "z" ? await inflate(bytes) : dec().decode(bytes);
      const payload = JSON.parse(json);
      if (!payload || typeof payload !== "object") return CORRUPT;
      return { ok: true, payload };
    } catch (e) {
      return CORRUPT;   // decode, inflate and parse all mean the same to a player
    }
  }

  function waitForIce(pc, timeoutMs) {
    if (pc.iceGatheringState === "complete") return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (complete) => {
        if (done) return;
        done = true;
        pc.removeEventListener("icegatheringstatechange", onChange);
        clearTimeout(timer);
        resolve(complete);
      };
      const onChange = () => { if (pc.iceGatheringState === "complete") finish(true); };
      pc.addEventListener("icegatheringstatechange", onChange);
      const timer = setTimeout(() => finish(false), timeoutMs || GATHER_TIMEOUT_MS);
    });
  }

  let _buildCache = null;
  async function localBuild() {
    if (_buildCache != null) return _buildCache;
    try {
      const r = await fetch("version.json?_=" + Date.now(), { cache: "no-store" });
      const v = await r.json();
      _buildCache = (v && v.build != null) ? v.build : null;
    } catch (e) {
      // UNKNOWN, not 0 — and deliberately NOT memoised. Writing 0 here made two
      // peers who had both failed the fetch compare equal, waving mismatched
      // builds straight through the only guard that stops them racing; and
      // memoising it meant the "reload the page to update" advice below could
      // never come true, because the reload hits the same dead fetch and the
      // tab is stuck on 0 for its lifetime. Returning without caching lets a
      // later attempt succeed.
      try {
        Log.warn("net", "version.json unreadable (" + ((e && e.message) || e) +
                        ") — build identity unknown, refusing to pair");
      } catch (_) {}
      return null;
    }
    return _buildCache;
  }

  // Peers must agree on the build. Everything physics-relevant — the spline,
  // the barrier positions, the tuning constants — ships inside it.
  function checkBuild(mine, theirs) {
    if (mine == null || theirs == null) {
      return {
        ok: false,
        error: "build_unknown",
        message: "Could not confirm you are both on the same version. " +
                 "Check your connection and try again.",
        mine: mine == null ? null : mine,
        theirs: theirs == null ? null : theirs,
      };
    }
    if (mine === theirs) return { ok: true };
    return {
      ok: false,
      error: "build_mismatch",
      message: theirs > mine
        ? "Your friend is on a newer version. Reload the page to update, then try again."
        : "Your friend is on an older version. Ask them to reload the page, then try again.",
      mine, theirs,
    };
  }

  // host: createInvite() -> code, give it away, then acceptAnswer(theirCode).
  // guest: acceptInvite(theirCode) -> code, send it back, done.
  //
  // `profile` is whatever the lobby needs to build the rival's car: team,
  // driver, livery, and the parts SETUP IDS. Ids, never resolved multipliers —
  // a peer declaring `{cornering: 9}` should be impossible, not merely rude.
  // Gather fully, then emit. Shared by both halves so the two can never drift.
  async function makeCode(pc, kind, profile, opts) {
    await waitForIce(pc, opts && opts.gatherTimeoutMs);
    return encodeCode({
      b: await localBuild(), k: kind,
      p: profile || null,
      s: normaliseSdp(pc.localDescription.sdp),
    });
  }

  async function createInvite(transport, profile, opts) {
    const pc = transport && transport.pc;
    if (!pc) return hsLog("invite", NO_TRANSPORT);
    try {
      await pc.setLocalDescription(await pc.createOffer());
      const code = await makeCode(pc, "offer", profile, opts);
      return hsLog("invite", { ok: true, code, url: inviteUrl(code) });
    } catch (e) {
      Log.warn("net", "handshake invite fail");
      throw e;
    }
  }

  async function setRemote(pc, type, sdp) {
    if (typeof sdp !== "string" || !sdp) return false;
    try {
      await pc.setRemoteDescription({ type, sdp });
      return true;
    } catch (e) { return false; }
  }

  async function acceptInvite(transport, code, profile, opts) {
    const parsed = await decodeCode(code);
    if (!parsed.ok) return hsLog("accept", parsed);
    if (parsed.payload.k !== "offer") {
      return hsLog("accept", { ok: false, error: "wrong_code_kind", message: "That is an answer code, not an invite code." });
    }
    const build = checkBuild(await localBuild(), parsed.payload.b);
    if (!build.ok) return hsLog("accept", build);
    const pc = transport && transport.pc;
    if (!pc) return hsLog("accept", NO_TRANSPORT);

    const took = await setRemote(pc, "offer", parsed.payload.s);
    if (!took) return hsLog("accept", CORRUPT);
    await pc.setLocalDescription(await pc.createAnswer());
    const out = await makeCode(pc, "answer", profile, opts);
    return hsLog("accept", { ok: true, code: out, peer: parsed.payload.p || null });
  }

  async function acceptAnswer(transport, code) {
    const parsed = await decodeCode(code);          // code first — see acceptInvite
    if (!parsed.ok) return hsLog("answer", parsed);
    if (parsed.payload.k !== "answer") {
      return hsLog("answer", { ok: false, error: "wrong_code_kind", message: "That is an invite code, not an answer code." });
    }
    const build = checkBuild(await localBuild(), parsed.payload.b);
    if (!build.ok) return hsLog("answer", build);
    const pc = transport && transport.pc;
    if (!pc) return hsLog("answer", NO_TRANSPORT);
    if (pc.signalingState !== "have-local-offer") {
      return hsLog("answer", { ok: false, error: "already_answered",
               message: "That answer was already used, or arrived too late." });
    }
    const took = await setRemote(pc, "answer", parsed.payload.s);
    if (!took) return hsLog("answer", CORRUPT);       // same rule as acceptInvite
    return hsLog("answer", { ok: true, peer: parsed.payload.p || null });
  }

  // A code is long; a link is not something you have to explain. The code
  // rides in the FRAGMENT so it never reaches a server, not even in a log.
  function inviteUrl(code) {
    try {
      const base = location.origin + location.pathname;
      return base + "#vs=" + code;
    } catch (e) { return null; }
  }
  function inviteFromUrl(href) {
    try {
      const h = (href != null ? String(href) : location.hash) || "";
      const m = h.match(/[#&]vs=([^&]+)/);
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  return {
    MAGIC,
    encodeCode, decodeCode, normaliseSdp,
    localBuild, checkBuild, waitForIce,
    createInvite, acceptInvite, acceptAnswer,
    inviteUrl, inviteFromUrl,
  };
})();
