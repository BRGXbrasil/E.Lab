import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORT_SCHEMAS, normalizeImportRow, parseImportDate, parseImportNumber, importRecordId, stableSerialize } from '../src/imports.js';

const day = '2026-11-09';

test('date parser preserves calendar dates across formats, Excel serials and ISO timestamps', () => {
  for (const [input, expected] of [
    ['09/11/2026', day], [day, day], [new Date('2026-11-09T23:40:00Z'), day],
    [61, '1900-03-01'], [46335, day], ['2026-11-09T23:40:00-03:00', day], ['29/02/2024', '2024-02-29'],
  ]) assert.equal(parseImportDate(input), expected);
});

test('date parser rejects impossible, ambiguous and unsupported values', () => {
  for (const input of ['31/02/2026', '2025-02-29', '2026-13-01', '01/02/26', '11-09-2026', '', null, 60, -1, Infinity, new Date(NaN), '2026-11-09junk', '2026-11-09T99:00:00Z']) {
    assert.throws(() => parseImportDate(input), /data/i);
  }
});

test('number parser strictly supports Brazilian money, decimal dot and grouped thousands', () => {
  for (const [input, expected] of [[1234.56, 1234.56], ['1.234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['-12,50', -12.5], ['12.50', 12.5], ['1.234', 1234], ['12.34', 12.34], ['0', 0], ['  0,25  ', 0.25]]) {
    assert.equal(parseImportNumber(input), expected);
  }
  for (const input of ['', ' ', null, undefined, NaN, Infinity, '12foo', '1,2,3', '12.34,56', 'R$ ', true, {}, '1 234,56']) {
    assert.throws(() => parseImportNumber(input), /número/i);
  }
});

test('schemas expose mapped canonical fields and keep services, cash and snapshots distinct', () => {
  assert.deepEqual(Object.keys(IMPORT_SCHEMAS).sort(), ['0004', '0031', '0044', '0045', '0149', '0229', '0387', 'escala', 'stock-position', 'stock-products']);
  assert.equal(IMPORT_SCHEMAS['0031'].domain, 'service');
  assert.equal(IMPORT_SCHEMAS['0387'].domain, 'cash');
  assert.equal(IMPORT_SCHEMAS['0044'].domain, 'stock_movement');
  assert.equal(IMPORT_SCHEMAS['0149'].domain, 'stock_snapshot');
  assert.equal(IMPORT_SCHEMAS['0045'].domain, 'stock_snapshot');
  for (const schema of Object.values(IMPORT_SCHEMAS)) {
    assert.ok(schema.label);
    for (const field of schema.fields) {
      assert.equal(typeof field.key, 'string');
      assert.equal(typeof field.label, 'string');
      assert.equal(typeof field.required, 'boolean');
      assert.equal(typeof field.type, 'string');
    }
  }
});

test('service imports normalize mapped fields, cents and defaults without mutating rows', () => {
  const row = Object.freeze({ id: 's-1', date: '09/11/2026', professional: ' Ana ', service: 'Corte', amount: 'R$ 125,35', client: 'Bia', clientId: 'c1', professionalId: 'p1', ignored: 'raw header' });
  assert.deepEqual(normalizeImportRow('0031', row), { id: 's-1', date: day, professional: 'Ana', service: 'Corte', quantity: 1, amountCents: 12535, client: 'Bia', clientId: 'c1', professionalId: 'p1' });
  assert.equal(normalizeImportRow('0031', { ...row, amount: '-5,25' }).amountCents, -525);
  assert.equal(normalizeImportRow('0031', { ...row, amount: '1.005' }).amountCents, 100500);
  assert.equal(normalizeImportRow('0031', { ...row, amount: 1.005 }).amountCents, 101);
  for (const quantity of [0, -1, 'bad']) assert.throws(() => normalizeImportRow('0031', { ...row, quantity }), /quantidade/i);
  assert.throws(() => normalizeImportRow('0031', { ...row, id: '' }), /identificador/i);
  assert.throws(() => normalizeImportRow('0031', { ...row, professional: '' }), /profissional/i);
});

test('cash imports distinguish paid, expected and transfers and normalize signed outflows', () => {
  const row = { id: 'c-1', date: day, description: 'Compra', direction: 'out', amount: '-120,45', account: 'Caixa' };
  assert.deepEqual(normalizeImportRow('0387', row), { id: 'c-1', date: day, description: 'Compra', direction: 'out', amountCents: 12045, account: 'Caixa', status: 'paid' });
  assert.equal(normalizeImportRow('0387', { ...row, amount: 0, direction: 'transfer', status: 'expected' }).status, 'expected');
  assert.equal(normalizeImportRow('0387', { ...row, status: 'cancelled' }).status, 'cancelled');
  for (const direction of ['in', 'transfer']) assert.throws(() => normalizeImportRow('0387', { ...row, direction }), /negativ/i);
  assert.throws(() => normalizeImportRow('0387', { ...row, status: 'maybe' }), /situação/i);
  assert.throws(() => normalizeImportRow('0387', { ...row, direction: 'invalid' }), /direção/i);
});

test('movement imports preserve corrections and normalize outbound signs without invented costs', () => {
  const row = { id: 'm-1', date: day, productId: 'p1', direction: 'out', quantity: '-2,5', reason: 'Uso' };
  assert.deepEqual(normalizeImportRow('0044', row), { id: 'm-1', date: day, productId: 'p1', direction: 'out', quantity: 2.5, unit: 'un', reason: 'Uso' });
  assert.equal(normalizeImportRow('0044', { ...row, direction: 'adjustment' }).quantity, -2.5);
  assert.equal(normalizeImportRow('0044', { ...row, cost: 'R$ 3,15', product: 'Tinta' }).costCents, 315);
  assert.throws(() => normalizeImportRow('0044', { ...row, direction: 'in' }), /negativ/i);
  assert.throws(() => normalizeImportRow('0044', { ...row, quantity: 0 }), /quantidade/i);
});

test('snapshot imports remain balances, use natural IDs and reject negative balances', () => {
  for (const source of ['0149', '0045']) {
    assert.deepEqual(normalizeImportRow(source, { productId: 'p1', date: day, product: 'Tinta', quantity: '8,5' }), { id: 'p1/2026-11-09', productId: 'p1', date: day, product: 'Tinta', quantity: 8.5, minimum: 0, unit: 'un' });
    assert.equal(normalizeImportRow(source, { id: 'explicit', productId: 'p1', date: day, product: 'Tinta', quantity: 0 }).id, 'explicit');
    for (const field of ['quantity', 'minimum']) assert.throws(() => normalizeImportRow(source, { productId: 'p1', date: day, product: 'Tinta', quantity: 1, [field]: -1 }), /quantidade|mínimo/i);
  }
});

test('professional and client imports never fabricate activity or consent', () => {
  assert.deepEqual(normalizeImportRow('0229', { id: 'p1', name: 'Ana' }), { id: 'p1', name: 'Ana', active: null });
  for (const [active, expected] of [[true, true], [false, false], ['Ativo', true], ['Inativo', false], ['true', true], ['false', false]]) {
    assert.equal(normalizeImportRow('0229', { id: 'p1', name: 'Ana', active }).active, expected);
  }
  assert.throws(() => normalizeImportRow('0229', { id: 'p1', name: 'Ana', active: 'unknown' }), /ativo/i);
  assert.deepEqual(normalizeImportRow('0004', { id: 'c1', name: 'Bia', phone: '11999999999', consent: true }), { id: 'c1', name: 'Bia', phone: '11999999999' });
});

test('schedule imports enforce valid start, explicit statuses and exactly sixty minutes', () => {
  const row = { staffId: 'p1', date: day, start: '09:15', toleranceMinutes: 10 };
  assert.deepEqual(normalizeImportRow('escala', row), { id: 'p1/2026-11-09', staffId: 'p1', date: day, start: '09:15', enabled: true, status: 'pending', toleranceMinutes: 60 });
  assert.equal(normalizeImportRow('escala', { ...row, enabled: 'false', status: 'dayoff', id: 'ignored' }).enabled, false);
  assert.equal(normalizeImportRow('escala', { ...row, status: 'leave' }).status, 'leave');
  for (const start of ['24:00', '9:15', '12:60', '']) assert.throws(() => normalizeImportRow('escala', { ...row, start }), /horário/i);
  assert.throws(() => normalizeImportRow('escala', { ...row, status: 'working' }), /situação/i);
});

test('normalization rejects unknown sources, raw headers and unsafe identifiers with friendly errors', () => {
  assert.throws(() => normalizeImportRow('bogus', {}), /origem/i);
  assert.throws(() => normalizeImportRow('0004', { Código: 'c1', Nome: 'Bia' }), /identificador/i);
  assert.throws(() => normalizeImportRow('0004', { id: 'x'.repeat(181), name: 'Bia' }), /identificador/i);
  assert.throws(() => normalizeImportRow('0004', null), /linha/i);
});

test('record IDs are stable, escaped and source/unit isolated including both snapshot reports', () => {
  assert.equal(importRecordId('0031', 'A/B', { id: '1 /2' }), 'avec/A%2FB/0031/service/1%20%2F2');
  assert.notEqual(importRecordId('0149', 'A', { id: 'same' }), importRecordId('0045', 'A', { id: 'same' }));
  assert.notEqual(importRecordId('0031', 'A', { id: 'same' }), importRecordId('0031', 'B', { id: 'same' }));
  for (const unit of ['', 'x'.repeat(81), null]) assert.throws(() => importRecordId('0031', unit, { id: 'x' }), /unidade/i);
  assert.throws(() => importRecordId('0031', 'A', { id: '' }), /identificador/i);
  assert.throws(() => importRecordId('bogus', 'A', { id: 'x' }), /origem/i);
});

test('stable serialization ignores nested key order and preserves row order for conflict detection', () => {
  assert.equal(stableSerialize({ z: [{ b: 2, a: 1 }, 3], a: { y: true, x: null } }), '{"a":{"x":null,"y":true},"z":[{"a":1,"b":2},3]}');
  assert.equal(stableSerialize({ b: 2, a: 1 }), stableSerialize({ a: 1, b: 2 }));
  assert.notEqual(stableSerialize([1, 2]), stableSerialize([2, 1]));
});
test('schedule accepts native Excel fractional times without confusing date serials',()=>{assert.equal(normalizeImportRow('escala',{staffId:'regina',date:'2026-11-09',start:8/24}).start,'08:00');assert.equal(normalizeImportRow('escala',{staffId:'regina',date:'2026-11-09',start:0}).start,'00:00');assert.throws(()=>normalizeImportRow('escala',{staffId:'regina',date:'2026-11-09',start:45300.333}),/Horário/i)});
