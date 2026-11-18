export const areas={reception:'Recepção',commercial:'Comercial',controls:'Estoque',cleaning:'Limpeza',pantry:'Copa',valet:'Manobristas',maintenance:'Manutenção',technical:'Parceiros Técnicos',management:'Gestão'};
export const roles={admin:'Proprietário',manager:'Gestão',hr:'RH',adm:'ADM',reception:'Recepção',commercial:'Comercial',professional:'Parceiros Técnicos',controls:'Estoque',cleaning:'Limpeza',pantry:'Copa',valet:'Manobristas',maintenance:'Manutenção'};
export function businessDate(now=new Date()){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
export function addDays(date,n){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
export function weekStart(date){const d=new Date(date+'T12:00:00Z').getUTCDay();return addDays(date,-((d+6)%7))}
export function due(task,date){if(!task.active||task.schedule==='review'||task.schedule==='demand')return false;const day=new Date(date+'T12:00:00Z').getUTCDay();if(task.schedule==='monthly'){return task.monthDay===-1?addDays(date,1).slice(8)==='01':Number(date.slice(8))===(task.monthDay||1)}return !task.days?.length||task.days.includes(day)}
export function instanceKey(task,date,slot=1){return task.schedule==='three'?`${task.id}/${weekStart(date)}/${slot}`:`${task.id}/${date}`}
export function roleArea(role){return role==='professional'?'technical':Object.hasOwn(areas,role)?role:null}
export function canArea(role,area){return ['admin','manager','hr','adm'].includes(role)||Boolean(roleArea(role)&&roleArea(role)===area)}
export function canKind(role,kind){if(['admin','manager'].includes(role))return true;return ({run:['reception','commercial','controls','cleaning','pantry','valet','maintenance','professional'],routine:['reception','commercial','controls','cleaning','pantry','valet','maintenance','professional'],entry:['reception','commercial','controls','cleaning','pantry','valet','maintenance','professional'],activation:['reception','commercial','controls','cleaning','pantry','valet','maintenance','professional'],activation_event:['reception','commercial','controls','cleaning','pantry','valet','maintenance','professional'],client:['reception','commercial','professional'],queue:['reception','professional'],queue_event:['reception','professional'],legacy:['reception'],inventory:['controls'],movement:['controls'],attendance:['reception'],training:['reception','commercial','professional','controls','cleaning']})[kind]?.includes(role)||false}

// Ownership is projected from current routines without rewriting historical records.
export function recordArea(record,tasks=[]){
 const data=record.data||{};
 if(['activation','activation_event'].includes(record.kind))return data.area||'commercial';
 if(record.kind==='run')return tasks.find(t=>t.id===data.taskId)?.area||data.area;
 if(record.kind==='entry')return data.area||'reception';
 if(record.kind==='routine')return data.area;
 return null;
}
export const SERVICES=[['hair','Cabelos'],['nails','Manicure padrão'],['gel','Gel'],['brows','Sobrancelhas'],['makeup','Maquiagem']];
export function effectiveStatus(person,day=businessDate()){return person.presenceDate===day?person.status:'unconfirmed'}
export function ordered(q,reverse=false,day=businessDate()){
 const available=(q?.people||[]).filter(p=>p.operational!==false&&isOperationalName(p.name)&&effectiveStatus(p,day)==='present');
 if(!available.length)return [];
 // Preserve the algorithm used by the original QueueLogic, including occupied-pointer fallback.
 const start=Math.max(0,available.findIndex(p=>p.name===q?.nextUp));
 const list=available.slice(start).concat(available.slice(0,start));return reverse?list.reverse():list;
}
export function agendaOrdered(q){
 const people=(q?.people||[]).filter(p=>p.operational!==false&&isOperationalName(p.name));
 if(!people.length)return [];
 const start=Math.max(0,people.findIndex(p=>p.name===(q?.agendaNextUp??q?.nextUp)));
 const list=people.slice(start).concat(people.slice(0,start)).reverse();
 const returned=(q?.agendaReturns||[]).map(r=>people.find(p=>p.name===r.professional)).filter(Boolean);
 return [...new Map([...returned,...list].map(p=>[p.name,p])).values()];
}
export function appointmentDate(appointment){
 const at=appointment?.at;if(!at||!Number.isFinite(Date.parse(at)))return '';
 return /^\d{4}-\d\d-\d\d(?:T\d\d:\d\d(?::\d\d)?)?$/.test(at)?at.slice(0,10):businessDate(new Date(at));
}
export function appointmentSections(q,day=businessDate()){
 const result={upcoming:[],conference:[],history:[],recovered:[]};
 for(const f of q?.future||[]){if(f.status&&!['scheduled','pending'].includes(f.status))result.history.push(f);else if(!appointmentDate(f))result.recovered.push(f);else result[appointmentDate(f)>day?'upcoming':'conference'].push(f)}
 for(const rows of Object.values(result))rows.sort((a,b)=>(a.at||'').localeCompare(b.at||''));return result;
}
// Merge evidence by appointment identity; missing snapshots alone never establish an outcome.
export function recoverQueueAppointments(previous,service,records=[],audits=[],source={}){
 const q=structuredClone(previous||{people:[],counts:{},future:[]}),found=new Map(),evidence=[];
 const parse=x=>{if(typeof x!=='string')return x;try{return JSON.parse(x)}catch{return null}};
 const snapshot=(value,label,stamp='',depth=0)=>{value=parse(value);if(!value||typeof value!=='object'||depth>5)return;
  if(value[service]){const list=value[service].future||value[service].futureQueue||[];for(const f of list)evidence.push({f,source:label,stamp});for(const event of value[service].events||[])eventEvidence(event,label,stamp);}
  for(const key of ['snapshot','raw','data','queues'])if(value[key])snapshot(value[key],label,stamp,depth+1);
 };
 const eventEvidence=(v,label,stamp)=>{if(!v)return;const id=v.appointmentId||v.id;if(!id)return;
  if(['schedule','appointment_created'].includes(v.type))evidence.push({f:{id,client:v.client,professional:v.professional,service:v.service,at:v.type==='schedule'?v.at:v.appointmentAt||v.scheduledAt||null,createdAt:v.createdAt||stamp,status:'scheduled'},source:label,stamp});
  const status=({'confirm-appointment':'attended','no-show':'no_show',unschedule:'cancelled'})[v.type];if(status)evidence.push({f:{id,status,confirmedAt:stamp},source:label,stamp});
 };
 snapshot(source,'Arquivo original');
 for(const r of records){if(r.kind==='source_snapshot')snapshot(r.data,r.data.source||r.id,r.updatedAt);if(r.kind==='queue_event'&&r.data?.service===service)eventEvidence(r.data.event,r.data.source||r.id,r.data.at||r.updatedAt);}
 for(const a of audits){if((a.record_id||a.recordId)==='queue/'+service){const data=parse(a.data);for(const f of data?.future||[])evidence.push({f,source:'Auditoria da Lista da Vez',stamp:a.at});}}
 evidence.sort((a,b)=>(a.stamp||'').localeCompare(b.stamp||''));
 const terminal=status=>['attended','no_show','cancelled'].includes(status);
 const merge=(f,label,recovered)=>{
  if(!f?.id)return;
  f={...f,client:f.client||f.nome,professional:f.professional||f.prof,service:f.service||f.serv,at:f.at||f.scheduledAt};
  const old=found.get(f.id)||{},values=Object.fromEntries(Object.entries(f).filter(([,v])=>v!==undefined&&v!==null&&v!==''));
  // Reopening is not an allowed transition: stale pending snapshots cannot erase an outcome.
  if(terminal(old.status)&&!terminal(values.status)){values.status=old.status;values.confirmedAt=old.confirmedAt;values.needsConference=false;}
  found.set(f.id,{...old,...values,...(!old.id&&recovered?{recovered:true,recoverySource:label}:{}),status:values.status||old.status||'scheduled'});
 };
 for(const item of evidence)merge(item.f,item.source,true);
 for(const f of q.future||[])merge(f,f.source,false);
 q.future=[...found.values()].filter(f=>f.client&&f.professional);return q;
}
export function queueEvent(previous,event){
 const day=event.day||businessDate(),q=structuredClone(previous||{people:[],nextUp:null,counts:{},future:[],week:''});q.counts||={};q.future||=[];q.people||=[];
 q.agendaNextUp??=q.nextUp;
 const consumeAgenda=name=>{const returned=(q.agendaReturns||[]).findIndex(r=>r.professional===name);if(returned>=0)q.agendaReturns.splice(returned,1);else q.agendaNextUp=name};
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
  const mode=event.mode==='agenda'?'agenda':'now',list=mode==='agenda'?agendaOrdered(q):ordered(q,false,day);if(!list.length||event.name!==list[0].name)throw Error('A passagem deve ser registrada para quem está na vez.');
  if(mode==='agenda')consumeAgenda(event.name);else q.nextUp=nextAfter(event.name);
 }else if(event.type==='attendance'){
  const p=person();if(effectiveStatus(p,day)!=='present'||ordered(q,false,day)[0]?.name!==p.name)throw Error('Registre o atendimento de quem está na vez e presente.');
  if(!cleanName(event.client))throw Error('Informe a cliente para registrar o atendimento.');
  q.counts[p.name]=(q.counts[p.name]||0)+1;q.nextUp=nextAfter(p.name);
 }else if(event.type==='remove'){
  person();const next=q.nextUp===event.name?nextAfter(event.name):q.nextUp;q.people=q.people.filter(x=>x.name!==event.name);q.nextUp=next===event.name?null:next;
 }else if(event.type==='rename'){
  const p=person(),name=cleanName(event.newName);if(!name||names.some(n=>n!==p.name&&n.toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR')))throw Error('Nome já cadastrado ou inválido.');
  q.counts[name]=q.counts[p.name]||0;delete q.counts[p.name];if(q.nextUp===p.name)q.nextUp=name;if(q.agendaNextUp===p.name)q.agendaNextUp=name;for(const r of q.agendaReturns||[])if(r.professional===p.name)r.professional=name;q.future.forEach(f=>{if(f.professional===p.name)f.professional=name});p.name=name;
 }else if(event.type==='schedule'){
  if(!cleanName(event.client)||!event.at||!Number.isFinite(Date.parse(event.at)))throw Error('Informe cliente e data válidos.');
  if(q.future.some(f=>f.id===event.id))throw Error('Reserva já cadastrada.');const professional=event.professional||agendaOrdered(q)[0]?.name;if(!names.includes(professional))throw Error('Escolha um profissional cadastrado.');if(agendaOrdered(q)[0]?.name!==professional)throw Error('Agende para o profissional que está na vez da Agenda.');
  q.future.push({id:event.id,client:cleanName(event.client),professional,service:cleanName(event.service),at:event.at,status:'scheduled',createdAt:event.createdAt,needsConference:true});consumeAgenda(professional);
 }else if(['unschedule','confirm-appointment','no-show'].includes(event.type)){
  const f=q.future.find(x=>x.id===event.id),status=event.type==='confirm-appointment'?'attended':event.type==='no-show'?'no_show':'cancelled';
  if(!f)throw Error('Agendamento inexistente.');if(f.status===status)return q;
  if(!['scheduled','pending',undefined].includes(f.status))throw Error('Agendamento já encerrado.');
  if(event.type!=='unschedule'&&(!appointmentDate(f)||appointmentDate(f)>day))throw Error('Confira o agendamento a partir da data marcada.');
  f.status=status;f.confirmedAt=event.createdAt;f.needsConference=false;
  if(status!=='attended'&&!f.turnReturned){q.agendaReturns||=[];q.agendaReturns.push({appointmentId:f.id,professional:f.professional});f.turnReturned=true;}
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
