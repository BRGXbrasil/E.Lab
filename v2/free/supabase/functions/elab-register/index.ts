// Registration for pre-approved E.Lab names only; no email required from employee.
// Must present an owner-issued one-time invite. Never expose service role to browser.
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
const headers={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-headers":"content-type,apikey","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const response=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return response(405,{error:"Método não permitido"});
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return response(503,{error:"Cadastro indisponível"});
 let data:unknown;
 try{const raw=await req.text();if(raw.length>4096)return response(413,{error:"Dados excedem limite"});data=JSON.parse(raw);}catch{return response(400,{error:"Dados inválidos"});}
 if(!data||typeof data!=="object")return response(400,{error:"Dados inválidos"});
 const {username,password,inviteCode}=data as Record<string,unknown>;
 if(typeof username!=="string"||typeof password!=="string"||typeof inviteCode!=="string")return response(400,{error:"Dados inválidos"});
 const name=username.trim().toLocaleLowerCase("pt-BR");
 if(name.length<2||name.length>80||password.length<12||password.length>128||
    !/^(?=.*[A-Za-zÀ-ÿ])(?=.*\d)(?=.*[^\w\s]).+$/.test(password)||
    password.toLocaleLowerCase("pt-BR").includes(name.split(" ")[0])||
    !/^[a-f0-9]{64}$/i.test(inviteCode.trim()))return response(400,{error:"Use uma senha forte e um código de convite válido."});
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const hash=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(inviteCode.trim())));
  const digest=Array.from(hash).map(x=>x.toString(16).padStart(2,"0")).join("");
  const {data:invite,error:inviteError}=await db.from("elab_ops_registration_invites")
   .select("username").eq("username",name).eq("code_sha256",digest).is("consumed_at",null)
   .gt("expires_at",new Date().toISOString()).maybeSingle();
  if(inviteError||!invite)return response(401,{error:"Convite inválido ou expirado."});
  const {data:alias,error:aliasError}=await db.from("elab_ops_usernames")
   .select("staff_id,user_id,active").eq("username",name).maybeSingle();
  if(aliasError||!alias?.staff_id||alias.user_id||alias.active)return response(409,{error:"Este usuário já tem cadastro."});
  // An internal, non-deliverable identifier is used only by Supabase Auth.
  // Password recovery for these employees must be managed by the owner.
  const internalEmail="staff-"+crypto.randomUUID()+"@accounts.elab.invalid";
  const {data:created,error:createError}=await db.auth.admin.createUser({
   email:internalEmail,password,email_confirm:true,user_metadata:{elab_username:name}
  });
  if(createError||!created?.user?.id)return response(503,{error:"Não foi possível criar a conta."});
  const userId=created.user.id;
  const {data:linked,error:linkError}=await db.rpc("elab_ops_claim_staff_invite",{
   p_code_sha256:digest,p_user_id:userId
  });
  if(linkError||!linked?.ok){
   await db.auth.admin.deleteUser(userId);
   return response(409,{error:"Convite utilizado ou cadastro não autorizado."});
  }
  return response(201,{ok:true,username:name,role:linked.role});
 }catch{return response(503,{error:"Cadastro temporariamente indisponível"});}
});
