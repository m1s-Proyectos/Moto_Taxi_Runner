import * as THREE from 'three';
import type { ObstacleDef } from '../track/config';

export function circleIntersectsObstacle(
  x: number,
  z: number,
  radius: number,
  o: ObstacleDef,
): boolean {
  const cx = THREE.MathUtils.clamp(x, o.min.x, o.max.x);
  const cz = THREE.MathUtils.clamp(z, o.min.z, o.max.z);
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

export function resolveCircleObstacle(
  x: number,
  z: number,
  radius: number,
  o: ObstacleDef,
): { x: number; z: number; hit: boolean } {
  if (!circleIntersectsObstacle(x, z, radius, o)) {
    return { x, z, hit: false };
  }
  const cx = THREE.MathUtils.clamp(x, o.min.x, o.max.x);
  const cz = THREE.MathUtils.clamp(z, o.min.z, o.max.z);
  let dx = x - cx;
  let dz = z - cz;
  const len = Math.hypot(dx, dz);
  const eps = 1e-4;
  if (len < eps) {
    const mx = (o.min.x + o.max.x) * 0.5;
    const mz = (o.min.z + o.max.z) * 0.5;
    dx = x - mx;
    dz = z - mz;
    const l2 = Math.hypot(dx, dz) || 1;
    dx /= l2;
    dz /= l2;
  } else {
    dx /= len;
    dz /= len;
  }
  // Increased push distance for stronger collision response
  const push = radius + 0.3;
  return { x: cx + dx * push, z: cz + dz * push, hit: true };
}
