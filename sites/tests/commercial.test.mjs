import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as core from '../src/core.js';
const catalog=JSON.parse(fs.readFileSync('src/catalog.json'));
test('conversion and post-service routines move without changing identities or schedule',()=>{
 for(const id of ['reception-003','reception-005']){const t=catalog.tasks.find(t=>t.id===id);assert.equal(t.area,'commercial');assert.equal(t.schedule,'daily');assert.deepEqual(t.days,[2,3,4,5,6]);}
 assert.equal(catalog.tasks.find(t=>t.id==='reception-cash-close').area,'reception');
});
test('commercial role owns activations and only its own operational records',()=>{
 assert.equal(core.areas.commercial,'Comercial');assert.equal(core.roles.commercial,'Comercial');
 assert.equal(core.canKind('commercial','activation'),true);assert.equal(core.canKind('reception','activation'),true);
 assert.equal(core.canArea('commercial','reception'),false);assert.equal(core.canKind('commercial','queue'),false);
 assert.equal(core.recordArea({kind:'run',data:{taskId:'reception-003',area:'reception'}},catalog.tasks),'commercial');
 assert.equal(core.recordArea({kind:'activation',data:{kind:'pos'}},catalog.tasks),'commercial');
 assert.equal(core.recordArea({kind:'entry',data:{}},catalog.tasks),'reception');
 const custom=[...catalog.tasks.filter(t=>t.id!=='reception-003'),{id:'reception-003',area:'reception'}];
 assert.equal(core.recordArea({kind:'run',data:{taskId:'reception-003',area:'commercial'}},custom),'reception');
});
function ui(role){
 const element={addEventListener(){},innerHTML:'',querySelector(){return {}},showModal(){},close(){}};
 const context=vm.createContext({document:{querySelector:()=>element,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},console,Date,Intl,structuredClone,setTimeout,clearTimeout,fetch(){}});
 const code=fs.readFileSync('src/core.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('src/performance-report.js','utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,'')+'\n'+fs.readFileSync('src/profile-invitation.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('src/stock-coverage.js','utf8').replace(/export /g,'')+'\n'+fs.readFileSync('src/client.js','utf8').replace('// __FEATURE_CLIENT__',fs.readFileSync('src/feature-client.js','utf8')+'\n'+fs.readFileSync('src/avec-client.js','utf8')).split("try{C=await request('/catalog.json')")[0];
 vm.runInContext(code,context);vm.runInContext(`C=${JSON.stringify({...catalog,questions:JSON.parse(fs.readFileSync('src/profile-questions.json'))})};session={id:'u',name:'User',role:'${role}'};date='2026-11-10';`,context);return {element,context};
}
test('commercial dashboard has independent execution, schedule, history and relationship views',()=>{
 const {element,context}=ui('commercial');
 for(const tab of ['today','week','catalog','records','matrix','relationships']){vm.runInContext(`view='commercial';area='commercial';tab='${tab}';render()`,context);assert.ok(element.innerHTML.includes('Comercial'));assert.ok(element.innerHTML.includes('data-id="commercial"'));}
 vm.runInContext("view='commercial';area='commercial';tab='today';render()",context);
 assert.ok(element.innerHTML.includes('Retomar conversão'));assert.ok(element.innerHTML.includes('Fazer pós-atendimento'));assert.ok(!element.innerHTML.includes('Conferir e fechar o caixa'));
 const reception=ui('reception');vm.runInContext("view='panel';render()",reception.context);assert.ok(!reception.element.innerHTML.includes('＋ Nova ativação'));assert.ok(!reception.element.innerHTML.includes('Retomar conversão'));
});

test('Todos inclui Comercial e o filtro Recepção preserva a separação das rotinas',()=>{
 const {element,context}=ui('admin');vm.runInContext("view='panel';area='all';render()",context);
 assert.ok(element.innerHTML.includes('value="commercial"'));assert.ok(element.innerHTML.includes('Retomar conversão'));vm.runInContext("area='reception';render()",context);assert.ok(!element.innerHTML.includes('Retomar conversão'));
});
test('daily post-service activation is available in the commercial work list',()=>{
 const {context}=ui('commercial');assert.ok(vm.runInContext('dailyActivations()',context).includes('Pós-atendimento e avaliação no Google'));
});
test('commercial followup subtabs expose completed returns and sector entries',()=>{
 const {element,context}=ui('commercial');
 vm.runInContext(`records=[{id:'completed',kind:'activation',data:{kind:'pos',client:'Pós concluído fictício',status:'completed'}},{id:'dismissed',kind:'activation',data:{kind:'conversion',client:'Conversão encerrada fictícia',status:'dismissed'}},{id:'entry',kind:'entry',data:{title:'Pendência comercial fictícia',area:'commercial',status:'open'}}];view='commercial';area='commercial';tab='relationships';render();`,context);
 assert.ok(element.innerHTML.includes('data-id="commercial-all"'));
 vm.runInContext("tab='commercial-all';render()",context);assert.ok(element.innerHTML.includes('Pós concluído fictício'));assert.ok(element.innerHTML.includes('Conversão encerrada fictícia'));
 vm.runInContext("tab='commercial-entries';render()",context);assert.ok(element.innerHTML.includes('Pendência comercial fictícia'));assert.ok(!element.innerHTML.includes('Rotina do dia'));
});
test('server task catalog suppresses catalog routines reassigned to another sector',()=>{
 const {element,context}=ui('commercial');vm.runInContext("taskCatalog=C.tasks.filter(t=>t.id!=='reception-003');view='commercial';area='commercial';tab='today';render()",context);
 assert.ok(!element.innerHTML.includes('Retomar conversão'));assert.ok(element.innerHTML.includes('Fazer pós-atendimento'));
});
