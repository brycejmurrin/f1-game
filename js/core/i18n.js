/* Apex 26 — gettext-style I18n: English defaults at the call site, optional locale JSON. */
const I18n = (function () {
  "use strict";

  const LANG_KEY = "lang";
  const MANIFEST_URL = "locales/manifest.json";

  let activeLang = "en";
  let manifest = null;
  let catalog = Object.create(null);
  let readyPromise = null;
  let readyDone = false;
  const listeners = new Set();
  let fmtCache = Object.create(null);

  // Shipped locales (i18n-lang-validate.test.mjs pins it); any other tag is "en" (W34).
  const SHIPPED_LANGS = Object.freeze(["en"]);
  const PSEUDO_LANGS = Object.freeze(["en-XA"]);   // built in code (I18nPseudo), no file
  const MAX_TAG = 35;
  const TAG_RE = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8}){0,3}$/;

  function wellFormed(tag) {
    if (typeof tag !== "string" || !tag || tag.length > MAX_TAG || !TAG_RE.test(tag)) return false;
    try { Intl.getCanonicalLocales(tag); return true; } catch (_) { return false; }
  }
  /** A trimmed, well-formed BCP 47 tag, or null. Never throws. */
  function cleanLang(v) {
    const tag = typeof v === "string" ? v.trim() : "";
    return wellFormed(tag) ? tag : null;
  }
  function isShipped(tag) {
    if (SHIPPED_LANGS.includes(tag) || PSEUDO_LANGS.includes(tag)) return true;
    return !!(manifest && wellFormed(tag) && Object.prototype.hasOwnProperty.call(manifest, tag));
  }
  /** An Intl locale argument that cannot throw RangeError. */
  function safeLocale(tag) {
    return wellFormed(tag) ? tag : "en";
  }

  function baseLang(lang) {
    const tag = String(lang || "en");
    if (tag === "en-XA") return "en";
    const i = tag.indexOf("-");
    return i < 0 ? tag : tag.slice(0, i);
  }

  function readQueryLang() {
    const loc = (typeof globalThis !== "undefined" && globalThis.location)
      || (typeof location !== "undefined" ? location : null);
    if (!loc) return null;
    try {
      const search = String(loc.search || "");
      if (typeof URLSearchParams !== "undefined") {
        return cleanLang(new URLSearchParams(search).get("lang"));
      }
      const m = /(?:^|[?&])lang=([^&]+)/.exec(search);
      return m && m[1] ? cleanLang(decodeURIComponent(m[1])) : null;
    } catch (_) {
      return null;
    }
  }

  function readSavedLang() {
    if (typeof GameStore === "undefined") return null;
    return cleanLang(GameStore.store.get(LANG_KEY, null));
  }

  function detectFromNavigator() {
    if (typeof navigator === "undefined" || !manifest) return "en";
    const shipped = Object.keys(manifest);
    const prefs = navigator.languages && navigator.languages.length
      ? navigator.languages
      : [navigator.language || "en"];
    for (const pref of prefs) {
      if (!pref) continue;
      const exact = pref.trim();
      if (shipped.includes(exact)) return exact;
      const base = baseLang(exact);
      const hit = shipped.find((id) => baseLang(id) === base);
      if (hit) return hit;
    }
    return "en";
  }

  function resolveDetectOrder() {
    return readQueryLang() || readSavedLang() || detectFromNavigator() || "en";
  }

  function setHtmlLang(lang) {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    if (!el) return;
    el.lang = lang === "en-XA" ? "en-XA" : baseLang(lang);
    el.dir = (manifest && manifest[lang] && manifest[lang].dir) || "ltr";
  }

  function fillPlaceholders(str, vars) {
    if (!vars) return str;
    return String(str).replace(/\{([^}]+)\}/g, (m, name) => {
      if (name === "#") return m;
      if (Object.prototype.hasOwnProperty.call(vars, name)) {
        const v = vars[name];
        return v == null ? "" : String(v);
      }
      return m;
    });
  }

  function parsePluralForms(body) {
    const forms = Object.create(null);
    const re = /(\w+)\s*\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(body))) forms[m[1]] = m[2];
    return forms;
  }

  // One PluralRules per language: construction is ~25 µs (desktop Node) and the
  // HUD's tyre chip formats a plural label every 10 Hz tick (perf hunt 6).
  const _plural = new Map();
  function pluralRules(lang) {
    const key = baseLang(lang);
    let pr = _plural.get(key);
    if (!pr) { pr = new Intl.PluralRules(safeLocale(key)); _plural.set(key, pr); }
    return pr;
  }
  function resolvePlural(msg, lang, vars) {
    return String(msg).replace(/\{(\w+),\s*plural,\s*((?:\w+\s+\{[^}]*\}\s*)+)\}/g, (full, anchor, body) => {
      const n = Number(vars && vars[anchor] != null ? vars[anchor] : 0);
      const forms = parsePluralForms(body);
      const cat = pluralRules(lang).select(n);
      let pick = forms[cat];
      if (pick == null) pick = forms.other;
      if (pick == null) pick = forms.one || "";
      return fillPlaceholders(pick.replace(/#/g, String(n)), vars);
    });
  }

  function formatMessage(msg, vars, lang) {
    const s = resolvePlural(msg, lang, vars || {});
    return fillPlaceholders(s, vars);
  }

  function pseudoMaybe(text, lang) {
    if (lang !== "en-XA" || typeof I18nPseudo === "undefined") return text;
    return I18nPseudo.expand(text);
  }

  function lookup(key, englishDefault) {
    let raw = catalog[key];
    if (raw == null && englishDefault != null) raw = englishDefault;
    if (raw == null) raw = key;
    if (Array.isArray(raw)) raw = raw[Math.floor(Math.random() * raw.length)];
    return raw;
  }

  /** The loaded catalogue's raw value (string or pool array), or null: no random pick, no English fallback. */
  function raw(key) {
    const v = catalog[key];
    return v == null ? null : v;
  }

  function t(key, vars, englishDefault) {
    const raw = lookup(key, englishDefault);
    const resolved = formatMessage(String(raw), vars, activeLang);
    return pseudoMaybe(resolved, activeLang);
  }

  function cacheKey(lang, kind) {
    return lang + ":" + kind;
  }

  function n(x, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "n:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.NumberFormat(safeLocale(baseLang(lang)), opts);
    return fmtCache[k].format(x);
  }

  function date(d, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "d:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.DateTimeFormat(safeLocale(baseLang(lang)), opts);
    return fmtCache[k].format(d);
  }

  function notify() {
    for (const fn of listeners) {
      try { fn(activeLang); } catch (e) {
        if (typeof Log !== "undefined") Log.warn("i18n", "onChange listener threw", e);
      }
    }
  }

  function manifestHash(lang) {
    const row = manifest && manifest[lang];
    return row && row.hash ? row.hash : null;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) throw new Error("fetch " + url + " " + res.status);
    return res.json();
  }

  async function loadManifest() {
    if (manifest) return manifest;
    try {
      manifest = await fetchJson(MANIFEST_URL);
    } catch (e) {
      manifest = { en: { name: "English", dir: "ltr", status: "reviewed", hash: "", keys: 0 } };
      if (typeof Log !== "undefined") Log.warn("i18n", "manifest fetch failed; English-only", e);
    }
    return manifest;
  }

  let loadGen = 0;
  async function loadCatalog(lang) {
    const gen = ++loadGen;   // a newer boot supersedes this load: its late fetch must not install a stale catalog
    catalog = Object.create(null);
    fmtCache = Object.create(null);
    if (lang === "en" || lang === "en-XA") {
      readyDone = true;
      return;
    }
    await loadManifest();
    if (gen !== loadGen) return;
    // Only a tag on the shipped list or the loaded manifest names a file.
    if (!isShipped(lang)) {
      if (typeof Log !== "undefined") Log.warn("i18n", "unshipped language; English", String(lang).slice(0, MAX_TAG));
      readyDone = true;
      return;
    }
    if (activeLang !== lang) { activeLang = lang; setHtmlLang(lang); }
    const hash = manifestHash(lang);
    const url = "locales/" + encodeURIComponent(lang) + ".json" + (hash ? "?v=" + hash : "");
    let loaded;
    try {
      loaded = await fetchJson(url);
    } catch (e) {
      if (typeof Log !== "undefined") Log.warn("i18n", "locale fetch failed; falling back to English defaults", lang, e);
      loaded = Object.create(null);
    }
    if (gen !== loadGen) return;
    catalog = loaded;
    readyDone = true;
  }

  async function boot(lang) {
    // A caller's tag is validated like a stored one; unconfirmed runs as "en".
    const want = lang ? (cleanLang(lang) || "en") : resolveDetectOrder();
    const next = isShipped(want) ? want : "en";
    activeLang = next;
    setHtmlLang(next);
    readyDone = false;
    readyPromise = loadCatalog(want).then(() => {
      readyDone = true;
      notify();
    });
    return readyPromise;
  }

  function lang() { return activeLang; }

  function dir() {
    return (manifest && manifest[activeLang] && manifest[activeLang].dir) || "ltr";
  }

  function onChange(fn) {
    if (typeof fn === "function") listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function ready() {
    if (readyDone) return Promise.resolve();
    if (!readyPromise) return boot();
    return readyPromise;
  }

  async function set(lang, opts) {
    const next = cleanLang(lang) || "en";
    const persist = !(opts && opts.persist === false);
    if (persist && typeof GameStore !== "undefined") GameStore.store.set(LANG_KEY, next);
    await boot(next);
    if (typeof I18nDom !== "undefined") I18nDom.apply();
    return activeLang;
  }

  /** Test-only: install a catalogue without fetch. */
  function _installCatalog(lang, table) {
    activeLang = lang;
    catalog = table ? { ...table } : Object.create(null);
    readyDone = true;
    setHtmlLang(lang);
  }

  function _resetForTest() {
    activeLang = "en";
    catalog = Object.create(null);
    manifest = null;
    readyDone = false;
    readyPromise = null;
    listeners.clear();
    fmtCache = Object.create(null);
  }

  function pluralCategories(lang) {
    return new Intl.PluralRules(safeLocale(baseLang(lang))).resolvedOptions().pluralCategories;
  }

  if (typeof document !== "undefined") {
    const start = () => { boot(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  return {
    t, raw, n, date,
    lang, set, ready, onChange, dir, boot,
    pluralCategories, SHIPPED_LANGS,
    _installCatalog, _resetForTest, _detect: resolveDetectOrder,
  };
})();

if (typeof window !== "undefined") window.I18n = I18n;
