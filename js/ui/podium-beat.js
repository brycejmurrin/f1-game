/* Apex 26 — PodiumBeat: ceremony podium overlay (#4070 / plan slice 4).
 * Mounts the ResultsStory podium (top-three only) into #ceremony-podium while
 * #results stays hidden. CONTINUE (or RacePodium's timer) hands off; career /
 * season sheet buttons are untouched. Pure DOM over Dom + ResultsStory. */
const PodiumBeat = (function () {
  "use strict";

  const HOST_ID = "ceremony-podium";
  const BODY_ID = "ceremony-podium-body";
  const CONTINUE_ID = "ceremony-continue";

  let mounted = null;
  let continueHandler = null;

  function eligible(order, options) {
    if (typeof ResultsStory === "undefined" || !order || order.length < 3) return false;
    const data = ResultsStory.summary(order, options || {});
    return !!(data.podium && data.podium.length === 3);
  }

  /** Prefer querySelector: mini-dom's getElementById auto-creates empty shells. */
  function find(id) {
    return typeof document !== "undefined" ? document.querySelector("#" + id) : null;
  }

  function ensureHost() {
    if (typeof document === "undefined") return null;
    let host = find(HOST_ID);
    if (host && find(BODY_ID) && find(CONTINUE_ID) && host.contains(find(BODY_ID))) return host;
    if (!host) {
      host = Dom.el("div");
      host.id = HOST_ID;
      host.setAttribute("role", "dialog");
      host.setAttribute("aria-label", "Podium");
      (document.body || document.documentElement).appendChild(host);
    }
    host.hidden = true;
    host.setAttribute("data-ceremony-phase", "");
    let body = find(BODY_ID);
    if (!body || (body.parentNode !== host)) {
      body = Dom.el("div");
      body.id = BODY_ID;
      host.appendChild(body);
    }
    let cont = find(CONTINUE_ID);
    if (!cont || !host.contains(cont)) {
      let foot = host.querySelector(".sheet-foot");
      if (!foot) {
        foot = Dom.el("div", "sheet-foot");
        host.appendChild(foot);
      }
      cont = Dom.el("button", "bigbtn");
      cont.id = CONTINUE_ID;
      cont.type = "button";
      cont.textContent = "CONTINUE";
      cont.hidden = true;
      foot.appendChild(cont);
    }
    return host;
  }

  function onContinueClick(ev) {
    if (ev) ev.preventDefault();
    const fn = continueHandler;
    continueHandler = null;
    if (fn) fn();
  }

  /** Mount the podium overlay. opts.onContinue fires once (CONTINUE or caller). */
  function mount(G, order, options, opts) {
    const o = opts || {};
    if (!eligible(order, options)) return null;
    dismount();
    const host = ensureHost();
    if (!host) return null;
    const body = find(BODY_ID) || host;
    const story = ResultsStory.render(G, order, options || {});
    if (!story) return null;
    // Ceremony beat shows the podium tiles; keep the story head as caption.
    while (body.firstChild) body.removeChild(body.firstChild);
    body.appendChild(story);
    host.hidden = false;
    host.setAttribute("data-ceremony-phase", "podium");
    const cont = find(CONTINUE_ID);
    if (cont) {
      cont.hidden = false;
      continueHandler = typeof o.onContinue === "function" ? o.onContinue : null;
      cont.addEventListener("click", onContinueClick);
    }
    mounted = { host, order };
    return mounted;
  }

  function dismount() {
    const cont = find(CONTINUE_ID);
    if (cont) {
      cont.removeEventListener("click", onContinueClick);
      cont.hidden = true;
    }
    continueHandler = null;
    const host = find(HOST_ID);
    if (host) {
      host.hidden = true;
      host.setAttribute("data-ceremony-phase", "");
      const body = find(BODY_ID);
      if (body) while (body.firstChild) body.removeChild(body.firstChild);
    }
    mounted = null;
  }

  function visible() {
    return !!(mounted && mounted.host && !mounted.host.hidden);
  }

  function phaseAttr() {
    const host = find(HOST_ID);
    return host ? (host.getAttribute("data-ceremony-phase") || "") : "";
  }

  return { HOST_ID, BODY_ID, CONTINUE_ID, eligible, ensureHost, mount, dismount, visible, phaseAttr };
})();
Object.freeze(PodiumBeat);
