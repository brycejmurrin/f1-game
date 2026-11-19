"use strict";

const LobbyCodes = (function () {

  const CODE_CHARS = /^[A-Za-z0-9_-]+$/;
  const FRAGMENT_MIN = 20;
  const LEAD_JUNK = /^[^A-Za-z0-9_.-]+/, TAIL_JUNK = /[^A-Za-z0-9_-]+$/;
  const INVISIBLE = /[\u200B-\u200D\u2060\uFEFF\u00AD]/g;
  function restoreModeSep(c) {
    const magicName = NetHandshake.MAGIC || "APEX1";
    const p = String(c || "").split(".");
    if (p.length === 2 && p[0] === magicName && /^[szp]$/.test(p[1])) return c + ".";
    return c;
  }
  function codeFrom(text, keepShortTail = false) {
    const raw = String(text || "").replace(INVISIBLE, "").trim();
    if (!raw) return "";
    const tokens = raw.split(/\s+/);
    const magic = (NetHandshake.MAGIC || "APEX1") + ".";
    let at = -1, code = "", opened = false, ended = false;
    for (let i = 0; i < tokens.length && at < 0; i++) {
      const lifted = NetHandshake.inviteFromUrl(tokens[i]);
      if (lifted) { at = i; code = restoreModeSep(lifted); continue; }
      const lead = tokens[i].replace(LEAD_JUNK, "");
      if (!lead.startsWith(magic)) continue;
      at = i; opened = lead !== tokens[i];
      const stripped = lead.replace(TAIL_JUNK, "");
      ended = stripped !== lead;
      if (ended && restoreModeSep(stripped) !== stripped) {
        code = restoreModeSep(stripped);
        ended = false;
      } else {
        code = stripped;
      }
    }
    if (at < 0) return raw;
    let long = false;
    for (let i = at + 1; i < tokens.length && !ended; i++) {
      const t = tokens[i].replace(TAIL_JUNK, "");
      ended = t !== tokens[i];
      if (!t || !CODE_CHARS.test(t)) break;
      if (t.length >= FRAGMENT_MIN) { code += t; long = true; continue; }
      let more = false;
      if (!ended) {
        for (let j = i + 1; j < tokens.length; j++) {
          const n = tokens[j].replace(TAIL_JUNK, "");
          if (!n || !CODE_CHARS.test(n)) break;
          if (n.length >= FRAGMENT_MIN) { more = true; break; }
        }
      }
      if (more) { code += t; continue; }
      if (keepShortTail || (long && i === tokens.length - 1 && (!ended || opened)
          && (opened || /[0-9_-]/.test(t) || t.length >= 10))) {
        code += t;
      }
      break;
    }
    if (/^[A-Za-z0-9]+\.[szp]\.$/.test(code)) code = code.slice(0, -1);
    return code;
  }

  function resolveCode(text) {
    const code = codeFrom(text), tail = codeFrom(text, true);
    if (tail === code) return code;
    return NetHandshake.decodeCode(code).then(async (parsed) => {
      if (parsed.ok) return code;
      return (await NetHandshake.decodeCode(tail)).ok ? tail : code;
    });
  }

  function paintQr(wrap, canvas, payload) {
    if (!wrap || !canvas) return false;
    const ok = !!(payload && NetQr.draw(canvas, payload, { px: 320 }));
    wrap.hidden = !ok;
    return ok;
  }

  const canShare = () => typeof navigator !== "undefined" && !!navigator.share;

  function create(api) {
    const { els, $, say, makeAnswer, acceptAnswer, cancelledResult, has, focusInto, shownStep } = api;

    let deliveryGeneration = 0, pasteGeneration = 0;
    function deliver(kind, text) {
      const delivery = ++deliveryGeneration, paste = pasteGeneration;
      const operation = api.getOperation ? api.getOperation() : null;
      const apply = (code) => {
        if (delivery !== deliveryGeneration || paste !== pasteGeneration
            || (api.getOperation && operation !== api.getOperation())) return cancelledResult();
        if (!code) return false;
        const e = els();
        const box = kind === "invite" ? e.inviteIn : e.answerIn;
        if (box) box.value = code;
        return kind === "invite" ? makeAnswer(code) : acceptAnswer(code);
      };
      const code = resolveCode(text);
      if (typeof code === "string") return apply(code);
      return code.then(apply).catch((e) => {
        Log.warn("net", "lobby code deliver failed:", e && e.message);
        return cancelledResult();
      });
    }

    let scanner = null;
    let scannerGeneration = 0;

    function stopScan() {
      scannerGeneration++;
      const active = scanner;
      scanner = null;
      if (active) active.stop();
      const e = els();
      const hadFocus = has
        ? has(e.scan, document.activeElement)
        : !!(e.scan && e.scan.contains && e.scan.contains(document.activeElement));
      if (e.scan) e.scan.hidden = true;
      if (hadFocus && focusInto && shownStep) focusInto(shownStep(e));
    }

    function resetSteps() {
      deliveryGeneration++;
      const e = els();
      for (const f of ["invite", "inviteIn", "answer", "answerIn"]) if (e[f]) e[f].value = "";
      if (e.answerHint) e.answerHint.hidden = true;
      if (e.answerActions) e.answerActions.hidden = true;
      if (e.answerRaw) e.answerRaw.hidden = true;
      if (e.answerWait) e.answerWait.hidden = false;
      if ($("vs-qr-wrap")) $("vs-qr-wrap").hidden = true;
      if (e.answerQrWrap) e.answerQrWrap.hidden = true;
      stopScan();
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
      if (focusInto) focusInto(e.scan);
      say("Point the camera at their code…");
      const attempt = NetScan.create();
      scanner = attempt;
      let delivered = false;
      const res = await attempt.start(e.scanVideo, (text) => {
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
      const paste = ++pasteGeneration;
      const operation = api.getOperation ? api.getOperation() : null;
      const current = () => paste === pasteGeneration && (!api.getOperation || operation === api.getOperation());
      let text = "";
      try { text = await ApexClipboard.read(); }
      catch (err) {
        if (!current()) return cancelledResult();
        say("Could not read the clipboard — paste into the box instead.", true);
        return { ok: false, error: "denied" };
      }
      if (!current()) return cancelledResult();
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

    async function handOff(data, fallbackText) {
      if (!fallbackText) { say("There is nothing to share yet.", true); return false; }
      if (canShare()) {
        try { await navigator.share(data); say("Shared."); return true; }
        catch (e) {
          if (e && e.name === "AbortError") return false;
          if (await ApexClipboard.write(fallbackText)) { say("Sharing failed — copied instead."); return true; }
          say("Sharing failed — tap COPY to copy the code.", true);
          return false;
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
      codeFrom, resolveCode, deliver, scan, stopScan, pasteInto, copy, handOff, resetSteps,
      paintQr, drawQr, drawAnswerQr, shareInvite, shareAnswer, canShare,
    };
  }

  return { codeFrom, resolveCode, paintQr, canShare, create };
})();
Object.freeze(LobbyCodes);
