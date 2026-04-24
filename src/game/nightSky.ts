import * as THREE from 'three';

export type NightSky = {
  group: THREE.Group;
  update: (camera: THREE.Camera) => void;
  dispose: () => void;
};

/**
 * Cielo nocturno: partículas de estrellas + luna emisiva. El grupo sigue la cámara en XZ
 * para que el encuadre no muestre el borde al moverse.
 */
export function createNightSky(): NightSky {
  const group = new THREE.Group();
  group.name = 'nightSky';
  group.renderOrder = -10;

  const nStars = 550;
  const pos = new Float32Array(nStars * 3);
  const srand = (i: number) => {
    const x = Math.sin(i * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let i = 0; i < nStars; i++) {
    const u = srand(i) * 2 - 1;
    const v = srand(i + 17) * 2 - 1;
    const w = srand(i + 31) * 2 - 1;
    const len = Math.sqrt(u * u + v * v + w * w) || 1;
    const R = 180 + srand(i + 3) * 100;
    pos[i * 3] = (u / len) * R;
    pos[i * 3 + 1] = 55 + srand(i + 5) * 100 + 50 * (v / len);
    pos[i * 3 + 2] = (w / len) * R;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xf2f0ff,
    size: 0.42,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const stars = new THREE.Points(geo, mat);
  group.add(stars);

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(2.4, 18, 18),
    new THREE.MeshStandardMaterial({
      color: 0xe8d8c4,
      emissive: 0x9a9fc8,
      emissiveIntensity: 0.55,
      roughness: 0.6,
      metalness: 0,
    }),
  );
  moon.position.set(70, 72, -95);
  group.add(moon);

  const update = (camera: THREE.Camera) => {
    group.position.set(camera.position.x, 0, camera.position.z);
  };

  const dispose = () => {
    geo.dispose();
    mat.dispose();
    moon.geometry.dispose();
    (moon.material as THREE.MeshStandardMaterial).dispose();
  };

  return { group, update, dispose };
}
