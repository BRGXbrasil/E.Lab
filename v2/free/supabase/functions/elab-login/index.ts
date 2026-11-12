// E.Lab name-based login. The privileged key is used only on the server to resolve a verified alias.
// The original Supabase Auth password remains unchanged and is never stored here.
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
const common={ "content-type":"application/json; charset=utf-8", "cache-control":"no-store", "access-control-allow-origin":"*", "access-control-allow-headers":"content-type,apikey", "access-control-allow-methods":"POST,OPTIONS" };
const reply=(status:number,payload:unknown)=>new Response(JSON.stringify(payload),{status,headers:common});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:common});
 if(req.method!=="POST")return reply(405,{error:"Método não permitido"});
 const url=Deno.env.get("SUPABASE_URL"),publicKey=Deno.env.get("SUPABASE_ANON_KEY"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!publicKey||!serviceKey)return reply(503,{error:"Login indisponível"});
 let input:unknown;
 try {const body=await req.text();if(body.length>2048)return reply(413,{error:"Dados excedem limite"});input=JSON.parse(body);}catch{return reply(400,{error:"Dados inválidos"});}
 if(!input||typeof input!=="object")return reply(400,{error:"Dados inválidos"});
 const {username,password}=input as Record<string,unknown>;
 if(typeof username!=="string"||typeof password!=="string"||username.length>80||password.length>200||password.length<1)
 return reply(400,{error:"Dados inválidos"});
 const normalized=username.trim().toLocaleLowerCase("pt-BR");
 const reject=()=>reply(401,{error:"Usuário ou senha inválidos"});
 try{
  const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:alias,error:aliasError}=await admin.from("elab_ops_usernames")
    .select("user_id").eq("username",normalized).eq("active",true).maybeSingle();
  if(aliasError||!alias?.user_id)return reject();
  const {data:user,error:userError}=await admin.auth.admin.getUserById(alias.user_id);
  if(userError||!user?.user?.email||!user.user.email_confirmed_at)return reject();
  const auth=createClient(url,publicKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await auth.auth.signInWithPassword({email:user.user.email,password});
  if(error||!data.session||data.user.id!==alias.user_id)return reject();
  return reply(200,{access_token:data.session.access_token,refresh_token:data.session.refresh_token});
 }catch{return reply(503,{error:"Login temporariamente indisponível"});}
});
