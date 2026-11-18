import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync('src/client.js', 'utf8');
const catalog = JSON.parse(readFileSync('src/catalog.json', 'utf8'));

function ui() {
  const context = vm.createContext({ C: catalog, session: { id: 'staff' }, records: [], search: '', localStorage: { getItem: () => '[]' } });
  vm.runInContext("const e=String, summary=(title, subtitle, action='')=>title+subtitle+action, btn=(action,text,id)=>action+' '+text+' '+id, empty=String, byKind=kind=>records.filter(r=>r.kind===kind); let tab='today';" +
    source.slice(source.indexOf('let procedureSector'), source.indexOf('let historyType')), context);
  return context;
}

test('Procedimentos restores the searchable library with sector and favorites controls', () => {
  const context = ui();
  const page = vm.runInContext('proceduresPage()', context);
  assert.match(page, /Descreva a situação ou sua dúvida/);
  assert.match(page, /Favoritos/);
  assert.match(page, /Filtrar por setor/);
  assert.match(page, /Abertura do Salão/);
  assert.match(vm.runInContext("search='abertura do salao'; proceduresPage()", context), /Abertura do Salão/);
});

test('Treinamentos resumes the first unfinished lesson using saved progress', () => {
  const context = ui();
  const [first, second] = catalog.TRILHA[0].missoes;
  context.records = [{kind:'training',data:{userId:'staff',lessonId:first.id}}];
  const page = vm.runInContext('trainingPage()', context);
  assert.match(page, /Continue de onde parou/);
  assert.ok(page.includes('lesson Continuar ' + second.id));
  assert.match(page, /1\/3 concluídas/);
});

test('perguntas situacionais abrem um POP verificável e recusam uma política sem fonte', () => {
  const context = ui();
  const match = vm.runInContext("search='A cliente chegou e o profissional está atrasado, como devo agir?'; proceduresPage()", context);
  assert.match(match, /Cliente em Espera/);
  assert.match(match, /Consultar fonte/);
  const missing = vm.runInContext("search='Uma colega pediu dinheiro emprestado para uma cliente. Como devo agir?'; proceduresPage()", context);
  assert.match(missing, /Nenhum procedimento aplicável/);
});

test('o catálogo mantém só um pós-atendimento e inclui a rotina diária de caixa', () => {
  assert.equal(catalog.ATIVACOES.filter(a => a.id.startsWith('pos')).length, 1);
  assert.match(catalog.ATIVACOES.find(a=>a.id==='pos').criterio, /Google/);
  assert.ok(catalog.tasks.some(t=>t.id==='reception-cash-close'&&t.schedule==='daily'));
  assert.equal(catalog.ATIVACOES.find(a=>a.id==='inativas6m').nome,'Clientes sem Retorno há 2 Meses');
});
