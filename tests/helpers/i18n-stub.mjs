/* Minimal I18n for vm harnesses that load js/ modules calling I18n.n / I18n.date / I18n.t (English defaults). */
export function i18nStub() {
  return {
    t: (k, vars, d) => String(d == null ? k : d).replace(/\{(\w+)\}/g, (m, n) => (vars && vars[n] != null ? String(vars[n]) : m)),
    n: (x, o) => new Intl.NumberFormat("en", o).format(x),
    date: (d, o) => new Intl.DateTimeFormat("en", o).format(d),
    lang: () => "en",
  };
}
