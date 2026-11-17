import test from 'node:test';import assert from 'node:assert/strict';
import {readSubmittedProfiles} from '../src/profile-bridge.js';
test('profile bridge denies unauthorized roles and temporary viewers before network',async()=>{
 for(const user of [{role:'cleaning'},{role:'controls'},{role:'professional'},{role:'admin',temporaryReadOnly:true}]){
  await assert.rejects(()=>readSubmittedProfiles(new Request('https://site/api/client-profiles'),{},user),error=>error.status===403);
 }
});
test('profile bridge signs page and search for authorized reception',async()=>{
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);const privateKey=await crypto.subtle.exportKey('jwk',keys.privateKey);
 const previous=globalThis.fetch;let called=0;
 globalThis.fetch=async(url,options)=>{called++;assert.match(url,/elab-profile-read$/);const body=JSON.parse(options.body);assert.equal(body.page,2);assert.equal(body.search,'Ana');assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},keys.publicKey,Buffer.from(options.headers['x-elab-signature'],'base64'),new TextEncoder().encode(options.body)),true);return Response.json({profiles:[]})};
 try{const response=await readSubmittedProfiles(new Request('https://site/api/client-profiles?page=2&search=Ana'),{ELAB_PROFILE_SIGNING_KEY:JSON.stringify(privateKey)},{role:'reception'});assert.deepEqual(await response.json(),{profiles:[]});assert.equal(called,1)}finally{globalThis.fetch=previous}
});
test('profile bridge rejects malformed filters without contacting the endpoint',async()=>{
 await assert.rejects(()=>readSubmittedProfiles(new Request('https://site/api/client-profiles?page=-1'),{ELAB_PROFILE_SIGNING_KEY:'configured'},{role:'admin'}),error=>error.status===400);
});
