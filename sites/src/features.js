import {APPROVED_STAFF,STAFF_WORKDAYS,applyPresenceAction,shouldAlert} from './presence.js';
import {businessDate,queueEvent,effectiveStatus,isOperationalName,isOperationalStaff} from './core.js';
export async function seedStaff(db,save){
 const existing=new Set((await db.prepare("SELECT id FROM records WHERE kind='staff'").all()).results.map(r=>r.id));for(const staff of APPROVED_STAFF){if(!existing.has('staff/'+staff.id)){try{await save(db,{email:'Escala aprovada · 09/11/2026'},'staff/'+staff.id,'staff',staff,0,'staff.approved')}catch(e){if(e.status!==409)throw e}}}
}
export function projectPresenceQueue(original,events,staff,today){
 let q=structuredClone(original);const names=new Map(staff.map(s=>[s.id,s.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()]));
 const cursor=q.presenceCursor?.day===today?q.presenceCursor:{at:'',id:''};const newer=(a,b)=>a.at>b.at||(a.at===b.at&&a.id>b.id);
 for(const r of [...events].sort((a,b)=>a.data.at<b.data.at?-1:a.data.at>b.data.at?1:a.id<b.id?-1:a.id>b.id?1:0)){const v=r.data,key={at:v.at,id:r.id};if(v.date!==today||!newer(key,cursor))continue;
 const name=names.get(v.staffId),p=q.people.find(p=>p.name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()===name);
 if(p){if(['absent','dayoff','leave'].includes(v.type)){q=queueEvent(q,{type:'status',name:p.name,status:'absent',day:today});q.people.find(x=>x.name===p.name).presenceManagedAbsence=true}
 if(v.type==='present'&&(['unconfirmed','absent'].includes(effectiveStatus(p,today)))){q=queueEvent(q,{type:'status',name:p.name,status:'present',day:today});q.people.find(x=>x.name===p.name).presenceManagedAbsence=false}}
 q.presenceCursor={...key,day:today};
 }return q;
}
export function enforceQueuePresence(original,staff,shifts,today) {
 let q=structuredClone(original);
 const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const members=new Map(staff.map(s=>[norm(s.name),s]));
 for (const person of q.people) {
   const member=members.get(norm(person.name));
   person.operational=isOperationalName(person.name)&&(!staff.length||Boolean(member&&isOperationalStaff(member)));
 }
 for (const person of [...q.people]) {
   if (!person.operational) continue;
   const member=members.get(norm(person.name));
   if (!member) continue;
   const shift=shifts.find(s=>s.staffId===member.id&&s.date===today);
   if (shift?.enabled&&shift.status==='present') continue;
   if (['present','occupied'].includes(effectiveStatus(person,today))) {
     q=queueEvent(q,{type:'status',name:person.name,status:'absent',day:today});
   }
   const entry=q.people.find(p=>p.name===person.name);
   if (shift&&['absent','dayoff','leave'].includes(shift.status)) {
     entry.status='absent';entry.presenceDate=today;entry.presenceManagedAbsence=true;
   } else {
     entry.status='unconfirmed';entry.presenceDate='';
   }
 }
 return q;
}
function scheduledWorkday(date) {
 return STAFF_WORKDAYS.includes(new Date(date+'T12:00:00Z').getUTCDay());
}
export function defaultShift(staff,date) {
 const enabled=scheduledWorkday(date);
 return {id:'shift/'+date+'/'+staff.id,revision:0,data:{staffId:staff.id,date,start:staff.start,toleranceMinutes:60,enabled,status:enabled?'pending':'dayoff'}};
}
export async function presenceRoutes(req,env,user,helpers){const {read,save,fail,json}=helpers,db=env.DB,url=new URL(req.url),path=url.pathname;if(!['/api/presence','/api/schedules'].includes(path))return null;
 const operate=!user.temporaryReadOnly&&['admin','manager','reception'].includes(user.role),manage=['admin','manager'].includes(user.role);
 if(!user.temporaryReadOnly)await seedStaff(db,save);
 const staffRecords=(await db.prepare("SELECT * FROM records WHERE kind='staff' ORDER BY id").all()).results.map(r=>({id:r.id,revision:r.revision,data:JSON.parse(r.data)}));
 const staff=staffRecords.map(r=>({...r.data,days:[...STAFF_WORKDAYS],revision:r.revision}));
 if(req.method==='GET'&&path==='/api/presence'){
  const date=url.searchParams.get('date')||businessDate();if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('Data inválida.');
  const shifts=(await db.prepare("SELECT * FROM records WHERE kind='shift' ORDER BY id").all()).results.map(r=>({id:r.id,revision:r.revision,data:JSON.parse(r.data)})).filter(r=>r.data.date===date);
  if(date>=businessDate())for(const member of staff.filter(s=>s.active)){
   if(!shifts.some(r=>r.data.staffId===member.id))shifts.push(defaultShift(member,date));
  }
  const events=(await db.prepare("SELECT * FROM records WHERE kind IN ('attendance_event','schedule_event') ORDER BY updated_at DESC").all()).results.map(r=>({id:r.id,data:JSON.parse(r.data)}));
  if(!operate){for(const r of shifts)r.data=Object.fromEntries(['staffId','date','start','toleranceMinutes','enabled','status','checkedInAt','absenceAt','remindAt'].filter(k=>r.data[k]!==undefined).map(k=>[k,r.data[k]]));for(const r of events)r.data=Object.fromEntries(['staffId','date','type','at','fromStatus','toStatus'].filter(k=>r.data[k]!==undefined).map(k=>[k,r.data[k]]));}
  const now=new Date().toISOString();return json({staff,shifts,events:events.filter(r=>r.data.date===date),alerts:operate?shifts.filter(r=>shouldAlert(r.data,now)).map(r=>r.id):[],today:businessDate(),serverTime:now,operate,manage});
 }
 if(req.method!=='POST')fail('Rota não encontrada.',404);if(!operate)fail('Apenas recepção e gestão podem registrar a equipe.',403);if(req.headers.get('origin')!==url.origin)fail('Origem inválida.',403);const raw=await req.text();if(raw.length>100000)fail('Solicitação muito grande.',413);let body;try{body=JSON.parse(raw)}catch{fail('JSON inválido.')}if(!body||typeof body!=='object'||Array.isArray(body))fail('Solicitação inválida.');
 if(path==='/api/schedules'){
  if(body.action==='shift'){if(typeof body.id!=='string')fail('Escala inválida.');const old=await read(db,body.id);if(!old||old.kind!=='shift')fail('Escala não encontrada.');if(['present','absent'].includes(old.data.status))fail('A presença já foi registrada; use a correção de presença.');if(!['pending','dayoff','leave'].includes(body.status)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.start||''))fail('Horário ou situação inválidos.');if(typeof body.reason!=='string'||body.reason.trim().length<3)fail('Informe o motivo da alteração.');const data={...old.data,start:body.start,status:body.status,enabled:body.status==='pending',toleranceMinutes:60};return json({record:await save(db,user,old.id,'shift',data,body.revision,'schedule.corrected',{id:'schedule-event/'+crypto.randomUUID(),kind:'schedule_event',data:{staffId:data.staffId,date:data.date,type:body.status==='pending'?'scheduled':body.status,at:new Date().toISOString(),actor:user.email,reason:body.reason.trim().slice(0,1000)}})})}
  if(body.action==='staff'){if(!manage)fail('Apenas gestão altera a escala padrão.',403);const old=await read(db,'staff/'+body.staffId);if(!old)fail('Profissional não encontrado.');if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(body.start||''))fail('Horário inválido.');return json({record:await save(db,user,old.id,'staff',{...old.data,start:body.start,days:[...STAFF_WORKDAYS],active:body.active!==false,toleranceMinutes:60},body.revision,'schedule.changed')})}
  if(body.action!=='confirm-day')fail('Ação inválida.');const date=body.date;if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)fail('Data inválida.');if(!Array.isArray(body.staffIds)||body.staffIds.some(id=>!staff.find(s=>s.id===id&&s.active)))fail('Equipe inválida.');
  const created=[];for(const s of staff.filter(s=>s.active)){const id='shift/'+date+'/'+s.id;if(await read(db,id))continue;const enabled=body.staffIds.includes(s.id),at=new Date().toISOString(),data={staffId:s.id,date,start:s.start,toleranceMinutes:60,enabled,status:enabled?'pending':'dayoff'};try{created.push(await save(db,user,id,'shift',data,0,'schedule.confirmed',{id:'attendance-event/schedule/'+date+'/'+s.id,kind:'schedule_event',data:{staffId:s.id,date,type:enabled?'scheduled':'dayoff',toStatus:data.status,at,actor:user.email}}))}catch(e){if(e.status!==409)throw e}}
  return json({created:created.length});
 }
 if(typeof body.id!=='string')fail('Escala inválida.');let old=await read(db,body.id);
 if(!old){
  const member=staff.find(s=>s.active&&body.id==='shift/'+businessDate()+'/'+s.id);
  if(member)old={...defaultShift(member,businessDate()),kind:'shift'};
 }
 if(!old||old.kind!=='shift')fail('Escala não encontrada.',404);const operationId=typeof body.operationId==='string'&&/^[\w-]{1,100}$/.test(body.operationId)?body.operationId:crypto.randomUUID(),eventId='attendance-event/'+operationId,previous=await read(db,eventId);
 if(previous){if(previous.data.actor!==user.email||previous.data.shiftId!==old.id||JSON.stringify(previous.data.request)!==JSON.stringify(body.action))fail('Identificador de operação em uso.',409);return json({replayed:true,record:old})}
 if(old.revision!==body.revision)fail('Presença atualizada em outro aparelho. Atualize e tente novamente.',409);
 let result;try{result=applyPresenceAction(old.data,body.action,{at:new Date().toISOString(),actor:user.email})}catch(e){fail(e.message)}
 if(!result.changed)return json({record:old,unchanged:true});const event={...result.event,shiftId:old.id,request:body.action};return json({record:await save(db,user,old.id,'shift',result.shift,body.revision,'presence.'+body.action.type,{id:eventId,kind:'attendance_event',data:event})});
}
