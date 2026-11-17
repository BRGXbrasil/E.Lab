import test from 'node:test';import assert from 'node:assert/strict';import {projectPresenceQueue} from '../src/features.js';import {ordered} from '../src/core.js';
const day='2026-11-09',staff=[{id:'dani',name:'Dani'},{id:'allan',name:'Allan'},{id:'luiza',name:'Luiza'}];
const queue=()=>({people:staff.map(p=>({name:p.name,status:'present',presenceDate:day})),nextUp:'Dani',counts:{},future:[]});
const ev=(id,type,staffId,at,date=day)=>({id,data:{type,staffId,at,date}});
test('ausência seguida de retorno entre consultas mantém avanço da vez',()=>{const original=queue(),events=[ev('1','absent','dani',day+'T13:00:00.000Z'),ev('2','present','dani',day+'T13:01:00.000Z')],q=projectPresenceQueue(original,events,staff,day);assert.equal(q.nextUp,'Allan');assert.deepEqual(ordered(q,false,day).map(p=>p.name),['Allan','Luiza','Dani']);assert.equal(original.nextUp,'Dani');assert.deepEqual(projectPresenceQueue(q,events,staff,day),q)});
test('chegada não libera ocupação e registros de outro dia não alteram a vez',()=>{const q=queue();q.people[0].status='occupied';let next=projectPresenceQueue(q,[ev('1','present','dani',day+'T13:00:00.000Z')],staff,day);assert.equal(next.people[0].status,'occupied');next=projectPresenceQueue(q,[ev('2','absent','dani',day+'T13:00:00.000Z','2026-11-08')],staff,day);assert.deepEqual(next,q)});
test('jornada futura importada antes do cursor é aplicada ao iniciar aquele dia',()=>{const q=queue();q.presenceCursor={at:day+'T20:00:00.000Z',id:'z',day};const next=projectPresenceQueue(q,[ev('1','dayoff','dani',day+'T12:00:00.000Z','2026-11-10')],staff,'2026-11-10');assert.equal(next.people[0].status,'absent');assert.equal(next.people[0].presenceDate,'2026-11-10')});

test('uma chegada registrada reconcilia uma ausência anterior da fila, preservando a vez',()=>{
 const original=queue();
 original.people[0].status='absent';
 original.nextUp='Allan';
 const projected=projectPresenceQueue(original,[ev('arrival','present','dani',day+'T13:00:00.000Z')],staff,day);
 assert.deepEqual(ordered(projected,false,day).map(p=>p.name),['Allan','Luiza','Dani']);
 assert.equal(original.people[0].status,'absent');
});
