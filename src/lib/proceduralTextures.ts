import * as THREE from 'three';

let roughnessMap: THREE.DataTexture | null = null;
let specularPepple: THREE.DataTexture | null = null;
let asphaltColorMap: THREE.DataTexture | null = null;
let asphaltNormalMap: THREE.DataTexture | null = null;
let sidewalkMap: THREE.DataTexture | null = null;
let glassMaskMap: THREE.DataTexture | null = null;

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

/** Base color de asfalto: variación cromática + motas para evitar plano plano. */
export function getAsphaltColorMap(): THREE.DataTexture {
  if (asphaltColorMap) return asphaltColorMap;
  const s = 128;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const o = (y * s + x) * 4;
      const n1 = Math.sin(x * 0.12) * Math.cos(y * 0.09);
      const n2 = Math.sin((x + y) * 0.17) * 0.5 + (Math.random() - 0.5) * 0.35;
      const shade = Math.max(0, Math.min(1, 0.38 + n1 * 0.18 + n2 * 0.16));
      const r = Math.floor(56 + shade * 44);
      const g = Math.floor(58 + shade * 46);
      const b = Math.floor(62 + shade * 52);
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(6, 44);
  t.needsUpdate = true;
  asphaltColorMap = t;
  return asphaltColorMap;
}

/** Normal map sintética barata para micro-relieve de asfalto. */
export function getAsphaltNormalMap(): THREE.DataTexture {
  if (asphaltNormalMap) return asphaltNormalMap;
  const s = 96;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const o = (y * s + x) * 4;
      const nx = Math.sin(x * 0.21 + y * 0.07) * 0.22 + (Math.random() - 0.5) * 0.14;
      const ny = Math.cos(y * 0.19 - x * 0.05) * 0.22 + (Math.random() - 0.5) * 0.14;
      data[o] = Math.floor((nx * 0.5 + 0.5) * 255);
      data[o + 1] = Math.floor((ny * 0.5 + 0.5) * 255);
      data[o + 2] = 255;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(5, 36);
  t.needsUpdate = true;
  asphaltNormalMap = t;
  return asphaltNormalMap;
}

/** Textura procedural de concreto/acera para romper superficies lisas. */
export function getSidewalkMap(): THREE.DataTexture {
  if (sidewalkMap) return sidewalkMap;
  const s = 96;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const o = (y * s + x) * 4;
      const lineX = (x % 24) < 2 ? 0.09 : 0;
      const lineY = (y % 24) < 2 ? 0.09 : 0;
      const noise = (Math.random() - 0.5) * 0.08 + Math.sin((x + y) * 0.13) * 0.05;
      const base = Math.max(0, Math.min(1, 0.62 + noise - lineX - lineY));
      const c = Math.floor(115 + base * 88);
      data[o] = c;
      data[o + 1] = c + 2;
      data[o + 2] = c + 5;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 48);
  t.needsUpdate = true;
  sidewalkMap = t;
  return sidewalkMap;
}

/** Máscara sencilla para reflejo de ventanas (canal G útil para roughness/metalness control). */
export function getGlassMaskMap(): THREE.DataTexture {
  if (glassMaskMap) return glassMaskMap;
  const s = 64;
  const data = new Uint8Array(s * s * 4);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const o = (y * s + x) * 4;
      const stripe = ((x + y * 0.2) % 16) < 3 ? 0.22 : 0;
      const noise = (Math.random() - 0.5) * 0.12;
      const v = Math.max(0, Math.min(1, 0.7 + noise - stripe));
      const g = Math.floor(v * 255);
      data[o] = g;
      data[o + 1] = g;
      data[o + 2] = g;
      data[o + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, s, s);
  t.colorSpace = THREE.NoColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  t.needsUpdate = true;
  glassMaskMap = t;
  return glassMaskMap;
}
