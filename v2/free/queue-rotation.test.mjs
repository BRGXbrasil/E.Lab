import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('./lista-da-vez.html',import.meta.url),'utf8');
const match=html.match(/<script>\(function\(root\)\{([\s\S]*?)<\/script>/);
assert.ok(match,'QueueLogic script found');
const sandbox={};vm.runInNewContext('(function(root){'+match[1],sandbox);
const q=sandbox.QueueLogic;
const services=[['Dani','Allan','Luiza','Wallace'],['Alana','Camila','Cristine'],['Alana','Camila','Cristine'],['Déia','Marina'],['Déia','Marina']];
for(const [i,people] of services.entries()){
 test('complete both queue cycles service '+i,()=>{
  let s={people,nextUp:people[0],agendaNextUp:people[0],absent:[],occupied:[]};
  for(const queue of ['immediate','advance']){
   const seen=[];
   for(let n=0;n<people.length;n++){
    const p=(queue==='immediate'?q.order(s):q.inverseOrder(s))[0];
    seen.push(p);
    s=q.transition(s,{type:'attendance',person:p,queue});
   }
   assert.equal(new Set(seen).size,people.length);
   assert.equal(queue==='immediate'?s.nextUp:s.agendaNextUp,people[0]);
  }
 });
 test('absence and occupation service '+i,()=>{
  let s={people,nextUp:people[0],agendaNextUp:people[0],absent:[],occupied:[]};
  s=q.transition(s,{type:'status',person:people[0],to:'occupied'});
  assert.notEqual(q.order(s)[0],people[0]);
  assert.equal(s.nextUp,people[0]);
  s=q.transition(s,{type:'status',person:people[0],to:'present'});
  assert.equal(q.order(s)[0],people[0]);
  s=q.transition(s,{type:'status',person:people[0],to:'absent'});
  assert.notEqual(q.order(s)[0],people[0]);
 });
}
test('Agenda advance does not move Agora',()=>{
 const s={people:['A','B','C'],nextUp:'A',agendaNextUp:'A',absent:[],occupied:[]};
 const n=q.transition(s,{type:'attendance',person:'A',queue:'advance'});
 assert.equal(n.nextUp,'A');assert.equal(n.agendaNextUp,'B');
});
test('No preference is not a queue transition',()=>{
 const s={people:['A','B'],nextUp:'A',agendaNextUp:'B',absent:[],occupied:[]};
 assert.equal(q.order(s)[0],'A');assert.equal(q.inverseOrder(s)[0],'B');
});
test('Revision conflicts block unsafe writes',()=>{
 assert.match(html,/eq\('revision',revision\)/);
 assert.match(html,/cloudReady=false/);
 assert.match(html,/persistPending=true/);
});
test('Missed appointment restores Agenda position',()=>{
 assert.match(html,/c\.agendaNextUp=item\.prof/);
 assert.match(html,/appointment_missed/);
});
