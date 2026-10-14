const assert=require('assert');
const q=require('./queue-logic-node.js');
function state(extra={}){return {people:['A','B','C'],nextUp:'A',absent:[],occupied:[],...extra}}
assert.deepStrictEqual(q.order(state()),['A','B','C'],'rotação normal');
assert.deepStrictEqual(q.order(state({occupied:['A']})),['B','C'],'ocupada não bloqueia');
let s=q.transition(state({occupied:['A']}),{type:'status',person:'A',to:'present'});
assert.strictEqual(s.nextUp,'A','ocupada preserva a vez ao retornar');
s=q.transition(state(),{type:'status',person:'A',to:'absent'});
assert.strictEqual(s.nextUp,'B','ausência perde a vez');
assert.strictEqual(q.order(s)[0],'B','ausente não é elegível');
s=q.transition(state(),{type:'pass',person:'A'});
assert.strictEqual(s.nextUp,'B','passar a vez avança uma vez');
s=q.transition(state(),{type:'attendance',person:'A'});
assert.strictEqual(s.nextUp,'B','atendimento avança uma vez');
assert.deepStrictEqual(q.order(state({absent:['A'],occupied:['B']})),['C'],'uma única elegível funciona');
console.log('queue-logic tests: 7 passed');
