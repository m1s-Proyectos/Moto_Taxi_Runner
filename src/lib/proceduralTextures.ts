import * as THREE from 'three';

let roughnessMap: THREE.DataTexture | null = null;
let specularPepple: THREE.DataTexture | null = null;

/**
 * Mapeo de rugosidad (fachadas). Three.js usa el canal **G** de `roughnessMap`.
 */
export function getFacadeRoughnessMap(): THREE.DataTexture {
  if (roughnessMap) return roughnessMap;
  const s = 80;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n =
        0.48 +
        0.3 * Math.sin(x * 0.35) * Math.cos(y * 0.28) +
        0.12 * (Math.random() - 0.5);
      const g = Math.max(0, Math.min(255, Math.floor(n * 255)));
      const o = (y * s + x) * 4;
      data[o] = 128;
      data[o + 1] = g;
      data[o + 2] = 128;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  t.needsUpdate = true;
  roughnessMap = t;
  return roughnessMap;
}

/** Rugosidad fina (canal G) para pintura de carrocería. */
export function getCarPaintPeppleMap(): THREE.DataTexture {
  if (specularPepple) return specularPepple;
  const s = 64;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const n = 0.75 + 0.22 * (0.5 + 0.5 * Math.sin(x * 0.7) * Math.cos(y * 0.6) + 0.15 * (Math.random() - 0.5));
      const g = Math.min(255, Math.floor(n * 255));
      const o = (y * s + x) * 4;
      data[o] = 200;
      data[o + 1] = g;
      data[o + 2] = 200;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.needsUpdate = true;
  specularPepple = t;
  return specularPepple;
}
