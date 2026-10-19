// Node-inspector breakpoint hit counter (the js-debugger MCP lists only Chrome pages, #2957).
// usage: node cdp-hit.mjs <test.mjs> '<urlSubstr>::<lineRegex>' [...]   (empty urlSubstr = any script, incl. vm/no-URL)
// Runs `node --inspect-brk=0 <test>`; sets one breakpoint per spec on the first matching line of each parsed script;
// removes it after 3 hits; prints HIT n / NOT-HIT per spec, and the placement (script url, line).
import { spawn } from "node:child_process";
const [file, ...specs] = process.argv.slice(2);
const S = specs.map(s => { const [head, expr] = s.split("@@"); const i = head.indexOf("::"); return { raw: s, expr, url: head.slice(0, i), re: new RegExp(head.slice(i + 2)), hits: 0, placed: [] }; });
const child = spawn(process.execPath, ["--inspect-brk=0", file], { stdio: ["ignore", "inherit", "pipe"] });
let wsUrl; let buf = ""; let WS;
child.stderr.on("data", d => { buf += d; const m = /ws:\/\/\S+/.exec(buf); if (m && !wsUrl) { wsUrl = m[0]; go(); } else if (wsUrl) { process.stderr.write(d); if (/Waiting for the debugger to disconnect/.test(d)) WS?.close(); } });
function go() {
  const ws = WS = new WebSocket(wsUrl); let id = 0; let chain = Promise.resolve(); const pend = new Map(); const bps = new Map();
  const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = async ev => { if (process.env.CDP_DEBUG) console.error("<<", ev.data.slice(0,150));
    const m = JSON.parse(ev.data);
    if (m.id) { pend.get(m.id)?.(m.result); return; }
    if (m.method === "Debugger.scriptParsed") {
      const p = m.params; const url = p.url || "";
      if (/^node:/.test(url) || /node_modules/.test(url)) return;
      const cands = S.filter(s => url.includes(s.url));
      if (!cands.length) return;
      let mine; const gate = new Promise(r => (mine = r)); chain = chain.then(() => gate);
      const src = ((await send("Debugger.getScriptSource", { scriptId: p.scriptId })) || {}).scriptSource || "";
      const lines = src.split("\n");
      for (const s of cands) {
        const ln = lines.findIndex(l => s.re.test(l)); if (ln < 0) continue;
        const r = await send("Debugger.setBreakpoint", { location: { scriptId: p.scriptId, lineNumber: ln } });
        if (r?.breakpointId) { bps.set(r.breakpointId, s); if (!s.placed.includes((url || "<vm>") + ":" + (ln + 1))) s.placed.push((url || "<vm>") + ":" + (ln + 1)); }
      }
      mine();
    } else if (m.method === "Debugger.paused") {
      await Promise.race([chain, new Promise(r => setTimeout(r, 8000))]);
      for (const b of m.params.hitBreakpoints || []) { const s = bps.get(b); if (s?.expr) { const e = await send("Debugger.evaluateOnCallFrame", { callFrameId: m.params.callFrames[0].callFrameId, expression: s.expr }); console.log("EVAL[" + s.hits + "] " + s.expr + " = " + JSON.stringify(e?.result?.value ?? e?.result?.description)); } if (s && ++s.hits >= 3) await send("Debugger.removeBreakpoint", { breakpointId: b }); }
      await send("Debugger.resume");
    }
  };
  ws.onopen = async () => { await send("Debugger.enable"); await send("Debugger.setInstrumentationBreakpoint", { instrumentation: "beforeScriptExecution" }); await send("Runtime.enable"); await send("Runtime.runIfWaitingForDebugger"); };
}
child.on("exit", code => {
  console.log("\n=== cdp-hit " + file + " exit " + code);
  for (const s of S) console.log((s.hits ? "HIT x" + s.hits + (s.hits >= 3 ? "+" : "") : s.placed.length ? "NOT-HIT" : "UNPLACED") + "  " + s.raw + "  @ " + (s.placed.join(", ") || "-"));
  process.exit(code ? 1 : 0);
});
