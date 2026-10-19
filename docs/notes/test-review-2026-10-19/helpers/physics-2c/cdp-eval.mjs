// Evaluate one expression in the debug-chrome page (node tools/mcp/debug-chrome.mjs start) over raw CDP.
// Usage: node cdp-eval.mjs '<expr>' [endpoint=http://127.0.0.1:9222]   (promises are awaited; prints JSON)
const [expr, ep = "http://127.0.0.1:9222"] = process.argv.slice(2);
const page = (await (await fetch(ep + "/json")).json()).find(t => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener("open", r, { once: true }));
ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate",
  params: { expression: expr, awaitPromise: true, returnByValue: true, timeout: 600000 } }));
ws.addEventListener("message", e => {
  const m = JSON.parse(e.data); if (m.id !== 1) return;
  console.log(JSON.stringify(m.result?.result?.value ?? m.result?.exceptionDetails?.text ?? m));
  ws.close();
});
