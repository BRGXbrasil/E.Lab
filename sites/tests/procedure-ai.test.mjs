import test from 'node:test';import assert from 'node:assert/strict';import {consultProcedures} from '../src/procedure-ai.js';
const docs=[{id:'caixa',title:'Fechamento',steps:['Conferir comprovantes.','Registrar divergências.']}];
const response=matches=>async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({matches})}]}]}));
test('IA só devolve texto presente no documento selecionado',async()=>{const result=await consultProcedures('O caixa está divergente',docs,{OPENAI_API_KEY:'test'},response([{id:'caixa',steps:[1]}]));assert.deepEqual(result.matches[0].steps,['Registrar divergências.'])});
test('documento inventado ou etapa inexistente é rejeitado',async()=>{for(const match of [{id:'inventado',steps:[0]},{id:'caixa',steps:[8]}])await assert.rejects(()=>consultProcedures('Uma situação qualquer',docs,{OPENAI_API_KEY:'test'},response([match])),/não corresponde/)});
test('ausência de procedimento é explícita e ausência de conexão não finge inteligência',async()=>{assert.deepEqual((await consultProcedures('Uma situação sem regra',docs,{OPENAI_API_KEY:'test'},response([]))).matches,[]);assert.deepEqual(await consultProcedures('Uma situação sem regra',docs,{}),{matches:[],mode:'catalog'})});

test('consulta clara responde pelo catálogo mesmo quando o serviço de IA está indisponível',async()=>{
 const source=[{id:'fechamento',title:'Fechamento de Caixa',steps:['Conferir os recebimentos.','Registrar divergências.']}];
 const result=await consultProcedures('Como fazer o fechamento de caixa?',source,{OPENAI_API_KEY:'test'},async()=>new Response('unavailable',{status:503}));
 assert.equal(result.mode,'catalog');assert.deepEqual(result.matches,[{id:'fechamento',title:'Fechamento de Caixa',steps:source[0].steps}]);
});
