/** Private, explicit import of the recovered Supabase queue snapshot into MySQL.
 * Dry-run by default. Never commit a source JSON or a generated report with PII.
 */
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SERVICES = ['hair', 'nails', 'gel', 'brows', 'makeup'];
const SERVICE_SET = new Set(SERVICES);

export function prepareQueueSnapshot(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.rows) || snapshot.rows.length !== 1) throw new Error('A exportação deve conter exatamente um estado legado.');
  const row = snapshot.rows[0];
  if (row.id !== 'lista-da-vez-principal' || !row.data || typeof row.data !== 'object') throw new Error('Origem da Lista da Vez inválida.');
  const keys = Object.keys(row.data);
  if (keys.length !== SERVICES.length || keys.some(key => !SERVICE_SET.has(key))) throw new Error('Os cinco serviços esperados não estão presentes.');
  return SERVICES.map(service => {
    const state = row.data[service];
    if (!state || !Array.isArray(state.people) || !Array.isArray(state.events) || !Array.isArray(state.futureQueue)) throw new Error(`Estado incompleto: ${service}`);
    if (!state.people.every(name => typeof name === 'string')) throw new Error(`Profissionais inválidos: ${service}`);
    const events = state.events.map((event, index) => {
      if (!event || typeof event !== 'object' || Array.isArray(event)) throw new Error(`Evento inválido: ${service}/${index}`);
      const legacyRef = `supabase:${row.id}:${row.revision}:${service}:${index}`;
      const hash = createHash('sha256').update(legacyRef).digest('hex');
      const id = `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-a${hash.slice(17,20)}-${hash.slice(20,32)}`;
      return { id, legacyRef, service, type: String(event.type ?? event.category ?? 'legacy').slice(0, 40), payload: event };
    });
    return { service, state: { ...state, weeklyPeriod: undefined }, events, revision: 0 };
  });
}

export async function importQueue(snapshot, db, { apply = false } = {}) {
  const prepared = prepareQueueSnapshot(snapshot);
  const counts = { services: prepared.length, events: prepared.reduce((n, x) => n + x.events.length, 0), future: prepared.reduce((n, x) => n + x.state.futureQueue.length, 0) };
  if (!apply) return { mode: 'dry-run', ...counts };
  // Atomic insertion: do not overwrite the live queue if it has already been initialized.
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [existing] = await connection.query('SELECT service FROM queue_state FOR UPDATE');
    if (existing.length) throw new Error('Importação bloqueada: a fila de destino já possui dados. Reconcilie antes de migrar.');
    for (const item of prepared) {
      await connection.execute('INSERT INTO queue_state (service, data, revision, updated_at) VALUES (?, ?, ?, NOW())', [item.service, JSON.stringify(item.state), item.revision]);
      for (const event of item.events) await connection.execute('INSERT INTO queue_events (id, service, type, payload, legacy_ref, actor_email) VALUES (?, ?, ?, ?, ?, ?)', [event.id, event.service, event.type, JSON.stringify(event.payload), event.legacyRef, 'legacy-import@elab.invalid']);
    }
    await connection.commit();
    return { mode: 'applied', ...counts };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}

async function main() {
  const [, , source, flag] = process.argv;
  if (!source || (flag && flag !== '--apply')) throw new Error('Uso: node scripts/import-legacy-queue.mjs <snapshot-privado.json> [--apply]');
  const snapshot = JSON.parse(await readFile(source, 'utf8'));
  const apply = flag === '--apply';
  if (apply && process.env.ELAB_IMPORT_APPROVED !== 'YES') throw new Error('Defina ELAB_IMPORT_APPROVED=YES após conferir a base de destino.');
  if (!apply) { console.log(JSON.stringify(await importQueue(snapshot, null))); return; }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL de homologação não configurada.');
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ uri: process.env.DATABASE_URL, connectionLimit: 1 });
  try { console.log(JSON.stringify(await importQueue(snapshot, pool, { apply: true }))); } finally { await pool.end(); }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(`file://${process.argv[1]}`)) main().catch(e => { console.error(e.message); process.exitCode = 1; });
