const BridgeLink = (function () {
  "use strict";

  const TOKEN_KEY = "apex26.bridgeToken";
  const DEFAULT_ISSUE = 5168;

  let _dlg = null, _ui = null, _timer = null, _loading = false, _note = "", _deps = null;

  const bridge = () => (typeof ApexBridge !== "undefined" ? ApexBridge : null);
  function hasToken() {
    try { return !!localStorage.getItem(TOKEN_KEY); } catch (_) { return false; }
  }
  function badgeText() {
    try { const b = document.getElementById("apex-bridge-badge"); return b ? String(b.textContent || "") : ""; } catch (_) { return ""; }
  }

  function parseIssue(v) {
    const m = /^\s*#?(\d{1,7})\s*$/.exec(String(v == null ? "" : v));
    const n = m ? Number(m[1]) : 0;
    return n > 0 ? n : 0;
  }
  function rebuild(search, issue) {
    const q = new URLSearchParams(search || "");
    q.delete("apex"); q.delete("bridge"); q.delete("b");
    if (issue) { q.set("apex", "1"); q.set("bridge", String(issue)); }
    const s = q.toString();
    return s ? "?" + s : "";
  }
  const linkedSearch = (search, issue) => rebuild(search, issue);
  const unlinkedSearch = (search) => rebuild(search, 0);
  function issueInSearch(search) {
    const m = /[?&]bridge=(\d+)(&|$)/.exec(search || "");
    return m ? Number(m[1]) : 0;
  }
  function setSearch(s) {
    try { history.replaceState(history.state, "", location.pathname + s + location.hash); return true; } catch (_) { return false; }
  }

  function phaseOf(s) {
    if (s.active) return /·/.test(s.badge || "") ? "live" : "connecting";
    if (s.loading) return "loading";
    return /^CLAUDE LINK OFF/.test(s.badge || "") ? "ended" : "idle";
  }
  function view(s) {
    const phase = phaseOf(s), linked = phase === "live" || phase === "connecting";
    const why = (/^CLAUDE LINK OFF — (.*)$/.exec(s.badge || "") || [])[1] || "";
    const served = (/· (\d+) ·/.exec(s.badge || "") || [])[1];
    const status = s.note ? s.note
      : phase === "live" ? "LINKED to issue #" + s.issue + " · " + (served || "0") + " commands answered. Keep the app in front."
      : phase === "connecting" ? "Posting the hello to issue #" + s.issue + "…"
      : phase === "loading" ? "Loading the link code…"
      : phase === "ended" ? "Link ended" + (why ? ": " + why : "") + "."
      : s.hasToken ? "Not linked. A token is saved on this device." : "Not linked. Paste the GitHub token for this device.";
    return {
      phase, status,
      primary: linked ? "UNLINK" : "LINK",
      busy: phase === "loading",
      issueField: !linked && phase !== "loading",
      tokenField: !linked && phase !== "loading" && !s.hasToken,
      forget: !linked && phase !== "loading" && !!s.hasToken,
    };
  }
  function state() {
    const b = bridge();
    return { active: !!(b && b.active()), loading: _loading, badge: badgeText(), hasToken: hasToken(), note: _note,
      issue: issueInSearch(typeof location !== "undefined" ? location.search : "") };
  }

  async function link(issueRaw, tokenRaw, deps) {
    const issue = parseIssue(issueRaw);
    if (!issue) return { ok: false, error: "Enter the bridge issue number." };
    const typed = String(tokenRaw == null ? "" : tokenRaw).trim();
    if (!typed && !hasToken()) return { ok: false, error: "Paste the GitHub token first." };
    const b0 = bridge();
    if (b0 && b0.active()) return { ok: false, error: "Already linked. UNLINK first." };
    if (typed) {
      try { localStorage.setItem(TOKEN_KEY, typed); } catch (_) { return { ok: false, error: "This app cannot store the token (storage is blocked)." }; }
    }
    if (!setSearch(linkedSearch(location.search, issue))) return { ok: false, error: "This app could not set the link address." };
    _loading = true;
    try { await deps.loadAgentSurface(); } catch (_) {  }
    _loading = false;
    const b = bridge();
    if (!b) {
      setSearch(unlinkedSearch(location.search));
      return { ok: false, error: "The link code did not load (offline, or the app needs its update). Nothing was sent." };
    }
    if (b0 && !b.active()) b.boot();
    return { ok: true, issue };
  }
  function unlink() {
    const b = bridge();
    if (b && b.active()) b.stop("ended on the phone");
    if (typeof location !== "undefined") setSearch(unlinkedSearch(location.search));
    return true;
  }
  function forget() {
    try { localStorage.removeItem(TOKEN_KEY); } catch (_) {  }
  }

  const BTN = "min-height:48px;padding:0 14px;border:0;border-radius:10px;font:700 15px/1 system-ui,sans-serif;"
    + "color:#fff;letter-spacing:.04em;touch-action:manipulation";
  const FIELD = "min-height:48px;min-width:0;box-sizing:border-box;padding:0 10px;border-radius:10px;border:1px solid #666;"
    + "background:#000;color:#fff;font:16px system-ui,sans-serif;-webkit-user-select:text;user-select:text;touch-action:auto";

  function build() {
    const mk = (tag, css, text) => { const n = document.createElement(tag); if (css) n.style.cssText = css; if (text) n.textContent = text; return n; };
    const el = (tag, cls) => { const n = document.createElement(tag); n.className = cls; return n; };
    const dlg = el("dialog", "apex-bridge-link");
    dlg.style.cssText = "z-index:99998;position:fixed;inset:0;margin:auto;height:fit-content;box-sizing:border-box;border:0;border-radius:14px;padding:14px;background:#1b1d22;color:#eee;"
      + "font:14px/1.4 system-ui,sans-serif;width:min(560px,calc(100vw - 24px - env(safe-area-inset-left,0px) - env(safe-area-inset-right,0px)));"
      + "max-height:calc(100vh - 16px - env(safe-area-inset-bottom,0px));overflow:auto;-webkit-user-select:text;user-select:text";
    dlg.id = "bridge-link";
    dlg.setAttribute("aria-label", "Claude link");
    const form = mk("form", "display:grid;gap:10px;margin:0");
    form.method = "dialog";
    const status = mk("p", "margin:0;font-weight:600");
    status.setAttribute("role", "status");
    const fields = mk("div", "display:flex;gap:8px");
    const issue = mk("input", FIELD + ";flex:0 0 96px;width:96px");
    issue.type = "text"; issue.inputMode = "numeric"; issue.autocomplete = "off"; issue.id = "bridge-link-issue";
    issue.setAttribute("aria-label", "Bridge issue number");
    const token = mk("input", FIELD + ";flex:1 1 0");
    token.type = "password"; token.autocomplete = "off"; token.id = "bridge-link-token"; token.placeholder = "GitHub token";
    token.setAttribute("aria-label", "GitHub token");
    const paste = mk("button", BTN + ";background:#444", "PASTE");
    paste.type = "button";
    fields.append(issue, token, paste);
    const acts = mk("div", "display:flex;gap:8px;flex-wrap:wrap");
    const go = mk("button", BTN + ";flex:2 1 140px;background:#d97757", "LINK");
    go.type = "submit"; go.id = "bridge-link-go"; go.autofocus = true;
    const drop = mk("button", BTN + ";flex:1 1 auto;background:#444", "FORGET TOKEN");
    drop.type = "button";
    const done = mk("button", BTN + ";flex:1 1 auto;background:#444", "CLOSE");
    done.type = "button";
    acts.append(go, drop, done);
    const help = mk("p", "margin:0;font-size:12px;color:#bbb", "The issue is public: this phone's device facts and every answer are posted there. "
      + "Only the repository owner's comments are run. The token (fine-grained, Issues read and write, this repository only) stays on this device.");
    form.append(status, fields, acts, help);
    dlg.appendChild(form);
    const shield = (e) => { if (dlg.contains(e.target)) e.stopImmediatePropagation(); };
    window.addEventListener("focusin", shield, true);

    const submit = async () => {
      if (view(state()).primary === "UNLINK") { _note = ""; unlink(); paint(); return; }
      _note = "";
      const p = link(issue.value, token.value, _deps);
      token.value = "";
      paint();
      const r = await p;
      _note = r.ok ? "" : r.error;
      paint();
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    paste.addEventListener("click", async () => {
      try { token.value = String(await navigator.clipboard.readText() || "").trim(); _note = token.value ? "Token pasted. Tap LINK." : "The clipboard is empty."; }
      catch (e) { _note = "Paste refused (" + (e && e.name) + "): long-press the token box and Paste."; }
      paint();
    });
    drop.addEventListener("click", () => { forget(); _note = "Token removed from this device."; paint(); });
    done.addEventListener("click", close);
    dlg.addEventListener("close", () => { clearInterval(_timer); _timer = null; });
    document.body.appendChild(dlg);
    _ui = { status, issue, token, paste, go, drop, fields };
    return dlg;
  }

  function paint() {
    if (!_ui) return;
    const s = state(), v = view(s);
    _ui.status.textContent = v.status;
    _ui.go.textContent = v.busy ? "LOADING…" : v.primary;
    _ui.go.disabled = v.busy;
    _ui.fields.style.display = v.issueField ? "flex" : "none";
    _ui.token.style.display = _ui.paste.style.display = v.tokenField ? "" : "none";
    _ui.drop.style.display = v.forget ? "" : "none";
  }

  function open(deps) {
    if (typeof document === "undefined" || !document.body) return false;
    _deps = deps || _deps;
    if (!_dlg) _dlg = build();
    _note = "";
    if (!_ui.issue.value) _ui.issue.value = String(issueInSearch(location.search) || DEFAULT_ISSUE);
    paint();
    try { if (!_dlg.open) _dlg.showModal(); } catch (_) { _dlg.setAttribute("open", ""); }
    if (!_timer) _timer = setInterval(paint, 500);
    return true;
  }
  function close() {
    try { if (_dlg && _dlg.open) _dlg.close(); } catch (_) {  }
    clearInterval(_timer); _timer = null;
  }

  try {
    document.addEventListener("click", (e) => {
      const b = bridge();
      if (!e.target || e.target.id !== "apex-bridge-badge" || !b || !b.active()) return;
      setTimeout(() => { if (!b.active()) setSearch(unlinkedSearch(location.search)); }, 0);
    }, true);
  } catch (_) {  }

  return { TOKEN_KEY, DEFAULT_ISSUE, parseIssue, linkedSearch, unlinkedSearch, phaseOf, view, link, unlink, forget, open, close };
})();
Object.freeze(BridgeLink);
