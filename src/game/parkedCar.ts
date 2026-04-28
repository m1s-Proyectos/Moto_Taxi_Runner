import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { ObstacleDef } from '../track/config';
import { getCarPaintPeppleMap } from '../lib/proceduralTextures';

/** Pinturas urbanas vivas para lectura diurna. */
const BODY_COLORS = [
  0x4a8ff0, 0x3b7cff, 0x22d3ee, 0x2dd4bf, 0x4ade80, 0x84cc16, 0xfacc15, 0xfbbf24, 0xfb923c, 0xf97316,
  0xf43f5e, 0xef4444, 0xec4899, 0xd946ef, 0xa855f7, 0x818cf8, 0xf472b6, 0xff6b9d,
];

function rb(
  w: number,
  h: number,
  d: number,
  r: number,
  mat: THREE.Material,
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
 * Coche aparcado (origen en suelo, eje Z = sentido de la calzada). PBR estándar (sin
 * transmisión de cristal) para ahorrar GPU con muchas instancias.
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

  const paintMap = getCarPaintPeppleMap();
  const bodyEm = new THREE.Color(pick);
  bodyEm.multiplyScalar(0.16);
  /** Standard (no transmisión): más barato en GPU con muchos coches. */
  const bodyMat = new THREE.MeshStandardMaterial({
    color: pick,
    roughness: 0.3,
    metalness: 0.52,
    roughnessMap: paintMap,
    envMapIntensity: 0.9,
    emissive: bodyEm,
    emissiveIntensity: 0.08,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1a2a3c,
    metalness: 0.5,
    roughness: 0.11,
    emissive: 0x0,
    emissiveIntensity: 0,
    transparent: true,
    opacity: 0.88,
  });
  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a34,
    roughness: 0.44,
    metalness: 0.32,
    emissive: 0x12141a,
    emissiveIntensity: 0.1,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: 0xe0e6f0,
    roughness: 0.14,
    metalness: 0.88,
    emissive: 0x0,
    emissiveIntensity: 0,
  });
  const emissHead = new THREE.MeshStandardMaterial({
    color: 0xfefce8,
    emissive: 0xfff2cc,
    emissiveIntensity: 0.16,
  });
  const emissTail = new THREE.MeshStandardMaterial({
    color: 0x4a1010,
    emissive: 0xee1a1a,
    emissiveIntensity: 0.2,
  });

  const w = sx * 0.94;
  const len = sz * 0.94;
  const wheelR = Math.min(sy * 0.16, w * 0.2, 0.38);
  const wheelY = wheelR * 0.92;
  const bodyH = Math.max(0.35, sy - wheelY - 0.06);
  const lowerH = bodyH * 0.52;
  const upperH = bodyH * 0.48;
  const tubeR = Math.min(0.12, wheelR * 0.32);

  g.add(rb(w * 0.98, lowerH, len * 0.92, 0.07, bodyMat, 0, wheelY + lowerH * 0.5, 0));
  g.add(
    rb(
      w * 0.88,
      upperH,
      len * 0.55,
      0.06,
      bodyMat,
      0,
      wheelY + lowerH + upperH * 0.5,
      -len * 0.08,
    ),
  );
  g.add(
    rb(
      w * 0.86,
      upperH * 0.85,
      len * 0.38,
      0.05,
      glassMat,
      0,
      wheelY + lowerH + upperH * 0.55,
      len * 0.12,
    ),
  );

  g.add(rb(w * 0.98, 0.11, 0.15, 0.03, bumperMat, 0, wheelY + 0.05, len * 0.48));
  g.add(rb(w * 0.98, 0.11, 0.15, 0.03, bumperMat, 0, wheelY + 0.05, -len * 0.48));

  const hood = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.92, lowerH * 0.32, len * 0.22, 2, 0.04),
    bodyMat,
  );
  hood.position.set(0, wheelY + lowerH * 0.66, len * 0.35);
  g.add(hood);

  const trunk = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.9, lowerH * 0.3, len * 0.2, 2, 0.04),
    bodyMat,
  );
  trunk.position.set(0, wheelY + lowerH * 0.6, -len * 0.38);
  g.add(trunk);

  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x101820,
    roughness: 0.92,
    metalness: 0.03,
    emissive: 0x0a0e14,
    emissiveIntensity: 0.06,
  });
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xb4bcc8,
    roughness: 0.3,
    metalness: 0.65,
    emissive: 0x6a7588,
    emissiveIntensity: 0.12,
  });

  const wx = w * 0.42;
  const wzF = len * 0.32;
  const wzB = -len * 0.32;
  for (const sx of [-1, 1] as const) {
    for (const z of [wzF, wzB] as const) {
      const tire = new THREE.Mesh(new THREE.TorusGeometry(wheelR, tubeR, 10, 28), tireMat);
      tire.rotation.y = Math.PI / 2;
      tire.position.set(sx * wx, wheelY, z);
      g.add(tire);
      const rim = new THREE.Mesh(
        new THREE.CylinderGeometry(wheelR * 0.52, wheelR * 0.52, tubeR * 1.4, 18),
        rimMat,
      );
      rim.rotation.z = Math.PI / 2;
      rim.position.set(sx * wx, wheelY, z);
      g.add(rim);
    }
  }

  for (const sx of [-1, 1] as const) {
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), emissHead);
    h.position.set(sx * w * 0.34, wheelY + lowerH * 0.48, len * 0.45);
    g.add(h);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.05), emissTail);
    t.position.set(sx * w * 0.33, wheelY + lowerH * 0.42, -len * 0.46);
    t.rotation.y = Math.PI;
    g.add(t);
  }

  g.add(
    rb(0.07, 0.06, 0.05, 0.012, chromeMat, w * 0.48, wheelY + lowerH + upperH * 0.4, len * 0.2),
  );
  const mir2 = rb(
    0.07,
    0.06,
    0.05,
    0.012,
    chromeMat,
    -w * 0.48,
    wheelY + lowerH + upperH * 0.4,
    len * 0.2,
  );
  g.add(mir2);

  const plateF = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.28, 0.1, 0.02, 1, 0.01),
    new THREE.MeshStandardMaterial({
      color: 0xeeeff2,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0x3a3c44,
      emissiveIntensity: 0.1,
    }),
  );
  plateF.position.set(0, wheelY + 0.08, len * 0.49);
  g.add(plateF);

  const under = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.9, 0.06, len * 0.85),
    new THREE.MeshStandardMaterial({
      color: 0x0f1012,
      roughness: 0.88,
      metalness: 0.1,
      emissive: 0x0a0a0c,
      emissiveIntensity: 0.05,
    }),
  );
  under.position.set(0, wheelY * 0.4, 0);
  g.add(under);

  return g;
}
