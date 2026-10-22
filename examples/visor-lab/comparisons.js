// @doc Atomic paired image loading and keyboard/touch wipe for an appendable screenshot gallery.
'use strict';
const byId=id=>document.getElementById(id);
let pairs=[],generation=0;
function asset(file){if(typeof file!=='string'||!/^comparison-images\/[a-f0-9]{64}\.webp$/.test(file))throw Error('Invalid image path');return file;}
function wipe(value){const n=Math.max(0,Math.min(100,Number(value)));byId('wipe').value=n;byId('stage').style.setProperty('--wipe',n+'%');byId('value').textContent=n+'% A';byId('wipe').setAttribute('aria-valuetext',n+'% original on left, '+(100-n)+'% candidate on right');}
async function show(id){
 const request=++generation,pair=pairs.find(p=>p.id===id);if(!pair)return;
 byId('stage').setAttribute('aria-busy','true');byId('status').textContent='Loading the matching pair…';
 try{const sources=[asset(pair.a.file),asset(pair.b.file)];await Promise.all(sources.map(src=>{const image=new Image();image.src=src;return image.decode()}));if(request!==generation)return;
 byId('a').src=sources[0];byId('b').src=sources[1];byId('a').alt=pair.title+' — '+pair.a.label;byId('b').alt=pair.title+' — '+pair.b.label;
 byId('stage').style.aspectRatio=pair.width+' / '+pair.height;byId('label-a').textContent='A · '+pair.a.label;byId('label-b').textContent='B · '+pair.b.label;
 for(const key of ['a','b']){byId('download-'+key).href=asset(pair[key].file);byId('download-'+key).download=pair.id+'-'+key+'.webp'}
 byId('description').textContent=pair.title;byId('details').textContent=JSON.stringify(pair.provenance||{source:'Imported screenshots',width:pair.width,height:pair.height},null,2);byId('status').textContent=pair.width+' × '+pair.height+' · '+pair.title;byId('pairs').value=pair.id;
 }catch(error){if(request===generation)byId('status').textContent='Could not load this pair. The previous comparison is preserved.';}
 finally{if(request===generation)byId('stage').setAttribute('aria-busy','false');}
}
byId('wipe').addEventListener('input',event=>wipe(event.target.value));
const divider=byId('divider'),stage=byId('stage');
function drag(event){const box=stage.getBoundingClientRect();wipe(Math.round((event.clientX-box.left)/box.width*100))}
divider.addEventListener('pointerdown',event=>{divider.setPointerCapture(event.pointerId);drag(event)});divider.addEventListener('pointermove',event=>{if(divider.hasPointerCapture(event.pointerId))drag(event)});
function selector(show){byId('selector').hidden=!show;document.body.classList.toggle('selector-hidden',!show);byId('toggle').textContent=show?'Hide selector':'Show selector';byId('toggle').setAttribute('aria-expanded',String(show))}
byId('toggle').addEventListener('click',()=>selector(byId('selector').hidden));selector(innerWidth>1000);
byId('pairs').addEventListener('change',event=>show(event.target.value));wipe(50);
(async()=>{const response=await fetch('comparisons.json');if(!response.ok)throw Error('Comparison index is unavailable');const data=await response.json();if(data.version!==1||!Array.isArray(data.pairs))throw Error('Invalid comparison index');pairs=data.pairs;for(const id of ['lab-link','optics-link'])byId(id).hidden=data.visorLab!==true;for(const pair of pairs){const option=new Option(pair.title,pair.id);byId('pairs').append(option)}if(!pairs.length){byId('status').textContent='No pairs yet. Add screenshots with the A/B capture tool.';return}await show(pairs[0].id)})().catch(error=>{byId('status').textContent=error.message});
