import { randomUUID } from "node:crypto";
import { canAccessArea } from "./auth.mjs";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function validateBusinessDate(date) {
  const parsed = typeof date === "string" && datePattern.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error("Data operacional inválida"), { status: 400 });
  }
  return date;
}

export async function listTasks(db, actor) {
  const [rows] = await db.execute(
    "SELECT id, area, cadence, title, when_text AS whenText, weekdays, day_of_month AS dayOfMonth FROM operational_task_definitions WHERE active = 1 ORDER BY area, title"
  );
  return rows.filter(task => canAccessArea(actor.role, task.area));
}

export async function recordTaskEvent(db, actor, input, idFactory = randomUUID) {
  if (typeof input?.taskId !== "string" || !/^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|drive-(?:reception|stock|cleaning)-\d{2})$/i.test(input.taskId) || !["completed", "reopened"].includes(input?.eventType)) {
    throw Object.assign(new Error("Evento inválido"), { status: 400 });
  }
  const businessDate = validateBusinessDate(input.businessDate);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [tasks] = await conn.execute(
      "SELECT id, area FROM operational_task_definitions WHERE id = ? AND active = 1 FOR UPDATE", [input.taskId]
    );
    if (!tasks.length) throw Object.assign(new Error("Tarefa não encontrada ou inativa"), { status: 404 });
    if (!canAccessArea(actor.role, tasks[0].area)) throw Object.assign(new Error("Acesso negado"), { status: 403 });
    const [prior] = await conn.execute(
      "SELECT event_type FROM operational_task_events WHERE task_id = ? AND business_date = ? ORDER BY created_at DESC, id DESC LIMIT 1", [input.taskId, businessDate]
    );
    const current = prior[0]?.event_type === "completed";
    if (current === (input.eventType === "completed")) {
      await conn.rollback();
      return { changed: false, completed: current };
    }
    const eventId = idFactory();
    await conn.execute(
      "INSERT INTO operational_task_events (id, task_id, event_type, business_date, actor_email, note) VALUES (?, ?, ?, ?, ?, ?)",
      [eventId, input.taskId, input.eventType, businessDate, actor.email, typeof input.note === "string" ? input.note.slice(0, 2000) : null]
    );
    await conn.execute(
      "INSERT INTO audit_events (id, actor_email, action, entity_type, entity_id, summary) VALUES (?, ?, ?, ?, ?, ?)",
      [idFactory(), actor.email, `operational-task.${input.eventType}`, "operational-task", input.taskId, `${input.eventType} em ${businessDate}`]
    );
    await conn.commit();
    return { changed: true, completed: input.eventType === "completed", eventId };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
