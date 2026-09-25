/* Apex 26 — one clipboard write/read home. navigator.clipboard + textarea
   execCommand fallback for plain http / older WebKit. Call sites used to
   duplicate the two-step; keep the measured preferSync order for tuner
   panels (execCommand while the click still has activation, then async). */
const ApexClipboard = (function () {
  "use strict";

  function fallbackWrite(text) {
    try {
      if (typeof document === "undefined" || !document.body) return false;
      const ta = document.createElement("textarea");
      ta.value = String(text == null ? "" : text);
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, ta.value.length);
      let ok = false;
      try { ok = !!(document.execCommand && document.execCommand("copy")); } catch (_) { ok = false; }
      document.body.removeChild(ta);
      return ok !== false && !!ok;
    } catch (_) { return false; }
  }

  /** Copy the current document selection (caller already focused + selected). */
  function copySelection() {
    try {
      return !!(typeof document !== "undefined" && document.execCommand && document.execCommand("copy"));
    } catch (_) { return false; }
  }

  function tryWriteText(text) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(String(text == null ? "" : text))
          .then(() => true, () => false);
      }
    } catch (_) { /* fall through */ }
    return Promise.resolve(false);
  }

  /**
   * Write text to the clipboard. Always resolves (never rejects) to a boolean.
   * @param {string} text
   * @param {{ preferSync?: boolean }} [opts] preferSync: try execCommand first
   *   (tuner / free-cam panels that already selected a visible field).
   * @returns {Promise<boolean>}
   */
  function write(text, opts) {
    const preferSync = !!(opts && opts.preferSync);
    const payload = String(text == null ? "" : text);
    if (preferSync) {
      // Selection only — caller already focused a visible field. Do NOT mint a
      // hidden textarea here: ui-improve-pass pins the order as one
      // execCommand then the async API (and WebKit needs that first call
      // during the gesture, not a second synthetic one).
      const syncOk = copySelection();
      return tryWriteText(payload).then((asyncOk) => syncOk || asyncOk);
    }
    return tryWriteText(payload).then((asyncOk) => asyncOk || fallbackWrite(payload));
  }

  async function read() {
    if (typeof navigator === "undefined" || !navigator.clipboard || !navigator.clipboard.readText) {
      throw new Error("clipboard unavailable");
    }
    return navigator.clipboard.readText();
  }

  return { write, read, fallbackWrite, copySelection };
})();
Object.freeze(ApexClipboard);
