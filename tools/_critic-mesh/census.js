// Census a single historical world.js: how many InstancedMeshes and instances does
// createWorld put in world.group? Used to chase the 203,540 vs 199,311 gap, and to
// re-measure push()'s silent drops on an instrumented HEAD checkout.
import * as THREE from 'three';

const ref = new URLSearchParams(location.search).get('ref');
const { createRoadKit } = await import(`./v-${ref}/road.js`);
const { createWorld } = await import(`./v-${ref}/world.js`);
const { makeRng } = await import(`./v-${ref}/util.js`);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('gl') });

export function run() {
  const kit = createRoadKit(makeRng(0xA5FA17), { renderer });
  const scene = new THREE.Scene();
  const w = createWorld(scene, { rng: makeRng(0xC17E), roadKit: kit });
  let meshes = 0, inst = 0, drawn = 0, drawnInst = 0, tris = 0;
  const byName = {};
  w.group.traverse((o) => {
    if (!o.isInstancedMesh) return;
    meshes++; inst += o.count;
    if (o.count >= 1 && o.layers.mask !== 0) {
      drawn++; drawnInst += o.count;
      const g = o.geometry;
      tris += o.count * (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
    const n = o.name || '(unnamed)';
    byName[n] = (byName[n] || 0) + o.count;
  });
  const C = globalThis.__CRITIC;
  return { ref, meshes, inst, drawn, drawnInst, tris, byName,
    chunkStats: typeof w.chunkStats === 'function' ? w.chunkStats() : w.chunkStats,
    parkedCars: (w.parkedCars || []).length, poles: (w.poles || []).length,
    lamps: (w.lampPositions || []).length, neons: (w.neons || []).length,
    critic: C ? { drops: C.drops, dropPools: C.dropPools, guardDrops: C.guardDrops,
      nPools: C.pools.length,
      sumPre: C.preCut.reduce((a, p) => a + p.count, 0),
      full: C.preCut.filter((p) => p.full),
      near: C.preCut.filter((p) => p.count > p.cap * 0.8).map((p) => `${p.tag} ${p.count}/${p.cap}`),
      preCut: C.preCut, otherIM: C.otherIM } : null };
}
