import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { activationEntries, auditEvents, receptionEntries, routineRuns, routineTemplates } from "../../drizzle/schema";
import { appendAudit } from "../audit";
import { staffProcedure, managementProcedure } from "../access";
import { router } from "../_core/trpc";
import { getDb } from "../db";
import { businessDateKey, businessMonthKey, businessWeekKey } from "../../shared/businessTime";

export type Frequency = "daily" | "weekly" | "monthly";
export function periodKey(frequency: Frequency, date = new Date()): string {
  if (frequency === "daily") return businessDateKey(date);
  if (frequency === "monthly") return businessMonthKey(date);
  return businessWeekKey(date);
}

function canUseArea(role: string, area: "reception" | "controls" | "cleaning") {
  if (role === "admin" || role === "manager") return true;
  return (area === "reception" && role === "reception") || (area === "controls" && role === "controls") || (area === "cleaning" && role === "cleaning");
}
function requireReception(role: string) {
  if (!["admin", "manager", "reception"].includes(role)) throw new TRPCError({ code: "FORBIDDEN", message: "Este setor exige acesso da Recepção ou Gestão." });
}

const frequencySchema = z.enum(["daily", "weekly", "monthly"]);
const areaSchema = z.enum(["reception", "controls", "cleaning"]);

export const operationsRouter = router({
  overview: staffProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const templates = await db.select().from(routineTemplates).where(eq(routineTemplates.active, true));
    const frequencies: Frequency[] = ["daily", "weekly", "monthly"];
    const keys = frequencies.map(f => periodKey(f));
    const runs = templates.length
      ? await db.select().from(routineRuns).where(inArray(routineRuns.templateId, templates.map(t => t.id)))
      : [];
    const routines = templates.map(template => ({
      ...template,
      periodKey: periodKey(template.frequency),
      completed: runs.some(run => run.templateId === template.id && run.periodKey === periodKey(template.frequency) && run.completed),
      canComplete: canUseArea(ctx.staff.role, template.area),
    }));
    const completion = Object.fromEntries(frequencies.map(frequency => {
      const matching = routines.filter(task => task.frequency === frequency);
      const completed = matching.filter(task => task.completed).length;
      return [frequency, { total: matching.length, completed, percent: matching.length ? Math.round(completed / matching.length * 100) : null }];
    })) as Record<Frequency, { total: number; completed: number; percent: number | null }>;
    const canSeeReceptionData = ["admin", "manager", "reception"].includes(ctx.staff.role);
    const entries = canSeeReceptionData
      ? await db.select().from(receptionEntries).where(eq(receptionEntries.status, "open")).orderBy(desc(receptionEntries.createdAt)).limit(8)
      : [];
    const activations = canSeeReceptionData
      ? await db.select().from(activationEntries).where(eq(activationEntries.status, "pending")).orderBy(desc(activationEntries.createdAt)).limit(40)
      : [];
    return { routines, completion, openEntries: entries, pendingActivations: activations, serverTime: new Date().toISOString(), periods: keys };
  }),
  routineCreate: managementProcedure.input(z.object({ area: areaSchema, title: z.string().trim().min(2).max(240), frequency: frequencySchema })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const id = randomUUID();
    await db.transaction(async tx => {
      await tx.insert(routineTemplates).values({ id, area: input.area, title: input.title, frequency: input.frequency, active: true, createdBy: ctx.staff.email });
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, "routine.created", "routine", id, `Rotina ${input.area} criada com recorrência ${input.frequency}.`);
    });
    return { id };
  }),
  routineToggle: staffProcedure.input(z.object({ id: z.string().uuid(), completed: z.boolean() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const template = (await db.select().from(routineTemplates).where(and(eq(routineTemplates.id, input.id), eq(routineTemplates.active, true))).limit(1))[0];
    if (!template) throw new TRPCError({ code: "NOT_FOUND", message: "Rotina não encontrada." });
    if (!canUseArea(ctx.staff.role, template.area)) throw new TRPCError({ code: "FORBIDDEN", message: "Seu papel não pode concluir esta rotina." });
    const key = periodKey(template.frequency);
    const values = { completed: input.completed, completedBy: input.completed ? ctx.staff.email : null, completedAt: input.completed ? new Date() : null };
    await db.transaction(async tx => {
      const existing = (await tx.select().from(routineRuns).where(and(eq(routineRuns.templateId, template.id), eq(routineRuns.periodKey, key))).limit(1))[0];
      if (existing) await tx.update(routineRuns).set(values).where(eq(routineRuns.id, existing.id));
      else await tx.insert(routineRuns).values({ id: randomUUID(), templateId: template.id, periodKey: key, ...values });
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, input.completed ? "routine.completed" : "routine.reopened", "routine", template.id, `Rotina ${template.area} ${input.completed ? "concluída" : "reaberta"} para ${key}.`);
    });
    return { ok: true } as const;
  }),
  routineDeactivate: managementProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ ctx, input }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    await db.transaction(async tx => {
      const existing = (await tx.select().from(routineTemplates).where(eq(routineTemplates.id, input.id)).limit(1))[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Rotina não encontrada." });
      await tx.update(routineTemplates).set({ active: false }).where(eq(routineTemplates.id, input.id));
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, "routine.deactivated", "routine", input.id, "Rotina desativada pela Gestão.");
    });
    return { ok: true } as const;
  }),
  entriesList: staffProcedure.query(async ({ ctx }) => {
    requireReception(ctx.staff.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    return db.select().from(receptionEntries).orderBy(desc(receptionEntries.createdAt)).limit(300);
  }),
  entryCreate: staffProcedure.input(z.object({ kind: z.enum(["occurrence", "unmet-demand"]), title: z.string().trim().min(2).max(200), details: z.string().max(4000).optional(), clientName: z.string().max(160).optional() })).mutation(async ({ ctx, input }) => {
    requireReception(ctx.staff.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const id = randomUUID();
    await db.transaction(async tx => {
      await tx.insert(receptionEntries).values({ id, kind: input.kind, title: input.title, details: input.details || null, clientName: input.clientName || null, status: "open", createdBy: ctx.staff.email, resolvedBy: null });
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, `${input.kind}.created`, "reception-entry", id, `${input.kind === "occurrence" ? "Ocorrência" : "Demanda não atendida"} registrada.`);
    });
    return { id };
  }),
  entryResolve: staffProcedure.input(z.object({ id: z.string().uuid(), resolved: z.boolean() })).mutation(async ({ ctx, input }) => {
    requireReception(ctx.staff.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    await db.transaction(async tx => {
      const existing = (await tx.select().from(receptionEntries).where(eq(receptionEntries.id, input.id)).limit(1))[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado." });
      await tx.update(receptionEntries).set({ status: input.resolved ? "resolved" : "open", resolvedBy: input.resolved ? ctx.staff.email : null }).where(eq(receptionEntries.id, input.id));
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, input.resolved ? "entry.resolved" : "entry.reopened", "reception-entry", input.id, `Registro da recepção ${input.resolved ? "resolvido" : "reaberto"}.`);
    });
    return { ok: true } as const;
  }),
  activationsList: staffProcedure.query(async ({ ctx }) => {
    requireReception(ctx.staff.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    return db.select().from(activationEntries).orderBy(desc(activationEntries.createdAt)).limit(300);
  }),
  activationCreate: staffProcedure.input(z.object({ kind: z.enum(["cancelled", "aftercare", "google-review", "return-suggested"]), clientName: z.string().max(160).optional(), note: z.string().max(2000).optional() })).mutation(async ({ ctx, input }) => {
    requireReception(ctx.staff.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    const id = randomUUID();
    await db.transaction(async tx => {
      await tx.insert(activationEntries).values({ id, kind: input.kind, clientName: input.clientName || null, note: input.note || null, status: "pending", createdBy: ctx.staff.email, updatedBy: null, dueAt: null });
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, "activation.created", "activation", id, `Ativação criada: ${input.kind}.`);
    });
    return { id };
  }),
  activationUpdate: staffProcedure.input(z.object({ id: z.string().uuid(), status: z.enum(["pending", "completed", "dismissed"]) })).mutation(async ({ ctx, input }) => {
    requireReception(ctx.staff.role);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Banco indisponível." });
    await db.transaction(async tx => {
      const existing = (await tx.select().from(activationEntries).where(eq(activationEntries.id, input.id)).limit(1))[0];
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Ativação não encontrada." });
      await tx.update(activationEntries).set({ status: input.status, updatedBy: ctx.staff.email }).where(eq(activationEntries.id, input.id));
      await appendAudit(tx, { userId: ctx.user.id, email: ctx.staff.email }, "activation.updated", "activation", input.id, `Ativação atualizada para ${input.status}.`);
    });
    return { ok: true } as const;
  }),
});
