import * as THREE from 'three';

export type CoinCollectResult = { collected: boolean };

const COIN_RADIUS = 0.48;

function buildCoinMesh(): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, 0.11, 20, 1, false);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffd54f,
    roughness: 0.28,
    metalness: 0.78,
    emissive: 0xffaa00,
    emissiveIntensity: 0.55,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

/**
 * Moneda recogible sobre paradas: giro suave, flotación y brillo tipo arcade.
 */
export type CoinTrackRole = 'default' | 'final_stop';

export class Coin {
  readonly mesh: THREE.Mesh;
  collected = false;
  readonly radius = COIN_RADIUS;
  /** Monedas de la última parada: las no recogidas en ruta se acreditan al terminar la bajada. */
  readonly trackRole: CoinTrackRole;
  private readonly bobPhase: number;
  private baseY = 0;

  constructor(pos: THREE.Vector3, phaseSeed = 0, trackRole: CoinTrackRole = 'default') {
    this.mesh = buildCoinMesh();
    this.trackRole = trackRole;
    this.bobPhase = phaseSeed * 1.7 + pos.x * 0.11 + pos.z * 0.07;
    this.mesh.position.copy(pos);
    this.baseY = Math.max(pos.y, 0.52);
    this.mesh.position.y = this.baseY;
  }

  /** Restaura la moneda al iniciar otra carrera (misma sesión 3D). */
  reset(): void {
    this.collected = false;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(1);
    this.mesh.position.y = this.baseY;
  }

  update(dt: number, timeSec: number): void {
    if (this.collected) return;
    // Giro visible en carretera (eje “vertical” de la moneda de canto).
    this.mesh.rotation.y += dt * 1.65;
    this.mesh.rotation.z += dt * 0.85;
    const bob = Math.sin(timeSec * 2.1 + this.bobPhase) * 0.14;
    this.mesh.position.y = this.baseY + bob;
    const pulse = 0.04 * Math.sin(timeSec * 4.3 + this.bobPhase * 2);
    const mat = this.mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.48 + pulse;
  }

  tryCollect(playerXZ: { x: number; z: number }, playerRadius: number): CoinCollectResult {
    if (this.collected) return { collected: false };
    const dx = playerXZ.x - this.mesh.position.x;
    const dz = playerXZ.z - this.mesh.position.z;
    const rr = (playerRadius + this.radius) * (playerRadius + this.radius);
    if (dx * dx + dz * dz > rr) return { collected: false };

    this.collected = true;
    this.mesh.visible = false;
    return { collected: true };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
