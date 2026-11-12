import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = name => readFileSync(new URL(name, import.meta.url), "utf8");
test("59 original tasks are staged inactive with stable identifiers", () => {
 const seed=read("./002_catalog_inactive.sql");
 const ids=[...seed.matchAll(/\('drive-(?:reception|stock|cleaning)-\d{2}'/g)].map(m=>m[0]);
 assert.equal(ids.length,59);assert.equal(new Set(ids).size,59);
 assert.equal((seed.match(/,false\)/g)||[]).length,59);
 assert.match(seed,/ON CONFLICT \(id\) DO NOTHING/);
});
test("migration protects existing queue state and enforces RLS",()=>{
 const sql=read("./001_supabase_ops_staging.sql");
 assert.doesNotMatch(sql,/\b(?:UPDATE|DELETE FROM|DROP TABLE|TRUNCATE)\s+(?:public\.)?elab_state\b/i);
 for(const table of ["members","tasks","events","audit"]) assert.match(sql,new RegExp("ALTER TABLE public\\.elab_ops_"+table+" ENABLE ROW LEVEL SECURITY"));
 assert.match(sql,/SECURITY DEFINER SET search_path = ''/);
 assert.match(sql,/REVOKE ALL ON FUNCTION/);
 assert.match(sql,/FOR UPDATE/);
});
test("browser never receives privileged credentials",()=>{
 const html=read("./index.html");
 assert.doesNotMatch(html,/service_role|SUPABASE_SERVICE_ROLE|DATABASE_URL|MYSQL_ROOT_PASSWORD/i);
 assert.match(html,/functions\/v1\/elab-login/);
 assert.match(html,/America\/Sao_Paulo/);
});
test("Edge API authenticates the user and defers authorization to RLS",()=>{
 const code=read("./supabase/functions/operational/index.ts");
 assert.match(code,/auth\.getUser\(token\)/);
 assert.match(code,/from\("elab_ops_members"\)/);
 assert.match(code,/rpc\("elab_ops_record_event"/);
 assert.doesNotMatch(code,/SUPABASE_SERVICE_ROLE|service_role/);
});
