import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Ghost bike that renders another player's mototaxi without physics.
 * Position and rotation lerp toward the latest broadcast snapshot at ~10fps.
 */

const LERP_HZ = 14;

const GHOST_MAT = new THREE.MeshStandardMaterial({
  color: 0x22d3ee,
  emissive: 0x0ea5e9,
  emissiveIntensity: 0.55,
  roughness: 0.28,
  metalness: 0.1,
  transparent: true,
  opacity: 0.68,
  depthWrite: false,
});

const GHOST_WHEEL_MAT = new THREE.MeshStandardMaterial({
  color: 0x0e7490,
  emissive: 0x0c4a6e,
  emissiveIntensity: 0.35,
  roughness: 0.72,
  metalness: 0.04,
  transparent: true,
  opacity: 0.6,
  depthWrite: false,
});

function rb(w: number, h: number, d: number, r: number, x: number, y: number, z: number): THREE.Mesh {
  const seg = Math.max(2, Math.ceil(r * 12));
  const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, seg, r), GHOST_MAT);
  m.position.set(x, y, z);
  return m;
}

function buildGhostModel(): THREE.Group {
  const g = new THREE.Group();

  g.add(rb(1.0, 0.42, 1.85, 0.1, 0, 0.48, 0.04));
  g.add(rb(0.86, 0.82, 1.22, 0.13, 0, 1.08, 0.05));
  g.add(rb(0.84, 0.14, 1.12, 0.07, 0, 1.52, 0.04));
  g.add(rb(0.62, 0.44, 0.38, 0.11, 0, 0.52, -0.76));

  const WR = 0.33;
  const WY = 0.35;
  const TIRE_W = 0.19;
  const addWheel = (wx: number, wz: number): void => {
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(WR, WR, TIRE_W, 20), GHOST_WHEEL_MAT);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(wx, WY, wz);
    g.add(tire);
  };
  addWheel(0, -0.93);
  addWheel(-0.6, 0.78);
  addWheel(0.6, 0.78);

  return g;
}

export class OtherPlayer {
  readonly root: THREE.Group;

  private readonly targetPos = new THREE.Vector3();
  private targetYaw = 0;

  private initialized = false;

  constructor(private readonly scene: THREE.Scene) {
    this.root = new THREE.Group();
    this.root.add(buildGhostModel());
    this.root.visible = false;
    scene.add(this.root);
  }

  /** Called when a position broadcast arrives for this player. */
  applyRemoteState(x: number, y: number, z: number, ry: number): void {
    this.targetPos.set(x, y, z);
    this.targetYaw = ry;
    if (!this.initialized) {
      this.root.position.copy(this.targetPos);
      this.root.rotation.y = this.targetYaw;
      this.root.visible = true;
      this.initialized = true;
    }
  }

  /** Must be called every frame from the game loop. */
  update(dt: number): void {
    if (!this.initialized) return;
    const alpha = Math.min(1, 1 - Math.exp(-LERP_HZ * dt));
    this.root.position.lerp(this.targetPos, alpha);

    const dy = normalizeAngle(this.targetYaw - this.root.rotation.y);
    this.root.rotation.y += dy * alpha;
  }

  dispose(): void {
    this.scene.remove(this.root);
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
      }
    });
  }
}

function normalizeAngle(a: number): number {
  let v = a;
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}
