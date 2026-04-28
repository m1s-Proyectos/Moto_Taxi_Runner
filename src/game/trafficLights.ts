import * as THREE from 'three';
import { TRAFFIC_LIGHTS } from '../track/config';
import {
  findTForWorldZ,
  getLateralDistanceToRoadMeters,
  getRoadCenterline,
  getRoadYawAtT,
  ROAD_HALF_WIDTH,
} from '../track/roadPath';

const c = new THREE.Vector3();
const tTan = new THREE.Vector3();
const tRight = new THREE.Vector3();
const zoneP = new THREE.Vector3();

/**
 * Mientras dura el verde, el tramo bajo el semáforo no aplica tráfico ni peatones.
 * (Fase 4.1: siempre en verde; reservar para ciclos rojo/ámbar.)
 */
export function isActiveGreenForTraffic(): boolean {
  return true;
}

/**
 * (x, z) del jugador dentro de alguna banda de intersección con semáforo en verde.
 */
export function isInActiveGreenCorridor(x: number, z: number): boolean {
  if (!isActiveGreenForTraffic()) {
    return false;
  }
  const curve = getRoadCenterline();
  for (const def of TRAFFIC_LIGHTS) {
    const t = findTForWorldZ(def.zOnRoute);
    curve.getPointAt(t, zoneP);
    const pz = zoneP.z;
    if (z < pz - def.zHalf || z > pz + def.zHalf) {
      continue;
    }
    if (getLateralDistanceToRoadMeters(x, z) > def.lateralMax) {
      continue;
    }
    return true;
  }
  return false;
}

function addOneTrafficLight(
  parent: THREE.Object3D,
  zOnRoute: number,
  side: 1 | -1,
): void {
  const curve = getRoadCenterline();
  const t = findTForWorldZ(zOnRoute);
  curve.getPointAt(t, c);
  curve.getTangentAt(t, tTan);
  tTan.y = 0;
  if (tTan.lengthSq() < 1e-8) {
    tRight.set(1, 0, 0);
  } else {
    tTan.normalize();
    tRight.set(-tTan.z, 0, tTan.x);
  }
  const sideOffset = ROAD_HALF_WIDTH + 1.15;
  const x = c.x + tRight.x * side * sideOffset;
  const pz = c.z;
  const z = c.z + tRight.z * side * sideOffset;

  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = getRoadYawAtT(t) + (side < 0 ? Math.PI : 0);

  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 2.1, 8),
    new THREE.MeshStandardMaterial({ color: 0x6a727d, metalness: 0.25, roughness: 0.55 }),
  );
  pole.position.y = 1.05;
  g.add(pole);

  const box = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 1.0, 0.22, 1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x27313d, metalness: 0.14, roughness: 0.5 }),
  );
  box.position.set(0, 1.9, 0.14);
  g.add(box);

  const rMat = new THREE.MeshStandardMaterial({
    color: 0x1a0505,
    emissive: 0x0,
    emissiveIntensity: 0,
    metalness: 0.1,
  });
  const yMat = rMat.clone();
  const gMat = new THREE.MeshStandardMaterial({
    color: 0x052e0f,
    emissive: 0x22c55e,
    emissiveIntensity: 0.48,
    metalness: 0.15,
    roughness: 0.35,
  });
  for (let i = 0; i < 3; i++) {
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), [rMat, yMat, gMat][i]!);
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(0, 2.15 - i * 0.3, 0.26);
    g.add(disc);
  }

  g.userData.roadZ = pz;
  parent.add(g);
}

export function addTrafficLightsToScene(scene: THREE.Scene): void {
  for (const def of TRAFFIC_LIGHTS) {
    addOneTrafficLight(scene, def.zOnRoute, def.side);
  }
}
