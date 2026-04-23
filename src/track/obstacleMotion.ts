import * as THREE from 'three';
import type { ObstacleDef } from './config';

/**
 * AABB de un obstáculo en el instante t (s). Sin `motion` devuelve la referencia
 * al def estático; con movimiento, devuelve min/max con centro recorrido en Z.
 */
export function obstacleAabbAtTime(o: ObstacleDef, tSec: number): ObstacleDef {
  if (!o.motion) {
    return o;
  }
  const m = o.motion;
  const zLo = Math.min(m.z0, m.z1);
  const zHi = Math.max(m.z0, m.z1);
  const L = zHi - zLo;
  if (L < 1e-3) {
    return o;
  }
  const halfX = (o.max.x - o.min.x) * 0.5;
  const halfZ = (o.max.z - o.min.z) * 0.5;
  const xC = (o.min.x + o.max.x) * 0.5;
  const y0 = o.min.y;
  const h = o.max.y - o.min.y;
  const u = pingPongU(tSec, m.speed, L, m.phase01);
  const zC = zLo + u;
  return {
    min: new THREE.Vector3(xC - halfX, y0, zC - halfZ),
    max: new THREE.Vector3(xC + halfX, y0 + h, zC + halfZ),
  };
}

/**
 * u ∈ [0, L]: posición a lo largo del tramo, ida y vuelta.
 */
function pingPongU(
  tSec: number,
  speed: number,
  length: number,
  phase01: number,
): number {
  const s = Math.max(0.08, speed);
  const span = 2 * length;
  let pos = tSec * s + (phase01 % 1) * span;
  pos = pos % span;
  if (pos < 0) {
    pos += span;
  }
  if (pos > length) {
    pos = span - pos;
  }
  return pos;
}

/**
 * true si el sentido de marcha a lo largo de la carretera es +Z (frente del modelo: +Z local → yaw 0).
 */
export function isObstacleMovingPositiveZ(o: ObstacleDef, tSec: number): boolean {
  if (!o.motion) {
    return true;
  }
  const m = o.motion;
  const zLo = Math.min(m.z0, m.z1);
  const zHi = Math.max(m.z0, m.z1);
  const L = zHi - zLo;
  if (L < 1e-3) {
    return true;
  }
  const s = Math.max(0.08, m.speed);
  const span = 2 * L;
  let raw = tSec * s + (m.phase01 % 1) * span;
  raw = raw % span;
  if (raw < 0) {
    raw += span;
  }
  return raw < L;
}

/** AABB mínima para minimapa (reutiliza tmp; leer inmediatamente). */
export function obstacleFootprintForMinimap(
  o: ObstacleDef,
  tSec: number,
  out: { cx: number; cz: number; hw: number; hd: number },
): void {
  if (!o.motion) {
    out.cx = (o.min.x + o.max.x) * 0.5;
    out.cz = (o.min.z + o.max.z) * 0.5;
    out.hw = (o.max.x - o.min.x) * 0.5;
    out.hd = (o.max.z - o.min.z) * 0.5;
    return;
  }
  const aabb = obstacleAabbAtTime(o, tSec);
  out.hw = (aabb.max.x - aabb.min.x) * 0.5;
  out.hd = (aabb.max.z - aabb.min.z) * 0.5;
  out.cx = (aabb.min.x + aabb.max.x) * 0.5;
  out.cz = (aabb.min.z + aabb.max.z) * 0.5;
}
