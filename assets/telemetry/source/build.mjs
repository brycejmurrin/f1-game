// Rebuild the derived, LGPL-3.0 Silverstone geometry from the preserved TUM CSVs.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('./',import.meta.url),read=(name)=>readFileSync(new URL(name,root),'utf8');
const meta=JSON.parse(read('calibration.json'));
for(const kind of ['track','line']){
 const hash=createHash('sha256').update(read('Silverstone-'+kind+'.csv')).digest('hex');
 if(hash!==meta.sourceHashes[kind])throw Error('Source changed: '+kind);
}
const csv=(name)=>read(name).trim().split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>l.split(',').map(Number));
const track=csv('Silverstone-track.csv'),raw=csv('Silverstone-line.csv'),center=track.map(p=>p.slice(0,2));
const normals=center.map((p,i)=>{const a=center[(i+center.length-1)%center.length],b=center[(i+1)%center.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);return[-dy/len,dx/len];});
const bounds=[center.map((p,i)=>p.map((v,k)=>v+normals[i][k]*track[i][3])),center.map((p,i)=>p.map((v,k)=>v-normals[i][k]*track[i][2]))];
const nearest=(list,p)=>list.reduce((best,v,i)=>Math.hypot(v[0]-p[0],v[1]-p[1])<Math.hypot(list[best][0]-p[0],list[best][1]-p[1])?i:best,0);
let line=raw.map(p=>{const i=nearest(center,p),n=normals[i],offset=(p[0]-center[i][0])*n[0]+(p[1]-center[i][1])*n[1],safe=Math.max(-track[i][2]+meta.clearanceMetres,Math.min(track[i][3]-meta.clearanceMetres,offset));return p.map((v,k)=>v+(safe-offset)*n[k]);});
const first=nearest(line,meta.startPoint);line=[...line.slice(first),...line.slice(0,first)];line.push(line[0]);
let arc=[0];for(let i=1;i<line.length;i++)arc.push(arc.at(-1)+Math.hypot(line[i][0]-line[i-1][0],line[i][1]-line[i-1][1]));arc=arc.map(s=>s/arc.at(-1));
writeFileSync(new URL('../silverstone.json',root),JSON.stringify({...meta,line,arc,center,bounds,width:track.map(p=>p[2]+p[3])})+'\n');
