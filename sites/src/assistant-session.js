// Private assistant scope is independent from shared operational authorization.
// Only server-issued random bearer tokens are accepted; no client scope parameter.
const cookieName='__Host-elab-assistant';
const lifetime=30*24*60*60;
async function sessionId(token){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));return 'assistant-session/'+Array.from(new Uint8Array(hash),n=>n.toString(16).padStart(2,'0')).join('')}
export async function assistantSession(req,db,user){
 const authenticated=req.headers.get('oai-authenticated-user-id');
 if(authenticated&&!user.temporaryReadOnly)return {identity:'user:'+authenticated};
 const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1);
 if(/^[a-f0-9]{64}$/.test(token||'')){
  const row=await db.prepare("SELECT data FROM records WHERE id=? AND kind='assistant_session'").bind(await sessionId(token)).first();
  if(row){const session=JSON.parse(row.data);if(session.expiresAt>Date.now())return {identity:'browser:'+session.scope};}
 }
 const next=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),scope=crypto.randomUUID(),at=new Date().toISOString();
 await db.prepare("INSERT INTO records(id,kind,data,revision,updated_at,updated_by) VALUES(?,'assistant_session',?,1,?,'assistant-session')").bind(await sessionId(next),JSON.stringify({scope,expiresAt:Date.now()+lifetime*1000}),at).run();
 return {identity:'browser:'+scope,cookie:cookieName+'='+next+'; Path=/; Max-Age='+lifetime+'; HttpOnly; Secure; SameSite=Strict'};
}
