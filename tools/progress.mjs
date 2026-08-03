#!/usr/bin/env node
// Generate progress.json for the live board.
//
// WHY THIS EXISTS: progress.html used to screen-scrape a markdown table out of
// STATE.md. That table's column layout changed around wave M and the board went
// silently blank for several waves — it kept rendering "0 pieces" and nobody
// noticed, because a blank board looks like a page that just has not loaded yet.
// Disk is the source of truth for this project, so derive the board from disk:
// verdicts/wave-<letter>/<piece>.md is written by every critic and every builder,
// so the wave letters a piece appears in ARE its round history.
//
// Run: node tools/progress.mjs   (also called by tools/refresh-latest.sh)

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// piece -> reference scene id used for its blind comparison. `audio` is compared
// by ear against reference/audio/, so it has no plate.
const SCENE = {
  'sky-lighting': 'dusk-highway-chase',
  'road-surface': 'wet-night-asphalt',
  'car-paint': 'car-paint-closeup',
  'environment': 'daytime-downtown',
  'chase-camera': 'dusk-highway-chase',
  'boost-fx': 'boost-blur',
  'crash-cam': 'crash-cam',
  'damage-model': 'crash-cam',
  'hud': 'hud-overlay',
  'audio': null,
};

// Pieces the project has formally stopped working on, with the reason. A retired
// piece still shows on the board — hiding finished work makes the board lie about
// how much of the game has actually been judged.
const RETIRED = {
  'chase-camera': 'critic could not tell — retired at wave m',
};

const waves = readdirSync(join(root, 'verdicts'))
  .filter(d => /^wave-[a-z]$/.test(d))
  .sort(); // wave-k < wave-l < ... lexicographic is chronological here

const pieces = {};
for (const wave of waves) {
  const letter = wave.slice(-1);
  for (const f of readdirSync(join(root, 'verdicts', wave))) {
    if (!f.endsWith('.md')) continue;
    const piece = f.slice(0, -3);
    const body = readFileSync(join(root, 'verdicts', wave, f), 'utf8');
    // Critic files carry `VERDICT: <call>`; builder files do not. That single
    // field is what distinguishes a judged round from a built one.
    // Critics write the verdict with varying emphasis (`**real wins**`, `real wins`).
    // Strip the markdown so the board's pill styling and its /real wins/ test both
    // see one canonical form.
    const verdict = body.match(/^VERDICT:\s*(.+)$/m)?.[1].replace(/[*_`]/g, '').trim() ?? null;
    const blind = body.match(/^BLIND CALL:\s*([\s\S]+?)(?:\n\n|\nVERDICT:)/m)?.[1]
      .replace(/\s+/g, ' ').trim() ?? null;
    (pieces[piece] ??= []).push({ wave: letter, kind: verdict ? 'critic' : 'builder', verdict, blind });
  }
}

const shot = piece => {
  const p = `shots/${piece}-latest.png`;
  return existsSync(join(root, p)) ? { path: p, mtime: statSync(join(root, p)).mtimeMs } : null;
};

const board = Object.keys(SCENE).map(piece => {
  const hist = pieces[piece] ?? [];
  const judged = hist.filter(h => h.kind === 'critic');
  const last = judged.at(-1);
  const scene = SCENE[piece];
  return {
    piece,
    scene,
    // Round count is the number of CRITIC rounds — a piece is only "a round in"
    // once something independent has judged it.
    rounds: judged.length,
    latestRound: last ? `${last.wave}${judged.filter(h => h.wave === last.wave).length}` : null,
    verdict: RETIRED[piece] ?? last?.verdict ?? 'not yet judged',
    retired: piece in RETIRED,
    blind: last?.blind ?? null,
    waves: hist.map(h => h.wave + (h.kind === 'critic' ? '' : '*')).join(' '),
    // A wave letter present with no critic entry means a builder has landed a
    // change that has not been judged yet — that is the "building" state.
    building: hist.at(-1)?.kind === 'builder',
    ours: shot(piece),
    ref: scene ? `reference/${scene}-01.jpg` : null,
  };
});

const out = {
  generated: new Date().toISOString(),
  waves,
  currentWave: waves.at(-1),
  pieces: board,
};
writeFileSync(join(root, 'progress.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`progress.json: ${board.length} pieces, waves ${waves.join(',')}, ` +
  `${board.filter(p => p.retired).length} retired, ${board.filter(p => p.building).length} building`);
