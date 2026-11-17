import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
fs.mkdirSync('outputs',{recursive:true});
execFileSync('tar',['-czf','outputs/elab-site.tar.gz','.openai/hosting.json','dist/server/index.js','drizzle']);
console.log('outputs/elab-site.tar.gz');
