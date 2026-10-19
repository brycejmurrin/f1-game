import "../helpers/git-fixture-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { WorkflowHarness, PROBE_HELP, TOOL_SCHEMAS, ALL_TOOL_SCHEMAS } from "../../tools/mcp/workflow-harness-core.mjs";
import { startServer } from "../../tools/mcp/workflow-harness.mjs";
import { runClient } from "../../tools/mcp/workflow-harness-client.mjs";

// Synthetic paths live only inside temporary fixture repositories.
const VALUE_FILE = ["js", "value.js"].join("/"), GENERATED_FILE = ["js", "generated.js"].join("/"), ESCAPE_FILE = ["js", "escape.js"].join("/");
const STYLE_FILE = ["css", "site.css"].join("/");
const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" });
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "workflow-harness-")), repo = path.join(base, "repo"); fs.mkdirSync(repo);
  git(repo,["init","-q"]); git(repo,["config","user.email","test@example.invalid"]); git(repo,["config","user.name","Test"]);
  fs.mkdirSync(path.join(repo,"js")); fs.mkdirSync(path.join(repo,"css")); fs.mkdirSync(path.join(repo,"docs"));
  fs.writeFileSync(path.join(repo,"js","value.js"),'"use strict"; const Value = (() => ({ number: 7 }))();\n');
  fs.writeFileSync(path.join(repo,".gitignore"),GENERATED_FILE+"\n");
  fs.writeFileSync(path.join(repo,"css","site.css"),"body { color: red; }\n"); fs.writeFileSync(path.join(repo,"controller.html"),"<script>Value.number</script>\n");
  fs.writeFileSync(path.join(repo,"secret.txt"),"no\n"); git(repo,["add","."]); git(repo,["commit","-qm","fixture"]);
  return { base, repo, run: path.join(base,"run") };
}
const plan = (maxCalls=20) => ({ workers:[{ id:"rg_worker", condition:"baseline", maxCalls, tools:["read","rg","files","probe"] }] });

test("bounded tools report schemas, exact paths, bounds, and semantic errors", async t => {
  const f=fixture(), h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan(),runRipgrep:(args,options)=>{
    assert.deepEqual(args,["-n","--max-count","25","--","color","css"]);
    assert.equal(options.cwd,h.snapshot); assert.equal(options.timeout,30_000); assert.equal(options.maxBuffer,1_000_000);
    return `${STYLE_FILE}:1:body { color: red; }\n`;
  }}); t.after(()=>h.close());
  let r=await h.call({id:"rg_worker",tool:"read",args:{path:VALUE_FILE}}); assert.equal(r.error,true); assert.match(r.output,/missing required.*file/);
  r=await h.call({id:"rg_worker",tool:"read",args:{file:"secret.txt"}}); assert.equal(r.error,true); assert.match(r.output,/outside allowed/);
  r=await h.call({id:"rg_worker",tool:"read",args:{file:"controller.html",lines:2}}); assert.equal(r.error,false); assert.match(r.output,/maximum window 120/);
  r=await h.call({id:"rg_worker",tool:"rg",args:{pattern:"color",path:"css"}}); assert.equal(r.error,false,r.output); assert.match(r.output,/css\/site\.css:1:body/); assert.match(r.output,/bounded to 25/);
  r=await h.call({id:"rg_worker",tool:"files",args:{path:"missing"}}); assert.equal(r.error,true); assert.match(r.output,/outside allowed|does not exist/);
  const plain=await h.call({id:"rg_worker",tool:"files",args:{path:"js"}});
  const slash=await h.call({id:"rg_worker",tool:"files",args:{path:"js/"}});
  assert.equal(slash.output,plain.output); assert.match(slash.output,/js\/value\.js/);
  r=await h.call({id:"rg_worker",tool:"probe",args:{files:[VALUE_FILE],test:"return Value.number"}}); assert.equal(r.error,true); assert.match(r.output,/top-level return|Illegal return/); assert.match(r.output,/IIFE/);
  r=await h.call({id:"rg_worker",tool:"probe",args:{files:[VALUE_FILE],test:"(() => Value.number)()"}}); assert.equal(r.error,false); assert.deepEqual(JSON.parse(r.output).result,7);
});

test("ripgrep no-match, missing dependency and backend failures retain distinct outcomes", async t => {
  const f=fixture(); let failure={status:1};
  const h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan(),runRipgrep:()=>{throw Object.assign(new Error("fixture backend failure"),failure);}}); t.after(()=>h.close());
  const call=()=>h.call({id:"rg_worker",tool:"rg",args:{pattern:"absent",path:"css"}});
  let r=await call(); assert.equal(r.error,false); assert.match(r.output,/no matches/);
  failure={code:"ENOENT"}; r=await call(); assert.equal(r.errorCode,"execution_error"); assert.match(r.output,/requires ripgrep.*PATH/);
  failure={status:2}; r=await call(); assert.equal(r.errorCode,"execution_error"); assert.match(r.output,/fixture backend failure/);
  const rows=fs.readFileSync(path.join(f.run,"workers","rg_worker","transcript.jsonl"),"utf8").trim().split("\n").map(JSON.parse);
  assert.deepEqual(rows.map(row=>row.error),[false,true,true]);
});

test("snapshot is pinned, mutation is rejected, baseline excludes LSP, and cap is id-safe", async t => {
  const f=fixture(), h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan(2)}); t.after(()=>h.close());
  fs.writeFileSync(path.join(f.repo,"js","value.js"),'"use strict"; const Value = (() => ({ number: 99 }))();\n');
  let r=await h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}}); assert.match(r.output,/number: 7/);
  r=await h.call({id:"rg_worker",tool:"lsp_symbols",args:{query:"Value"}}); assert.equal(r.error,true); assert.match(r.output,/excludes tool/);
  r=await h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}}); assert.equal(r.errorCode,"budget_exhausted"); assert.equal(r.seq,null);
  fs.writeFileSync(path.join(h.snapshot,"js","value.js"),"changed\n");
  const f2=fixture(), h2=new WorkflowHarness({repo:f2.repo,runDir:f2.run,plan:plan()}); t.after(()=>h2.close()); fs.writeFileSync(path.join(h2.snapshot,"js","value.js"),"changed\n");
  r=await h2.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}}); assert.equal(r.error,true); assert.match(r.output,/mutation detected/);
  assert.throws(()=>new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan()}),/already exists/);
});

test("HTTP token, client args-file, quiet envelope, semantic exit, transcript and cleanup", async t => {
  const f=fixture(), planFile=path.join(f.base,"plan.json"); fs.writeFileSync(planFile,JSON.stringify(plan()));
  const running=await startServer({repo:f.repo,runDir:f.run,plan:planFile}); t.after(()=>running.stop());
  const endpoint=path.join(f.run,"endpoint.json"), argsFile=path.join(f.base,"args.json"); fs.writeFileSync(argsFile,JSON.stringify({files:[VALUE_FILE],test:"(() => Value.number)()"}));
  const capture=()=>{let stdout="",stderr="";return {io:{stdout:{write:x=>{stdout+=x}},stderr:{write:x=>{stderr+=x}}},read:()=>({stdout,stderr})}};
  let c=capture(), status=await runClient(["--endpoint",endpoint,"--id","rg_worker","--tool","probe","--args-file",argsFile,"--quiet"],c.io); assert.equal(status,0,c.read().stderr); assert.equal(c.read().stdout,"");
  c=capture(); status=await runClient(["--endpoint",endpoint,"--id","rg_worker","--tool","read","--args",JSON.stringify({file:"wrong.js"}),"--quiet"],c.io); assert.equal(status,1); const envelope=JSON.parse(c.read().stdout); assert.deepEqual(Object.keys(envelope),["seq","error","errorCode","clipped","fullChars","output"]);
  const denied=await fetch(`http://127.0.0.1:${running.endpoint.port}/call`,{method:"POST",body:"{}"}); assert.equal(denied.status,403);
  const rows=fs.readFileSync(path.join(f.run,"workers","rg_worker","transcript.jsonl"),"utf8").trim().split("\n").map(JSON.parse); assert.equal(rows.length,2); assert.equal(rows[1].args.file,"wrong.js"); assert.ok(rows[0].ms>=0);
  await running.stop(); assert.equal(fs.existsSync(path.join(f.run,"source")),false); assert.equal(fs.existsSync(path.join(f.run,"stopped.json")),true);
});

test("probe help documents the script and IIFE contract",()=>{ assert.match(PROBE_HELP,/script completion/); assert.match(PROBE_HELP,/IIFE/); });

test("HTTP probes bound serialization and microtasks, reject Promise completions, and recover", { timeout: 8000 }, t => {
  const f = fixture(), planFile = path.join(f.base, "plan.json");
  fs.writeFileSync(planFile, JSON.stringify(plan(30)));
  t.after(() => {
    // Also clean up a regression that needed the child process's outer bound.
    if (fs.existsSync(path.join(f.run, "source"))) git(f.repo, ["worktree", "remove", "--force", path.join(f.run, "source")]);
    fs.rmSync(f.base, { recursive: true, force: true });
  });
  const serverModule = new URL("../../tools/mcp/workflow-harness.mjs", import.meta.url).href;
  const source = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import { startServer } from ${JSON.stringify(serverModule)};
    const running = await startServer(${JSON.stringify({ repo: f.repo, runDir: f.run, plan: planFile, probeTimeoutMs: 25 })});
    const probe = async (test, setup) => {
      const response = await fetch('http://127.0.0.1:' + running.endpoint.port + '/call', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-workflow-token': running.endpoint.token },
        body: JSON.stringify({ id: 'rg_worker', tool: 'probe', args: { files: [${JSON.stringify(VALUE_FILE)}], test, ...(setup ? { setup } : {}) } }),
        signal: AbortSignal.timeout(1000),
      });
      assert.equal(response.status, 200); return response.json();
    };
    const checked = [];
    try {
      const attacks = [
        ['toJSON', '({ toJSON() { while (true) {} } })'],
        ['getter', '({ get value() { while (true) {} } })'],
        ['microtask', 'Promise.resolve().then(() => { while (true) {} }); 1'],
        ['serialization microtask', '({ toJSON() { Promise.resolve().then(() => { while (true) {} }); return 1; } })'],
        ['setup microtask', 'Value.number', 'Promise.resolve().then(() => { while (true) {} })'],
      ];
      for (const [label, test, setup] of attacks) {
        const row = await probe(test, setup);
        assert.equal(row.error, true, label); assert.equal(row.errorCode, 'execution_error', label);
        assert.match(row.output, /Script execution timed out/, label); checked.push(label);
        const recovery = await probe('Value.number');
        assert.equal(recovery.error, false); assert.equal(JSON.parse(recovery.output).result, 7);
      }
      for (const test of ['Promise.resolve(42)', 'Promise.reject(new Error("expected rejection"))', 'new Promise(() => {})']) {
        const row = await probe(test); assert.equal(row.error, true);
        assert.equal(row.errorCode, 'invalid_request'); assert.match(row.output, /Promise completion values are unsupported/);
      }
      const synchronous = await probe('console.log("hello", Value.number); ({ get answer() { return Value.number; }, custom: { toJSON() { return 8; } } })');
      assert.equal(synchronous.error, false);
      assert.deepEqual(JSON.parse(synchronous.output), { logs: ['hello 7'], result: { answer: 7, custom: 8 } });
      const completion = await probe('let answer = 3; answer += Value.number; answer');
      assert.equal(JSON.parse(completion.output).result, 10);
      const empty = await probe('undefined'); assert.deepEqual(JSON.parse(empty.output), { logs: [], result: null });
    } finally { await running.stop(); }
    assert.equal(fs.existsSync(${JSON.stringify(path.join(f.run, "source"))}), false);
    assert.equal(fs.existsSync(${JSON.stringify(path.join(f.run, "stopped.json"))}), true);
    console.log(JSON.stringify({ checked, recovery: true, promisesRejected: 3, syncValues: true, cleanup: true }));
  `;
  // The outer process bound is essential: the unfixed implementation blocks
  // its event loop, so an in-process timer or fetch timeout cannot stop it.
  const child = spawnSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8", timeout: 5000 });
  assert.equal(child.error, undefined, child.error?.message);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(JSON.parse(child.stdout).checked.length, 5);
});

test("concurrent submissions cannot exceed a worker budget", async t => {
  const f=fixture(), h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan(1)}); t.after(()=>h.close());
  const [first,second]=await Promise.all([h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}}),h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}})]);
  assert.equal(first.seq,1); assert.equal(second.seq,null); assert.equal(second.errorCode,"budget_exhausted");
  const rows=fs.readFileSync(path.join(f.run,"workers","rg_worker","transcript.jsonl"),"utf8").trim().split("\n"); assert.equal(rows.length,1);
});

test("invalid plans fail before creating or registering a worktree", () => {
  const f=fixture(), bad={workers:[{id:"same",maxCalls:1,tools:["read"]},{id:"same",maxCalls:1,tools:["read"]}]};
  assert.throws(()=>new WorkflowHarness({repo:f.repo,runDir:f.run,plan:bad}),/duplicate/); assert.equal(fs.existsSync(f.run),false);
  assert.doesNotMatch(git(f.repo,["worktree","list","--porcelain"]),new RegExp(f.run.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")));
  const cyclic=plan(); cyclic.self=cyclic;
  assert.throws(()=>new WorkflowHarness({repo:f.repo,runDir:f.run,plan:cyclic}),/circular/i);
  const bigint=plan(); bigint.workers[0].condition=1n;
  assert.throws(()=>new WorkflowHarness({repo:f.repo,runDir:f.run,plan:bigint}),/BigInt/);
  assert.equal(fs.existsSync(f.run),false);
});

test("already queued calls stay invalidated after source is restored", async t => {
  const f=fixture(), h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan()}); t.after(()=>h.close());
  const pending=h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}});
  fs.writeFileSync(path.join(h.snapshot,"js","generated.js"),"changed\n");
  assert.throws(()=>h.assertClean(),/mutation detected/);
  fs.unlinkSync(path.join(h.snapshot,"js","generated.js"));
  const result=await pending;
  assert.equal(result.errorCode,"source_mutation");
  assert.match(result.output,/permanently invalidated/);
});

test("post-snapshot setup failures remove the registered worktree", t => {
  const f=fixture(), write=fs.writeFileSync;
  t.mock.method(fs,"writeFileSync",function(file,...args) {
    if (file === path.join(f.run,"plan.json")) throw new Error("fixture plan write failure");
    return write.call(this,file,...args);
  });
  assert.throws(()=>new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan()}),/fixture plan write failure/);
  assert.equal(fs.existsSync(f.run),false);
  assert.equal(git(f.repo,["worktree","list","--porcelain"]).split("worktree ").length-1,1);
});

test("ignored mutations permanently invalidate a run", async t => {
  const f=fixture(), h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan()}); t.after(()=>h.close());
  fs.writeFileSync(path.join(h.snapshot,"js","generated.js"),"ignored mutable input\n");
  let r=await h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}}); assert.equal(r.errorCode,"source_mutation"); assert.match(r.output,/ignored file/);
  fs.unlinkSync(path.join(h.snapshot,"js","generated.js")); r=await h.call({id:"rg_worker",tool:"read",args:{file:VALUE_FILE}}); assert.equal(r.errorCode,"run_invalidated"); assert.equal(r.seq,null);
});

test("LSP arguments use schemas and the frozen path policy while RPC metrics reset per call", async t => {
  const f=fixture(), lspPlan={workers:[{id:"lsp_worker",condition:"lsp",maxCalls:6,tools:["lsp_definition"]}]}; fs.writeFileSync(path.join(f.base,"outside.js"),"outside\n"); fs.symlinkSync(path.join(f.base,"outside.js"),path.join(f.repo,"js","escape.js")); git(f.repo,["add",ESCAPE_FILE]); git(f.repo,["commit","-qm","add escape fixture"]);
  let invoked=0; const fake={request:async method=>({method}),stop(){}};
  const h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:lspPlan,createLsp:()=>fake,invokeLsp:async(lsp,tool,args)=>{invoked++;await lsp.request("fake/request",args);return {content:[{text:`${tool}:${args.symbol||args.file}`}],isError:false}}}); t.after(()=>h.close());
  const r=await h.call({id:"lsp_worker",tool:"lsp_definition",args:{symbol:"Value"}}); assert.equal(r.errorCode,"source_mutation"); assert.match(r.output,/dependency escape/); assert.equal(invoked,0);
});

test("fake LSP enforces file paths and records RPC metrics independently for every call", async t => {
  const f=fixture(), fake={request:async method=>({method}),stop(){}}, lspPlan={workers:[{id:"lsp_worker",condition:"lsp",maxCalls:5,tools:["lsp_definition"]}]};
  const h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:lspPlan,createLsp:()=>fake,invokeLsp:async(lsp,tool,args)=>{await lsp.request("fake/request",args);return {content:[{text:tool}],isError:false}}}); t.after(()=>h.close());
  let r=await h.call({id:"lsp_worker",tool:"lsp_definition",args:{file:"secret.txt",line:1}}); assert.equal(r.error,true); assert.match(r.output,/outside allowed/);
  r=await h.call({id:"lsp_worker",tool:"lsp_definition",args:{symbol:"Value",bogus:true}}); assert.equal(r.error,true); assert.match(r.output,/unknown argument/);
  await h.call({id:"lsp_worker",tool:"lsp_definition",args:{symbol:"Value",path:"js/"}}); await h.call({id:"lsp_worker",tool:"lsp_definition",args:{symbol:"Value"}});
  const rows=fs.readFileSync(path.join(f.run,"workers","lsp_worker","transcript.jsonl"),"utf8").trim().split("\n").map(JSON.parse); assert.equal(rows[2].rpc.length,1); assert.equal(rows[3].rpc.length,1);
});

test("tool descriptors are JSON Schemas and client help is value-free", async () => {
  assert.equal(TOOL_SCHEMAS.read.type,"object"); assert.equal(TOOL_SCHEMAS.read.properties.lines.maximum,120); assert.equal(TOOL_SCHEMAS.read.additionalProperties,false);
  assert.equal(ALL_TOOL_SCHEMAS.lsp_definition.type,"object"); assert.equal(ALL_TOOL_SCHEMAS.lsp_definition.additionalProperties,false);
  let stdout="",stderr=""; const status=await runClient(["--help"],{stdout:{write:x=>stdout+=x},stderr:{write:x=>stderr+=x}}); assert.equal(status,0); assert.match(stdout,/--timeout-ms/); assert.equal(stderr,"");
});

test("malformed tool values are transcripted and unknown client options fail", async t => {
  const f=fixture(), h=new WorkflowHarness({repo:f.repo,runDir:f.run,plan:plan()}); t.after(()=>h.close());
  const r=await h.call({id:"rg_worker",tool:null,args:{marker:"kept"}}); assert.equal(r.error,true); assert.equal(r.seq,1);
  const row=JSON.parse(fs.readFileSync(path.join(f.run,"workers","rg_worker","transcript.jsonl"),"utf8")); assert.equal(row.tool,null); assert.equal(row.args.marker,"kept");
  let stderr=""; const status=await runClient(["--typo","x"],{stdout:{write(){}},stderr:{write:x=>stderr+=x}}); assert.equal(status,2); assert.match(stderr,/unknown option/);
});
