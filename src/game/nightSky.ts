import * as THREE from 'three';

export type NightSky = {
  group: THREE.Group;
  update: (camera: THREE.Camera) => void;
  dispose: () => void;
};

/**
 * Cielo diurno lightweight: cúpula con gradiente, sol suave y nubes planas.
 * El grupo sigue la cámara en XZ para no mostrar bordes.
 */
export function createNightSky(): NightSky {
  const group = new THREE.Group();
  group.name = 'daySky';
  group.renderOrder = -10;

  const skyGeo = new THREE.SphereGeometry(340, 28, 18);
  const skyMat = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x79ccff) },
      horizonColor: { value: new THREE.Color(0xfff0cc) },
      groundColor: { value: new THREE.Color(0xc7e0f6) },
      blendTop: { value: 0.36 },
      blendBottom: { value: -0.16 },
    },
    vertexShader: `
      varying vec3 vWorld;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorld = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: `
      varying vec3 vWorld;
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      uniform vec3 groundColor;
      uniform float blendTop;
      uniform float blendBottom;
      void main() {
        float h = normalize(vWorld).y;
        float tUp = smoothstep(blendBottom, blendTop, h);
        float tHorizon = 1.0 - abs(h) * 1.75;
        tHorizon = clamp(tHorizon, 0.0, 1.0);
        vec3 col = mix(groundColor, topColor, tUp);
        col = mix(col, horizonColor, tHorizon * 0.55);
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  group.add(sky);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(6.6, 24, 16),
    new THREE.MeshStandardMaterial({
      color: 0xfff2c7,
      emissive: 0xffd977,
      emissiveIntensity: 1.06,
      roughness: 0.28,
      metalness: 0,
    }),
  );
  sun.position.set(104, 118, -170);
  group.add(sun);

  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfdf2d0,
    emissiveIntensity: 0.24,
    roughness: 0.98,
    metalness: 0,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
  });
  const cloudGeo = new THREE.PlaneGeometry(22, 7.5);
  const cloudGroup = new THREE.Group();
  const cloudCount = 22;
  for (let i = 0; i < cloudCount; i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    const ang = (i / cloudCount) * Math.PI * 2;
    const r = 130 + (i % 5) * 16 + (i * 13.13) % 9;
    m.position.set(Math.cos(ang) * r, 84 + (i % 4) * 6, Math.sin(ang) * r - 80);
    m.rotation.y = -ang + Math.PI * 0.5;
    m.scale.set(0.7 + (i % 3) * 0.3, 0.85 + (i % 2) * 0.3, 1);
    cloudGroup.add(m);
  }
  group.add(cloudGroup);

  const update = (camera: THREE.Camera) => {
    group.position.set(camera.position.x, 0, camera.position.z);
    cloudGroup.rotation.y += 0.00045;
  };

  const dispose = () => {
    skyGeo.dispose();
    skyMat.dispose();
    sun.geometry.dispose();
    (sun.material as THREE.MeshStandardMaterial).dispose();
    cloudGeo.dispose();
    cloudMat.dispose();
  };

  return { group, update, dispose };
}
