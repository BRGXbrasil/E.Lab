import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {APPROVED_STAFF} from '../src/presence.js';import {IMPORT_SCHEMAS} from '../src/imports.js';
const read=p=>fs.readFileSync(p,'utf8');
function ui(role='admin'){const el={innerHTML:'',open:false,addEventListener(){},querySelector(){return {}},showModal(){this.open=true},close(){this.open=false}};const context=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},Date,Intl,structuredClone,setTimeout,clearTimeout,console,fetch(){}}),code=read('src/core.js').replace(/export /g,'')+'\n'+fs.readFileSync('src/performance-report.js','utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,'')+'\n'+read('src/client.js').replace('// __FEATURE_CLIENT__',read('src/feature-client.js')+'\n'+read('src/avec-client.js')).split("try{C=await request('/catalog.json')")[0];vm.runInContext(code,context);vm.runInContext(`C=${JSON.stringify({...JSON.parse(read('src/catalog.json')),questions:JSON.parse(read('src/profile-questions.json'))})};session={id:'owner',email:'owner@example.com',name:'Owner',role:'${role}'};date='2026-11-09';presenceState={staff:${JSON.stringify(APPROVED_STAFF)},shifts:${JSON.stringify(APPROVED_STAFF.map(p=>({id:'shift/2026-11-09/'+p.id,revision:1,data:{staffId:p.id,date:'2026-11-09',start:p.start,status:'pending',enabled:true,toleranceMinutes:60}})))},events:[],alerts:[]};importState={schemas:${JSON.stringify(IMPORT_SCHEMAS)},batches:[],files:[]};`,context);return {el,context}}
test('os colaboradores cadastrados têm um único controle e não exigem confirmação de equipe',()=>{const {el,context}=ui();vm.runInContext("date=businessDate();view='presence';render()",context);assert.equal((el.innerHTML.match(/data-action="presence-person"/g)||[]).length,26);assert.equal((el.innerHTML.match(/data-action="presence-edit-shift"/g)||[]).length,0);assert.equal((el.innerHTML.match(/data-action="presence-absence"/g)||[]).length,0);for(const p of APPROVED_STAFF)assert.ok(el.innerHTML.includes(p.name));assert.ok(el.innerHTML.includes('data-id="diego"'));assert.ok(!el.innerHTML.includes('Tolerância de 1 hora'))});
test('leitor não recebe controles de escrita e estoque não recebe caixa',()=>{let {el,context}=ui('professional');vm.runInContext("view='presence';render()",context);assert.ok(!el.innerHTML.includes('data-action="presence-absence"'));assert.ok(!el.innerHTML.includes('data-id="results"'));({el,context}=ui('controls'));vm.runInContext("view='replenishment';render()",context);assert.ok(!el.innerHTML.includes('data-id="results"'));assert.ok(el.innerHTML.includes('Carregando estoque'))});
test('o módulo JavaScript realmente publicado compila com o leitor e os novos fluxos',()=>{const html=read('src/ui.js'),parsed=JSON.parse(html.slice('export const HTML='.length).trim().replace(/;$/,'')),match=parsed.match(/<script type="module">([\s\S]*?)<\/script>/);assert.ok(match);assert.doesNotThrow(()=>new vm.Script('(async()=>{'+match[1]+'})'));assert.ok(parsed.includes('/assets/fflate.js'));assert.ok(!parsed.includes('__FEATURE_CLIENT__'))});
test('received profiles render all answers and consent as escaped text',()=>{
 const {el,context}=ui('reception');vm.runInContext(`submittedProfiles=[{id:'fake',created_at:'2026-11-17T13:00:00Z',submission:{answers:{name:'<img src=x onerror=alert(1)>',ritual:'café coado',care:'Atenção fictícia'},consentContact:false,consentPrivacy:true}}];view='clients';render()`,context);
 assert.ok(el.innerHTML.includes('&lt;img src=x'));assert.ok(!el.innerHTML.includes('<img src=x'));assert.ok(el.innerHTML.includes('café coado'));assert.ok(el.innerHTML.includes('Atenção fictícia'));assert.ok(el.innerHTML.includes('Não autorizado'));assert.ok(el.innerHTML.includes('Atualizar perfis'));assert.ok(el.innerHTML.includes('/meu-perfil/'));
});
test('revoked session clears private answers and late profile requests cannot restore them',async()=>{
 const {el,context}=ui('reception');
 await vm.runInContext(`(async()=>{
  view='clients';submittedProfiles=[{id:'private',submission:{answers:{name:'Private fixture'}}}];
  let resolveOld;request=()=>new Promise(resolve=>{resolveOld=resolve});
  const pending=refreshSubmittedProfiles();
  request=async()=>{throw Object.assign(Error('Acesso revogado'),{status:403})};
  try{await refresh()}catch{}
  resolveOld({profiles:[{id:'late',submission:{answers:{name:'Late private fixture'}}}]});await pending;
 })()`,context);
 assert.equal(vm.runInContext('session',context),null);assert.equal(vm.runInContext('submittedProfiles.length',context),0);assert.ok(!el.innerHTML.includes('Private fixture'));assert.ok(!el.innerHTML.includes('Late private fixture'));assert.ok(el.innerHTML.includes('Entrar com ChatGPT'));
});


test('círculo do Painel calcula progresso excluindo não aplicáveis',()=>{
 const {el,context}=ui();
 vm.runInContext(`C.tasks=['a','b','c'].map(id=>({id,area:'reception',title:id,active:true,schedule:'daily',days:[]}));taskCatalog=null;date='2026-11-17';records=[{id:'run/a/2026-11-17',kind:'run',data:{taskId:'a',area:'reception',status:'done'}},{id:'run/c/2026-11-17',kind:'run',data:{taskId:'c',area:'reception',status:'na'}}];view='panel';tab='today';area='reception';render()`,context);
 assert.match(el.innerHTML,/aria-label="50% das rotinas aplicáveis concluídas"/);assert.match(el.innerHTML,/1 de 2 rotinas aplicáveis/);
 vm.runInContext(`C.tasks=[];render()`,context);assert.match(el.innerHTML,/aria-label="0% das rotinas aplicáveis concluídas"/);
});

test('limpeza da vitrine fica na Limpeza e conferência fica no Estoque',()=>{
 const catalog=JSON.parse(read('src/catalog.json'));
 assert.equal(catalog.tasks.find(t=>t.id==='reception-008').area,'cleaning');
 assert.equal(catalog.tasks.find(t=>t.title==='Conferência de vitrine').area,'controls');
});

test('primeira presença permite repetir a gravação sem reenviar a revisão antiga do horário',async()=>{
 const {context}=ui();context.crypto={randomUUID:()=> 'presence-retry'};
 vm.runInContext(`modal=(...args)=>{globalThis.savePresence=args.at(-1)};date=businessDate();presenceState.shifts.find(r=>r.data.staffId==='deia').data.date=date;globalThis.calls=[];globalThis.presenceAttempts=0;request=async(path,body)=>{calls.push(path);if(path==='/api/schedules')return {record:{id:body.id,revision:2,data:{staffId:'deia',date,start:body.start,status:'pending',enabled:true}}};if(++presenceAttempts===1)throw Error('Falha temporária');return {record:{}}};`,context);
 await vm.runInContext("presencePerson('deia')",context);
 await assert.rejects(vm.runInContext("savePresence({start:'10:00',status:'present'})",context),/Falha temporária/);
 await vm.runInContext("savePresence({start:'10:00',status:'present'})",context);
 assert.deepEqual(Array.from(vm.runInContext('calls',context)),['/api/schedules','/api/presence','/api/presence']);
});
