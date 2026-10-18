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
        const q = new URLSearchParams(search).get("lang");
        return q && q.trim() ? q.trim() : null;
      }
      const m = /(?:^|[?&])lang=([^&]+)/.exec(search);
      return m && m[1] ? decodeURIComponent(m[1]).trim() : null;
    } catch (_) {
      return null;
    }
  }

  function readSavedLang() {
    if (typeof GameStore === "undefined") return null;
    const v = GameStore.store.get(LANG_KEY, null);
    return typeof v === "string" && v.trim() ? v.trim() : null;
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

  function resolvePlural(msg, lang, vars) {
    return String(msg).replace(/\{(\w+),\s*plural,\s*((?:\w+\s+\{[^}]*\}\s*)+)\}/g, (full, anchor, body) => {
      const n = Number(vars && vars[anchor] != null ? vars[anchor] : 0);
      const forms = parsePluralForms(body);
      const cat = new Intl.PluralRules(baseLang(lang)).select(n);
      let pick = forms[cat];
      if (pick == null) pick = forms.other;
      if (pick == null) pick = forms.one || "";
      return fillPlaceholders(pick.replace(/#/g, String(n)), vars);
    });
  }

  function formatMessage(msg, vars, lang) {
    let s = resolvePlural(msg, lang, vars || {});
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
    if (!fmtCache[k]) fmtCache[k] = new Intl.NumberFormat(baseLang(lang), opts);
    return fmtCache[k].format(x);
  }

  function date(d, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "d:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.DateTimeFormat(baseLang(lang), opts);
    return fmtCache[k].format(d);
  }

  function rel(value, unit, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "rel:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.RelativeTimeFormat(baseLang(lang), opts);
    return fmtCache[k].format(value, unit);
  }

  function list(arr, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "list:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.ListFormat(baseLang(lang), opts);
    return fmtCache[k].format(arr);
  }

  function country(code, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "country:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.DisplayNames([baseLang(lang)], { type: "region", ...opts });
    return fmtCache[k].of(code);
  }

  function compare(a, b, opts) {
    const lang = activeLang;
    const k = cacheKey(lang, "cmp:" + JSON.stringify(opts || {}));
    if (!fmtCache[k]) fmtCache[k] = new Intl.Collator(baseLang(lang), opts);
    return fmtCache[k].compare(a, b);
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

  async function loadCatalog(lang) {
    catalog = Object.create(null);
    fmtCache = Object.create(null);
    if (lang === "en" || lang === "en-XA") {
      readyDone = true;
      return;
    }
    await loadManifest();
    const hash = manifestHash(lang);
    const url = "locales/" + encodeURIComponent(lang) + ".json" + (hash ? "?v=" + hash : "");
    try {
      catalog = await fetchJson(url);
    } catch (e) {
      if (typeof Log !== "undefined") Log.warn("i18n", "locale fetch failed; falling back to English defaults", lang, e);
      catalog = Object.create(null);
    }
    readyDone = true;
  }

  async function boot(lang) {
    const next = lang || resolveDetectOrder();
    activeLang = next;
    setHtmlLang(next);
    readyDone = false;
    readyPromise = loadCatalog(next).then(() => {
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
    const next = String(lang || "en").trim() || "en";
    const persist = !(opts && opts.persist === false);
    if (persist && typeof GameStore !== "undefined") GameStore.store.set(LANG_KEY, next);
    await boot(next);
    if (typeof I18nDom !== "undefined") I18nDom.apply();
    return next;
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
    return new Intl.PluralRules(baseLang(lang)).resolvedOptions().pluralCategories;
  }

  if (typeof document !== "undefined") {
    const start = () => { boot(); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  }

  return {
    t, n, date, rel, list, country, compare,
    lang, set, ready, onChange, dir, boot,
    pluralCategories,
    _installCatalog, _resetForTest, _detect: resolveDetectOrder,
  };
})();

if (typeof window !== "undefined") window.I18n = I18n;
