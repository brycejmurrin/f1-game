/*
 * NetHandshake — getting two browsers connected with NO server of ours.
 *
 * WebRTC is peer-to-peer once connected, but every connection needs a
 * signalling exchange first, and signalling normally means a server. This game
 * is static files on GitHub Pages and intends to stay that way, so the
 * exchange is done BY THE PLAYERS: the host generates an invite code, sends it
 * however they like (chat, SMS, a link), and pastes back the answer code their
 * friend returns. Two pastes, no infrastructure, £0.
 *
 * Three things make that practical:
 *
 * 1. VANILLA ICE. We wait for ICE gathering to COMPLETE before emitting the
 *    code, so every candidate is already inside the SDP. Trickle ICE would be
 *    faster to first-byte but would need a live channel to trickle over —
 *    which is the very thing we don't have. Waiting is what makes a single
 *    static string sufficient.
 *
 * 2. THE CODE IS COMPRESSED. A gathered SDP is 2-4 KB of highly repetitive
 *    text, which is a miserable thing to paste. We strip the lines that can be
 *    rebuilt from a template, then deflate + base64url what remains. Typical
 *    result is a few hundred characters. CompressionStream is used where it
 *    exists and skipped where it doesn't — the format carries a flag byte, so
 *    a compressing peer and a non-compressing peer still understand each
 *    other.
 *
 * 3. THE BUILD NUMBER IS PART OF THE CODE. Two peers on different cached
 *    builds have different track splines, different barrier positions and
 *    different physics constants — they would desync immediately and
 *    inexplicably. version.json's `build` is embedded and checked before the
 *    connection is used, so a mismatch is a clear "reload to update" instead
 *    of a mystery. Scenery is deliberately NOT checked: props never affect
 *    physics, so peers may legitimately differ there.
 *
 * What this cannot do: traverse every NAT. Without a TURN relay (which costs
 * money) some symmetric-NAT pairs will simply never connect P2P. That is a
 * real, unfixable-for-free outcome and the UI must say so plainly rather than
 * spinning forever.
 */
"use strict";

const NetHandshake = (function () {
  const MAGIC = "APEX1";          // format marker + version, kept human-visible
  const CORRUPT = { ok: false, error: "corrupt_code",
    message: "That code is incomplete or corrupted — copy the whole thing." };
  const NO_TRANSPORT = { ok: false, error: "no_transport",
    message: "WebRTC is unavailable in this browser." };
  const GATHER_TIMEOUT_MS = 8000; // stop waiting for stragglers; what we have is usually enough

  // ---- base64url (no padding) — safe in a URL fragment and in a chat message
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
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  const deflate = (text) => deflateBytes(enc().encode(text));
  const inflate = async (bytes) => dec().decode(await inflateBytes(bytes));

  // ---- SDP normalisation ---------------------------------------------------
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

  // ---- code encode / decode ------------------------------------------------
  // Payload: {b: build, k: "offer"|"answer", p: {...profile}, s: sdp}
  // No version field: the MAGIC prefix already carries it, and a second
  // marker is a second thing that can disagree.
  //
  // Three formats, distinguished by the middle segment:
  //   .s.  COMPACT — the SDP as a NetSdp byte struct, then the rest as JSON,
  //        the whole thing deflated. ~5x shorter than .z., which is what makes
  //        the code scannable as a QR rather than only pasteable.
  //   .z.  the full payload as deflated JSON
  //   .p.  the full payload as plain JSON (no CompressionStream)
  // The decoder understands all three, so the compact path can be abandoned at
  // encode time — see NetSdp.packChecked — without the far end caring.
  async function encodeCode(payload) {
    if (canCompress()) {
      try {
        const packed = payload.s ? await NetSdp.packChecked(payload.s) : null;
        if (packed) {
          // Two lengths then the two bodies: the SDP struct is binary and the
          // rest is JSON, and deflate does better on them concatenated than it
          // would on the struct base64'd into a JSON string.
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
    const trimmed = String(code || "").trim().replace(/\s+/g, "");
    const parts = trimmed.split(".");
    if (parts.length !== 3 || parts[0] !== MAGIC) {
      return { ok: false, error: "bad_code", message: "That does not look like an Apex invite code." };
    }
    const [, mode, body] = parts;
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
      const json = mode === "z" ? await inflate(bytes) : dec().decode(bytes);
      return { ok: true, payload: JSON.parse(json) };
    } catch (e) {
      return CORRUPT;   // decode, inflate and parse all mean the same to a player
    }
  }

  // ---- ICE gathering -------------------------------------------------------
  // Resolve when gathering completes, or when the timeout fires — whichever is
  // first. A timeout is NOT an error: the candidates gathered so far are
  // usually enough to connect, and waiting forever for a straggling relay
  // candidate is worse than trying with what we have.
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

  // ---- build identity ------------------------------------------------------
  // Same source the shell's stale-PWA guard uses, so there is exactly one
  // notion of "which build am I".
  let _buildCache = null;
  async function localBuild() {
    if (_buildCache != null) return _buildCache;
    try {
      // Cache-buster AS WELL AS no-store, matching the shell's stale-PWA guard
      // in index.html. sw.js serves version.json network-first but falls back
      // to the cache after a 3 s timeout, so on a slow link a bare no-store
      // request can still be answered with a STALE build — which would reject
      // a peer we actually match.
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
    // An unknown build is not a matching build. This has to come FIRST: the
    // equality below is what a pair of unknowns used to satisfy.
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

  // ---- the two halves of the exchange -------------------------------------
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
    if (!pc) return NO_TRANSPORT;
    await pc.setLocalDescription(await pc.createOffer());
    const code = await makeCode(pc, "offer", profile, opts);
    return { ok: true, code, url: inviteUrl(code) };
  }

  async function acceptInvite(transport, code, profile, opts) {
    // Validate the CODE before the connection. Nothing here needs a peer
    // connection, and "that code is incomplete" is a far more actionable thing
    // to tell someone than a generic transport error they cannot act on.
    const parsed = await decodeCode(code);
    if (!parsed.ok) return parsed;
    if (parsed.payload.k !== "offer") {
      return { ok: false, error: "wrong_code_kind", message: "That is an answer code, not an invite code." };
    }
    const build = checkBuild(await localBuild(), parsed.payload.b);
    if (!build.ok) return build;
    const pc = transport && transport.pc;
    if (!pc) return NO_TRANSPORT;

    await pc.setRemoteDescription({ type: "offer", sdp: parsed.payload.s });
    await pc.setLocalDescription(await pc.createAnswer());
    const out = await makeCode(pc, "answer", profile, opts);
    return { ok: true, code: out, peer: parsed.payload.p || null };
  }

  async function acceptAnswer(transport, code) {
    const parsed = await decodeCode(code);          // code first — see acceptInvite
    if (!parsed.ok) return parsed;
    if (parsed.payload.k !== "answer") {
      return { ok: false, error: "wrong_code_kind", message: "That is an invite code, not an answer code." };
    }
    const build = checkBuild(await localBuild(), parsed.payload.b);
    if (!build.ok) return build;
    const pc = transport && transport.pc;
    if (!pc) return NO_TRANSPORT;
    // ONLY while an answer is awaited. setRemoteDescription(answer) on a PC
    // in "stable" throws InvalidStateError — seen UNCAUGHT in a real console.
    // Two real ways to get here: the same answer handled twice, or an answer
    // arriving after the host ROTATED to a fresh transport (which is stable,
    // having no local offer yet). Neither is an exception-worthy surprise;
    // both are "this answer is not for this connection", said typed.
    if (pc.signalingState !== "have-local-offer") {
      return { ok: false, error: "already_answered",
               message: "That answer was already used, or arrived too late." };
    }
    await pc.setRemoteDescription({ type: "answer", sdp: parsed.payload.s });
    return { ok: true, peer: parsed.payload.p || null };
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
    canCompress,
  };
})();
