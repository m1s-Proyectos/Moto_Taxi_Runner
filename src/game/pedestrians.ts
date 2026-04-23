import * as THREE from 'three';

export type PedestrianInstance = {
  group: THREE.Group;
  z: number;
  phase: number;
  speed: number;
  /** Radio de colisión en XZ */
  radius: number;
};

const PED_R = 0.38;

/** Figura muy simple (cabeza + torso + piernas) — legible a la cámara del juego. */
function createPedestrianFigure(shirtHex: number, pantsHex: number): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xd4a574, roughness: 0.65, metalness: 0.02 });
  const shirt = new THREE.MeshStandardMaterial({ color: shirtHex, roughness: 0.72, metalness: 0.04 });
  const pants = new THREE.MeshStandardMaterial({ color: pantsHex, roughness: 0.78, metalness: 0.03 });

  const legGeo = new THREE.CylinderGeometry(0.1, 0.11, 0.52, 8);
  const legL = new THREE.Mesh(legGeo, pants);
  legL.position.set(-0.14, 0.26, 0);
  g.add(legL);
  const legR = new THREE.Mesh(legGeo, pants);
  legR.position.set(0.14, 0.26, 0);
  g.add(legR);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.55, 10), shirt);
  body.position.set(0, 0.78, 0);
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), skin);
  head.position.set(0, 1.18, 0);
  g.add(head);

  return g;
}

const SHIRTS = [0x3b82f6, 0xec4899, 0xf59e0b, 0x10b981, 0x8b5cf6, 0xef4444];
const PANTS = [0x1e293b, 0x334155, 0x422006, 0x14532d];

export function createCrossingPedestrians(zCenter: number, count: number): PedestrianInstance[] {
  const out: PedestrianInstance[] = [];
  for (let i = 0; i < count; i++) {
    const shirt = SHIRTS[i % SHIRTS.length]!;
    const pants = PANTS[i % PANTS.length]!;
    const group = createPedestrianFigure(shirt, pants);
    const z = zCenter + (i - (count - 1) * 0.5) * 0.75;
    group.position.set(0, 0, z);
    const phase = (i / count) * Math.PI * 2 + i * 0.7;
    const speed = 0.55 + (i % 3) * 0.12;
    out.push({ group, z, phase, speed, radius: PED_R });
  }
  return out;
}

/** Oscila en X atravesando la calzada; `amp` mitad del ancho útil (~ carril). */
export function updatePedestrianPositions(
  pedestrians: readonly PedestrianInstance[],
  timeSec: number,
  amp: number,
): void {
  for (const p of pedestrians) {
    const t = timeSec * p.speed + p.phase;
    p.group.position.x = Math.sin(t) * amp;
    p.group.position.z = p.z;
    p.group.rotation.y = Math.cos(t) > 0 ? Math.PI / 2 : -Math.PI / 2;
  }
}

export function addZebraCrossing(scene: THREE.Scene, zCenter: number): void {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.88,
    metalness: 0.02,
  });
  const stripeW = 0.55;
  const stripeL = 16;
  for (let i = 0; i < 7; i++) {
    const stripe = new THREE.Mesh(new THREE.PlaneGeometry(stripeW, stripeL), mat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(-4.5 + i * 1.5, 0.025, zCenter);
    scene.add(stripe);
  }
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x5c5c66,
    roughness: 0.9,
    metalness: 0.04,
  });
  const padL = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 5), padMat);
  padL.position.set(-12.5, 0.04, zCenter);
  scene.add(padL);
  const padR = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.06, 5), padMat);
  padR.position.set(12.5, 0.04, zCenter);
  scene.add(padR);
}
