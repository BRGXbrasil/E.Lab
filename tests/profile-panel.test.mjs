import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
test('panel uses allowed roles, renders untrusted answers as text and clears on logout',async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 await page.goto('about:blank');
 await page.setContent('<section id="profiles" hidden></section>');
 const source=await readFile('meu-perfil/painel.js','utf8');
 await page.addScriptTag({content:source.replace('export function mountProfilePanel','function mountProfilePanel')});
 await page.evaluate(async()=>{
  window.queryCount=0;
  const client={from:()=>{window.queryCount++;const q={select:()=>q,order:()=>q,range:()=>q,ilike:()=>q,then:resolve=>resolve({data:[{id:'demo',created_at:new Date().toISOString(),submission:{answers:{name:'<img src=x onerror="window.injected=true">',care:'Informação fictícia'},consentContact:false,consentMarketing:false,consentImage:false}}]})};return q;},auth:{onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
  window.panel=mountProfilePanel({client,container:document.getElementById('profiles')});
  await panel.setRole('cleaning');
 });
 assert.equal(await page.evaluate(()=>queryCount),0,'unauthorized role must not request profiles');
 await page.evaluate(()=>panel.setRole('manager'));
 assert.equal(await page.locator('#profiles').isVisible(),true);
 assert.equal(await page.locator('#profiles img').count(),0);
 assert.match(await page.locator('#profiles').textContent(),/<img src=x/);
 await page.evaluate(()=>panel.clear());
 assert.equal(await page.locator('#profiles').isVisible(),false);
 assert.equal(await page.locator('#profiles').textContent(),'');
 assert.equal(await page.evaluate(()=>window.injected),undefined);
 }finally{await browser.close();}
});
test('paginates 25 records and search resets pagination',async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setContent('<section id="profiles" hidden></section>');
  const source=await readFile('meu-perfil/painel.js','utf8');await page.addScriptTag({content:source.replace('export function mountProfilePanel','function mountProfilePanel')});
  await page.evaluate(async()=>{
   window.ranges=[];let range=[0,25];
   const client={from:()=>{const q={select:()=>q,order:()=>q,range:(a,b)=>{range=[a,b];ranges.push(range);return q},ilike:()=>q,then:resolve=>resolve({data:Array.from({length:range[0]===0?26:3},(_,i)=>({id:String(range[0]+i),created_at:new Date().toISOString(),submission:{answers:{name:'Fictícia '+(range[0]+i)}}}))})};return q},auth:{onAuthStateChange(){}}};
   window.panel=mountProfilePanel({client,container:document.getElementById('profiles')});await panel.setRole('reception');
  });
  assert.equal(await page.locator('details').count(),25);
  await page.getByRole('button',{name:'Próximos',exact:true}).click();
  await page.waitForFunction(()=>document.querySelectorAll('details').length===3);
  assert.deepEqual(await page.evaluate(()=>ranges.at(-1)),[25,50]);
  await page.getByRole('searchbox').fill('Fictícia');
  await page.waitForFunction(()=>ranges.at(-1)[0]===0);
  await page.evaluate(()=>panel.clear());
 }finally{await browser.close();}
});
test('overlapping logins leave only the current polling interval',async()=>{
 const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();await page.setContent('<section id="profiles" hidden></section>');
 const source=await readFile('meu-perfil/painel.js','utf8');await page.addScriptTag({content:source.replace('export function mountProfilePanel','function mountProfilePanel')});
 const count=await page.evaluate(async()=>{
  const intervals=new Set(),resolvers=[];let nextId=0;
  window.setInterval=()=>{intervals.add(++nextId);return nextId};window.clearInterval=id=>intervals.delete(id);
  const client={from:()=>{const q={select:()=>q,order:()=>q,range:()=>q,then:resolve=>resolvers.push(resolve)};return q},auth:{onAuthStateChange(){}}};
  const panel=mountProfilePanel({client,container:document.getElementById('profiles')});
  const first=panel.setRole('manager');await Promise.resolve();
  const second=panel.setRole('reception');await Promise.resolve();
  resolvers[1]({data:[]});await second;
  resolvers[0]({data:[]});await first;
  return intervals.size;
 });
 assert.equal(count,1);
 }finally{await browser.close();}
});
test('realtime refreshes profiles and old channel callbacks cannot cross sessions',async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setContent('<section id="profiles"></section>');
  const source=await readFile('meu-perfil/painel.js','utf8');await page.addScriptTag({content:source.replace('export function mountProfilePanel','function mountProfilePanel')});
  await page.evaluate(async()=>{
   window.rows=[];window.channels=[];window.removed=[];window.queryCount=0;
   const client={from:()=>{queryCount++;const q={select:()=>q,order:()=>q,range:()=>q,then:r=>r({data:rows})};return q},auth:{onAuthStateChange(){}},channel:()=>{const ch={on:(type,filter,cb)=>{ch.callback=cb;return ch},subscribe:cb=>{ch.status=cb;return ch}};channels.push(ch);return ch},removeChannel:ch=>{removed.push(ch);return Promise.resolve('ok')}};
   window.panel=mountProfilePanel({client,container:document.querySelector('#profiles')});await panel.setRole('reception');
  });
  assert.equal(await page.evaluate(()=>channels.length),1);
  await page.evaluate(()=>{rows=[{id:'new',created_at:new Date().toISOString(),submission:{answers:{name:'Nova cliente fictícia'}}}];channels[0].callback({eventType:'INSERT'});});
  await page.locator('summary').filter({hasText:'Nova cliente fictícia'}).waitFor();
  await page.evaluate(async()=>{await panel.setRole('manager');window.countBefore=queryCount;channels[0].callback({eventType:'INSERT'});});
  assert.equal(await page.evaluate(()=>queryCount),await page.evaluate(()=>countBefore));
  assert.equal(await page.evaluate(()=>removed.length),1);
  await page.evaluate(()=>panel.clear());
  assert.equal(await page.evaluate(()=>removed.length),2);
 }finally{await browser.close()}
});
test('GitHub and Sites publish the same customer form',async()=>{
 assert.equal(await readFile('sites/public/meu-perfil/index.html','utf8'),await readFile('meu-perfil/index.html','utf8'));
});
