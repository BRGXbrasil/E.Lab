let avecSummary={},resultLoadedStamp=null,stockLoadedStamp=null,avecResultTab='services',avecPage=0,stockPage=0,financialBasis='competenceDate',stockLoadState='idle',stockLoadError='',stockLoadFlight=null,stockListFilter='all';
function panel(){return operationsPanel()}
function avecOverview(){
 const data=avecSummary;
 if(!data.services?.rows&&!data.stock?.rows)return '';
 const periods=[
  [data.services,'Itens de serviços',data.services?.quantity],
  [data.stock,'Movimentos de estoque',data.stock?.rows],
 ];
 return `<section class="card" style="margin-top:24px"><div class="card-head"><h2>AVEC · Dados consolidados</h2></div>
  <div class="metric-grid">${periods.filter(([report])=>report?.rows).map(([report,label,count])=>`<div><div class="label">${label}</div><div class="stat-number">${count}</div><p class="help">${report.from&&report.to?fmtDate(report.from)+' a '+fmtDate(report.to):'Período não informado'}</p></div>`).join('')}</div>
  <div class="actions">${data.services&&(management()||session.role==='reception')?btn('navigate','Ver resultados','results','primary'):''}${canStock()?btn('navigate','Ver estoque','inventory'):''}${canImport()?btn('navigate','Central AVEC','imports'):''}</div>
 </section>`;
}
function resultDate(r){const d=r.data.normalized;return r.kind==='avec_cash'?(d[financialBasis]||d.date):d.date}
let resultProfessional='';
function performanceCards(report) {
 const metrics=[
  ['Clientes atendidas',report.clients],
  ['Serviços realizados',report.services],
  ['Ticket médio por comanda',report.ticketCents===null?'—':money(report.ticketCents)],
  ['Retorno observado',report.clients?Math.round(report.returning/report.clients*100)+'%':'—'],
  ['Atração · primeiras visitas observadas',report.firstObserved],
  ['Comandas',report.visits],
 ];
 return `<div class="metric-grid">${metrics.map(([name,value])=>`<section class="card"><div class="label">${name}</div><h2>${value}</h2></section>`).join('')}</div>`;
}
function teamAvailability() {
 const ids=new Set(presenceState.staff.filter(isOperationalStaff).map(p=>p.id));
 const present=presenceState.shifts.filter(r=>ids.has(r.data.staffId)&&r.data.status==='present').length;
 const occupied=new Set(byKind('queue').flatMap(r=>(r.data.people||[]).filter(p=>p.operational!==false&&isOperationalName(p.name)&&effectiveStatus(p)==='occupied').map(p=>p.name)));
 return `<section class="card"><h2>Disponibilidade</h2><p>${present} presentes · ${occupied.size} em atendimento</p></section>`;
}
function resultsPage() {
 const from=resultFrom||avecSummary.services?.from||businessDate();
 const to=resultTo||avecSummary.services?.to||businessDate();
 const serviceRecords=resultState.services.filter(r=>isOperationalName(r.data.normalized.professional));
 const names=[...new Set(serviceRecords.map(r=>r.data.normalized.professional).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
 const controls=`<div class="filters">${field('resultFrom','De',from,'date')}${field('resultTo','Até',to,'date')}${select('resultProfessional','Profissional',[['','Todos'],...names.map(n=>[n,n])],resultProfessional)}</div>`;
 if(from>to)return summary('Resultados','')+controls+empty('Revise o período.');
 const report=performanceReport(serviceRecords,from,to,resultProfessional);
 const months=[];
 for(let cursor=new Date(from.slice(0,7)+'-01T12:00:00Z');cursor<=new Date(to+'T12:00:00Z');cursor.setUTCMonth(cursor.getUTCMonth()+1)){
   months.push(cursor.toISOString().slice(0,7));
 }
 const comparison=new Map();
 for(const r of serviceRecords){
   const d=r.data.normalized;
   if(!d.professional||d.date<from||d.date>to||(resultProfessional&&d.professional!==resultProfessional))continue;
   const counts=comparison.get(d.professional)||new Map();
   const month=d.date.slice(0,7);
   counts.set(month,(counts.get(month)||0)+(Number(d.quantity)||0));
   comparison.set(d.professional,counts);
 }
 const professionals=names.filter(n=>comparison.has(n)).map(name=>{
   const counts=comparison.get(name);
   return {name,counts,total:[...counts.values()].reduce((sum,n)=>sum+n,0)};
 });
 const monthLabel=month=>month.slice(5)+'/'+month.slice(0,4);
 const query=search.trim().toLocaleLowerCase('pt-BR');
 const portfolio=performanceReport(resultState.services,from,to).portfolio
   .filter(c=>!query||[c.name,c.classification].join(' ').toLocaleLowerCase('pt-BR').includes(query))
   .sort((a,b)=>b.last.localeCompare(a.last));
 const pages=Math.max(1,Math.ceil(portfolio.length/50));avecPage=Math.min(avecPage,pages-1);
 return summary('Resultados','')+controls+performanceCards(report)+
  `<p class="help">Fonte: AVEC 0031</p>
  <section class="card"><h2>Serviços por profissional e mês</h2>
   ${comparison.size?`<div class="table-wrap wide-results"><table class="audit-table"><thead><tr><th scope="col">Profissional</th>${months.map(m=>`<th scope="col">${e(monthLabel(m))}</th>`).join('')}<th scope="col">Total</th></tr></thead><tbody>
   ${professionals.map(({name,counts,total})=>`<tr><th scope="row">${e(name)}</th>${months.map(m=>`<td>${counts.get(m)||0}</td>`).join('')}<td>${total}</td></tr>`).join('')}
   </tbody></table></div><div class="compact-results">
   ${professionals.map(({name,counts,total})=>`<details data-detail-key="result:${e(name)}">
     <summary><strong>${e(name)}</strong><span>${total} serviços</span></summary>
     <dl class="fact-grid">${months.map(m=>`<div><dt>${e(monthLabel(m))}</dt><dd>${counts.get(m)||0}</dd></div>`).join('')}</dl>
   </details>`).join('')}</div>`:empty('Sem serviços no período.')}</section>
  <div class="divider"></div>${teamAvailability()}
  <section class="card" style="margin-top:24px"><h2>Carteira do salão</h2>
   <input class="field search" id="search" aria-label="Buscar na carteira" placeholder="Nome ou classificação" value="${e(search)}">
   ${portfolio.slice(avecPage*50,avecPage*50+50).map(c=>`<div class="row"><div class="row-body"><strong>${e(c.name)}</strong><p>Última visita ${fmtDate(c.last)}</p></div>${pill('done',c.classification)}</div>`).join('')||empty('Nenhuma cliente encontrada.')}
   <div class="actions">${avecPage?btn('avec-page','Anterior',String(avecPage-1)):''}<span class="help">Página ${avecPage+1} de ${pages}</span>${avecPage+1<pages?btn('avec-page','Próxima',String(avecPage+1)):''}</div>
  </section>`;
}
async function loadStock(stamp,force=false){
 if(stockLoadFlight){await stockLoadFlight;if(stockLoadedStamp===stamp)return;return loadStock(stamp,force)}
 if(!force&&stockLoadedStamp===stamp)return;
 stockLoadState='loading';stockLoadError='';if(['inventory','replenishment'].includes(view)&&!dialog.open)render();
 const flight=(async()=>{try{const next=await request('/api/replenishment');stockState=next;stockLoadedStamp=stamp;stockLoadState='ready'}catch(err){stockLoadState='error';stockLoadError=err.message;throw err}finally{stockLoadFlight=null;if(['inventory','replenishment'].includes(view)&&!dialog.open)render()}})();stockLoadFlight=flight;return flight;
}
function importedStockCatalog(){if(stockState.currentCatalog?.length)return stockState.currentCatalog.slice().sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));const rows=new Map();for(const p of stockState.activity||[]){const key=p.key||[(p.unit||'E.Lab'),p.productId].join('/');rows.set(key,{...p,key,activity:p})}for(const p of stockState.products||[]){const key=p.key||[p.unit||'E.Lab',p.productId].join('/');rows.set(key,{...rows.get(key),...p,key})}return [...rows.values()].sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))}
let orderFilter='all',orderBrand='',orderPage=0,stockTargetDate='';
const orderStatusLabels={buy:'Comprar agora',attention:'Atenção',ok:'OK'};
const orderNumber=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3});
const orderValue=value=>value===null||value===undefined?'—':orderNumber.format(value);

function orderTarget(report) {
 const arrival=addDays(report.date,report.leadDays);
 return stockTargetDate>arrival?stockTargetDate:arrival;
}
function stockOrderRows(report) {
 const days=(Date.parse(orderTarget(report))-Date.parse(report.date))/86400000;
 const period=(Date.parse(report.movementTo)-Date.parse(report.movementFrom))/86400000+1;
 const query=search.trim().toLocaleLowerCase('pt-BR');
 const rank={buy:0,attention:1,ok:2};
 return report.rows.map(row=>{
   const daily=Number.isFinite(row.outflow)&&row.outflow>=0?row.outflow/period:null;
   const required=daily===null?null:daily*days;
   const shortage=required===null||row.balance===null?null:Math.max(0,required-row.balance);
   const below=Number.isFinite(row.balance)&&Number.isFinite(row.minimum)&&row.balance<row.minimum;
   const status=row.status==='repor'?'buy':row.status==='conferir'||below||shortage>0?'attention':'ok';
   return {...row,daily,required,shortage,status};
 }).filter(row=>(orderFilter==='all'||row.status===orderFilter)&&
   (!orderBrand||row.brand.toLocaleUpperCase('pt-BR')===orderBrand)&&
   (!query||(row.name+' '+row.brand).toLocaleLowerCase('pt-BR').includes(query)))
   .sort((a,b)=>rank[a.status]-rank[b.status]||b.shortage-a.shortage||a.name.localeCompare(b.name,'pt-BR'));
}
function stockOrderPage() {
 const report=stockState.orderReport;
 const heading=summary('Estoque','',report?btn('stock-order-export','Baixar CSV','','small'):'');
 const error=stockLoadState==='error'?`<p role="alert">Não foi possível atualizar o estoque. ${e(stockLoadError)} ${btn('stock-refresh','Tentar novamente','','small')}</p>`:'';
 if(!report)return heading+error+empty(stockLoadState==='ready'?'Sem posição de estoque.':stockLoadState==='error'?'Atualização indisponível.':'Carregando estoque…');
 const brands=[...new Set(report.rows.map(row=>row.brand.toLocaleUpperCase('pt-BR')).filter(Boolean))].sort();
 const count=report.rows.filter(row=>row.status==='repor').length;
 const rows=stockOrderRows(report);
 const pages=Math.max(1,Math.ceil(rows.length/50));
 orderPage=Math.min(orderPage,pages-1);
 const pageRows=rows.slice(orderPage*50,orderPage*50+50);
 const audienceStatus=row=>pill(({buy:'blocked',attention:'partial',ok:'done'})[row.status],orderStatusLabels[row.status]);
 return heading+error+`<div class="card"><div class="card-head"><h2>Reposição</h2><span class="pill" data-stock-metric="replenishment">${count} produtos para comprar</span></div>
  <p class="help">Saldo em ${fmtDate(report.date)} · Saídas de ${fmtDate(report.movementFrom)} a ${fmtDate(report.movementTo)} · Quantidades em embalagens equivalentes</p>
  <div class="filters">
   ${field('stockTargetDate','Cobertura até',orderTarget(report),'date',true,`min="${addDays(report.date,report.leadDays)}"`)}
   ${select('stockOrderStatus','Situação',[['all','Todas'],...Object.entries(orderStatusLabels)],orderFilter)}
   ${select('stockOrderBrand','Marca',[['','Todas'],...brands.map(brand=>[brand,brand])],orderBrand)}
   <input id="search" class="field" type="search" aria-label="Buscar produto" placeholder="Buscar produto" value="${e(search)}">
  </div>
  <p class="help" role="status">${rows.length} produtos</p>
  <div class="table-wrap wide-stock"><table class="audit-table"><thead><tr>
   <th scope="col">Produto</th><th scope="col">Saídas no período</th><th scope="col">Saldo atual</th>
   <th scope="col">Mínimo</th><th scope="col">Prazo (dias)</th><th scope="col">Saída por dia</th>
   <th scope="col">Necessário até ${fmtDate(orderTarget(report))}</th><th scope="col">Situação</th>
  </tr></thead><tbody>
   ${pageRows.map(row=>`<tr><td><strong>${e(row.name)}</strong><p class="help">${e(row.brand)}</p></td>
     <td>${orderValue(row.outflow)}</td><td>${orderValue(row.balance)}</td><td>${orderValue(row.minimum)}</td>
     <td>${report.leadDays}</td><td>${orderValue(row.daily)}</td><td>${orderValue(row.required)}${row.shortage>0?`<p class="help">Faltam ${orderValue(row.shortage)}</p>`:''}</td>
     <td>${audienceStatus(row)}
     ${row.status==='buy'?`<p>${orderValue(row.orderUnits)} a pedir</p>`:row.review?'<p class="help">Dados a conferir</p>':''}</td></tr>`).join('')}
  </tbody></table></div>
  <div class="compact-stock">${pageRows.map(row=>`<article class="stock-item">
    <div class="stock-item-title"><div><h3>${e(row.name)}</h3>${row.brand?`<p class="help">${e(row.brand)}</p>`:''}</div>${audienceStatus(row)}</div>
    <dl class="fact-grid">${[
      ['Saídas no período',row.outflow],['Saldo atual',row.balance],['Mínimo',row.minimum],['Prazo (dias)',report.leadDays],
      ['Saída por dia',row.daily],['Até '+fmtDate(orderTarget(report)),row.required]
    ].map(([label,value])=>`<div><dt>${e(label)}</dt><dd>${orderValue(value)}</dd></div>`).join('')}</dl>
    ${row.status==='buy'?`<strong>${orderValue(row.orderUnits)} a pedir</strong>`:row.review?'<span class="help">Dados a conferir</span>':''}
    ${row.shortage>0?`<p class="help">Faltam ${orderValue(row.shortage)}</p>`:''}
   </article>`).join('')}</div>${rows.length?'':empty('Nenhum produto encontrado.')}
  <div class="actions">${orderPage?btn('stock-order-page','Anterior',String(orderPage-1),'small'):''}<span class="help">Página ${orderPage+1} de ${pages}</span>${orderPage+1<pages?btn('stock-order-page','Próxima',String(orderPage+1),'small'):''}</div></div>`;
}
app.addEventListener('change',event=>{
 if(event.target.name==='stockOrderStatus')orderFilter=event.target.value;
 else if(event.target.name==='stockOrderBrand')orderBrand=event.target.value;
 else if(event.target.name==='stockTargetDate'&&event.target.validity.valid)stockTargetDate=event.target.value;
 else return;
 orderPage=0;
 render();
});

function inventoryPage(){
 if(!stockState.orderReport && (importedStockCatalog().length||byKind('inventory').length))return legacyStockPage();
 return stockOrderPage();
}
function legacyStockPage(){
 const all=importedStockCatalog(),source=avecSummary.stock||{},local=byKind('inventory'),snapshots=all.filter(p=>p.snapshot),latest=[source.to,...all.map(p=>p.snapshot?.date||p.to)].filter(Boolean).sort().at(-1),loading=stockLoadState==='loading'||(!all.length&&stockLoadedStamp===null&&stockLoadState==='idle');
 const known=all.filter(p=>p.snapshot&&p.balanceVerified!==false&&Number.isFinite(p.inputs?.minimum??(p.minimumKnown?p.snapshot.minimum:undefined))),unknown=all.length-known.length,critical=known.filter(p=>!p.singleUnusedReserve&&p.replenishmentEnabled!==false&&p.onHand<=(p.inputs?.minimum??p.snapshot.minimum)).length+local.filter(r=>r.data.quantity<=r.data.minimum).length;
 const expiryRefs=[];for(const p of all)for(const date of new Set(p.expiryReferences||[]))expiryRefs.push({date,product:p.key});for(const r of local)if(r.data.expiry)expiryRefs.push({date:r.data.expiry,product:r.id});const reviewed=all.length>0&&all.every(p=>p.validityStatus==='ok'),positionsKnown=all.length>0&&all.every(p=>p.balanceKnown||p.snapshot&&p.balanceVerified!==false);const due=expiryRefs.filter(r=>r.date<=addDays(businessDate(),30)),products=(all.length||source.products||0)+local.length,trace=stockState.traceCount??stockState.movementCount??source.rows??0;
 return summary('Estoque','',btn('stock-refresh',stockLoadState==='loading'?'Atualizando…':'Atualizar estoque','','primary')+btn('inventory','＋ Produto local'))+`<div class="metric-grid"><section class="card" data-stock-metric="products"><div class="label">Produtos</div><div class="stat-number">${products|| (loading?'…':0)}</div><p class="help">${all.length||source.products||0} no catálogo AVEC · ${local.length} cadastrados manualmente</p></section><section class="card" data-stock-metric="${stockState.orderReport?'minimum':'replenishment'}"><div class="label">${stockState.orderReport?'Saldo no mínimo ou abaixo':'Reposição'}</div><div class="stat-number">${critical|| (unknown?'A conferir':loading?'…':0)}</div><p class="help">${unknown?unknown+(positionsKnown?' aguardam mínimo':' aguardam saldo ou mínimo'):critical?known.filter(p=>!p.singleUnusedReserve&&p.replenishmentEnabled!==false&&p.onHand<(p.inputs?.minimum??p.snapshot.minimum)).length+' abaixo · '+known.filter(p=>!p.singleUnusedReserve&&p.replenishmentEnabled!==false&&p.onHand===(p.inputs?.minimum??p.snapshot.minimum)).length+' no mínimo':'itens com saldo e mínimo conferidos'}</p>${critical?btn('stock-filter','Listar itens','alerts','small'):''}</section><section class="card" data-stock-metric="expiry"><div class="label">Validade</div><div class="stat-number">${reviewed?'OK':expiryRefs.length?due.length:loading?'…':'A informar'}</div><p class="help">${reviewed?all.length+' produtos conferidos · '+e(safeTime(stockState.settings?.validity?.reviewedAt)) :expiryRefs.length?'referências de validade vencidas ou em até 30 dias nos arquivos':'datas de validade ainda não informadas'}</p></section><section class="card" data-stock-metric="trace"><div class="label">Rastreabilidade</div><div class="stat-number">${trace|| (loading?'…':0)}</div><p class="help">${stockState.currentState?'movimentos, posições e cadastros com origem':'movimentos importados com arquivo, linha e autoria'}</p></section></div><div class="notice">${stockState.currentState?'Posição recebida em '+fmtDate(stockState.currentState.receivedAt)+'. Data de emissão não informada no arquivo. ':latest?'Dados de estoque até '+fmtDate(latest)+'. ':''}${stockState.currentState?'Os relatórios atuais são a referência de saldo e mínimo, sem somar novamente os movimentos históricos. ':stockState.settings?.positionBasis==='movements'?'Posição atual calculada pelas entradas, saídas e ajustes de cada produto, por medida. ':snapshots.length?snapshots.length+' posições de saldo importadas. ':'O arquivo contém movimentos; saldo disponível e reposição precisam de posição inicial ou contagem e mínimo. '}${reviewed?'Validade atual conferida e registrada como OK; datas históricas permanecem disponíveis para consulta.':expiryRefs.length?'As datas de validade são referências históricas do arquivo; confirme quais lotes permanecem disponíveis.':''}</div>${stockLoadState==='error'?`<div class="notice error" role="alert">Não foi possível atualizar o estoque: ${e(stockLoadError)}. Os dados anteriores foram preservados. Use Atualizar estoque para tentar novamente.</div>`:''}${loading?'<div class="notice" role="status">Carregando produtos…</div>':''}${stockState.currentState&&management()?`<div class="notice">Valor de custo do estoque: <strong>${money(stockState.currentState.summary.costTotalCents)}</strong> · valor de venda cadastrado: ${money(stockState.currentState.summary.saleTotalCents)}.</div>`:''}${stockActivitySection()}${stockHistorySection()}<details class="card" style="margin-top:24px"><summary>Cadastros e saldos locais (${local.length})</summary><p class="help">Contagens e produtos registrados diretamente neste painel.</p>${localInventoryPage(true)}</details>`;
}

function stockActivitySection(){const all=importedStockCatalog(),q=search.toLowerCase(),filtered=all.filter(p=>stockListFilter==='all'||stockListFilter==='alerts'&&p.needsReplenishment||stockListFilter==='below'&&p.needsReplenishment&&p.onHand<(p.inputs?.minimum??p.minimum)||stockListFilter==='at'&&p.needsReplenishment&&p.onHand===(p.inputs?.minimum??p.minimum)).filter(p=>!q||[p.name,p.brand,p.category,p.line,p.barcode].filter(Boolean).join(' ').toLowerCase().includes(q)),max=Math.max(0,Math.ceil(filtered.length/50)-1);stockPage=Math.min(stockPage,max);const pending=stockLoadState==='loading'||(stockLoadState==='idle'&&stockLoadedStamp===null);return `<section class="card" id="stockImportedList" style="margin-top:24px"><div class="card-head"><div><h2>Produtos</h2><p>${stockState.movementCount||0} linhas de movimentos · ${all.length} produtos carregados</p></div></div><div class="notice">${stockState.currentState?'Posições e mínimos informados nos relatórios atuais. O histórico anterior já está contemplado e não é somado outra vez.':stockState.settings?.positionBasis==='movements'?'Posição atual = entradas − saídas + ajustes, mantendo cada medida separada. Reposição depende dos mínimos e prazos cadastrados.':'Entradas, saídas e ajustes preservam a medida original. A variação abaixo não é o saldo disponível. Quando houver relatório de saldo, a posição e sua data aparecem no produto; reposição depende também do mínimo e dos prazos.'}</div><div class="actions">${[['all','Todos'],['alerts','No mínimo ou abaixo'],['below','Abaixo'],['at','Exatamente no mínimo']].map(([id,l])=>btn('stock-filter',l,id,stockListFilter===id?'primary small':'small')).join('')}${btn('stock-alert-export','Exportar lista de alertas','','small')}</div><input id="search" class="field" placeholder="Buscar produto" value="${e(search)}">${filtered.slice(stockPage*50,stockPage*50+50).map(p=>`<div class="row"><div class="row-body"><strong>${e(p.name)}</strong><p>${e(p.unit||'E.Lab')}${p.rows?' · '+p.rows+' registros · '+fmtDate(p.from)+' a '+fmtDate(p.to):''}</p>${p.balanceKnown&&!p.snapshot?`<p><strong>Posição atual: ${p.positions.map(v=>v.quantity+' '+e(v.unit)).join(' · ')}</strong></p>`:''}${p.validityStatus==='ok'?`<p>${pill('done','Validade OK')} · conferida ${e(safeTime(p.validityReviewedAt))}</p>`:''}${p.catalogueSource==='current-reports'?`<p><strong>Posição atual: ${e(p.quantityText)}</strong></p><p>Saldo absoluto ${p.absoluteQuantity} unidades · mínimo ${p.minimum} ${e(p.minimumUnit)}</p><p>${e([p.brand,p.line,p.category].filter(Boolean).join(' · '))}${p.barcode?' · código '+e(p.barcode):''}</p><p>Medida/capacidade informada: ${p.capacity} · recebido ${fmtDate(p.receivedAt)}</p>${p.singleUnusedReserve?'<p>Uma unidade sem saídas no histórico disponível: reserva suficiente, sem reposição.</p>':''}${p.historyVariantAmbiguity?'<p>O histórico por nome não distingue as duas linhas deste produto.</p>':''}`:p.snapshot?`<p><strong>Saldo do arquivo ${p.snapshot.quantity} ${e(p.snapshot.unit)}</strong> · ${fmtDate(p.snapshot.date)}</p>${p.balanceVerified===false?'<p>Saldo e movimentos precisam de conciliação para determinar a disponibilidade.</p>':`<p>Saldo calculado ${p.onHand} ${e(p.snapshot.unit)}${p.activity?.to?' · movimentos até '+fmtDate(p.activity.to):''}</p>`}<p>Mínimo ${p.inputs?.minimum??(p.minimumKnown?p.snapshot.minimum:'a definir')}</p>`:''}${p.expiryReferences?.length?`<p>Datas históricas do arquivo: ${p.expiryReferences.slice(0,3).map(fmtDate).join(', ')}${p.expiryReferences.length>3?' · mais '+(p.expiryReferences.length-3):''}</p>`:''}${Object.entries(p.measures||{}).map(([unit,m])=>`<p>${e(unit)}: entradas ${m.in} · saídas ${m.out} · ajustes ${m.adjustment} · variação ${m.net}</p>`).join('')}</div>${p.catalogueSource==='current-reports'?pill(p.needsReplenishment?'partial':'done',p.needsReplenishment?'Repor':p.singleUnusedReserve?'Reserva suficiente':p.replenishmentEnabled?'Acima do mínimo':'Mínimo desativado'):p.snapshot?pill(p.balanceVerified===false?'partial':'',p.balanceVerified===false?'Conciliação pendente':'Saldo do relatório'):p.balanceKnown?pill('done','Posição calculada'):pill('pending','Saldo a conferir')}${p.positionOrigin?btn('avec-detail','Posição',p.positionOrigin,'small')+btn('avec-detail','Cadastro',p.productOrigin,'small'):''}${p.rows?btn('avec-product','Ver movimentos',JSON.stringify([p.ledgerProductId||p.productId,p.unit||'E.Lab']),'small'):''}</div>`).join('')||(pending?'':stockLoadState==='error'?empty('Os produtos serão exibidos quando a conexão for restabelecida.'):empty(q?'Nenhum produto corresponde à busca.':'Nenhum produto disponível. Confira a Central AVEC.'))}<div class="actions">${stockPage>0?btn('avec-stock-page','Anterior',String(stockPage-1)):''}<span class="help">Página ${stockPage+1} de ${max+1}</span>${stockPage<max?btn('avec-stock-page','Próxima',String(stockPage+1)):''}</div></section>`}

async function avecDetails(id){const r=await request('/api/import-row?id='+encodeURIComponent(id)),d=r.data;modal('Registro e origem',`<p class="meta">${e(d.source)} · ${e(d.unit)}${d.row?' · linha '+d.row:''}</p>${d.fileId?`<a class="btn" href="/api/import-file?id=${encodeURIComponent(d.fileId)}">Baixar original</a>`:''}<div class="divider"></div>${Object.entries(d.raw||d.normalized).map(([k,v])=>`<div class="row"><div class="row-body"><strong>${e(k)}</strong><p>${e(Array.isArray(v)?v.join(', '):v??'Não informado')}</p></div></div>`).join('')}`,'Fechar',async()=>{})}
async function avecProduct(id,unit,offset=0){const data=await request('/api/stock-ledger?productId='+encodeURIComponent(id)+'&unit='+encodeURIComponent(unit)+'&offset='+offset);modal('Movimentos do produto',`<p class="help">${data.total} registros de origem. Medidas não são convertidas entre embalagens.</p>${data.rows.map(r=>{const d=r.data.normalized;return `<div class="row"><div class="row-body"><strong>${e(d.product)}</strong><p>${fmtDate(d.date)} · ${e(d.quantityText||d.quantity+' '+d.unit)}</p><p>${e(d.reason)} · ${e(d.responsible||r.updatedBy)}</p></div>${btn('avec-detail','Origem',r.id,'small')}</div>`}).join('')}<div class="actions">${offset>0?btn('avec-ledger-prev','Anteriores',JSON.stringify([id,unit,Math.max(0,offset-50)])):''}${data.hasMore?btn('avec-ledger-next','Próximos',JSON.stringify([id,unit,offset+50])):''}</div>`,'Fechar',async()=>{})}
async function prepareNativeImport(){const d=uploadDraft;if(['stock-position','stock-products'].includes(d.source)&&[importState.activeCatalog?.data.positionFileId,importState.activeCatalog?.data.productFileId].includes(d.file.id)&&(importState.activeCatalog?.data.unit||'E.Lab')===d.unit)throw Error('Este arquivo já está ativo no estoque; selecione uma nova versão para atualizar.');const rows=await compileAvecRows(d.source,d.sheets[0].rows[0],d.sheets[0].rows.slice(1));d.native=true;const outcomes=[];for(let i=0;i<rows.length;i+=10){const r=await request('/api/import-preview',{native:true,source:d.source,unit:d.unit,fileId:d.file.id,rows:rows.slice(i,i+10)});outcomes.push(...r.outcomes)}importPreview={rows,outcomes};previewModal()}
async function avecAction(a,id){if(a==='stock-order-page'){orderPage=Number(id);render();return true}if(a==='stock-order-export'&&stockState.orderReport){
  const report=stockState.orderReport;
  downloadCSV([['Produto','Marca','Saídas','Saldo','Mínimo','Prazo em dias','Saída por dia','Necessário','Faltam','A pedir','Situação','Cobertura até','Posição','Saídas de','Saídas até'],
    ...stockOrderRows(report).map(row=>[row.name,row.brand,row.outflow,row.balance,row.minimum,report.leadDays,row.daily,row.required,row.shortage,row.orderUnits,orderStatusLabels[row.status],orderTarget(report),report.date,report.movementFrom,report.movementTo])],'elab-reposicao-'+report.date+'.csv');
  return true;
 }if(a==='result-professional'){resultProfessional=id||'';avecResultTab='services';avecPage=0;search='';render();return true}if(a==='stock-filter'){stockListFilter=id;stockPage=0;search='';render();return true}if(a==='stock-alert-export'){const items=importedStockCatalog().filter(p=>p.needsReplenishment);downloadCSV([['Produto','Marca','Linha','Posição','Saldo para comparação','Medida','Mínimo','Situação'],...items.map(p=>[p.name,p.brand,p.line,p.quantityText,p.onHand,p.minimumUnit,p.minimum,p.onHand<p.minimum?'Abaixo do mínimo':'Exatamente no mínimo'])],'estoque-alertas.csv');return true}if(a==='stock-catalog-activate'){const [positionFileId,productFileId,unit]=JSON.parse(id);await request('/api/stock-catalog-activate',{positionFileId,productFileId,unit,revision:importState.activeCatalog?.revision||0});stockLoadedStamp=null;await refresh();toast('Posição e cadastro de estoque ativados em conjunto.');return true}if(a==='stock-refresh'){await refreshFeatures(true);render();toast('Estoque atualizado com os dados importados.');return true}if(a==='avec-tab'){avecResultTab=id;avecPage=0;search='';render();return true}if(a==='avec-page'){avecPage=Number(id);render();return true}if(a==='avec-stock-page'){stockPage=Number(id);render();return true}if(a==='avec-detail'){await avecDetails(id);return true}if(a==='avec-product'){const [product,unit]=JSON.parse(id);await avecProduct(product,unit);return true}if(['avec-ledger-next','avec-ledger-prev'].includes(a)){const [product,unit,offset]=JSON.parse(id);await avecProduct(product,unit,Number(offset));return true}return false}
app.addEventListener('change',ev=>{if(ev.target.name==='resultProfessional'){resultProfessional=ev.target.value;avecPage=0;render()}if(ev.target.name==='financialBasis'){financialBasis=ev.target.value;avecPage=0;render()}});

function stockHistorySection(){const rows=stockState.historicalOnly||[];if(!rows.length)return '';return `<details class="card" style="margin-top:20px"><summary>Produtos somente no histórico (${rows.length})</summary><p class="help">Não constam nos dois relatórios atuais; seus registros anteriores continuam preservados.</p>${rows.map(p=>`<div class="row"><div class="row-body"><strong>${e(p.name)}</strong><p>${p.rows} movimentos anteriores</p></div>${btn('avec-product','Histórico',JSON.stringify([p.productId,p.unit]),'small')}</div>`).join('')}</details>`}

function stockCandidatesPanel(){const list=importState.stockCandidates||[],positions=list.filter(r=>r.data.source==='stock-position'),products=list.filter(r=>r.data.source==='stock-products');if(!positions.length&&!products.length)return '';const active=importState.activeCatalog?.data;return `<section class="card" style="margin-top:24px"><h2>Consolidação dos relatórios de estoque</h2><p class="help">A posição atual é preservada até a ativação conjunta. Selecione dois relatórios completos da mesma unidade.</p>${positions.map(p=>products.filter(m=>m.data.unit===p.data.unit).map(m=>`<div class="row"><div class="row-body"><strong>${e(p.data.unit)}</strong><p>${p.data.rows} posições · ${m.data.rows} cadastros e mínimos</p></div>${active?.positionFileId===p.data.fileId&&active?.productFileId===m.data.fileId&&(active?.unit||'E.Lab')===p.data.unit?pill('done','Ativo'):btn('stock-catalog-activate','Conferir e ativar',JSON.stringify([p.data.fileId,m.data.fileId,p.data.unit]),'small primary')}</div>`).join('')).join('')||empty('Aguardando o outro relatório para conciliar.')}</section>`}
