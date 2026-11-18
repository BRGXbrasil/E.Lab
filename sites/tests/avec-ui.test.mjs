import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {APPROVED_STAFF} from '../src/presence.js';import {IMPORT_SCHEMAS} from '../src/imports.js';
const read=p=>fs.readFileSync(p,'utf8');
function ui(role='admin'){const el={innerHTML:'',open:false,addEventListener(){},querySelector(){return {}},showModal(){this.open=true},close(){this.open=false}};const context=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},Date,Intl,structuredClone,setTimeout,clearTimeout,console,fetch(){}}),code=read('src/core.js').replace(/export /g,'')+'\n'+fs.readFileSync('src/performance-report.js','utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,'')+'\n'+fs.readFileSync('src/profile-invitation.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('src/stock-coverage.js','utf8').replace(/export /g,'')+'\n'+read('src/client.js').replace('// __FEATURE_CLIENT__',read('src/feature-client.js')+'\n'+read('src/avec-client.js')).split("try{C=await request('/catalog.json')")[0];vm.runInContext(code,context);vm.runInContext(`C=${JSON.stringify({...JSON.parse(read('src/catalog.json')),questions:JSON.parse(read('src/profile-questions.json'))})};session={id:'owner',email:'owner@example.com',name:'Owner',role:'${role}'};date='2026-11-09';presenceState={staff:${JSON.stringify(APPROVED_STAFF)},shifts:${JSON.stringify(APPROVED_STAFF.map(p=>({id:'shift/2026-11-09/'+p.id,revision:1,data:{staffId:p.id,date:'2026-11-09',start:p.start,status:'pending',enabled:true,toleranceMinutes:60}})))},events:[],alerts:[]};importState={schemas:${JSON.stringify(IMPORT_SCHEMAS)},batches:[],files:[]};`,context);return {el,context}}
test('painel abre em Todos sem dados consolidados e sem módulos duplicados',()=>{const {el,context}=ui();vm.runInContext("view='panel';render()",context);assert.ok(el.innerHTML.includes('Rotina do dia'));assert.ok(!el.innerHTML.includes('AVEC · Dados consolidados'));assert.ok(el.innerHTML.includes('value="all" selected'));const nav=el.innerHTML.split('</nav>')[0];assert.ok(!nav.includes('data-id="relations"'));assert.ok(!nav.includes('data-id="routines"'));assert.ok(!nav.includes('data-id="manage"'));assert.ok(!el.innerHTML.includes('data-id="records"'));for(const title of ['Acompanhar','Próximos passos','Pendências'])assert.ok(el.innerHTML.includes(title))});
test('resultados mostram carteira e serviços sem financeiro',()=>{const {el,context}=ui();vm.runInContext("view='results';render()",context);for(const title of ['Carteira do salão','Serviços realizados','Ticket médio','Retorno observado','Disponibilidade'])assert.ok(el.innerHTML.includes(title));assert.ok(!el.innerHTML.includes('Transferências internas'));assert.ok(!el.innerHTML.includes('Financeiro'))});
test('movimentos de estoque exibem medidas separadas e saldo desconhecido',()=>{const {el,context}=ui();vm.runInContext(`stockState={products:[],local:[],movementCount:3,activity:[{productId:'p',name:'Produto teste',rows:3,from:'2026-08-26',to:'2026-11-07',measures:{un:{in:2,out:1,adjustment:0,net:1},g:{in:0,out:30,adjustment:0,net:-30}}}]};view='inventory';render()`,context);assert.ok(el.innerHTML.includes('un: entradas 2'));assert.ok(el.innerHTML.includes('g: entradas 0'));assert.ok(el.innerHTML.includes('Saldo a conferir'));assert.ok(el.innerHTML.includes('variação abaixo não é o saldo'))});

test('Estoque exibe cobertura e planejamento com data atual e validação de quantidade',async()=>{
 const {buildStockCoverageReport}=await import('../src/stock-coverage.js');const {el,context}=ui('controls');context.fixture=buildStockCoverageReport({rows:[{key:'A',name:'Produto A',balance:10,balanceDate:'2026-11-18',outflow:30,periodDays:30,observationRows:3,unit:'un'}],now:'2026-11-18T12:00:00Z'});vm.runInContext("stockState.orderReport=fixture;view='replenishment';render()",context);
 for(const value of ['Verificar reposição','18/11/2026','Saldo projetado hoje','Cobertura (dias)','Urgente','15 dias'])assert.ok(el.innerHTML.includes(value),value);
 assert.ok(!el.innerHTML.includes('data-action="stock-coverage-policy"'));
});

test('carteira do salão permanece completa quando o comparativo é filtrado',()=>{
 const {el,context}=ui();
 const row=(id,date,professional,client,quantity)=>({id,kind:'avec_service',data:{unit:'E.Lab',normalized:{date,professional,client,quantity,amountCents:10000,command:id}}});
 context.fixture=[row('1','2026-09-02','Allan','Cecília',2),row('2','2026-11-05','Allan','Cecília',3),row('3','2026-10-01','Diogo','Júlia',1),row('4','2026-10-10','Diego Borges','Ana',5)];
 vm.runInContext("resultState.services=fixture;resultFrom='2026-09-01';resultTo='2026-11-30';resultProfessional='Allan';view='results';render()",context);
 assert.match(el.innerHTML,/09\/2026.*10\/2026.*11\/2026/s);
 assert.match(el.innerHTML,/<th scope="row">Allan<\/th><td>2<\/td><td>0<\/td><td>3<\/td>/);
 assert.doesNotMatch(el.innerHTML,/Diego Borges/);
 const portfolio=el.innerHTML.split('Carteira do salão')[1];
 assert.match(portfolio,/Cecília.*Recorrente/s);
 assert.match(portfolio,/Júlia.*Primeira vez/s);
 assert.match(portfolio,/Ana.*Primeira vez/s);
});
test('filtros preservam a cobertura fixa de 15 dias na quantidade sugerida',async()=>{
 const {buildStockCoverageReport}=await import('../src/stock-coverage.js');const {context}=ui();context.fixture=buildStockCoverageReport({rows:[{key:'B',name:'Produto B',balance:10,balanceDate:'2026-11-18',outflow:60,periodDays:30,observationRows:3,unit:'un'}],now:'2026-11-18T12:00:00Z'});const row=vm.runInContext('stockOrderRows(fixture)[0]',context);assert.equal(row.coverageDays,5);assert.equal(row.orderUnits,40);assert.equal(row.quantityReason,null);
});
