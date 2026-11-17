import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {performanceOverview} from '../src/performance-report.js';

const row=(id,date,client,command,amountCents=1000,quantity=1,professional='Ana',category='Cabelo',service='Corte')=>({id,kind:'avec_service',data:{source:'0031',unit:'E.Lab',normalized:{date,client,command,amountCents,quantity,professional,category,service}}});
const fixture=[row('old','2026-09-01','Bia','0'),row('a','2026-10-01','Bia','1',1200,2),row('b','2026-10-01','Bia','1',800,1,'Ana','Unhas','Manicure'),row('c','2026-10-02','Clara','2',2000),row('d','2026-11-02','Clara','3',3000,1,'Lu'),row('e','2026-11-03','','4',500)];

test('soma quantidades e valores sem duplicar comanda por linha de serviço',()=>{
 const report=performanceOverview(fixture,'2026-10-01','2026-11-30');
 assert.equal(report.services,6);assert.equal(report.amountCents,7500);assert.equal(report.visits,4);assert.equal(report.ticketCents,1875);assert.equal(report.clients,2);assert.equal(report.unidentifiedRows,1);
 assert.equal(report.professionals.find(p=>p.name==='Ana').visits,3);
 assert.deepEqual(report.professionals.find(p=>p.name==='Ana').months.map(m=>m.services),[4,1]);
});
test('primeira visita observada e retorno usam histórico até o fim, sem confundir aquisição comprovada',()=>{
 const report=performanceOverview(fixture,'2026-10-01','2026-11-30');
 assert.equal(report.firstObserved,1);assert.equal(report.returning,2);assert.equal(report.singleVisitClients,1);assert.equal(report.recurringClients,1);
 const ana=report.professionals.find(p=>p.name==='Ana');assert.equal(ana.firstObserved,1);assert.equal(ana.returning,1);
 const filtered=performanceOverview(fixture,'2026-10-01','2026-11-30','Lu');assert.equal(filtered.amountCents,3000);assert.equal(filtered.clients,1);assert.equal(filtered.firstObserved,1);assert.equal(filtered.months[0].services,0);
});
test('categorias, serviços e meses reconciliam valores e quantidades com o total',()=>{
 const report=performanceOverview(fixture,'2026-10-01','2026-11-30');
 for(const groups of [report.months,report.categories,report.serviceMix]){assert.equal(groups.reduce((n,g)=>n+g.amountCents,0),report.amountCents);assert.equal(groups.reduce((n,g)=>n+g.services,0),report.services);}
 assert.deepEqual(report.months.map(m=>[m.month,m.amountCents,m.services]),[['2026-10',4000,4],['2026-11',3500,2]]);
 assert.equal(report.categories.find(c=>c.name==='Unhas').amountCents,800);
});
test('descarta datas, quantidades, valores e origens inválidas antes de agregar',()=>{
 const bad=[{...row('cash','2026-10-01','Bia','5'),kind:'avec_cash'},row('bad-date','2026-02-30','Bia','5'),row('bad-money','2026-10-01','Bia','5',1.5),row('bad-qtd','2026-10-01','Bia','5',100,-1),{...row('wrong-source','2026-10-01','Bia','5'),data:{...row('x','2026-10-01','Bia','5').data,source:'0387'}},{kind:'avec_service',data:{}}];
 const report=performanceOverview([...fixture,...bad],'2026-10-01','2026-11-30');assert.equal(report.amountCents,7500);assert.equal(report.excludedRows,6);
 const malformed=performanceOverview([{kind:'avec_service'},null,{...fixture[1],data:{...fixture[1].data,normalized:{...fixture[1].data.normalized,client:12}}}],'2026-10-01','2026-11-30');assert.equal(malformed.excludedRows,3);
});
test('sem dados mantém meses zerados, ticket indisponível e nenhum potencial inventado',()=>{
 const report=performanceOverview([],'2026-10-01','2026-11-30');assert.equal(report.clients,0);assert.equal(report.ticketCents,null);assert.deepEqual(report.professionals,[]);assert.equal(report.months.length,2);assert.equal(report.atRiskClients,0);assert.equal(report.singleServiceVisits,0);
});
test('profissional ausente continua rastreável e sua carteira entra na análise',()=>{
 const report=performanceOverview([row('missing','2026-10-01','Bia','1',1000,1,'')],'2026-10-01','2026-10-31');
 assert.equal(report.professionals[0].name,'Não informado na origem');assert.equal(report.professionals[0].clients,1);assert.equal(report.professionals[0].firstObserved,1);assert.equal(report.professionals[0].months[0].services,1);
});
test('recência considera última visita ao salão até data final, sem incorporar visitas futuras',()=>{
 const report=performanceOverview([...fixture,row('future','2027-01-02','Bia','10')],'2026-10-01','2026-12-15','Ana');
 assert.equal(report.atRiskClients,1);assert.equal(report.portfolio.find(c=>c.name==='Bia').last,'2026-10-01');assert.equal(report.months[2].services,0);
 assert.equal(performanceOverview(fixture,'2026-11-30','2026-10-01').services,0);
});
test('Resultados reproduz seções do relatório sem copiar diagnósticos do Barú',()=>{
 const read=p=>fs.readFileSync(p,'utf8');const el={innerHTML:'',open:false,addEventListener(){},querySelector(){return {}},showModal(){},close(){}};
 const context=vm.createContext({document:{querySelector:()=>el,addEventListener(){}},location:{hash:''},window:{addEventListener(){},scrollTo(){}},Date,Intl,structuredClone,setTimeout,clearTimeout,console,fetch(){}});
 const module=read('src/performance-report.js').replace(/^import .*?;\n/gm,'').replace(/export /g,'');
 const code=read('src/core.js').replace(/export /g,'')+'\n'+fs.readFileSync('src/performance-report.js','utf8').replace(/^import .*?;\n/gm,'').replace(/export /g,'')+'\n'+module+'\n'+read('src/client.js').replace('// __FEATURE_CLIENT__',read('src/feature-client.js')+'\n'+read('src/avec-client.js')).split("try{C=await request('/catalog.json')")[0];
 vm.runInContext(code,context);context.fixture=fixture;vm.runInContext(`C=${read('src/catalog.json')};session={role:'admin',name:'Owner'};presenceState={staff:[],shifts:[]};resultState.services=fixture;resultFrom='2026-10-01';resultTo='2026-11-30';view='results';render()`,context);
 for(const label of ['Visão executiva','Performance por profissional','Evolução mensal','Serviços e carteira','Oportunidades observadas','Carteira do salão','Rotatividade','AVEC 0031'])assert.ok(el.innerHTML.includes(label),label);
 for(const heading of ['01 · Visão executiva','02 · Performance por profissional','03 · Evolução mensal','04 · Serviços e carteira','05 · Oportunidades observadas','06 · Direcionamento','Serviços por profissional e mês'])assert.equal(el.innerHTML.split(`<h2>${heading}</h2>`).length-1,1,heading+' deve aparecer uma vez');
 let sectionDepth=0;
 for(const tag of el.innerHTML.match(/<\/?section\b[^>]*>/g)||[]){sectionDepth+=tag.startsWith('</')?-1:1;assert.ok(sectionDepth>=0&&sectionDepth<=1,'cards de relatório não devem ficar aninhados ou fechar sem abertura');}
 assert.equal(sectionDepth,0,'todos os cards devem fechar');
 assert.ok(!el.innerHTML.includes('Barú'));assert.ok(!el.innerHTML.includes('ClassPass'));
});
