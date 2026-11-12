import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareQueueSnapshot, importQueue } from '../scripts/import-legacy-queue.mjs';

function fixture() {
  return { rows: [{ id: 'lista-da-vez-principal', revision: 32, data: Object.fromEntries(['hair', 'nails', 'gel', 'brows', 'makeup'].map(service => [service, { people: ['Pessoa Teste'], events: [{ type: 'pass' }], futureQueue: [] }])) }] };
}
test('dry-run only counts and does not connect', async () => {
  assert.deepEqual(await importQueue(fixture(), null), { mode: 'dry-run', services: 5, events: 5, future: 0 });
});
test('event identities are deterministic for repeatable audits', () => {
  assert.equal(prepareQueueSnapshot(fixture())[0].events[0].id, prepareQueueSnapshot(fixture())[0].events[0].id);
});
test('rejects incomplete export', () => {
  const source = fixture(); delete source.rows[0].data.hair;
  assert.throws(() => prepareQueueSnapshot(source), /cinco serviços/);
});
test('refuses to overwrite initialized destination and rolls back', async () => {
  let rolledBack = false; let inserted = false; let released = false;
  const db = { getConnection: async () => ({ beginTransaction: async () => {}, query: async () => [[{ service: 'hair' }]], execute: async () => { inserted = true; }, rollback: async () => { rolledBack = true; }, release: () => { released = true; } }) };
  await assert.rejects(importQueue(fixture(), db, { apply: true }), /já possui dados/);
  assert.equal(inserted, false); assert.equal(rolledBack, true); assert.equal(released, true);
});
