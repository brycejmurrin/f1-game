/* NetPlay's hand-fed session seam. Packet construction and game state stay in
 * each test. Clocks are already synced and identical; delivery is explicit.
 * Registration, clearHandlers and once-only close notification follow the real
 * NetSession lifecycle, including marking dead before reentrant close handlers.
 */
export function handFedNetSession() {
  const events = new Map(), states = [], closers = [];
  let alive = true;
  const fire = (handlers, ...args) => {
    for (const fn of handlers) {
      try { fn(...args); } catch (_) { /* consumer bugs do not disconnect a session */ }
    }
  };
  const session = {
    sent: [], sentStates: [], closed: 0,
    clearHandlers() { events.clear(); states.length = 0; closers.length = 0; return this; },
    onEvent(type, fn) {
      if (!events.has(type)) events.set(type, []);
      events.get(type).push(fn);
      return this;
    },
    onState(fn) { states.push(fn); return this; },
    onClose(fn) { closers.push(fn); return this; },
    deliver(type, data) { fire(events.get(type) || [], data, type); },
    deliverState(bytes, at) { fire(states, bytes, at); },
    sendEvent(t, d) { if (!alive) return false; this.sent.push({ t, d }); return true; },
    sendState(bytes) { if (!alive) return false; this.sentStates.push(bytes); return true; },
    pump: () => alive,
    alive: () => alive,
    lagMs: () => 0, rtt: () => 0, synced: () => true,
    peerToLocal: (t) => t, localToPeer: (t) => t,
    stats: () => ({ alive, rtt: 0, offset: 0, synced: true }),
    close() {
      if (!alive) return;
      alive = false;
      this.closed++;
      fire(closers, "local");
    },
    drop(why = "transport") {
      if (!alive) return;
      alive = false;
      fire(closers, why);
    },
  };
  return session;
}
