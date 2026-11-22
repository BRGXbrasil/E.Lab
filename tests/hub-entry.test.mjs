import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from '/opt/codex/runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
test('GitHub entry opens the current Sites Hub instead of the retired username/password form',async()=>{
 const html=await readFile('index.html','utf8');
 const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.end(html)}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname==='127.0.0.1')return route.continue();if(url.origin==='https://elab.dazzlingbegonia2.chatgpt.site')return route.fulfill({contentType:'text/html',body:'<h1>E.Lab Hub</h1>'});return route.abort()});
  await page.goto('http://127.0.0.1:'+server.address().port+'/E.Lab/',{waitUntil:'domcontentloaded'});
  await page.waitForURL('https://elab.dazzlingbegonia2.chatgpt.site/#panel',{timeout:1500});
  assert.equal(await page.locator('input[type=password]').count(),0);
  assert.match(html,/<a[^>]+href="https:\/\/elab\.dazzlingbegonia2\.chatgpt\.site\/#panel"/);
 }finally{await browser.close();server.close()}
});
