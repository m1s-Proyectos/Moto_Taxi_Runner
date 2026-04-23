import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Estilos cercanos a /public/img/mototaxi1.jpg (Bajaj RE abierto) y mototaxi2.jpg (cabina cerrada).
 * Primitivas redondeadas + cristal físico para lectura más “foto” que cajas planas.
 */

export type BikeStyle = 'classic' | 'urban';

export const BIKE_STYLE_KEY = 'mtr-bike-style';

export function readStoredBikeStyle(): BikeStyle {
  try {
    const v = localStorage.getItem(BIKE_STYLE_KEY);
    if (v === 'urban' || v === 'classic') return v;
  } catch {
    /* ignore */
  }
  return 'urban';
}

export function writeStoredBikeStyle(s: BikeStyle): void {
  try {
    localStorage.setItem(BIKE_STYLE_KEY, s);
  } catch {
    /* ignore */
  }
}

function disposeObject3D(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      geometries.add(obj.geometry);
      const m = obj.material;
      if (Array.isArray(m)) m.forEach((x) => materials.add(x));
      else materials.add(m);
    }
  });
  geometries.forEach((geo) => geo.dispose());
  materials.forEach((mat) => mat.dispose());
}

export function mountBikeStyle(bikeRoot: THREE.Group, style: BikeStyle): void {
  for (let i = bikeRoot.children.length - 1; i >= 0; i--) {
    const ch = bikeRoot.children[i]!;
    bikeRoot.remove(ch);
    disposeObject3D(ch);
  }
  bikeRoot.add(createBikeModel(style));
}

const WY = 0.35;
const WR = 0.33;
const TIRE_W = 0.19;

function rb(
  w: number,
  h: number,
  d: number,
  radius: number,
  mat: THREE.Material,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const seg = Math.max(2, Math.min(6, Math.ceil(radius * 14)));
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, radius), mat);
  mesh.position.set(x, y, z);
  return mesh;
}

function addThreeWheels(g: THREE.Group, tireHex: number, rimHex: number): void {
  const tireRough = 0.94;
  const rimRough = 0.32;
  const rimMetal = 0.42;
  const mk = (x: number, z: number) => {
    const tireMat = new THREE.MeshStandardMaterial({
      color: tireHex,
      roughness: tireRough,
      metalness: 0.02,
    });
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(WR, WR, TIRE_W, 28),
      tireMat,
    );
    tire.rotation.z = Math.PI / 2;
    tire.position.set(x, WY, z);
    g.add(tire);

    const rimMat = new THREE.MeshStandardMaterial({
      color: rimHex,
      roughness: rimRough,
      metalness: rimMetal,
    });
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(WR * 0.5, WR * 0.5, TIRE_W + 0.04, 20),
      rimMat,
    );
    rim.rotation.z = Math.PI / 2;
    rim.position.set(x, WY, z);
    g.add(rim);
  };
  mk(0, -0.93);
  mk(-0.6, 0.78);
  mk(0.6, 0.78);
}

function glassMat(tint: number, transmission: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    metalness: 0,
    roughness: 0.06,
    transmission,
    thickness: 0.45,
    transparent: true,
    opacity: 1,
    ior: 1.48,
    side: THREE.DoubleSide,
  });
}

/** mototaxi1: morro redondeado, lona negra, laterales abiertos, guardabarros y jaula ligera. */
function createClassicModel(): THREE.Group {
  const g = new THREE.Group();

  const paintWhite = new THREE.MeshStandardMaterial({
    color: 0xfdfdfd,
    roughness: 0.22,
    metalness: 0.38,
  });
  const canvasBlack = new THREE.MeshStandardMaterial({
    color: 0x141414,
    roughness: 0.9,
    metalness: 0.02,
  });
  const plasticBlack = new THREE.MeshStandardMaterial({
    color: 0x0c0c0c,
    roughness: 0.68,
    metalness: 0.08,
  });
  const seatMat = new THREE.MeshStandardMaterial({
    color: 0x3d2c25,
    roughness: 0.82,
    metalness: 0.05,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: 0xd8dee6,
    roughness: 0.28,
    metalness: 0.72,
  });

  g.add(rb(1.08, 0.26, 1.9, 0.1, paintWhite, 0, 0.39, 0.05));

  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52),
    paintWhite,
  );
  nose.scale.set(1.35, 0.75, 1.15);
  nose.position.set(0, 0.48, -0.98);
  g.add(nose);

  g.add(rb(0.72, 0.36, 0.52, 0.12, paintWhite, 0, 0.54, -0.72));

  const mud = new THREE.Mesh(
    new THREE.TorusGeometry(0.33, 0.046, 10, 36, Math.PI * 1.18),
    paintWhite,
  );
  mud.rotation.x = Math.PI / 2;
  mud.rotation.z = Math.PI * 0.04;
  mud.position.set(0, 0.36, -0.94);
  g.add(mud);

  for (const sx of [-1, 1] as const) {
    const rf = new THREE.Mesh(
      new THREE.TorusGeometry(0.3, 0.038, 8, 28, Math.PI * 0.95),
      paintWhite,
    );
    rf.rotation.x = Math.PI / 2;
    rf.rotation.y = sx * 0.35;
    rf.position.set(sx * 0.6, 0.38, 0.78);
    g.add(rf);
  }

  g.add(rb(0.94, 0.12, 0.78, 0.06, paintWhite, 0, 0.54, 0.52));
  g.add(rb(0.74, 0.15, 0.38, 0.06, seatMat, 0, 0.66, 0.5));
  g.add(rb(0.24, 0.12, 0.24, 0.04, seatMat, 0, 0.64, -0.06));

  const tank = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.12, 0.28, 14),
    plasticBlack,
  );
  tank.rotation.z = Math.PI / 2;
  tank.position.set(0, 0.43, -0.14);
  g.add(tank);

  const wind = rb(0.76, 0.6, 0.055, 0.035, glassMat(0x8fa8b8, 0.72), 0, 0.93, -0.36);
  wind.rotation.x = -0.24;
  g.add(wind);

  const wiper = rb(0.34, 0.02, 0.02, 0.008, plasticBlack, -0.12, 1.05, -0.34);
  wiper.rotation.set(-0.24, 0, 0.12);
  g.add(wiper);

  g.add(rb(0.86, 0.34, 0.2, 0.045, plasticBlack, 0, 0.62, -1.03));

  const hlMat = new THREE.MeshStandardMaterial({
    color: 0xfffff0,
    emissive: 0x66552a,
    emissiveIntensity: 0.35,
    roughness: 0.14,
    metalness: 0.35,
  });
  const hlL = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 12), hlMat);
  hlL.position.set(-0.25, 0.61, -1.08);
  g.add(hlL);
  const hlR = new THREE.Mesh(new THREE.SphereGeometry(0.078, 16, 12), hlMat.clone());
  hlR.position.set(0.25, 0.61, -1.08);
  g.add(hlR);

  const amber = new THREE.MeshStandardMaterial({
    color: 0xff9500,
    emissive: 0x663300,
    emissiveIntensity: 0.25,
    roughness: 0.42,
    metalness: 0,
  });
  g.add(rb(0.2, 0.05, 0.07, 0.018, amber, -0.48, 0.7, -0.52));
  g.add(rb(0.2, 0.05, 0.07, 0.018, amber.clone(), 0.48, 0.7, -0.52));

  g.add(rb(0.11, 0.07, 0.035, 0.015, chrome, 0, 0.61, -1.09));

  const mirrorMat = plasticBlack;
  for (const sx of [-1, 1] as const) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.14, 8), mirrorMat);
    stalk.rotation.z = Math.PI / 2;
    stalk.rotation.x = -0.4;
    stalk.position.set(sx * 0.48, 1.02, -0.36);
    g.add(stalk);
    g.add(rb(0.07, 0.1, 0.045, 0.012, mirrorMat, sx * 0.56, 1.08, -0.34));
  }

  g.add(rb(0.9, 0.11, 1.14, 0.055, canvasBlack, 0, 1.34, 0.02));

  const roofArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.44, 0.032, 8, 32, Math.PI * 0.98),
    canvasBlack,
  );
  roofArch.rotation.y = Math.PI / 2;
  roofArch.rotation.x = Math.PI / 2;
  roofArch.position.set(0, 1.42, 0.02);
  g.add(roofArch);

  const cageMat = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    roughness: 0.55,
    metalness: 0.45,
  });
  for (const sx of [-1, 1] as const) {
    for (const sz of [-0.32, 0.38] as const) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.78, 8), cageMat);
      pole.position.set(sx * 0.44, 0.92, sz);
      g.add(pole);
    }
  }
  const railGeo = new THREE.CylinderGeometry(0.018, 0.018, 1.12, 8);
  for (const sx of [-1, 1] as const) {
    const rail = new THREE.Mesh(railGeo, cageMat);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(sx * 0.46, 0.88, 0.05);
    g.add(rail);
  }

  addThreeWheels(g, 0x121820, 0xf4f4f4);

  return g;
}

/** mototaxi2: cabina cerrada, pintura bicolor brillante, parachoques negro, lunas tintadas. */
function createUrbanModel(): THREE.Group {
  const g = new THREE.Group();

  const whitePaint = new THREE.MeshStandardMaterial({
    color: 0xfafafa,
    roughness: 0.18,
    metalness: 0.42,
  });
  const redPaint = new THREE.MeshStandardMaterial({
    color: 0xd92323,
    roughness: 0.2,
    metalness: 0.32,
  });
  const blackMatte = new THREE.MeshStandardMaterial({
    color: 0x101010,
    roughness: 0.82,
    metalness: 0.04,
  });

  g.add(rb(1.06, 0.055, 1.92, 0.025, blackMatte, 0, 0.265, 0.05));

  g.add(rb(1.02, 0.44, 1.88, 0.12, redPaint, 0, 0.48, 0.05));

  const cabin = rb(0.9, 0.88, 1.28, 0.14, whitePaint, 0, 1.08, 0.06);
  g.add(cabin);

  g.add(rb(0.66, 0.48, 0.42, 0.13, redPaint, 0, 0.54, -0.78));

  g.add(rb(0.44, 0.11, 0.36, 0.05, redPaint, 0, 0.39, -0.84));

  g.add(rb(0.88, 0.15, 1.16, 0.08, whitePaint, 0, 1.52, 0.04));

  g.add(rb(0.25, 0.045, 0.34, 0.02, blackMatte, 0, 1.6, -0.12));

  g.add(rb(0.69, 0.3, 0.24, 0.065, blackMatte, 0, 0.56, -1.04));

  const hlMat = new THREE.MeshStandardMaterial({
    color: 0xfffff5,
    emissive: 0x888855,
    emissiveIntensity: 0.45,
    roughness: 0.1,
    metalness: 0.4,
  });
  const hlL = new THREE.Mesh(new THREE.SphereGeometry(0.076, 18, 14), hlMat);
  hlL.position.set(-0.19, 0.56, -1.12);
  g.add(hlL);
  const hlR = new THREE.Mesh(new THREE.SphereGeometry(0.076, 18, 14), hlMat.clone());
  hlR.position.set(0.19, 0.56, -1.12);
  g.add(hlR);

  const amber = new THREE.MeshStandardMaterial({
    color: 0xff8c1a,
    emissive: 0x552200,
    emissiveIntensity: 0.3,
    roughness: 0.38,
    metalness: 0,
  });
  g.add(rb(0.17, 0.045, 0.055, 0.015, amber, -0.36, 0.72, -0.9));
  g.add(rb(0.17, 0.045, 0.055, 0.015, amber.clone(), 0.36, 0.72, -0.9));

  const wind = rb(0.82, 0.58, 0.06, 0.04, glassMat(0x6a7d8c, 0.78), 0, 1.06, -0.42);
  wind.rotation.x = -0.14;
  g.add(wind);

  const wiper = rb(0.38, 0.018, 0.018, 0.006, blackMatte, 0.08, 1.22, -0.4);
  wiper.rotation.set(-0.14, 0, 0.06);
  g.add(wiper);

  const sideGlass = glassMat(0x1c2430, 0.55);
  for (const sx of [-1, 1] as const) {
    const win = rb(0.04, 0.42, 0.72, 0.015, sideGlass, sx * 0.47, 1.02, 0.12);
    g.add(win);
    g.add(rb(0.045, 0.44, 0.06, 0.012, blackMatte, sx * 0.48, 1.02, -0.18));
    g.add(rb(0.045, 0.44, 0.06, 0.012, blackMatte, sx * 0.48, 1.02, 0.42));
  }

  g.add(rb(0.16, 0.26, 0.045, 0.03, blackMatte, -0.52, 0.86, 0.12));

  g.add(
    rb(
      0.34,
      0.12,
      0.025,
      0.03,
      new THREE.MeshStandardMaterial({
        color: 0xea580c,
        roughness: 0.45,
        metalness: 0.08,
      }),
      0.44,
      0.64,
      0.16,
    ),
  );

  for (const sx of [-1, 1] as const) {
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.16, 8), blackMatte);
    stalk.rotation.z = Math.PI / 2;
    stalk.rotation.x = -0.35;
    stalk.position.set(sx * 0.46, 1.18, -0.32);
    g.add(stalk);
    g.add(rb(0.09, 0.12, 0.05, 0.014, blackMatte, sx * 0.54, 1.24, -0.3));
  }

  const tail = new THREE.MeshStandardMaterial({
    color: 0xb91c1c,
    emissive: 0x551010,
    emissiveIntensity: 0.15,
    roughness: 0.35,
    metalness: 0.2,
  });
  g.add(rb(0.12, 0.06, 0.08, 0.02, tail, -0.46, 0.62, 1.02));
  g.add(rb(0.12, 0.06, 0.08, 0.02, tail.clone(), 0.46, 0.62, 1.02));

  addThreeWheels(g, 0x0a0a0a, 0xb8b8b8);

  return g;
}

export function createBikeModel(style: BikeStyle): THREE.Group {
  return style === 'urban' ? createUrbanModel() : createClassicModel();
}
