// Identity is verified online by Supabase Auth and its server-owned membership table.
export const HUB_PAGES_ORIGIN='https://brgxbrasil.github.io';
export const HUB_SUPABASE_URL='https://yrmsnykdxxqomkvxqnki.supabase.co';
const hubPublicKey='sb_publishable_nviD65C5Y-mgrj04dwEheQ_x17AjVfL';
const allowedHubRoles=new Set(['admin','manager','reception','commercial','controls','cleaning','professional','hr','adm','pantry','valet','maintenance']);
const authFail=(message,status)=>{throw Object.assign(Error(message),{status})};
export async function supabaseIdentity(req,fetcher=fetch){
 const authorization=req.headers.get('authorization');
 if(!/^Bearer [^\s]{1,16000}$/i.test(authorization||''))authFail('Entre com seu acesso.',401);
 let response;
 try{response=await fetcher(HUB_SUPABASE_URL+'/functions/v1/elab-hub-identity',{headers:{Authorization:authorization,apikey:hubPublicKey},signal:AbortSignal.timeout(15000)})}catch{authFail('Não foi possível validar seu acesso. Tente novamente.',503)}
 if(!response.ok)authFail(response.status===403?'Seu acesso precisa ser autorizado pela gestão.':response.status===401?'Sessão inválida. Entre novamente.':'Não foi possível validar seu acesso.',[401,403].includes(response.status)?response.status:503);
 const user=await response.json();
 if(!/^[a-f0-9-]{36}$/.test(user.id||'')||!user.email||!allowedHubRoles.has(user.role))authFail('Seu acesso precisa ser autorizado pela gestão.',403);
 return {id:'supabase:'+user.id,email:user.email,name:user.name||user.email,role:user.role,authProvider:'supabase'};
}
export async function pagesApiResponse(req,env,ctx,handler){
 const url=new URL(req.url),origin=req.headers.get('origin');
 if((!url.pathname.startsWith('/api/')&&url.pathname!=='/catalog.json')||!origin||origin===url.origin)return handler(req,env,ctx);
 const headers={'Access-Control-Allow-Origin':HUB_PAGES_ORIGIN,'Vary':'Origin','Cache-Control':'no-store'};
 if(origin!==HUB_PAGES_ORIGIN)return Response.json({error:'Origem inválida.'},{status:403});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'authorization, content-type, x-file-name','Access-Control-Max-Age':'600'}});
 if(!/^Bearer [^\s]+$/i.test(req.headers.get('authorization')||''))return Response.json({error:'Entre com seu acesso.'},{status:401,headers});
 // Downstream handlers retain their same-origin CSRF checks after this exact-origin,
 // bearer-required boundary. api() verifies every supplied bearer before dispatch.
 const trustedHeaders=new Headers(req.headers);trustedHeaders.set('origin',url.origin);
 const forwarded=new Request(req,{headers:trustedHeaders});
 const result=await handler(forwarded,env,ctx),out=new Response(result.body,result);
 for(const [key,value] of Object.entries(headers))out.headers.set(key,value);
 out.headers.delete('Set-Cookie');
 return out;
}
