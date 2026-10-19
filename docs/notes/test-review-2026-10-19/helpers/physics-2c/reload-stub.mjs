// Reload the debug-chrome page with a Storage.prototype.setItem stub that throws (drives store.js noteBroken).
// Usage: node reload-stub.mjs [stub=1|0]  — prints nothing; read hits with debugger_logpoint_read.
const stub = process.argv[2] !== "0";
const page = (await (await fetch("http://127.0.0.1:9222/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
let id = 0; const send = (method, params = {}) => ws.send(JSON.stringify({ id: ++id, method, params }));
send("Page.enable");
if (stub) send("Page.addScriptToEvaluateOnNewDocument", { source: "Storage.prototype.setItem=function(){throw new DOMException('quota','QuotaExceededError')}" });
send("Page.reload", { ignoreCache: true });
await new Promise(r => setTimeout(r, 15000));
ws.close();
