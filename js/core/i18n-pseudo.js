/* Apex 26 — pseudo-locale expansion for layout stress (en-XA). No file catalogue. */
const I18nPseudo = (function () {
  "use strict";

  const VOWELS = /[aeiouAEIOU]/;

  function accent(ch) {
    const map = { a: "á", e: "é", i: "í", o: "ó", u: "ú", A: "Á", E: "É", I: "Í", O: "Ó", U: "Ú" };
    return map[ch] || ch;
  }

  /** Expand English for clipping tests; `{name}` holes are preserved. */
  function expand(text) {
    let s = String(text);
    const holes = [];
    s = s.replace(/\{[^}]+\}/g, (m) => {
      holes.push(m);
      return "\u0000" + (holes.length - 1) + "\u0000";
    });
    let out = "";
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "\u0000") { out += ch; continue; }
      if (VOWELS.test(ch)) out += accent(ch);
      else out += ch;
      if (ch.trim() && (i % 3 === 2)) out += "~";
    }
    out = "[" + out + "]";
    return out.replace(/\u0000(\d+)\u0000/g, (_, i) => holes[Number(i)]);
  }

  return { expand };
})();
Object.freeze(I18nPseudo);
