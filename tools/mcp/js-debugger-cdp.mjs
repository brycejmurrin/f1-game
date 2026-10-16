// @doc Bounded CDP transport and loopback target discovery for js-debugger-mcp.
import { EventEmitter } from "node:events";

export function localUrl(raw, websocket = false) {
  const u = new URL(raw);
  const hosts = ["127.0.0.1", "localhost", "[::1]"];
  if (!hosts.includes(u.hostname) || ![websocket ? "ws:" : "http:"].includes(u.protocol) ||
      u.username || u.password || u.hash || u.search) throw Error("Use an HTTP/WS loopback URL without credentials, query or fragment");
  return u;
}

export async function targets(endpoint) {
  const u = localUrl(endpoint);
  if (u.pathname !== "/") throw Error("Browser endpoint must be an origin, e.g. http://127.0.0.1:9222");
  const response = await fetch(new URL("/json/list", u), { redirect: "error", signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw Error(`Target discovery HTTP ${response.status}`);
  const raw = await response.text();
  if (raw.length > 1024 * 1024) throw Error("Target discovery response too large");
  const rows = JSON.parse(raw);
  if (!Array.isArray(rows)) throw Error("Malformed target discovery response");
  return rows.filter(t => t && t.type === "page" && typeof t.id === "string" && typeof t.url === "string")
    .slice(0, 100).map(t => ({ id: t.id, title: String(t.title || "").slice(0, 200), url: t.url,
      webSocketDebuggerUrl: t.webSocketDebuggerUrl }));
}

export class Cdp extends EventEmitter {
  constructor(socket, timeout = 5000) {
    super();
    this.socket = socket;
    this.timeout = timeout;
    this.pending = new Map();
    this.id = 0;
    this.closed = false;
    socket.addEventListener("message", event => {
      try {
        if (typeof event.data !== "string" || event.data.length > 8 * 1024 * 1024) throw Error("CDP message exceeds 8 MiB or is not text");
        const msg = JSON.parse(event.data);
        if (Object.hasOwn(msg, "id")) {
          const p = this.pending.get(msg.id);
          if (!p) return;
          clearTimeout(p.timer); this.pending.delete(msg.id);
          if (msg.error) p.reject(Error(msg.error.message)); else p.resolve(msg.result || {});
        } else if (msg.method) this.emit(msg.method, msg.params || {});
      } catch (e) { this.fail(e); socket.close(); }
    });
    socket.addEventListener("close", () => this.fail(Error("CDP connection closed")));
    socket.addEventListener("error", () => this.fail(Error("CDP connection error")));
  }
  static async open(url) {
    localUrl(url, true);
    const socket = new WebSocket(url);
    const client = new Cdp(socket);
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer);
        socket.removeEventListener("open", opened);
        client.removeListener("disconnect", failed);
        if (error) { client.close(); reject(error); } else resolve();
      };
      const opened = () => finish();
      const failed = error => finish(error);
      const timer = setTimeout(() => finish(Error("CDP connection timed out")), 5000);
      socket.addEventListener("open", opened, { once: true });
      client.once("disconnect", failed);
    });
    return client;
  }
  send(method, params = {}, timeout = this.timeout) {
    if (this.closed || this.socket.readyState !== 1) return Promise.reject(Error("CDP is disconnected"));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(Error(`${method} response timed out; execution may still be active`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  fail(error) {
    if (this.closed) return;
    this.closed = true;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.emit("disconnect", error);
  }
  close() { this.fail(Error("CDP detached")); this.socket.close(); }
}
