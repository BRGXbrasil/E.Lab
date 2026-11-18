const webhookBoard='18416621523';
const webhookBoardUrl='https://brgxbrasil.monday.com/boards/'+webhookBoard;
const encoder=new TextEncoder();
const maxBody=1024*1024;
const webhookJson=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const webhookSse=text=>new Response((text?'data: '+JSON.stringify({type:'text',content:text})+'\n\n':'')+'data: [DONE]\n\n',{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validId=value=>typeof value==='number'&&Number.isSafeInteger(value)&&value>0||typeof value==='string'&&/^[1-9]\d{0,18}$/.test(value);
async function boundedBody(request){
 const reader=request.body?.getReader();
 if(!reader)return new Uint8Array();
 const parts=[];let size=0;
 try{
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>maxBody){await reader.cancel();return null}parts.push(value)}
 }finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;
 for(const part of parts){bytes.set(part,offset);offset+=part.byteLength}
 return bytes;
}
function parseWebhookEvent(raw){
 try{
  const b=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
  if(!b||b.event!=='agent_triggered'||typeof b.triggerType!=='string'||typeof b.timestamp!=='string'||!Number.isFinite(Date.parse(b.timestamp))||!b.payload||typeof b.payload.text!=='string')return null;
  const type=({mentioned:'mention',assign:'assigned'})[b.triggerType]||b.triggerType;
  if(!['chat','mention','assigned'].includes(type))return null;
  const p=b.payload,conversation=type==='chat'&&typeof p.conversationId==='string'&&p.conversationId.length<=4096?p.conversationId:null;
  return {type,stream:b.stream!==false,conversation,boardId:validId(p.boardId)?String(p.boardId):null,itemId:validId(p.itemId)?String(p.itemId):null,updateId:validId(p.updateId)?String(p.updateId):null,text:(type==='mention'&&typeof p.updateBody==='string'?p.updateBody:p.text).trim().slice(0,1500),attachmentCount:Array.isArray(p.attachments)?p.attachments.length:0};
 }catch{return null}
}
async function verifiedSignature(secret,stamp,raw,signature){
 const prefix=encoder.encode(stamp+'.'),input=new Uint8Array(prefix.length+raw.length);
 input.set(prefix);input.set(raw,prefix.length);
 const mac=Uint8Array.from(signature.slice(7).match(/../g),x=>parseInt(x,16));
 const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
 return crypto.subtle.verify('HMAC',key,mac,input);
}
async function mondayAgentGraphql(token,query,variables,fetcher){
 const res=await fetcher('https://api.monday.com/v2',{method:'POST',headers:{Authorization:token,'API-Version':'dev','Content-Type':'application/json'},body:JSON.stringify({query,variables}),signal:AbortSignal.timeout(10000)});
 if(!res.ok)throw Error('Monday agent GraphQL unavailable');
 const p=await res.json();if(p.errors?.length||!p.data)throw Error('Monday rejected the agent request');
 return p.data;
}
async function mcpResult(response,id){
 if(!response.ok)throw Error('Monday MCP returned HTTP '+response.status);
 const type=response.headers.get('content-type')||'';
 let payload;
 if(type.includes('text/event-stream')){
  const reader=response.body.getReader(),decoder=new TextDecoder();let buf='',bytes=0;
  try{
   while(!payload){
    const {done,value}=await reader.read();if(done)break;
    bytes+=value.byteLength;if(bytes>maxBody)throw Error('Monday MCP response too large');
    buf+=decoder.decode(value,{stream:true});
    while(true){const sep=/\r?\n\r?\n/.exec(buf);if(!sep)break;
     const event=buf.slice(0,sep.index);buf=buf.slice(sep.index+sep[0].length);
     const value=event.split(/\r?\n/).filter(l=>l.startsWith('data:')).map(l=>l.slice(5).trimStart()).join('\n');
     if(value)try{const p=JSON.parse(value);if(p.id===id){payload=p;break}}catch{}
    }
   }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock()}
 }else payload=await response.json();
 if(!payload||payload.id!==id||payload.error||!payload.result)throw Error('Monday MCP response not confirmed');
 return payload.result;
}
export async function mondayMcpTools(token,fetcher=fetch){
 const endpoint='https://mcp.monday.com/mcp';
 const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json',Accept:'application/json, text/event-stream'};
 const signal=AbortSignal.timeout(9000);
 const send=(method,id,params)=>fetcher(endpoint,{method:'POST',headers:{...headers},body:JSON.stringify({jsonrpc:'2.0',method,...(id===undefined?{}:{id}),...(params===undefined?{}:{params})}),signal});
 const init=await send('initialize',1,{protocolVersion:'2025-03-26',capabilities:{},clientInfo:{name:'elab-hub',version:'1.0.0'}});
 const data=await mcpResult(init,1);
 if(!['2025-03-26','2025-06-18','2025-11-25'].includes(data.protocolVersion))throw Error('Unsupported MCP protocol');
 headers['MCP-Protocol-Version']=data.protocolVersion;
 const session=init.headers.get('mcp-session-id');if(session)headers['Mcp-Session-Id']=session;
 try{
  const ack=await send('notifications/initialized');
  if(!ack.ok)throw Error('MCP initialization not acknowledged');
  const list=await mcpResult(await send('tools/list',2),2);
  if(!Array.isArray(list.tools))throw Error('Monday MCP tool list missing');
  return list.tools.map(t=>t.name).filter(x=>typeof x==='string');
 }finally{
  if(session)try{const end=await fetcher(endpoint,{method:'DELETE',headers:{...headers},signal});await end.body?.cancel()}catch{}
 }
}
async function agentReply(event,env,fetcher){
 const question=event.text.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
 if(/\b(verificar|testar|status)\b.{0,30}\bmcp\b|\bmcp\b.{0,30}\b(conectado|conexao|funciona)\b/.test(question)){
  try{const tools=await mondayMcpTools(env.ELAB_MONDAY_MCP_TOKEN||env.ELAB_MONDAY_AGENT_TOKEN,fetcher);
   return tools.length?'A conexão com o MCP do Monday respondeu e disponibilizou ferramentas. Nenhum item foi alterado.':'O servidor MCP respondeu, mas não disponibilizou ferramentas para esta credencial.';
  }catch{return 'Não foi possível confirmar a conexão com o MCP do Monday. Verifique as permissões da credencial do agente.'}
 }
 const suffix=event.attachmentCount?' Os anexos não foram abertos.':'';
 return 'Sou o agente do E.Lab. O quadro compartilhado está em '+webhookBoardUrl+'. Para consultar procedimentos ou registrar rotinas, use o Assistente no Hub.'+suffix;
}
async function deliverWebhook(event,env,fetcher){
 const token=env.ELAB_MONDAY_AGENT_TOKEN;
 if(event.type==='chat'){
  const message=await agentReply(event,env,fetcher);
  const data=await mondayAgentGraphql(token,'mutation ($input: SendCustomAgentMessageInput!) { send_custom_agent_message(input:$input) { delivered } }',{input:{conversation_id:event.conversation,message}},fetcher);
  if(data.send_custom_agent_message?.delivered!==true)throw Error('Monday chat reply not confirmed');
  return;
 }
 if(event.boardId!==webhookBoard||!event.itemId||event.type==='mention'&&!event.updateId)return;
 const verified=await mondayAgentGraphql(token,'query ($ids:[ID!]!) { items(ids:$ids) { id board { id } } }',{ids:[event.itemId]},fetcher);
 if(!verified.items?.some(i=>i.id===event.itemId&&i.board?.id===webhookBoard))return;
 const body=await agentReply(event,env,fetcher);
 const out=await mondayAgentGraphql(token,'mutation ($item:ID!, $body:String!, $parent:ID) { create_update(item_id:$item,body:$body,parent_id:$parent) { id } }',{item:event.itemId,body,parent:event.updateId||null},fetcher);
 if(!out.create_update?.id)throw Error('Monday item reply not confirmed');
}
export async function mondayWebhook(request,env,{now=Date.now(),claim,waitUntil,fetcher=fetch}={}){
 if(request.method!=='POST')return new Response(null,{status:405,headers:{Allow:'POST','Cache-Control':'no-store'}});
 const secret=env.ELAB_MONDAY_SIGNING_SECRET,expectedId=env.ELAB_MONDAY_AGENT_ID;
 if(!secret||!expectedId||!claim)return webhookJson({error:'Webhook do Monday ainda não configurado.'},503);
 const id=request.headers.get('x-monday-agent-id'),stamp=request.headers.get('x-monday-timestamp'),signature=request.headers.get('x-monday-signature');
 if(id!==expectedId||!/^\d{13}$/.test(stamp||'')||Math.abs(now-Number(stamp))>300000||!/^sha256=[\da-fA-F]{64}$/.test(signature||''))return webhookJson({error:'Assinatura inválida.'},401);
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return webhookJson({error:'Envie application/json.'},415);
 if(Number(request.headers.get('content-length'))>maxBody)return webhookJson({error:'Payload acima do limite.'},413);
 const raw=await boundedBody(request);
 if(!raw)return webhookJson({error:'Payload acima do limite.'},413);
 if(!await verifiedSignature(secret,stamp,raw,signature))return webhookJson({error:'Assinatura inválida.'},401);
 const event=parseWebhookEvent(raw);
 if(!event)return webhookJson({error:'Evento inválido.'},400);
 const ack=()=>event.stream?webhookSse():webhookJson({success:true,ack:true});
 if(event.boardId&&event.boardId!==webhookBoard)return ack();
 const token=env.ELAB_MONDAY_AGENT_TOKEN,deferred=!!(token&&waitUntil&&(event.conversation||event.type!=='chat'&&event.itemId));
 if(deferred){
  if(!await claim(signature.toLowerCase()))return ack();
  waitUntil(deliverWebhook(event,env,fetcher).catch(()=>console.error('Deferred Monday agent response failed')));
  return ack();
 }
 if(event.type!=='chat')return ack();
 const message=token?await agentReply(event,env,fetcher):'Recebi sua mensagem. O agente ainda precisa ser conectado ao quadro E.Lab.';
 return event.stream?webhookSse(message):webhookJson({success:true,message});
}
