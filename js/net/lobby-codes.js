/* Apex 26 — lobby invite/answer paste, copy, share, scan, and QR helpers.
   Peeled from NetLobby so room/transport state stays there and code-shaped UI
   routes live here. Handshake encode/decode (NetHandshake) and room-code
   alphabet (NetRendezvous) are unchanged — bit-compatible on the wire. */
"use strict";

const LobbyCodes = (function () {

  function codeFrom(text) {
    const raw = String(text || "").trim();
    if (!raw) return "";
    return NetHandshake.inviteFromUrl(raw) || raw;
  }

  // The QR carries the invite LINK, not the code: a link scanned by the
  // guest's ordinary camera app opens the game with joining already filled.
  // Draw `payload` into `canvas`, revealing `wrap` only if it encoded.
  function paintQr(wrap, canvas, payload) {
    if (!wrap || !canvas) return false;
    const ok = !!(payload && NetQr.draw(canvas, payload, { px: 320 }));
    wrap.hidden = !ok;
    return ok;
  }

  const canShare = () => typeof navigator !== "undefined" && !!navigator.share;

  /**
   * @param {object} api
   * @param {() => object} api.els
   * @param {(id: string) => Element|null} api.$
   * @param {(msg: string, isError?: boolean) => void} api.say
   * @param {(code?: string) => any} api.makeAnswer
   * @param {(code?: string) => any} api.acceptAnswer
   * @param {() => {ok:false,error:string}} api.cancelledResult
   */
  function create(api) {
    const { els, $, say, makeAnswer, acceptAnswer, cancelledResult } = api;

    function deliver(kind, text) {
      const code = codeFrom(text);
      if (!code) return false;
      const e = els();
      const box = kind === "invite" ? e.inviteIn : e.answerIn;
      if (box) box.value = code;
      return kind === "invite" ? makeAnswer(code) : acceptAnswer(code);
    }

    let scanner = null;
    let scannerGeneration = 0;

    function stopScan() {
      scannerGeneration++;
      const active = scanner;
      scanner = null;
      if (active) active.stop();
      const e = els();
      if (e.scan) e.scan.hidden = true;
    }

    async function scan(kind) {
      const e = els();
      if (!e.scan || !e.scanVideo) return { ok: false, error: "no_ui" };
      if (!NetScan.supported()) {
        say("This browser cannot use the camera — paste the code instead.", true);
        return { ok: false, error: "unsupported" };
      }
      stopScan();
      const gen = scannerGeneration;
      e.scan.hidden = false;
      say("Point the camera at their code…");
      const attempt = NetScan.create();
      scanner = attempt;
      let delivered = false;
      const res = await attempt.start(e.scanVideo, (text) => {
        // A decoder/camera from an older scan may finish after a second scan has
        // started. It may stop itself, but it must not stop the new scanner,
        // hide its panel, or deliver into the wrong input.
        if (scanner !== attempt || scannerGeneration !== gen) { attempt.stop(); return; }
        delivered = true;
        stopScan();
        say("Got it.");
        deliver(kind, text);
      });
      if (delivered) return res;
      if (scanner !== attempt || scannerGeneration !== gen) {
        attempt.stop();
        return cancelledResult();
      }
      if (!res.ok) { stopScan(); say(res.message || "Could not start the camera.", true); }
      return res;
    }

    async function pasteInto(kind) {
      let text = "";
      try { text = await ApexClipboard.read(); }
      catch (err) {
        say("Could not read the clipboard — paste into the box instead.", true);
        return { ok: false, error: "denied" };
      }
      if (!codeFrom(text)) { say("There is no code on the clipboard.", true); return { ok: false, error: "empty" }; }
      return deliver(kind, text);
    }

    async function copy(text) {
      if (!text) { say("There is nothing to copy yet.", true); return false; }
      const ok = await ApexClipboard.write(text);
      if (ok) { say("Copied."); return true; }
      say("Could not copy — select the code and copy it manually.", true);
      return false;
    }

    // The invite goes out as a LINK, not a code: opening it drops the guest
    // straight into joining with the box already filled (see NetLobby.wire()).
    // The ANSWER is shared as bare text — there is no "open this to answer" flow.
    // navigator.share is progressive: OS sheet where it exists, clipboard else.
    async function handOff(data, fallbackText) {
      if (!fallbackText) { say("There is nothing to share yet.", true); return false; }
      if (canShare()) {
        try { await navigator.share(data); say("Shared."); return true; }
        catch (e) {
          if (e && e.name === "AbortError") return false;
        }
      }
      return copy(fallbackText);
    }

    function drawQr(code) {
      return paintQr($("vs-qr-wrap"), $("vs-qr"),
        code ? NetHandshake.inviteUrl(code) : null);
    }
    function drawAnswerQr(code) {
      const e = els();
      return paintQr(e.answerQrWrap, e.answerQr, code || null);
    }

    function shareInvite() {
      const e = els();
      const code = e.invite ? e.invite.value : "";
      const url = code ? NetHandshake.inviteUrl(code) : null;
      if (!url) return handOff({ title: "Apex 26", text: code }, code);
      return handOff({ title: "Apex 26", text: "Race me on Apex 26", url }, url);
    }

    function shareAnswer() {
      const code = (els().answer || {}).value || "";
      return handOff({ title: "Apex 26 answer", text: code }, code);
    }

    return {
      codeFrom, deliver, scan, stopScan, pasteInto, copy, handOff,
      paintQr, drawQr, drawAnswerQr, shareInvite, shareAnswer, canShare,
    };
  }

  return { codeFrom, paintQr, canShare, create };
})();
Object.freeze(LobbyCodes);
