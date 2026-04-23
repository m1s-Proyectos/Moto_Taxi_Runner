import * as THREE from 'three';

/**
 * Fondo urbano liviano: instancias + aceras. Sin texturas ni GLB (Vibe Jam: carga instantánea).
 * Estética: estuco / concreto cálido con acentos (no gris genérico).
 */

const BUILDING_PALETTE = [
  0xd4a574, 0xc9a088, 0xe8dcc4, 0xb8956a, 0x8b7355, 0xa67c52, 0x7c6f64, 0x9c6644, 0x2a9d8f,
  0xcdb4a0,
];

function detRand(i: number, j: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233 + 42.42) * 43758.5453;
  return s - Math.floor(s);
}

export function addCityscape(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'cityscape';

  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a52,
    roughness: 0.92,
    metalness: 0.04,
  });
  const swLen = 304;
  const swZ = -96;
  const swGeo = new THREE.PlaneGeometry(5.2, swLen);
  const swL = new THREE.Mesh(swGeo, sidewalkMat);
  swL.rotation.x = -Math.PI / 2;
  swL.position.set(-11.8, 0.008, swZ);
  root.add(swL);
  const swR = new THREE.Mesh(swGeo, sidewalkMat);
  swR.rotation.x = -Math.PI / 2;
  swR.position.set(11.8, 0.008, swZ);
  root.add(swR);

  const curbMat = new THREE.MeshStandardMaterial({
    color: 0x6b7280,
    roughness: 0.75,
    metalness: 0.12,
  });
  const curbGeo = new THREE.BoxGeometry(0.22, 0.14, swLen);
  const curbL = new THREE.Mesh(curbGeo, curbMat);
  curbL.position.set(-9.05, 0.07, swZ);
  root.add(curbL);
  const curbR = new THREE.Mesh(curbGeo, curbMat);
  curbR.position.set(9.05, 0.07, swZ);
  root.add(curbR);

  const maxCount = 160;
  const geom = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.06,
    vertexColors: true,
  });
  const inst = new THREE.InstancedMesh(geom, mat, maxCount);
  const colors = new Float32Array(maxCount * 3);
  const dummy = new THREE.Object3D();
  let idx = 0;

  const zStart = -248;
  const zEnd = 58;
  let z = zStart + detRand(0, 1) * 5;
  while (z < zEnd && idx < maxCount - 1) {
    for (const side of [-1, 1] as const) {
      if (idx >= maxCount) break;
      const r1 = detRand(idx, side + 3);
      const r2 = detRand(idx, side + 7);
      const r3 = detRand(idx, side + 11);
      const w = 2.2 + r1 * 4.5;
      const h = 3.5 + r2 * 14;
      const d = 2 + r3 * 3.2;
      const xBase = side * (12.5 + r2 * 9.5);
      const jitterZ = (detRand(idx, 99) - 0.5) * 1.1;
      dummy.position.set(xBase + side * w * 0.32, h * 0.5, z + jitterZ);
      dummy.rotation.set(0, (detRand(idx, side) - 0.5) * 0.14, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      const hex = BUILDING_PALETTE[Math.floor(detRand(idx, side + 2) * BUILDING_PALETTE.length)]!;
      const c = new THREE.Color(hex);
      colors[idx * 3] = c.r;
      colors[idx * 3 + 1] = c.g;
      colors[idx * 3 + 2] = c.b;
      idx++;
    }
    z += 3.4 + detRand(idx, 5) * 5.2;
  }

  inst.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  inst.count = idx;
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = true;
  root.add(inst);

  const winGeom = new THREE.PlaneGeometry(0.55, 0.35);
  const winMat = new THREE.MeshBasicMaterial({
    color: 0xfff3c4,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const winMax = 96;
  const winInst = new THREE.InstancedMesh(winGeom, winMat, winMax);
  const winDummy = new THREE.Object3D();
  let wi = 0;
  for (let k = 0; k < winMax; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const tz = zStart + (k / winMax) * (zEnd - zStart) + detRand(k, 8) * 6;
    const tx = side * (11 + detRand(k, 3) * 10);
    const th = 2.5 + detRand(k, 4) * 11;
    winDummy.position.set(tx + side * 0.06, th, tz);
    winDummy.rotation.set(0, side * (Math.PI / 2), 0);
    winDummy.updateMatrix();
    winInst.setMatrixAt(wi++, winDummy.matrix);
  }
  winInst.count = wi;
  winInst.instanceMatrix.needsUpdate = true;
  winInst.frustumCulled = true;
  root.add(winInst);

  scene.add(root);
}
