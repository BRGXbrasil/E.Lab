import test from "node:test";
import assert from "node:assert/strict";
import { verifySession, canAccessArea } from "./auth.mjs";
import { recordTaskEvent, validateBusinessDate } from "./operations.mjs";
import { makeHandler } from "./server.mjs";
import { Readable, Writable } from "node:stream";

test("authentication rejects missing tokens and unconfirmed identities", async () => {
  const config = { supabaseUrl: "https://test.supabase.co", supabasePublishableKey: "public" };
  assert.equal(await verifySession("", config), null);
  const fakeFetch = async () => ({ ok: true, json: async () => ({ id: "a", email: "A@X.COM" }) });
  assert.equal(await verifySession("Bearer a.b.c", config, fakeFetch), null);
  const goodFetch = async (url, opts) => {
    assert.equal(url, "https://test.supabase.co/auth/v1/user");
    assert.equal(opts.headers.authorization, "Bearer a.b.c");
    return { ok: true, json: async () => ({ id: "a", email: "A@X.COM", email_confirmed_at: "2026-01-01" }) };
  };
  assert.deepEqual(await verifySession("Bearer a.b.c", config, goodFetch), { id: "a", email: "a@x.com" });
});

test("roles are scoped by area", () => {
  assert.equal(canAccessArea("manager", "stock"), true);
  assert.equal(canAccessArea("reception", "stock"), false);
  assert.equal(canAccessArea("controls", "stock"), true);
  assert.equal(canAccessArea("cleaning", "cleaning"), true);
});

test("invalid operational dates are rejected", () => {
  for (const date of ["2026-02-30", "2026-2-3", "2026-13-01", "garbage"]) {
    assert.throws(() => validateBusinessDate(date));
  }
  assert.equal(validateBusinessDate("2026-11-09"), "2026-11-09");
});

test("events are transactional, audit-stamped, idempotent and role-checked", async () => {
  const queries = [];
  let existing = [];
  const conn = {
    beginTransaction: async () => queries.push("begin"),
    rollback: async () => queries.push("rollback"),
    commit: async () => queries.push("commit"),
    release: () => queries.push("release"),
    execute: async (sql, args) => {
      queries.push([sql, args]);
      if (sql.startsWith("SELECT id, area")) return [[{ id: "x", area: "stock" }]];
      if (sql.startsWith("SELECT event_type")) return [existing];
      return [{}];
    },
  };
  const db = { getConnection: async () => conn };
  const input = { taskId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", eventType: "completed", businessDate: "2026-11-09" };
  const actor = { email: "operator@elab.test", role: "controls" };
  const result = await recordTaskEvent(db, actor, input, () => "event-id");
  assert.equal(result.changed, true);
  assert.equal(queries.filter(x => Array.isArray(x) && x[0].startsWith("INSERT INTO")).length, 2);
  assert.ok(queries.includes("commit"));
  queries.length = 0;
  existing = [{ event_type: "completed" }];
  assert.deepEqual(await recordTaskEvent(db, actor, input), { changed: false, completed: true });
  assert.ok(!queries.includes("commit"));
  await assert.rejects(recordTaskEvent(db, { ...actor, role: "reception" }, input), { status: 403 });
});

test("HTTP API blocks anonymous and non-member access", async () => {
  const db = { execute: async () => [[]] };
  const handler = makeHandler({ db, config: {}, verify: async header => header ? { id: "id", email: "x@test" } : null });
  async function invoke(headers) {
    const req = Readable.from([]);
    Object.assign(req, { url: "/api/operational-tasks", method: "GET", headers });
    const res = new Writable({ write(chunk, encoding, callback) { callback(); } });
    res.writeHead = status => { res.status = status; };
    res.end = () => {};
    await handler(req, res);
    return res.status;
  }
  assert.equal(await invoke({}), 401);
  assert.equal(await invoke({ authorization: "Bearer valid" }), 403);
});
