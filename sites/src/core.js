export const areas={reception:'Recepção',controls:'Estoque',cleaning:'Limpeza'};
export const roles={admin:'Proprietário',manager:'Gestão',reception:'Recepção',professional:'Profissional',controls:'Estoque',cleaning:'Limpeza'};
export function businessDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function weekStart(date){const d=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-((d+6)%7))}
export function due(task,date){if(!task.active||task.schedule==='review'||task.schedule==='demand')return false;const day=new Date(date+'T12:00:00Z').getUTCDay();if(task.schedule==='monthly'){return task.monthDay===-1?addDays(date,1).slice(8)==='01':Number(date.slice(8))===(task.monthDay||1)}return !task.days?.length||task.days.includes(day)}
export function instanceKey(task,date,slot=1){return task.schedule==='three'?`${task.id}/${weekStart(date)}/${slot}`:`${task.id}/${date}`}
export function canArea(role,area){return ['admin','manager'].includes(role)||role===area}
export function canKind(role,kind){if(['admin','manager'].includes(role))return true;return ({run:['reception','controls','cleaning'],entry:['reception'],activation:['reception'],client:['reception','professional'],queue:['reception','professional'],queue_event:['reception','professional'],legacy:['reception'],inventory:['controls'],movement:['controls'],attendance:['reception'],training:['reception','professional','controls','cleaning']})[kind]?.includes(role)||false}
export const SERVICES=[['hair','Cabelos'],['nails','Manicure padrão'],['gel','Gel'],['brows','Sobrancelhas'],['makeup','Maquiagem']];
export function effectiveStatus(person,day=businessDate()){return person.presenceDate===day?person.status:'unconfirmed'}
export function ordered(q,reverse=false,day=businessDate()){
 const available=(q?.people||[]).filter(p=>p.operational!==false&&isOperationalName(p.name)&&effectiveStatus(p,day)==='present');
 if(!available.length)return [];
 // Preserve the algorithm used by the original QueueLogic, including occupied-pointer fallback.
 const start=Math.max(0,available.findIndex(p=>p.name===q?.nextUp));
 const list=available.slice(start).concat(available.slice(0,start));return reverse?list.reverse():list;
}
export function queueEvent(previous,event){
 const day=event.day||businessDate(),q=structuredClone(previous||{people:[],nextUp:null,counts:{},future:[],week:''});q.counts||={};q.future||=[];q.people||=[];
 const cleanName=x=>typeof x==='string'?x.trim().slice(0,100):'';
 const names=q.people.map(x=>x.name);const eligible=()=>q.people.filter(p=>p.operational!==false&&isOperationalName(p.name)&&effectiveStatus(p,day)==='present');
 const nextAfter=name=>{const available=eligible();if(!available.length)return null;const i=available.findIndex(p=>p.name===name);if(i>=0)return available[(i+1)%available.length].name;const j=q.people.findIndex(p=>p.name===name);return (available.find(p=>q.people.indexOf(p)>j)||available[0]).name};
 const person=()=>{const p=q.people.find(p=>p.name===event.name);if(!p)throw Error('Profissional não encontrado.');return p};
 if(event.type==='add'){
  const name=cleanName(event.name);if(!name||names.some(n=>n.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Informe um nome único.');
  q.people.push({name,status:'present',presenceDate:day});q.nextUp||=name;
 }else if(event.type==='status'){
  const p=person(),wasAbsent=effectiveStatus(p,day)==='absent';if(!['present','absent','occupied'].includes(event.status))throw Error('Status inválido.');
  p.status=event.status;p.presenceDate=day;
  if(event.status==='absent'&&q.nextUp===p.name)q.nextUp=nextAfter(p.name);
  if(event.status==='present'&&wasAbsent&&q.nextUp===p.name)q.nextUp=nextAfter(p.name);
  if(!q.nextUp&&event.status==='present')q.nextUp=p.name;
 }else if(event.type==='pass'){
  const mode=event.mode==='agenda'?'agenda':'now',list=ordered(q,mode==='agenda',day);if(!list.length||event.name!==list[0].name)throw Error('A passagem deve ser registrada para quem está na vez.');
  q.nextUp=mode==='agenda'?list[0].name:nextAfter(event.name);
 }else if(event.type==='attendance'){
  const p=person();if(effectiveStatus(p,day)!=='present'||ordered(q,false,day)[0]?.name!==p.name)throw Error('Registre o atendimento de quem está na vez e presente.');
  if(!cleanName(event.client))throw Error('Informe a cliente para registrar o atendimento.');
  q.counts[p.name]=(q.counts[p.name]||0)+1;q.nextUp=nextAfter(p.name);
 }else if(event.type==='remove'){
  person();const next=q.nextUp===event.name?nextAfter(event.name):q.nextUp;q.people=q.people.filter(x=>x.name!==event.name);q.nextUp=next===event.name?null:next;
 }else if(event.type==='rename'){
  const p=person(),name=cleanName(event.newName);if(!name||names.some(n=>n!==p.name&&n.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Nome já cadastrado ou inválido.');
  q.counts[name]=q.counts[p.name]||0;delete q.counts[p.name];if(q.nextUp===p.name)q.nextUp=name;q.future.forEach(f=>{if(f.professional===p.name)f.professional=name});p.name=name;
 }else if(event.type==='schedule'){
  if(!cleanName(event.client)||!event.at||!Number.isFinite(Date.parse(event.at)))throw Error('Informe cliente e data válidos.');
  if(q.future.some(f=>f.id===event.id))throw Error('Reserva já cadastrada.');const professional=event.professional||ordered(q,true,day)[0]?.name;if(!names.includes(professional))throw Error('Escolha um profissional cadastrado.');
  q.future.push({id:event.id,client:cleanName(event.client),professional,service:cleanName(event.service),at:event.at,status:'scheduled',createdAt:event.createdAt,needsConference:false});
 }else if(['unschedule','confirm-appointment','no-show'].includes(event.type)){
  const f=q.future.find(x=>x.id===event.id);if(!f||!['scheduled',undefined].includes(f.status))throw Error('Agendamento já encerrado ou inexistente.');
  f.status=event.type==='confirm-appointment'?'attended':event.type==='no-show'?'no_show':'cancelled';f.confirmedAt=event.createdAt;f.needsConference=false;
  // Agenda confirmation records its outcome without moving Agora or counting twice.
 }else throw Error('Ação inválida.');
 return q;
}
export function legacyCandidates(payload){
 const result=[],stores=['elab_lista_da_vez_v2','elab-execucao-historico-v1','case_v1','elab-recepcao-v1','elab-estoque-v1','elab-limpeza-v1'];
 const text=x=>typeof x==='string'?x:'';const push=(kind,scope,item,data)=>{if(!item||typeof item!=='object')return;result.push({kind,scope,originalId:String(item.eventId||item.id||''),data:{...data,raw:item,legacy:true}})};
 function queue(value){for(const [service,q] of Object.entries(value||{})){if(!SERVICES.some(([id])=>id===service)||!q||typeof q!=='object')continue;for(const ev of q.events||[])push('queue_event',service,ev,{service,event:ev,at:ev.at,actor:ev.user||ev.operator||'Não informado na origem'});for(const log of q.log||[]){const duplicate=(q.events||[]).some(ev=>ev.legacyRef===log.id||(ev.type==='attendance'&&ev.professional===log.prof&&ev.client===log.nome));if(!duplicate)push('queue_event',service,log,{service,event:{type:'attendance',professional:log.prof,client:log.nome,service:log.serv,at:log.when},originalAt:log.when,actor:'Não informado na origem'})}}}
 function process(value,key){if(typeof value==='string'){try{value=JSON.parse(value)}catch{return}}if(!value)return;
 if(key==='elab_lista_da_vez_v2'){queue(value);push('source_snapshot',key,{snapshot:value},{title:'Estado original da Lista da Vez'});return}
 if(Array.isArray(value)){for(const item of value){if(item?.data&&typeof item.data==='object'&&SERVICES.some(([id])=>item.data[id])){queue(item.data);push('source_snapshot','supabase',{snapshot:item},{title:'Exportação do estado original'});continue}if(!item||typeof item!=='object'||!Object.values(item).some(v=>v!==''&&v!=null))continue;push('legacy',key,item,{category:item.type||'record',title:item.subject||item.titulo||item.title||item.service||'Registro legado',originalAt:item.createdAt||item.quando||item.data||item.when||null,date:/^\d{4}-\d\d-\d\d/.test(item.createdAt||item.data||'')?(item.createdAt||item.data).slice(0,10):null,status:item.status||'Registrado',actor:item.user||item.owner||'Não informado na origem'})}return}
 if(SERVICES.some(([id])=>value[id])){queue(value);push('source_snapshot','supabase',{snapshot:value},{title:'Estado original da Lista da Vez'});return}
 if(key==='case_v1'){process(value.execucoes||[],key+'/execucoes');if(value.vez){process(value.vez.log||[],key+'/vez');}push('source_snapshot',key,{snapshot:{execucoes:value.execucoes||[],training:value.training||{},vez:value.vez||{},user:value.user||''}},{title:'Painel integrado original'});return}
 if(['elab-recepcao-v1','elab-estoque-v1','elab-limpeza-v1'].includes(key)){if(text(value.notes).trim())push('legacy',key,{notes:value.notes},{category:'note',title:'Anotações do módulo original',actor:'Não informado na origem',date:null});push('source_snapshot',key,{snapshot:{tasks:value.tasks||[],notes:value.notes||''}},{title:'Checklist local original'})}}
 if(payload?.format==='elab-local-export-1'){for(const key of stores)if(payload.stores&&key in payload.stores)process(payload.stores[key],key)}
 else if(Array.isArray(payload))process(payload,'historico');else if(payload?.data&&SERVICES.some(([id])=>payload.data[id]))process([payload],'supabase');else if(payload&&typeof payload==='object'){const keys=stores.filter(key=>key in payload);if(keys.length)keys.forEach(key=>process(payload[key],key));else if(SERVICES.some(([id])=>payload[id]))process(payload,'supabase');else if(payload.execucoes||payload.vez)process(payload,'case_v1')}
 return result;
}

const normalizedName = value => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ');
export function isOperationalName(name) {
  return normalizedName(name).split(' ')[0] !== 'diego';
}
export function isOperationalStaff(staff) {
  return staff.active && staff.operational !== false && isOperationalName(staff.name);
}


export function performanceReport(records, from, to, professional = '') {
  const history = records.filter(r => r.kind === 'avec_service' && r.data?.normalized?.date);
  const selected = history.filter(r => {
    const d = r.data.normalized;
    return d.date >= from && d.date <= to && (!professional || d.professional === professional);
  });
  const visits = new Map();
  const clients = new Map();
  const professionals = new Map();
  let services = 0;
  let amountCents = 0;
  let unidentifiedRows = 0;
  for (const r of history) {
    const d = r.data.normalized;
    if (!d.client?.trim()) continue;
    const key = (r.data.unit || 'E.Lab') + '/' + normalizedName(d.client);
    const client = clients.get(key) || {key, name:d.client, dates:new Set(), visits:new Set(), total:0, selectedVisits:new Set(), selectedAmount:0, services:0};
    if (d.date <= to) {
      client.dates.add(d.date);
      client.visits.add([r.data.unit,d.date,d.command || r.id].join('/'));
      client.total += Number(d.amountCents) || 0;
    }
    clients.set(key,client);
  }
  for (const r of selected) {
    const d = r.data.normalized;
    const visit = [r.data.unit || 'E.Lab',d.date,d.command || r.id].join('/');
    const clientKey = (r.data.unit || 'E.Lab') + '/' + normalizedName(d.client);
    services += Number(d.quantity) || 0;
    amountCents += Number(d.amountCents) || 0;
    visits.set(visit,true);
    const person = professionals.get(d.professional) || {name:d.professional || 'Sem profissional informado',services:0,amountCents:0,visits:new Set(),clients:new Set()};
    person.services += Number(d.quantity) || 0;
    person.amountCents += Number(d.amountCents) || 0;
    person.visits.add(visit);
    if (d.client?.trim()) {
      person.clients.add(clientKey);
      const client = clients.get(clientKey);
      client.selectedVisits.add(visit);
      client.selectedAmount += Number(d.amountCents) || 0;
      client.services += Number(d.quantity) || 0;
    } else unidentifiedRows++;
    professionals.set(d.professional,person);
  }
  const portfolio = [...clients.values()].filter(c=>c.dates.size).map(c=>{
    const dates=[...c.dates].sort();
    const first=dates[0],last=dates.at(-1);
    const daysSince=Math.floor((Date.parse(to+'T12:00:00Z')-Date.parse(last+'T12:00:00Z'))/86400000);
    return {...c,first,last,daysSince,visits:c.visits.size,selectedVisits:c.selectedVisits.size,
      classification:c.visits.size>1?'Recorrente':'Primeira vez',
      returning:c.selectedVisits.size>0&&(first<from||c.selectedVisits.size>1)};
  }).filter(c=>!professional||c.selectedVisits>0);
  const attended=portfolio.filter(c=>c.selectedVisits>0);
  return {services,amountCents,visits:visits.size,ticketCents:visits.size?Math.round(amountCents/visits.size):null,
    clients:attended.length,returning:attended.filter(c=>c.returning).length,
    firstObserved:attended.filter(c=>c.first>=from).length,unidentifiedRows,portfolio,
    professionals:[...professionals.values()].map(p=>({...p,clients:p.clients.size,visits:p.visits.size,ticketCents:p.visits.size?Math.round(p.amountCents/p.visits.size):null})).sort((a,b)=>b.services-a.services)};
}
