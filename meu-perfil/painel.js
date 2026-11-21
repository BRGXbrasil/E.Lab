const allowedRoles=new Set(['owner','director','admin','manager','reception']);
const labels={name:'Nome',whatsapp:'WhatsApp',birthday:'Aniversário',discovery:'Como conheceu',ritual:'Bebida',service:'Atendimento',goal:'O que busca hoje',hair:'O que ama no cabelo',routine:'Rotina',care:'Cuidados e sensibilidades',change:'O que quer realçar ou mudar',products:'Produtos',inspiration:'Inspiração / referência do dia',car:'Carro e placa'};
const escapePrint=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
function printProfile(profile,createdAt){
 const answers=profile.answers||{};
 const date=new Date(createdAt).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});
 const rows=Object.entries(labels).filter(([key])=>answers[key]!=null&&String(answers[key]).trim()).map(([key,label])=>'<div class="profile-row"><span>'+escapePrint(label)+':</span><strong>'+escapePrint(answers[key])+'</strong></div>').join('');
 const permissions=[['consentContact','Mensagens de agendamento'],['consentMarketing','Novidades e convites'],['consentImage','Uso de imagem'],['consentPrivacy','Armazenamento de dados']].map(([key,label])=>'<div class="permission">'+(profile[key]?'SIM':'NÃO')+' — '+escapePrint(label)+'</div>').join('');
 const name=escapePrint(answers.name||'Cliente');
 const ritual=answers.ritual?'Bebida: '+escapePrint(answers.ritual):'';
 const service=answers.service?'Atendimento: '+escapePrint(answers.service):'';
 const consent=profile.consentContact?'Autoriza: sim':'Autoriza: não';
 const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Painel Recepção — '+name+'</title><style>@page{size:A4;margin:14mm}*{box-sizing:border-box}body{background:#fcf9f5;color:#241b17;font:12px/1.5 Arial,sans-serif;margin:0}.wrap{max-width:760px;margin:0 auto;padding:22px}h1{font:700 26px Georgia,serif;margin:0 0 2px}.subtitle{color:#81766d;font-size:11px;margin:0 0 22px}.card{background:white;border:1px solid #e7d3bf;border-radius:12px;padding:22px}h2{font-size:16px;margin:0 0 4px}.meta{color:#81766d;font-size:11px;margin:0 0 18px}.profile-row{display:grid;grid-template-columns:36% 64%;gap:8px;padding:8px 0;border-bottom:1px solid #f1e9e2;break-inside:avoid}.profile-row span{color:#81766d}.profile-row strong{font-weight:600;overflow-wrap:anywhere}.badge{float:right;background:#241b17;color:white;border-radius:15px;padding:3px 10px;font-size:9px}.permissions{margin-top:18px}.permission{margin-top:6px;font-size:11px}.tools{margin:0 0 16px}button{background:#241b17;color:white;border:0;border-radius:6px;padding:10px 15px;cursor:pointer}footer{font-size:10px;color:#81766d;margin-top:18px}@media print{.tools{display:none}.wrap{padding:0}.card{break-inside:avoid}}</style></head><body><main class="wrap"><div class="tools"><button onclick="window.print()">Imprimir / salvar como PDF</button></div><h1>Painel Recepção</h1><p class="subtitle">Meu Perfil E.lab • Ficha individual • elab.boutique/meu-perfil</p><section class="card"><span class="badge">'+(profile.consentContact?'AUTORIZOU':'NÃO AUTORIZOU')+'</span><h2>'+name+'</h2><p class="meta">'+[ritual,service,consent,'Recebido em '+escapePrint(date)].filter(Boolean).join(' • ')+'</p>'+rows+'<div class="permissions"><strong>Autorização:</strong>'+permissions+'</div></section><footer>Documento de uso interno da recepção • Dados pessoais de acesso restrito</footer></main></body></html>';
 const popup=window.open('','_blank');
 if(!popup)return false;
 popup.document.open();popup.document.write(html);popup.document.close();popup.focus();
 return true;
}
export function mountProfilePanel({client,container}){
 let channel=null,timer=null,mount=0,generation=0,currentPage=0,query='',hasNext=false,role=null,loading=false;
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;return el;};
 function clear(){mount++;generation++;if(channel){void client.removeChannel(channel);channel=null;}clearInterval(timer);timer=null;role=null;currentPage=0;query='';loading=false;container.replaceChildren();container.hidden=true;}
 async function setRole(nextRole){
  clear();const activeMount=mount;if(!allowedRoles.has(nextRole))return;role=nextRole;container.hidden=false;
  const heading=node('h2','Meu Perfil · Recepção');
  const link=node('a','Abrir formulário para a cliente');link.href='https://brgxbrasil.github.io/E.Lab/meu-perfil/';link.target='_blank';link.rel='noopener noreferrer';link.className='dashboard-link';
  const input=node('input');input.type='search';input.placeholder='Buscar pelo nome';input.setAttribute('aria-label','Buscar perfis pelo nome');input.style.width='100%';
  const status=node('p');status.setAttribute('role','status');
  const list=node('div');list.className='profile-records';
  const prev=node('button','Anteriores'),next=node('button','Próximos'),refresh=node('button','Atualizar perfis');
  for(const button of [prev,next,refresh])button.type='button';
  container.append(heading,link,input,status,list,prev,next,refresh);
  input.oninput=()=>{query=input.value.trim();currentPage=0;void load();};
  prev.onclick=()=>{if(currentPage>0){currentPage--;void load();}};
  next.onclick=()=>{if(hasNext){currentPage++;void load();}};
  refresh.onclick=()=>void load();
  async function load(){
   if(!role)return;
   const version=++generation;loading=true;status.textContent='Buscando perfis…';
   try{
    let request=client.from('elab_client_profiles').select('id,created_at,submission').order('created_at',{ascending:false}).order('id',{ascending:false}).range(currentPage*25,currentPage*25+25);
    if(query)request=request.ilike('submission->answers->>name','%'+query.replace(/[\\%_]/g,'\\$&')+'%');
    const result=await request;
    if(version!==generation||!role)return;
    if(result.error)throw result.error;
    const rows=result.data||[];hasNext=rows.length>25;
    const open=new Set(Array.from(list.querySelectorAll('details[open]')).map(el=>el.dataset.id));
    list.replaceChildren();
    for(const row of rows.slice(0,25)){
     const profile=row.submission||{},answers=profile.answers||{};
     const card=node('details');card.dataset.id=row.id;card.open=open.has(row.id);
     const summary=node('summary',(answers.name||'Perfil sem nome')+' · '+new Date(row.created_at).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}));
     card.append(summary);
     const dl=node('dl');
     for(const [id,label] of Object.entries(labels)){dl.append(node('dt',label),node('dd',answers[id]||'Não informado'));}
     for(const [id,label] of [['consentContact','Mensagens de agendamento'],['consentMarketing','Novidades e convites'],['consentImage','Uso de imagem']])dl.append(node('dt',label),node('dd',profile[id]?'Autorizado':'Não autorizado'));
     dl.append(node('dt','Autorização de armazenamento'),node('dd',profile.consentPrivacy?'Autorizado · versão '+profile.privacyVersion:'Não autorizado'));
     card.append(dl);
     const printButton=node('button','Baixar PDF / Imprimir ficha');
     printButton.type='button';
     printButton.setAttribute('aria-label','Baixar PDF ou imprimir ficha de '+(answers.name||'cliente'));
     printButton.onclick=()=>{if(!printProfile(profile,row.created_at))status.textContent='Permita a abertura da janela de impressão para gerar a ficha.';};
     card.append(printButton);list.append(card);
    }
    prev.disabled=currentPage===0;next.disabled=!hasNext;
    status.textContent=rows.length?'Página '+(currentPage+1)+' · atualizado às '+new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Nenhum perfil encontrado.';
   }catch{
    if(version===generation){list.replaceChildren();status.textContent='Não foi possível carregar os perfis. Confira sua sessão e tente atualizar.';}
   }finally{if(version===generation)loading=false;}
  }
  if(client.channel){
   const ownMount=activeMount;
   channel=client.channel('elab-profiles-'+ownMount).on('postgres_changes',{event:'*',schema:'public',table:'elab_client_profiles'},()=>{if(ownMount===mount&&role)void load();}).subscribe(state=>{if(ownMount===mount&&role&&state==='SUBSCRIBED')void load();});
  }
  await load();
  if(activeMount!==mount)return;
  timer=setInterval(()=>{if(!document.hidden&&!loading&&role)void load();},30000);
 }
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clear();});
 return {setRole,clear};
}
