// @doc Computed design tokens, axe accessibility evidence and standalone screenshot reviews.
// @skill css-play
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {styles:galleryStyles,screenshotCard} = require('../lib/screenshot-gallery.cjs');
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Runs in the page: resolved values come from the inspected element, not a CSS parser. */
export function collectDesignTokens({selector = 'body', names = []} = {}) {
  const element = document.querySelector(selector);
  if (!element) throw new Error('Token scope not found: ' + selector);
  const style = getComputedStyle(element);
  const keys = [...new Set([...Array.from(style).filter(k => k.startsWith('--')), ...names])].sort();
  const properties = ['color','backgroundColor','fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','gap','padding','borderRadius'];
  const controls=[...element.querySelectorAll('button,input,select,a[href]')].filter(e => {const s=getComputedStyle(e);return e.getClientRects().length && (e.checkVisibility ? e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}) : s.visibility==='visible' && s.display!=='none' && Number(s.opacity)>0);});
  return {selector, viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},
    reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,
    tokens:Object.fromEntries(keys.slice(0,512).map(k => [k,style.getPropertyValue(k).trim()])),
    truncated:keys.length > 512, computed:Object.fromEntries(properties.map(k => [k,style[k]])),
    controlsTotal:controls.length, controlsTruncated:controls.length>30,
    controls:controls.slice(0,30).map(e => {
      const s=getComputedStyle(e), r=e.getBoundingClientRect();
      return {tag:e.tagName.toLowerCase(),id:e.id,disabled:!!e.disabled,focused:e===document.activeElement,
        selected:e.getAttribute('aria-selected') ?? e.getAttribute('aria-pressed'),width:r.width,height:r.height,
        computed:Object.fromEntries(properties.map(k => [k,s[k]]))};
    })};
}

export async function collectAxe(page, selector = 'body') {
  if (!await page.locator(selector).count()) throw new Error('Accessibility scope not found: '+selector);
  const auditURL=new URL('/__apex_local_axe_audit.js',page.url()).href;
  const handler=route=>route.fulfill({path:require.resolve('axe-core/axe.min.js'),contentType:'application/javascript'});
  await page.route(auditURL,handler);
  try{await page.addScriptTag({url:auditURL});}finally{await page.unroute(auditURL,handler);}
  const result = await page.evaluate(async selector => {
    const result=await window.axe.run({include:[[selector]]},{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});
    const rows = list => list.map(r => ({id:r.id,impact:r.impact,description:r.description,help:r.help,helpUrl:r.helpUrl,
      nodes:r.nodes.slice(0,100).map(n => ({target:n.target,failureSummary:n.failureSummary})),totalNodes:r.nodes.length}));
    return {engine:result.testEngine,violations:rows(result.violations),incomplete:rows(result.incomplete),
      passes:result.passes.map(r=>r.id),inapplicable:result.inapplicable.map(r=>r.id)};
  }, selector);
  return {scope:selector,...result,limitations:['Automated DOM checks only; keyboard, screen reader, touch and WebGL scene usability require separate verification.']};
}

export function tokenHTML(report) {
  const esc=escapeHTML;
  const rows=Object.entries(report.tokens).map(([name,value])=>`<tr><th scope="row">${esc(name)}</th><td>${esc(value)}</td></tr>`).join('');
  return pageHTML('Computed design tokens',`<p>Scope: ${esc(report.selector)}. Values reflect this captured state. Hover, focus and disabled states are not inferred.</p><table><thead><tr><th>Token</th><th>Computed value</th></tr></thead><tbody>${rows}</tbody></table><h2>Capture environment and coverage</h2><pre>${esc(JSON.stringify({viewport:report.viewport,reducedMotion:report.reducedMotion,computed:report.computed,tokensTruncated:report.truncated,controlsTotal:report.controlsTotal,controlsTruncated:report.controlsTruncated},null,2))}</pre><h2>Representative control measurements</h2><pre>${esc(JSON.stringify(report.controls,null,2))}</pre>`);
}
export function pageHTML(title,body) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHTML(title)}</title><style>${galleryStyles}body{font:16px/1.5 system-ui;background:#131713;color:#edf1e9;margin:0;padding:24px;max-width:1500px}h1{font-size:clamp(28px,5vw,56px)}a{color:#c8ef8d}button,input,select{font:inherit;min-height:44px}a:focus-visible,input:focus-visible{outline:3px solid #d6f998}img{max-width:100%;height:auto}figure{margin:24px 0;border:1px solid #59634f;padding:16px}pre{white-space:pre-wrap;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%}td,th{padding:12px;border-bottom:1px solid #59634f;text-align:left;overflow-wrap:anywhere}input[type=range]{width:100%}.compare{position:relative}.compare img{display:block;width:100%}.compare .after{position:absolute;inset:0;clip-path:inset(0 50% 0 0)}@media(prefers-reduced-motion:reduce){*{scroll-behavior:auto}}</style><main><h1>${escapeHTML(title)}</h1>${body}</main></html>`;
}

/** Only local PNG/JPEG/WebP raster files contained under the supplied capture root. */
export function localImage(root,relative) {
  if (typeof relative!=='string' || path.isAbsolute(relative)) throw new Error('Image must be relative');
  const base=fs.realpathSync(root),file=fs.realpathSync(path.resolve(base,relative));
  const rel=path.relative(base,file);
  if(rel==='..'||rel.startsWith('..'+path.sep)||path.isAbsolute(rel)) throw new Error('Image escapes capture directory');
  const ext=path.extname(file).toLowerCase(),mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}[ext];
  if(!mime)throw new Error('Only raster screenshots are supported');
  if(fs.statSync(file).size>12*1024*1024)throw new Error('Screenshot exceeds 12 MiB');
  return `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
}
export function screenshotReview(root,manifest) {
  if(!Array.isArray(manifest.shots)||manifest.shots.length<1||manifest.shots.length>40)throw new Error('Review requires 1..40 shots');
  let bytes=0;
  const figures=manifest.shots.map((shot,index)=>{
    const src=localImage(root,shot.file);bytes+=src.length;
    if(bytes>48*1024*1024)throw new Error('Review exceeds 48 MiB embedded budget');
    const comparison=shot.before ? localImage(root,shot.before) : null;
    if(comparison){bytes+=comparison.length;if(bytes>48*1024*1024)throw new Error('Review exceeds embedded budget');}
    if(!comparison)return screenshotCard({title:shot.label||shot.file,image:src,metadata:shot.metadata||{},caption:'Open the image to inspect it at full size.'});
    const image=comparison ? `<label for="compare-${index}">Reveal after image</label><input id="compare-${index}" type="range" min="0" max="100" value="50" data-comparison="image-${index}"><div class="compare"><img src="${comparison}" alt="Before: ${escapeHTML(shot.label)}"><img id="image-${index}" class="after" src="${src}" alt="After: ${escapeHTML(shot.label)}"></div>` : `<a href="${src}"><img src="${src}" alt="${escapeHTML(shot.label||shot.file)}"></a>`;
    return `<figure>${image}<figcaption><h2>${escapeHTML(shot.label||shot.file)}</h2><pre>${escapeHTML(JSON.stringify(shot.metadata||{},null,2))}</pre></figcaption></figure>`;
  }).join('');
  return pageHTML(manifest.title||'Screenshot review',`<p>Local capture evidence. A still image does not prove interaction or motion.</p><pre>${escapeHTML(JSON.stringify(manifest.source||{},null,2))}</pre>${figures}<script>document.querySelectorAll('[data-comparison]').forEach(input=>input.addEventListener('input',()=>{document.getElementById(input.dataset.comparison).style.clipPath='inset(0 '+(100-Number(input.value))+'% 0 0)'}))</script>`);
}
