import test from 'node:test';
import assert from 'node:assert/strict';
import { replenishmentSuggestion } from '../src/replenishment.js';

const base = { onHand: 8, minimum: 6, dailyUse: 2, leadDays: 3, reviewDays: 2, safety: 2 };

test('replenishment explains the approved target and four-unit suggestion', () => {
  assert.deepEqual(replenishmentSuggestion(base), { ready: true, coverageDays: 5, target: 12, position: 8, suggested: 4, riskBeforeDelivery: false });
});

test('missing lead time is distinct from explicitly known zero', () => {
  for (const leadDays of [undefined, null, '']) assert.deepEqual(replenishmentSuggestion({ ...base, leadDays }), { ready: false, missing: ['leadDays'] });
  assert.equal(replenishmentSuggestion({ ...base, leadDays: 0 }).ready, true);
  assert.deepEqual(replenishmentSuggestion({}), { ready: false, missing: ['onHand', 'minimum', 'dailyUse', 'leadDays', 'reviewDays'] });
});

test('minimum, reservations and pack sizes affect the visible suggestion', () => {
  assert.deepEqual(replenishmentSuggestion({ onHand: 2, minimum: 10, dailyUse: 0, leadDays: 0, reviewDays: 0, reserved: 1, packSize: 4 }), { ready: true, coverageDays: 0, target: 10, position: 1, suggested: 12, riskBeforeDelivery: false });
  assert.equal(replenishmentSuggestion({ ...base, onHand: 20 }).suggested, 0);
  assert.equal(replenishmentSuggestion({ onHand: 0.1, minimum: 0.4, dailyUse: 0, leadDays: 0, reviewDays: 0, packSize: 0.1 }).suggested, 0.3);
});

test('only confirmed incoming within the coverage window affects position', () => {
  const incoming = [
    { quantity: 2, daysUntilDelivery: 1, confirmed: true },
    { quantity: 30, daysUntilDelivery: 0, confirmed: false },
    { quantity: 30, daysUntilDelivery: -1, confirmed: true },
    { quantity: 30, daysUntilDelivery: 6, confirmed: true },
    { quantity: 1, daysUntilDelivery: 5, confirmed: true },
  ];
  const frozen = JSON.stringify(incoming);
  assert.deepEqual(replenishmentSuggestion({ ...base, incoming }), { ready: true, coverageDays: 5, target: 12, position: 11, suggested: 1, riskBeforeDelivery: false });
  assert.equal(JSON.stringify(incoming), frozen);
});

test('timeline catches stockout before late delivery even with adequate aggregate position', () => {
  assert.deepEqual(replenishmentSuggestion({ ...base, onHand: 2, incoming: [{ quantity: 20, daysUntilDelivery: 3, confirmed: true }] }), { ready: true, coverageDays: 5, target: 12, position: 22, suggested: 0, riskBeforeDelivery: true });
  assert.equal(replenishmentSuggestion({ ...base, onHand: 2, incoming: [{ quantity: 20, daysUntilDelivery: 1, confirmed: true }] }).riskBeforeDelivery, false);
  assert.equal(replenishmentSuggestion({ ...base, onHand: 5 }).riskBeforeDelivery, true);
  assert.equal(replenishmentSuggestion({ ...base, onHand: 6 }).riskBeforeDelivery, false);
  assert.equal(replenishmentSuggestion({ ...base, onHand: 2, incoming: [{ quantity: 1, daysUntilDelivery: 1, confirmed: true }] }).riskBeforeDelivery, true);
});

test('invalid nonfinite or negative quantities and invalid packs never produce an order', () => {
  for (const field of ['onHand', 'minimum', 'dailyUse', 'leadDays', 'reviewDays', 'safety', 'reserved']) {
    for (const value of [-1, NaN, Infinity, 'bad', true]) assert.throws(() => replenishmentSuggestion({ ...base, [field]: value }), /inválid|negativ/i);
  }
  for (const packSize of [0, -1, NaN, Infinity]) assert.throws(() => replenishmentSuggestion({ ...base, packSize }), /embalagem/i);
  assert.throws(() => replenishmentSuggestion({ ...base, incoming: [{ quantity: -2, daysUntilDelivery: 1, confirmed: true }] }), /entrega/i);
});

test('decimal consumption at the exact delivery boundary does not invent a rupture', () => {
  const exact = { onHand: 0.3, minimum: 0, dailyUse: 0.1, leadDays: 3, reviewDays: 0 };
  assert.equal(replenishmentSuggestion(exact).riskBeforeDelivery, false);
  assert.equal(replenishmentSuggestion({ ...exact, incoming: [{ quantity: 0.1, daysUntilDelivery: 3, confirmed: true }] }).riskBeforeDelivery, false);
  assert.equal(replenishmentSuggestion({ ...exact, onHand: 0.299 }).riskBeforeDelivery, true);
});
