// All arguments are server-owned. Never pass request-supplied identity, config,
// or verification metadata here. This module performs no provider requests.
import {areas,roles} from './core.js';
const privateRoles=new Set(Object.keys(roles));
const driveScopes=new Set(['shared','management','professional',...Object.keys(areas)]);
const present=value=>typeof value==='string'&&value.trim().length>0;

export function canUsePrivateDrive(user){
 return Boolean(user&&!user.testAccess&&!user.temporaryReadOnly&&
  present(user.id)&&user.id!=='elab-test-access'&&
  typeof user.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)&&
  !/\.invalid$/i.test(user.email)&&privateRoles.has(user.role));
}

function hasDriveIndexes(value){
 try{
  const map=JSON.parse(value||'{}');
  return Boolean(map&&typeof map==='object'&&!Array.isArray(map)&&Object.entries(map).some(([scope,ids])=>driveScopes.has(scope)&&(Array.isArray(ids)?ids:[ids]).some(id=>typeof id==='string'&&/^vs_[A-Za-z0-9_-]+$/.test(id))));
 }catch{return false}
}

function providerStatus(id,name,configured,detail,metadata){
 const evidence=metadata.verification?.[id];
 const checked=typeof evidence?.checkedAt==='string'?Date.parse(evidence.checkedAt):NaN;
 const age=(Number.isFinite(metadata.now)?metadata.now:Date.now())-checked;
 // Fixture/unit tests demonstrate implementation behavior, never connectivity.
 const connected=Boolean(configured&&evidence?.source==='provider'&&evidence.status==='success'&&Number.isFinite(checked)&&age>=0&&age<=15*60*1000);
 return {id,name,configured,state:connected?'connected':configured?'configured':'unconfigured',label:connected?'Conectado':configured?'Configurado · a validar':'Não configurado',detail,...(connected?{checkedAt:new Date(checked).toISOString()}:{} )};
}

export function integrationStatus(env,user,metadata={}){
 if(!canUsePrivateDrive(user)||!['admin','manager'].includes(user.role))throw Object.assign(Error('O diagnóstico de integrações é restrito à gestão identificada.'),{status:403});
 const ai=present(env.OPENAI_API_KEY),agent=present(env.ELAB_MONDAY_AGENT_TOKEN),mondayWrite=present(env.ELAB_MONDAY_TOKEN);
 const indexes=hasDriveIndexes(env.ELAB_DRIVE_INDEXES);
 const importedRows=Number.isSafeInteger(metadata.avec?.importedRows)&&metadata.avec.importedRows>=0?metadata.avec.importedRows:null;
 const avecReady=Boolean(env.DB&&env.BUCKET);
 return {items:[
  providerStatus('mondayRead','Monday · quadro E.Lab',agent||mondayWrite,agent||mondayWrite?'Leitura do quadro preparada; valide a consulta e a atualização no Hub.':'Credencial de leitura do quadro ainda não configurada.',metadata),
  providerStatus('mondayWrite','Monday · concluir pendências',mondayWrite,mondayWrite?'Conclusão com confirmação da gestão; valide a alteração e a auditoria.':'A credencial do agente não habilita a conclusão de itens no painel.',metadata),
  {...providerStatus('drive','Drive · base interna',indexes&&ai,!indexes?'Índices de documentos ainda não configurados.':!ai?'Índices informados; falta configurar a IA para consultá-los.':'Consulta a arquivos indexados preparada, restrita a membros identificados. A pasta do Drive não sincroniza automaticamente.',metadata),automaticSync:false},
  providerStatus('ai','IA · assistente E.Lab',ai,ai?'Consulta semântica e pesquisa pública preparadas; valide uma resposta real com fonte.':'Chave da IA ainda não configurada; o catálogo local continua disponível.',metadata),
  {id:'avec',name:'AVEC · relatórios importados',configured:avecReady,state:avecReady?'configured':'unconfigured',label:avecReady?'Importação disponível':'Armazenamento não configurado',detail:(importedRows===null?'Importação de relatórios por arquivo.':importedRows+' registros importados no Hub.')+' Não há conexão automática com a API do AVEC neste aplicativo.',automaticSync:false}
 ]};
}
