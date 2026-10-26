#!/usr/bin/env node
// @doc Derive a full-gateway private runtime profile from an existing tunnel profile without changing identities.
// @skill mcp-probe
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import YAML from 'yaml';
const quote=value=>"'"+String(value).replaceAll("'", "'\\''")+"'";
export function gatewayProfile(source,gateway,npmCache){
  if(!source.control_plane?.tunnel_id)throw new Error('Source profile has no existing tunnel ID');
  const auth=source.control_plane.api_key;
  if(auth!==undefined&&(typeof auth!=='string'||! /^(env:|file:)/.test(auth)))throw new Error('Credential must be an environment/file reference, never a literal token');
  const result=structuredClone(source);
  result.mcp={...result.mcp,commands:[{channel:'main',command:(npmCache?'env '+quote('npm_config_cache='+path.resolve(npmCache))+' ':'')+quote(process.execPath)+' '+quote(gateway)}]};
  delete result.mcp.server_urls;
  result.log={...result.log,level:'warn'};
  return result;
}
export function main(argv=process.argv.slice(2)){
  const {values}=parseArgs({args:argv,options:{source:{type:'string'},out:{type:'string'},'npm-cache':{type:'string'},help:{type:'boolean'}}});
  if(values.help){console.log('Usage: node tools/env/configure-chat-mcp.mjs --source EXISTING.yaml --out NEW.yaml [--npm-cache DIR]\nRetains tunnel identity and credential references. Refuses overwrites. Does not create or change a ChatGPT app.');return;}
  if(!values.source||!values.out)throw new Error('Provide --source and --out');
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const source=YAML.parse(fs.readFileSync(values.source,'utf8'));
  const result=gatewayProfile(source,path.join(root,'tools/mcp/chat-gateway.mjs'),values['npm-cache']);
  fs.writeFileSync(values.out,YAML.stringify(result),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({ok:true,profile:path.resolve(values.out),identity:'preserved',credentials:'references preserved; values not displayed'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
