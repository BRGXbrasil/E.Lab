import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {mondayWebhook,mondayMcpTools} from '../src/monday-webhook.js';
const now=1784670000000,secret='local-test-only',versionEnv={ELAB_MONDAY_SIGNING_SECRET:secret,ELAB_MONDAY_AGENT_ID:'705243'};
const event={event:'agent_triggered',triggerType:'chat',stream:false,payload:{text:'Olá'},timestamp:'2026-07-21T21:40:00Z'};
const request=(body=JSON.stringify(event),ts=now,signed=body,id='705243')=>new Request('https://elab.test/api/monday/webhook',{method:'POST',headers:{'content-type':'application/json','x-monday-timestamp':String(ts),'x-monday-agent-id':id,'x-monday-signature':'sha256='+createHmac('sha256',secret).update(ts+'.'+signed).digest('hex')},body});
const options={now,claim:async()=>true};
test('accepts the exact raw publicly signed body and returns JSON or SSE',async()=>{
 let r=await mondayWebhook(request(),versionEnv,options);
 assert.equal(r.status,200);assert.ok((await r.json()).message);
 r=await mondayWebhook(request(JSON.stringify({...event,stream:true},null,2)),versionEnv,options);
 assert.match(r.headers.get('content-type'),/text\/event-stream/);
 assert.match(await r.text(),/data: \[DONE\]/);
});
test('rejects modified bytes, old timestamps, wrong agent and missing secret',async()=>{
 const original=JSON.stringify(event);
 for(const req of [request(original+' ',now,original),request(original,now-301000),request(original,now,original,'9')])assert.equal((await mondayWebhook(req,versionEnv,options)).status,401);
 assert.equal((await mondayWebhook(request(),{},options)).status,503);
});
test('background response acknowledges first and uses an opaque conversation as a variable',async()=>{
 const jobs=[],out=[];
 const req=request(JSON.stringify({...event,payload:{text:'Olá',conversationId:'opaque"reply'}}));
 const result=await mondayWebhook(req,{...versionEnv,ELAB_MONDAY_AGENT_TOKEN:'fixture'},{
  ...options,waitUntil:p=>jobs.push(p),fetcher:async(url,init)=>{out.push({url,payload:JSON.parse(init.body)});return Response.json({data:{send_custom_agent_message:{delivered:true}}})}
 });
 assert.equal((await result.json()).ack,true);await Promise.all(jobs);
 assert.equal(out[0].payload.variables.input.conversation_id,'opaque"reply');
 assert.doesNotMatch(out[0].payload.query,/opaque/);
});
test('repeated requests are acknowledged without a second deferred reply',async()=>{
 const jobs=[];
 const r=await mondayWebhook(request(JSON.stringify({...event,payload:{text:'Olá',conversationId:'opaque'}})),{...versionEnv,ELAB_MONDAY_AGENT_TOKEN:'fixture'},{...options,claim:async()=>false,waitUntil:p=>jobs.push(p)});
 assert.equal(r.status,200);assert.equal(jobs.length,0);
});

test('MCP uses Streamable HTTP, honors session headers, and reads tool discovery',async()=>{
 const calls=[];
 const fetcher=async(url,init)=>{
  calls.push({url,...init});
  if(init.method==='DELETE')return new Response(null,{status:204});
  const p=JSON.parse(init.body);
  if(p.method==='initialize')return Response.json({jsonrpc:'2.0',id:1,result:{protocolVersion:'2025-03-26'}},{headers:{'mcp-session-id':'fixture-session'}});
  if(p.method==='notifications/initialized')return new Response(null,{status:202});
  assert.equal(p.method,'tools/list');
  return new Response('data: '+JSON.stringify({jsonrpc:'2.0',id:2,result:{tools:[{name:'get_board_info'}]}})+String.fromCharCode(10,10),{headers:{'content-type':'text/event-stream'}});
 };
 assert.deepEqual(await mondayMcpTools('fixture-only',fetcher),['get_board_info']);
 assert.equal(calls[2].headers['Mcp-Session-Id'],'fixture-session');
 assert.ok(calls.every(c=>c.url==='https://mcp.monday.com/mcp'));
});
