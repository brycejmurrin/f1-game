/* Apex 26 — apply data-i18n / data-i18n-attr when the active language is not plain English. */
const I18nDom = (function () {
  "use strict";

  function parseAttrSpec(spec) {
    const out = [];
    for (const part of String(spec).split(";")) {
      const bit = part.trim();
      if (!bit) continue;
      const colon = bit.indexOf(":");
      if (colon < 0) continue;
      out.push({ attr: bit.slice(0, colon).trim(), key: bit.slice(colon + 1).trim() });
    }
    return out;
  }

  function shouldApply() {
    if (typeof I18n === "undefined") return false;
    const lang = I18n.lang();
    return lang !== "en";
  }

  function applyNode(el) {
    const key = el.getAttribute("data-i18n");
    if (key) {
      const defAttr = "data-i18n-default";
      let fallback = el.getAttribute(defAttr);
      if (!fallback) {
        fallback = el.textContent;
        if (fallback) el.setAttribute(defAttr, fallback);
      }
      el.textContent = I18n.t(key, null, fallback);
    }
    const attrSpec = el.getAttribute("data-i18n-attr");
    if (attrSpec) {
      for (const { attr, key: k } of parseAttrSpec(attrSpec)) {
        const fallback = el.getAttribute(attr) || "";
        el.setAttribute(attr, I18n.t(k, null, fallback));
      }
    }
  }

  function apply(root) {
    if (!shouldApply()) return;
    const scope = root && root.querySelectorAll ? root : document;
    if (!scope || !scope.querySelectorAll) return;
    for (const el of scope.querySelectorAll("[data-i18n], [data-i18n-attr]")) applyNode(el);
  }

  if (typeof I18n !== "undefined") {
    I18n.onChange(() => apply());
    void I18n.ready().then(() => apply());
    if (I18n.lang() !== "en") apply();
  }

  return { apply, applyNode, shouldApply };
})();

if (typeof window !== "undefined") window.I18nDom = I18nDom;
