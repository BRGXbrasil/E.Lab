import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../src/core.js';
import {applyPresenceAction} from '../src/presence.js';
import {projectPresenceQueue} from '../src/features.js';
const day='2026-11-17';
const staff=[{id:'dani',name:'Dani',active:true},{id:'allan',name:'Allan',active:true},{id:'luiza',name:'Luiza',active:true}];
const queue=()=>({people:staff.map((p,i)=>({name:p.name,status:['absent','occupied','unconfirmed'][i],presenceDate:day})),nextUp:'Dani',counts:{},future:[]});
test('agenda order includes the roster irrespective of today presence and supports passing',()=>{
 assert.equal(typeof core.agendaOrdered,'function');
 const q=queue();assert.deepEqual(core.ordered(q,false,day),[]);
 assert.deepEqual(core.agendaOrdered(q).map(p=>p.name),['Luiza','Allan','Dani']);
 const next=core.queueEvent(q,{type:'pass',mode:'agenda',name:'Luiza',day});
 assert.deepEqual(core.agendaOrdered(next).map(p=>p.name),['Allan','Dani','Luiza']);
 assert.deepEqual(next.counts,{});
 assert.equal(core.queueEvent(q,{type:'schedule',id:'f1',client:'Cliente fictícia',at:'2026-11-20T15:00:00-03:00',day}).future[0].professional,'Luiza');
});
test('departure requires prior arrival, preserves check-in and projects absence across queues',()=>{
 const shift={staffId:'dani',date:day,start:'10:00',toleranceMinutes:60,enabled:true,status:'present',checkedInAt:day+'T13:00:00.000Z'};
 const context={at:day+'T20:00:00.000Z',actor:'recepcao'};
 const result=applyPresenceAction(shift,{type:'departed'},context);
 assert.equal(result.shift.status,'absent');assert.equal(result.shift.checkedInAt,shift.checkedInAt);assert.equal(result.shift.checkedOutAt,context.at);assert.equal(result.event.fromStatus,'present');assert.equal(result.event.type,'departed');
 for(const status of ['pending','dayoff','absent'])assert.throws(()=>applyPresenceAction({...shift,status,checkedInAt:undefined},{type:'departed'},context),/chegada|presen/i);
 const q=queue();q.people.forEach(p=>p.status='present');
 const projected=projectPresenceQueue(q,[{id:'departure',data:result.event}],staff,day);
 assert.equal(projected.people[0].status,'absent');assert.equal(projected.nextUp,'Allan');assert.equal(core.ordered(projected,false,day).some(p=>p.name==='Dani'),false);
 assert.equal(applyPresenceAction(result.shift,{type:'departed'},context).changed,false);
});
function contextForUI(q){
 const el={addEventListener(){},innerHTML:'',querySelector(){return {}},showModal(){},close(){}};
 const code=fs.readFileSync('src/core.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('src/performance-report.js','utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,'')+'\n'+fs.readFileSync('src/client.js','utf8').replace('// __FEATURE_CLIENT__',fs.readFileSync('src/feature-client.js','utf8')+'\n'+fs.readFileSync('src/avec-client.js','utf8')).split("try{C=await request('/catalog.json')")[0];
 const ctx=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},console,Date,Intl,structuredClone,setTimeout,clearTimeout,fetch(){}});vm.runInContext(code,ctx);
 vm.runInContext(`C=${fs.readFileSync('src/catalog.json','utf8')};session={role:'admin',name:'Teste'};presenceState.staff=${JSON.stringify(staff)};presenceState.shifts=${JSON.stringify(staff.map(p=>({id:'shift/'+day+'/'+p.id,data:{staffId:p.id,status:'present'}})))};records=[{id:'queue/hair',data:${JSON.stringify(q)}}];`,ctx);return ctx;
}
test('agenda renders no presence badges and Agora exposes departure for every present professional',()=>{
 const q=queue();q.people.forEach(p=>p.presenceDate=core.businessDate());const ctx=contextForUI(q);
 let html=vm.runInContext("queueTab='agenda';queuePage()",ctx);
 for(const p of staff)assert.ok(html.includes(p.name));assert.ok(!/Ausente|Ocupada|Aguardando chegada|data-action="queue-status"|data-action="queue-depart"/.test(html));
 q.people[0].status='present';q.people[1].status='present';
 vm.runInContext(`records[0].data=${JSON.stringify(q)};queueTab='now';`,ctx);html=vm.runInContext('queuePage()',ctx);
 assert.match(html,/Passou a vez/);assert.equal((html.match(/data-action="queue-depart"/g)||[]).length,2);
});

test('presence API departure persists after refresh, reaches all queues, and future passing works with no one present',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const {default:worker}=await import('../dist/server/index.js');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_operations.sql','utf8'));
 const db={prepare(query){let values=[];const p={bind(...v){values=v;return p},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}}};return p},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const call=async(path,body)=>{const res=await worker.fetch(new Request('https://elab.test'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',origin:'https://elab.test'}:{},body:body?JSON.stringify(body):undefined}),{DB:db,ELAB_TEST_ACCESS:'enabled'});return {status:res.status,data:await res.json()}};
 const today=core.businessDate();let presence=(await call('/api/presence')).data;
 const absent=await call('/api/presence',{id:'shift/'+today+'/dani',revision:0,action:{type:'departed'}});assert.equal(absent.status,400);
 for(const id of ['dani','allan'])assert.equal((await call('/api/presence',{id:'shift/'+today+'/'+id,revision:0,action:{type:'present'}})).status,200);
 for(const service of ['hair','makeup']){
  assert.equal((await call('/api/queue',{service,revision:0,event:{type:'add',name:'Dani'}})).status,200);
  assert.equal((await call('/api/queue',{service,revision:1,event:{type:'add',name:'Allan'}})).status,200);
 }
 const departure=await call('/api/presence',{id:'shift/'+today+'/dani',revision:1,operationId:'departure-once',action:{type:'departed'}});assert.equal(departure.status,200);assert.ok(departure.data.record.data.checkedInAt);assert.ok(departure.data.record.data.checkedOutAt);
 assert.equal((await call('/api/presence',{id:'shift/'+today+'/dani',revision:1,operationId:'departure-once',action:{type:'departed'}})).data.replayed,true);
 let bootstrap=await call('/api/bootstrap');
 for(const r of bootstrap.data.records.filter(r=>r.kind==='queue')){assert.equal(r.data.people.find(p=>p.name==='Dani').status,'absent');assert.equal(r.data.nextUp,'Allan');}
 assert.equal((await call('/api/presence',{id:'shift/'+today+'/allan',revision:1,action:{type:'departed'}})).status,200);
 bootstrap=await call('/api/bootstrap');const q=bootstrap.data.records.find(r=>r.id==='queue/hair');assert.deepEqual(core.ordered(q.data),[]);
 const first=core.agendaOrdered(q.data)[0].name;
 assert.equal((await call('/api/queue',{service:'hair',revision:2,event:{type:'pass',mode:'agenda',name:first}})).status,200);
 const saved=sql.prepare("SELECT data FROM records WHERE id='queue/hair'").get();assert.deepEqual(JSON.parse(saved.data).counts,{});
 sql.close();
});
