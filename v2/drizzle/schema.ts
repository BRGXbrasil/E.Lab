import {
  boolean,
  double,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/** Existing Manus OAuth users. Preserve this table and its initial migration. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export const teamMembers = mysqlTable("team_members", {
  id: int("id").autoincrement().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  displayName: varchar("display_name", { length: 120 }),
  role: mysqlEnum("role", ["manager", "reception", "professional", "controls", "cleaning"]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 320 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const clientProfiles = mysqlTable("client_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  answers: json("answers").$type<Record<string, string>>().notNull(),
  contactConsent: mysqlEnum("contact_consent", ["yes", "no"]).notNull(),
  consentText: text("consent_text").notNull(),
  marketingConsent: boolean("marketing_consent").default(false).notNull(),
  imageConsent: boolean("image_consent").default(false).notNull(),
  source: varchar("source", { length: 32 }).default("public-profile").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("client_profiles_created_at_idx").on(table.createdAt)]);

export const routineTemplates = mysqlTable("routine_templates", {
  id: varchar("id", { length: 36 }).primaryKey(),
  area: mysqlEnum("area", ["reception", "controls", "cleaning"]).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  frequency: mysqlEnum("frequency", ["daily", "weekly", "monthly"]).notNull(),
  active: boolean("active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 320 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("routine_templates_area_idx").on(table.area), index("routine_templates_frequency_idx").on(table.frequency)]);

export const routineRuns = mysqlTable("routine_runs", {
  id: varchar("id", { length: 36 }).primaryKey(),
  templateId: varchar("template_id", { length: 36 }).notNull(),
  periodKey: varchar("period_key", { length: 16 }).notNull(),
  completed: boolean("completed").default(false).notNull(),
  completedBy: varchar("completed_by", { length: 320 }),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [uniqueIndex("routine_runs_template_period_uq").on(table.templateId, table.periodKey), index("routine_runs_period_idx").on(table.periodKey)]);

// E.Lab 2.0: imported definitions remain inactive until operational acceptance.
// This table is separate from the historical 12 routine templates.
export const operationalTaskDefinitions = mysqlTable("operational_task_definitions", {
  id: varchar("id", { length: 36 }).primaryKey(),
  area: mysqlEnum("area", ["reception", "stock", "cleaning"]).notNull(),
  cadence: mysqlEnum("cadence", ["daily", "weekly", "monthly", "three_per_week", "on_demand"]).notNull(),
  title: varchar("title", { length: 240 }).notNull(),
  whenText: varchar("when_text", { length: 240 }).notNull(),
  weekdays: json("weekdays").$type<number[] | null>(),
  dayOfMonth: int("day_of_month"),
  sourceKey: varchar("source_key", { length: 32 }).notNull(),
  sourceRow: int("source_row").notNull(),
  active: boolean("active").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("operational_task_area_idx").on(table.area), index("operational_task_cadence_idx").on(table.cadence)]);

export const operationalTaskEvents = mysqlTable("operational_task_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  taskId: varchar("task_id", { length: 36 }).notNull(),
  eventType: mysqlEnum("event_type", ["completed", "reopened"]).notNull(),
  businessDate: varchar("business_date", { length: 10 }).notNull(),
  actorEmail: varchar("actor_email", { length: 320 }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("operational_events_task_idx").on(table.taskId), index("operational_events_date_idx").on(table.businessDate)]);

export const receptionEntries = mysqlTable("reception_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  kind: mysqlEnum("kind", ["occurrence", "unmet-demand"]).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  details: text("details"),
  clientName: varchar("client_name", { length: 160 }),
  status: mysqlEnum("status", ["open", "resolved"]).default("open").notNull(),
  createdBy: varchar("created_by", { length: 320 }).notNull(),
  resolvedBy: varchar("resolved_by", { length: 320 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("reception_entries_status_idx").on(table.status), index("reception_entries_created_idx").on(table.createdAt)]);

export const activationEntries = mysqlTable("activation_entries", {
  id: varchar("id", { length: 36 }).primaryKey(),
  kind: mysqlEnum("kind", ["cancelled", "aftercare", "google-review", "return-suggested"]).notNull(),
  clientName: varchar("client_name", { length: 160 }),
  note: text("note"),
  status: mysqlEnum("status", ["pending", "completed", "dismissed"]).default("pending").notNull(),
  dueAt: timestamp("due_at"),
  createdBy: varchar("created_by", { length: 320 }).notNull(),
  updatedBy: varchar("updated_by", { length: 320 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("activation_entries_kind_idx").on(table.kind), index("activation_entries_status_idx").on(table.status)]);

export const inventoryItems = mysqlTable("inventory_items", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  sku: varchar("sku", { length: 80 }),
  unit: varchar("unit", { length: 32 }).notNull(),
  quantity: double("quantity").default(0).notNull(),
  minimum: double("minimum"),
  expiresOn: varchar("expires_on", { length: 10 }),
  active: boolean("active").default(true).notNull(),
  createdBy: varchar("created_by", { length: 320 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
}, table => [index("inventory_items_name_idx").on(table.name), index("inventory_items_active_idx").on(table.active)]);

export const inventoryMovements = mysqlTable("inventory_movements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  itemId: varchar("item_id", { length: 36 }).notNull(),
  kind: mysqlEnum("kind", ["entry", "withdrawal", "adjustment"]).notNull(),
  quantity: double("quantity").notNull(),
  note: text("note"),
  actorEmail: varchar("actor_email", { length: 320 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("inventory_movements_item_idx").on(table.itemId), index("inventory_movements_created_idx").on(table.createdAt)]);

export const queueState = mysqlTable("queue_state", {
  service: varchar("service", { length: 32 }).primaryKey(),
  data: json("data").$type<Record<string, unknown>>().notNull(),
  revision: int("revision").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const queueEvents = mysqlTable("queue_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  service: varchar("service", { length: 32 }).notNull(),
  type: varchar("type", { length: 40 }).notNull(),
  payload: json("payload").$type<Record<string, unknown>>().notNull(),
  legacyRef: varchar("legacy_ref", { length: 160 }),
  actorEmail: varchar("actor_email", { length: 320 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("queue_events_service_idx").on(table.service), index("queue_events_created_idx").on(table.createdAt)]);

export const auditEvents = mysqlTable("audit_events", {
  id: varchar("id", { length: 36 }).primaryKey(),
  actorUserId: int("actor_user_id"),
  actorEmail: varchar("actor_email", { length: 320 }).notNull(),
  action: varchar("action", { length: 80 }).notNull(),
  entityType: varchar("entity_type", { length: 48 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  summary: varchar("summary", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => [index("audit_events_created_idx").on(table.createdAt), index("audit_events_entity_idx").on(table.entityType, table.entityId)]);
