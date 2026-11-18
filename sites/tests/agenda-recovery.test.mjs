import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.js';
const day='2026-11-18';
const queue=()=>({people:['Ana','Bia','Cris'].map(name=>({name,status:'present',presenceDate:day})),nextUp:'Ana',counts:{Ana:2},future:[]});
const schedule=(q,id='one')=>core.queueEvent(q,{type:'schedule',id,client:'Cliente '+id,at:'2026-11-18T14:00:00-03:00',day,createdAt:day+'T12:00:00Z'});
test('agenda consumes its own turn on scheduling without moving Agora or attendance counts',()=>{
 const q=schedule(queue());assert.equal(q.future[0].professional,'Cris');assert.equal(core.agendaOrdered(q)[0].name,'Bia');assert.equal(q.nextUp,'Ana');assert.deepEqual(q.counts,{Ana:2});
 const next=core.queueEvent(q,{type:'pass',name:'Ana',mode:'now',day});assert.equal(core.agendaOrdered(next)[0].name,'Bia');
 assert.throws(()=>core.queueEvent(q,{type:'schedule',id:'bad',client:'X',professional:'Ana',at:day+'T12:00:00-03:00',day}),/vez/);
});
test('failed appointments restore one rightful agenda turn, preserve slots and replay safely',()=>{
 let q=schedule(queue());q=schedule(q,'two');q=core.queueEvent(q,{type:'no-show',id:'one',day});
 assert.equal(core.agendaOrdered(q)[0].name,'Cris');assert.equal(q.future.length,2);assert.equal(q.future[0].status,'no_show');
 assert.deepEqual(core.queueEvent(q,{type:'no-show',id:'one',day}),q);
 const next=schedule(q,'three');assert.equal(core.agendaOrdered(next)[0].name,'Ana');assert.deepEqual(next.counts,{Ana:2});assert.equal(next.nextUp,'Ana');
 assert.throws(()=>core.queueEvent(q,{type:'confirm-appointment',id:'one',day}),/encerrado/);
});
test('conference uses São Paulo calendar and does not count or move either queue',()=>{
 let q=schedule(queue());q.future[0].at='2026-11-19T01:00:00Z';
 assert.equal(core.appointmentDate(q.future[0]),'2026-11-18');
 assert.throws(()=>core.queueEvent(q,{type:'confirm-appointment',id:'one',day:'2026-11-17'}),/data/);
 assert.throws(()=>core.queueEvent(q,{type:'no-show',id:'one',day:'2026-11-17'}),/data/);
 const next=core.queueEvent(q,{type:'confirm-appointment',id:'one',day});assert.equal(next.future[0].status,'attended');assert.deepEqual(next.counts,q.counts);assert.equal(next.agendaNextUp,q.agendaNextUp);
 const sections=core.appointmentSections({...q,future:[q.future[0],{id:'future',at:'2026-11-20T15:00:00-03:00',status:'scheduled'},{id:'done',at:day,status:'attended'}]},day);
 assert.deepEqual(sections.conference.map(f=>f.id),['one']);assert.deepEqual(sections.upcoming.map(f=>f.id),['future']);assert.deepEqual(sections.history.map(f=>f.id),['done']);
});
test('recovery deduplicates snapshot/events and preserves outcomes without inventing missing data',()=>{
 const ap={id:'lost',client:'Maria',professional:'Cris',at:'2026-11-12T10:00:00-03:00'};
 const audits=[{record_id:'queue/hair',at:'2026-11-12T10:00:00Z',data:JSON.stringify({future:[ap]})},{record_id:'queue/hair',at:'2026-11-13T10:00:00Z',data:JSON.stringify({future:[]})}];
 const records=[{id:'event',kind:'queue_event',data:{service:'hair',event:{type:'schedule',...ap}}}];
 let q=core.recoverQueueAppointments(queue(),'hair',records,audits,{});assert.equal(q.future.length,1);assert.equal(q.future[0].recovered,true);assert.equal(q.future[0].status,'scheduled');assert.equal(q.nextUp,'Ana');
 assert.deepEqual(core.recoverQueueAppointments(q,'hair',records,audits,{}),q);
 records.push({id:'outcome',kind:'queue_event',data:{service:'hair',at:'2026-11-14T10:00:00Z',event:{type:'no-show',id:'lost'}}});
 q=core.recoverQueueAppointments(queue(),'hair',records,audits,{});assert.equal(q.future[0].status,'no_show');assert.equal(q.future[0].turnReturned,undefined);
 assert.equal(core.recoverQueueAppointments(queue(),'nails',records,audits,{}).future.length,0);
});
test('legacy raw futureQueue aliases preserve appointment dates and deleted evidence without guessing dates',()=>{
 const records=[{id:'snapshot',kind:'source_snapshot',data:{raw:{data:{hair:{futureQueue:[{id:'known',nome:'Cliente',prof:'Bia',serv:'Corte',scheduledAt:'2026-11-13T18:00'}],events:[{type:'appointment_created',appointmentId:'deleted',client:'Cliente',professional:'Bia',at:'2026-10-24T20:00:00Z'}]}}}}}];
 const q=core.recoverQueueAppointments(queue(),'hair',records);assert.equal(q.future.length,2);assert.equal(q.future.find(f=>f.id==='known').at,'2026-11-13T18:00');assert.ok(!q.future.find(f=>f.id==='deleted').at);assert.equal(core.appointmentSections(q,day).recovered.length,1);
});

test('Agenda UI separates conference, upcoming, outcomes and recovered unknown dates',async()=>{
 const fs=await import('node:fs');const vm=await import('node:vm');
 const el={addEventListener(){},querySelector(){return {}},showModal(){},close(){}};
 const source=fs.readFileSync('src/core.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('src/client.js','utf8').split("try{C=await request('/catalog.json')")[0];
 const ctx=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},console,Date,Intl,structuredClone,setTimeout,clearTimeout});
 vm.runInContext(source,ctx);
 const today=core.businessDate();const q=queue();q.future=[{id:'due',client:'Conferir cliente',professional:'Bia',at:today+'T12:00:00-03:00',status:'scheduled'},{id:'future',client:'Futura cliente',professional:'Ana',at:core.addDays(today,2)+'T12:00:00-03:00',status:'scheduled'},{id:'done',client:'Cliente concluída',professional:'Cris',at:today,status:'attended'},{id:'lost',client:'Cliente recuperada',professional:'Bia',status:'scheduled',recovered:true}];
 vm.runInContext(`session={role:'admin',name:'Teste'};presenceState={staff:[]};records=[{id:'queue/hair',data:${JSON.stringify(q)}}];queueTab='agenda';`,ctx);
 const html=vm.runInContext('queuePage()',ctx);for(const title of ['Agendamentos para conferir','Próximos agendamentos','Histórico de agendamentos','Histórico recuperado'])assert.ok(html.includes(title));
 assert.match(html,/data-action="appointment-confirm" data-id="due"/);assert.doesNotMatch(html,/data-action="appointment-confirm" data-id="future"/);assert.ok(html.includes('data não recuperada'));
});

test('queue API restores deleted audit appointment, validates server date and retains replayed return exactly once',async()=>{
 const {DatabaseSync}=await import('node:sqlite');const fs=await import('node:fs');const {default:worker}=await import('../dist/server/index.js');
 const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_operations.sql','utf8'));
 const db={prepare(query){let values=[];const p={bind(...v){values=v;return p},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}}};return p},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
 const call=async(path,body)=>{const res=await worker.fetch(new Request('https://elab.test'+path,{method:body?'POST':'GET',headers:body?{'content-type':'application/json',origin:'https://elab.test'}:{},body:body?JSON.stringify(body):undefined}),{DB:db,ELAB_TEST_ACCESS:'enabled'});return {status:res.status,data:await res.json()}};
 const today=core.businessDate(),q=queue();q.week=core.weekStart(today);q.people.forEach(p=>p.presenceDate=today);
 sql.prepare('INSERT INTO records VALUES(?,?,?,?,?,?)').run('queue/hair','queue',JSON.stringify(q),1,today+'T10:00:00Z','test');
 const lost={id:'lost',client:'Cliente',professional:'Cris',at:core.addDays(today,-1)+'T12:00:00-03:00',status:'scheduled'};
 sql.prepare('INSERT INTO audit VALUES(?,?,?,?,?,?,?)').run('snapshot','queue/hair','queue','schedule','test',today+'T09:00:00Z',JSON.stringify({...q,future:[lost]}));
 let bootstrap=await call('/api/bootstrap');assert.equal(bootstrap.data.records.find(r=>r.id==='queue/hair').data.future[0].id,'lost');
 const body={service:'hair',revision:1,operationId:'outcome-once',event:{type:'no-show',id:'lost'}};
 const result=await call('/api/queue',body);assert.equal(result.status,200);assert.equal(result.data.data.future[0].status,'no_show');assert.deepEqual(result.data.data.counts,{Ana:2});
 assert.equal((await call('/api/queue',body)).data.replayed,true);
 bootstrap=await call('/api/bootstrap');const saved=bootstrap.data.records.find(r=>r.id==='queue/hair');assert.equal(saved.data.agendaReturns.length,1);assert.equal(saved.data.future[0].status,'no_show');
 const scheduled=await call('/api/queue',{service:'hair',revision:2,event:{type:'schedule',client:'Outra cliente',at:core.addDays(today,1)+'T12:00:00-03:00'}});assert.equal(scheduled.status,200);
 const appointment=scheduled.data.data.future.find(f=>f.id!=='lost');assert.equal((await call('/api/queue',{service:'hair',revision:3,event:{type:'confirm-appointment',id:appointment.id,day:core.addDays(today,2)}})).status,400);
 assert.equal((await call('/api/queue',{service:'hair',revision:3,event:{type:'unschedule',id:appointment.id}})).status,200);
 assert.equal((await call('/api/bootstrap')).data.records.find(r=>r.id==='queue/hair').data.future.length,2);
 sql.close();
});

test('terminal outcome evidence cannot be reopened by a stale pending queue or later stale snapshot',()=>{
 const pending={id:'ended',client:'Cliente',professional:'Bia',at:'2026-11-12T12:00:00-03:00',status:'scheduled'};
 const q=queue();q.future=[pending];
 const records=[{kind:'queue_event',data:{service:'hair',at:'2026-11-13T12:00:00Z',event:{type:'no-show',id:'ended'}}}];
 const audits=[{record_id:'queue/hair',at:'2026-11-14T12:00:00Z',data:JSON.stringify({future:[pending]})}];
 const restored=core.recoverQueueAppointments(q,'hair',records,audits);assert.equal(restored.future[0].status,'no_show');assert.equal(restored.future[0].confirmedAt,'2026-11-13T12:00:00Z');assert.equal(core.appointmentSections(restored,day).conference.length,0);
});
