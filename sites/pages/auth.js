(()=>{
 const SUPABASE_URL='https://yrmsnykdxxqomkvxqnki.supabase.co';
 const PUBLIC_KEY='sb_publishable_nviD65C5Y-mgrj04dwEheQ_x17AjVfL';
 const API='https://elab.dazzlingbegonia2.chatgpt.site';
 const app=document.querySelector('#app');
 const client=window.supabase?.createClient(SUPABASE_URL,PUBLIC_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:'elab-hub-auth'}});
 let resolveReady,authenticatedId=null;
 const ready=new Promise(resolve=>{resolveReady=resolve});
 const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function showLogin(message=''){
  app.innerHTML=`<main class="login-page"><section class="card login-card"><div class="wordmark">E.Lab Hub<span>BOUTIQUE</span></div><h1>Bem-vinda</h1><p class="sub">Entre com seu acesso individual.</p><form id="hub-login"><label><span class="field-label">Nome de usuário ou e-mail</span><input class="field" name="username" autocomplete="username" maxlength="160" required></label><label><span class="field-label">Senha</span><input class="field" name="password" type="password" autocomplete="current-password" maxlength="200" required></label><p id="login-feedback" role="status" aria-live="polite">${escape(message)}</p><button class="btn primary" type="submit">Entrar</button></form><p class="help">Para criar ou recuperar seu acesso, fale com a Gestão.</p></section></main>`;
  const form=document.querySelector('#hub-login');
  form.addEventListener('submit',async event=>{
   event.preventDefault();const button=form.querySelector('button'),feedback=document.querySelector('#login-feedback');button.disabled=true;feedback.textContent='Entrando…';
   try{
    if(!client)throw Error('Não foi possível carregar o login. Atualize a página.');
    const username=form.elements.username.value.trim(),password=form.elements.password.value;
    if(username.includes('@')){const {error}=await client.auth.signInWithPassword({email:username,password});if(error)throw Error('Usuário ou senha inválidos.');}
    else{
     const response=await fetch(SUPABASE_URL+'/functions/v1/elab-login',{method:'POST',headers:{'Content-Type':'application/json',apikey:PUBLIC_KEY},body:JSON.stringify({username,password})});
     const data=await response.json();if(!response.ok||!data.access_token||!data.refresh_token)throw Error(response.status===401?'Usuário ou senha inválidos.':'Não foi possível entrar. Tente novamente.');
     const {error}=await client.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});if(error)throw Error('Não foi possível iniciar a sessão.');
    }
    form.elements.password.value='';
    // Check membership before displaying any operational screen.
    const response=await apiFetch('/api/bootstrap');
    if(!response.ok){const data=await response.json();await client.auth.signOut({scope:'local'});throw Error(data.error||'Seu acesso precisa ser autorizado pela gestão.');}
    location.reload();
   }catch(error){feedback.textContent=error.message||'Não foi possível entrar. Tente novamente.';button.disabled=false;}
  });
 }
 async function apiFetch(path,options={}){
  if(!/^\/(api\/|catalog\.json(?:$|\?))/.test(path))throw Error('Endereço de operação inválido.');
  const {data,error}=await client.auth.getSession();
  if(error||!data.session?.access_token)throw Object.assign(Error('Entre com seu acesso.'),{status:401});
  const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+data.session.access_token);
  return fetch(API+path,{...options,headers,credentials:'omit'});
 }
 window.elabAuth={ready,fetch:apiFetch,showError:showLogin,async signOut(){await client?.auth.signOut({scope:'local'});location.reload()}};
 if(!client){showLogin('Não foi possível carregar o login. Atualize a página.');return;}
 client.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'&&authenticatedId){location.reload();return}
  if(session&&authenticatedId&&session.user.id!==authenticatedId)location.reload();
 });
 client.auth.getSession().then(({data,error})=>{
  if(error||!data.session){showLogin();return;}
  authenticatedId=data.session.user.id;resolveReady();
 }).catch(()=>showLogin('Não foi possível recuperar sua sessão. Entre novamente.'));
})();
