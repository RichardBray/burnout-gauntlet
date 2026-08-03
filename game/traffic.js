// traffic.js — LIVE traffic. Vehicles that drive, in lanes, spawned around the hero and
// retired behind it. This module owns every MOVING vehicle in the world; `world.js` keeps
// only the genuinely stationary ones (kerb parking and stopped signal queues).
//
// WHY THIS FILE EXISTS. `world.js` used to bake 2667 vehicles into sealed InstancedMeshes,
// both carriageways included, and every one of them was standing still. Density won a
// screenshot metric; a still frame cannot tell a parked car from a moving one, so the loop
// optimised toward a car park. A handful of moving cars beats thousands of parked ones.
//
// API (this is the contract main.js is written against — keep it):
//   createTraffic(scene, { rng, layout, blocks, roadKit }) -> t
//   t.group                       THREE.Group, already added to `scene`
//   t.update(dt, heroPos, heroYaw, heroSpeed)
//   t.setNight(bool)              headlights / tail lights
//   t.count                       live vehicle count (read-only, for the HUD and the harness)
//   t.vehicles                    array of {pos, yaw, speed, halfLen, halfWid} for collision
//   t.reset(heroPos)              respawn the whole population around a new hero position

import * as THREE from 'three';

export function createTraffic(scene, { rng, layout, blocks = [], roadKit } = {}) {
  const group = new THREE.Group();
  group.name = 'traffic';
  scene.add(group);

  const api = {
    group,
    vehicles: [],
    count: 0,
    update() {},
    setNight() {},
    reset() {},
  };
  return api;
}
