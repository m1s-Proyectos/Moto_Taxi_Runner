import * as THREE from 'three';

type Puff = {
  mesh: THREE.Mesh;
  age: number;
  life: number;
};

const REAR_LOCAL = new THREE.Vector3(0, 0.2, 0.62);
const VEL_SCRATCH = new THREE.Vector3();

/**
 * Humo de escape ligero (esferas transparentes). Escala con `tier` 0–5.
 * Pensado para móviles: tope bajo de partículas vivas.
 */
export class ExhaustSmoke {
  private readonly group = new THREE.Group();
  private readonly puffs: Puff[] = [];
  private spawnAcc = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'mtr-exhaust-smoke';
    scene.add(this.group);
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.group);
    for (const p of this.puffs) {
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.puffs.length = 0;
  }

  clear(): void {
    for (const p of this.puffs) {
      this.group.remove(p.mesh);
      p.mesh.geometry.dispose();
      (p.mesh.material as THREE.Material).dispose();
    }
    this.puffs.length = 0;
    this.spawnAcc = 0;
  }

  update(
    dt: number,
    bike: THREE.Object3D,
    opts: { speed: number; throttle: number; tier: number; turboActive: boolean },
  ): void {
    const tier = Math.max(0, Math.min(5, Math.floor(opts.tier)));
    if (tier <= 0) {
      this.decayAll(dt);
      return;
    }

    const speed = Math.abs(opts.speed);
    const gas = Math.max(0, opts.throttle);
    const intensity = THREE.MathUtils.clamp(gas * 0.85 + (speed / 38) * 0.35 + (opts.turboActive ? 0.45 : 0), 0, 1);

    const maxAlive = 10 + tier * 3;
    const spawnPerSec = 2 + tier * 3.2 + (opts.turboActive ? 6 : 0);

    this.spawnAcc += dt * spawnPerSec * intensity;
    bike.updateMatrixWorld(true);

    while (this.spawnAcc >= 1 && this.puffs.length < maxAlive) {
      this.spawnAcc -= 1;
      this.spawnOne(bike.matrixWorld, tier, opts.turboActive);
    }

    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt;
      const t = p.age / p.life;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.42 * (1 - t * t));
      p.mesh.scale.setScalar(1 + t * 2.1);
      const v = p.mesh.userData.vel as THREE.Vector3;
      p.mesh.position.addScaledVector(VEL_SCRATCH.copy(v), dt);
      if (p.age >= p.life) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  private decayAll(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i]!;
      p.age += dt * 2;
      const t = p.age / p.life;
      const mat = p.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.max(0, 0.35 * (1 - t));
      if (p.age >= p.life) {
        this.group.remove(p.mesh);
        p.mesh.geometry.dispose();
        mat.dispose();
        this.puffs.splice(i, 1);
      }
    }
  }

  private spawnOne(worldMat: THREE.Matrix4, tier: number, turbo: boolean): void {
    const geo = new THREE.SphereGeometry(0.09 + Math.random() * 0.05, 6, 6);
    const col = turbo ? 0xa8e8ff : 0xc8ccd4;
    const mat = new THREE.MeshBasicMaterial({
      color: col,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    const pos = REAR_LOCAL.clone().applyMatrix4(worldMat);
    mesh.position.copy(pos);
    const spread = 0.35 + tier * 0.08;
    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * spread,
      0.55 + Math.random() * 0.65 + tier * 0.06,
      0.35 + Math.random() * 0.5,
    );
    vel.applyQuaternion(new THREE.Quaternion().setFromRotationMatrix(worldMat));
    mesh.userData.vel = vel;
    this.group.add(mesh);
    this.puffs.push({ mesh, age: 0, life: 0.55 + tier * 0.08 });
  }
}
