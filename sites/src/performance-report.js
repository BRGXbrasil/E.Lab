import {performanceReport} from './core.js';

// This report describes observed AVEC service history, not payment settlement.
export function performanceOverview(records, from, to, professional = '') {
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const history = records.filter(r => {
    const d = r?.data?.normalized;
    return r?.kind === 'avec_service' && d && (!r.data.source || r.data.source === '0031') && (d.client == null || typeof d.client === 'string') && (d.professional == null || typeof d.professional === 'string') && validDate(d.date) && typeof d.quantity === 'number' && Number.isFinite(d.quantity) && d.quantity > 0 && Number.isSafeInteger(d.amountCents);
  }).map(r => r.data.normalized.professional ? r : {...r,data:{...r.data,normalized:{...r.data.normalized,professional:'Não informado na origem'}}});
  const rangeValid = validDate(from) && validDate(to) && from <= to;
  const selected = rangeValid ? history.filter(r => r.data.normalized.date >= from && r.data.normalized.date <= to && (!professional || r.data.normalized.professional === professional)) : [];
  const base = performanceReport(rangeValid ? history : [], from, to, professional);
  const months = new Map(), categories = new Map(), serviceMix = new Map(), visits = new Map(), professionalMonths = new Map();
  if (rangeValid) for (let cursor = new Date(from.slice(0,7)+'-01T12:00:00Z'); cursor <= new Date(to+'T12:00:00Z'); cursor.setUTCMonth(cursor.getUTCMonth()+1)) {
    const month = cursor.toISOString().slice(0,7);
    months.set(month,{month,services:0,amountCents:0});
  }
  const add = (map, name, d) => {
    const group = map.get(name) || {name,services:0,amountCents:0};
    group.services += d.quantity;
    group.amountCents += d.amountCents;
    map.set(name,group);
  };
  for (const r of selected) {
    const d = r.data.normalized, month = months.get(d.date.slice(0,7));
    month.services += d.quantity; month.amountCents += d.amountCents;
    add(categories,String(d.category || '').trim() || 'Sem categoria informada',d);
    add(serviceMix,String(d.service || '').trim() || 'Sem serviço informado',d);
    const person = professionalMonths.get(d.professional) || new Map();
    const personMonth = person.get(d.date.slice(0,7)) || {services:0,amountCents:0};
    personMonth.services += d.quantity; personMonth.amountCents += d.amountCents;
    person.set(d.date.slice(0,7),personMonth);professionalMonths.set(d.professional,person);
    const visit = [r.data.unit || 'E.Lab',d.date,d.command || r.id].join('/');
    visits.set(visit,(visits.get(visit) || 0)+d.quantity);
  }
  const attended = base.portfolio.filter(c => c.selectedVisits > 0);
  const sorted = map => [...map.values()].sort((a,b) => b.amountCents-a.amountCents || b.services-a.services || a.name.localeCompare(b.name,'pt-BR'));
  const dates = history.map(r => r.data.normalized.date).sort();
  return {...base,months:[...months.values()],categories:sorted(categories),serviceMix:sorted(serviceMix),
    professionals:base.professionals.map(p => {
      const person = performanceReport(history,from,to,p.name);
      return {...p,firstObserved:person.firstObserved,returning:person.returning,
        months:[...months.keys()].map(month=>({month,...(professionalMonths.get(p.name)?.get(month) || {services:0,amountCents:0})}))};
    }),
    singleVisitClients:attended.filter(c => c.selectedVisits === 1).length,
    recurringClients:attended.filter(c => c.selectedVisits > 1).length,
    atRiskClients:attended.filter(c => c.daysSince > 60).length,
    singleServiceVisits:[...visits.values()].filter(quantity => quantity === 1).length,
    excludedRows:records.length-history.length,coverageFrom:dates[0] || null,coverageTo:dates.at(-1) || null};
}

// Individual metrics describe observed 0031 service history (including legacy
// service records with no source tag). Explicit other sources are excluded. Monetary values
// below are historical service amounts, never expected revenue or settlement.
export function individualPerformance(records, from, to, professional = '') {
  const day = 86400000;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
  const rangeValid = validDate(from) && validDate(to) && from <= to;
  const dateNumber = date => Date.parse(date+'T12:00:00Z');
  const shift = (date, days) => new Date(dateNumber(date)+days*day).toISOString().slice(0,10);
  const normalize = value => value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
  const history = records.filter(r => {
    const d = r?.data?.normalized;
    return r?.kind === 'avec_service' && (!r.data.source || r.data.source === '0031') && d && validDate(d.date) && (d.client == null || typeof d.client === 'string') && (d.professional == null || typeof d.professional === 'string') && typeof d.quantity === 'number' && Number.isFinite(d.quantity) && d.quantity > 0 && Number.isSafeInteger(d.amountCents);
  }).map(r => r.data.normalized.professional ? r : {...r,data:{...r.data,normalized:{...r.data.normalized,professional:'Não informado na origem'}}});
  const previousTo = rangeValid ? shift(from,-1) : null;
  const previousFrom = rangeValid ? shift(from,-((dateNumber(to)-dateNumber(from))/day+1)) : null;
  const current = performanceOverview(records,from,to,professional);
  const previous = performanceOverview(records,previousFrom,previousTo,professional);
  const year = performanceOverview(records,rangeValid ? to.slice(0,4)+'-01-01' : null,to,professional);
  const clients = new Map();
  let coverageTo = null;
  for (const r of rangeValid ? history : []) {
    const d = r.data.normalized;
    const coveredThrough = d.date > to ? to : d.date;
    if (!coverageTo || coveredThrough > coverageTo) coverageTo = coveredThrough;
    if (d.date > to) continue;
    if ((professional && d.professional !== professional) || !d.client?.trim()) continue;
    const unit = r.data.unit || 'E.Lab';
    const key = unit+'/'+normalize(d.client);
    const client = clients.get(key) || {visits:new Map(),selectedVisits:new Map(),total:0};
    const visitKey = [unit,d.date,d.command || r.id].join('/');
    client.visits.set(visitKey,d.date);
    client.total += d.amountCents;
    if (d.date >= from) client.selectedVisits.set(visitKey,(client.selectedVisits.get(visitKey) || 0)+d.quantity);
    clients.set(key,client);
  }
  const portfolio = [...clients.values()].map(client => {
    const dates = [...new Set(client.visits.values())].sort();
    const selectedDates = dates.filter(date => date >= from);
    return {...client,dates,first:dates[0],last:dates.at(-1),anchor:selectedDates[0],daysSince:(dateNumber(to)-dateNumber(dates.at(-1)))/day};
  });
  const attended = portfolio.filter(c => c.anchor);
  const newClients = attended.filter(c => c.first >= from).length;
  // A return needs a later calendar day: separate same-day commands are distinct
  // visits for counts, but dates alone cannot establish an elapsed return interval.
  // Right-censor every client, including early returners, until their entire window
  // is observed. The anchor is their first visit inside the selected range.
  const returns = window => {
    const eligible = attended.filter(c => coverageTo && dateNumber(c.anchor)+window*day <= dateNumber(coverageTo));
    const returned = eligible.filter(c => c.dates.some(date => date > c.anchor && dateNumber(date)-dateNumber(c.anchor) <= window*day)).length;
    return {eligible:eligible.length,returned,rate:eligible.length ? returned/eligible.length : null};
  };
  let intervalDays = 0, intervals = 0;
  for (const client of portfolio) for (let i=1;i<client.dates.length;i++) {
    intervalDays += (dateNumber(client.dates[i])-dateNumber(client.dates[i-1]))/day;
    intervals++;
  }
  // A client belongs to exactly one segment. Risk overrides visit-based VIP;
  // VIP means >=5 historical command visits, recurring means >=2, through `to`.
  const segmentName = c => c.daysSince > 60 ? 'Em risco' : c.visits.size >= 5 ? 'VIP' : c.visits.size >= 2 ? 'Recorrentes' : 'Ativas';
  const segments = ['VIP','Recorrentes','Ativas','Em risco'].map(name => {
    const group = portfolio.filter(c => segmentName(c) === name);
    return {name,clients:group.length,amountCents:group.reduce((sum,c)=>sum+c.total,0)};
  });
  const opportunity = group => ({clients:group.length,historicalAmountCents:group.reduce((sum,c)=>sum+c.total,0)});
  const atRisk = portfolio.filter(c=>c.daysSince > 60);
  return {current,previous,year,previousFrom,previousTo,
    return30:returns(30),return60:returns(60),frequencyDays:intervals ? intervalDays/intervals : null,
    newClients,returningClients:attended.length-newClients,atRiskClients:atRisk.length,
    attractionRate:attended.length ? newClients/attended.length : null,segments,
    opportunities:{atRiskClients:opportunity(atRisk),
      // Only an observed one-service visit supports an additional-service list.
      additionalClients:opportunity(attended.filter(c=>[...c.selectedVisits.values()].some(quantity=>quantity === 1))),
      singleVisitClients:opportunity(attended.filter(c=>c.selectedVisits.size === 1)),
      vipClients:opportunity(portfolio.filter(c=>segmentName(c) === 'VIP'))}};
}
