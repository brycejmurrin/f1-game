const Dom = (function () {
  "use strict";

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }

  const foldHtml = new WeakMap();
  function paintFold(target, bits) {
    if (!target) return;
    const html = bits.map((p, i) =>
      `${i ? '<span data-fold="sep"> · </span>' : ""}<span data-fold="${p[0]}">${p[1]}</span>`).join("");
    const last = foldHtml.get(target);
    if (last && last.html === html && target.innerHTML === last.rendered) return;
    target.innerHTML = html;
    foldHtml.set(target, { html, rendered: target.innerHTML });
  }

  function fmtLap(t, empty = null) {
    if (typeof t !== "number" || !isFinite(t) || t <= 0) return empty;
    const ms = Math.round(t * 1000), m = Math.floor(ms / 60000);
    const r = (ms - m * 60000) / 1000;
    const secs = `${r < 10 ? "0" : ""}${r.toFixed(3)}`;
    return m ? `${m}:${secs}` : r.toFixed(3);
  }

  function fmtRaceClock(t, digits = 3) {
    if (typeof t !== "number" || !isFinite(t) || t < 0) return null;
    const k = Math.pow(10, digits);
    const u = digits ? Math.round(t * k) : Math.floor(t);
    const h = Math.floor(u / (3600 * k)), m = Math.floor((u - h * 3600 * k) / (60 * k));
    const r = (u - h * 3600 * k - m * 60 * k) / k;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (r < 10 ? "0" : "") + r.toFixed(digits);
  }

  return { el, paintFold, fmtLap, fmtRaceClock };
})();
Object.freeze(Dom);
