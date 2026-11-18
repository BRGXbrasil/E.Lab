import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';

const catalog=JSON.parse(fs.readFileSync('src/catalog.json'));
function database(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_operations.sql','utf8'));return {prepare(query){let values=[];const p={bind(...v){values=v;return p},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}}};return p},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}},sql}}
async function call(db,path,body,user='owner',origin='https://elab.test'){const headers={'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.com'};if(body){headers.origin=origin;headers['content-type']='application/json'}const res=await worker.fetch(new Request('https://elab.test'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),{DB:db});return {status:res.status,data:await res.json()}}
const initialize=async db=>call(db,'/api/bootstrap');

async function setup(){const db=database();await initialize(db);for(const [id,role] of [['seller','commercial'],['desk','reception']]){const r=await call(db,'/api/member',{email:id+'@example.com',name:id,role,active:true});assert.equal(r.status,200);}return db;}
test('commercial bootstrap projects old ownership and preserves stored history',async()=>{
 const db=await setup();
 db.sql.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run('run/reception-003/2026-11-10','run',JSON.stringify({taskId:'reception-003',area:'reception',date:'2026-11-10',status:'done',title:'Retomar conversão'}),7,'2026-11-10T12:00:00Z','original');
 await call(db,'/api/save',{kind:'activation',id:'old-pos',data:{kind:'pos',client:'Cliente',status:'pending'}});
 await call(db,'/api/save',{kind:'entry',id:'desk-entry',data:{title:'Agenda',status:'open'}});
 await call(db,'/api/save',{kind:'routine',id:'custom-sales',data:{title:'Custom',area:'commercial',schedule:'demand'}});
 const commercial=await call(db,'/api/bootstrap',undefined,'seller');assert.equal(commercial.status,200);
 assert.deepEqual(commercial.data.records.filter(r=>r.kind!=='activation_event').map(r=>r.id).sort(),['custom-sales','old-pos','run/reception-003/2026-11-10'].sort());
 const old=commercial.data.records.find(r=>r.kind==='run');assert.equal(old.revision,7);assert.equal(old.data.area,'reception');assert.equal(old.updatedBy,'original');
 const desk=await call(db,'/api/bootstrap',undefined,'desk');assert.deepEqual(desk.data.records.map(r=>r.id),['desk-entry']);
 assert.equal(db.sql.prepare("SELECT COUNT(*) n FROM audit WHERE record_id='run/reception-003/2026-11-10'").get().n,0);
});
test('commercial writes stay in their sector and cannot steal existing records',async()=>{
 const db=await setup();const write=(kind,id,data,user='seller',revision=0)=>call(db,'/api/save',{kind,id,data,revision},user);
 assert.equal((await write('entry','sales-entry',{title:'Contato',status:'open',area:'commercial'})).status,200);
 assert.equal((await write('entry','desk-entry',{title:'Agenda',status:'open'},'desk')).status,200);
 assert.equal((await write('entry','desk-entry',{title:'Steal',status:'open',area:'commercial'},'seller',1)).status,403);
 assert.equal((await write('entry','sales-entry',{title:'Steal',status:'open',area:'reception'},'desk',1)).status,403);
 assert.equal((await write('activation','a',{kind:'conversion',client:'X',status:'pending'},'desk')).status,403);
 assert.equal((await write('activation','a',{kind:'pos',client:'X',status:'pending'})).status,200);
 assert.equal((await write('run','r',{taskId:'reception-003',area:'commercial',status:'done',date:'2026-11-10'})).status,200);
 assert.equal((await write('run','r',{taskId:'reception-001',area:'reception',status:'done',date:'2026-11-10'},'desk',1)).status,403);
 assert.equal((await write('run','r2',{taskId:'reception-001',area:'reception',status:'done',date:'2026-11-10'})).status,403);
 assert.equal((await call(db,'/api/queue',{service:'hair',revision:0,event:{type:'add',name:'X'}},'seller')).status,403);
 assert.equal((await call(db,'/api/results',undefined,'seller')).status,200);
 assert.equal((await call(db,'/api/imports',undefined,'seller')).status,403);
 assert.equal((await call(db,'/api/stock-ledger?productId=p&unit=E.Lab',undefined,'seller')).status,403);
});
test('bootstrap sends effective visible task assignments, including management overrides',async()=>{
 const db=await setup();
 assert.equal((await call(db,'/api/save',{kind:'routine',id:'reception-003',data:{title:'Conversão personalizada',area:'reception',schedule:'daily'}})).status,200);
 const seller=await call(db,'/api/bootstrap',undefined,'seller');assert.ok(Array.isArray(seller.data.tasks));assert.equal(seller.data.tasks.some(t=>t.id==='reception-003'),false);
 const desk=await call(db,'/api/bootstrap',undefined,'desk');assert.equal(desk.data.tasks.find(t=>t.id==='reception-003').area,'reception');assert.equal(desk.data.tasks.find(t=>t.id==='reception-003').title,'Conversão personalizada');
});
