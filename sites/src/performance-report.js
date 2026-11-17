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
