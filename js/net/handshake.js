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
  async function deflate(text) {
    const stream = new Blob([enc().encode(text)]).stream()
      .pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function inflate(bytes) {
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream("deflate-raw"));
    return dec().decode(await new Response(stream).arrayBuffer());
  }

  // ---- SDP slimming --------------------------------------------------------
  // Drop the lines a peer can regenerate or safely default. This is lossy by
  // design and ONLY the lines listed here are dropped — anything unrecognised
  // is preserved, so a browser that adds new attributes still round-trips.
  const DROPPABLE = /^a=(extmap|rtcp-fb|ssrc|msid|rtpmap|fmtp|rtcp-mux-only|ice-options)/;
  function slimSdp(sdp) {
    return sdp.split(/\r\n|\n/).filter((l) => l && !DROPPABLE.test(l)).join("\n");
  }

  // ---- code encode / decode ------------------------------------------------
  // Payload: {v: MAGIC, b: build, k: "offer"|"answer", p: {...profile}, s: sdp}
  async function encodeCode(payload) {
    const json = JSON.stringify(payload);
    if (canCompress()) {
      try { return MAGIC + ".z." + bytesToB64url(await deflate(json)); }
      catch (e) { /* fall through to plain */ }
    }
    return MAGIC + ".p." + bytesToB64url(enc().encode(json));
  }
  async function decodeCode(code) {
    const trimmed = String(code || "").trim().replace(/\s+/g, "");
    const parts = trimmed.split(".");
    if (parts.length !== 3 || parts[0] !== MAGIC) {
      return { ok: false, error: "bad_code", message: "That does not look like an Apex invite code." };
    }
    const [, mode, body] = parts;
    let json;
    try {
      const bytes = b64urlToBytes(body);
      json = mode === "z" ? await inflate(bytes) : dec().decode(bytes);
    } catch (e) {
      return { ok: false, error: "corrupt_code", message: "That code is incomplete or corrupted — copy the whole thing." };
    }
    try { return { ok: true, payload: JSON.parse(json) }; }
    catch (e) { return { ok: false, error: "corrupt_code", message: "That code is incomplete or corrupted — copy the whole thing." }; }
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
      const r = await fetch("version.json", { cache: "no-store" });
      const v = await r.json();
      _buildCache = (v && v.build != null) ? v.build : 0;
    } catch (e) { _buildCache = 0; }
    return _buildCache;
  }

  // Peers must agree on the build. Everything physics-relevant — the spline,
  // the barrier positions, the tuning constants — ships inside it.
  function checkBuild(mine, theirs) {
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
  async function createInvite(transport, profile, opts) {
    const pc = transport && transport.pc;
    if (!pc) return { ok: false, error: "no_transport", message: "WebRTC is unavailable in this browser." };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIce(pc, opts && opts.gatherTimeoutMs);
    const code = await encodeCode({
      v: MAGIC, b: await localBuild(), k: "offer",
      p: profile || null,
      s: slimSdp(pc.localDescription.sdp),
    });
    return { ok: true, code, url: inviteUrl(code) };
  }

  async function acceptInvite(transport, code, profile, opts) {
    const pc = transport && transport.pc;
    if (!pc) return { ok: false, error: "no_transport", message: "WebRTC is unavailable in this browser." };
    const parsed = await decodeCode(code);
    if (!parsed.ok) return parsed;
    if (parsed.payload.k !== "offer") {
      return { ok: false, error: "wrong_code_kind", message: "That is an answer code, not an invite code." };
    }
    const build = checkBuild(await localBuild(), parsed.payload.b);
    if (!build.ok) return build;

    await pc.setRemoteDescription({ type: "offer", sdp: parsed.payload.s });
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIce(pc, opts && opts.gatherTimeoutMs);
    const out = await encodeCode({
      v: MAGIC, b: await localBuild(), k: "answer",
      p: profile || null,
      s: slimSdp(pc.localDescription.sdp),
    });
    return { ok: true, code: out, peer: parsed.payload.p || null };
  }

  async function acceptAnswer(transport, code) {
    const pc = transport && transport.pc;
    if (!pc) return { ok: false, error: "no_transport", message: "WebRTC is unavailable in this browser." };
    const parsed = await decodeCode(code);
    if (!parsed.ok) return parsed;
    if (parsed.payload.k !== "answer") {
      return { ok: false, error: "wrong_code_kind", message: "That is an invite code, not an answer code." };
    }
    const build = checkBuild(await localBuild(), parsed.payload.b);
    if (!build.ok) return build;
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
    encodeCode, decodeCode, slimSdp,
    localBuild, checkBuild, waitForIce,
    createInvite, acceptInvite, acceptAnswer,
    inviteUrl, inviteFromUrl,
    canCompress,
  };
})();
