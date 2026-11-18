import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import worker from '../dist/server/index.js';
import {routineTargets,completionStatement,publicTopic,mondayProjection,handlePanelAssistant,panelBoard,completeMonday} from '../src/panel-assistant.js';

const sample=(id,area,schedule='daily')=>({id,area,schedule,active:true,title:id});
test('routine candidates are scheduled, not paused, limited to authorized sector and use canonical slot IDs',()=>{
 const tasks=[sample('caixa','reception'),sample('espelho','cleaning'),sample('pausa','reception','demand'),sample('semanal','reception','three')];
 assert.deepEqual(routineTargets(tasks,'reception','all','2026-11-17').map(x=>x.id),['run/caixa/2026-11-17','run/semanal/2026-11-16/1','run/semanal/2026-11-16/2','run/semanal/2026-11-16/3']);
 assert.deepEqual(routineTargets(tasks,'reception','cleaning','2026-11-17'),[]);
});
test('only an affirmative report can change state, and a web payload contains no user text',()=>{
 for(const s of ['Como fechei o caixa?','Não fechei o caixa','Fechei o caixa, mas falta conferir','Fechei o caixa ontem','Se eu fechei','Faça a rotina de caixa'])assert.equal(completionStatement(s),false,s);
 assert.equal(completionStatement('Fechei o caixa de hoje.'),true);
 assert.equal(publicTopic('Como reduzir faltas de cliente Maria Silva, tel. 11987654739?'),'boas práticas para reduzir faltas e confirmar agendamentos em salão de beleza');
});
test('Monday maps just the shared columns, never notes and arbitrary links',()=>{
 const item=mondayProjection({id:'42',name:'Revisão',url:'javascript:bad',column_values:[{id:'color_mm425qpw',text:'A fazer'},{id:'long_text_mm42fdrw',text:'privado'}]});
 assert.equal(item.status,'A fazer');assert.equal(item.url,'https://brgxbrasil.monday.com/boards/18416621523/pulses/42');
 assert.doesNotMatch(JSON.stringify(item),/privado|javascript/);
});
function db(){
 const sql=new DatabaseSync(':memory:');
 sql.exec(fs.readFileSync('drizzle/0000_operations.sql','utf8'));
 sql.exec("INSERT INTO workspace(id,owner_id) VALUES(1,'owner');INSERT INTO members(email,user_id,name,role,active) VALUES('recepcao@example.com','desk','Recepção','reception',1)");
 return {sql,prepare(s){let a=[];return {bind(...x){a=x;return this},async first(){return sql.prepare(s).get(...a)||null},async all(){return {results:sql.prepare(s).all(...a)}},async run(){return {meta:{changes:Number(sql.prepare(s).run(...a).changes)}}}}},async batch(xs){sql.exec('BEGIN');try{const out=[];for(const x of xs)out.push(await x.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}};
}
function send(DB,path,body,who){
 const headers=who?{'oai-authenticated-user-id':who==='desk'?'desk':'outsider','oai-authenticated-user-email':who==='desk'?'recepcao@example.com':'outsider@example.com'}:{};
 if(body)Object.assign(headers,{origin:'https://elab.test','content-type':'application/json'});
 return worker.fetch(new Request('https://elab.test'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),{DB,ELAB_TEST_ACCESS:'enabled'});
}
test('anonymous test assistance reads privately but cannot write Monday',async()=>{
 const DB=db();
 assert.equal((await send(DB,'/api/panel-assistant',{message:'Fechei o caixa'})).status,200);assert.equal((await send(DB,'/api/panel-monday',{action:'confirm-complete',itemId:'42'})).status,403);
 assert.equal((await send(DB,'/api/panel-monday')).status,200);
 assert.equal((await send(DB,'/api/panel-monday',null,'outsider')).status,403);
 assert.equal((await send(DB,'/api/panel-monday',null,'desk')).status,200);
});
test('chat saves the applicable routine under the real person, only once',async()=>{
 const DB=db();const payload={message:'Fechei o caixa de hoje.',area:'reception'};
 const a=await send(DB,'/api/panel-assistant',payload,'desk');assert.equal(a.status,200);
 assert.equal((await a.json()).kind,'saved');
 const b=await send(DB,'/api/panel-assistant',payload,'desk');assert.equal((await b.json()).kind,'already');
 assert.equal(DB.sql.prepare("SELECT COUNT(*) AS n FROM audit WHERE kind='run' AND actor='recepcao@example.com'").get().n,1);
});

test('the web tool receives only a generic topic and requires a citation',async()=>{
 const question='Como confirmar agendamento de Maria Silva, telefone 11987654321?';
 const calls=[];
 const fetcher=async (url,init)=>{
  calls.push(JSON.parse(init.body));return Response.json({output:[{content:[{type:'output_text',text:'Confirme com antecedência.',annotations:[{type:'url_citation',url:'https://example.org/guia',title:'Guia'}]}]}]});
 };
 const data=await handlePanelAssistant({message:question,web:true},{env:{OPENAI_API_KEY:'fixture'},user:{role:'reception'}},fetcher);
 assert.equal(data.kind,'web');assert.equal(data.sources[0].url,'https://example.org/guia');
 assert.doesNotMatch(JSON.stringify(calls),/Maria|11987654321/);
});
test('a loosely related completion statement is never saved',async()=>{
 const answer=await handlePanelAssistant({message:'Fiz uma anotação para o caixa.',area:'reception'},{env:{},user:{role:'reception'},date:'2026-11-17',tasks:[sample('reception-cash-close','reception'),{...sample('actual','reception'),title:'Conferir e fechar o caixa'}],saveRun:()=>assert.fail('ambiguous text caused a write')});
 assert.equal(answer.kind,'clarify');
});
test('a mock Monday connection is restricted to the selected board and its Concluído status',async()=>{
 const seen=[],env={ELAB_MONDAY_TOKEN:'fixture'},item={id:'42',name:'Revisar',board:{id:'18416621523'},column_values:[{id:'color_mm425qpw',text:'A fazer'}]};
 const fetcher=async (_,init)=>{const p=JSON.parse(init.body);seen.push(p);if(p.query.startsWith('mutation'))return Response.json({data:{change_column_value:{id:'42',column_values:[{id:'color_mm425qpw',text:'Concluído'}]}}});if(p.variables.board)return Response.json({data:{boards:[{id:'18416621523',items_page:{items:[item]}}]}});return Response.json({data:{items:[item]}})};
 assert.equal((await panelBoard(env,fetcher)).items[0].title,'Revisar');
 assert.equal((await completeMonday('42',env,fetcher)).kind,'monday-saved');
 assert.deepEqual(JSON.parse(seen.at(-1).variables.value),{label:'Concluído'});
 await assert.rejects(()=>completeMonday('43',env,fetcher),error=>error.status===404);
 assert.equal(seen.filter(x=>x.query.startsWith('mutation')).length,1);
});

test('existing Monday agent credential can read the selected board without enabling mutations',async()=>{
 const env={ELAB_MONDAY_AGENT_TOKEN:'agent-fixture'},seen=[];const fetcher=async(_,init)=>{seen.push(JSON.parse(init.body));return Response.json({data:{boards:[{id:'18416621523',items_page:{items:[]}}]}})};
 assert.equal((await panelBoard(env,fetcher)).connected,true);assert.ok(seen.every(p=>p.query.startsWith('query')));
 const readItem=async(_,init)=>Response.json({data:{items:[{id:'42',name:'Rotina',board:{id:'18416621523'},column_values:[{id:'color_mm425qpw',text:'A fazer'}]}]}});
 await assert.rejects(()=>completeMonday('42',env,readItem),e=>e.status===503);
});

test('private Drive sources require actual member identity even while anonymous test access is enabled',async()=>{
 const env={OPENAI_API_KEY:'fixture',ELAB_DRIVE_INDEXES:JSON.stringify({management:'vs_management',reception:'vs_reception'})};
 for(const user of [{id:'elab-test-access',email:'teste-sem-login@elab.invalid',role:'admin',testAccess:true},{id:'desk',email:'desk@example.com',role:'reception'}]){
  const seen=[];const fetcher=async(_,init)=>{const body=JSON.parse(init.body);seen.push(body);return Response.json({output:[{content:[{type:'output_text',text:body.tools?'Procedimento documentado.':JSON.stringify({matches:[]}),annotations:body.tools?[{type:'file_citation',filename:'POP Recepção'}]:[]}]}]})};
  const result=await handlePanelAssistant({message:'Como organizar uma solicitação incomum?',area:'all'},{env,user,catalog:[],tasks:[]},fetcher);
  const searches=seen.filter(x=>x.tools?.some(t=>t.type==='file_search'));
  if(user.testAccess){assert.equal(searches.length,0);assert.notEqual(result.kind,'drive')}
  else{assert.equal(result.kind,'drive');assert.deepEqual(searches[0].tools[0].vector_store_ids,['vs_reception'])}
 }
});
