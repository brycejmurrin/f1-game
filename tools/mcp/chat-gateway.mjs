#!/usr/bin/env node
// @doc Portable namespaced chat MCP gateway with serialized browser ownership and explicit release.
// @skill mcp-probe
import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {ListToolsRequestSchema,CallToolRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {hostToolNamesSchema, doctorWithCatalog} from './doctor-catalog.mjs';
export const UPSTREAMS = ['apex-tools','apex-lsp','js-debugger','playwright-official','chrome-devtools'];
export const RELEASE = 'f1_gateway_browser_release';
// These apex-tools refusals happen before a harness/browser is launched. Runtime
// errors and transport failures are deliberately excluded: their browser may live.
function preflightRefusal(response) {
  if (!response.isError) return false;
  const bodies = [response.structuredContent];
  for (const block of response.content || []) {
    if (block.type !== 'text') continue;
    try { bodies.push(JSON.parse(block.text)); } catch { /* ordinary error text */ }
  }
  return bodies.some(body => ['bad_args', 'local_only'].includes(body?.error));
}
export async function createGateway({root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'), connect}={}) {
  const clients=new Map(); let routes,queue=Promise.resolve(),owner=null,debugAttached=false;
  const configured=connect?null:JSON.parse(fs.readFileSync(path.join(root,'.mcp.json'),'utf8')).mcpServers;
  async function upstream(name) {
    if(!clients.has(name)){
      const pending=(async()=>{
        if(connect)return connect(name);
        const config=configured[name];if(!config||config.type!=='stdio')throw new Error('Expected configured stdio upstream: '+name);
        const client=new Client({name:'apex-chat-gateway',version:'1.0.0'});
        const transport=new StdioClientTransport({command:config.command,args:config.args,cwd:root,env:{...process.env,npm_config_prefer_offline:process.env.npm_config_prefer_offline||'true'},stderr:'pipe'});
        transport.stderr?.on('data',()=>{});
        try{await client.connect(transport,{timeout:20000});return client;}catch(error){await transport.close();throw error;}
      })().catch(error=>{clients.delete(name);throw error;});
      clients.set(name,pending);
    }
    return clients.get(name);
  }
  async function catalog(){
    if(routes)return routes;
    const result=new Map();
    for(const name of UPSTREAMS){
      if(process.env.APEX_CHAT_MCP_DIAGNOSTICS==='1')process.stderr.write('catalog '+name+'\n');
      const client=await upstream(name);let cursor;const seen=new Set();
      do{
        let list;try{list=await client.listTools(cursor?{cursor}:undefined,{timeout:20000});}catch(error){throw new Error(name+' catalog unavailable: '+error.message);}
        for(const tool of list.tools){const key=name.replaceAll('-','_')+'__'+tool.name;if(result.has(key))throw new Error('Duplicate tool: '+key);result.set(key,{upstream:name,original:tool.name,tool:{...tool,name:key}});}
        cursor=list.nextCursor;if(cursor&&seen.has(cursor))throw new Error('Repeated catalog cursor');if(cursor)seen.add(cursor);
      }while(cursor);
    }
    const doctor = result.get('apex_tools__apex_doctor');
    if (doctor) doctor.tool.inputSchema = {...doctor.tool.inputSchema, properties: {...doctor.tool.inputSchema.properties, hostToolNames: hostToolNamesSchema}};
    result.set(RELEASE,{tool:{name:RELEASE,description:'Close this gateway session’s active browser client and release ownership. Detach debugger first.',inputSchema:{type:'object',properties:{},additionalProperties:false}}});
    routes=result;return routes;
  }
  const server=new Server({name:'apex-chat-gateway',version:'1.0.0'},{capabilities:{tools:{}}});
  async function call(request){
    const run=async()=>{
      if(request.name===RELEASE){
        if(debugAttached)return {isError:true,content:[{type:'text',text:'Detach the JavaScript debugger before releasing its browser.'}]};
        if(owner){const name=owner;await (await clients.get(name)).close();clients.delete(name);owner=null;}
        return {content:[{type:'text',text:'Browser ownership released.'}]};
      }
      const route=(await catalog()).get(request.name);
      if(!route)throw new Error('Unknown tool: '+request.name);
      if (request.name === 'apex_tools__apex_doctor' && request.arguments?.hostToolNames !== undefined) {
        const body = await doctorWithCatalog(root, request.arguments);
        return {isError: !body.ok, content: [{type: 'text', text: JSON.stringify(body)}], structuredContent: body};
      }
      const vmEval=route.upstream==='apex-tools'&&route.original==='apex_eval'&&request.arguments?.vm===true;
      const browser=!vmEval&&(['playwright-official','chrome-devtools'].includes(route.upstream)||(route.upstream==='apex-tools'&&/^Browser\b/i.test(route.tool.description||'')));
      if(browser&&owner&&owner!==route.upstream)return {isError:true,content:[{type:'text',text:'Another browser mode owns this session. Close/release it first.'}]};
      const previousOwner=owner;
      if(browser)owner=route.upstream;
      const response=await (await upstream(route.upstream)).callTool({name:route.original,arguments:request.arguments||{}},undefined,{timeout:180000});
      if(browser&&!previousOwner&&route.upstream==='apex-tools'&&preflightRefusal(response))owner=null;
      if(!response.isError&&request.name==='playwright_official__browser_close')owner=null;
      if(!response.isError&&request.name==='js_debugger__debugger_attach')debugAttached=true;
      if(!response.isError&&request.name==='js_debugger__debugger_detach')debugAttached=false;
      return response;
    };
    const result=queue.then(run,run);queue=result.catch(()=>{});return result;
  }
  server.setRequestHandler(ListToolsRequestSchema,async()=>({tools:[...(await catalog()).values()].map(r=>r.tool)}));
  server.setRequestHandler(CallToolRequestSchema,request=>call(request.params));
  return {server,catalog,call,close:async()=>{await Promise.allSettled([...clients.values()].map(async p=>(await p).close()));clients.clear();owner=null;}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.includes('--help'))console.log('Usage: node tools/mcp/chat-gateway.mjs\nStdio protocol only. Launch through the existing private tunnel; no new public listener or credential.');
  else{
    const gateway=await createGateway();let stopping=false;
    const close=async()=>{if(stopping)return;stopping=true;await gateway.close();await gateway.server.close();process.exit(0);};
    process.once('SIGINT',close);process.once('SIGTERM',close);process.stdin.once('end',close);
    // Warm the configured catalogs before advertising a ready protocol connection.
    // The first native action must not pay five upstream cold starts.
    await gateway.catalog();
    await gateway.server.connect(new StdioServerTransport());
  }
}
