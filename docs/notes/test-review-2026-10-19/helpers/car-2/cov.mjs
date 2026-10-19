// usage: node cov.mjs <covdir>  -> per js/ file: functions executed / total (block-level any-count>0)
import fs from 'fs'; import path from 'path';
const dir = process.argv[2]; const out = {};
for (const f of fs.readdirSync(dir)) {
  const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  for (const s of j.result) {
    const m = s.url.replace('file://' + process.cwd() + '/', ''); if (!/^js\/.*\.js$/.test(m)) continue;
    const e = out[m] ||= { total: 0, hit: 0 };
    for (const fn of s.functions) { if (!fn.functionName && fn.ranges.length === 1 && fn.ranges[0].startOffset === 0) continue; e.total++; if (fn.ranges[0].count > 0) e.hit++; }
  }
}
for (const [k, v] of Object.entries(out)) console.log(path.relative(process.cwd(), k), `${v.hit}/${v.total}`);
