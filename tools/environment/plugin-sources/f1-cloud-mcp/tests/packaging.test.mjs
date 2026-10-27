// @doc Packaging.test: canonical F1 environment and plugin support.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
test('hosted package does not require local stdio process launch',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'.codex-plugin/plugin.json')));
 assert.equal(manifest.mcpServers,undefined);
 for(const file of ['.mcp.json','mcp.json']) assert.equal(fs.existsSync(path.join(root,file)),false);
 assert.equal(manifest.skills,'./skills');
 const skills=fs.readdirSync(path.join(root,'skills'));
 assert.ok(skills.some(name=>fs.existsSync(path.join(root,'skills',name,'SKILL.md'))));
 const binding=JSON.parse(fs.readFileSync(path.join(root,manifest.apps)));
 assert.deepEqual(Object.values(binding.apps).map(app=>app.id),['asdk_app_6ade996f81448191a51fc4e7a33152a8']);
});
