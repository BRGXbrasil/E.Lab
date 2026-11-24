import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {supabaseIdentity,pagesApiResponse,HUB_PAGES_ORIGIN} from '../src/supabase-auth.js';
import {assistantSession} from '../src/assistant-session.js';
const request=(path='/api/bootstrap',headers={},body)=>new Request('https://elab.test'+path,{method:body?'POST':'GET',headers:{origin:HUB_PAGES_ORIGIN,...headers},body:body?JSON.stringify(body):undefined});
test('Pages API rejects unknown origins and missing bearer before reaching any data',async()=>{
 let calls=0;const handler=()=>{calls++;return Response.json({private:true})};
 assert.equal((await pagesApiResponse(request('/api/bootstrap',{origin:'https://evil.example',authorization:'Bearer test'}),{},null,handler)).status,403);
 const missing=await pagesApiResponse(request(),{ELAB_TEST_ACCESS:'enabled'},null,handler);assert.equal(missing.status,401);assert.equal(missing.headers.get('access-control-allow-origin'),HUB_PAGES_ORIGIN);assert.equal(calls,0);
});
test('Pages preflight supports API and catalog, preserving bearer and payload on writes',async()=>{
 for(const path of ['/api/save','/catalog.json']){const res=await pagesApiResponse(new Request('https://elab.test'+path,{method:'OPTIONS',headers:{origin:HUB_PAGES_ORIGIN}}),{},null,()=>assert.fail());assert.equal(res.status,204);assert.match(res.headers.get('access-control-allow-headers'),/authorization/);}
 const result=await pagesApiResponse(request('/api/save',{authorization:'Bearer session'},{title:'Registro'}),{},null,async req=>{assert.equal(req.headers.get('origin'),'https://elab.test');assert.equal(req.headers.get('authorization'),'Bearer session');assert.equal((await req.json()).title,'Registro');return Response.json({ok:true},{headers:{'Set-Cookie':'private=secret'}})});
 assert.equal(result.status,200);assert.equal(result.headers.get('set-cookie'),null);assert.equal(result.headers.get('access-control-allow-origin'),HUB_PAGES_ORIGIN);
});
test('Supabase identity requires verified, authorized membership and ignores client role claims',async()=>{
 const req=request('/api/bootstrap',{authorization:'Bearer verified','x-role':'admin','oai-authenticated-user-id':'forged'});
 let called=false;const identity=await supabaseIdentity(req,async(url,opts)=>{called=true;assert.ok(url.endsWith('/elab-hub-identity'));assert.equal(opts.headers.Authorization,'Bearer verified');return Response.json({id:'945d8b25-1076-4bf0-b383-0d921fe22774',email:'operator@example.com',name:'Operadora',role:'reception'})});
 assert.ok(called);assert.equal(identity.role,'reception');assert.equal(identity.authProvider,'supabase');assert.ok(identity.id.startsWith('supabase:'));
 for(const status of [401,403,503])await assert.rejects(()=>supabaseIdentity(req,async()=>Response.json({},{status})),error=>error.status===status);
 await assert.rejects(()=>supabaseIdentity(req,async()=>Response.json({id:'user',email:'owner@example.com',role:'admin'})),error=>error.status===403);
 const scope=await assistantSession(request(),null,identity);assert.equal(scope.identity,'user:'+identity.id);assert.equal(scope.cookie,undefined);
});
test('Pages build stays on GitHub, vendors pinned SDK and gates initialization before operational fetch',()=>{
 const html=fs.readFileSync('outputs/pages/index.html','utf8'),auth=fs.readFileSync('pages/auth.js','utf8');
 assert.ok(!html.includes('http-equiv="refresh"'));assert.ok(!html.includes('window.location.replace'));
 assert.match(html,/\.\/assets\/supabase-2\.76\.1\.js/);assert.match(html,/\.\/assets\/hub-auth\.js/);assert.ok(!html.includes('service_role'));
 assert.match(auth,/signInWithPassword/);assert.match(auth,/elab-login/);assert.match(auth,/credentials:'omit'/);assert.match(html,/await window.elabAuth.ready/);assert.ok(html.includes("btn('history-export'"));
});
