#!/usr/bin/env node
// @doc Check a live stdio gateway catalog against a saved host tool-name snapshot and harmless status call.
// @skill mcp-probe
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {RELEASE,UPSTREAMS} from './chat-gateway.mjs';
export function normalizeHostName(name){return name.replace(/^mcp__codex_apps__f1_cloud_mcp_/,'').replace(/^f1_gateway_browser_release$/,RELEASE);}
export function checkCatalog(tools,host=[]){
  const names=tools.map(t=>t.name),set=new Set(names),errors=[];
  if(set.size!==names.length)errors.push('Duplicate advertised tool names');
  for(const prefix of UPSTREAMS.map(n=>n.replaceAll('-','_')+'__'))if(!names.some(n=>n.startsWith(prefix)))errors.push('Missing upstream: '+prefix);
  if(!set.has(RELEASE))errors.push('Browser release route missing');
  for(const name of host.map(normalizeHostName))if(!set.has(name))errors.push('Host advertises missing route: '+name);
  for(const t of tools)if(t.inputSchema?.type!=='object')errors.push('Invalid input schema: '+t.name);
  return {ok:!errors.length,count:names.length,hostCompared:host.length,errors};
}
async function main(argv=process.argv.slice(2)){
  if(argv.includes('--help')){console.log('Usage: node tools/mcp/check-chat-contract.mjs [host-tools.json]\nStarts a disposable protocol client; no browser actions. Host snapshot must be actual exposed F1 tool names, not a config manifest.');return;}
  if(argv.length>1)throw new Error('Expected at most one host snapshot');
  let host=[];if(argv[0]){const raw=JSON.parse(fs.readFileSync(argv[0],'utf8'));host=Array.isArray(raw)?raw:raw.tools;if(!Array.isArray(host))throw new Error('Expected tool-name array');host=host.map(t=>typeof t==='string'?t:t.name);if(host.some(n=>typeof n!=='string'))throw new Error('Invalid tool name');}
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const client=new Client({name:'apex-contract-check',version:'1.0.0'});
  const transport=new StdioClientTransport({command:process.execPath,args:[path.join(root,'tools/mcp/chat-gateway.mjs')],cwd:root,env:{...process.env},stderr:'pipe'});transport.stderr?.on('data',data=>{if(process.env.APEX_CHAT_MCP_DIAGNOSTICS==='1')process.stderr.write(data);});
  try{
    await client.connect(transport,{timeout:20000});if(process.env.APEX_CHAT_MCP_DIAGNOSTICS==='1')console.error('contract initialized');const list=await client.listTools(undefined,{timeout:120000});
    if(process.env.APEX_CHAT_MCP_DIAGNOSTICS==='1')console.error('contract catalog received');const report=checkCatalog(list.tools,host);report.hostSnapshot=argv[0]?'supplied':'not-supplied';
    const status=await client.callTool({name:'apex_tools__apex_status',arguments:{}},undefined,{timeout:20000});
    report.statusCall=status.isError?'fail':'pass';report.ok&&=!status.isError;
    console.log(JSON.stringify(report,null,2));if(!report.ok)process.exitCode=1;
  }finally{await client.close();await transport.close();}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
