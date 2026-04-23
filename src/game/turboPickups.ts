import * as THREE from 'three';
import { TURBO_PICKUP_DEFS } from '../track/config';
import { findTForWorldZ, getRoadCenterline } from '../track/roadPath';

export type TurboPickupInstance = {
  group: THREE.Group;
  x: number;
  z: number;
  baseY: number;
  active: boolean;
  phase: number;
  /**
   * Solo recogible cuando `MotoGame.nextCheckpointIndex` sea ≥ a este valor
   * (p. ej. 1: ya recogido Pupy, rumbo a Papá).
   */
  minNextCheckpointIndex: number;
};

/**
 * Iconos 3D (anillo + rombo) cian; posición y desbloqueo en `TURBO_PICKUP_DEFS` (ruta, no antes de un pasajero).
 */
function buildIconMesh(phase: number): THREE.Group {
  const g = new THREE.Group();
  const matRing = new THREE.MeshStandardMaterial({
    color: 0x0ea4e8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.75,
    metalness: 0.4,
    roughness: 0.28,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.1, 8, 28), matRing);
  ring.rotation.x = Math.PI / 2;
  const matCore = new THREE.MeshStandardMaterial({
    color: 0x7dd3fc,
    emissive: 0x22d3ee,
    emissiveIntensity: 0.95,
    metalness: 0.2,
    roughness: 0.2,
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.2), matCore);
  const bolt = new THREE.Mesh(
    new THREE.ConeGeometry(0.08, 0.2, 6),
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xfacc15,
      emissiveIntensity: 0.5,
      metalness: 0.3,
    }),
  );
  bolt.position.set(0, 0.32, 0);
  g.add(ring, core, bolt);
  g.userData.spin = 0.9 + (phase % 3) * 0.1;
  return g;
}

export function createDefaultTurboPickups(scene: THREE.Scene): TurboPickupInstance[] {
  return createTurboPickupsOnRoad(scene, TURBO_PICKUP_DEFS);
}

export function createTurboPickupsOnRoad(
  scene: THREE.Scene,
  defs: ReadonlyArray<{ zOnRoute: number; minNextCheckpointIndex: number }>,
): TurboPickupInstance[] {
  const c = getRoadCenterline();
  const out: TurboPickupInstance[] = [];
  let i = 0;
  for (const def of defs) {
    const t = findTForWorldZ(def.zOnRoute);
    const p = c.getPointAt(t);
    const baseY = 0.6;
    const g = buildIconMesh(i);
    g.position.set(p.x, baseY, p.z);
    scene.add(g);
    out.push({
      group: g,
      x: p.x,
      z: p.z,
      baseY,
      active: true,
      phase: i * 0.7,
      minNextCheckpointIndex: def.minNextCheckpointIndex,
    });
    i++;
  }
  return out;
}

export function updateTurboPickupFloat(
  p: TurboPickupInstance,
  timeSec: number,
  dt: number,
): void {
  if (!p.active) {
    return;
  }
  p.group.position.y = p.baseY + Math.sin(timeSec * 2.2 + p.phase * 1.3) * 0.1;
  const spin = (p.group.userData['spin'] as number) ?? 1;
  p.group.rotation.y += dt * spin;
}
