// Reset an E.Lab staff password with a one-time owner-issued code; no email is needed.
import { createClient } from "npm:@supabase/supabase-js@2.76.1";
const headers={"content-type":"application/json; charset=utf-8","access-control-allow-origin":"*","access-control-allow-headers":"content-type,apikey","access-control-allow-methods":"POST,OPTIONS","cache-control":"no-store"};
const response=(status:number,data:unknown)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return response(405,{error:"Método não permitido"});
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return response(503,{error:"Recuperação indisponível"});
 let body:unknown;try{const raw=await req.text();if(raw.length>4096)return response(413,{error:"Dados excedem limite"});body=JSON.parse(raw);}catch{return response(400,{error:"Dados inválidos"});}
 if(!body||typeof body!=="object")return response(400,{error:"Dados inválidos"});
 const {username,password,code}=body as Record<string,unknown>;
 if(typeof username!=="string"||typeof password!=="string"||typeof code!=="string")return response(400,{error:"Dados inválidos"});
 const normalized=username.trim().toLocaleLowerCase("pt-BR");
 if(normalized.length<2||normalized.length>80||password.length<12||password.length>128
 ||!/^(?=.*[A-Za-zÀ-ÿ])(?=.*\d)(?=.*[^\w\s]).+$/.test(password)
 ||password.toLocaleLowerCase("pt-BR").includes(normalized.split(" ")[0])
 || !/^[a-f0-9]{64}$/i.test(code.trim()))return response(400,{error:"Nova senha ou código inválido"});
 try{
  const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(code.trim())));
  const hash=Array.from(bytes).map(x=>x.toString(16).padStart(2,"0")).join("");
  const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:claimed,error}=await db.rpc("elab_ops_claim_password_reset",{p_code_sha256:hash,p_username:normalized});
  if(error||!claimed?.userId)return response(401,{error:"Código inválido, expirado ou já utilizado"});
  const {error:updateError}=await db.auth.admin.updateUserById(claimed.userId,{password});
  if(updateError)return response(503,{error:"Não foi possível atualizar a senha. Solicite outro código."});
  return response(200,{ok:true});
 }catch{return response(503,{error:"Recuperação temporariamente indisponível"});}
});
