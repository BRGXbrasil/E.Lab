import { createClient } from 'npm:@supabase/supabase-js@2.76.1';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
Deno.serve(async(req:Request)=>{
 if(req.method!=='GET')return json({error:'Método não permitido.'},405);
 const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!token)return json({error:'Entre com seu acesso.'},401);
 const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_ANON_KEY')!,secret=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 try{
  const auth=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:{user},error}=await auth.auth.getUser(token);
  if(error||!user||user.is_anonymous||!user.email||!user.email_confirmed_at)return json({error:'Sessão inválida. Entre novamente.'},401);
  const admin=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:member,error:memberError}=await admin.from('elab_ops_members').select('role,active').eq('user_id',user.id).maybeSingle();
  if(memberError)return json({error:'Não foi possível validar seu acesso.'},503);
  if(!member?.active)return json({error:'Seu acesso precisa ser autorizado pela gestão.'},403);
  const {data:staff}=await admin.from('elab_ops_staff_directory').select('display_name').eq('user_id',user.id).limit(1).maybeSingle();
  return json({id:user.id,email:user.email.toLowerCase(),name:staff?.display_name||user.email,role:member.role});
 }catch{return json({error:'Login temporariamente indisponível.'},503)}
});
