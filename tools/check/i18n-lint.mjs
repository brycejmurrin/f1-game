#!/usr/bin/env node
// @doc Locale lint: unknown keys, placeholders, CLDR plurals; --guard bans new literals in migrated files.
// @skill pwa-cache-service-worker
// @section runner
//
//   node tools/check/i18n-lint.mjs              # lint locales/ against en.json
//   node tools/check/i18n-lint.mjs --dir DIR    # lint a locales tree (fixtures)
//   node tools/check/i18n-lint.mjs --guard      # ban new literals in i18n-migrated.json files
//   node tools/check/i18n-lint.mjs --json
//
// FAILS on: unknown keys (in a locale, not in en), changed placeholder sets,
// missing CLDR plural categories for the language, invalid ICU-lite braces,
// empty strings, pool variants with unequal placeholder sets, control chars /
// mojibake, and a translation identical to English unless the key is in keep /
// the reviewed allowlist. WARNS on missing keys (coverage %) and over-length
// (>150 % of English). --guard fails on a new 3+ letter string literal reaching
// textContent / aria-label|title|placeholder / Dom.el text in a migrated file
// unless it is an I18n.t argument or an allowlist row (same shape as html-sink).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as espree from "espree";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const MIGRATED = "tests/data/i18n-migrated.json";
export const ALLOWLIST = "tests/data/i18n-lint-allowlist.json";

const PLURAL_RE = /\{(\w+)\s*,\s*plural\s*,\s*((?:\w+\s*\{[^}]*\}\s*)+)\}/g;
const PLACEHOLDER_RE = /\{([A-Za-z_][\w]*)\}/g;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const MOJIBAKE_RE = /Ã.|Â.|â€.|â„¢|â€™|â€œ|â€\u009d/;
const LETTER_RUN = /[A-Za-z]{3,}/;

const SKIP_KEYS = new Set(["loc", "range", "type", "parent", "start", "end"]);
function each(node, fn) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) { for (const n of node) each(n, fn); return; }
  fn(node);
  for (const k of Object.keys(node)) if (!SKIP_KEYS.has(k)) each(node[k], fn);
}

function baseLang(lang) {
  const tag = String(lang || "en");
  if (tag === "en-XA") return "en";
  const i = tag.indexOf("-");
  return i < 0 ? tag : tag.slice(0, i);
}

/** Named placeholders in a message, ignoring ICU plural wrappers' category labels. */
export function extractPlaceholders(msg) {
  const s = String(msg);
  const stripped = s.replace(PLURAL_RE, (_, anchor, body) => {
    // Keep the plural anchor and any {name} inside category bodies.
    const inner = [];
    const re = /(\w+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(body))) {
      for (const p of extractPlaceholders(m[2])) inner.push(p);
    }
    return `{${anchor}}` + inner.map((p) => `{${p}}`).join("");
  });
  const out = new Set();
  let m;
  PLACEHOLDER_RE.lastIndex = 0;
  while ((m = PLACEHOLDER_RE.exec(stripped))) out.add(m[1]);
  return [...out].sort();
}

/** Category → body map for the first ICU-lite plural in `msg`, or null. */
export function extractPluralForms(msg) {
  PLURAL_RE.lastIndex = 0;
  const m = PLURAL_RE.exec(String(msg));
  if (!m) return null;
  const forms = Object.create(null);
  const re = /(\w+)\s*\{([^}]*)\}/g;
  let fm;
  while ((fm = re.exec(m[2]))) forms[fm[1]] = fm[2];
  return { anchor: m[1], forms };
}

export function pluralCategoriesFor(lang) {
  return new Intl.PluralRules(baseLang(lang)).resolvedOptions().pluralCategories;
}

function braceBalanceOk(s) {
  let n = 0;
  for (const ch of s) {
    if (ch === "{") n++;
    else if (ch === "}") {
      n--;
      if (n < 0) return false;
    }
  }
  return n === 0;
}

function isBadChars(s) {
  return CONTROL_RE.test(s) || MOJIBAKE_RE.test(s);
}

function readJson(abs) {
  return JSON.parse(fs.readFileSync(abs, "utf8"));
}

export function readAllowlist(root = ROOT) {
  const abs = path.join(root, ALLOWLIST);
  if (!fs.existsSync(abs)) return { keep: [], identical: [], unknown: [], sites: {} };
  const doc = readJson(abs);
  return {
    keep: doc.keep || [],
    identical: doc.identical || [],
    unknown: doc.unknown || [],
    sites: doc.sites || {},
  };
}

export function readMigrated(root = ROOT) {
  const abs = path.join(root, MIGRATED);
  if (!fs.existsSync(abs)) return { files: [], html: [], allow: {} };
  const doc = readJson(abs);
  return {
    files: doc.files || [],
    html: doc.html || [],
    allow: doc.allow || {},
  };
}

/**
 * Lint one locale table against English.
 * @returns {{ errors: object[], warnings: object[] }}
 */
export function lintLocalePair(en, locale, lang, opts = {}) {
  const allow = opts.allow || { keep: [], identical: [], unknown: [] };
  const keep = new Set([...(allow.keep || []), ...((locale && locale._meta && locale._meta.keep) || [])]);
  const identicalOk = new Set(allow.identical || []);
  const unknownOk = new Set(allow.unknown || []);
  const errors = [];
  const warnings = [];
  const enKeys = Object.keys(en).filter((k) => k !== "_meta" && k !== "_renamed");
  const locKeys = Object.keys(locale || {}).filter((k) => k !== "_meta" && k !== "_renamed");
  const enSet = new Set(enKeys);
  const locSet = new Set(locKeys);

  for (const k of locKeys) {
    if (!enSet.has(k)) {
      if (unknownOk.has(`${lang}::${k}`)) continue;
      errors.push({ code: "unknown-key", lang, key: k, msg: `unknown key (not in en): ${k}` });
    }
  }

  let missing = 0;
  for (const k of enKeys) {
    if (!locSet.has(k)) {
      missing++;
      warnings.push({ code: "missing-key", lang, key: k, msg: `missing key: ${k}` });
    }
  }
  if (enKeys.length) {
    const covered = ((enKeys.length - missing) / enKeys.length) * 100;
    warnings.push({
      code: "coverage",
      lang,
      msg: `coverage ${covered.toFixed(1)}% (${enKeys.length - missing}/${enKeys.length})`,
      coverage: covered,
    });
  }

  const requiredCats = pluralCategoriesFor(lang);

  for (const k of locKeys) {
    if (!enSet.has(k)) continue;
    const ev = en[k];
    const lv = locale[k];

    const checkOne = (val, pathSuffix) => {
      const label = pathSuffix ? `${k}${pathSuffix}` : k;
      if (val == null || val === "") {
        errors.push({ code: "empty", lang, key: label, msg: `empty string: ${label}` });
        return;
      }
      if (typeof val !== "string") {
        errors.push({ code: "type", lang, key: label, msg: `expected string: ${label}` });
        return;
      }
      if (isBadChars(val)) {
        errors.push({ code: "bad-chars", lang, key: label, msg: `control/mojibake chars: ${label}` });
      }
      if (!braceBalanceOk(val)) {
        errors.push({ code: "braces", lang, key: label, msg: `unbalanced braces: ${label}` });
      }
    };

    if (Array.isArray(lv)) {
      if (!Array.isArray(ev)) {
        errors.push({ code: "type", lang, key: k, msg: `pool in locale but string in en: ${k}` });
        continue;
      }
      if (!lv.length) {
        errors.push({ code: "empty", lang, key: k, msg: `empty pool: ${k}` });
        continue;
      }
      const sets = lv.map((v, i) => {
        checkOne(v, `[${i}]`);
        return extractPlaceholders(v).join(",");
      });
      const first = sets[0];
      if (sets.some((s) => s !== first)) {
        errors.push({ code: "pool-slots", lang, key: k, msg: `pool variants have unequal placeholder sets: ${k}` });
      }
      const enSlots = extractPlaceholders(ev[0] != null ? ev[0] : "").join(",");
      // Compare pool against English first variant's slots (plan: same slot set).
      const enAll = new Set();
      for (const s of ev) for (const p of extractPlaceholders(s)) enAll.add(p);
      const locAll = new Set();
      for (const s of lv) for (const p of extractPlaceholders(s)) locAll.add(p);
      const enSorted = [...enAll].sort().join(",");
      const locSorted = [...locAll].sort().join(",");
      if (enSorted !== locSorted) {
        errors.push({
          code: "placeholders",
          lang,
          key: k,
          msg: `placeholder set differs for ${k}: en={${enSorted}} locale={${locSorted}}`,
          en: [...enAll].sort(),
          locale: [...locAll].sort(),
        });
      }
      void enSlots;
      continue;
    }

    checkOne(lv, "");
    if (typeof lv !== "string") continue;

    const enStr = typeof ev === "string" ? ev : Array.isArray(ev) ? String(ev[0] || "") : "";
    const enPh = extractPlaceholders(enStr);
    const locPh = extractPlaceholders(lv);
    if (enPh.join(",") !== locPh.join(",")) {
      errors.push({
        code: "placeholders",
        lang,
        key: k,
        msg: `placeholder set differs for ${k}: en={${enPh}} locale={${locPh}}`,
        en: enPh,
        locale: locPh,
      });
    }

    const plural = extractPluralForms(lv);
    if (plural) {
      for (const cat of requiredCats) {
        if (!(cat in plural.forms)) {
          errors.push({
            code: "plural-category",
            lang,
            key: k,
            msg: `missing CLDR plural category "${cat}" for ${lang} in ${k}`,
            missing: cat,
            have: Object.keys(plural.forms),
            need: requiredCats,
          });
        }
      }
    } else if (extractPluralForms(enStr)) {
      // English has a plural; locale must too.
      errors.push({
        code: "plural-category",
        lang,
        key: k,
        msg: `English has a plural form but locale does not: ${k}`,
        need: requiredCats,
      });
    }

    if (lang !== "en" && lang !== "en-XA" && lv === enStr && !keep.has(k) && !identicalOk.has(`${lang}::${k}`)) {
      errors.push({
        code: "identical",
        lang,
        key: k,
        msg: `translation identical to English (mark keep or allowlist): ${k}`,
      });
    }

    if (typeof ev === "string" && ev.length && lv.length > ev.length * 1.5) {
      warnings.push({
        code: "over-length",
        lang,
        key: k,
        msg: `over-length (>150% of en): ${k} (${lv.length}/${ev.length})`,
      });
    }
  }

  return { errors, warnings };
}

/** Lint a locales directory. `en.json` is required. */
export function lintLocalesDir(dir, opts = {}) {
  const root = opts.root || ROOT;
  const abs = path.isAbsolute(dir) ? dir : path.join(root, dir);
  const enPath = path.join(abs, "en.json");
  if (!fs.existsSync(enPath)) {
    return {
      errors: [{ code: "no-en", msg: `missing ${path.relative(root, enPath) || "en.json"}` }],
      warnings: [],
      languages: [],
    };
  }
  const en = readJson(enPath);
  const allow = opts.allow || readAllowlist(root);
  const errors = [];
  const warnings = [];
  const languages = [];

  // Validate English itself (structure only — no unknown-key vs itself).
  for (const [k, v] of Object.entries(en)) {
    if (k === "_meta" || k === "_renamed") continue;
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] !== "string" || v[i] === "") {
          errors.push({ code: "empty", lang: "en", key: `${k}[${i}]`, msg: `en empty/non-string: ${k}[${i}]` });
        } else if (!braceBalanceOk(v[i])) {
          errors.push({ code: "braces", lang: "en", key: `${k}[${i}]`, msg: `en unbalanced braces: ${k}[${i}]` });
        }
      }
    } else if (typeof v !== "string" || v === "") {
      errors.push({ code: "empty", lang: "en", key: k, msg: `en empty/non-string: ${k}` });
    } else if (!braceBalanceOk(v)) {
      errors.push({ code: "braces", lang: "en", key: k, msg: `en unbalanced braces: ${k}` });
    }
  }

  for (const name of fs.readdirSync(abs).sort()) {
    if (!name.endsWith(".json") || name === "en.json" || name === "manifest.json") continue;
    const lang = name.slice(0, -5);
    languages.push(lang);
    const locale = readJson(path.join(abs, name));
    const r = lintLocalePair(en, locale, lang, { allow });
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }

  return { errors, warnings, languages };
}

function propName(m) {
  if (!m || m.type !== "MemberExpression") return null;
  if (!m.computed && m.property.type === "Identifier") return m.property.name;
  if (m.computed && m.property.type === "Literal" && typeof m.property.value === "string") return m.property.value;
  return null;
}

function isI18nT(node) {
  return node && node.type === "CallExpression"
    && node.callee && node.callee.type === "MemberExpression"
    && !node.callee.computed
    && node.callee.object.type === "Identifier" && node.callee.object.name === "I18n"
    && node.callee.property.type === "Identifier" && node.callee.property.name === "t";
}

/** True when the expression is only I18n.t(...) (optionally nested in ternary/parens). */
function isI18nOnly(n) {
  if (!n) return false;
  if (isI18nT(n)) return true;
  if (n.type === "ConditionalExpression") return isI18nOnly(n.consequent) && isI18nOnly(n.alternate);
  if (n.type === "ParenthesizedExpression") return isI18nOnly(n.expression);
  return false;
}

function literalHasLetters(n) {
  if (!n) return false;
  if (n.type === "Literal" && typeof n.value === "string") return LETTER_RUN.test(n.value);
  if (n.type === "TemplateLiteral") {
    return n.quasis.some((q) => LETTER_RUN.test(q.value.cooked || q.value.raw || ""));
  }
  if (n.type === "BinaryExpression" && n.operator === "+") {
    return literalHasLetters(n.left) || literalHasLetters(n.right);
  }
  if (n.type === "ConditionalExpression") {
    return literalHasLetters(n.consequent) || literalHasLetters(n.alternate);
  }
  return false;
}

function snippetOf(src, n, max = 48) {
  const t = src.slice(n.range[0], n.range[1]).replace(/\s+/g, " ").trim();
  return t.length <= max ? t : t.slice(0, max - 1) + "…";
}

const ATTR_SINKS = new Set(["aria-label", "title", "placeholder"]);

/** Literal user-facing strings reaching sinks in one source. */
export function guardSource(src, file = "<src>") {
  let ast;
  try { ast = espree.parse(src, { ecmaVersion: 2022, loc: true, range: true }); }
  catch (e) { return { file, parseError: e.message, sites: [] }; }
  const sites = [];

  each(ast, (n) => {
    if (n.type === "AssignmentExpression" && (n.operator === "=" || n.operator === "+=")) {
      const p = propName(n.left);
      if (p !== "textContent") return;
      if (isI18nOnly(n.right)) return;
      if (!literalHasLetters(n.right)) return;
      sites.push({
        line: n.loc.start.line,
        sink: "textContent",
        snippet: snippetOf(src, n.right),
        key: `${file}::textContent::${snippetOf(src, n.right, 64)}`,
      });
    } else if (n.type === "CallExpression") {
      const pn = propName(n.callee);
      if (pn === "setAttribute" && n.arguments.length >= 2) {
        const a0 = n.arguments[0];
        const attr = a0 && a0.type === "Literal" && typeof a0.value === "string" ? a0.value : null;
        if (!attr || !ATTR_SINKS.has(attr)) return;
        const a1 = n.arguments[1];
        if (isI18nOnly(a1)) return;
        if (!literalHasLetters(a1)) return;
        sites.push({
          line: n.loc.start.line,
          sink: `setAttribute(${attr})`,
          snippet: snippetOf(src, a1),
          key: `${file}::setAttribute(${attr})::${snippetOf(src, a1, 64)}`,
        });
      } else if (
        n.callee && n.callee.type === "MemberExpression"
        && !n.callee.computed
        && n.callee.object.type === "Identifier" && n.callee.object.name === "Dom"
        && n.callee.property.type === "Identifier" && n.callee.property.name === "el"
      ) {
        // Dom.el(tag, attrs, text) — text is arguments[2]
        const textArg = n.arguments[2];
        if (!textArg || isI18nOnly(textArg) || !literalHasLetters(textArg)) return;
        sites.push({
          line: n.loc.start.line,
          sink: "Dom.el",
          snippet: snippetOf(src, textArg),
          key: `${file}::Dom.el::${snippetOf(src, textArg, 64)}`,
        });
      }
    }
  });
  return { file, parseError: null, sites };
}

/** Guard every migrated JS file; HTML sections are listed for future slices. */
export function guardMigrated(root = ROOT) {
  const mig = readMigrated(root);
  const allow = mig.allow || {};
  const unaudited = [];
  const stale = [];
  const parseErrors = [];
  const got = new Set();

  for (const rel of mig.files) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) {
      parseErrors.push({ file: rel, parseError: "file missing" });
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    const r = guardSource(src, rel);
    if (r.parseError) parseErrors.push({ file: rel, parseError: r.parseError });
    for (const s of r.sites) {
      got.add(s.key);
      if (!allow[s.key]) unaudited.push(Object.assign({ file: rel }, s));
    }
  }

  for (const k of Object.keys(allow)) {
    if (!got.has(k)) stale.push(k);
  }

  // HTML sections: a migrated #id must have data-i18n on text/aria nodes once
  // slices start; with an empty html list this is a no-op. When listed, flag
  // bare text Content longer than 2 letters without data-i18n (best-effort regex).
  const htmlHits = [];
  if (mig.html && mig.html.length && fs.existsSync(path.join(root, "index.html"))) {
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    for (const sel of mig.html) {
      const id = sel.startsWith("#") ? sel.slice(1) : sel;
      const re = new RegExp(`id=["']${id}["'][^>]*>([\\s\\S]*?)</`, "i");
      const m = re.exec(html);
      if (!m) continue;
      const chunk = m[1];
      // Flag a text-bearing tag without data-i18n / data-i18n-attr nearby.
      const bare = />([^<]*[A-Za-z]{3,}[^<]*)</g;
      let bm;
      while ((bm = bare.exec(chunk))) {
        const before = chunk.slice(Math.max(0, bm.index - 120), bm.index);
        if (/data-i18n(?:-attr)?=/.test(before)) continue;
        htmlHits.push({ sel, text: bm[1].trim().slice(0, 40) });
      }
    }
  }

  return { unaudited, stale, parseErrors, htmlHits, migrated: mig };
}

export function run(argv = process.argv.slice(2), root = ROOT) {
  const json = argv.includes("--json");
  const guard = argv.includes("--guard");
  const di = argv.indexOf("--dir");
  const dirArg = di >= 0 ? argv[di + 1] : "locales";

  if (guard) {
    const a = guardMigrated(root);
    if (json) console.log(JSON.stringify(a, null, 2));
    else {
      for (const s of a.unaudited) {
        console.log(`UNAUDITED ${s.file}:${s.line}  ${s.sink}  ${s.snippet}`);
      }
      for (const k of a.stale) console.log(`STALE allow entry: ${k}`);
      for (const p of a.parseErrors) console.log(`PARSE ${p.file}: ${p.parseError}`);
      for (const h of a.htmlHits) console.log(`HTML bare text in ${h.sel}: ${h.text}`);
      if (a.unaudited.length) {
        console.log(`\nFix: wrap with I18n.t(key, vars, "English"), or add a reasoned row to ${MIGRATED} allow.`);
      }
    }
    const bad = a.unaudited.length + a.stale.length + a.parseErrors.length + a.htmlHits.length;
    return { ok: bad === 0, kind: "guard", result: a, exitCode: bad ? 1 : 0 };
  }

  const r = lintLocalesDir(dirArg, { root });
  if (json) console.log(JSON.stringify(r, null, 2));
  else {
    for (const e of r.errors) console.log(`FAIL ${e.lang || ""} ${e.msg}`);
    for (const w of r.warnings) {
      if (w.code === "coverage") console.log(`WARN ${w.lang} ${w.msg}`);
      else console.log(`WARN ${w.lang || ""} ${w.msg}`);
    }
    if (!r.errors.length) {
      console.log(`ok  i18n-lint locales (${r.languages.length} non-en language(s))`);
    }
  }
  return { ok: r.errors.length === 0, kind: "locales", result: r, exitCode: r.errors.length ? 1 : 0 };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const out = run();
  process.exit(out.exitCode);
}
