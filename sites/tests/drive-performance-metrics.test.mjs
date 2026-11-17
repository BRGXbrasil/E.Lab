import test from 'node:test';
import assert from 'node:assert/strict';
import * as reports from '../src/performance-report.js';

const row=(id,date,client,command=id,amountCents=1000,professional='Ana',quantity=1,unit='E.Lab')=>({id,kind:'avec_service',data:{source:'0031',unit,normalized:{date,client,command,amountCents,professional,quantity}}});
const report=(rows,from='2026-08-01',to='2026-08-31',professional='')=>{
 assert.equal(typeof reports.individualPerformance,'function','individual report must be exported');
 return reports.individualPerformance(rows,from,to,professional);
};

test('cohort returns require full observation, later dates and first selected visit anchor',()=>{
 const rows=[row('a','2026-06-01','Ana'),row('a2','2026-06-15','Ana'),row('b','2026-06-10','Bia'),row('b2','2026-07-20','Bia'),row('c','2026-07-20','Cris'),row('c2','2026-08-05','Cris'),row('d','2026-08-20','Dani'),row('d2','2026-08-21','Dani'),row('future','2026-09-01','Bia')];
 const r=report(rows,'2026-06-01','2026-08-31');
 assert.deepEqual(r.return30,{eligible:3,returned:2,rate:2/3});
 assert.deepEqual(r.return60,{eligible:2,returned:2,rate:1});
 const recent=report(rows,'2026-08-01','2026-08-31');
 assert.deepEqual(recent.return30,{eligible:0,returned:0,rate:null});
 assert.deepEqual(recent.return60,{eligible:0,returned:0,rate:null});
});

test('new and returning clients are disjoint and normalize names within each unit',()=>{
 const rows=[row('old','2026-07-01','  Ána Maria '),row('a','2026-08-01','ana   maria'),row('b','2026-08-01','Bia'),row('b2','2026-08-10','Bia'),row('u','2026-08-12','Ana Maria','u',1000,'Ana',1,'Outra'),row('blank','2026-08-15','')];
 const r=report(rows);
 assert.equal(r.newClients,2);assert.equal(r.returningClients,1);assert.equal(r.newClients+r.returningClients,r.current.clients);assert.equal(r.attractionRate,2/3);
 assert.equal(r.frequencyDays,20); // Ana's 31-day interval and Bia's 9-day interval.
});

test('historical professional portfolio segments are mutually exclusive and omit future rows',()=>{
 const rows=[row('risk','2026-01-01','Risco',undefined,2000),row('other','2026-01-01','Outra',undefined,9999,'Lu'),row('rec','2026-07-30','Rec'),row('rec2','2026-08-15','Rec'),row('active','2026-08-20','Ativa'),...['01','02','03','04','05'].map(d=>row('vip'+d,'2026-08-'+d,'VIP')),row('future','2026-09-01','Risco')];
 const r=report(rows,undefined,undefined,'Ana');
 assert.equal(r.atRiskClients,1);assert.equal(r.current.atRiskClients,0);
 assert.deepEqual(r.segments,[{name:'VIP',clients:1,amountCents:5000},{name:'Recorrentes',clients:1,amountCents:2000},{name:'Ativas',clients:1,amountCents:1000},{name:'Em risco',clients:1,amountCents:2000}]);
 assert.deepEqual(r.opportunities.atRiskClients,{clients:1,historicalAmountCents:2000});
 assert.deepEqual(r.opportunities.vipClients,{clients:1,historicalAmountCents:5000});
 assert.deepEqual(r.opportunities.singleVisitClients,{clients:2,historicalAmountCents:3000});
 assert.deepEqual(r.opportunities.additionalClients,{clients:3,historicalAmountCents:8000});
});

test('command visits deduplicate service lines; same-day commands do not imply temporal return',()=>{
 const rows=[row('a','2026-06-01','Bia','1',500),row('a2','2026-06-01','Bia','1',500),row('a3','2026-06-01','Bia','2',1000,'Ana',2),row('end','2026-08-31','Cris')];
 const r=report(rows,'2026-06-01','2026-08-31');
 assert.equal(r.current.visits,3);assert.equal(r.frequencyDays,null);
 assert.deepEqual(r.return30,{eligible:1,returned:0,rate:0});
 assert.equal(r.opportunities.additionalClients.clients,1);
});

test('comparison periods use equal inclusive length and year to selected end',()=>{
 const rows=[row('p','2026-07-31','A'),row('c','2026-08-01','A'),row('jan','2026-01-01','B'),row('later','2026-09-01','C')];
 const r=report(rows);
 assert.equal(r.previousFrom,'2026-07-01');assert.equal(r.previousTo,'2026-07-31');
 assert.equal(r.previous.amountCents,1000);assert.equal(r.year.amountCents,3000);
 assert.deepEqual(r.current,reports.performanceOverview(rows,'2026-08-01','2026-08-31'));
});

test('empty, invalid, other-source and malformed data cannot manufacture metrics',()=>{
 const wrong=row('wrong','2026-01-01','Wrong');wrong.data.source='0387';
 const bad=row('bad','2026-08-01','Bad');bad.data.normalized.quantity=-1;
 const r=report([wrong,bad,null]);
 assert.deepEqual(r.return30,{eligible:0,returned:0,rate:null});assert.equal(r.atRiskClients,0);assert.equal(r.frequencyDays,null);assert.equal(r.attractionRate,null);
 assert.equal(r.segments.reduce((n,s)=>n+s.clients,0),0);
 const invalid=report([row('valid','2026-01-01','Bia')],'2026-08-31','2026-08-01');
 assert.equal(invalid.current.clients,0);assert.equal(invalid.atRiskClients,0);assert.equal(invalid.previousFrom,null);
});

test('coverage ends at available history capped to selected end, while future visits stay excluded',()=>{
 const rows=[row('start','2026-06-01','Bia'),row('return','2026-06-20','Bia'),row('coverage','2026-08-20','Bia')];
 const r=report(rows,'2026-06-01','2026-07-31');
 assert.deepEqual(r.return60,{eligible:1,returned:1,rate:1});
 assert.equal(r.current.visits,2);assert.equal(r.segments.find(s=>s.name==='VIP').clients,0);
 const partial=report(rows.slice(0,2),'2026-06-01','2026-07-31');
 assert.deepEqual(partial.return30,{eligible:0,returned:0,rate:null});
});

test('legacy service rows without source preserve overview totals and historical clients',()=>{
 const legacy=row('legacy','2026-06-01','Bia');delete legacy.data.source;
 const current=row('current','2026-08-01','Cris');delete current.data.source;
 const rows=[legacy,current];
 const r=report(rows);
 assert.deepEqual(r.current,reports.performanceOverview(rows,'2026-08-01','2026-08-31'));
 assert.equal(r.atRiskClients,1);assert.equal(r.newClients,1);
});
