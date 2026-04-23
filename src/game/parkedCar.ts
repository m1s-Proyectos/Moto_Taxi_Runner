import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ObstacleDef } from '../track/config';

/** Colores de carrocería variados (sedán / hatch genérico). */
const BODY_COLORS = [
  0x3d5a80, 0x1e3a5f, 0x0f766e, 0x65a30d, 0xb45309, 0xb91c1c, 0x7c3aed, 0x4b5563, 0xeab308,
  0x0d9488,
];

function rb(
  w: number,
  h: number,
  d: number,
  r: number,
  mat: THREE.MeshStandardMaterial,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const seg = Math.max(2, Math.min(5, Math.ceil(r * 12)));
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

/**
 * Coche aparcado con origen en el suelo (y=0), centrado en X/Z locales.
 * Eje largo del vehículo: Z (alineado con la carretera).
 */
export function createParkedCar(o: ObstacleDef, index: number): THREE.Group {
  const sx = o.max.x - o.min.x;
  const sy = o.max.y - o.min.y;
  const sz = o.max.z - o.min.z;
  const cx = (o.min.x + o.max.x) * 0.5;
  const cz = (o.min.z + o.max.z) * 0.5;

  const g = new THREE.Group();
  g.position.set(cx, o.min.y, cz);

  const seed = index * 31 + Math.imul(Math.floor(cx * 10), 17) + Math.imul(Math.floor(cz * 10), 13);
  const pick = BODY_COLORS[Math.abs(seed) % BODY_COLORS.length]!;

  const bodyMat = new THREE.MeshStandardMaterial({
    color: pick,
    roughness: 0.35,
    metalness: 0.45,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a3040,
    roughness: 0.12,
    metalness: 0.55,
    transparent: true,
    opacity: 0.75,
  });
  const blackMat = new THREE.MeshStandardMaterial({
    color: 0x141418,
    roughness: 0.75,
    metalness: 0.12,
  });
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0x25252c,
    roughness: 0.65,
    metalness: 0.2,
  });

  const w = sx * 0.94;
  const len = sz * 0.94;
  const wheelR = Math.min(sy * 0.16, w * 0.2, 0.38);
  const wheelY = wheelR * 0.92;
  const bodyH = Math.max(0.35, sy - wheelY - 0.06);

  const lowerH = bodyH * 0.52;
  const upperH = bodyH * 0.48;
  g.add(rb(w * 0.98, lowerH, len * 0.92, 0.06, bodyMat, 0, wheelY + lowerH * 0.5, 0));
  g.add(
    rb(w * 0.88, upperH, len * 0.55, 0.05, bodyMat, 0, wheelY + lowerH + upperH * 0.5, -len * 0.08),
  );
  g.add(
    rb(
      w * 0.86,
      upperH * 0.85,
      len * 0.38,
      0.04,
      glassMat,
      0,
      wheelY + lowerH + upperH * 0.55,
      len * 0.12,
    ),
  );

  g.add(rb(w * 0.98, 0.12, 0.14, 0.03, bumperMat, 0, wheelY + 0.06, len * 0.48));
  g.add(rb(w * 0.98, 0.12, 0.14, 0.03, bumperMat, 0, wheelY + 0.06, -len * 0.48));

  const hood = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.92, lowerH * 0.35, len * 0.22),
    bodyMat,
  );
  hood.position.set(0, wheelY + lowerH * 0.65, len * 0.36);
  g.add(hood);

  const trunk = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, lowerH * 0.32, len * 0.2),
    bodyMat,
  );
  trunk.position.set(0, wheelY + lowerH * 0.62, -len * 0.38);
  g.add(trunk);

  const tireW = 0.14;
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x141820,
    roughness: 0.95,
    metalness: 0.02,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0x9ca3af,
    roughness: 0.4,
    metalness: 0.5,
  });
  const wx = w * 0.42;
  const wzF = len * 0.32;
  const wzB = -len * 0.32;
  for (const sx of [-1, 1] as const) {
    for (const z of [wzF, wzB] as const) {
      const tire = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelR, wheelR, tireW, 14),
        tireMat,
      );
      tire.rotation.z = Math.PI / 2;
      tire.position.set(sx * wx, wheelY, z);
      g.add(tire);
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, tireW + 0.02, 12),
        rimMat,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(sx * wx, wheelY, z);
      g.add(rim);
    }
  }

  const mirror = rb(0.08, 0.06, 0.05, 0.015, blackMat, w * 0.48, wheelY + lowerH + upperH * 0.4, len * 0.2);
  g.add(mirror);
  const mirror2 = mirror.clone();
  mirror2.position.x *= -1;
  g.add(mirror2);

  return g;
}
