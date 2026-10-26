#!/usr/bin/env node
// @doc Validate local glTF/GLB assets, resource containment and budgets; optionally deduplicate into a separate GLB.
// @skill asset-pack
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import validator from 'gltf-validator';
import {assertOutputDir} from '../lib/output-paths.mjs';
import {NodeIO} from '@gltf-transform/core';
import {dedup,prune} from '@gltf-transform/functions';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
export async function localResource(directory,uri){
  let decoded;try{decoded=decodeURIComponent(uri);}catch{throw new Error('Malformed resource URI');}
  if(/[:?#\\\x00-\x1f]/.test(decoded)||path.isAbsolute(decoded))throw new Error('Only relative local resources are allowed');
  const root=await fs.realpath(directory),file=await fs.realpath(path.resolve(root,decoded));
  const relative=path.relative(root,file);
  if(relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Resource escapes asset directory');
  if((await fs.stat(file)).size>64*1024*1024)throw new Error('Resource exceeds 64 MiB');
  return new Uint8Array(await fs.readFile(file));
}
export async function validateAsset(file,{maxBytes=32*1024*1024,maxTriangles=180000,maxTextureDimension=4096}={}){
  if((await fs.stat(file)).size>64*1024*1024)throw new Error('Input exceeds 64 MiB');
  const bytes=await fs.readFile(file),resources=new Map();
  const report=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),writeTimestamp:false,maxIssues:1000,
    externalResourceFunction:async uri=>{const data=await localResource(path.dirname(file),uri);resources.set(uri,data.byteLength);return data;}});
  const triangles=report.info?.totalTriangleCount;
  const dimensions=(report.info?.resources||[]).filter(r=>r.pointer?.startsWith('/images/')).map(r=>({width:r.image?.width??null,height:r.image?.height??null}));
  const totalBytes=bytes.length+[...resources.values()].reduce((a,b)=>a+b,0);
  const budgetErrors=[];
  if(totalBytes>maxBytes)budgetErrors.push('Total asset bytes exceed budget');
  if(triangles===undefined)budgetErrors.push('Triangle count unavailable');else if(triangles>maxTriangles)budgetErrors.push('Triangles exceed budget');
  for(const i of dimensions){if(i.width===null||i.height===null)budgetErrors.push('Texture dimensions unavailable');else if(i.width>maxTextureDimension||i.height>maxTextureDimension)budgetErrors.push('Texture dimensions exceed budget');}
  return {ok:report.issues.numErrors===0&&!budgetErrors.length,source:path.basename(file),sha256:hash(bytes),bytes:bytes.length,totalBytes,
    externalResources:Object.fromEntries(resources),triangles:triangles??null,imageDimensions:dimensions,budgetErrors,validatorVersion:validator.version(),report,
    limitations:['Validation does not prove runtime rendering, world scale, collision or camera fit. Unsupported extensions remain in the validator report.']};
}
export async function optimizeAsset(input,output,budget={}){
  if(path.resolve(input)===path.resolve(output))throw new Error('Optimization requires a separate output');
  if(await fs.lstat(output).then(()=>true,()=>false))throw new Error('Refusing to overwrite output');
  const validated=await validateAsset(input,budget);if(!validated.ok)throw new Error('Input validation or budget failed');
  // Resolve the complete JSON resource graph through the same containment boundary.
  const io=new NodeIO().setAllowNetwork(false);
  const bytes=await fs.readFile(input);let json;
  if(path.extname(input).toLowerCase()==='.gltf')json=JSON.parse(bytes.toString('utf8'));
  else if(bytes.readUInt32LE(0)===0x46546c67)json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
  for(const item of [...(json?.buffers||[]),...(json?.images||[])])if(item.uri&&!item.uri.startsWith('data:'))await localResource(path.dirname(input),item.uri);
  if(json?.extensionsRequired?.length)throw new Error('Required extensions need an explicit registered decoder; validate only for this asset');
  const document=await io.read(input);await document.transform(dedup(),prune());
  const result=await io.writeBinary(document);await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,result,{flag:'wx'});
  const after=await validateAsset(output,budget);
  return {ok:after.ok,before:validated,after,operations:['dedup','prune']};
}
export async function main(argv=process.argv.slice(2)){
  const {values,positionals}=parseArgs({args:argv,allowPositionals:true,options:{help:{type:'boolean'},out:{type:'string'},optimize:{type:'string'},'max-bytes':{type:'string'},'max-triangles':{type:'string'},'max-texture':{type:'string'}}});
  if(values.help){console.log('Usage: node tools/assets/gltf-check.mjs asset.glb --out artifacts/asset-check.json [--optimize artifacts/optimized.glb] [--max-bytes N --max-triangles N --max-texture N]\nLocal resources only. Optimization refuses overwrites and required extensions without registered decoders.');return;}
  if(positionals.length!==1)throw new Error('Expected one local asset');
  if(values.out&&(await fs.realpath(values.out).catch(()=>null))===await fs.realpath(positionals[0]))throw new Error('Report must not replace input');
  const budget={};for(const [flag,key] of [['max-bytes','maxBytes'],['max-triangles','maxTriangles'],['max-texture','maxTextureDimension']])if(values[flag]!==undefined){const n=Number(values[flag]);if(!Number.isSafeInteger(n)||n<1)throw new Error('Budget must be a positive integer');budget[key]=n;}
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  for(const file of [values.out,values.optimize].filter(Boolean)){
    const output=assertOutputDir(path.resolve(file),root,'output file');
    await fs.mkdir(path.dirname(output),{recursive:true});
    assertOutputDir(path.join(await fs.realpath(path.dirname(output)),path.basename(output)),root,'resolved output');
    if(await fs.lstat(output).then(s=>s.isSymbolicLink(),()=>false))throw new Error('Refusing symlink output');
  }
  const result=values.optimize?await optimizeAsset(positionals[0],values.optimize,budget):await validateAsset(positionals[0],budget);
  if(values.out){await fs.mkdir(path.dirname(values.out),{recursive:true});await fs.writeFile(values.out,JSON.stringify(result,null,2));}
  console.log(JSON.stringify({ok:result.ok,report:values.out||null,...(!values.out?{details:result}:{})}));if(!result.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(e=>{console.error(e.message);process.exitCode=1;});
