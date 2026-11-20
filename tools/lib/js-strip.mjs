// js-strip.mjs — a classic script with its comments and spare whitespace removed: the bytes a boot actually parses.
// @doc Dependency-free JS comment/whitespace stripper; the boot wall's eagerCodeBytes ratchet measures its output.
//
// Why repo-local and not terser: tools/check/boot-wall.mjs is in the merge gate's TIP_GATE_TESTS closure, which must
// import only node built-ins and repo files (land.yml `trusted-rows` installs nothing; tests/unit/tip-gate.test.mjs).
// Pages ships terser output (tools/desktop/minify.mjs: comments and whitespace dropped, local names mangled); this
// drops the same comments and whitespace and keeps every name, so its count sits a little above terser's. The count
// is the ratchet's whole use: the output is never shipped or run. tests/unit/js-strip.test.mjs checks that the
// token stream is unchanged (acorn) on every eager script, and how far above terser the count sits.
// Decision: docs/notes/RATCHET-REVIEW-2026-11-20.md (Bryce, B+D, 2026-11-20 07:49Z).

const WORD = /[A-Za-z0-9_$\\\u0080-￿]/;
// After one of these keywords a `/` starts a regex, not a division.
const REGEX_AFTER_WORD = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw",
  "case", "do", "else", "yield", "await"]);

/** `src` without comments, with each whitespace run cut to "" / " " / "\n" (a newline is kept wherever the run held
 *  one, so automatic semicolon insertion reads the text exactly as before). Pure. */
export function stripJs(src) {
  const s = String(src);
  const n = s.length;
  // Chunks joined once at the end, and the last char kept apart: indexing a growing concatenated string flattens it
  // on every read, which made a 650 KB file take seconds.
  const out = [];
  let last = "";
  let i = 0;
  let prev = "";       // the last significant token, for the regex-vs-division call
  let prevKind = "";   // "word" | "num" | "str" | "punc" | "regex" | "tpl"
  let before = "";     // the token before `prev`: `f.in / 10` is a property, not the keyword
  let gap = 0;         // 0: none, 1: space, 2: newline, pending before the next token
  const tpl = [];      // brace depth at each open `${`
  let depth = 0;

  const emit = (tok, kind) => {
    if (last && gap) {
      const a = last, b = tok[0];
      if (gap === 2) out.push("\n");
      else if ((WORD.test(a) && WORD.test(b)) || (a === "+" && b === "+") || (a === "-" && b === "-")
        || (a === "/" && (b === "/" || b === "*")) || (prevKind === "num" && b === ".")
        || (a === "<" && b === "!") || (a === "-" && b === ">")) out.push(" ");
    }
    out.push(tok);
    last = tok[tok.length - 1];
    gap = 0;
    before = prev;
    prev = tok;
    prevKind = kind;
  };
  const regexAllowed = () => {
    if (!prev) return true;
    if (prevKind === "word") return REGEX_AFTER_WORD.has(prev) && before !== "." && before !== "?.";
    if (prevKind === "num" || prevKind === "str" || prevKind === "regex" || prevKind === "tpl") return false;
    return !(prev === ")" || prev === "]" || prev === "}");
  };
  // A template body from i (just past ` or }); stops past the closing ` or past `${`.
  const templateBody = () => {
    const start = i;
    while (i < n) {
      const c = s[i];
      if (c === "\\") { i += 2; continue; }
      if (c === "`") { i++; return { text: s.slice(start, i), open: false }; }
      if (c === "$" && s[i + 1] === "{") { i += 2; return { text: s.slice(start, i), open: true }; }
      i++;
    }
    throw new Error("js-strip: unterminated template literal");
  };

  while (i < n) {
    const c = s[i];
    // whitespace (incl. line terminators U+2028/2029)
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\v" || c === "\f" || c === " "
      || c === "﻿" || c === "\u2028" || c === "\u2029" || (c > "\u007f" && /\s/.test(c))) {
      gap = Math.max(gap, c === "\n" || c === "\r" || c === "\u2028" || c === "\u2029" ? 2 : 1);
      i++; continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      while (i < n && s[i] !== "\n" && s[i] !== "\r" && s[i] !== "\u2028" && s[i] !== "\u2029") i++;
      gap = Math.max(gap, 1);
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const end = s.indexOf("*/", i + 2);
      if (end < 0) throw new Error("js-strip: unterminated block comment");
      const body = s.slice(i + 2, end);
      gap = Math.max(gap, /[\n\r\u2028\u2029]/.test(body) ? 2 : 1);
      i = end + 2; continue;
    }
    if (c === "#" && i === 0 && s[1] === "!") { while (i < n && s[i] !== "\n") i++; continue; }
    if (c === "'" || c === '"') {
      const start = i++;
      while (i < n && s[i] !== c) { if (s[i] === "\\") i++; i++; }
      i++;
      emit(s.slice(start, i), "str"); continue;
    }
    if (c === "`") {
      i++;
      const { text, open } = templateBody();
      if (open) tpl.push(depth);
      emit("`" + text, open ? "punc" : "tpl");
      if (open) prev = "${";
      continue;
    }
    if (c === "/" && regexAllowed()) {
      const start = i++;
      let cls = false;
      while (i < n) {
        const d = s[i];
        if (d === "\\") { i += 2; continue; }
        if (d === "\n") throw new Error(`js-strip: unterminated regex literal at line ${s.slice(0, start).split("\n").length}`);
        if (cls) { if (d === "]") cls = false; } else if (d === "[") cls = true; else if (d === "/") break;
        i++;
      }
      i++;
      while (i < n && /[A-Za-z]/.test(s[i])) i++;
      emit(s.slice(start, i), "regex"); continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] || ""))) {
      const start = i++;
      while (i < n && /[0-9A-Za-z_.]/.test(s[i])) {
        // exponent sign: 1e-5 / 1E+5 (not in hex)
        if ((s[i] === "e" || s[i] === "E") && (s[i + 1] === "-" || s[i + 1] === "+") && !/^0[xX]/.test(s.slice(start, i))) i += 2;
        else i++;
      }
      emit(s.slice(start, i), "num"); continue;
    }
    if (WORD.test(c)) {
      const start = i++;
      while (i < n && WORD.test(s[i])) i++;
      emit(s.slice(start, i), "word"); continue;
    }
    // punctuators: braces track template nesting; everything else is copied a char at a time (joining rules above
    // keep `+ +`, `- -` and `/ /` apart, so splitting a multi-char operator is never needed).
    if (c === "{") { depth++; emit(c, "punc"); i++; continue; }
    if (c === "}") {
      if (tpl.length && tpl[tpl.length - 1] === depth) {
        tpl.pop();
        i++;
        const { text, open } = templateBody();
        if (open) tpl.push(depth);
        // a template continuation joins the expression before it with no gap
        gap = 0;
        out.push("}" + text); last = text[text.length - 1];
        before = prev; prev = open ? "${" : "`"; prevKind = open ? "punc" : "tpl";
        continue;
      }
      depth--; emit(c, "punc"); i++; continue;
    }
    // A multi-char punctuator is emitted whole so `prev` is right for the regex call (`)` vs `=>`).
    const m = /^(?:>>>=|\.\.\.|===|!==|\*\*=|<<=|>>=|>>>|&&=|\|\|=|\?\?=|=>|==|!=|<=|>=|&&|\|\||\?\?|\?\.(?![0-9])|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|\*\*|<<|>>|[^\s])/.exec(s.slice(i, i + 4));
    emit(m[0], "punc");
    i += m[0].length;
  }
  return out.join("");
}

/** UTF-8 byte length of stripJs(src). */
export const strippedBytes = (src) => Buffer.byteLength(stripJs(src));
