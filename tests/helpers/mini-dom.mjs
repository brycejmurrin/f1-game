/* mini-dom.mjs — the smallest DOM that lets a js/game/* UI module run in a
 * Node VM: elements with attributes / dataset / classList / children, a
 * document with getElementById (auto-creating, like tools/lib/game-vm.cjs's) and
 * createElement, focus() that moves document.activeElement, and a selector
 * matcher just big enough for the queries the menu modules make
 * (`#id`, `.class`, `tag`, `[attr]`, `[attr="v"]`, `:scope > sel`, and
 * comma lists). Listeners are kept per element and fired by dispatch(el, ev).
 *
 * It is deliberately not a layout engine: getBoundingClientRect and the
 * client/offset sizes come from the `rect` / `size` options a test passes, so
 * a test states the geometry it is about instead of inheriting one.
 *
 *   const dom = makeDom();
 *   const btn = dom.byId("btn-cam");             // auto-created button-ish element
 *   sandbox.document = dom.document;
 *   dom.dispatch(el, { type: "keydown", key: "ArrowRight" });
 */

function matchesSimple(el, sel) {
  sel = sel.trim();
  if (!sel) return true;
  // `:not(inner)` clauses (FOCUSABLE uses `button:not([disabled])`): peel them
  // off, require each inner NOT to match, then match the remainder.
  const nots = [];
  sel = sel.replace(/:not\(([^)]*)\)/g, (_, inner) => { nots.push(inner); return ""; });
  for (const inner of nots) if (matchesSimple(el, inner)) return false;
  if (!sel) return true;
  const m = sel.match(/^([a-zA-Z][\w-]*)?(#[\w-]+)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/);
  if (!m) return false;
  const [, tag, id, classes, attrs] = m;
  if (tag && el.tagName !== tag.toUpperCase()) return false;
  if (id && el.id !== id.slice(1)) return false;
  for (const c of (classes || "").split(".").filter(Boolean)) if (!el.classList.contains(c)) return false;
  for (const a of (attrs || "").match(/\[[^\]]+\]/g) || []) {
    const am = a.match(/^\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]$/);
    if (!am) return false;
    if (!el.hasAttribute(am[1])) return false;
    if (am[2] !== undefined && el.getAttribute(am[1]) !== am[2]) return false;
  }
  return true;
}

function descendants(el, out = []) {
  for (const c of el.children) { out.push(c); descendants(c, out); }
  return out;
}

function query(root, selector, all) {
  const hits = [];
  for (const part of selector.split(",")) {
    let sel = part.trim();
    let scope = null;
    if (sel.startsWith(":scope > ")) { scope = "child"; sel = sel.slice(9); }
    else if (sel.startsWith(":scope ")) sel = sel.slice(7);
    const pool = scope === "child" ? root.children : descendants(root);
    for (const el of pool) if (matchesSimple(el, sel) && !hits.includes(el)) { hits.push(el); if (!all) return hits; }
  }
  return hits;
}

export function makeDom(opts = {}) {
  const byId = new Map();
  const document = {};
  let activeElement = null;

  function makeElement(tag, id) {
    tag = String(tag || "div").toLowerCase();
    const attrs = new Map();
    const classes = new Set();
    const listeners = new Map();
    const el = {
      tagName: tag.toUpperCase(), nodeType: 1,
      hidden: false, disabled: false, checked: false, tabIndex: -1,
      textContent: "", value: "", title: "", type: "",
      dataset: {}, children: [], parentNode: null, parentElement: null,
      style: (() => { const st = {}; return { getPropertyValue: (k) => st[k] || "", setProperty: (k, v) => { st[k] = String(v); }, removeProperty: (k) => { delete st[k]; }, _decls: st }; })(),
      _listeners: listeners,
      classList: {
        add: (...c) => c.forEach((x) => classes.add(x)), remove: (...c) => c.forEach((x) => classes.delete(x)),
        toggle: (c, force) => { const on = force === undefined ? !classes.has(c) : !!force; if (on) classes.add(c); else classes.delete(c); return on; },
        contains: (c) => classes.has(c), _set: classes,
      },
      get className() { return [...classes].join(" "); },
      set className(v) { classes.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => classes.add(c)); },
      get id() { return attrs.get("id") || ""; },
      set id(v) { if (attrs.get("id")) byId.delete(attrs.get("id")); attrs.set("id", String(v)); byId.set(String(v), el); },
      setAttribute: (k, v) => { attrs.set(k, String(v)); if (k === "id") byId.set(String(v), el); },
      getAttribute: (k) => (attrs.has(k) ? attrs.get(k) : null),
      hasAttribute: (k) => attrs.has(k),
      removeAttribute: (k) => { attrs.delete(k); },
      appendChild: (c) => { el.children.push(c); c.parentNode = c.parentElement = el; return c; },
      append: (...cs) => cs.forEach((c) => c && typeof c === "object" && el.appendChild(c)),
      insertBefore: (c, ref) => { const i = ref ? el.children.indexOf(ref) : -1; if (i >= 0) el.children.splice(i, 0, c); else el.children.push(c); c.parentNode = c.parentElement = el; return c; },
      removeChild: (c) => { const i = el.children.indexOf(c); if (i >= 0) { el.children.splice(i, 1); c.parentNode = c.parentElement = null; } return c; },
      replaceChildren: (...cs) => { el.children.length = 0; el.append(...cs); },
      remove: () => { if (el.parentNode) el.parentNode.removeChild(el); },
      contains: (n) => n === el || descendants(el).includes(n),
      /* Registries that hold DOM nodes have to be able to ask whether a node is
         still in the tree — a strong Set plus a ResizeObserver keeps a detached
         subtree (and its canvases) alive otherwise. Derived by walking to the
         root, so a detach ANYWHERE above the node counts, not just on the node.
         Writable because older tests stub it directly to stand an element up as
         connected or not without building a tree; an explicit write wins, and
         `delete el.isConnected`-style reset is `el._connected = undefined`. */
      get isConnected() {
        if (el._connected !== undefined) return el._connected;
        for (let n = el; n; n = n.parentNode) if (n === documentElement) return true;
        return false;
      },
      set isConnected(v) { el._connected = !!v; },
      closest: (sel) => { for (let n = el; n; n = n.parentNode) if (n.nodeType === 1 && query({ children: [n] }, sel, false).length) return n; return null; },
      matches: (sel) => query({ children: [el] }, sel, false).length > 0,
      querySelector: (sel) => query(el, sel, false)[0] || null,
      querySelectorAll: (sel) => query(el, sel, true),
      addEventListener: (t, fn) => { if (!listeners.has(t)) listeners.set(t, []); listeners.get(t).push(fn); },
      removeEventListener: (t, fn) => { const l = listeners.get(t); if (l) l.splice(l.indexOf(fn), 1); },
      dispatchEvent: (ev) => dispatch(el, ev),
      focus: () => { activeElement = el; },
      blur: () => { if (activeElement === el) activeElement = null; },
      click: () => dispatch(el, { type: "click" }),
      scrollIntoView: () => {}, scrollTo: () => {}, select: () => {}, setSelectionRange: () => {},
      getBoundingClientRect: () => (el._rect || { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
      get offsetHeight() { return (el._rect && el._rect.height) || 0; },
      get offsetWidth() { return (el._rect && el._rect.width) || 0; },
      get clientHeight() { return el._client != null ? el._client : ((el._rect && el._rect.height) || 0); },
      get clientWidth() { return (el._rect && el._rect.width) || 0; },
      scrollTop: 0, scrollHeight: 0,
    };
    if (id) el.id = id;
    return el;
  }

  function dispatch(target, ev) {
    ev.target = ev.target || target;
    ev.preventDefault = ev.preventDefault || (() => { ev.defaultPrevented = true; });
    ev.stopPropagation = ev.stopPropagation || (() => { ev.propagationStopped = true; });
    for (let n = target; n; n = n.parentNode) {
      const l = n._listeners && n._listeners.get(ev.type);
      if (l) for (const fn of [...l]) fn.call(n, ev);
      const h = n["on" + ev.type];
      if (typeof h === "function") h.call(n, ev);
      if (ev.propagationStopped || !ev.bubbles) break;
    }
    if (ev.bubbles && !ev.propagationStopped) {
      const dl = document._listeners.get(ev.type);
      if (dl) for (const fn of [...dl]) fn.call(document, ev);
    }
    return !ev.defaultPrevented;
  }

  const documentElement = makeElement("html");
  const body = makeElement("body");
  const head = makeElement("head");
  documentElement.appendChild(head); documentElement.appendChild(body);
  const docListeners = new Map();
  Object.assign(document, {
    nodeType: 9, documentElement, body, head, hidden: false, readyState: opts.readyState || "complete",
    _listeners: docListeners,
    getElementById: (id) => {
      if (!byId.has(id)) { const el = makeElement(opts.tagFor ? opts.tagFor(id) : "div", id); body.appendChild(el); }
      return byId.get(id);
    },
    createElement: (tag) => makeElement(tag),
    querySelector: (sel) => query(documentElement, sel, false)[0] || null,
    querySelectorAll: (sel) => query(documentElement, sel, true),
    addEventListener: (t, fn) => { if (!docListeners.has(t)) docListeners.set(t, []); docListeners.get(t).push(fn); },
    removeEventListener: (t, fn) => { const l = docListeners.get(t); if (l) l.splice(l.indexOf(fn), 1); },
    dispatchEvent: (ev) => { const l = docListeners.get(ev.type); if (l) for (const fn of [...l]) fn.call(document, ev); return true; },
    execCommand: () => false,
  });
  // An accessor, not a value: Object.assign would have copied null once.
  Object.defineProperty(document, "activeElement", { get: () => activeElement, set: (v) => { activeElement = v; }, enumerable: true });
  return {
    document, body, documentElement, makeElement, dispatch,
    byId: (id) => document.getElementById(id),
    has: (id) => byId.has(id),
  };
}
