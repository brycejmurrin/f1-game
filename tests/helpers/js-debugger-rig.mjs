// Shared fixtures for the js-debugger-*.test.mjs files (split from js-debugger-mcp.test.mjs, T3-16): a fake CDP
// connection, a paused frame and an attached DebugSession. Moved verbatim.
import { EventEmitter } from "node:events";
import { DebugSession } from "../../tools/mcp/js-debugger-session.mjs";

export class FakeCdp extends EventEmitter {
  calls = []; closed = false;
  async send(method, params, timeout) {
    this.calls.push({ method, params, timeout });
    if (this.reply) return this.reply(method, params);
    if (method === "Debugger.setBreakpointByUrl") return { breakpointId: "bp1", locations: [] };
    return {};
  }
  close() { this.closed = true; this.emit("disconnect", Error("disconnected")); }
}
export const frame = { callFrameId: "frame1", functionName: "run", url: "http://127.0.0.1:3456/fixture.js",
  location: { scriptId: "s1", lineNumber: 3, columnNumber: 2 },
  scopeChain: [{ type: "local", object: { type: "object", objectId: "locals1" } }] };
export const paused = (c, frames = [frame]) => c.emit("Debugger.paused", { reason: "other", callFrames: frames });
export async function attached() {
  const c = new FakeCdp();
  const s = new DebugSession({ discover: async () => [{ type: "page", id: "t", url: "about:blank", webSocketDebuggerUrl: "ws://127.0.0.1:9222/devtools/page/t" }], open: async () => c });
  await s.attach("http://127.0.0.1:9222", "t");
  return { s, c };
}
