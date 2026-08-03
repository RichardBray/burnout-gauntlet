import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
const root = resolve('game');
const MIME = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json' };
const server = createServer(async (req,res)=>{
  try{ const p=decodeURIComponent(req.url.split('?')[0]);
    const body=await readFile(join(root,p==='/'?'/index.html':p));
    res.writeHead(200,{'content-type':MIME[extname(p)]||'application/octet-stream'}); res.end(body);
  }catch(e){ res.writeHead(404).end('nf'); }
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const port=server.address().port;
const browser=await chromium.launch({args:['--use-angle=metal','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:960,height:540}});
page.on('console',m=>console.log('[c]',m.type(),m.text().slice(0,400)));
page.on('pageerror',e=>console.log('[E]',String(e).slice(0,800)));
await page.goto(`http://127.0.0.1:${port}/index.html#scene=dusk-highway-chase&shot=1`,{waitUntil:'domcontentloaded'});
await page.waitForTimeout(40000);
console.log('ERRDIV:', await page.evaluate(()=>document.getElementById('err').textContent.slice(0,1500)));
console.log('ready:', await page.evaluate(()=>!!window.__ready));
// timed module imports
const mods=['util.js','sky.js','road.js','world.js','car.js','physics.js','camera.js','boost.js','damage.js','crash.js','hud.js','audio.js','scenes.js','post.js'];
for(const m of mods){
  const r = await page.evaluate(async (m)=>{ const t=performance.now(); try{ await import('./'+m); return [Math.round(performance.now()-t),'ok']; }catch(e){ return [Math.round(performance.now()-t), String(e).slice(0,200)]; } }, m);
  console.log('import', m, r);
}
await browser.close(); server.close();
