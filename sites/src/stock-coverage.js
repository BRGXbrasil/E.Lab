// Coverage is a planning estimate from dated movements, never a physical count.
const DAY=86400000;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v+'T12:00:00Z').toISOString().slice(0,10)===v;
const days=(a,b)=>(Date.parse(b)-Date.parse(a))/DAY;
const round=v=>Math.round(v*1e10)/1e10;
export function stockBusinessDate(now=new Date()) {return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));}
export function validateCoveragePolicy(inputs={}) {
 const policy={...inputs};
 for(const k of ['leadDays','postArrivalDays'])if(policy[k]!==undefined&&policy[k]!==null){if(!finite(policy[k])||!Number.isInteger(policy[k])||policy[k]<0||policy[k]>3650||(k==='postArrivalDays'&&policy[k]===0))throw Error('Prazo e cobertura devem ser dias inteiros válidos.');}
 if(policy.consumptionMode!==undefined&&!['mean','manual'].includes(policy.consumptionMode))throw Error('Modo de consumo inválido.');
 if(policy.dailyUse!==undefined&&policy.dailyUse!==null&&(!finite(policy.dailyUse)||policy.dailyUse<0))throw Error('Consumo diário inválido.');
 if(policy.consumptionMode==='manual'&&!finite(policy.dailyUse))throw Error('Informe o consumo diário manual.');
 return policy;
}
export function calculateStockCoverage(row,inputs={},asOfDate=stockBusinessDate()) {
 const policy=validateCoveragePolicy(inputs),leadDays=policy.leadDays??10,postArrivalDays=policy.postArrivalDays??null;
 const periodDays=row.periodDays,mean=finite(row.outflow)&&row.outflow>=0&&finite(periodDays)&&periodDays>0?row.outflow/periodDays:null;
 const manual=policy.consumptionMode==='manual',daily=manual?policy.dailyUse:mean;
 const reliable=manual||(periodDays>=7&&(row.observationOutflowDays??row.observationRows??row.rows??0)>=3);
 const balanceDate=row.balanceDate||null,projectionDays=validDate(balanceDate)&&validDate(asOfDate)?days(balanceDate,asOfDate):null;
 const balanceKnown=row.balanceKnown!==false&&finite(row.balance)&&row.balance>=0&&projectionDays!==null&&projectionDays>=0;
 const projectedBalance=balanceKnown&&daily!==null?round(row.balance-daily*projectionDays):null;
 const coverageDays=projectedBalance!==null&&daily>0?Math.max(0,projectedBalance)/daily:null;
 const projectedBalanceAtArrival=projectedBalance===null?null:round(projectedBalance-daily*leadDays);
 let status='review';
 if(projectedBalance!==null&&daily>0)status=coverageDays<=leadDays?'urgent':coverageDays<=Math.max(15,leadDays+5)?'attention':'ok';
 else if(projectedBalance!==null&&daily===0)status='no_consumption';
 const planningAlert=status==='urgent'||status==='attention';
 const required=postArrivalDays!==null&&daily!==null?round(daily*(leadDays+postArrivalDays)):null;
 const shortage=required!==null&&projectedBalance!==null?Math.max(0,round(required-projectedBalance)):null;
 const blocked=row.policyWarning?row.policyWarning:finite(row.balance)&&row.balance<0?'Saldo negativo na origem: conferir posição':!balanceKnown?'Saldo ou data a conferir':daily===null?'Consumo a conferir':!reliable?'Série curta: conferir consumo':postArrivalDays===null?'Configurar cobertura':null;
 const orderUnits=blocked?null:daily===0?0:Math.ceil(shortage);
 return {...row,brand:row.brand||'',daily,meanDaily:mean,periodDays,leadDays,postArrivalDays,policy,asOfDate,balanceDate,projectionDays,projectedBalance,projectedBalanceAtArrival,arrival:projectedBalanceAtArrival,coverageDays,required,shortage,status,planningAlert,consumptionSource:manual?'manual':'movements_mean',consumptionReliable:reliable,orderUnits,quantityReason:blocked,projectionNotice:'Estimativa pelos movimentos; não representa contagem física.'};
}
export function buildStockCoverageReport({activity=[],rows,movements,policies=[],settings={},now=new Date()}={}) {
 const date=stockBusinessDate(now),froms=activity.map(p=>p.from).filter(validDate),tos=activity.map(p=>p.to).filter(validDate);
 const movementFrom=froms.sort()[0]||null,movementTo=tos.sort().at(-1)||null;
 const globalRecord=policies.find(p=>['global','default','*'].includes(p.data?.key??p.key));
 const data=globalRecord?.data||globalRecord||{},globalPolicy={...settings.coveragePolicy,...data.inputs};if(data.reason)globalPolicy.reason=data.reason;
 if(globalPolicy.consumptionMode==='manual')throw Error('Consumo manual global não permitido: configure por produto e medida.');
 const validated=validateCoveragePolicy(globalPolicy);
 const source=(rows||activity.flatMap(p=>Object.entries(p.measures||{}).map(([measureUnit,m])=>({key:p.key||p.unit+'/'+p.productId,productId:p.productId,name:p.name,brand:p.brand||'',businessUnit:p.unit,measureUnit,unit:measureUnit,balance:m.net,outflow:m.out,balanceKnown:p.balanceKnown,balanceDate:p.to,periodDays:validDate(p.from)&&validDate(p.to)&&p.from<=p.to?days(p.from,p.to)+1:null,observationRows:p.rows,review:p.balanceKnown===false,source:'movement-ledger',movementFrom:p.from,movementTo:p.to})))).map(row=>{const productKey=row.productKey||row.key,measureUnit=row.measureUnit||row.unit;return {...row,productKey,measureUnit,policyKey:productKey+'::'+encodeURIComponent(measureUnit)}});
 // A single noisy outflow must not become a rounded-up automatic purchase.
 if(movements){const observed=new Map();for(const r of movements){const d=r.data?.normalized||r.normalized||r,unit=r.data?.unit||r.businessUnit||'E.Lab',key=unit+'/'+d.productId;for(const c of d.components||[{unit:d.unit,quantity:d.direction==='out'?-Math.abs(d.quantity):0}]){if(d.direction==='adjustment'||!(c.quantity<0)||!validDate(d.date))continue;const id=key+'\u0000'+c.unit,set=observed.get(id)||new Set();set.add(d.date);observed.set(id,set)}}for(const row of source)row.observationOutflowDays=observed.get(row.key+'\u0000'+row.measureUnit)?.size||0;}
 const measureCounts=new Map();for(const row of source){const measures=measureCounts.get(row.productKey)||new Set();measures.add(row.measureUnit);measureCounts.set(row.productKey,measures);}
 const calculated=source.map(row=>{
  const productRecord=policies.find(p=>(p.data?.key??p.key)===row.productKey),product=productRecord?.data||productRecord||{};
  const measureRecord=policies.find(p=>(p.data?.key??p.key)===row.policyKey),measure=measureRecord?.data||measureRecord||{};
  const productInputs={...product.inputs};let policyWarning=null;
  if(measureCounts.get(row.productKey).size>1&&productInputs.consumptionMode==='manual'){
   delete productInputs.consumptionMode;delete productInputs.dailyUse;
   if(measure.inputs?.consumptionMode!=='manual')policyWarning='Consumo manual por medida necessário: confira a política do produto.';
  }
  const inputs={...validated,...productInputs,...measure.inputs};if(product.reason)inputs.reason=product.reason;if(measure.reason)inputs.reason=measure.reason;
  return calculateStockCoverage({...row,policyWarning},inputs,date);
 });
 const rank={urgent:0,attention:1,review:2,ok:3,no_consumption:4};calculated.sort((a,b)=>rank[a.status]-rank[b.status]||(a.coverageDays??Infinity)-(b.coverageDays??Infinity)||a.name.localeCompare(b.name,'pt-BR'));
 return {date,asOfDate:date,movementFrom,movementTo,leadDays:validated.leadDays??10,postArrivalDays:validated.postArrivalDays??null,policy:validated,rows:calculated,source:'movement-ledger',projectionNotice:'Saldo histórico preservado na data do último movimento; projeção estimada até hoje, não representa contagem física.'};
}
