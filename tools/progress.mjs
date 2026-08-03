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

// ---- PLAYABILITY PIECES (wave S onward) -------------------------------------
// The visual bar is met and `reference/` is now a REGRESSION GATE, not a target, so
// the board's old shape — one piece per reference plate, judged by a blind call — no
// longer describes the work. These pieces are judged by PLAYING and by measuring frame
// time and handling numbers, so they have no plate and no blind call, and their verdict
// vocabulary is PASS / PARTIAL / FAIL rather than "real wins".
const PLAY = {
  'perf': 'holds 60 fps at 1280x720 real pixels',
  'handling': 'feels like Burnout Paradise, matched to researched numbers',
  'traffic': 'traffic that drives instead of a car park',
  'menu': 'start + Esc pause menu, scene knobs, discoverable controls',
  'fps-harness': 'the frame-time instrument itself',
  'research': 'the researched Burnout handling numbers',
};

/**
 * Numbers a piece wants on the board, carried INSIDE its own verdict file so they
 * cannot drift away from the evidence that produced them. A verdict may contain:
 *
 *     ```progress-metrics
 *     p50: 16.2 ms
 *     p99: 24.8 ms
 *     render: 1280x720 @ ratio 1.0
 *     ```
 *
 * Free-form `key: value` lines, rendered in order. This is deliberately not a fixed
 * schema: an fps piece and a handling piece have nothing in common to schematise, and
 * a schema would just get filled with nulls.
 */
function metricsOf(body) {
  const m = body.match(/```progress-metrics\r?\n([\s\S]*?)```/);
  if (!m) return null;
  const out = [];
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^\s*([^:]{1,48}):\s*(.+?)\s*$/);
    if (kv) out.push({ k: kv[1].trim(), v: kv[2].trim() });
  }
  return out.length ? out : null;
}

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
    (pieces[piece] ??= []).push({
      wave: letter, kind: verdict ? 'critic' : 'builder', verdict, blind,
      metrics: metricsOf(body),
    });
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

// A playability piece's builder rounds land in `<piece>.md` and its critic rounds in
// `<piece>-critic.md`, so its history is the union of the two, ordered by wave. Metrics
// come from the newest round that carries any, critic before builder within a wave —
// the critic re-derives every number independently, so where both quote one, the
// critic's is the one that has been checked.
const playBoard = Object.entries(PLAY).map(([piece, goal]) => {
  const built = (pieces[piece] ?? []).map(h => ({ ...h, kind: 'builder' }));
  const judged = (pieces[`${piece}-critic`] ?? []).map(h => ({ ...h, kind: 'critic' }));
  const hist = [...built, ...judged].sort((a, b) =>
    a.wave === b.wave ? (a.kind === 'builder' ? -1 : 1) : (a.wave < b.wave ? -1 : 1));
  const last = judged.at(-1);
  const withMetrics = [...hist].reverse().find(h => h.metrics);
  return {
    piece, goal,
    rounds: judged.length,
    verdict: last?.verdict ?? (built.length ? 'built, not yet judged' : 'not started'),
    waves: hist.map(h => h.wave + (h.kind === 'critic' ? '' : '*')).join(' '),
    building: hist.at(-1)?.kind === 'builder',
    metrics: withMetrics?.metrics ?? null,
    metricsFrom: withMetrics ? `wave ${withMetrics.wave} ${withMetrics.kind}` : null,
  };
});

const out = {
  generated: new Date().toISOString(),
  waves,
  currentWave: waves.at(-1),
  play: playBoard,
  pieces: board,
};
writeFileSync(join(root, 'progress.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`progress.json: ${playBoard.length} playability pieces ` +
  `(${playBoard.filter(p => /^PASS/i.test(p.verdict)).length} passing), ` +
  `${board.length} visual pieces, waves ${waves.join(',')}, ` +
  `${board.filter(p => p.retired).length} retired, ${board.filter(p => p.building).length} building`);
