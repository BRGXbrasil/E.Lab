import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = path => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
const catalogText = read("../data/cronogramas-operacionais.json");
const catalog = JSON.parse(catalogText);
const sql = read("../drizzle/0002_operational_catalog_staging.sql");

test("59 definições únicas com setores e cadências válidos", () => {
  const items = catalog.routines;
  assert.equal(items.length, 59);
  assert.equal(new Set(items.map(item => item.id)).size, 59);
  assert.deepEqual(Object.fromEntries(["reception", "stock", "cleaning"].map(area => [area, items.filter(item => item.area === area).length])),
    { reception: 9, stock: 16, cleaning: 34 });
  assert.deepEqual(Object.fromEntries(["daily", "weekly", "monthly", "three_per_week", "on_demand"].map(cadence => [cadence, items.filter(item => item.cadence === cadence).length])),
    { daily: 27, weekly: 16, monthly: 3, three_per_week: 9, on_demand: 4 });
});

test("frequências confirmadas pela Gestão", () => {
  const byId = new Map(catalog.routines.map(item => [item.id, item]));
  assert.equal(byId.get("drive-stock-10")?.cadence, "monthly");
  assert.equal(byId.get("drive-stock-10")?.dayOfMonth, 15);
  const three = catalog.routines.filter(item => item.cadence === "three_per_week");
  assert.equal(three.length, 9);
  assert.ok(three.every(item => JSON.stringify(item.weekdays) === "[2,4,6]"));
  const heavy = catalog.routines.filter(item => item.area === "cleaning" && item.cadence === "weekly");
  assert.equal(heavy.length, 10);
  assert.ok(heavy.every(item => JSON.stringify(item.weekdays) === "[1]"));
});

test("migração inclui as 59 tarefas, inativas por segurança", () => {
  const inserted = [...sql.matchAll(/^\('drive-[^\n]+,false\)[,;]?$/gm)];
  assert.equal(inserted.length, 59);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS `operational_task_events`/);
});

test("artefato de GitHub não expõe links privados nem dados de clientes", () => {
  assert.doesNotMatch(catalogText, /docs\.google\.com|drive\.google\.com|sourceFiles|Telefone|clientName/);
  assert.ok(catalog.routines.every(item => !Object.hasOwn(item, "notes")));
});

test("a interface da fila mantém ausentes e ocupados visíveis", () => {
  const source = read("../client/src/pages/Queue.tsx");
  assert.match(source, /inactivePeople/);
  assert.match(source, /\[\.\.\.currentOrder, \.\.\.inactivePeople\]/);
  assert.match(source, /disabled=\{!eligible\}/);
});

test("a visão geral não entrega dados da Recepção a todos os setores", () => {
  const source = read("../server/routers/operations.ts");
  assert.match(source, /canSeeReceptionData = \["admin", "manager", "reception"\]/);
  assert.doesNotMatch(source, /role === "manager" \|\| role === "professional"/);
});
