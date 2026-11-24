import fs from 'node:fs';
import {HTML} from '../src/ui.js';
const output='outputs/pages';fs.mkdirSync(output,{recursive:true});
let html=HTML.replace('<script src="/assets/fflate.js"></script>','<script src="./assets/fflate.js"></script><script src="./assets/supabase-2.76.1.js"></script><script src="./assets/hub-auth.js"></script>');
for(const name of fs.readdirSync('vendor/brand-fonts').filter(n=>n.endsWith('.woff2'))){html=html.replaceAll('/assets/brand/'+name,'data:font/woff2;base64,'+fs.readFileSync('vendor/brand-fonts/'+name).toString('base64'));}
html=html.replace('</style>','.login-page{min-height:100vh;display:grid;place-items:center}.login-card{width:min(100%,420px);padding:36px}.login-card h1{margin-top:30px;font-size:32px}.login-card form{display:grid;gap:18px;margin:24px 0}.login-card label{display:grid;gap:7px}.login-card .wordmark{font-size:42px}.login-card #login-feedback{min-height:1.5em;color:var(--red)}</style>');
fs.writeFileSync(output+'/index.html',html);
fs.mkdirSync(output+'/assets',{recursive:true});
fs.copyFileSync('pages/auth.js',output+'/assets/hub-auth.js');
fs.copyFileSync('vendor/fflate.min.js',output+'/assets/fflate.js');
fs.copyFileSync('vendor/supabase-2.76.1.js',output+'/assets/supabase-2.76.1.js');
console.log('Built GitHub Pages with Supabase login.');
