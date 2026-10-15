/* Apex 26 — a player-controlled escape from a known failed WebGPU renderer.
 * The shell still records every error in its diagnostic ring. Its error hooks
 * call handle() before painting a raw stack; unrelated errors keep that path.
 * No automatic renderer switch or reload. applyBackend owns race confirmation,
 * sentinel disarm, saved preference and the bounded reload policy. */
const GfxRecovery = (() => {
  "use strict";

  function knownFailure(error, state) {
    const message = String(error && (error.message || error) || "");
    const stack = String(error && error.stack || "");
    // A browser OperationError alone is not evidence of a graphics failure.
    // This signature came from a three WebGPU popErrorScope rejection. Require
    // BOTH that vendor stack and a currently bound WebGPU backend.
    return !!(state && state.api === "webgpu" && /Instance dropped in popErrorScope/i.test(message) &&
      /three[.]webgpu(?:[.]min)?[.]js/i.test(stack));
  }

  function create(options = {}) {
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const backend = options.backendState || (() => {
      try { return typeof GLX !== "undefined" && GLX.backendState ? GLX.backendState() : null; } catch (_) { return null; }
    });
    const apply = options.applyBackend || ((name, button) =>
      typeof RendererPicker !== "undefined" && RendererPicker.applyBackend ? RendererPicker.applyBackend(name, button) : false);
    const clipboard = options.clipboard || ((value) =>
      typeof ApexClipboard !== "undefined" && ApexClipboard.write ? ApexClipboard.write(value) : Promise.resolve(false));
    let card = null, counter = null, details = null, copyStatus = null;
    let occurrences = 0, reason = "", lastKind = "", dismissed = false;
    let snapshot = null;

    function raiseCard(opening) {
      if (!card || dismissed) return;
      let host = doc.body;
      // A body-level popover becomes inert when a modal opens above it. Put
      // recovery INSIDE that modal, then promote it to the top layer again.
      if (opening && opening.tagName === "DIALOG" && opening.open) host = opening;
      else if (doc.querySelectorAll) {
        const dialogs = doc.querySelectorAll("dialog[open]");
        if (dialogs.length) host = dialogs[dialogs.length - 1];
      }
      try {
        if (card.hidePopover && card.matches && card.matches(":popover-open")) card.hidePopover();
        if (card.parentNode !== host) host.appendChild(card);
        if (card.showPopover) card.showPopover();
      } catch (_) { /* older browsers still get a card inside their modal */ }
    }
    function watchLayers() {
      // toggle covers popovers; open-attribute observation also covers older
      // dialog implementations. Repeated graphics errors do not raise it.
      // https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/showPopover
      if (doc.addEventListener) doc.addEventListener("toggle", (event) => {
        if (event.target !== card) raiseCard(event.newState === "open" ? event.target : null);
      }, true);
      if (typeof MutationObserver === "function") {
        const observer = new MutationObserver((records) => {
          for (const record of records) if (record.target !== card && record.attributeName === "open") { raiseCard(record.target.open ? record.target : null); break; }
        });
        observer.observe(doc.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
      }
    }

    function diagnostics() {
      let build = null, errors = [];
      try {
        if (typeof window !== "undefined") { build = window.__APEX_BUILD || null; errors = window.__apexErrors || []; }
      } catch (_) { /* diagnostics must work with a partial shell */ }
      return { build, occurrences, reason, kind: lastKind, backend: snapshot, errors };
    }
    function ensureCard() {
      if (card || !doc || !doc.createElement || !doc.body) return !!card;
      card = doc.createElement("section");
      card.id = "gfx-recovery";
      card.setAttribute("popover", "manual");
      card.setAttribute("role", "region"); card.setAttribute("aria-labelledby", "gfx-recovery-title");
      card.style.cssText = "position:fixed;z-index:99999;inset:auto 12px 12px;margin:auto;max-width:480px;max-height:85vh;overflow:auto;padding:16px;background:#15191e;color:#fff;border:1px solid #8d9bab;border-radius:12px;font:16px/1.5 system-ui;box-shadow:0 4px 24px #0008";
      const title = doc.createElement("h2"); title.id = "gfx-recovery-title"; title.textContent = "Graphics interrupted";
      const message = doc.createElement("p");
      message.textContent = "The 3D view stopped responding. You can reload using WebGL2 compatibility mode.";
      counter = doc.createElement("p"); counter.setAttribute("role", "status");
      const retry = doc.createElement("button"); retry.type = "button"; retry.textContent = "USE WEBGL2 AND RELOAD";
      retry.onclick = () => {
        if (apply("webgl2", retry)) retry.disabled = true;
        else if (typeof setTimeout === "function") setTimeout(() => {
          if (!retry.disabled && !(retry.dataset && retry.dataset.armed)) retry.textContent = "USE WEBGL2 AND RELOAD";
        }, (typeof RendererPicker !== "undefined" && RendererPicker.ARM_MS || 6000) + 20);
      };
      const copy = doc.createElement("button"); copy.type = "button"; copy.textContent = "COPY DIAGNOSTICS";
      copyStatus = doc.createElement("p"); copyStatus.setAttribute("role", "status");
      copy.onclick = async () => {
        try { copyStatus.textContent = await clipboard(JSON.stringify(diagnostics(), null, 2)) ? "Diagnostics copied" : "Could not copy; open DETAILS to select them"; }
        catch (_) { copyStatus.textContent = "Could not copy; open DETAILS to select them"; }
      };
      const dismiss = doc.createElement("button"); dismiss.type = "button"; dismiss.textContent = "DISMISS";
      dismiss.onclick = () => { dismissed = true; if (card.hidePopover) { try { card.hidePopover(); } catch (_) { /* already closed */ } } card.hidden = true; };
      const disclosure = doc.createElement("details"), summary = doc.createElement("summary");
      summary.textContent = "DETAILS"; details = doc.createElement("pre");
      details.style.cssText = "white-space:pre-wrap;overflow-wrap:anywhere;font:var(--fs-2, 1rem)/1.4 monospace;user-select:text";
      disclosure.appendChild(summary); disclosure.appendChild(details);
      for (const el of [title, message, counter, retry, copy, dismiss, copyStatus, disclosure]) card.appendChild(el);
      doc.body.appendChild(card);
      raiseCard(); watchLayers();
      // Announce a newly shown recovery action once; repeated errors never
      // steal focus or reopen a card the player deliberately dismissed.
      retry.focus();
      return true;
    }
    function handle(kind, error) {
      let state;
      try { state = backend(); } catch (_) { return false; }
      if (!knownFailure(error, state)) return false;
      if (!ensureCard()) return false;
      occurrences++; reason = String(error.message || error).slice(0, 400); lastKind = String(kind || "error"); snapshot = state;
      counter.textContent = occurrences === 1 ? "One graphics error recorded" : occurrences + " graphics errors recorded";
      details.textContent = JSON.stringify(diagnostics(), null, 2);
      card.hidden = dismissed;
      return true;
    }
    return { handle, diagnostics, state: () => ({ occurrences, dismissed }) };
  }
  const live = create();
  return { create, knownFailure, handle: live.handle, diagnostics: live.diagnostics };
})();
