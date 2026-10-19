import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source = readFileSync(new URL('../../tools/gfx/gpu-mem-census.mjs', import.meta.url), 'utf8');
function fixture(withErrors = false) {
  class GL {}
  Object.assign(GL, { RGBA8:1, RGBA:2 });
  for (const name of ['bindVertexArray','bindBufferBase','bindBufferRange','compressedTexImage2D','activeTexture','bindTexture','texStorage2D','texStorage3D','texImage2D','texImage3D','generateMipmap','deleteTexture','bindRenderbuffer','renderbufferStorage','renderbufferStorageMultisample','deleteRenderbuffer','bindBuffer','bufferData','deleteBuffer']) GL.prototype[name] = function () {};
  GL.prototype.createTexture = function () { return {}; };
  GL.prototype.deleteTexture = function () { if(this.failDelete)this.error=1282; };
  GL.prototype.getError = function () { const e=this.error||0;this.error=0;return e; };
  if (withErrors) { GL.prototype.getError = function () { const e = this.error || 0; this.error = 0; return e; }; GL.prototype.bufferData = function () { this.error = 1281; }; }
  vm.runInNewContext(source.slice(source.indexOf('function installWrap()'), source.indexOf('async function main()')) + '\ninstallWrap();', { WebGL2RenderingContext: GL, WeakRef });
  return { g: new GL(), GL, s: GL.prototype.__gm };
}
test('requested allocation arithmetic handles array mips, float uploads and exact nonsquare chains', () => {
  const {g,s}=fixture(), a={},b={},c={};
  g.bindTexture(35866,a);g.texStorage3D(35866,3,1,4,4,4);assert.equal(s.tex.get(a).b,336);
  g.bindTexture(3553,b);g.texImage2D(3553,0,2,2,2,0,2,5126,null);assert.equal(s.tex.get(b).b,64);
  g.bindTexture(3553,c);g.texImage2D(3553,0,1,4,1,0,2,5121,null);g.generateMipmap(3553);assert.equal(s.tex.get(c).b,28);
  g.texImage2D(3553,1,1,8,1,0,2,5121,null);assert.equal(s.tex.get(c).b,52);
});
test('bindings isolate contexts, active texture units and cube faces', () => {
  const {g,GL,s}=fixture(),h=new GL(),a={},b={},c={},cube={};
  g.bindTexture(3553,a);g.activeTexture(33985);g.bindTexture(3553,b);g.texStorage2D(3553,1,1,4,4);
  g.activeTexture(33984);g.texStorage2D(3553,1,1,2,2);
  h.bindTexture(3553,c);h.texStorage2D(3553,1,1,1,1);
  assert.equal(s.tex.get(a).b,16);assert.equal(s.tex.get(b).b,64);assert.equal(s.tex.get(c).b,4);
  g.bindTexture(34067,cube);for(let face=34069;face<=34074;face++)g.texImage2D(face,0,1,2,2,0,2,5121,null);
  assert.equal(s.tex.get(cube).b,96);
});
test('zero samples, buffer subranges and large sizes retain allocation bytes', () => {
  const {g,s}=fixture(),r={},b={};g.bindRenderbuffer(36161,r);g.renderbufferStorageMultisample(36161,0,1,4,4);assert.equal(s.rb.get(r).b,64);
  g.bindBuffer(34962,b);g.bufferData(34962,new Uint16Array(32),35044,4,8);assert.equal(s.buf.get(b),16);
  g.bufferData(34962,2**32+12,35044);assert.equal(s.buf.get(b),2**32+12);
  g.deleteBuffer(b);assert.equal(s.buf.size,0);
});
test('unknown formats remain visible and native errors reject accounting without swallowing errors', () => {
  const {g,s}=fixture(),t={};g.bindTexture(3553,t);g.texStorage2D(3553,1,999,2,2);assert.equal(s.unknown.length,1);
  const f=fixture(true), b={}; f.g.bindBuffer(34962,b); f.g.bufferData(34962,-1,35044); assert.equal(f.s.buf.size,0); assert.equal(f.s.failed.length,1); assert.equal(f.g.getError(),1281); assert.equal(f.g.getError(),0);
});

test('VAO element buffers and indexed generic buffer bindings retain ownership', () => {
  const {g,s}=fixture(),a={},b={},v1={},v2={};
  g.bindVertexArray(v1);g.bindBuffer(34963,a);g.bufferData(34963,16,35044);
  g.bindVertexArray(v2);g.bindBuffer(34963,b);g.bufferData(34963,32,35044);
  g.bindVertexArray(v1);g.bufferData(34963,64,35044);
  assert.equal(s.buf.get(a),64);assert.equal(s.buf.get(b),32);
  g.bindBufferBase(35345,0,a);g.bufferData(35345,128,35044);assert.equal(s.buf.get(a),128);
  g.bindBufferRange(35345,0,b,0,16);g.bufferData(35345,256,35044);assert.equal(s.buf.get(b),256);
});
test('compressed replacements remove stale estimates and metadata exceptions remain observational', () => {
  const {g,s}=fixture(),t={};g.bindTexture(3553,t);g.texImage2D(3553,0,1,4,4,0,2,5121,null);
  g.compressedTexImage2D(3553,0,33776,4,4,0,new Uint8Array(8));assert.equal(s.tex.get(t).b,0);
  assert.doesNotThrow(()=>g.texImage2D(3553,0,6408,6408,5121,{get width(){throw Error('metadata');}}));
  assert.ok(s.unknown.some(x=>x.reason==='instrumentation failed'));
});

test('lifecycle counts ignore failed and duplicate deletes through one native wrapper', () => {
  const {g,s}=fixture(),t=g.createTexture();g.bindTexture(3553,t);g.texImage2D(3553,0,1,4,4,0,2,5121,null);
  g.failDelete=true;g.deleteTexture(t);assert.equal(s.tex.get(t).b,64);assert.equal(s.life.Texture.deleted,0);assert.equal(g.getError(),1282);
  g.failDelete=false;g.deleteTexture(t);g.deleteTexture(t);assert.equal(s.tex.get(t),undefined);assert.equal(s.life.Texture.created,1);assert.equal(s.life.Texture.deleted,1);
});

test('measurement outcome separates stub coverage and rejects native failures', () => {
  const body=source.slice(source.indexOf('    const nativeFailure ='),source.indexOf('    const report ='));
  const outcome=(real,out={},errors=0)=>vm.runInNewContext(body+';({ok,correctness})',{REAL_LINK:real,out:{failedCount:0,failedLinkCount:0,linkCount:1,...out},pageErrorCount:errors});
  assert.equal(outcome(false).correctness.status,'unverified');assert.equal(outcome(false).ok,true);
  assert.equal(outcome(true).correctness.status,'pass');
  assert.equal(outcome(true,{failedLinkCount:1}).ok,false);assert.equal(outcome(true,{linkCount:0}).ok,false);
  assert.equal(outcome(true,{failedCount:1}).ok,false);assert.equal(outcome(false,{},1).ok,false);
});
