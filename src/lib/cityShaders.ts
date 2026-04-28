import * as THREE from 'three';

/**
 * Sistema de shaders para look "arcade AAA" en edificios usando InstancedMesh.
 *
 * Diseño:
 *  - Reutiliza `MeshStandardMaterial` (PBR + sombras + fog + envmap)
 *  - Inyecta GLSL via `onBeforeCompile` para añadir:
 *      · gradiente vertical (oscuro abajo, claro arriba)
 *      · ventanas procedurales (sin geometría, sólo emissive + máscara UV)
 *      · acentos neon en cornisa
 *      · variación de rugosidad y hue por instancia (anti-uniformidad)
 *      · ligero parpadeo en ~10% de ventanas
 *  - 1 sola draw call por InstancedMesh, sin texturas grandes.
 *
 * Layout asumido:
 *  - Geometría unitaria (-0.5..0.5) — caso de RoundedBoxGeometry(1,1,1,..).
 *  - Cada instancia escalada vía `instanceMatrix` (w, h, d en metros).
 *
 * Uso:
 *  - `createBuildingFacadeMaterial()` para fachadas principales.
 *  - `createSkylineFacadeMaterial()` para skyline lejano (sin ventanas, neutro).
 *  - Llamar `tickCityShaders(timeSec)` una vez por frame para animar parpadeo.
 */

interface ShaderRef {
  uniforms: {
    uTime: { value: number };
    uWindowGlow: { value: number };
  };
}

const trackedShaders: ShaderRef[] = [];

const SHARED_HEAD = /* glsl */ `
varying vec3 vLocalPos;
varying vec3 vObjNormal;
varying vec3 vInstScale;

float h11(float n) { return fract(sin(n) * 43758.5453); }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float h31(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
`;

const VERTEX_INJECT = /* glsl */ `
  vLocalPos = position;
  vObjNormal = normal;
  #ifdef USE_INSTANCING
    mat3 m3 = mat3(instanceMatrix);
    vInstScale = vec3(length(m3[0]), length(m3[1]), length(m3[2]));
  #else
    vInstScale = vec3(1.0);
  #endif
`;

/**
 * Material de fachada principal.
 * - Acepta `instanceColor` para color base por edificio (paleta cálida/pastel).
 * - El shader añade gradiente, ventanas procedurales, acentos y variación.
 */
export function createBuildingFacadeMaterial(opts?: {
  windowGlow?: number;
  baseRoughness?: number;
  baseMetalness?: number;
}): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: opts?.baseRoughness ?? 0.55,
    metalness: opts?.baseMetalness ?? 0.06,
    envMapIntensity: 0.7,
    emissive: 0x000000,
    emissiveIntensity: 1.0,
  });

  const windowGlow = opts?.windowGlow ?? 0.55;

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWindowGlow = { value: windowGlow };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${SHARED_HEAD}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${VERTEX_INJECT}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${SHARED_HEAD}\nuniform float uTime;\nuniform float uWindowGlow;\n`,
      )
      // Variación per-instancia de rugosidad: rompe el "look plástico" uniforme.
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
{
  float rSeed = h31(vInstScale * 13.17 + 1.0);
  roughnessFactor = clamp(roughnessFactor + (rSeed - 0.5) * 0.32, 0.34, 0.85);
}
`,
      )
      // Gradiente vertical + leves bandas horizontales (faux-pisos)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 absN = abs(vObjNormal);
  float sideMask = step(0.5, max(absN.x, absN.z));

  // Gradiente: base ~0.78x, top ~1.10x (sólo en caras laterales)
  float heightT = clamp(vLocalPos.y + 0.5, 0.0, 1.0);
  float grad = mix(0.78, 1.12, smoothstep(0.0, 1.0, heightT));
  diffuseColor.rgb *= mix(1.0, grad, sideMask);

  // Hue shimmer per-instancia (rompe paleta uniforme)
  float seed = h31(vInstScale * 7.31 + 5.5);
  float warm = (seed - 0.5) * 0.07;
  diffuseColor.rgb += vec3(warm, warm * 0.55, -warm * 0.4) * sideMask;

  // Bandas horizontales sutiles cada ~1.4m (separadores de piso)
  float worldY = vLocalPos.y * vInstScale.y;
  float bands = smoothstep(0.93, 0.99, fract(worldY * 0.72));
  diffuseColor.rgb *= 1.0 - bands * 0.16 * sideMask;
}
`,
      )
      // Ventanas procedurales + cornisa neon (todo en emissive)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
{
  vec3 absN = abs(vObjNormal);
  float sideMask = step(0.5, max(absN.x, absN.z));

  if (sideMask > 0.5) {
    // UV de fachada según eje dominante
    vec2 uv;
    float facadeWidth;
    if (absN.x > absN.z) {
      uv = vec2(vLocalPos.z, vLocalPos.y);
      facadeWidth = vInstScale.z;
    } else {
      uv = vec2(vLocalPos.x, vLocalPos.y);
      facadeWidth = vInstScale.x;
    }
    uv += 0.5;

    // Densidad de ventanas en mundo: ~1 por 1.1m horizontal, ~1.0m vertical
    vec2 cells = vec2(
      max(2.0, floor(facadeWidth * 0.92)),
      max(3.0, floor(vInstScale.y * 1.05))
    );
    vec2 cId = floor(uv * cells);
    vec2 cUv = fract(uv * cells);

    // Semilla estable por edificio (combina escala como huella)
    vec2 buildingSeed = vec2(
      vInstScale.x * 12.34 + vInstScale.z * 5.67,
      vInstScale.y * 3.45 + 0.91
    );
    float rWin  = h21(cId + buildingSeed);
    float rWarm = h21(cId * 1.71 + buildingSeed * 2.13);
    float rLit  = h21(cId * 2.97 + buildingSeed * 0.87);
    float rFlk  = h21(cId * 9.13 + buildingSeed * 1.05);

    // Marco de la ventana (margen interior 0.2 → frame visible)
    vec2 inWin = step(vec2(0.20), cUv) * step(cUv, vec2(0.80));
    float winMask = inWin.x * inWin.y;

    // Algunas celdas vacías (variación / piso comercial)
    float dropout = step(0.16, rWin);
    winMask *= dropout;

    // Nivel de calle: planta baja con ventanas más grandes (escaparate)
    float groundFloor = step(uv.y, 0.18);
    winMask = mix(winMask, step(0.10, rWin), groundFloor);

    // Iluminadas: ~58% de las ventanas
    float lit = step(0.42, rLit);

    // Tono cálido / frío
    vec3 warmTone = vec3(1.00, 0.78, 0.42);
    vec3 coolTone = vec3(0.55, 0.78, 1.00);
    vec3 winColor = mix(coolTone, warmTone, step(0.5, rWarm));

    // Parpadeo sutil en ~8% de ventanas
    float flickerActive = step(0.92, rFlk);
    float flicker = 1.0 - 0.45 * flickerActive
      * (0.5 + 0.5 * sin(uTime * 5.7 + cId.x * 1.7 + cId.y * 0.9));

    float winEmissive = winMask * lit * flicker;
    totalEmissiveRadiance += winColor * winEmissive * uWindowGlow;

    // Tinta el cristal en diffuse para que se vea aunque no esté "encendido"
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      diffuseColor.rgb * 0.55 + winColor * 0.22,
      winMask * 0.55
    );

    // Acento neon en cornisa (top edge ~1-2% del alto)
    float rooflineT = smoothstep(0.965, 0.985, uv.y) * (1.0 - smoothstep(0.985, 0.999, uv.y));
    float hasAccent = step(0.55, h21(buildingSeed));
    vec3 accentColor = mix(
      vec3(0.95, 0.45, 0.85),
      vec3(0.45, 0.85, 1.00),
      step(0.5, h21(buildingSeed * 1.7))
    );
    totalEmissiveRadiance += accentColor * rooflineT * hasAccent * 0.7;
  }
}
`,
      );

    trackedShaders.push(shader as unknown as ShaderRef);
  };

  // Tag para forzar recompilación si se cambia algo
  mat.customProgramCacheKey = () => 'mt-building-facade-v1';
  return mat;
}

/**
 * Versión liviana para skyline lejano: solo gradiente vertical y desaturación
 * (sin ventanas para evitar aliasing/moire a distancia).
 */
export function createSkylineFacadeMaterial(): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.78,
    metalness: 0.06,
    envMapIntensity: 0.4,
  });

  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>\n${SHARED_HEAD}`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n${VERTEX_INJECT}`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>\n${SHARED_HEAD}\n`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 absN = abs(vObjNormal);
  float sideMask = step(0.5, max(absN.x, absN.z));

  // Gradiente más suave para masa lejana
  float heightT = clamp(vLocalPos.y + 0.5, 0.0, 1.0);
  float grad = mix(0.85, 1.05, smoothstep(0.0, 1.0, heightT));
  diffuseColor.rgb *= mix(1.0, grad, sideMask);

  // Desaturación: tira los colores hacia luminance neutra (depth aérea)
  float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), 0.32);
}
`,
      );
  };

  mat.customProgramCacheKey = () => 'mt-skyline-facade-v1';
  return mat;
}

/** Avanza el tiempo del shader (parpadeo de ventanas). Llamar 1 vez por frame. */
export function tickCityShaders(timeSec: number): void {
  for (const sh of trackedShaders) {
    sh.uniforms.uTime.value = timeSec;
  }
}
