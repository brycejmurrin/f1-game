// @doc Controls and paired image loading for the captured visor gallery.
"use strict";
const $=id=>document.getElementById(id),title=s=>({ice:'Ice Blue',smoke:'Tinted',off:'Original'}[s]||s[0].toUpperCase()+s.slice(1));
const state={scene:'bahrain-day-dry',mode:'smoke',color:'amber',intensity:'medium'};
let data,lookup,generation=0;
const variant=()=>state.mode==='smoke'?state.color+'-'+state.intensity:state.mode;
function pressed(id,value){for(const b of $(id).querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.value===value));}
async function render(){
 const request=++generation;
 const scene=data.scenes.find(s=>s.id===state.scene),a=lookup.get(state.scene+'|off'),b=lookup.get(state.scene+'|'+variant());
 if(!a||!b){$('status').textContent='This comparison is not available.';return;}
 $('stage').setAttribute('aria-busy','true');$('stage').style.opacity='.5';$('status').textContent='Loading the matching comparison…';
 try{await Promise.all([a.file,b.file].map(src=>{const image=new Image();image.src=src;return image.decode();}));}
 catch(error){if(request!==generation)return;$('stage').setAttribute('aria-busy','false');$('stage').style.opacity='1';$('status').textContent='The selected images could not be loaded. Please select the view again.';return;}
 if(request!==generation)return;
 $('original').src=a.file;$('candidate').src=b.file;$('candidate').alt=scene.label+' with '+(state.mode==='smoke'?title(state.color)+' '+title(state.intensity)+' visor':title(state.mode)+' visor');
 $('stage').setAttribute('aria-busy','false');$('stage').style.opacity='1';
 const name=state.mode==='smoke'?title(state.color)+' / '+title(state.intensity):title(state.mode);
 $('lens-name').textContent=name;$('image-label').textContent=name.toUpperCase();$('scene').value=state.scene;$('scene-note').textContent=scene.note;
 $('scene-caption').textContent=title(scene.track)+' · '+title(scene.tod)+' · '+title(scene.weather)+' · 1920 × 1080';
 $('download').href=b.file;$('download').download=state.scene+'--'+variant()+'.webp';
 $('color-field').disabled=state.mode!=='smoke';$('intensity-field').disabled=state.mode!=='smoke';
 $('intensity-note').textContent=title(state.intensity)+' · '+({light:12,medium:18,strong:24}[state.intensity])+'% lens tint';
 $('lens-description').textContent=state.mode==='off'?'The original helmet view, with its existing edge vignette.':state.mode==='clear'?'A curved shield and faint edge reflections, with an untinted centre.':({neutral:'A neutral shaded lens.',amber:'A warm amber lens.',ice:'A cool blue lens.',rose:'A soft rose lens.'}[state.color])+' HUD labels stay clear.';
 for(const k of ['mode','color','intensity'])pressed(k,state[k]);
 for(const card of $('scene-grid').children){const c=lookup.get(card.dataset.scene+'|'+variant());card.querySelector('img').src=c.thumb;card.setAttribute('aria-pressed',String(card.dataset.scene===state.scene));}
 $('status').textContent='Fixed camera. Fixed road view. The divider shows Original on the left and '+name+' on the right.';
}
for(const k of ['mode','color','intensity'])$(k).addEventListener('click',e=>{const b=e.target.closest('button');if(!b||b.disabled)return;state[k]=b.dataset.value;if(data)render();});
$('scene').addEventListener('change',e=>{state.scene=e.target.value;render();});
$('wipe').addEventListener('input',e=>{$('stage').style.setProperty('--wipe',e.target.value+'%');e.target.setAttribute('aria-valuetext',e.target.value+'% original view on the left');});
async function init(){
 const response=await fetch('shots.json');if(!response.ok)throw new Error('Capture index could not be loaded.');data=await response.json();
 if(data.verdict!=='PASS')throw new Error('Capture verification is incomplete.');lookup=new Map(data.captures.map(c=>[c.scene+'|'+c.variant,c]));
 $('capture-count').textContent=data.captures.length;
 for(const scene of data.scenes){const o=document.createElement('option');o.value=scene.id;o.textContent=scene.label;$('scene').append(o);
  const card=document.createElement('button');card.className='scene-card';card.type='button';card.dataset.scene=scene.id;card.setAttribute('aria-pressed','false');
  const img=document.createElement('img');img.alt=scene.label+' visor preview';img.loading='lazy';img.width=640;img.height=360;
  const copy=document.createElement('div'),heading=document.createElement('strong'),note=document.createElement('span');heading.textContent=scene.label;note.textContent=title(scene.track)+' · '+title(scene.tod)+' / '+title(scene.weather);copy.append(heading,note);card.append(img,copy);
  card.addEventListener('click',()=>{state.scene=scene.id;render();$('lab').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'});});$('scene-grid').append(card);
 }
 $('provenance').textContent='1920 × 1080, high-quality WebP exported from PNG originals. '+data.requestedBackend+' renderer, software GPU, Ultra preset, render scale 1. Full-HD output; software presentation may use a smaller internal render buffer. Reduced motion enabled. Synthetic parked race scenes at lap fraction 0.18. Source '+data.source.sha.slice(0,9)+' with working-tree changes; fingerprint '+data.source.fingerprint.slice(0,16)+'. These stills assess appearance and visibility; they do not establish driving performance or physical-GPU behaviour.';
 if(data.patches?.length)$('provenance').textContent+=' Wet-weather scenes were refreshed with verified surface wetness and reflection inputs; other scenes retain their original captures. Refresh source '+data.patches.at(-1).source.sha.slice(0,9)+' with working-tree changes. See settled-weather.json for measured inputs.';
 render();
}
init().catch(e=>{$('status').textContent=e.message;});

// Hiding the selector keeps the chosen lens and gives the image the full row.
const selectorButton=$('toggle-selector'),selectorPanel=$('visor-selector');
function showSelector(show){selectorPanel.hidden=!show;document.body.classList.toggle('selector-hidden',!show);selectorButton.setAttribute('aria-expanded',String(show));selectorButton.textContent=show?'Hide selector':'Show selector';}
selectorButton.addEventListener('click',()=>showSelector(selectorPanel.hidden));
showSelector(!matchMedia('(max-width:1100px)').matches);
