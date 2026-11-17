import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {DatabaseSync} from 'node:sqlite';import worker from '../dist/server/index.js';import {businessDate} from '../src/core.js';
function database(){const sql=new DatabaseSync(':memory:');sql.exec(fs.readFileSync('drizzle/0000_operations.sql','utf8'));return {sql,prepare(query){let values=[];const p={bind(...v){values=v;return p},async first(){return sql.prepare(query).get(...values)||null},async all(){return {results:sql.prepare(query).all(...values)}},async run(){const r=sql.prepare(query).run(...values);return {meta:{changes:Number(r.changes)}}}};return p},async batch(items){sql.exec('BEGIN');try{const out=[];for(const item of items)out.push(await item.run());sql.exec('COMMIT');return out}catch(e){sql.exec('ROLLBACK');throw e}}}}
async function call(db,path,body,user='owner'){const headers={'oai-authenticated-user-id':user,'oai-authenticated-user-email':user+'@example.com'};if(body){headers.origin='https://elab.test';headers['content-type']='application/json'}const r=await worker.fetch(new Request('https://elab.test'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),{DB:db,BUCKET:db.bucket});return {status:r.status,data:await r.json()}}
async function maintenance(db,action,body,extra={}){const headers={'X-Elab-Avec':'avec-three-20261109','origin':'https://elab.test',...extra};const r=await worker.fetch(new Request('https://elab.test/internal/avec-three-20261109?action='+action,{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body||{})}),{DB:db,BUCKET:{async head(){return null}}});return {status:r.status,data:await r.json()}}
test('legacy import batches and status are retired even with known constants',async()=>{
 const db=database();for(const action of ['batch&index=0','status','finalize','stock-convention']){
  const r=await maintenance(db,action,{});assert.equal(r.status,410);assert.ok(!JSON.stringify(r.data).includes('serviceNetCents'));
 }
 assert.equal(db.sql.prepare('SELECT COUNT(*) AS n FROM records').get().n,0);
});
test('legacy import retirement applies to external origins too',async()=>{
 const r=await maintenance(database(),'status',{}, {origin:'https://evil.test'});assert.equal(r.status,410);
});
