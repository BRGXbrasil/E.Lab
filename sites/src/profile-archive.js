import {readSubmittedProfiles} from './profile-bridge.js';
const deny=(message,status=400)=>{throw Object.assign(Error(message),{status})};
export async function archiveProfileTests(req,env,user,{read,save},fetchProfiles=readSubmittedProfiles){
 if(!['admin','manager'].includes(user?.role)||user.temporaryReadOnly)deny('Somente a gestão pode remover perfis.',403);
 if(req.method!=='POST'||req.headers.get('origin')!==new URL(req.url).origin)deny('Origem ou método inválido.',403);
 const raw=await req.text();if(raw.length>20000)deny('Pedido muito grande.');let body;try{body=JSON.parse(raw)}catch{deny('Pedido inválido.')}
 if(!Array.isArray(body.targets)||!body.targets.length||body.targets.length>20||typeof body.reason!=='string'||body.reason.trim().length<10)deny('Identifique os registros e o motivo.');
 const targets=body.targets;if(targets.some(t=>!t||typeof t.id!=='string'||!/^[-a-zA-Z0-9]{1,100}$/.test(t.id)||typeof t.createdAt!=='string'||typeof t.name!=='string'))deny('Referência de perfil inválida.');
 if(!env.BUCKET)deny('Cópia de segurança indisponível.',503);
 const result=[];
 for(const target of targets){
  const key='profile-archive/'+target.id,old=await read(env.DB,key);if(old){result.push({id:target.id,archived:true,replayed:true});continue}
  const response=await fetchProfiles(new Request(new URL('/api/client-profiles?search='+encodeURIComponent(target.name),req.url)),env,user);
  const payload=await response.json(),profiles=payload.profiles||[];
  const found=profiles.find(p=>p.id===target.id);
  if(!found||found.created_at!==target.createdAt||found.submission?.answers?.name!==target.name)deny('O registro mudou ou não foi localizado. Confira antes de remover.',409);
  const backupKey='private-profile-archives/'+target.id+'/'+crypto.randomUUID()+'.json';await env.BUCKET.put(backupKey,JSON.stringify(found),{httpMetadata:{contentType:'application/json'}});
  await save(env.DB,user,key,'profile_archive',{profileId:target.id,sourceCreatedAt:target.createdAt,reason:body.reason.trim(),backupKey,archivedAt:new Date().toISOString(),archivedBy:user.email},0,'profile.archived');
  result.push({id:target.id,archived:true});
 }
 return Response.json({archived:result},{headers:{'Cache-Control':'no-store'}});
}
