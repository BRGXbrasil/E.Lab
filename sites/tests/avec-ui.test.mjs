import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {APPROVED_STAFF} from '../src/presence.js';import {IMPORT_SCHEMAS} from '../src/imports.js';
const read=p=>fs.readFileSync(p,'utf8');
function ui(role='admin'){const el={innerHTML:'',open:false,addEventListener(){},querySelector(){return {}},showModal(){this.open=true},close(){this.open=false}};const context=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},Date,Intl,structuredClone,setTimeout,clearTimeout,console,fetch(){}}),code=read('src/core.js').replace(/export /g,'')+'\n'+fs.readFileSync('src/performance-report.js','utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,'')+'\n'+read('src/client.js').replace('// __FEATURE_CLIENT__',read('src/feature-client.js')+'\n'+read('src/avec-client.js')).split("try{C=await request('/catalog.json')")[0];vm.runInContext(code,context);vm.runInContext(`C=${JSON.stringify({...JSON.parse(read('src/catalog.json')),questions:JSON.parse(read('src/profile-questions.json'))})};session={id:'owner',email:'owner@example.com',name:'Owner',role:'${role}'};date='2026-11-09';presenceState={staff:${JSON.stringify(APPROVED_STAFF)},shifts:${JSON.stringify(APPROVED_STAFF.map(p=>({id:'shift/2026-11-09/'+p.id,revision:1,data:{staffId:p.id,date:'2026-11-09',start:p.start,status:'pending',enabled:true,toleranceMinutes:60}})))},events:[],alerts:[]};importState={schemas:${JSON.stringify(IMPORT_SCHEMAS)},batches:[],files:[]};`,context);return {el,context}}
test('painel abre na recepção sem dados consolidados e sem módulos duplicados',()=>{const {el,context}=ui();vm.runInContext("view='panel';render()",context);assert.ok(el.innerHTML.includes('Rotina do dia'));assert.ok(!el.innerHTML.includes('AVEC · Dados consolidados'));assert.ok(el.innerHTML.includes('value="reception" selected'));const nav=el.innerHTML.split('</nav>')[0];assert.ok(!nav.includes('data-id="relations"'));assert.ok(!nav.includes('data-id="routines"'));assert.ok(!nav.includes('data-id="manage"'));assert.ok(!el.innerHTML.includes('data-id="records"'));for(const title of ['Acompanhar','Próximos passos','Pendências'])assert.ok(el.innerHTML.includes(title))});
test('resultados mostram carteira e serviços sem financeiro',()=>{const {el,context}=ui();vm.runInContext("view='results';render()",context);for(const title of ['Carteira do salão','Serviços realizados','Ticket médio','Retorno observado','Disponibilidade'])assert.ok(el.innerHTML.includes(title));assert.ok(!el.innerHTML.includes('Transferências internas'));assert.ok(!el.innerHTML.includes('Financeiro'))});
test('movimentos de estoque exibem medidas separadas e saldo desconhecido',()=>{const {el,context}=ui();vm.runInContext(`stockState={products:[],local:[],movementCount:3,activity:[{productId:'p',name:'Produto teste',rows:3,from:'2026-08-26',to:'2026-11-07',measures:{un:{in:2,out:1,adjustment:0,net:1},g:{in:0,out:30,adjustment:0,net:-30}}}]};view='inventory';render()`,context);assert.ok(el.innerHTML.includes('un: entradas 2'));assert.ok(el.innerHTML.includes('g: entradas 0'));assert.ok(el.innerHTML.includes('Saldo a conferir'));assert.ok(el.innerHTML.includes('variação abaixo não é o saldo'))});

test('Estoque abre o relatório validado com sugestão, período e risco',async()=>{
 const {validatedStockOrderReport}=await import('../src/stock-order.js');
 const {el,context}=ui('controls');
 context.fixture=validatedStockOrderReport();
 vm.runInContext("stockState.orderReport=fixture;view='replenishment';render()",context);
 for(const value of ['4 produtos para comprar','15/10/2026','13/11/2026','24/11/2026','EMULSÃO 4%','MASCARA FUSION','Faltam','Comprar agora','Saída por dia'])assert.ok(el.innerHTML.includes(value),value);
 vm.runInContext("orderBrand='KEUNE';orderFilter='buy';render()",context);
 assert.ok(el.innerHTML.includes('Nenhum produto encontrado.'));
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
test('data de cobertura muda o consumo projetado sem ampliar a compra acima do giro',async()=>{
 const {validatedStockOrderReport}=await import('../src/stock-order.js');
 const {context}=ui();
 context.fixture=validatedStockOrderReport();
 const rows=target=>vm.runInContext(`stockTargetDate='${target}';stockOrderRows(fixture)`,context);
 const first=rows('2026-11-24');
 const later=rows('2026-12-04');
 const item=first.find(r=>r.name==='EMULSÃO 4%');
 assert.equal(later.find(r=>r.name===item.name).orderUnits,4);
 assert.ok(Math.abs(later.find(r=>r.name===item.name).required-2*item.required)<1e-10);
 assert.ok(first.slice(0,4).every(r=>r.status==='buy'));
 assert.ok(first.findIndex(r=>r.status==='attention')<first.findIndex(r=>r.status==='ok'));
});
