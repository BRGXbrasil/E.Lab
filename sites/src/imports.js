// Fields are canonical mapping targets. Report headers are never guessed here.
const field = (key, label, required = true, type = 'text') => ({ key, label, required, type });
const idField = () => field('id', 'Identificador');
const dateField = () => field('date', 'Data', true, 'date');
const snapshotFields = () => [field('id', 'Identificador', false), field('productId', 'Código do produto'), dateField(), field('product', 'Produto'), field('quantity', 'Quantidade', true, 'number'), field('minimum', 'Mínimo', false, 'number'), field('unit', 'Unidade', false)];

export const IMPORT_SCHEMAS = {
 'stock-position':{label:'Avec · Posição detalhada do estoque',domain:'stock_position',fields:[field('Produto','Produto'),field('Qtd. Estoque','Posição textual'),field('Qtd. Estoque Absoluto','Posição absoluta')]},
 'stock-products':{label:'Avec · Produtos e estoque mínimo',domain:'stock_product',fields:[field('Produto','Produto'),field('Estoque Mínimo','Estoque mínimo'),field('Em Estoque','Posição do cadastro')]},
  '0031': { label: '0031 · Serviços', domain: 'service', fields: [idField(), dateField(), field('professional', 'Profissional'), field('service', 'Serviço'), field('quantity', 'Quantidade', false, 'number'), field('amount', 'Valor', true, 'money'), field('client', 'Cliente', false), field('clientId', 'Código do cliente', false), field('professionalId', 'Código do profissional', false)] },
  '0387': { label: '0387 · Financeiro', domain: 'cash', fields: [idField(), dateField(), field('description', 'Descrição'), field('direction', 'Direção'), field('amount', 'Valor', true, 'money'), field('account', 'Conta'), field('status', 'Situação', false)] },
  '0044': { label: '0044 · Movimentações de estoque', domain: 'stock_movement', fields: [idField(), dateField(), field('productId', 'Código do produto'), field('product', 'Produto', false), field('direction', 'Direção'), field('quantity', 'Quantidade', true, 'number'), field('unit', 'Unidade', false), field('reason', 'Motivo'), field('cost', 'Custo', false, 'money')] },
  '0149': { label: '0149 · Saldo de estoque', domain: 'stock_snapshot', fields: snapshotFields() },
  '0045': { label: '0045 · Saldo de estoque', domain: 'stock_snapshot', fields: snapshotFields() },
  '0229': { label: '0229 · Profissionais', domain: 'professional', fields: [idField(), field('name', 'Nome'), field('active', 'Ativo', false, 'boolean'), field('sector', 'Setor', false)] },
  '0004': { label: '0004 · Clientes', domain: 'client', fields: [idField(), field('name', 'Nome'), field('phone', 'Telefone', false)] },
  escala: { label: 'Escala', domain: 'schedule', fields: [field('staffId', 'Código do profissional'), dateField(), field('start', 'Horário de início', true, 'time'), field('enabled', 'Habilitado', false, 'boolean'), field('status', 'Situação', false)] },
};

const missing = value => value === undefined || value === null || (typeof value === 'string' && value.trim() === '');

function schemaFor(source) {
  if (!Object.hasOwn(IMPORT_SCHEMAS, source)) throw new Error('Origem de importação desconhecida.');
  return IMPORT_SCHEMAS[source];
}

function text(value, label, optional = false) {
  if (missing(value)) {
    if (optional) return undefined;
    throw new Error(`${label} é obrigatório.`);
  }
  if (typeof value !== 'string' && !(typeof value === 'number' && Number.isFinite(value))) throw new Error(`${label} inválido.`);
  return String(value).trim();
}

function identifier(value, label = 'Identificador') {
  const result = text(value, label);
  if (result.length > 180) throw new Error(`${label} deve ter até 180 caracteres.`);
  try { encodeURIComponent(result); } catch { throw new Error(`${label} inválido.`); }
  return result;
}

function calendarDate(year, month, day) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error('Data inválida: confira o dia, mês e ano.');
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseImportDate(value) {
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime()) || value.getUTCFullYear() < 0 || value.getUTCFullYear() > 9999) throw new Error('Data inválida.');
    return calendarDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === 'number') {
    // Excel's serial 60 is a fictitious 1900-02-29. Earlier serials are ambiguous.
    if (!Number.isFinite(value) || value < 61) throw new Error('Data Excel inválida: use um serial a partir de 61.');
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
    if (!Number.isFinite(date.getTime()) || date.getUTCFullYear() > 9999) throw new Error('Data Excel inválida.');
    return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (typeof value !== 'string') throw new Error('Data inválida: use DD/MM/AAAA ou AAAA-MM-DD.');
  const input = value.trim();
  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (brazilian) return calendarDate(Number(brazilian[3]), Number(brazilian[2]), Number(brazilian[1]));
  const iso = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(input);
  if (iso) {
    const result = calendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!iso[4]) return result;
    const time = /^T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|([+-])(\d{2}):(\d{2}))?$/.exec(iso[4]);
    if (time && Number(time[1]) < 24 && Number(time[2]) < 60 && Number(time[3] || 0) < 60 && Number(time[5] || 0) < 24 && Number(time[6] || 0) < 60 && Number.isFinite(Date.parse(input))) return result;
  }
  throw new Error('Data inválida: use DD/MM/AAAA ou AAAA-MM-DD com ano completo.');
}

export function parseImportNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string' || !value.trim()) throw new Error('Número inválido ou ausente.');
  let input = value.trim().replace(/^R\$\s*/, '');
  // A dot followed by exactly three digits is a thousands group: "1.234" = 1234.
  if (/^[+-]?\d{1,3}(?:\.\d{3})+$/.test(input)) input = input.replaceAll('.', '');
  else if (/^[+-]?(?:\d+|\d{1,3}(?:\.\d{3})+),\d+$/.test(input)) input = input.replaceAll('.', '').replace(',', '.');
  else if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(input)) throw new Error('Número inválido: confira os separadores de decimal e milhar.');
  const result = Number(input);
  if (!Number.isFinite(result)) throw new Error('Número inválido: o valor deve ser finito.');
  return result;
}

function number(value, label, fallback) {
  if (missing(value) && fallback !== undefined) return fallback;
  try { return parseImportNumber(value); } catch { throw new Error(`${label}: número inválido ou ausente.`); }
}

function cents(value, label) {
  const amount = number(value, label);
  const result = Math.sign(amount) * Math.round((Math.abs(amount) + Number.EPSILON * Math.abs(amount)) * 100);
  if (!Number.isSafeInteger(result)) throw new Error(`${label} inválido: valor monetário muito alto.`);
  return result === 0 ? 0 : result;
}

function nonnegative(value, label, fallback) {
  const result = number(value, label, fallback);
  if (result < 0) throw new Error(`${label} não pode ser negativo.`);
  return result;
}

function choice(value, label, options, fallback) {
  const result = missing(value) && fallback !== undefined ? fallback : text(value, label);
  if (!options.includes(result)) throw new Error(`${label} inválida. Use: ${options.join(', ')}.`);
  return result;
}

function boolean(value, label, fallback) {
  if (missing(value)) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'ativo') return true;
    if (normalized === 'false' || normalized === 'inativo') return false;
  }
  throw new Error(`${label} inválido. Use verdadeiro/falso ou Ativo/Inativo.`);
}

function optionalText(target, row, keys) {
  for (const key of keys) {
    const value = text(row[key], key, true);
    if (value !== undefined) target[key] = key.endsWith('Id') ? identifier(value, key) : value;
  }
  return target;
}

export function normalizeImportRow(source, row) {
  const schema = schemaFor(source);
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Linha de importação inválida.');
  if (schema.domain === 'professional') return optionalText({ id: identifier(row.id), name: text(row.name, 'Nome'), active: boolean(row.active, 'Ativo', null) }, row, ['sector']);
  if (schema.domain === 'client') return optionalText({ id: identifier(row.id), name: text(row.name, 'Nome') }, row, ['phone']);
  if (schema.domain === 'schedule') {
    const staffId = identifier(row.staffId, 'Identificador do profissional');
    const date = parseImportDate(row.date);
    let start = text(row.start, 'Horário de início');
    if(typeof row.start==='number'&&row.start>=0&&row.start<1){const minutes=Math.round(row.start*1440);if(minutes<1440&&Math.abs(minutes-row.start*1440)<0.00001)start=String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');}
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)) throw new Error('Horário de início inválido. Use HH:mm.');
    return { id: identifier(`${staffId}/${date}`), staffId, date, start, enabled: boolean(row.enabled, 'Habilitado', true), status: choice(row.status, 'Situação', ['pending', 'dayoff', 'leave'], 'pending'), toleranceMinutes: 60 };
  }
  if (schema.domain === 'stock_snapshot') {
    const productId = identifier(row.productId, 'Identificador do produto');
    const date = parseImportDate(row.date);
    return { id: identifier(missing(row.id) ? `${productId}/${date}` : row.id), productId, date, product: text(row.product, 'Produto'), quantity: nonnegative(row.quantity, 'Quantidade'), minimum: nonnegative(row.minimum, 'Mínimo', 0), unit: text(row.unit, 'Unidade', true) || 'un' };
  }
  const common = { id: identifier(row.id), date: parseImportDate(row.date) };
  if (schema.domain === 'service') {
    const quantity = number(row.quantity, 'Quantidade', 1);
    if (quantity <= 0) throw new Error('Quantidade deve ser positiva.');
    return optionalText({ ...common, professional: text(row.professional, 'Profissional'), service: text(row.service, 'Serviço'), quantity, amountCents: cents(row.amount, 'Valor') }, row, ['client', 'clientId', 'professionalId']);
  }
  if (schema.domain === 'cash') {
    const direction = choice(row.direction, 'Direção', ['in', 'out', 'transfer']);
    const amount = number(row.amount, 'Valor');
    if (amount < 0 && direction !== 'out') throw new Error('Valor negativo só é permitido para uma saída.');
    return { ...common, description: text(row.description, 'Descrição'), direction, amountCents: Math.abs(cents(amount, 'Valor')), account: text(row.account, 'Conta'), status: choice(row.status, 'Situação', ['paid', 'expected', 'cancelled'], 'paid') };
  }
  const direction = choice(row.direction, 'Direção', ['in', 'out', 'adjustment']);
  let quantity = number(row.quantity, 'Quantidade');
  if (quantity === 0) throw new Error('Quantidade deve ser diferente de zero.');
  if (direction === 'in' && quantity < 0) throw new Error('Quantidade de entrada não pode ser negativa.');
  if (direction === 'out') quantity = Math.abs(quantity);
  const result = optionalText({ ...common, productId: identifier(row.productId, 'Identificador do produto'), direction, quantity, unit: text(row.unit, 'Unidade', true) || 'un', reason: text(row.reason, 'Motivo') }, row, ['product']);
  if (!missing(row.cost)) result.costCents = cents(row.cost, 'Custo');
  return result;
}

export function importRecordId(source, unit, data) {
  const { domain } = schemaFor(source);
  const normalizedUnit = text(unit, 'Unidade');
  if (normalizedUnit.length > 80) throw new Error('Unidade deve ter até 80 caracteres.');
  let escapedUnit;
  try { escapedUnit = encodeURIComponent(normalizedUnit); } catch { throw new Error('Unidade inválida.'); }
  return `avec/${escapedUnit}/${source}/${domain}/${encodeURIComponent(identifier(data?.id))}`;
}

export function stableSerialize(data) {
  return JSON.stringify(data, (_key, value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]]));
  });
}
