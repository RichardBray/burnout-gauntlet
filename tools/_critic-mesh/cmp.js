// Independent critic harness for wave-T generate-mesh S0+S1.
// Builds HEAD's city (77d8d71 bytes of world.js + road.js + util.js) and the working tree's
// city side by side in one page, and compares every drawn instance.
//
// Deliberately NOT the builder's script. Written from the claim, not from their harness.

import * as THREE from 'three';
import { createRoadKit as newRoadKit } from '/road.js';
import { createWorld as newCreateWorld } from '/world.js';
import { makeRng as newMakeRng } from '/util.js';
import { createRoadKit as headRoadKit } from './head-road.js';
import { createWorld as headCreateWorld } from './head-world.js';
import { makeRng as headMakeRng } from './head-util.js';

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl'), antialias: false });

function build(which) {
  const mk = which === 'head' ? headMakeRng : newMakeRng;
  const kit = (which === 'head' ? headRoadKit : newRoadKit)(mk(0xA5FA17), { renderer });
  const scene = new THREE.Scene();
  const world = (which === 'head' ? headCreateWorld : newCreateWorld)(scene, { rng: mk(0xC17E), roadKit: kit });
  return { scene, world, kit };
}

// ---- structural signatures. Must mean the same thing in two independently built worlds,
// so no uuids anywhere.
function geoSig(g) {
  const a = g.attributes;
  const parts = [g.type];
  if (g.parameters) parts.push(JSON.stringify(g.parameters));
  parts.push(`i${g.index ? g.index.count : -1}`);
  for (const k of Object.keys(a).sort()) parts.push(`${k}:${a[k].itemSize}x${a[k].count}`);
  // hash the actual position buffer so two different-but-same-shaped geometries separate
  const p = a.position ? a.position.array : null;
  let h = 2166136261;
  if (p) for (let i = 0; i < p.length; i++) { h ^= Math.fround(p[i]) * 1e6 | 0; h = Math.imul(h, 16777619); }
  parts.push(`h${h >>> 0}`);
  return parts.join('|');
}
const texSig = (t) => (!t ? '-' : `${t.image ? (t.image.width + 'x' + t.image.height) : '?'}` +
  `:${t.wrapS},${t.wrapT},${t.repeat.x},${t.repeat.y},${t.colorSpace},${t.flipY ? 1 : 0}`);
function matSig(m) {
  return [m.type, m.color && m.color.getHexString(), m.roughness, m.metalness, m.transparent ? 1 : 0,
    m.opacity, m.side, m.emissive && m.emissive.getHexString(), m.emissiveIntensity,
    m.vertexColors ? 1 : 0, m.toneMapped ? 1 : 0, m.depthWrite ? 1 : 0, m.depthTest ? 1 : 0,
    m.alphaTest, m.blending, m.envMapIntensity, m.fog ? 1 : 0, m.flatShading ? 1 : 0,
    m.polygonOffset ? 1 : 0, m.polygonOffsetFactor, m.polygonOffsetUnits,
    'map' + texSig(m.map), 'am' + texSig(m.alphaMap), 'em' + texSig(m.emissiveMap),
    'nm' + texSig(m.normalMap), 'rm' + texSig(m.roughnessMap), 'mm' + texSig(m.metalnessMap),
  ].join('|');
}
const stateSig = (o) => `${geoSig(o.geometry)}##${matSig(o.material)}##` +
  `${o.castShadow ? 1 : 0}${o.receiveShadow ? 1 : 0}|ro${o.renderOrder}|fc${o.frustumCulled ? 1 : 0}`;

function worldVisible(o) { let p = o; while (p) { if (!p.visible) return false; p = p.parent; } return true; }

function harvest(group) {
  const all = [];
  group.traverse((o) => { if (o.isInstancedMesh) all.push(o); });
  const drawn = all.filter((o) => o.count >= 1 && o.layers.mask !== 0);
  return { all, drawn };
}

const _c = new THREE.Color();
function rows(o) {
  // one row per instance: 16 matrix floats + 3 colour floats, exactly as uploaded
  const out = [];
  const ma = o.instanceMatrix.array, ca = o.instanceColor ? o.instanceColor.array : null;
  for (let i = 0; i < o.count; i++) {
    const r = new Array(19);
    for (let k = 0; k < 16; k++) r[k] = ma[i * 16 + k];
    r[16] = ca ? ca[i * 3] : 1; r[17] = ca ? ca[i * 3 + 1] : 1; r[18] = ca ? ca[i * 3 + 2] : 1;
    out.push(r);
  }
  return out;
}
const rowKey = (r) => r.join(',');

function census(group, label) {
  const { all, drawn } = harvest(group);
  let instAll = 0, instDrawn = 0, tris = 0, zeroed = 0, zeroedWasCap = 0;
  const geos = new Set(), states = new Set(), byName = {};
  for (const o of all) {
    instAll += o.count;
    if (o.count === 0) zeroed++;
    if (o.count === 0 && o.layers.mask === 0) zeroedWasCap++;
  }
  for (const o of drawn) {
    instDrawn += o.count;
    geos.add(o.geometry.uuid); states.add(stateSig(o));
    const g = o.geometry;
    tris += o.count * (g.index ? g.index.count : g.attributes.position.count) / 3;
    byName[o.name || '(unnamed)'] = (byName[o.name || '(unnamed)'] || 0) + o.count;
  }
  return { label, meshesAll: all.length, meshesDrawn: drawn.length, instAll, instDrawn,
    zeroedMeshes: zeroed, zeroedAndLayerDisabled: zeroedWasCap, tris,
    geometries: geos.size, drawStates: states.size, byName };
}

function comparePair(A, B, poison) {
  const a = harvest(A).drawn, b = harvest(B).drawn;
  const res = { meshesA: a.length, meshesB: b.length,
    instA: a.reduce((s, o) => s + o.count, 0), instB: b.reduce((s, o) => s + o.count, 0) };

  // ---- ORDERED: k-th traversed mesh vs k-th traversed mesh
  let shapeMismatch = 0, valsOrdered = 0, diffOrdered = 0;
  const firstDiffs = [];
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k++) {
    const oa = a[k], ob = b[k];
    if (stateSig(oa) !== stateSig(ob) || oa.count !== ob.count) {
      shapeMismatch++;
      if (firstDiffs.length < 8) firstDiffs.push({ kind: 'shape', k, a: oa.name, b: ob.name,
        ca: oa.count, cb: ob.count, sigEq: stateSig(oa) === stateSig(ob) });
      continue;
    }
    const ra = rows(oa), rb = rows(ob);
    for (let i = 0; i < ra.length; i++) {
      for (let j = 0; j < 19; j++) {
        valsOrdered++;
        let va = ra[i][j], vb = rb[i][j];
        if (poison && k === 0 && i === 0 && j === 12) vb = vb + 1e-4;
        if (!Object.is(va, vb)) {
          diffOrdered++;
          if (firstDiffs.length < 8) firstDiffs.push({ kind: 'val', k, name: oa.name, i, j, va, vb });
        }
      }
    }
  }
  res.orderedShapeMismatches = shapeMismatch;
  res.orderedValsCompared = valsOrdered;
  res.orderedDiffs = diffOrdered;
  res.firstDiffs = firstDiffs;

  // ---- UNORDERED MULTISET over (drawstate, instance row). Independent of traversal and of
  // which mesh an instance ended up in, so it survives a legitimate re-cut.
  const bag = (list) => {
    const m = new Map();
    for (const o of list) {
      const s = stateSig(o);
      for (const r of rows(o)) { const k = s + '@' + rowKey(r); m.set(k, (m.get(k) || 0) + 1); }
    }
    return m;
  };
  const ba = bag(a), bb = bag(b);
  let onlyA = 0, onlyB = 0, keys = new Set([...ba.keys(), ...bb.keys()]);
  const samples = [];
  for (const k of keys) {
    const x = ba.get(k) || 0, y = bb.get(k) || 0;
    if (x > y) { onlyA += x - y; if (samples.length < 5) samples.push({ side: 'A', k: k.slice(-140), x, y }); }
    if (y > x) { onlyB += y - x; if (samples.length < 5) samples.push({ side: 'B', k: k.slice(-140), x, y }); }
  }
  res.multisetOnlyA = onlyA;
  res.multisetOnlyB = onlyB;
  res.multisetDistinctRows = keys.size;
  res.multisetSamples = samples;

  // ---- per draw state, instance counts
  const perState = (list) => { const m = new Map();
    for (const o of list) m.set(stateSig(o), (m.get(stateSig(o)) || 0) + o.count); return m; };
  const pa = perState(a), pb = perState(b);
  let stateMismatch = 0; const stateDetail = [];
  for (const k of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(k) || 0, y = pb.get(k) || 0;
    if (x !== y) { stateMismatch++; if (stateDetail.length < 10) stateDetail.push({ x, y, k: k.slice(0, 90) }); }
  }
  res.drawStatesA = pa.size; res.drawStatesB = pb.size;
  res.drawStateCountMismatches = stateMismatch; res.drawStateDetail = stateDetail;
  return res;
}

// ---- PLAIN (non-instanced) meshes. 567 of them at HEAD: every road ribbon, kerb, block
// slab, rail, deck and smear. The instance comparison above cannot see any of these, and
// S0 rewrote buildRibbon, so they need comparing element by element too.
function harvestPlain(group) {
  const out = [];
  group.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) out.push(o); });
  return out;
}
function comparePlain(A, B, poison) {
  const a = harvestPlain(A), b = harvestPlain(B);
  const res = { countA: a.length, countB: b.length, shapeMismatches: 0, valsCompared: 0,
    diffs: 0, first: [], vertsA: 0, trisA: 0 };
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k++) {
    const oa = a[k], ob = b[k];
    const ga = oa.geometry, gb = ob.geometry;
    const bad = (why, extra) => { res.shapeMismatches++;
      if (res.first.length < 10) res.first.push({ k, why, na: oa.name, nb: ob.name, ...extra }); };
    if (matSig(oa.material) !== matSig(ob.material)) { bad('material'); continue; }
    if (oa.material !== ob.material && oa.material.constructor !== ob.material.constructor) { bad('matClass'); continue; }
    if ((oa.castShadow !== ob.castShadow) || (oa.receiveShadow !== ob.receiveShadow)
      || (oa.renderOrder !== ob.renderOrder) || (oa.frustumCulled !== ob.frustumCulled)
      || (!!oa.onBeforeRender !== !!ob.onBeforeRender) || (oa.visible !== ob.visible)) {
      bad('flags', { a: [oa.castShadow, oa.receiveShadow, oa.renderOrder, oa.frustumCulled, !!oa.onBeforeRender, oa.visible],
        b: [ob.castShadow, ob.receiveShadow, ob.renderOrder, ob.frustumCulled, !!ob.onBeforeRender, ob.visible] });
      continue;
    }
    if (JSON.stringify(oa.userData) !== JSON.stringify(ob.userData)) {
      bad('userData', { a: JSON.stringify(oa.userData), b: JSON.stringify(ob.userData) }); continue;
    }
    const ka = Object.keys(ga.attributes).sort().join(), kb = Object.keys(gb.attributes).sort().join();
    if (ka !== kb) { bad('attrs', { a: ka, b: kb }); continue; }
    let shape = false;
    for (const key of Object.keys(ga.attributes).sort()) {
      const xa = ga.attributes[key], xb = gb.attributes[key];
      if (xa.count !== xb.count || xa.itemSize !== xb.itemSize
        || xa.array.constructor !== xb.array.constructor) {
        bad('attr:' + key, { a: xa.count, b: xb.count,
          ta: xa.array.constructor.name, tb: xb.array.constructor.name }); shape = true; break; }
    }
    if (shape) continue;
    if (!!ga.index !== !!gb.index || (ga.index && (ga.index.count !== gb.index.count
      || ga.index.array.constructor !== gb.index.array.constructor))) { bad('index'); continue; }
    // world transform, so a reparent that moves geometry is caught
    oa.updateWorldMatrix(true, false); ob.updateWorldMatrix(true, false);
    for (let i = 0; i < 16; i++) {
      res.valsCompared++;
      if (!Object.is(oa.matrixWorld.elements[i], ob.matrixWorld.elements[i])) {
        res.diffs++;
        if (res.first.length < 10) res.first.push({ k, why: 'matrixWorld', i,
          va: oa.matrixWorld.elements[i], vb: ob.matrixWorld.elements[i] });
      }
    }
    for (const key of Object.keys(ga.attributes).sort()) {
      const xa = ga.attributes[key].array, xb = gb.attributes[key].array;
      if (key === 'position') { res.vertsA += ga.attributes[key].count; }
      for (let i = 0; i < xa.length; i++) {
        res.valsCompared++;
        let vb = xb[i];
        if (poison && k === 0 && key === 'position' && i === 0) vb = vb + 1e-3;
        if (!Object.is(xa[i], vb)) { res.diffs++;
          if (res.first.length < 10) res.first.push({ k, why: 'attr ' + key, i, va: xa[i], vb }); }
      }
    }
    if (ga.index) {
      res.trisA += ga.index.count / 3;
      const xa = ga.index.array, xb = gb.index.array;
      for (let i = 0; i < xa.length; i++) {
        res.valsCompared++;
        if (!Object.is(xa[i], xb[i])) { res.diffs++;
          if (res.first.length < 10) res.first.push({ k, why: 'index', i, va: xa[i], vb: xb[i] }); }
      }
    }
    const sa = ga.boundingSphere, sb = gb.boundingSphere;
    if (!!sa !== !!sb) bad('bsphere');
    else if (sa) {
      for (const f of ['x', 'y', 'z']) { res.valsCompared++;
        if (!Object.is(sa.center[f], sb.center[f])) { res.diffs++;
          if (res.first.length < 10) res.first.push({ k, why: 'bs.' + f, va: sa.center[f], vb: sb.center[f] }); } }
      res.valsCompared++;
      if (!Object.is(sa.radius, sb.radius)) { res.diffs++;
        if (res.first.length < 10) res.first.push({ k, why: 'bs.r', va: sa.radius, vb: sb.radius }); }
    }
  }
  return res;
}

export async function run() {
  const out = { moduleIdentity: {}, };

  // ---- PROOF THE TWO MODULES ARE NOT THE SAME MODULE ------------------------------
  out.moduleIdentity.sameCreateWorldFn = headCreateWorld === newCreateWorld;
  out.moduleIdentity.sameRoadKitFn = headRoadKit === newRoadKit;
  out.moduleIdentity.sameMakeRngFn = headMakeRng === newMakeRng;
  out.moduleIdentity.headSrcLen = (await (await fetch('./head-world.js')).text()).length;
  out.moduleIdentity.newSrcLen = (await (await fetch('/world.js')).text()).length;
  // util.js: cellHash exists only on the new tree (S0 deliverable)
  const hu = await import('./head-util.js'), nu = await import('/util.js');
  out.moduleIdentity.headHasCellHash = typeof hu.cellHash === 'function';
  out.moduleIdentity.newHasCellHash = typeof nu.cellHash === 'function';

  const H = build('head');
  const N = build('new');

  // decisive structural discriminator: HEAD publishes chunkStats as a plain object,
  // the new tree as a function.
  out.moduleIdentity.headChunkStatsType = typeof H.world.chunkStats;
  out.moduleIdentity.newChunkStatsType = typeof N.world.chunkStats;
  out.moduleIdentity.headChunkStats = typeof H.world.chunkStats === 'object' ? H.world.chunkStats : null;
  out.moduleIdentity.headHasReleaseHidden = typeof H.kit.releaseHidden;
  out.moduleIdentity.newHasReleaseHidden = typeof N.kit.releaseHidden;
  out.moduleIdentity.headHasRibbonInto = typeof H.kit.ribbonInto;
  out.moduleIdentity.newHasRibbonInto = typeof N.kit.ribbonInto;

  out.censusHead = census(H.world.group, 'head');
  out.censusNew = census(N.world.group, 'new');
  if (typeof N.world.chunkStats === 'function') out.newChunkStats = N.world.chunkStats();

  // whole-scene census (catches anything parented outside world.group)
  out.sceneCensusHead = census(H.scene, 'head-scene');
  out.sceneCensusNew = census(N.scene, 'new-scene');

  out.compare = comparePair(H.world.group, N.world.group, false);
  out.plain = comparePlain(H.world.group, N.world.group, false);
  out.plainPoison = comparePlain(H.world.group, N.world.group, true);
  out.reflHidden = { head: H.kit.reflHiddenLen ? H.kit.reflHiddenLen() : null,
    newLen: N.kit.reflHiddenLen ? N.kit.reflHiddenLen() : null };

  // ---- CONTROL 1: harness must detect a 1e-4 nudge on one matrix element.
  out.poisonControl = comparePair(H.world.group, N.world.group, true);

  // ---- CONTROL 2: HEAD vs a SECOND HEAD build. Must be zero, or the build is not
  // deterministic and the whole comparison is worthless.
  const H2 = build('head');
  out.headVsHead = comparePair(H.world.group, H2.world.group, false);

  // ---- the aoExclude / spillMesh handle survival check
  const aoN = N.world.aoExclude || [];
  out.aoExclude = {
    headLen: (H.world.aoExclude || []).length, newLen: aoN.length,
    newTypes: aoN.map((o) => (o.isGroup ? 'Group' : o.isInstancedMesh ? 'InstancedMesh' : o.type)),
    headTypes: (H.world.aoExclude || []).map((o) => (o.isGroup ? 'Group' : o.isInstancedMesh ? 'InstancedMesh' : o.type)),
  };
  // does hiding aoExclude[i] actually hide the drawn instances?
  const hideTest = (w) => {
    const before = harvest(w.group).drawn.filter(worldVisible).reduce((s, o) => s + o.count, 0);
    for (const o of (w.aoExclude || [])) o.visible = false;
    const after = harvest(w.group).drawn.filter(worldVisible).reduce((s, o) => s + o.count, 0);
    for (const o of (w.aoExclude || [])) o.visible = true;
    return { before, after, hidden: before - after };
  };
  out.aoExclude.hideHead = hideTest(H.world);
  out.aoExclude.hideNew = hideTest(N.world);

  // ---- setNight spill toggle survives?
  const spillTest = (w) => {
    const vis = () => harvest(w.group).drawn.filter(worldVisible).reduce((s, o) => s + o.count, 0);
    w.setNight(true); const on = vis();
    w.setNight(false); const off = vis();
    return { night: on, day: off, delta: on - off };
  };
  out.spillHead = spillTest(H.world);
  out.spillNew = spillTest(N.world);

  // ---- matrixWorldAutoUpdate: does the CODE opt out, and at what level?
  const mwau = (w) => {
    let groupsOff = 0, groupsOn = 0, total = 0;
    w.group.traverse((o) => { total++; if (o.matrixWorldAutoUpdate) groupsOn++; else groupsOff++; });
    return { rootAuto: w.group.matrixWorldAutoUpdate, total, off: groupsOff, on: groupsOn };
  };
  out.mwauHead = mwau(H.world);
  out.mwauNew = mwau(N.world);
  // A chunk Group added after boot: does it compose? simulate exactly the S2 path.
  const probeAdd = (w) => {
    const g = new THREE.Group(); g.position.set(123, 45, 67); w.group.add(g);
    // three's updateMatrixWorld from the scene root, as the render loop does it
    w.group.parent && w.group.parent.updateMatrixWorld();
    const before = g.matrixWorld.elements.slice(12, 15);
    g.updateMatrixWorld(true);
    const after = g.matrixWorld.elements.slice(12, 15);
    w.group.remove(g);
    return { beforeAutoCompose: before, afterForced: after };
  };
  out.chunkAddHead = probeAdd(H.world);
  out.chunkAddNew = probeAdd(N.world);

  // ---- POLEFALL: hide 5 lamps + 5 signals on each tree, count sunk instances
  const poleTest = (w) => {
    const lamps = w.poles.filter((p) => p.kind === 'lamp').slice(0, 5);
    const signals = w.poles.filter((p) => p.kind === 'signal').slice(0, 5);
    const snap = () => { const m = new Map();
      for (const o of harvest(w.group).drawn) {
        const ma = o.instanceMatrix.array; let c = 0;
        for (let i = 0; i < o.count; i++) if (ma[i * 16 + 13] < -500) c++;
        if (c) m.set(o.name + '#' + o.id, c);
      } return m; };
    const b = snap();
    for (const p of [...lamps, ...signals]) p.hide();
    const a = snap();
    let total = 0; const detail = {};
    for (const k of new Set([...a.keys(), ...b.keys()])) {
      const d = (a.get(k) || 0) - (b.get(k) || 0);
      if (d) { detail[k] = d; total += d; }
    }
    return { lamps: lamps.length, signals: signals.length, sunk: total, detail,
      poles: w.poles.length };
  };
  out.poleHead = poleTest(H.world);
  out.poleNew = poleTest(N.world);

  // ---- double-hide safety: call hide() twice, nothing extra should move
  const dbl = (w) => {
    const p = w.poles.filter((x) => x.kind === 'lamp')[7];
    const snap = () => { let c = 0; for (const o of harvest(w.group).drawn) {
      const ma = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) if (ma[i * 16 + 13] < -500) c++; } return c; };
    const b = snap(); p.hide(); const m1 = snap(); p.hide(); const m2 = snap();
    return { before: b, after1: m1, after2: m2 };
  };
  out.doubleHideNew = dbl(N.world);

  // ---- parked car hide (traffic.js promote path)
  const parkTest = (w) => {
    const list = w.parkedCars || [];
    const snap = () => { let c = 0; for (const o of harvest(w.group).drawn) {
      const ma = o.instanceMatrix.array;
      for (let i = 0; i < o.count; i++) if (ma[i * 16 + 13] < -500) c++; } return c; };
    const b = snap();
    for (const p of list.slice(0, 5)) if (p.hide) p.hide();
    return { n: list.length, before: b, after: snap() };
  };
  out.parkHead = parkTest(H.world);
  out.parkNew = parkTest(N.world);

  out.errors = window.__err;
  return out;
}
