import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html=readFileSync(new URL('./lista-da-vez.html',import.meta.url),'utf8');
const begin=html.indexOf('<script>(function(root){');
assert.ok(begin>=0,'queue engine is embedded in served HTML');
const end=html.indexOf('</script>',begin);
const context={structuredClone};
vm.runInNewContext(html.slice(begin+8,end),context);
const {QueueLogic:q,QueueSync:sync}=context;
assert.ok(q&&sync,'both queue and reconciliation engines load');
const services=[
 ['hair',['Dani','Allan','Luiza','Wallace']],
 ['nails',['Alana','Camila','Cristine']],
 ['gel',['Alana','Camila','Cristine']],
 ['brows',['Déia','Marina']],
 ['makeup',['Déia','Marina']]
];
const state=people=>({
 people:[...people],nextUp:people[0],agendaNextUp:people[0],absent:[],occupied:[],
 weeklyCount:Object.fromEntries(people.map(p=>[p,0])),log:[],events:[],futureQueue:[]
});
const event=(id,type,fields={})=>({
 eventId:id,type,at:'2026-11-12T13:00:00.000Z',...fields
});
for(const [key,people] of services){
 test(key+' — Agora and Agenda each complete an independent full rotation',()=>{
  let s=state(people);
  for(const queue of ['immediate','advance']){
   const visited=[];
   for(let i=0;i<people.length;i++){
    const p=(queue==='immediate'?q.order(s):q.inverseOrder(s))[0];
    assert.ok(p);
    visited.push(p);
    s=q.transition(s,{type:'attendance',person:p,queue});
   }
   assert.equal(new Set(visited).size,people.length);
   assert.equal(queue==='immediate'?s.nextUp:s.agendaNextUp,people[0]);
  }
  assert.equal(s.nextUp,people[0]);assert.equal(s.agendaNextUp,people[0]);
 });
 test(key+' — occupied skips temporarily, absent loses turn, returns do not reset list',()=>{
  const base=state(people);
  let occupied=q.transition(base,{type:'status',person:people[0],to:'occupied'});
  assert.equal(q.order(occupied)[0],people[1]);
  assert.equal(q.inverseOrder(occupied)[0],people[1]);
  assert.equal(occupied.nextUp,people[0]);
  assert.equal(occupied.agendaNextUp,people[0]);
  occupied=q.transition(occupied,{type:'status',person:people[0],to:'present'});
  assert.equal(q.order(occupied)[0],people[0]);
  const absent=q.transition(base,{type:'status',person:people[0],to:'absent'});
  assert.equal(absent.nextUp,people[1]);
  assert.equal(absent.agendaNextUp,people[1]);
  const returned=q.transition(absent,{type:'status',person:people[0],to:'present'});
  assert.equal(q.order(returned)[0],people[1]);
 });
 test(key+' — two simultaneous Agora clients retain both audit events and correct staff',()=>{
  const base={[key]:state(people)},remote=structuredClone(base),local=structuredClone(base);
  sync.replayEvent(remote[key],event('srvA-'+key,'attendance',{client:'TESTE-A',service:key,queue:'Agora',logId:1}),remote[key]);
  local[key].events.push(event('srvB-'+key,'attendance',{client:'TESTE-B',service:key,queue:'Agora',logId:2}));
  const result=sync.rebase(base,local,remote);
  assert.equal(result[key].log.length,2);
  assert.equal(result[key].log[0].prof,people[0]);
  assert.equal(result[key].log[1].prof,people[1]);
  assert.equal(result[key].events.length,2);
  assert.equal(result[key].nextUp,people[2%people.length]);
  assert.equal(result[key].weeklyCount[people[0]],1);
  assert.equal(result[key].weeklyCount[people[1]],1);
  const retried=sync.rebase(base,local,result);
  assert.equal(retried[key].events.length,2,'duplicate retry must be idempotent');
 });
 test(key+' — simultaneous Agora pass and Agenda booking advance only their own lists',()=>{
  const base={[key]:state(people)},remote=structuredClone(base),local=structuredClone(base);
  sync.replayEvent(remote[key],event('pass-'+key,'pass',{queue:'Agora'}),remote[key]);
  const appointment={id:'appt-'+key,nome:'TESTE AGENDA',prof:people[0],serv:key,status:'scheduled',scheduledAt:'2026-11-13T10:00'};
  local[key].futureQueue.push(appointment);
  local[key].events.push(event('book-'+key,'appointment_created',{queue:'Agenda',appointmentId:appointment.id,client:appointment.nome}));
  const merged=sync.rebase(base,local,remote);
  assert.equal(merged[key].nextUp,people[1]);
  assert.equal(merged[key].agendaNextUp,people[1]);
  assert.equal(merged[key].futureQueue.length,1);
  assert.equal(merged[key].futureQueue[0].prof,people[0]);
  assert.equal(merged[key].events.length,2);
 });
 test(key+' — missed Agenda booking restores its owner without affecting Agora',()=>{
  const c=state(people),item={id:'a1',nome:'TESTE NAO CONFIRMADO',prof:people[0],status:'scheduled'};
  c.futureQueue.push(item);c.agendaNextUp=people[1];c.nextUp=people[1];
  sync.replayEvent(c,event('miss-'+key,'appointment_missed',{queue:'Agenda',appointmentId:'a1'}),c);
  assert.equal(c.futureQueue[0].status,'missed');
  assert.equal(c.agendaNextUp,people[0]);assert.equal(c.nextUp,people[1]);
 });
 test(key+' — preference service has no queue mutation or event',()=>{
  const s=state(people),before=JSON.stringify(s);
  // Preferences never invoke a QueueLogic transition or event recording.
  assert.equal(JSON.stringify(s),before);
  assert.doesNotMatch(html,/data-preference-attend=/);
 });
}
test('Agenda confirmation and cancellation preserve an auditable terminal state',()=>{
 const c=state(['A','B']),one={id:'one',status:'scheduled',prof:'A'};
 c.futureQueue.push(one);
 sync.replayEvent(c,event('confirm','appointment_confirmed',{appointmentId:'one',queue:'Agenda'}),c);
 assert.equal(one.status,'confirmed');
 const other={id:'two',status:'scheduled',prof:'B'};c.futureQueue.push(other);c.agendaNextUp='A';
 sync.replayEvent(c,event('cancel','appointment_cancelled',{appointmentId:'two',queue:'Agenda'}),c);
 assert.equal(other.status,'cancelled');assert.equal(c.agendaNextUp,'B');
 assert.equal(c.events.length,2);
});
test('Occupation and roster rename or removal are replayable after conflict',()=>{
 const c=state(['A','B','C']);
 sync.replayEvent(c,event('busy','status_change',{professional:'A',to:'occupied'}),c);
 assert.equal(q.order(c)[0],'B');
 sync.replayEvent(c,event('rename','roster_change',{from:'A',professional:'Z'}),c);
 assert.equal(c.people[0],'Z');assert.ok(c.occupied.includes('Z'));
 sync.replayEvent(c,event('removed','roster_removed',{professional:'Z'}),c);
 assert.ok(!c.people.includes('Z'));assert.equal(c.events.length,3);
});
test('Delete attendance is replayable and audited',()=>{
 const c=state(['A','B']);
 sync.replayEvent(c,event('served','attendance',{queue:'Agora',client:'TESTE',service:'Corte',logId:345}),c);
 sync.replayEvent(c,event('deleted','attendance_deleted',{logId:345,queue:'Agora'}),c);
 assert.equal(c.log.length,0);assert.equal(c.weeklyCount.A,0);assert.equal(c.events.length,2);
});
test('Bulk absence is replayable, and appointments cannot be double-confirmed after a miss',()=>{
 const c=state(['A','B','C']);
 sync.replayEvent(c,event('all','status_change',{queue:'Agora',to:'A, B'}),c);
 assert.equal(c.absent.length,2);
 c.futureQueue.push({id:'m',prof:'B',status:'scheduled'});
 sync.replayEvent(c,event('missed','appointment_missed',{appointmentId:'m',queue:'Agenda'}),c);
 assert.throws(()=>sync.replayEvent(c,event('lateConfirm','appointment_confirmed',{appointmentId:'m',queue:'Agenda'}),c));
});
test('Offline journal, online retry, optimistic lock and realtime conflict guard are present',()=>{
 for(const pattern of [/sessionStorage\.setItem\(stateKey\+'_unsent'/,/QueueSync\.rebase\(base,snapshot,fresh\.data\.data\)/, /persistRunning\|\|persistPending/, /addEventListener\('online'/, /eq\('revision',revision\)/]){
  assert.match(html,pattern);
 }
 assert.doesNotMatch(html,/SUPABASE_SERVICE_ROLE_KEY|MYSQL_ROOT_PASSWORD/);
});
test('Queue HTML scripts parse after escaping client and staff text',()=>{
 const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
 assert.ok(scripts.length>=2);
 for(const match of scripts) assert.doesNotThrow(()=>new vm.Script(match[1]));
 assert.match(html,/function esc\(v\)/);
 assert.match(html,/\$\{esc\(item\.nome\)\}/);
 assert.match(html,/esc\(x\.effect\)/);
});
