// @doc Copy the committed Visor Lab authoring files and the game's visor runtime into an existing Site checkout.
import {cp, mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source=path.join(root,'examples/visor-lab');
const target=process.argv[2];
if(!target||!path.isAbsolute(target))throw new Error('Usage: node tools/shot/visor-lab-export.mjs /absolute/path/to/existing/site/dist');
if(path.resolve(target)===source)throw new Error('Export destination must differ from the authoring directory');
await mkdir(target,{recursive:true});
for(const name of ['optics.html','index.html','app.js','style.css','shots.json','settled-weather.json'])await cp(path.join(source,name),path.join(target,name));
await cp(path.join(source,'images'),path.join(target,'images'),{recursive:true});
for(const [from,to] of [['js/fx/droplets.js','visor-droplets.js'],['js/camera/cockpit-opts.js','visor-options.js'],['css/helmet-visor.css','visor-optics.css']])await cp(path.join(root,from),path.join(target,to));
console.log('Exported Visor Lab authoring files, '+(await readdir(path.join(source,'images'))).length+' original captures and the current visor runtime to '+target);
