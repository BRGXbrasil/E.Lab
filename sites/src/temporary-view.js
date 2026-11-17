const viewCookie = '__Host-elab-temporary-view';
const viewToken = /^[a-f0-9]{64}$/;
const temporaryReads = new Set([
  '/api/bootstrap','/api/presence','/api/avec-summary','/api/results',
  '/api/replenishment','/api/imports','/api/stock-ledger','/api/audit'
]);

export async function validateTemporaryView(token, env) {
  const until = Date.parse(env.ELAB_TEMP_VIEW_UNTIL || '');
  const hash = env.ELAB_TEMP_VIEW_SHA256 || '';
  if (!viewToken.test(token || '') || !viewToken.test(hash) || !(until > Date.now())) return null;
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
  let delta = 0;
  for (let i = 0; i < digest.length; i++) delta |= digest[i] ^ Number.parseInt(hash.slice(i*2,i*2+2),16);
  return delta === 0 ? until : null;
}

export async function exchangeTemporaryView(req, env, fail) {
  const origin = new URL(req.url).origin;
  if (req.method !== 'POST') fail('Rota não encontrada.',404);
  if (req.headers.get('origin') !== origin) fail('Origem inválida.',403);
  const reader = req.body?.getReader();
  if (!reader) fail('Link temporário inválido.',401);
  let payload = '';
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) break;
      payload += decoder.decode(value,{stream:true});
      if (payload.length > 160) {
        await reader.cancel();
        fail('Link temporário inválido.',401);
      }
    }
    payload += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let token;
  try { token = JSON.parse(payload)?.token; } catch { /* Invalid link. */ }
  const until = typeof token === 'string' && await validateTemporaryView(token,env);
  if (!until) fail('Link temporário inválido ou expirado.',401);
  const maxAge = Math.max(0,Math.floor((until-Date.now())/1000));
  return new Response('{"ok":true}',{headers:{
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Set-Cookie':viewCookie+'='+token+'; Path=/; Max-Age='+maxAge+'; HttpOnly; Secure; SameSite=Strict'
  }});
}

export async function temporaryViewIdentity(req, env, fail) {
  const token = req.headers.get('cookie')?.split(';').map(part=>part.trim()).find(part=>part.startsWith(viewCookie+'='))?.slice(viewCookie.length+1);
  if (!token || !await validateTemporaryView(token,env)) return null;
  if (req.method !== 'GET' || !temporaryReads.has(new URL(req.url).pathname)) fail('Este link permite somente consultar o painel.',403);
  const owner = await env.DB.prepare('SELECT owner_id FROM workspace WHERE id=1').first();
  if (!owner?.owner_id) fail('O painel ainda não tem uma conta proprietária configurada.',403);
  return {id:owner.owner_id,name:'Consulta temporária',role:'admin',temporaryReadOnly:true};
}
