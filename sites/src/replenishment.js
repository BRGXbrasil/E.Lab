const REQUIRED = ['onHand', 'minimum', 'dailyUse', 'leadDays', 'reviewDays'];
const missing = value => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
const rounded = value => Number(value.toPrecision(15));

function quantity(value, label, positive = false) {
  const validType = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '');
  const result = validType ? Number(value) : NaN;
  if (!Number.isFinite(result) || result < 0 || (positive && result === 0)) throw new Error(`${label} inválido: informe um valor ${positive ? 'positivo' : 'não negativo'} e finito.`);
  return result;
}

// This function returns advice only. It never creates or confirms purchase orders.
export function replenishmentSuggestion(input = {}) {
  const absent = REQUIRED.filter(key => missing(input[key]));
  if (absent.length) return { ready: false, missing: absent };
  const values = Object.fromEntries(REQUIRED.map(key => [key, quantity(input[key], key)]));
  const { onHand, minimum, dailyUse, leadDays, reviewDays } = values;
  const safety = quantity(input.safety === undefined ? 0 : input.safety, 'Estoque de segurança');
  const reserved = quantity(input.reserved === undefined ? 0 : input.reserved, 'Reserva');
  const packSize = quantity(input.packSize === undefined ? 1 : input.packSize, 'Tamanho da embalagem', true);
  const coverageDays = rounded(leadDays + reviewDays);
  const incoming = input.incoming === undefined ? [] : input.incoming;
  if (!Array.isArray(incoming)) throw new Error('Entregas inválidas.');
  const deliveries = [];
  for (const delivery of incoming) {
    if (!delivery || typeof delivery !== 'object') throw new Error('Entrega inválida.');
    const amount = quantity(delivery.quantity, 'Quantidade da entrega');
    // Negative delivery days represent overdue orders, never available inventory.
    const days = typeof delivery.daysUntilDelivery === 'number' || (typeof delivery.daysUntilDelivery === 'string' && delivery.daysUntilDelivery.trim()) ? Number(delivery.daysUntilDelivery) : NaN;
    if (!Number.isFinite(days)) throw new Error('Prazo da entrega inválido.');
    if (delivery.confirmed === true && days >= 0 && days <= coverageDays) deliveries.push({ amount, days });
  }
  deliveries.sort((a, b) => a.days - b.days);
  const target = rounded(Math.max(minimum, dailyUse * coverageDays + safety));
  const position = rounded(deliveries.reduce((sum, delivery) => sum + delivery.amount, onHand - reserved));
  const gap = rounded(target - position);
  const packs = gap > 0 ? Math.max(1, Math.ceil(gap / packSize - Number.EPSILON * Math.max(1, Math.abs(gap / packSize)) * 8)) : 0;
  const suggested = rounded(packs * packSize);
  if (![coverageDays, target, position, suggested].every(Number.isFinite)) throw new Error('Cálculo inválido: valores excedem o limite permitido.');
  let stock = rounded(onHand - reserved);
  let elapsed = 0;
  let riskBeforeDelivery = stock < 0;
  for (const delivery of deliveries) {
    stock = rounded(stock - rounded(dailyUse * rounded(delivery.days - elapsed)));
    if (stock < 0) riskBeforeDelivery = true;
    stock = rounded(stock + delivery.amount);
    elapsed = delivery.days;
  }
  if (elapsed < leadDays && rounded(stock - rounded(dailyUse * rounded(leadDays - elapsed))) < 0) riskBeforeDelivery = true;
  return { ready: true, coverageDays, target, position, suggested, riskBeforeDelivery };
}
