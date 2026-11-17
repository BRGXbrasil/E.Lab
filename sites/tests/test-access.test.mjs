import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';
function database(){
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_operations.sql','utf8'));
 return {sql,prepare(query){let values=[];const p={bind(...v){values=v;return p},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}}};return p},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
}
const call=(db,path,body,mode='enabled',headers={})=>worker.fetch(new Request('https://elab.test'+path,{method:body?'POST':'GET',headers:{...(body?{'content-type':'application/json',origin:'https://elab.test'}:{}),...headers},body:body?JSON.stringify(body):undefined}),{DB:db,ELAB_TEST_ACCESS:mode});
test('test mode opens every role-gated module without claiming ownership',async()=>{
 const db=database();const res=await call(db,'/api/bootstrap');assert.equal(res.status,200);
 const data=await res.json();assert.equal(data.user.role,'admin');assert.equal(data.user.testAccess,true);assert.equal(data.user.temporaryReadOnly,undefined);
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM workspace').get().n,0);
 for(const path of ['/api/audit','/api/recovery','/api/presence','/api/replenishment','/api/imports','/api/results'])assert.equal((await call(db,path)).status,200,path);
});
test('anonymous test edits are persisted under a distinct audit actor',async()=>{
 const db=database();const res=await call(db,'/api/save',{id:'test-entry',kind:'entry',revision:0,data:{title:'Teste sem login',status:'open'}});assert.equal(res.status,200);
 const row=db.sql.prepare('SELECT updated_by FROM records WHERE id=?').get('test-entry');assert.equal(row.updated_by,'teste-sem-login@elab.invalid');
 assert.equal(db.sql.prepare('SELECT actor FROM audit WHERE record_id=?').get('test-entry').actor,'teste-sem-login@elab.invalid');
});
test('test mode still rejects external origins and cannot change the real owner',async()=>{
 const db=database();db.sql.exec("INSERT INTO workspace(id,owner_id) VALUES(1,'owner');INSERT INTO members(email,user_id,name,role,active) VALUES('owner@example.com','owner','Owner','admin',1)");
 let response=await call(db,'/api/save',{kind:'entry',data:{title:'External',status:'open'}},'enabled',{origin:'https://evil.test'});assert.equal(response.status,403);
 response=await call(db,'/api/member',{email:'owner@example.com',name:'Owner',role:'manager',active:false});assert.equal(response.status,400);
 assert.equal(db.sql.prepare("SELECT role FROM members WHERE user_id='owner'").get().role,'admin');
});
test('disabling the flag restores anonymous denial, including spoofed client flags',async()=>{
 const db=database();for(const mode of ['','disabled','true'])assert.equal((await call(db,'/api/bootstrap',undefined,mode,{'x-elab-test-access':'enabled'})).status,401);
});
