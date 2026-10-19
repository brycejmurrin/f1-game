// @doc Child-process auto-attach bootloader for debugger_node_test (NODE_OPTIONS=--require): every Node
// descendant opens an inspector on a free port, reports it, and waits for the runner to release it.
// Same design as VS Code js-debug's bootloader; a process whose inspector is already open is skipped.
"use strict";
(function () {
  const report = process.env.APEX_DBG_CHILDREN;
  if (!report) return;
  const inspector = require("node:inspector");
  if (inspector.url()) return;
  // The runner owns the session: if it is gone, run undebugged instead of waiting forever.
  const owner = Number(process.env.APEX_DBG_OWNER);
  try { if (owner) process.kill(owner, 0); } catch { return; }
  // Some processes (a worker, a runtime built without the inspector) cannot open one.
  try { inspector.open(0, "127.0.0.1", false); } catch { return; }
  const url = inspector.url();
  if (!url) return;
  require("node:fs").appendFileSync(report, JSON.stringify({ pid: process.pid, ppid: process.ppid, url,
    argv: process.argv.slice(1, 4) }) + "\n");
  inspector.waitForDebugger();
})();
