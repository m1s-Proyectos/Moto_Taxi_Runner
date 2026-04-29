import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { WORLD_CITY_END_Z } from '../track/config';
import { getFacadeRoughnessMap, getGlassMaskMap, getSidewalkMap } from '../lib/proceduralTextures';
import { createBuildingFacadeMaterial, createSkylineFacadeMaterial } from '../lib/cityShaders';

/**
 * Entorno urbano: fachadas con bloques redondeados + rugosidad procedural; sin GLB.
 */

/* Fachadas vivas de barrio: cálidos y pasteles alegres. */
const BUILDING_PALETTE = [
  0xffbf9f, 0xffd67a, 0xffb7b3, 0xffe3a5, 0xffd1a9, 0xb8e4ff, 0xb9f0c7, 0xffb78a, 0xfde68a, 0xffd6c1,
  0xfca5a5, 0xfdba74, 0xfacc15, 0x93c5fd, 0x86efac,
];

const OFFICE_COOL = [0xdbe7ff, 0xd7f0ff, 0xd3e4ff, 0xe3e8ff, 0xffe4c7];
const SHOP_AWNING = [0xf97316, 0xef4444, 0xf59e0b, 0xfb7185, 0xfb923c, 0xf43f5e, 0xfbbf24, 0x0ea5e9];
const SHOP_SIGN = [0xffffff, 0xfff7ed, 0xfefce8, 0xecfeff, 0xdcfce7];

function detRand(i: number, j: number): number {
  const s = Math.sin(i * 12.9898 + j * 78.233 + 42.42) * 43758.5453;
  return s - Math.floor(s);
}

/** Calles perimetrales estreitas (bulevares) paralelos al eje de la avenida principal. */
function addPerimeterStreets(root: THREE.Scene | THREE.Group, zCenter: number, zSpan: number): void {
  const mat = new THREE.MeshStandardMaterial({
    color: 0x6f7782,
    roughness: 0.92,
    metalness: 0.04,
    emissive: 0x0,
    emissiveIntensity: 0,
  });
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
  const mat = new THREE.MeshStandardMaterial({
    color: 0x757f8b,
    roughness: 0.9,
    metalness: 0.04,
    emissive: 0x0,
    emissiveIntensity: 0,
  });
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
  const geom = new RoundedBoxGeometry(1, 1, 1, 2, 0.09);
  /**
   * Material de fachada con shader personalizado (gradiente, ventanas
   * procedurales, acentos neon, variación per-instancia). 1 draw call por
   * InstancedMesh — el detalle es 100% shader-side.
   */
  const mat = createBuildingFacadeMaterial({
    windowGlow: 0.55,
    baseRoughness: 0.5,
    baseMetalness: 0.06,
  });
  mat.roughnessMap = getFacadeRoughnessMap();
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
      c.multiplyScalar(1.16);
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
  const winGeom = new THREE.PlaneGeometry(0.5, 0.34);
  const glassMask = getGlassMaskMap();
  /** Ventana diurna con reflejo azulado y menos emisión. */
  const winMat = new THREE.MeshStandardMaterial({
    color: 0xc9e5fb,
    metalness: 0.62,
    roughness: 0.18,
    roughnessMap: glassMask,
    emissive: 0xbfdfff,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.85,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.95,
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
  inst.renderOrder = 2;
  root.add(inst);

  /** Segunda capa: ventana más chica, otro eje (simula fachada cruzada / patio). */
  const smallGeom = new THREE.PlaneGeometry(0.34, 0.24);
  /** Segunda capa de ventanas menos reflectiva para variedad. */
  const winMat2 = new THREE.MeshStandardMaterial({
    color: 0xaed1ee,
    metalness: 0.48,
    roughness: 0.24,
    roughnessMap: glassMask,
    emissive: 0x0,
    emissiveIntensity: 0.04,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false,
    envMapIntensity: 0.75,
  });
  const n2 = Math.min(110, maxItems);
  const inst2 = new THREE.InstancedMesh(smallGeom, winMat2, n2);
  let w2 = 0;
  for (let k = 0; k < n2; k++) {
    const side = k % 2 === 1 ? -1 : 1;
    const tz = zStart + detRand(k + 11, 2) * (zEnd - zStart) + detRand(k, 9) * 2;
    const xMag = xRange.lo + 2 + detRand(k, 4) * (xRange.hi - xRange.lo - 2);
    const tx = side * (xMag + detRand(k, 6) * 2.5);
    const th = 3 + detRand(k, 3) * 10;
    d.position.set(tx + side * 0.1, th, tz);
    d.rotation.set(0, side * (Math.PI / 2), 0);
    d.updateMatrix();
    inst2.setMatrixAt(w2++, d.matrix);
  }
  inst2.count = w2;
  inst2.instanceMatrix.needsUpdate = true;
  inst2.frustumCulled = true;
  inst2.renderOrder = 2;
  root.add(inst2);
}

/** Paneles de color en fachadas para romper bloques grises y dar look urbano alegre. */
function addFacadeColorBands(root: THREE.Object3D, zFrom: number, zTo: number): void {
  const colors = [0xffb74d, 0xfb7185, 0xfde047, 0x7dd3fc, 0x86efac, 0xffa59e];
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.36,
    metalness: 0.08,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xfff7ed, roughness: 0.58, metalness: 0.05 });
  const bandI = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.95, 1.08), bandMat, 220);
  const frameI = new THREE.InstancedMesh(new THREE.BoxGeometry(2.02, 0.06, 0.06), frameMat, 440);
  const bandColors = new Float32Array(220 * 3);
  const d = new THREE.Object3D();
  let i = 0;
  let f = 0;
  for (let z = zFrom; z > zTo && i < 210; z -= 5.4) {
    for (const side of [-1, 1] as const) {
      const x = side * (10.7 + detRand(i, 4) * 0.55);
      const y = 1.7 + detRand(i, 7) * 2.8;
      d.position.set(x, y, z + (detRand(i, 9) - 0.5) * 1.5);
      d.rotation.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      d.updateMatrix();
      bandI.setMatrixAt(i, d.matrix);
      const c = new THREE.Color(colors[Math.floor(detRand(i, side + 15) * colors.length)]!);
      bandColors[i * 3] = c.r;
      bandColors[i * 3 + 1] = c.g;
      bandColors[i * 3 + 2] = c.b;

      d.position.set(x, y - 0.57, z + (detRand(i, 9) - 0.5) * 1.5);
      d.rotation.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      d.updateMatrix();
      frameI.setMatrixAt(f++, d.matrix);
      d.position.set(x, y + 0.57, z + (detRand(i, 9) - 0.5) * 1.5);
      d.updateMatrix();
      frameI.setMatrixAt(f++, d.matrix);
      i++;
    }
  }
  bandI.instanceColor = new THREE.InstancedBufferAttribute(bandColors, 3);
  bandI.count = i;
  frameI.count = f;
  bandI.instanceMatrix.needsUpdate = true;
  frameI.instanceMatrix.needsUpdate = true;
  bandI.instanceColor.needsUpdate = true;
  root.add(bandI, frameI);
}

/** Frentes comerciales modulares: toldos, vitrinas y rótulos ligeros. */
function addStorefrontRhythm(root: THREE.Object3D, zFrom: number, zTo: number): void {
  const awnMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.52, metalness: 0.08 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xf3e6d4, roughness: 0.56, metalness: 0.08 });
  const signMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.42, metalness: 0.18 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xd6ecff,
    roughness: 0.12,
    metalness: 0.58,
    transparent: true,
    opacity: 0.82,
    emissive: 0x9fd0ff,
    emissiveIntensity: 0.08,
    depthWrite: false,
  });

  const awnI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.45, 0.18, 0.52), awnMat, 180);
  const signI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.05, 0.3, 0.06), signMat, 180);
  const winI = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.05, 0.72), glassMat, 180);
  const postI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.08, 1.08, 0.08), frameMat, 360);
  const colorA = new Float32Array(180 * 3);
  const colorS = new Float32Array(180 * 3);
  const d = new THREE.Object3D();
  let i = 0;
  let p = 0;
  for (let z = zFrom; z > zTo && i < 170; z -= 7.8) {
    for (const side of [-1, 1] as const) {
      const xFacade = side * (10.95 + detRand(i, 3) * 0.36);
      const zJ = z + (detRand(i, 5) - 0.5) * 0.9;
      d.position.set(xFacade + side * 0.22, 1.05, zJ);
      d.rotation.set(0, side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      d.updateMatrix();
      awnI.setMatrixAt(i, d.matrix);

      d.position.set(xFacade + side * 0.08, 1.42, zJ);
      d.updateMatrix();
      signI.setMatrixAt(i, d.matrix);

      d.position.set(xFacade + side * 0.06, 0.72, zJ);
      d.updateMatrix();
      winI.setMatrixAt(i, d.matrix);

      const awnHex = SHOP_AWNING[Math.floor(detRand(i, side + 11) * SHOP_AWNING.length)]!;
      const signHex = SHOP_SIGN[Math.floor(detRand(i, side + 17) * SHOP_SIGN.length)]!;
      const ca = new THREE.Color(awnHex);
      const cs = new THREE.Color(signHex);
      colorA[i * 3] = ca.r;
      colorA[i * 3 + 1] = ca.g;
      colorA[i * 3 + 2] = ca.b;
      colorS[i * 3] = cs.r;
      colorS[i * 3 + 1] = cs.g;
      colorS[i * 3 + 2] = cs.b;

      const postOffset = 0.52;
      d.position.set(xFacade + side * 0.14, 0.58, zJ - postOffset);
      d.rotation.set(0, 0, 0);
      d.updateMatrix();
      postI.setMatrixAt(p++, d.matrix);
      d.position.set(xFacade + side * 0.14, 0.58, zJ + postOffset);
      d.updateMatrix();
      postI.setMatrixAt(p++, d.matrix);
      i++;
    }
  }
  awnI.instanceColor = new THREE.InstancedBufferAttribute(colorA, 3);
  signI.instanceColor = new THREE.InstancedBufferAttribute(colorS, 3);
  awnI.count = i;
  signI.count = i;
  winI.count = i;
  postI.count = p;
  awnI.instanceMatrix.needsUpdate = true;
  signI.instanceMatrix.needsUpdate = true;
  winI.instanceMatrix.needsUpdate = true;
  postI.instanceMatrix.needsUpdate = true;
  awnI.instanceColor.needsUpdate = true;
  signI.instanceColor.needsUpdate = true;
  root.add(awnI, signI, winI, postI);
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
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x747e88, roughness: 0.55, metalness: 0.35 });
  const capMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, emissive: 0xffffff, emissiveIntensity: 0.06 });
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
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a432a, roughness: 0.9, metalness: 0.02 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5fb85f, roughness: 0.88, metalness: 0.01 });
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

function addCornerGreenery(root: THREE.Object3D, zFrom: number, zTo: number): void {
  const bushMat = new THREE.MeshStandardMaterial({ color: 0x67b85c, roughness: 0.93, metalness: 0.01 });
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffb38a, roughness: 0.85, metalness: 0.02 });
  const bushI = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 0), bushMat, 120);
  const flwI = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 8, 6), flowerMat, 180);
  const d = new THREE.Object3D();
  let b = 0;
  let f = 0;
  for (let z = zFrom; z > zTo && b < 110; z -= 10.5) {
    for (const side of [-1, 1] as const) {
      const x = side * (10.35 + detRand(b, side + 3) * 0.6);
      d.position.set(x, 0.38, z + (detRand(b, 8) - 0.5) * 1.4);
      d.scale.set(0.8 + detRand(b, 4) * 0.65, 0.6 + detRand(b, 6) * 0.5, 0.8 + detRand(b, 7) * 0.6);
      d.rotation.set(0, detRand(b, 2) * Math.PI, 0);
      d.updateMatrix();
      bushI.setMatrixAt(b++, d.matrix);
      d.scale.set(1, 1, 1);

      for (let k = 0; k < 2 && f < 170; k++) {
        d.position.set(
          x + (detRand(f + k, 12) - 0.5) * 0.5,
          0.7 + detRand(f, 13) * 0.15,
          z + (detRand(f + k, 14) - 0.5) * 0.8,
        );
        d.updateMatrix();
        flwI.setMatrixAt(f++, d.matrix);
      }
    }
  }
  bushI.count = b;
  flwI.count = f;
  bushI.instanceMatrix.needsUpdate = true;
  flwI.instanceMatrix.needsUpdate = true;
  root.add(bushI, flwI);
}

/** Manchas de césped / parterres entre calles. */
function addPlazaBands(root: THREE.Object3D, zCenter: number, zSpan: number): void {
  const mat = new THREE.MeshStandardMaterial({ color: 0x7cc86a, roughness: 0.97, metalness: 0 });
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
  const mat = createSkylineFacadeMaterial();
  mat.roughnessMap = getFacadeRoughnessMap();
  const geo = new RoundedBoxGeometry(1, 1, 1, 2, 0.14);
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
      const c = new THREE.Color(0xe0eaff).lerp(new THREE.Color(0xb6c3d6), detRand(i, 7) * 0.55);
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
  const mat = new THREE.LineBasicMaterial({ color: 0x6f7a88, transparent: true, opacity: 0.3 });
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

function addStreetProps(root: THREE.Object3D, zFrom: number, zTo: number): void {
  const benchMat = new THREE.MeshStandardMaterial({ color: 0xb78658, roughness: 0.72, metalness: 0.12 });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8b99a8, roughness: 0.56, metalness: 0.34 });
  const signMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.33, metalness: 0.18, emissive: 0xffffff, emissiveIntensity: 0.03 });
  const hydMat = new THREE.MeshStandardMaterial({ color: 0xd13b32, roughness: 0.54, metalness: 0.16 });

  const benchI = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.14, 0.35), benchMat, 72);
  const poleI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 8), poleMat, 92);
  const signI = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.38, 0.05), signMat, 92);
  const hydI = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.11, 0.13, 0.42, 10), hydMat, 42);
  const d = new THREE.Object3D();

  let b = 0;
  let p = 0;
  let h = 0;
  for (let z = zFrom; z > zTo; z -= 14) {
    for (const side of [-1, 1] as const) {
      const x = side * 12.8 + detRand(p + 3, side + 7) * 0.6;
      d.position.set(x, 1.1, z + detRand(p, 4) * 0.7);
      d.updateMatrix();
      poleI.setMatrixAt(p, d.matrix);

      d.position.set(x + side * 0.2, 1.8, z + detRand(p, 5) * 0.6);
      d.rotation.set(0, side < 0 ? 0 : Math.PI, 0);
      d.updateMatrix();
      signI.setMatrixAt(p, d.matrix);
      d.rotation.set(0, 0, 0);
      p++;

      if (b < 72 && detRand(b, side + 13) > 0.35) {
        d.position.set(side * 12.4, 0.32, z + (detRand(b, 2) - 0.5) * 2.1);
        d.rotation.set(0, side < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0);
        d.updateMatrix();
        benchI.setMatrixAt(b++, d.matrix);
      }

      if (h < 42 && detRand(h + 11, side + 3) > 0.46) {
        d.position.set(side * 11.2, 0.22, z + (detRand(h, 7) - 0.5) * 1.6);
        d.rotation.set(0, 0, 0);
        d.updateMatrix();
        hydI.setMatrixAt(h++, d.matrix);
      }
    }
  }
  poleI.count = p;
  signI.count = p;
  benchI.count = b;
  hydI.count = h;
  poleI.instanceMatrix.needsUpdate = true;
  signI.instanceMatrix.needsUpdate = true;
  benchI.instanceMatrix.needsUpdate = true;
  hydI.instanceMatrix.needsUpdate = true;
  root.add(benchI, poleI, signI, hydI);
}

/** Invisible barriers to prevent vehicle from passing through buildings */
function addBuildingCollisionBarriers(root: THREE.Object3D, zStart: number, zEnd: number): void {
  const barrierMat = new THREE.MeshStandardMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0,
    roughness: 1,
    metalness: 0,
  });
  
  // Left side barriers - closer to road
  const leftBarrierGeo = new THREE.BoxGeometry(1.5, 6, zEnd - zStart);
  const leftBarrier = new THREE.Mesh(leftBarrierGeo, barrierMat);
  leftBarrier.position.set(-11.5, 3, (zStart + zEnd) / 2);
  root.add(leftBarrier);
  
  // Right side barriers - closer to road
  const rightBarrierGeo = new THREE.BoxGeometry(1.5, 6, zEnd - zStart);
  const rightBarrier = new THREE.Mesh(rightBarrierGeo, barrierMat);
  rightBarrier.position.set(11.5, 3, (zStart + zEnd) / 2);
  root.add(rightBarrier);
  
  // Additional outer barriers
  const outerLeftBarrierGeo = new THREE.BoxGeometry(2, 8, zEnd - zStart);
  const outerLeftBarrier = new THREE.Mesh(outerLeftBarrierGeo, barrierMat);
  outerLeftBarrier.position.set(-16, 4, (zStart + zEnd) / 2);
  root.add(outerLeftBarrier);
  
  const outerRightBarrierGeo = new THREE.BoxGeometry(2, 8, zEnd - zStart);
  const outerRightBarrier = new THREE.Mesh(outerRightBarrierGeo, barrierMat);
  outerRightBarrier.position.set(16, 4, (zStart + zEnd) / 2);
  root.add(outerRightBarrier);
}

export function addCityscape(scene: THREE.Scene): void {
  const root = new THREE.Group();
  root.name = 'cityscape';

  /** Borde sur: sin bloques ni farolas más allá del fin de ciudad. */
  const zStart = WORLD_CITY_END_Z - 14;
  const zEnd = 55;
  const zCenter = (zStart + zEnd) * 0.5;
  const zSpan = zEnd - zStart;

  const sidewalkMap = getSidewalkMap();
  const sidewalkMat = new THREE.MeshStandardMaterial({
    color: 0xf0e6d6,
    roughness: 0.84,
    metalness: 0.05,
    map: sidewalkMap,
    emissive: 0x0,
    emissiveIntensity: 0,
  });
  const swLen = zSpan + 48;
  const swGeo = new THREE.PlaneGeometry(5.6, swLen);
  const swL = new THREE.Mesh(swGeo, sidewalkMat);
  swL.rotation.x = -Math.PI / 2;
  swL.position.set(-11.6, 0.008, zCenter);
  root.add(swL);
  const swR = new THREE.Mesh(swGeo, sidewalkMat);
  swR.rotation.x = -Math.PI / 2;
  swR.position.set(11.6, 0.008, zCenter);
  root.add(swR);

  const curbMat = new THREE.MeshStandardMaterial({
    color: 0xefe5d9,
    roughness: 0.72,
    metalness: 0.12,
    emissive: 0x0,
    emissiveIntensity: 0,
  });
  const curbGeo = new THREE.BoxGeometry(0.22, 0.25, swLen);
  const curbL = new THREE.Mesh(curbGeo, curbMat);
  curbL.position.set(-9, 0.12, zCenter);
  root.add(curbL);
  const curbR = new THREE.Mesh(curbGeo, curbMat);
  curbR.position.set(9, 0.12, zCenter);
  root.add(curbR);

  addPerimeterStreets(root, zCenter, zSpan + 40);
  addCrossStreetPatches(root, [-48, -105, -152, -198, -245, -292, Math.min(-338, zStart + 8)]);
  addPlazaBands(root, zCenter, zSpan);
  addAerialWires(root, zStart, zEnd);

  addInnerBuildingBelt(root, zStart, zEnd, 300, { min: 12.0, max: 22.0 }, BUILDING_PALETTE, { min: 3.2, max: 19 });
  addOfficeRing(root, zStart, zEnd, 140, { min: 24, max: 38 });
  addDistantSkyline(root, zStart + 4, zEnd, 100);

  addWindowFuzz(root, zStart, zEnd, 220, { lo: 10, hi: 32 });
  const zDecorSouth = zStart - 26;
  addFacadeColorBands(root, 40, zDecorSouth);
  addStorefrontRhythm(root, 40, zDecorSouth);

  addLampRow(root, 1, 48, zDecorSouth - 8, 16, 0.15);
  addLampRow(root, -1, 40, zDecorSouth - 3, 17, -0.1);

  addStylizedTrees(root, 1, 38, zDecorSouth, 14, 11);
  addStylizedTrees(root, -1, 42, zDecorSouth + 2, 14, 13);
  addCornerGreenery(root, 38, zDecorSouth);
  addStreetProps(root, 38, zDecorSouth);

  // Add building collision barriers
  addBuildingCollisionBarriers(root, zStart, zEnd);

  scene.add(root);
}

/** Límite visible de ciudad al sur de la ruta (plano transversal). */
export function addEndOfCityBoundary(scene: THREE.Scene): void {
  const z = WORLD_CITY_END_Z;
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(140, 26, 5),
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.88,
      metalness: 0.06,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
  );
  wall.position.set(0, 13, z);
  scene.add(wall);

  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 120;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,23,42,0.75)';
  ctx.fillRect(8, 8, 624, 104);
  ctx.strokeStyle = 'rgba(148,163,184,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, 624, 104);
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 32px system-ui,sans-serif';
  ctx.fillText('Fin de la ciudad', 40, 74);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  spr.position.set(0, 22, z + 2);
  spr.scale.set(28, 5.25, 1);
  scene.add(spr);
}
