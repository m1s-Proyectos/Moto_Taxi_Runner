import * as THREE from 'three';
import { CHECKPOINTS, SPAWN } from './config';

/** Mitad de la calzada útil; fuera = resistencia (pero no muro duro). */
export const ROAD_HALF_WIDTH = 10;

const ROAD_LATERAL_DRAG_START = 6.2;

const tmp = new THREE.Vector3();
const tmpTan = new THREE.Vector3();

let cached: THREE.CatmullRomCurve3 | null = null;

/**
 * Puntos de control: salida → paradas con tramos de transición; curvas suaves y progresivas.
 */
function buildControlPoints(): THREE.Vector3[] {
  const p0 = new THREE.Vector3(SPAWN.position.x, 0, SPAWN.position.z);
  const c0 = CHECKPOINTS[0]!.center.clone();
  c0.y = 0;
  const c1 = CHECKPOINTS[1]!.center.clone();
  c1.y = 0;
  const c2 = CHECKPOINTS[2]!.center.clone();
  c2.y = 0;
  return [
    p0,
    p0.clone().lerp(c0, 0.28),
    p0.clone().lerp(c0, 0.6),
    c0,
    c0.clone().lerp(c1, 0.22),
    c0.clone().lerp(c1, 0.5),
    c0.clone().lerp(c1, 0.78),
    c1,
    c1.clone().lerp(c2, 0.25),
    c1.clone().lerp(c2, 0.55),
    c2,
    c2.clone().add(new THREE.Vector3(0, 0, -28)),
  ];
}

export function getRoadCenterline(): THREE.CatmullRomCurve3 {
  if (!cached) {
    cached = new THREE.CatmullRomCurve3(
      buildControlPoints(),
      false,
      'centripetal',
      0.45,
    );
  }
  return cached;
}

/**
 * t ∈ [0,1] con getPoint(t).z ≈ zTarget (Z decrece a lo largo de la ruta).
 */
export function findTForWorldZ(zTarget: number): number {
  const c = getRoadCenterline();
  let lo = 0;
  let hi = 1;
  for (let k = 0; k < 32; k++) {
    const mid = (lo + hi) * 0.5;
    const p = c.getPointAt(mid);
    if (p.z < zTarget) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return (lo + hi) * 0.5;
}

export function getRoadYawAtT(t: number): number {
  const c = getRoadCenterline();
  c.getTangentAt(t, tmpTan);
  tmpTan.y = 0;
  if (tmpTan.lengthSq() < 1e-8) {
    return 0;
  }
  tmpTan.normalize();
  return Math.atan2(-tmpTan.x, -tmpTan.z);
}

/** Distancia lateral con signo respecto a la mediana: |rel × T| en XZ. */
export function getSignedLateralToRoad(x: number, z: number): { dist: number; t: number } {
  const c = getRoadCenterline();
  const t = findTClosestXZ(c, x, z);
  c.getPointAt(t, tmp);
  c.getTangentAt(t, tmpTan);
  tmpTan.y = 0;
  tmpTan.normalize();
  const relx = x - tmp.x;
  const relz = z - tmp.z;
  const cross = relx * tmpTan.z - relz * tmpTan.x;
  return { dist: cross, t };
}

export function getLateralDistanceToRoadMeters(x: number, z: number): number {
  return Math.abs(getSignedLateralToRoad(x, z).dist);
}

function findTClosestXZ(curve: THREE.CatmullRomCurve3, x: number, z: number): number {
  let bestT = 0;
  let bestD = Number.POSITIVE_INFINITY;
  const n = 192;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = curve.getPointAt(t);
    const d = (p.x - x) ** 2 + (p.z - z) ** 2;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  let t0 = Math.max(0, bestT - 1 / n);
  let t1 = Math.min(1, bestT + 1 / n);
  for (let k = 0; k < 16; k++) {
    const m1 = t0 + (t1 - t0) / 3;
    const m2 = t0 + ((t1 - t0) * 2) / 3;
    const p1 = curve.getPointAt(m1);
    const p2 = curve.getPointAt(m2);
    const d1 = (p1.x - x) ** 2 + (p1.z - z) ** 2;
    const d2 = (p2.x - x) ** 2 + (p2.z - z) ** 2;
    if (d1 < d2) {
      t1 = m2;
    } else {
      t0 = m1;
    }
  }
  return (t0 + t1) * 0.5;
}

/**
 * 0 = dentro del asfalto “cómodo”; 1 = fuera del borde. Usado para freno y rozamiento extra.
 */
export function getOffroadSeverity(lateralMeters: number): number {
  if (lateralMeters <= ROAD_LATERAL_DRAG_START) {
    return 0;
  }
  if (lateralMeters >= ROAD_HALF_WIDTH) {
    return 1;
  }
  return (lateralMeters - ROAD_LATERAL_DRAG_START) / (ROAD_HALF_WIDTH - ROAD_LATERAL_DRAG_START);
}

export function buildRoadRibbonGeometry(
  halfWidth: number,
  y: number,
  segments: number,
): THREE.BufferGeometry {
  const c = getRoadCenterline();
  const pos: number[] = [];
  const nor: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const tan = new THREE.Vector3();
  const side = new THREE.Vector3();
  const p = new THREE.Vector3();
  const L = new THREE.Vector3();
  const R = new THREE.Vector3();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    c.getPointAt(t, p);
    c.getTangentAt(t, tan);
    tan.y = 0;
    tan.normalize();
    side.crossVectors(up, tan);
    if (side.lengthSq() < 1e-8) {
      side.set(1, 0, 0);
    } else {
      side.normalize();
    }
    p.y = y;
    L.copy(p).addScaledVector(side, -halfWidth);
    R.copy(p).addScaledVector(side, halfWidth);
    pos.push(L.x, L.y, L.z, R.x, R.y, R.z);
    nor.push(0, 1, 0, 0, 1, 0);
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c0 = a + 2;
    const c1 = a + 3;
    idx.push(a, b, c0, b, c1, c0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export function getRoutePreviewSamples(n: number): { x: number; z: number }[] {
  const c = getRoadCenterline();
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t = n <= 1 ? 0 : i / (n - 1);
    const p = c.getPointAt(t);
    out.push({ x: p.x, z: p.z });
  }
  return out;
}

export const ROUTE_PREVIEW_XZ: ReadonlyArray<{ x: number; z: number }> = getRoutePreviewSamples(64);

/** Línea discontinua central a lo largo de la mediana. */
export function addRoadCenterDashes(
  scene: THREE.Scene,
  y: number,
  options?: { tStep?: number; dashLen?: number; dashW?: number },
): void {
  const tStep = options?.tStep ?? 0.03;
  const dashLen = options?.dashLen ?? 1.5;
  const dashW = options?.dashW ?? 0.4;
  const c = getRoadCenterline();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd7e2ff, roughness: 1, metalness: 0 });
  const tvec = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let t = 0.01; t < 0.99; t += tStep) {
    c.getPointAt(t, p);
    c.getTangentAt(t, tvec);
    tvec.y = 0;
    if (tvec.lengthSq() < 1e-6) {
      continue;
    }
    tvec.normalize();
    p.y = y;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(dashW, dashLen), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.y = getRoadYawAtT(t);
    mesh.position.copy(p);
    scene.add(mesh);
  }
}
