export async function readSubmittedProfiles(req,env,user){
 if(!['admin','manager','reception','commercial'].includes(user?.role)||user.temporaryReadOnly)throw Object.assign(Error('Acesso restrito à recepção, comercial e gestão.'),{status:403});
 if(req.method!=='GET')throw Object.assign(Error('Método não permitido.'),{status:405});
 if(!env.ELAB_PROFILE_SIGNING_KEY)throw Object.assign(Error('Consulta de perfis ainda não configurada.'),{status:503});
 const url=new URL(req.url),page=Number(url.searchParams.get('page')||0),search=(url.searchParams.get('search')||'').trim();
 if(!Number.isSafeInteger(page)||page<0||page>10000||search.length>160)throw Object.assign(Error('Filtro inválido.'),{status:400});
 const body=JSON.stringify({ts:Date.now(),nonce:crypto.randomUUID(),page,search});
 const key=await crypto.subtle.importKey('jwk',JSON.parse(env.ELAB_PROFILE_SIGNING_KEY),{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(body)));
 const response=await fetch('https://yrmsnykdxxqomkvxqnki.supabase.co/functions/v1/elab-profile-read',{method:'POST',headers:{'Content-Type':'application/json',apikey:'sb_publishable_nviD65C5Y-mgrj04dwEheQ_x17AjVfL','x-elab-signature':btoa(String.fromCharCode(...signature))},body,signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Object.assign(Error('Não foi possível atualizar os perfis. Tente novamente.'),{status:503});
 const payload=await response.json();if(env.DB&&Array.isArray(payload.profiles)){const archived=(await env.DB.prepare("SELECT data FROM records WHERE kind='profile_archive'").all()).results;const ids=new Set(archived.map(r=>JSON.parse(r.data).profileId));payload.profiles=payload.profiles.filter(p=>!ids.has(p.id))}
 return new Response(JSON.stringify(payload),{headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
