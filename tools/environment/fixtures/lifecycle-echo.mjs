// @doc Lifecycle echo: canonical F1 environment and plugin support.
import readline from 'node:readline';
let initialized = false;
let duplicate = false;
for await (const line of readline.createInterface({input: process.stdin})) {
  let msg; try { msg = JSON.parse(line); } catch { continue; }
  if (msg.method === 'notifications/initialized') { if (initialized) duplicate = true; initialized = true; continue; }
  if (msg.id === undefined) continue;
  let response;
  if (msg.method === 'initialize') response = {protocolVersion: '2025-03-26', capabilities: {tools: {}}, serverInfo: {name: 'lifecycle-echo', version: '1'}};
  else if (duplicate) { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message:'duplicate notification'}})+'\n'); continue; }
  else if (!initialized) { process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,error:{code:-32000,message:'not initialized'}})+'\n'); continue; }
  else if (msg.method === 'tools/list') response = {tools: []};
  else response = {};
  process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:msg.id,result:response})+'\n');
}
