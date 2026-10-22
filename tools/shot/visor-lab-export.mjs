// @doc Copy the committed Visor Lab authoring files and the game's visor runtime into an existing Site checkout.
import {cp, mkdir, readdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=path.join(root,'examples/visor-lab');
const target=process.argv[2];
if(!target||!path.isAbsolute(target))throw new Error('Usage: node tools/shot/visor-lab-export.mjs /absolute/path/to/existing/site/dist');
if(path.resolve(target)===source)throw new Error('Export destination must differ from the authoring directory');
await mkdir(target,{recursive:true});
for(const name of ['optics.html','index.html','app.js','style.css','shots.json','settled-weather.json','comparisons.html','comparisons.js','comparisons.css'])await cp(path.join(source,name),path.join(target,name));
await cp(path.join(source,'images'),path.join(target,'images'),{recursive:true});
await cp(path.join(source,'comparison-images'),path.join(target,'comparison-images'),{recursive:true});
// Keep pairs added directly to an existing Site; update only matching source IDs.
const incoming=JSON.parse(await readFile(path.join(source,'comparisons.json'),'utf8'));
let previous={pairs:[]};try{previous=JSON.parse(await readFile(path.join(target,'comparisons.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
if(!Array.isArray(previous.pairs))throw new Error('Invalid destination comparison index');
const pairs=new Map(previous.pairs.map(pair=>[pair.id,pair]));for(const pair of incoming.pairs)pairs.set(pair.id,pair);
await writeFile(path.join(target,'comparisons.json'),JSON.stringify({...incoming,pairs:[...pairs.values()]},null,2)+'\n');
for(const [from,to] of [['js/fx/droplets.js','visor-droplets.js'],['js/camera/cockpit-opts.js','visor-options.js'],['css/helmet-visor.css','visor-optics.css']])await cp(path.join(root,from),path.join(target,to));
console.log('Exported Visor Lab authoring files, '+(await readdir(path.join(source,'images'))).length+' original captures and the current visor runtime to '+target);
