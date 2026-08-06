// _t14-check.mjs - T14 acceptance probe. Boots the REAL start menu (no #nomenu=1) and
// asserts the five scored criteria: render-scale block gone, Enter starts with audio
// unlocked, Enter resumes from pause, mouse start still works, both caps still bind.
//
// JUDGEMENT CALL: the brief says "dispatch an Enter keydown", but a synthetic
// dispatchEvent(KeyboardEvent) has isTrusted=false and browsers refuse to unlock WebAudio
// for it. The whole point of criterion 3 is verifying the keypress IS a gesture, so the
// probe uses page.keyboard.press (a trusted CDP key event) rather than dispatchEvent.
// A dispatchEvent probe would pass structurally and silently miss a regression that a
// real keypress would expose - the exact failure mode the brief warns about.
//
// Usage: node tools/_t14-check.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(dirname(new URL(import.meta.url).pathname), '../game');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.hdr': 'application/octet-stream',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = createServer(async (req, res) => {
  try {
    const rel = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    const buf = await readFile(join(root, rel === '/' ? 'index.html' : rel));
    res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream' });
    res.end(buf);
  } catch { res.writeHead(404); res.end('nope'); }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--mute-audio', '--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));

// Hook the AudioContext constructor BEFORE any page script runs, so every context the game
// creates is reachable for a state check. This is the only way to assert "running, not
// suspended" without editing music.js (not our file) to expose its private `actx`.
await page.addInitScript(() => {
  window.__actxs = [];
  const Orig = window.AudioContext || window.webkitAudioContext;
  if (!Orig) return;
  class HookedAC extends Orig {
    constructor(...a) { super(...a); window.__actxs.push(this); }
  }
  window.AudioContext = HookedAC;
  if (window.webkitAudioContext) window.webkitAudioContext = HookedAC;
});

// No #nomenu=1: the start menu must be visible for this task.
await page.goto(`http://127.0.0.1:${port}/index.html`);
await page.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
await page.waitForTimeout(400);

const fail = [];
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail.push(msg); };

// 1. clean boot
ok(errors.length === 0, `no console errors at boot${errors.length ? ` — ${errors.slice(0, 3).join(' | ')}` : ''}`);

// helper: is the start/pause menu currently open?
const menuOpen = () => page.evaluate(() => window.__game && window.__game.menu ? window.__game.menu.isOpen() : null);

// 2. render-scale row gone (the whole block, not just the slider)
const dom = await page.evaluate(() => {
  const res = document.querySelector('#bgmenu [data-opt="res"]');
  const cap = document.querySelector('#bgmenu [data-opt="cap"]');
  const card = document.querySelector('#bgmenu .card');
  return {
    resGone: res === null,
    capPresent: cap !== null,
    valCssGone: !document.getElementById('bg-menu-style')?.textContent.includes('#bgmenu .val'),
    cardHeight: card ? card.getBoundingClientRect().height : null,
  };
});
ok(dom.resGone, 'render-scale row (data-opt=res) is absent from the DOM');
ok(dom.capPresent, '720p/1080p cap row (data-opt=cap) is still present');
ok(dom.valCssGone, 'orphaned #bgmenu .val CSS rule is gone');

// 3. 720p and 1080p both still bind the internal size, slider gone. Drive the actual chips.
const cap1080 = await page.evaluate(() => {
  const row = document.querySelector('#bgmenu [data-opt="cap"]');
  const btn = [...row.querySelectorAll('button')].find((b) => b.dataset.value === '1080');
  btn.click();
  return window.__game.renderSize();
});
await page.waitForTimeout(80);
const cap720 = await page.evaluate(() => {
  const row = document.querySelector('#bgmenu [data-opt="cap"]');
  const btn = [...row.querySelectorAll('button')].find((b) => b.dataset.value === '720');
  btn.click();
  return window.__game.renderSize();
});
await page.waitForTimeout(80);
ok(cap1080.cap === 1080 && cap1080.h <= 1080, `1080p chip sets internal cap (cap=${cap1080.cap}, h=${Math.round(cap1080.h)})`);
ok(cap720.cap === 720 && cap720.h <= 720, `720p chip sets internal cap (cap=${cap720.cap}, h=${Math.round(cap720.h)})`);

// 4. ENTER starts the game AND unlocks audio. Trusted keypress via page.keyboard so the
//    gesture satisfies WebAudio's isTrusted gate; a synthetic dispatchEvent would not.
ok(await menuOpen() === true, 'start menu is open before Enter');
await page.keyboard.press('Enter');
await page.waitForFunction(() => !window.__game.menu.isOpen(), null, { timeout: 5000 });
await page.waitForTimeout(250);

// audio state. resume() is async, so poll for 'running' up to ~3s.
const audio = await page.evaluate(async () => {
  const ctxs = window.__actxs || [];
  const t0 = performance.now();
  let states = ctxs.map((c) => c.state);
  while (states.some((s) => s !== 'closed' && s !== 'running') && performance.now() - t0 < 3000) {
    await new Promise((r) => setTimeout(r, 60));
    states = ctxs.map((c) => c.state);
  }
  return {
    n: ctxs.length,
    states,
    musicUnlocked: window.__game.music.info().unlocked,
    musicUnlockCount: window.__game.music.info().unlockCount,
    isPaused: window.__game.isPaused(),
  };
}, []);
ok(await menuOpen() === false, 'Enter closed the start menu (onStart fired)');
ok(audio.isPaused === false, 'game is unpaused after Enter');
ok(audio.musicUnlocked === true, `music.unlock() ran (unlockCount=${audio.musicUnlockCount})`);
ok(audio.n > 0 && audio.states.every((s) => s === 'running'),
   `all ${audio.n} AudioContext(s) running, none suspended (states=${JSON.stringify(audio.states)})`);

// 5. ENTER resumes from the pause menu. Open with Esc, then Enter to close.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
ok(await menuOpen() === true, 'Esc opens the pause menu');
await page.keyboard.press('Enter');
await page.waitForFunction(() => !window.__game.menu.isOpen(), null, { timeout: 5000 });
await page.waitForTimeout(150);
ok(await menuOpen() === false, 'Enter resumes from the pause menu');

// 6. mouse start still works. Restart path: open pause, then click the Resume button.
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.click('#bgmenu .go');
await page.waitForFunction(() => !window.__game.menu.isOpen(), null, { timeout: 5000 });
await page.waitForTimeout(150);
ok(await menuOpen() === false, 'mouse click on the primary button still closes the menu');

await browser.close();
server.close();
console.log(fail.length ? `\n${fail.length} FAILED` : '\nall checks passed');
process.exit(fail.length ? 1 : 0);
