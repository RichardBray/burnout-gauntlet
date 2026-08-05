// polefall.js — knockable street furniture (street lamps, traffic lights).
//
// The hero's car is deliberately UNAFFECTED by pole contact: no shunt, no speed loss. On
// contact the baked instanced pole is hidden (world.js poles[].hide()) and a dynamic copy
// from a small pool topples in the hero's direction of travel, hinged at its base, with an
// angular kick scaled by hero speed. Once flat it rests a beat, sinks through the road and
// is released — "erased once it is not visible" without any visibility query.
//
//   createPoleFall(scene, poles) -> pf
//   pf.update(dt, heroPos, hvx, hvz)   detection + animation, every sim tick
//   pf.activeCount                     probes/checks
//
// ponytail: contact is a base-radius disc test against the hero's centre — a pole is thin,
// the hero is car-sized, and a 1.3 m disc reads right in play. No OBB needed.

import * as THREE from 'three';
import { clamp } from './util.js';

const POOL = 6;          // simultaneous falling poles; oldest is stolen past that
const HIT_R = 1.3;       // m from pole base that counts as contact
const SPEED_MIN = 3;     // m/s of hero speed below which a nudge fells nothing
const REST_S = 0.45;     // s a felled pole lies flat before sinking
const SINK_V = 2.5;      // m/s it sinks through the road
const SINK_DEPTH = -10;  // y at which the slot is released

export function createPoleFall(scene, poles) {
  const group = new THREE.Group();
  group.name = 'poleFall';
  scene.add(group);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x565d66, roughness: 0.55, metalness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.7, metalness: 0.3 });
  const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  // Each slot: a base-pivoted group with pole/arm/head children re-posed per kind at knock
  // time. Geometry mirrors world.js's streetLight()/trafficLight() dimensions, arm along +x.
  const slots = [];
  for (let i = 0; i < POOL; i++) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(cylGeo, poleMat);
    const arm = new THREE.Mesh(boxGeo, poleMat);
    const head = new THREE.Mesh(boxGeo, darkMat);
    g.add(pole, arm, head);
    g.visible = false;
    group.add(g);
    slots.push({ g, pole, arm, head, live: false, t: 0, angle: 0, angVel: 0, phase: 'fall',
      axis: new THREE.Vector3(1, 0, 0), yawQ: new THREE.Quaternion(), q: new THREE.Quaternion() });
  }
  let next = 0;

  const KINDS = {
    lamp: { pole: [0, 4.5, 0, 0.28, 8.6, 0.28], arm: [1.2, 8.7, 0, 2.4, 0.16, 0.16], head: [2.3, 8.56, 0, 1.15, 0.24, 0.55] },
    signal: { pole: [0, 3.6, 0, 0.31, 6.8, 0.31], arm: [2.6, 6.75, 0, 5.4, 0.18, 0.18], head: [4.9, 6.05, 0, 0.52, 1.5, 0.44] },
  };

  function pose(mesh, [x, y, z, sx, sy, sz]) {
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
  }

  function knock(p, hvx, hvz) {
    p.hit = true;
    p.hide();
    const s = slots[next];
    next = (next + 1) % POOL;
    const k = KINDS[p.kind] || KINDS.lamp;
    pose(s.pole, k.pole); pose(s.arm, k.arm); pose(s.head, k.head);
    s.g.position.set(p.x, 0, p.z);
    s.g.visible = true;
    s.live = true;
    s.phase = 'fall';
    s.t = 0;
    s.angle = 0;
    const sp = Math.hypot(hvx, hvz) || 1;
    s.angVel = clamp(0.3 + sp * 0.07, 0.8, 3.2);
    // hinge axis: up x travel dir, so the top tips the way the hero was going
    s.axis.set(hvz / sp, 0, -hvx / sp);
    s.yawQ.setFromAxisAngle(_UP, p.rotY);
    s.g.quaternion.copy(s.yawQ);
  }

  const _UP = new THREE.Vector3(0, 1, 0);

  return {
    get activeCount() { let n = 0; for (const s of slots) if (s.live) n++; return n; },

    update(dt, heroPos, hvx, hvz) {
      if (dt > 0 && Math.hypot(hvx, hvz) > SPEED_MIN) {
        const hx = heroPos.x, hz = heroPos.z;
        for (const p of poles) {
          if (p.hit) continue;
          const dx = hx - p.x, dz = hz - p.z;
          if (dx * dx + dz * dz < HIT_R * HIT_R) knock(p, hvx, hvz);
        }
      }
      for (const s of slots) {
        if (!s.live) continue;
        if (s.phase === 'fall') {
          // gravity torque grows as it leans; a small floor keeps a slow clip from stalling
          s.angVel += (0.6 + 5.5 * Math.sin(s.angle)) * dt;
          s.angle += s.angVel * dt;
          if (s.angle >= Math.PI / 2 - 0.06) {
            s.angle = Math.PI / 2 - 0.06;
            s.phase = 'rest';
            s.t = 0;
          }
          s.q.setFromAxisAngle(s.axis, s.angle);
          s.g.quaternion.multiplyQuaternions(s.q, s.yawQ);
        } else if (s.phase === 'rest') {
          s.t += dt;
          if (s.t >= REST_S) s.phase = 'sink';
        } else {
          s.g.position.y -= SINK_V * dt;
          if (s.g.position.y < SINK_DEPTH) { s.live = false; s.g.visible = false; }
        }
      }
    },
  };
}
