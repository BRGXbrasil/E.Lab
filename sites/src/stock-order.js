import stockOrderReference from './stock-order-reference.json' with {type:'json'};

export function calculateStockOrder(row, leadDays = 10) {
  const {balance, minimum, outflow, review} = row;
  const usable = Number.isFinite(balance) && balance >= 0 && Number.isFinite(outflow) && outflow >= 0;
  const forecast = usable ? outflow * leadDays / 30 : null;
  const arrival = usable ? Math.max(0, balance - forecast) : null;
  const shortage = usable ? Math.max(0, forecast - balance) : null;
  let status = 'conferir';
  if (!review) {
    if (minimum === 0) status = 'minimo_desativado';
    else if (Number.isFinite(minimum) && minimum > 0 && usable) {
      if (balance >= minimum) status = 'saldo_suficiente';
      else status = outflow > balance ? 'repor' : 'sem_reposicao';
    }
  }
  const required = status === 'repor' ? Math.min(minimum - arrival, outflow) : null;
  // Quantities in the reference are decimal packaging equivalents.
  const orderUnits = required === null ? null : Math.ceil(Math.round(required * 1e10) / 1e10);
  return {...row, forecast, arrival, shortage, status, orderUnits};
}

export function validatedStockOrderReport() {
  const {rows, ...period} = stockOrderReference;
  return {...period, rows:rows.map(row => calculateStockOrder(row, period.leadDays))};
}
