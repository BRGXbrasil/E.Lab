const allowedRoles=new Set(['owner','director','admin','manager','reception']);
const labels={name:'Nome',whatsapp:'WhatsApp',birthday:'Aniversário',discovery:'Como conheceu',ritual:'Bebida',service:'Atendimento',goal:'O que busca hoje',hair:'O que ama no cabelo',routine:'Rotina',care:'Cuidados e sensibilidades',change:'O que quer realçar ou mudar',products:'Produtos',inspiration:'Inspiração / referência do dia',car:'Carro e placa'};
export function mountProfilePanel({client,container}){
 let timer=null,mount=0,generation=0,currentPage=0,query='',hasNext=false,role=null,loading=false;
 const node=(tag,text)=>{const el=document.createElement(tag);if(text!=null)el.textContent=text;return el;};
 function clear(){mount++;generation++;clearInterval(timer);timer=null;role=null;currentPage=0;query='';loading=false;container.replaceChildren();container.hidden=true;}
 async function setRole(nextRole){
  clear();const activeMount=mount;if(!allowedRoles.has(nextRole))return;role=nextRole;container.hidden=false;
  const heading=node('h2','Meu Perfil');
  const link=node('a','Abrir formulário para a cliente');link.href='https://brgxbrasil.github.io/Meu-perfil/';link.target='_blank';link.rel='noopener noreferrer';link.className='dashboard-link';
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
     card.append(dl);list.append(card);
    }
    prev.disabled=currentPage===0;next.disabled=!hasNext;
    status.textContent=rows.length?'Página '+(currentPage+1)+' · atualizado às '+new Date().toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo'}):'Nenhum perfil encontrado.';
   }catch{
    if(version===generation){list.replaceChildren();status.textContent='Não foi possível carregar os perfis. Confira sua sessão e tente atualizar.';}
   }finally{if(version===generation)loading=false;}
  }
  await load();
  if(activeMount!==mount)return;
  timer=setInterval(()=>{if(!document.hidden&&!loading&&role)void load();},30000);
 }
 client.auth.onAuthStateChange(event=>{if(event==='SIGNED_OUT')clear();});
 return {setRole,clear};
}
