import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const read=p=>fs.readFileSync(p,'utf8'),strip=s=>s.replace(/^import .*?;\n/gm,'').replace(/export /g,'');
function ui(role='admin'){
 const el={innerHTML:'',open:false,addEventListener(){},querySelector(){return {}},showModal(){this.open=true},close(){this.open=false}};
 const context=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:'',origin:'https://elab.dazzlingbegonia2.chatgpt.site'},window:{addEventListener(){},scrollTo(){}},Date,Intl,URL,structuredClone,setTimeout,clearTimeout,console,fetch(){},crypto});
 vm.runInContext(strip(read('src/core.js'))+'\n'+strip(read('src/performance-report.js'))+'\n'+strip(read('src/stock-coverage.js'))+'\n'+strip(read('src/profile-invitation.js'))+'\n'+read('src/client.js').replace('// __FEATURE_CLIENT__',read('src/feature-client.js')+'\n'+read('src/avec-client.js')).split("try{C=await request('/catalog.json')")[0],context);
 vm.runInContext(`C=${read('src/catalog.json')};session={id:'owner',name:'Owner',role:'${role}'};date='2026-11-17';presenceState={staff:[],shifts:[]};view='panel';render()`,context);return {el,context};
}
test('painel abre Todos incluindo Comercial, sem indicadores de performance ou treinamento',()=>{const {el}=ui();assert.match(el.innerHTML,/value="all" selected/);assert.match(el.innerHTML,/value="commercial"/);assert.ok(!el.innerHTML.includes('Indicadores do salão'));assert.ok(!el.innerHTML.includes('data-id="training"'));assert.match(el.innerHTML,/Indicadores/);assert.match(el.innerHTML,/Disponibilidade x Presentes/)});
test('quadro é interno e assistente tem texto objetivo inclusive no período de teste',()=>{const {el,context}=ui();vm.runInContext("session.testAccess=true;assistantState.board={connected:true,items:[{id:'1',title:'Rotina do time',owner:'',due:'',priority:'Urgente',status:'A fazer',url:'https://brgxbrasil.monday.com/boards/18416621523'}]};render()",context);assert.match(el.innerHTML,/Rotina do time/);assert.ok(!el.innerHTML.includes('Abrir quadro'));assert.match(el.innerHTML,/panelAssistantForm/);assert.ok(!el.innerHTML.includes('Entrar para usar a assistente'))});
test('perfil oferece link e convite copiáveis',()=>{const {el,context}=ui();vm.runInContext("view='clients';render()",context);assert.match(el.innerHTML,/Copiar link/);assert.match(el.innerHTML,/Copiar convite/);assert.match(el.innerHTML,/antes da sua visita/)});
test('cada setor operacional permite registrar ocorrências e executar rotinas sem configurar catálogo',()=>{for(const role of ['reception','controls','cleaning','commercial']){const {el}=ui(role);assert.match(el.innerHTML,/Novo registro/);assert.ok(!el.innerHTML.includes('＋ Configurar rotina'));assert.ok(!el.innerHTML.includes('data-action="member"'))}});

test('gestão salva a política global sem exigir consumo manual de um produto',async()=>{
 const {context}=ui();vm.runInContext(`globalThis.policyCalls=[];modal=(...args)=>{globalThis.policySave=args.at(-1)};request=async(path,body)=>{policyCalls.push({path,body});return {}};refreshFeatures=async()=>{};stockCoveragePolicyModal('global')`,context);
 await vm.runInContext("policySave({leadDays:'10',postArrivalDays:'7',consumptionMode:'mean',reason:''})",context);
 const data=vm.runInContext('policyCalls[0]',context);assert.equal(data.path,'/api/stock-policy');assert.equal(data.body.inputs.postArrivalDays,15);assert.equal(data.body.inputs.dailyUse,undefined);
});

test('painel Estoque não apresenta sugestões de relacionamento do Comercial',()=>{
 const {el,context}=ui('controls');assert.ok(!el.innerHTML.includes('Pós-atendimento e avaliação no Google'));vm.runInContext("session.role='admin';area='cleaning';render()",context);assert.ok(!el.innerHTML.includes('Pós-atendimento e avaliação no Google'));
});

test('Central AVEC carrega tipos e histórico sem exigir iniciar uma importação',async()=>{
 const {el,context}=ui();vm.runInContext(`view='imports';request=async(path)=>path==='/api/imports'?{schemas:{'0031':{label:'Serviços importados'}},batches:[{id:'batch-1',data:{source:'0031',inserted:2}}],files:[]}:path.startsWith('/api/presence')?{staff:[],shifts:[],events:[]}:{}`,context);
 await vm.runInContext('refreshFeatures()',context);vm.runInContext('render()',context);assert.match(el.innerHTML,/Serviços importados/);assert.match(el.innerHTML,/2 novos/);
});

test('integration diagnostic arriving after an account change is discarded',async()=>{
 const {context}=ui();vm.runInContext("request=()=>new Promise(resolve=>{globalThis.resolveIntegration=resolve})",context);
 const pending=vm.runInContext('loadIntegrationStatus()',context);
 vm.runInContext("session.id='other';assistantIdentity='user:other';resetPanelAssistant();resolveIntegration({items:[{id:'drive',name:'Previous account'}]})",context);
 await pending;assert.equal(vm.runInContext('integrationState',context),null);
});
