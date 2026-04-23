import * as THREE from 'three';

const LOCAL_REAR_L = new THREE.Vector3(-0.24, 0.08, 0.52);
const LOCAL_REAR_R = new THREE.Vector3(0.24, 0.08, 0.52);

const SCRATCH = new THREE.Vector3();

/**
 * Estela de derrape: dos tiras bajo ruedas traseras, material aditivo azul.
 * Coloca puntos con la matriz mundo del `bike` (tras posición/rotación del frame).
 */
export class DriftTrail {
  private readonly group = new THREE.Group();
  private readonly geometryL = new THREE.BufferGeometry();
  private readonly geometryR = new THREE.BufferGeometry();
  private readonly lineL: THREE.Line;
  private readonly lineR: THREE.Line;
  private readonly matMain: THREE.LineBasicMaterial;
  private readonly matSoft: THREE.LineBasicMaterial;
  private readonly pointsL: THREE.Vector3[] = [];
  private readonly pointsR: THREE.Vector3[] = [];
  private readonly maxPoints: number;

  constructor(
    scene: THREE.Scene,
    options?: { maxPoints?: number },
  ) {
    this.maxPoints = options?.maxPoints ?? 50;

    this.matMain = new THREE.LineBasicMaterial({
      color: 0x22a6ff,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.matSoft = this.matMain.clone();
    this.matSoft.color = new THREE.Color(0x55c8ff);
    this.matSoft.opacity = 0.45;

    this.lineL = new THREE.Line(this.geometryL, this.matMain);
    this.lineR = new THREE.Line(this.geometryR, this.matSoft);
    this.group.add(this.lineL, this.lineR);
    this.group.renderOrder = 2;
    scene.add(this.group);
  }

  clear(): void {
    this.pointsL.length = 0;
    this.pointsR.length = 0;
    this.geometryL.setFromPoints(this.pointsL);
    this.geometryR.setFromPoints(this.pointsR);
    this.group.visible = false;
  }

  /**
   * @param intensity 0–1
   * @param minIntensity umbral; por debajo solo decae la cola
   */
  update(
    _dt: number,
    intensity: number,
    minIntensity: number,
    bike: THREE.Object3D,
  ): void {
    if (intensity < minIntensity) {
      this.decay();
      return;
    }

    bike.updateMatrixWorld(true);
    this.worldFromLocal(LOCAL_REAR_L, bike.matrixWorld, SCRATCH);
    this.pointsL.push(SCRATCH.clone());
    this.worldFromLocal(LOCAL_REAR_R, bike.matrixWorld, SCRATCH);
    this.pointsR.push(SCRATCH.clone());

    while (this.pointsL.length > this.maxPoints) {
      this.pointsL.shift();
    }
    while (this.pointsR.length > this.maxPoints) {
      this.pointsR.shift();
    }

    this.pushGeometries();
    const f = Math.min(1, intensity * 1.1);
    this.matMain.opacity = 0.45 + 0.4 * f;
    this.matSoft.opacity = 0.25 + 0.3 * f;
  }

  private worldFromLocal(
    local: THREE.Vector3,
    matrixWorld: THREE.Matrix4,
    out: THREE.Vector3,
  ): void {
    out.copy(local).applyMatrix4(matrixWorld);
  }

  private decay(): void {
    if (this.pointsL.length === 0) {
      this.group.visible = false;
      return;
    }
    const drop = Math.max(1, Math.ceil(this.pointsL.length * 0.16));
    for (let i = 0; i < drop; i++) {
      this.pointsL.shift();
      this.pointsR.shift();
    }
    this.pushGeometries();
    if (this.pointsL.length < 2) {
      this.pointsL.length = 0;
      this.pointsR.length = 0;
      this.group.visible = false;
    }
  }

  private pushGeometries(): void {
    if (this.pointsL.length < 2) {
      this.group.visible = false;
      return;
    }
    this.geometryL.setFromPoints(this.pointsL);
    this.geometryR.setFromPoints(this.pointsR);
    this.group.visible = true;
  }

  dispose(): void {
    this.group.parent?.remove(this.group);
    this.geometryL.dispose();
    this.geometryR.dispose();
    this.matMain.dispose();
    this.matSoft.dispose();
  }
}
