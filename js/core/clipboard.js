const ApexClipboard = (function () {
  "use strict";

  function fallbackWrite(text) {
    let ta = null;
    let act = null;
    try {
      if (typeof document === "undefined" || !document.body) return false;
      act = document.activeElement;
      ta = document.createElement("textarea");
      ta.value = String(text == null ? "" : text);
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      const host = (act && act.closest && act.closest("dialog[open]")) || (document.querySelector && document.querySelector("dialog[open]")) || document.body;
      host.appendChild(ta);
      ta.focus();
      ta.select();
      if (ta.setSelectionRange) ta.setSelectionRange(0, ta.value.length);
      let ok = false;
      try { ok = !!(document.execCommand && document.execCommand("copy")); } catch (_) { ok = false; }
      return ok !== false && !!ok;
    } catch (_) { return false; }
    finally {
      try { if (ta) ta.remove(); } catch (_) {  }
      try { if (act && act.focus && act !== document.body) act.focus(); } catch (_) {  }
    }
  }

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
    } catch (_) {  }
    return Promise.resolve(false);
  }

  function write(text, opts) {
    const preferSync = !!(opts && opts.preferSync);
    const payload = String(text == null ? "" : text);
    if (preferSync) {
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

  return { write, read, copySelection };
})();
Object.freeze(ApexClipboard);
