import test from 'node:test';
import assert from 'node:assert/strict';
import {buildStockCoverageReport,calculateStockCoverage,validateCoveragePolicy,stockBusinessDate} from '../src/stock-coverage.js';
const item=(name,balance,outflow)=>({key:name,name,brand:'',balance,outflow,periodDays:30,observationRows:10,balanceDate:'2026-11-18',balanceKnown:true,unit:'un'});
test('coverage ranks velocity, warns at 15 days and never invents buying horizon',()=>{
 const report=buildStockCoverageReport({rows:[item('A',10,30),item('B',10,60),item('C',15,30),item('D',16,30)],now:'2026-11-18T12:00:00Z'});
 assert.deepEqual(report.rows.map(r=>r.name),['B','A','C','D']);
 assert.deepEqual(report.rows.map(r=>r.status),['urgent','urgent','attention','ok']);
 assert.equal(report.rows[0].coverageDays,5);assert.equal(report.rows[0].projectedBalanceAtArrival,-10);
 assert.equal(report.rows[0].orderUnits,null);assert.equal(report.postArrivalDays,null);
});
test('quantity covers delivery consumption plus explicit validated post-arrival horizon',()=>{
 const r=calculateStockCoverage(item('B',10,60),{postArrivalDays:7},'2026-11-18');
 assert.equal(r.required,34);assert.equal(r.orderUnits,24);
 assert.equal(calculateStockCoverage(item('zero',1,0),{postArrivalDays:7},'2026-11-18').orderUnits,0);
 assert.equal(calculateStockCoverage({...item('tiny',1,3),periodDays:2,observationRows:1},{postArrivalDays:7},'2026-11-18').orderUnits,null);
});
test('manual consumption is validated and traceable; invalid policy never coerces silently',()=>{
 const r=calculateStockCoverage(item('A',10,30),{consumptionMode:'manual',dailyUse:2,postArrivalDays:7,reason:'Consumo irregular conferido'},'2026-11-18');
 assert.equal(r.daily,2);assert.equal(r.consumptionSource,'manual');assert.equal(r.policy.reason,'Consumo irregular conferido');
 for(const p of [{postArrivalDays:-1},{postArrivalDays:1.5},{postArrivalDays:''},{consumptionMode:'bad'},{consumptionMode:'manual'},{consumptionMode:'manual',dailyUse:-1}])assert.throws(()=>validateCoveragePolicy(p));
});
test('actual dated movement range drives mean and projection, preserving per-unit quantities',()=>{
 const report=buildStockCoverageReport({activity:[{key:'P',name:'P',rows:10,from:'2026-10-20',to:'2026-11-18',balanceKnown:true,measures:{un:{net:10,out:60},g:{net:50,out:30}}}],now:'2026-11-20T12:00:00Z'});
 assert.equal(report.movementFrom,'2026-10-20');assert.equal(report.movementTo,'2026-11-18');
 assert.equal(report.rows.length,2);const r=report.rows.find(r=>r.measureUnit==='un');assert.equal(r.daily,2);assert.equal(r.balance,10);assert.equal(r.projectedBalance,6);assert.equal(r.coverageDays,3);assert.equal(r.balanceDate,'2026-11-18');assert.equal(r.projectionDays,2);
 assert.equal(stockBusinessDate('2026-11-19T01:00:00Z'),'2026-11-18');
});
test('unknown balance or future dates cannot create confident purchase quantities',()=>{
 assert.equal(calculateStockCoverage({...item('P',10,30),balanceKnown:false},{postArrivalDays:7},'2026-11-18').orderUnits,null);
 assert.equal(calculateStockCoverage({...item('P',10,30),balanceDate:'2026-11-20'},{postArrivalDays:7},'2026-11-18').orderUnits,null);
});

test('one tiny outflow among many ledger entries remains a review, even across a long window',()=>{
 const activity=[{key:'E.Lab/P',productId:'P',unit:'E.Lab',name:'P',rows:10,from:'2026-10-20',to:'2026-11-18',balanceKnown:true,measures:{un:{net:0,out:0.01}}}];
 const movements=[{data:{unit:'E.Lab',normalized:{productId:'P',date:'2026-11-01',direction:'out',components:[{unit:'un',quantity:-0.01}]}}}];
 const r=buildStockCoverageReport({activity,movements,policies:[{data:{key:'global',inputs:{postArrivalDays:7}}}],now:'2026-11-18T12:00:00Z'}).rows[0];
 assert.equal(r.orderUnits,null);assert.equal(r.consumptionReliable,false);assert.equal(r.observationOutflowDays,1);
});
test('each product keeps its own observation period when another product has older history',()=>{
 const p={key:'E.Lab/P',productId:'P',unit:'E.Lab',name:'P',rows:10,from:'2026-10-20',to:'2026-11-18',balanceKnown:true,measures:{un:{net:10,out:60}}};
 const q={...p,key:'E.Lab/Q',productId:'Q',name:'Q',from:'2025-01-01'};
 const report=buildStockCoverageReport({activity:[p,q],now:'2026-11-18T12:00:00Z'}),row=report.rows.find(r=>r.name==='P');
 assert.equal(row.periodDays,30);assert.equal(row.daily,2);assert.equal(row.movementFrom,'2026-10-20');assert.equal(report.movementFrom,'2025-01-01');
});
test('manual consumption is scoped to its measure; ambiguous legacy product override cannot purchase',()=>{
 const activity=[{key:'E.Lab/P',productId:'P',unit:'E.Lab',name:'P',rows:10,from:'2026-10-20',to:'2026-11-18',balanceKnown:true,measures:{un:{net:10,out:30},g:{net:100,out:300}}}];
 const legacy={data:{key:'E.Lab/P',inputs:{consumptionMode:'manual',dailyUse:2,leadDays:12,postArrivalDays:7}}};
 let report=buildStockCoverageReport({activity,policies:[legacy],now:'2026-11-18T12:00:00Z'});
 assert.deepEqual(report.rows.map(r=>r.daily).sort((a,b)=>a-b),[1,10]);
 assert.ok(report.rows.every(r=>r.orderUnits===null&&r.policyWarning&&r.leadDays===12));
 const scoped={data:{key:'E.Lab/P::un',inputs:{consumptionMode:'manual',dailyUse:2},reason:'Em unidades conferido'}};
 report=buildStockCoverageReport({activity,policies:[legacy,scoped],now:'2026-11-18T12:00:00Z'});
 const unit=report.rows.find(r=>r.measureUnit==='un'),grams=report.rows.find(r=>r.measureUnit==='g');
 assert.equal(unit.productKey,'E.Lab/P');assert.equal(unit.key,'E.Lab/P');assert.equal(unit.policyKey,'E.Lab/P::un');
 assert.equal(unit.daily,2);assert.equal(unit.orderUnits,28);assert.equal(unit.policy.reason,'Em unidades conferido');assert.equal(grams.daily,10);assert.equal(grams.orderUnits,null);
});
test('single-measure legacy manual override remains compatible and global manual policy is rejected',()=>{
 const activity=[{key:'E.Lab/P',name:'P',rows:10,from:'2026-10-20',to:'2026-11-18',balanceKnown:true,measures:{un:{net:10,out:30}}}];
 assert.equal(buildStockCoverageReport({activity,policies:[{data:{key:'E.Lab/P',inputs:{consumptionMode:'manual',dailyUse:2}}}]}).rows[0].daily,2);
 assert.throws(()=>buildStockCoverageReport({activity,policies:[{data:{key:'global',inputs:{consumptionMode:'manual',dailyUse:2}}}]}),/global/i);
});

test('saldo histórico negativo não é tratado como posição física válida para gerar compra',()=>{
 const r=calculateStockCoverage({balance:-100,outflow:300,periodDays:30,observationRows:10,balanceDate:'2026-11-18',unit:'g'}, {leadDays:10,postArrivalDays:7}, '2026-11-18');
 assert.equal(r.status,'review');assert.equal(r.coverageDays,null);assert.equal(r.projectedBalance,null);assert.equal(r.orderUnits,null);assert.match(r.quantityReason,/negativo/);
});
