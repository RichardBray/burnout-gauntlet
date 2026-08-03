(() => {
  const g = window.__game, cam = g.camRig.camera;
  cam.updateMatrixWorld(true);
  const W = 1920, H = 1080;
  const car = g.car.group;
  car.updateWorldMatrix(true, true);
  const P = cam.position.constructor;
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, roofY = 1e9;
  let roofP = null, cpP = null;
  car.traverse((o) => {
    if (!o.isMesh || !o.visible || !o.geometry) return;
    const a = o.geometry.attributes.position; if (!a) return;
    const isBody = a.count > 1000;   // the lofted shell/livery: the true roofline
    for (let i = 0; i < a.count; i++) {
      const p = new P(a.getX(i), a.getY(i), a.getZ(i));
      o.localToWorld(p);
      const q = p.clone().project(cam);
      if (q.z < -1 || q.z > 1) continue;
      const sx = (q.x * 0.5 + 0.5) * W, sy = (1 - (q.y * 0.5 + 0.5)) * H;
      if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (isBody && sy < roofY) { roofY = sy; roofP = { y: +p.y.toFixed(3) }; }
      if (sy > maxY) { maxY = sy; cpP = { y: +p.y.toFixed(3) }; }
    }
  });
  const fwd = new P(0, 0, -1).applyQuaternion(cam.quaternion);
  const hq = new P(cam.position.x + fwd.x * 1e5, cam.position.y, cam.position.z + fwd.z * 1e5).project(cam);
  const horizonY = (1 - (hq.y * 0.5 + 0.5)) * H;
  const roofGap = (roofY - horizonY) / H;
  const silGap = (minY - horizonY) / H;
  const cpGap = (maxY - horizonY) / H;
  return JSON.stringify({
    camH: +cam.position.y.toFixed(3), fov: +cam.fov.toFixed(2),
    horizonPct: +(horizonY / H * 100).toFixed(2),
    roofPct: +(roofY / H * 100).toFixed(2),
    silPct: +(minY / H * 100).toFixed(2),
    contactPct: +(maxY / H * 100).toFixed(2),
    carWidthPct: +((maxX - minX) / W * 100).toFixed(2),
    roofGapPct: +(roofGap * 100).toFixed(2),
    silGapPct: +(silGap * 100).toFixed(2),
    invariant: +(roofGap / cpGap).toFixed(3),
    silInvariant: +(silGap / cpGap).toFixed(3),
    roofH: roofP, lowH: cpP,
  });
})()
