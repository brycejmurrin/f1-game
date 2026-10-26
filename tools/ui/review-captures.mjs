#!/usr/bin/env node
// @doc Build a portable offline screenshot review from a bounded local evidence manifest.
// @skill css-play
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {screenshotReview} from './design-evidence.mjs';
export function main(argv=process.argv.slice(2)) {
  if(argv.includes('--help')){console.log('Usage: node tools/ui/review-captures.mjs manifest.json [output.html]\nImages are relative to the manifest. Output must be under artifacts/ or scratch/. No browser.');return;}
  if(argv.length<1||argv.length>2)throw new Error('Expected manifest.json and optional output.html');
  const file=path.resolve(argv[0]);if(fs.statSync(file).size>1024*1024)throw new Error('Manifest exceeds 1 MiB');
  const output=path.resolve(argv[1]||path.join(path.dirname(file),'review.html'));
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  if(!['artifacts','scratch'].some(dir=>{const rel=path.relative(path.join(root,dir),output);return rel && rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);}))throw new Error('Output must be under checkout artifacts/ or scratch/');
  // Resolve existing parent to reject output through a symlink outside the artifact root.
  fs.mkdirSync(path.dirname(output),{recursive:true});
  const parent=fs.realpathSync(path.dirname(output));
  if(!['artifacts','scratch'].some(dir=>{const rel=path.relative(path.resolve(root,dir),parent);return rel!=='..'&&!rel.startsWith('..'+path.sep)&&!path.isAbsolute(rel);})||fs.existsSync(output)&&fs.lstatSync(output).isSymbolicLink())throw new Error('Output escapes artifacts');
  fs.writeFileSync(output,screenshotReview(path.dirname(file),JSON.parse(fs.readFileSync(file,'utf8'))));console.log(output);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
