import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('GitHub entry stays on Pages and shows Supabase login before requesting operational data',async()=>{
 const html=await readFile('index.html','utf8'),auth=await readFile('assets/hub-auth.js','utf8');
 assert.ok(!/http-equiv=["']refresh/.test(html));assert.ok(!/location\.replace\(/.test(html));
 assert.match(html,/\.\/assets\/supabase-2\.76\.1\.js/);assert.match(html,/await window.elabAuth.ready/);
 const el={innerHTML:''},form={addEventListener(){}};
 const context=vm.createContext({document:{querySelector:s=>s==='#app'?el:form},window:{supabase:{createClient:()=>({auth:{onAuthStateChange(){},async getSession(){return {data:{session:null}}}}})}},location:{reload(){assert.fail('Login must stay on Pages')}},fetch(){assert.fail('No API call before sign-in')},Headers,Promise});
 vm.runInContext(auth,context);await new Promise(resolve=>setImmediate(resolve));
 assert.match(el.innerHTML,/type="password"/);assert.match(el.innerHTML,/Nome de usuário ou e-mail/);assert.ok(!el.innerHTML.includes('ChatGPT'));
});
