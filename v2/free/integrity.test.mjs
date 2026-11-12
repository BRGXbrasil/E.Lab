import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
test('59 tasks seeded exactly once and staged safely',()=>{
 const seed=read('002_catalog_inactive.sql');
 const ids=[...seed.matchAll(/\('drive-(?:reception|stock|cleaning)-\d{2}'/g)].map(x=>x[0]);
 assert.equal(ids.length,59);assert.equal(new Set(ids).size,59);
 assert.match(seed,/ON CONFLICT \(id\) DO NOTHING/);
});
test('Activation uses explicit schedules, flexible monthly windows and on demand',()=>{
 const precise=read('009_event_order_confirmed_schedules.sql');
 const flex=read('010_flexible_monthly_and_occurrences.sql');
 assert.match(precise,/cadence IN \('daily','weekly','three_per_week'\)/);
 assert.match(precise,/day_of_month BETWEEN 1 AND 31/);
 assert.match(flex,/cadence='on_demand'/);
 assert.match(flex,/day_of_month IS NULL/);
 assert.match(flex,/event_type IN \('completed','reopened','occurred'\)/);
});
test('Staff registration is owner issued and only service role can claim',()=>{
 const sql=read('013_owner_invite_registration.sql');
 assert.match(sql,/role='owner'/);
 assert.match(sql,/sha256\(convert_to\(v_token,'UTF8'\)\)/);
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.elab_ops_claim_staff_invite\(text,uuid\) FROM PUBLIC,anon,authenticated/);
 assert.match(sql,/GRANT EXECUTE ON FUNCTION public\.elab_ops_claim_staff_invite\(text,uuid\) TO service_role/);
 assert.match(read('014_owner_password_reset.sql'),/elab_ops_claim_password_reset/);
});
test('Task RPC validates schedule and maintains event/audit atomically',()=>{
 const sql=read('011_server_schedule_validation.sql');
 assert.match(sql,/EXTRACT\(DOW FROM p_business_date\)/);
 assert.match(sql,/EXTRACT\(DAY FROM p_business_date\)/);
 assert.match(sql,/FOR UPDATE/);
 assert.match(sql,/INSERT INTO public\.elab_ops_audit/);
 assert.match(sql,/America\/Sao_Paulo/);
});
test('Original queue is publicly readable but only approved roles can edit',()=>{
 const sql=read('005_queue_public_read_role_write.sql');
 assert.match(sql,/elab_state_authenticated_update/);
 assert.match(sql,/m\.role IN \('owner','director','manager','reception'\)/);
 const page=read('lista-da-vez.html');
 assert.match(page,/app\.canEdit=false;if\(session\)/);
 assert.match(page,/functions\/v1\/elab-login/);
});
test('Published HTML scripts parse and have no privileged credentials',()=>{
 for(const name of ['index.html','lista-da-vez.html']){
  const source=read(name);
  assert.doesNotMatch(source,/SUPABASE_SERVICE_ROLE_KEY|MYSQL_ROOT_PASSWORD/);
  const scripts=[...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
  assert.ok(scripts.length);
  for(const script of scripts){
   const compiled=script.replace(/^import\s.*;\s*$/gm,'').replace(/await refresh\(\);/g,'void refresh();');
   assert.doesNotThrow(()=>new vm.Script(compiled,{filename:name}));
  }
 }
});
test('Director dashboard requires role and integrates source queue',()=>{
 const sql=read('012_director_queue_history.sql');
 assert.match(sql,/role IN \('owner','director','admin','hr'\)/);
 const page=read('index.html');
 assert.match(page,/elab_ops_queue_history/);
 assert.match(page,/elab_ops_queue_summary/);
 assert.match(page,/elab_ops_create_staff_invite/);
 assert.match(page,/elab_ops_create_password_reset/);
 assert.match(page,/elab_ops_set_user_role/);
});
