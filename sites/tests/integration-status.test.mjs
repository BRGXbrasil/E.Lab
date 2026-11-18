import test from 'node:test';
import assert from 'node:assert/strict';

test('private Drive rejects anonymous test users even when their role is admin',async()=>{
 const module=await import('../src/integration-status.js').catch(()=>({}));
 assert.equal(typeof module.canUsePrivateDrive,'function','private Drive authorization guard is missing');
 assert.equal(module.canUsePrivateDrive({id:'elab-test-access',email:'teste-sem-login@elab.invalid',role:'admin',testAccess:true}),false);
});

test('private Drive requires a real identity and an authorized role',async()=>{
 const {canUsePrivateDrive}=await import('../src/integration-status.js');
 const real={id:'person-1',email:'person@example.com',role:'reception'};
 assert.equal(canUsePrivateDrive(real),true);
 for(const role of ['pantry','valet','maintenance','professional'])assert.equal(canUsePrivateDrive({...real,role}),true,role);
 for(const patch of [{id:''},{email:''},{email:'test@elab.invalid'},{temporaryReadOnly:true},{testAccess:true},{role:'visitor'},{id:'elab-test-access'}])assert.equal(canUsePrivateDrive({...real,...patch}),false,JSON.stringify(patch));
 assert.equal(canUsePrivateDrive(null),false);
});

test('integration diagnostics are unavailable to test, temporary, and non-management users',async()=>{
 const {integrationStatus}=await import('../src/integration-status.js');
 for(const user of [null,{id:'a',email:'a@example.com',role:'reception'},{id:'a',email:'a@example.com',role:'admin',testAccess:true},{id:'a',email:'a@example.com',role:'manager',temporaryReadOnly:true}])assert.throws(()=>integrationStatus({},user),e=>e.status===403);
});

test('configuration presence never claims live connectivity and never returns secrets or vector IDs',async()=>{
 const {integrationStatus}=await import('../src/integration-status.js');
 const user={id:'owner',email:'owner@example.com',role:'admin'};
 const env={ELAB_MONDAY_AGENT_TOKEN:'secret-agent',OPENAI_API_KEY:'secret-openai',ELAB_DRIVE_INDEXES:JSON.stringify({shared:'vs_private_reference'}),DB:{},BUCKET:{}};
 const result=integrationStatus(env,user);
 assert.equal(result.items.find(x=>x.id==='mondayRead').state,'configured');
 assert.equal(result.items.find(x=>x.id==='mondayWrite').configured,false);
 assert.equal(result.items.find(x=>x.id==='drive').state,'configured');
 assert.equal(result.items.find(x=>x.id==='ai').state,'configured');
 assert.ok(result.items.filter(x=>['mondayRead','drive','ai'].includes(x.id)).every(x=>/validar/.test(x.label)));
 assert.doesNotMatch(JSON.stringify(result),/secret-agent|secret-openai|vs_private_reference|owner@example/);
 assert.equal(result.items.find(x=>x.id==='avec').automaticSync,false);
});

test('only successful recent provider evidence can label a configured provider connection as connected',async()=>{
 const {integrationStatus}=await import('../src/integration-status.js');
 const user={id:'owner',email:'owner@example.com',role:'manager'},env={OPENAI_API_KEY:'fixture-key'},now=Date.parse('2026-11-18T12:00:00Z');
 const get=e=>integrationStatus(env,user,{now,verification:{ai:e}}).items.find(x=>x.id==='ai');
 assert.equal(get({source:'provider',status:'success',checkedAt:new Date(now).toISOString()}).state,'connected');
 for(const source of ['fixture','mock','unit-test'])assert.equal(get({source,status:'success',checkedAt:new Date(now).toISOString()}).state,'configured');
 assert.equal(get({source:'provider',status:'failed',checkedAt:new Date(now).toISOString()}).state,'configured');
 assert.equal(get({source:'provider',status:'success',checkedAt:'2020-01-01T00:00:00Z'}).state,'configured');
 assert.equal(get({source:'provider',status:'success',checkedAt:'2099-01-01T00:00:00Z'}).state,'configured');
});

test('Drive requires both usable indexes and OpenAI while AVEC distinguishes local imports from automatic sync',async()=>{
 const {integrationStatus}=await import('../src/integration-status.js');
 const user={id:'owner',email:'owner@example.com',role:'admin'};
 for(const indexes of ['invalid','[]','{"shared":"not-a-vector"}','{"unexpected":"vs_hidden"}'])assert.equal(integrationStatus({OPENAI_API_KEY:'fixture',ELAB_DRIVE_INDEXES:indexes},user).items.find(x=>x.id==='drive').configured,false);
 assert.equal(integrationStatus({ELAB_DRIVE_INDEXES:'{"shared":"vs_valid"}'},user).items.find(x=>x.id==='drive').configured,false);
 const result=integrationStatus({DB:{},BUCKET:{}},user,{avec:{importedRows:12},verification:{avec:{source:'fixture',status:'success',checkedAt:new Date().toISOString()}}});
 const avec=result.items.find(x=>x.id==='avec');
 assert.equal(avec.configured,true);assert.equal(avec.state,'configured');assert.match(avec.detail,/12/);assert.equal(avec.automaticSync,false);
});

test('legacy technical scope is recognized as configured without claiming live connectivity',async()=>{
 const {integrationStatus}=await import('../src/integration-status.js');
 const user={id:'owner',email:'owner@example.com',role:'admin'};
 const result=integrationStatus({OPENAI_API_KEY:'fixture',ELAB_DRIVE_INDEXES:JSON.stringify({professional:'vs_technical'})},user);
 assert.equal(result.items.find(x=>x.id==='drive').state,'configured');
});
