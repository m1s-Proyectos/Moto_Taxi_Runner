import * as THREE from 'three';

/**
 * Entorno urbano ampliado: manzanas, calles transversas, fachadas lejanas, farolas, arbolado
 * bajo. Sin texturas ni GLB (carga mínima). Paletas cálidas y frías alternadas.
 */

const BUILDING_PALETTE = [
  0xd4a574, 0xc9a088, 0xe8dcc4, 0xb8956a, 0x8b7355, 0xa67c52, 0x7c6f64, 0x9c6644, 0x2a9d8f, 0xcdb4a0,
];

const OFFICE_COOL = [0x4a5d78, 0x3d4f66, 0x5a6b82, 0x2f3d52, 0x3b4c63];

function detRand(i: number, j: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233 + 42.42) * 43758.5453;
  return s - Math.floor(s);
}

/** Calles perimetrales estreitas (bulevares) paralelos al eje de la avenida principal. */
function addPerimeterStreets(root: THREE.Scene | THREE.Group, zCenter: number, zSpan: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1e2635, roughness: 0.95, metalness: 0.04 });
  const geo = new THREE.PlaneGeometry(5.5, zSpan, 1, 1);
  for (const side of [-1, 1] as const) {
    const p = new THREE.Mesh(geo, mat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(side * 27.2, 0.005, zCenter);
    root.add(p);
  }
}

/** Tiras transversas que simulan intersecciones o calles de cruce. */
function addCrossStreetPatches(root: THREE.Scene | THREE.Group, zList: number[]): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x232d3d, roughness: 0.96, metalness: 0.02 });
  for (const z of zList) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(44, 4.2, 1, 1), mat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(detRand(9, 2) * 0.2, 0.006, z + detRand(1, 4) * 0.3);
    root.add(p);
  }
}

/** Bloques bajos “comercio” cerca de la avenida. */
function addInnerBuildingBelt(
  root: THREE.Object3D,
  zStart: number,
  zEnd: number,
  maxCount: number,
  baseX: { min: number; max: number },
  palette: number[],
  scaleH: { min: number; max: number },
): { count: number; inst: THREE.InstancedMesh; colors: Float32Array; dummy: THREE.Object3D } {
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
  let z = zStart + detRand(0, 1) * 4;
  while (z < zEnd && idx < maxCount - 1) {
    for (const side of [-1, 1] as const) {
      if (idx >= maxCount) break;
      const r1 = detRand(idx, side + 3);
      const r2 = detRand(idx, side + 7);
      const r3 = detRand(idx, side + 11);
      const w = 2.0 + r1 * 4.2;
      const h = scaleH.min + r2 * (scaleH.max - scaleH.min);
      const d = 1.7 + r3 * 3.0;
      const xJ = r2 * (baseX.max - baseX.min) + baseX.min;
      const xBase = side * xJ;
      const jitterZ = (detRand(idx, 99) - 0.5) * 1.2;
      dummy.position.set(xBase + side * w * 0.28, h * 0.5, z + jitterZ);
      dummy.rotation.set(0, (detRand(idx, side) - 0.5) * 0.2, 0);
      dummy.scale.set(w, h, d);
      dummy.updateMatrix();
      inst.setMatrixAt(idx, dummy.matrix);
      const hex = palette[Math.floor(detRand(idx, side + 2) * palette.length)]!;
      const c = new THREE.Color(hex);
      colors[idx * 3] = c.r;
      colors[idx * 3 + 1] = c.g;
      colors[idx * 3 + 2] = c.b;
      idx++;
    }
    z += 3.1 + detRand(idx, 5) * 5.0;
  }
  inst.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  inst.count = idx;
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  inst.frustumCulled = true;
  root.add(inst);
  return { count: idx, inst, colors, dummy };
}

/** Torres de oficina más altas, segunda corona. */
function addOfficeRing(
  root: THREE.Object3D,
  zStart: number,
  zEnd: number,
  maxCount: number,
  baseX: { min: number; max: number },
): { count: number; inst: THREE.InstancedMesh; colors: Float32Array; dummy: THREE.Object3D } {
  return addInnerBuildingBelt(
    root,
    zStart,
    zEnd,
    maxCount,
    baseX,
    OFFICE_COOL,
    { min: 6, max: 32 },
  );
}

function addWindowFuzz(
  root: THREE.Object3D,
  zStart: number,
  zEnd: number,
  maxItems: number,
  xRange: { lo: number; hi: number },
): void {
  const winGeom = new THREE.PlaneGeometry(0.5, 0.32);
  const winMat = new THREE.MeshBasicMaterial({
    color: 0xffe6b8,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const inst = new THREE.InstancedMesh(winGeom, winMat, maxItems);
  const d = new THREE.Object3D();
  let w = 0;
  for (let k = 0; k < maxItems; k++) {
    const side = k % 2 === 0 ? -1 : 1;
    const tz = zStart + (k / maxItems) * (zEnd - zStart) + detRand(k, 8) * 5.5;
    const xMag = xRange.lo + detRand(k, 3) * (xRange.hi - xRange.lo);
    const tx = side * (xMag + detRand(k, 5) * 3);
    const th = 2.5 + detRand(k, 4) * 12;
    d.position.set(tx + side * 0.1, th, tz);
    d.rotation.set(0, side * (Math.PI / 2), 0);
    d.updateMatrix();
    inst.setMatrixAt(w++, d.matrix);
  }
  inst.count = w;
  inst.instanceMatrix.needsUpdate = true;
  inst.frustumCulled = true;
  root.add(inst);
}

/** Farolas a lo largo de aceras. */
function addLampRow(
  root: THREE.Object3D,
  xSide: number,
  zFrom: number,
  zTo: number,
  step: number,
  offset: number,
): void {
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e2128, roughness: 0.55, metalness: 0.35 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xffecd2, emissive: 0xffd49a, emissiveIntensity: 0.5 });
  const pGeo = new THREE.CylinderGeometry(0.08, 0.1, 2.8, 8);
  const cGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const pInst = new THREE.InstancedMesh(pGeo, poleMat, 200);
  const cInst = new THREE.InstancedMesh(cGeo, capMat, 200);
  const dummy = new THREE.Object3D();
  let n = 0;
  for (let z = zFrom; z > zTo && n < 180; z -= step) {
    const zz = z + (detRand(n, 1) - 0.5) * 0.4;
    dummy.position.set(xSide * 10.1 + offset, 1.4, zz);
    dummy.updateMatrix();
    pInst.setMatrixAt(n, dummy.matrix);
    dummy.position.set(xSide * 10.1 + offset, 2.75, zz);
    dummy.updateMatrix();
    cInst.setMatrixAt(n, dummy.matrix);
    n++;
  }
  pInst.count = n;
  cInst.count = n;
  pInst.instanceMatrix.needsUpdate = true;
  cInst.instanceMatrix.needsUpdate = true;
  root.add(pInst, cInst);
}

/** Siluetas de árbol (estilete + copa) en franja exterior. */
function addStylizedTrees(
  root: THREE.Object3D,
  xSide: number,
  zFrom: number,
  zTo: number,
  every: number,
  seed: number,
): void {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2c2416, roughness: 0.9, metalness: 0.02 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x1f5c3a, roughness: 0.9, metalness: 0.01 });
  const tGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.1, 6);
  const lGeo = new THREE.IcosahedronGeometry(0.7, 0);
  const tI = new THREE.InstancedMesh(tGeo, trunkMat, 100);
  const lI = new THREE.InstancedMesh(lGeo, leafMat, 100);
  const d = new THREE.Object3D();
  let k = 0;
  for (let z = zFrom; z > zTo && k < 96; z -= every) {
    const jx = 14.5 + detRand(seed, k) * 2.2;
    d.position.set(xSide * (jx + detRand(k, 2) * 0.3), 0.55, z + (detRand(k, 3) - 0.5) * 1.2);
    d.rotation.set(0, detRand(k, 4) * Math.PI * 2, 0);
    d.updateMatrix();
    tI.setMatrixAt(k, d.matrix);
    d.position.set(xSide * (jx + detRand(k, 2) * 0.3), 1.35, z + (detRand(k, 3) - 0.5) * 1.2);
    d.scale.set(1, 0.8 + detRand(k, 5) * 0.5, 1);
    d.updateMatrix();
    lI.setMatrixAt(k, d.matrix);
    d.scale.set(1, 1, 1);
    k++;
  }
  tI.count = k;
  lI.count = k;
  tI.instanceMatrix.needsUpdate = true;
  lI.instanceMatrix.needsUpdate = true;
  root.add(tI, lI);
}

/** Manchas de césped / parterres entre calles. */
function addPlazaBands(root: THREE.Object3D, zCenter: number, zSpan: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x1a2e22, roughness: 0.99, metalness: 0 });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(18, 7, 1, 1), mat);
  p.rotation.x = -Math.PI / 2;
  p.position.set(24, 0.004, zCenter);
  root.add(p);
  const p2 = p.clone();
  p2.position.set(-24, 0.004, zCenter + zSpan * 0.2);
  root.add(p2);
  const p3 = p.clone();
  p3.position.set(24, 0.004, zCenter - zSpan * 0.25);
  p3.scale.set(0.8, 0.8, 0.6);
  root.add(p3);
}

/**
 * Bloques de horizonte muy lejanos (lectura al fondo, detalle bajo en vertientes).
 */
function addDistantSkyline(root: THREE.Object3D, zStart: number, zEnd: number, count: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a2f3d, roughness: 0.88, metalness: 0.18 });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const inst = new THREE.InstancedMesh(geo, mat, count);
  const colors = new Float32Array(count * 3);
  const d = new THREE.Object3D();
  let i = 0;
  for (let t = 0; t < count && i < count; t++) {
    for (const side of [-1, 1] as const) {
      if (i >= count) break;
      const zz = zStart + detRand(i, 6) * (zEnd - zStart);
      const w = 3 + detRand(i, 1) * 2;
      const h = 22 + detRand(i, 2) * 38;
      const dep = 2.5 + detRand(i, 3) * 1.2;
      d.position.set(
        side * (46 + detRand(i, 4) * 8),
        h * 0.5,
        zz,
      );
      d.scale.set(w, h, dep);
      d.updateMatrix();
      inst.setMatrixAt(i, d.matrix);
      const c = new THREE.Color(0x3a3f4e).lerp(new THREE.Color(0x1e232d), detRand(i, 7) * 0.6);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
      i++;
    }
  }
  inst.instanceColor = new THREE.InstancedBufferAttribute(colors, 3);
  inst.count = i;
  inst.instanceMatrix.needsUpdate = true;
  inst.instanceColor.needsUpdate = true;
  inst.renderOrder = -1;
  root.add(inst);
}

/** Líneas aéreas paralelas a la avenida (luz tenue a lo largo de la ruta). */
function addAerialWires(root: THREE.Object3D, z0: number, z1: number): void {
  const mat = new THREE.LineBasicMaterial({ color: 0x3a3d48, transparent: true, opacity: 0.24 });
  const g1 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-20, 3.1, z0),
    new THREE.Vector3(-20, 3.1, z1),
  ]);
  const g2 = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(20, 2.9, z0 + 0.2),
    new THREE.Vector3(20, 2.9, z1 - 0.2),
  ]);
  root.add(new THREE.Line(g1, mat), new THREE.Line(g2, mat));
}

export function addCityscape(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'cityscape';

  const zCenter = -160;
  const zSpan = 400;
  const zStart = -400;
  const zEnd = 55;

  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0x4a4a52,
    roughness: 0.92,
    metalness: 0.04,
  });
  const swLen = 440;
  const swGeo = new THREE.PlaneGeometry(5.6, swLen);
  const swL = new THREE.Mesh(swGeo, sidewalkMat);
  swL.rotation.x = -Math.PI / 2;
  swL.position.set(-11.6, 0.008, zCenter);
  root.add(swL);
  const swR = new THREE.Mesh(swGeo, sidewalkMat);
  swR.rotation.x = -Math.PI / 2;
  swR.position.set(11.6, 0.008, zCenter);
  root.add(swR);

  const curbMat = new THREE.MeshStandardMaterial({ color: 0x5c5f6a, roughness: 0.75, metalness: 0.12 });
  const curbGeo = new THREE.BoxGeometry(0.22, 0.15, swLen);
  const curbL = new THREE.Mesh(curbGeo, curbMat);
  curbL.position.set(-9, 0.07, zCenter);
  root.add(curbL);
  const curbR = new THREE.Mesh(curbGeo, curbMat);
  curbR.position.set(9, 0.07, zCenter);
  root.add(curbR);

  addPerimeterStreets(root, zCenter, 440);
  addCrossStreetPatches(root, [-48, -105, -152, -198, -245, -292, -338]);
  addPlazaBands(root, zCenter, zSpan);
  addAerialWires(root, zStart, zEnd);

  addInnerBuildingBelt(root, zStart, zEnd, 300, { min: 12.0, max: 22.0 }, BUILDING_PALETTE, { min: 3.2, max: 19 });
  addOfficeRing(root, zStart, zEnd, 140, { min: 24, max: 38 });
  addDistantSkyline(root, zStart + 4, zEnd, 100);

  addWindowFuzz(root, zStart, zEnd, 200, { lo: 10, hi: 32 });

  addLampRow(root, 1, 48, -380, 16, 0.15);
  addLampRow(root, -1, 40, -375, 17, -0.1);

  addStylizedTrees(root, 1, 38, -370, 18, 11);
  addStylizedTrees(root, -1, 42, -368, 19, 13);

  scene.add(root);
}
