#!/usr/bin/env node
// @doc Validate shaders: canonical F1 environment and plugin support.
// Validate every extracted shader with the installed GLSL compiler and real Dawn.
import fs from 'node:fs';
import crypto from 'node:crypto';
import {extractGlsl, extractWgsl, validateGlsl} from '/workspace/f1-game/tools/check/shader-validate.mjs';
import {resolveBin} from '/workspace/f1-game/tools/lib/lint-bins.mjs';
import {startStaticServer, launchChromium, shutdown, WEBGPU_CHROMIUM_ARGS} from '/workspace/f1-game/tools/lib/harness.mjs';
const output='/workspace/f1-game/artifacts/shader-validate/environment.json';
const hash=source=>crypto.createHash('sha256').update(source).digest('hex');
const report={ok:false,checkedAt:new Date().toISOString(),validators:{glsl:'glslangValidator',wgsl:'Chromium Dawn'},rows:[]};
try {
  const bin=resolveBin('glslangValidator');
  if(!bin) throw new Error('glslangValidator is required; run f1-env install.');
  if(validateGlsl(bin,{id:'environment-negative-control',stage:'frag',source:'#version 300 es\nthis is invalid GLSL;'}).ok)
    throw new Error('GLSL negative control was incorrectly accepted.');
  for(const shader of extractGlsl()) {
    const result=validateGlsl(bin,shader);
    report.rows.push({kind:'glsl',id:shader.id,sha256:hash(shader.source),...result});
  }
  const shaders=extractWgsl();
  if(!shaders.length) throw new Error('No WGSL modules were extracted.');
  const server=await startStaticServer('/workspace/f1-game');
  const browser=await launchChromium({args:[...WEBGPU_CHROMIUM_ARGS]});
  const page=await browser.newPage();
  // Secure loopback origin, with no game or renderer running in the page.
  await page.route('**/shader-validation',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Shader validation</title>'}));
  await page.goto(server.url+'shader-validation');
  report.chromium=browser.version();
  const rows=await page.evaluate(async modules=>{
    const adapter=await navigator.gpu?.requestAdapter();
    if(!adapter) throw new Error('No Dawn WebGPU adapter; WGSL validation was not performed.');
    const device=await adapter.requestDevice({requiredFeatures:adapter.features.has('shader-f16')?['shader-f16']:[]});
    try {
      async function compile(source) {
        device.pushErrorScope('validation');
        const module=device.createShaderModule({code:'diagnostic(error, derivative_uniformity);\n'+source});
        const info=await module.getCompilationInfo();
        const scoped=await device.popErrorScope();
        const messages=info.messages.filter(message=>message.type==='error').map(message=>`${message.lineNum}:${message.linePos} ${message.message}`);
        if(scoped) messages.push(scoped.message);
        return {ok:messages.length===0,output:messages.join('\n')};
      }
      if((await compile('this is invalid WGSL;')).ok) throw new Error('WGSL negative control was incorrectly accepted.');
      const rows=[];
      for(const module of modules) rows.push({id:module.id,...await compile(module.source)});
      return rows;
    } finally {device.destroy();}
  },shaders);
  report.rows.push(...rows.map((row,index)=>({kind:'wgsl',sha256:hash(shaders[index].source),...row})));
  report.negativeControls='both rejected';
  report.ok=report.rows.length>0&&report.rows.every(row=>row.ok);
} catch(error) { report.error=error.message; }
finally {await shutdown();}
fs.mkdirSync('/workspace/f1-game/artifacts/shader-validate',{recursive:true});
fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,glsl:report.rows.filter(row=>row.kind==='glsl'&&row.ok).length,wgsl:report.rows.filter(row=>row.kind==='wgsl'&&row.ok).length,failures:report.rows.filter(row=>!row.ok),error:report.error,negativeControls:report.negativeControls,receipt:output},null,2));
process.exitCode=report.ok?0:1;
