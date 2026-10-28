const assert=require('assert');
const q=require('./queue-logic-node.js');
const base=extra=>({people:['A','B','C','D'],nextUp:'A',absent:[],occupied:[],...extra});
function agendaPass(state){const order=q.inverseOrder(state), before=order[0]; if(before) state.nextUp=before; return state;}
let s=base();
assert.deepStrictEqual(q.order(s),['A','B','C','D'],'Agora começa no ponteiro');
assert.deepStrictEqual(q.inverseOrder(s),['D','C','B','A'],'Agenda começa ao inverso');
s=agendaPass(s); assert.strictEqual(q.order(s)[0],'D'); assert.deepStrictEqual(q.inverseOrder(s),['C','B','A','D'],'Agenda passa D para C');
s=agendaPass(s); assert.strictEqual(q.order(s)[0],'C'); assert.deepStrictEqual(q.inverseOrder(s),['B','A','D','C'],'Agenda passa C para B');
s=base({occupied:['A']}); assert.deepStrictEqual(q.order(s),['B','C','D']); assert.deepStrictEqual(q.inverseOrder(s),['D','C','B']);
s=q.transition(s,{type:'status',person:'A',to:'present'}); assert.deepStrictEqual(q.order(s),['A','B','C','D'],'retorno ocupado preserva ponteiro');
s=base({absent:['A']}); assert.deepStrictEqual(q.order(s),['B','C','D']); s=q.transition(s,{type:'status',person:'A',to:'present'}); assert.deepStrictEqual(q.order(s),['B','C','D','A'],'retorno ausente não toma a vez');
s=base({nextUp:'C',absent:['A'],occupied:['B']}); assert.deepStrictEqual(q.order(s),['C','D']); assert.deepStrictEqual(q.inverseOrder(s),['D','C']);
s=q.transition(s,{type:'pass',person:'C'}); assert.strictEqual(q.order(s)[0],'D');
s=base({absent:['A','B','C','D']}); assert.deepStrictEqual(q.order(s),[]); assert.deepStrictEqual(q.inverseOrder(s),[]);
s=base({nextUp:'Z'}); assert.deepStrictEqual(q.order(s),['A','B','C','D'],'ponteiro inválido recupera início');
s=base({occupied:['A','B','C','D']}); assert.deepStrictEqual(q.order(s),[],'todos ocupados deixa fila vazia');
console.log('queue integration tests: 12 passed');
