import test from 'node:test';
import assert from 'node:assert/strict';
import {APPROVED_STAFF, shouldAlert, applyPresenceAction} from '../src/presence.js';

const scheduled = overrides => ({staffId:'regina', date:'2026-11-09', start:'08:00', toleranceMinutes:60, status:'pending', enabled:true, ...overrides});
const context = overrides => ({at:'2026-11-09T12:00:00.000Z', actor:'recepcao', ...overrides});

test('approved roster has the approved names, starts, stable IDs and the Tuesday–Saturday schedule', () => {
  assert.deepEqual(APPROVED_STAFF.map(({name,start}) => [name,start]), [
    ['Regina','08:00'],['Patrícia','07:00'],['Diego','08:30'],['Bruna Nunes','08:30'],
    ['Bruna Chagas','10:00'],['Bruna Gomes','11:00'],['Gabriele','11:00'],['Arlete','12:00'],
    ['Marina','09:00'],['Alana','09:00'],['Camila','12:00'],['Allan','11:00'],
    ['Wallace','09:00'],['Dani','10:00'],['Luiza','10:00'],['Mara','10:00'],
    ['Cesar','09:00'],['Dhandara','10:00'],['Karin','10:00'],['Talita','11:00'],
    ['Noelia','10:00'],['Rogério','09:00'],['Thiago','09:00'],['Salles','10:00'],['Diogo','10:00'],['Déia',null]
  ]);
  assert.deepEqual(APPROVED_STAFF.map(person => person.id), [
    'regina','patricia','diego','bruna-nunes','bruna-chagas','bruna-gomes','gabriele','arlete',
    'marina','alana','camila','allan','wallace','dani','luiza','mara','cesar','dhandara',
    'karin','talita','noelia','rogerio','thiago','salles','diogo','deia'
  ]);
  for (const person of APPROVED_STAFF) {
    assert.equal(person.toleranceMinutes,60);
    assert.deepEqual(person.days,[2,3,4,5,6]);
    assert.equal(person.active,true);
  }
});

test('absence prompt starts exactly 60 minutes after start in Sao Paulo', () => {
  assert.equal(shouldAlert(scheduled(), '2026-11-09T11:59:59.999Z'),false);
  assert.equal(shouldAlert(scheduled(), '2026-11-09T12:00:00Z'),true);
  assert.equal(shouldAlert(scheduled(), '2026-11-09T09:00:00-03:00'),true);
});

test('shift start minutes are respected', () => {
  assert.equal(shouldAlert(scheduled({start:'08:30'}), '2026-11-09T12:29:59Z'),false);
  assert.equal(shouldAlert(scheduled({start:'08:30'}), '2026-11-09T12:30:00Z'),true);
});

for (const status of ['present','absent','dayoff','leave','unknown']) {
  test(`no absence prompt for ${status}`, () => {
    assert.equal(shouldAlert(scheduled({status}),context().at),false);
  });
}

test('unknown or disabled schedules never invent a prompt', () => {
  for (const shift of [null, {}, APPROVED_STAFF[0], scheduled({enabled:false}), scheduled({enabled:undefined}), scheduled({start:null}), scheduled({staffId:''})]) {
    assert.equal(shouldAlert(shift,context().at),false);
  }
});

test('only current business day can prompt, including UTC midnight boundary', () => {
  assert.equal(shouldAlert(scheduled(), '2026-11-10T02:59:59Z'),true);
  assert.equal(shouldAlert(scheduled(), '2026-11-10T03:00:00Z'),false);
  assert.equal(shouldAlert(scheduled(), '2026-11-09T02:59:59Z'),false);
  assert.equal(shouldAlert(scheduled({date:'2026-11-10'}),context().at),false);
});

test('snoozed prompt is suppressed until remindAt inclusive', () => {
  const shift = scheduled({remindAt:'2026-11-09T12:10:00Z'});
  assert.equal(shouldAlert(shift,'2026-11-09T12:09:59Z'),false);
  assert.equal(shouldAlert(shift,'2026-11-09T12:10:00Z'),true);
});

test('bad calendar dates, times, tolerance and reminder timestamps cannot prompt', () => {
  for (const overrides of [
    {date:'2026-02-30'}, {date:'2025-02-29'}, {date:'2026-13-01'}, {date:'2026-11-9'},
    {start:'24:00'}, {start:'08:60'}, {start:'8:00'}, {toleranceMinutes:-1},
    {toleranceMinutes:NaN}, {toleranceMinutes:'60'}, {remindAt:'garbage'},
    {remindAt:'2026-02-30T12:00:00Z'}
  ]) assert.equal(shouldAlert(scheduled(overrides),context().at),false);
});

test('invalid or timezone-ambiguous now timestamps cannot prompt', () => {
  for (const at of [undefined,null,'garbage','2026-02-30T12:00:00Z','2026-11-09T12:00:00','2026-11-09T24:00:00Z']) {
    assert.equal(shouldAlert(scheduled(),at),false);
  }
});

test('valid leap day is supported', () => {
  assert.equal(shouldAlert(scheduled({date:'2028-02-29'}),'2028-02-29T12:00:00Z'),true);
});

test('explicit confirmed schedule does not require membership in the initial roster', () => {
  assert.equal(shouldAlert(scheduled({staffId:'nova-pessoa'}),context().at),true);
});

test('present action records arrival and complete separate audit event', () => {
  const original = Object.freeze(scheduled({revision:8,metadata:Object.freeze({unit:'principal'})}));
  const action = Object.freeze({type:'present'});
  const result = applyPresenceAction(original,action,context());
  assert.equal(result.changed,true);
  assert.equal(result.shift.status,'present');
  assert.equal(result.shift.checkedInAt,context().at);
  assert.equal(result.shift.revision,8);
  assert.deepEqual(result.shift.metadata,{unit:'principal'});
  assert.equal(original.status,'pending');
  assert.notEqual(result.shift,original);
  assert.deepEqual(result.event,{
    type:'present',staffId:'regina',date:'2026-11-09',at:context().at,actor:'recepcao',
    fromStatus:'pending',beforeStatus:'pending',toStatus:'present',reason:''
  });
  assert.equal('events' in result.shift,false);
  assert.equal('history' in result.shift,false);
});

test('duplicate present has no event and preserves first arrival timestamp', () => {
  const original = scheduled({status:'present',checkedInAt:'2026-11-09T11:40:00Z'});
  const result = applyPresenceAction(original,{type:'present'},context());
  assert.equal(result.changed,false);
  assert.equal(result.event,null);
  assert.deepEqual(result.shift,original);
});

test('absence requires at least three trimmed reason characters', () => {
  for (const reason of [undefined,null,'','  ',' a ',' ab ',3]) {
    assert.throws(() => applyPresenceAction(scheduled(),{type:'absent',reason},context()),/motivo|justificativa/i);
  }
});

test('absence stores a trimmed reason, timestamp and complete audit event', () => {
  const original = scheduled();
  const result = applyPresenceAction(original,{type:'absent',reason:'  Consulta médica  '},context());
  assert.equal(result.changed,true);
  assert.equal(result.shift.status,'absent');
  assert.equal(result.shift.absenceAt,context().at);
  assert.equal(result.shift.reason,'Consulta médica');
  assert.deepEqual(result.event,{
    type:'absent',staffId:'regina',date:'2026-11-09',at:context().at,actor:'recepcao',
    fromStatus:'pending',beforeStatus:'pending',toStatus:'absent',reason:'Consulta médica'
  });
  assert.equal(original.status,'pending');
});

test('duplicate absence preserves existing reason and produces no audit event', () => {
  const original = scheduled({status:'absent',reason:'Consulta',absenceAt:context().at});
  const result = applyPresenceAction(original,{type:'absent',reason:'Outro motivo'},context());
  assert.equal(result.changed,false);
  assert.equal(result.event,null);
  assert.deepEqual(result.shift,original);
});

test('presença pode mudar para ausência justificada, preservando evento',()=>{const result=applyPresenceAction(scheduled({status:'present'}),{type:'absent',reason:'Saída antecipada'},context());assert.equal(result.shift.status,'absent');assert.equal(result.event.fromStatus,'present')});
test('chegada após ausência pode ser registrada diretamente',()=>{assert.equal(applyPresenceAction(scheduled({status:'absent'}),{type:'present'},context()).shift.status,'present')});
test('justified arrival correction preserves absence facts and previous status in new event', () => {
  const original = scheduled({status:'absent',absenceAt:'2026-11-09T11:55:00Z',reason:'Não chegou'});
  const result = applyPresenceAction(original,{type:'present',reason:'  Chegada confirmada  '},context());
  assert.equal(result.shift.status,'present');
  assert.equal(result.shift.checkedInAt,context().at);
  assert.equal(result.shift.absenceAt,original.absenceAt);
  assert.equal(result.shift.reason,'Não chegou');
  assert.equal(result.event.reason,'Chegada confirmada');
  assert.equal(result.event.beforeStatus,'absent');
  assert.equal(result.event.fromStatus,'absent');
  assert.equal(result.event.toStatus,'present');
  assert.equal(original.status,'absent');
});

test('snooze keeps pending status and sets a ten-minute reminder with audit', () => {
  const original = scheduled();
  const result = applyPresenceAction(original,{type:'snooze'},context());
  assert.equal(result.changed,true);
  assert.equal(result.shift.status,'pending');
  assert.equal(result.shift.remindAt,'2026-11-09T12:10:00.000Z');
  assert.equal(result.shift.absenceAt,undefined);
  assert.deepEqual(result.event,{
    type:'snooze',staffId:'regina',date:'2026-11-09',at:context().at,actor:'recepcao',
    fromStatus:'pending',beforeStatus:'pending',toStatus:'pending',reason:''
  });
  assert.equal(original.remindAt,undefined);
});

for (const status of ['present','absent']) {
  test(`snooze rejects ${status} status`, () => {
    assert.throws(() => applyPresenceAction(scheduled({status}),{type:'snooze'},context()),/pendente/i);
  });
}

test('disabled pending schedules reject presence actions', () => {
  for (const overrides of [{enabled:false},{enabled:undefined}]) {
    for (const type of ['present','absent','snooze']) {
      assert.throws(() => applyPresenceAction(scheduled(overrides),{type,reason:'Confirmado'},context()),/escala|folga|licença/i);
    }
  }
});

test('presence actions reject invalid schedule dates, start times and unknown states', () => {
  for (const overrides of [{date:'2026-02-30'},{start:'25:00'},{staffId:''},{status:'unknown'}]) {
    assert.throws(() => applyPresenceAction(scheduled(overrides),{type:'present'},context()),/escala|data|horário|situação/i);
  }
});

test('actions reject malformed timestamp or missing actor even for duplicates', () => {
  for (const overrides of [
    {at:null},{at:'garbage'},{at:'2026-02-30T12:00:00Z'},{at:'2026-11-09T12:00:00'},
    {actor:''},{actor:'   '},{actor:null}
  ]) {
    assert.throws(() => applyPresenceAction(scheduled(),{type:'present'},context(overrides)),/data|horário|responsável|operador/i);
    assert.throws(() => applyPresenceAction(scheduled({status:'present'}),{type:'present'},context(overrides)),/data|horário|responsável|operador/i);
  }
});

test('actions cannot change a previous or future business date', () => {
  for (const date of ['2026-11-08','2026-11-10']) {
    assert.throws(() => applyPresenceAction(scheduled({date}),{type:'present'},context()),/dia|data/i);
  }
  assert.throws(() => applyPresenceAction(scheduled(),{type:'present'},context({at:'2026-11-09T02:59:59Z'})),/dia|data/i);
  assert.equal(applyPresenceAction(scheduled(),{type:'present'},context({at:'2026-11-10T02:59:59Z'})).changed,true);
});

test('timestamps with explicit offset are normalized and actor is trimmed', () => {
  const result = applyPresenceAction(scheduled(),{type:'present'},context({at:'2026-11-09T09:00:00-03:00',actor:'  recepcao  '}));
  assert.equal(result.shift.checkedInAt,'2026-11-09T12:00:00.000Z');
  assert.equal(result.event.at,'2026-11-09T12:00:00.000Z');
  assert.equal(result.event.actor,'recepcao');
});

test('unknown actions and absent context are rejected with Portuguese messages', () => {
  assert.throws(() => applyPresenceAction(scheduled(),{type:'delete'},context()),/ação/i);
  assert.throws(() => applyPresenceAction(scheduled(),null,context()),/ação/i);
  assert.throws(() => applyPresenceAction(scheduled(),{type:'present'}),/data|horário/i);
  assert.throws(() => applyPresenceAction(scheduled(),{type:'present'},null),/data|horário/i);
});

test('folga pode ser registrada e corrigida pelo mesmo controle',()=>{const off=applyPresenceAction(scheduled(),{type:'dayoff'},context());assert.equal(off.shift.enabled,false);assert.equal(off.event.toStatus,'dayoff');const present=applyPresenceAction(off.shift,{type:'present'},context());assert.equal(present.shift.enabled,true);assert.equal(present.event.fromStatus,'dayoff')});
