import gsap from 'gsap';
import * as THREE from 'three';
import { CHECKPOINTS, SPAWN, WORLD_FLOOR_Y, STOP_MARKER_LABELS } from '../track/config';
import { createPedestrianFigure } from './pedestrians';
import { findTForWorldZ, getRoadCenterline, ROAD_HALF_WIDTH } from '../track/roadPath';

export type PassengerAnimKind = 'pickup' | 'dropoff';

const SHIRT = [0x3b82f6, 0xec4899, 0xf59e0b];
const PANTS = [0x1e293b, 0x334155, 0x422006];

const tmp = new THREE.Vector3();
const tang = new THREE.Vector3();
const right = new THREE.Vector3();

function roadFrameAtZ(zWorld: number): { cx: number; cz: number; yaw: number; rx: number; rz: number } {
  const curve = getRoadCenterline();
  const t = findTForWorldZ(zWorld);
  curve.getPointAt(t, tmp);
  curve.getTangentAt(t, tang);
  tang.y = 0;
  if (tang.lengthSq() < 1e-8) {
    return { cx: tmp.x, cz: tmp.z, yaw: 0, rx: 1, rz: 0 };
  }
  tang.normalize();
  right.crossVectors(new THREE.Vector3(0, 1, 0), tang);
  if (right.lengthSq() < 1e-8) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }
  const yaw = Math.atan2(-tang.x, -tang.z);
  return { cx: tmp.x, cz: tmp.z, yaw, rx: right.x, rz: right.z };
}

function hashSide(playerId: string, stopNumber: number): 1 | -1 {
  let h = 0;
  const s = `${playerId}:${stopNumber}`;
  for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i) * (i + 7)) % 1000;
  return h % 2 === 0 ? 1 : -1;
}

/**
 * Animaciones de pasajeros subiendo/bajando en paradas.
 * Diseñado para poder llamarse también desde broadcast multiplayer (`playerId` distingue instancias).
 */
export function triggerPassengerAnim(opts: {
  scene: THREE.Scene;
  bike: THREE.Group;
  playerId: string;
  /** 1–3 = checkpoints en orden; 0 = animación inicial en la salida (solo pickup típico). */
  stopNumber: number;
  kind: PassengerAnimKind;
  onComplete?: () => void;
}): void {
  const { scene, bike, playerId, stopNumber, kind, onComplete } = opts;

  const shirt = SHIRT[Math.abs(stopNumber) % SHIRT.length]!;
  const pant = PANTS[Math.abs(stopNumber + 1) % PANTS.length]!;
  const fig = createPedestrianFigure(shirt, pant);

  const side = hashSide(playerId, stopNumber);

  let anchorZ: number;
  if (stopNumber <= 0) {
    anchorZ = SPAWN.position.z;
  } else {
    const cp = CHECKPOINTS[stopNumber - 1];
    anchorZ = cp ? cp.center.z : bike.position.z;
  }

  const frame = roadFrameAtZ(anchorZ);
  const sidewalkDist = 11.2;
  const doorDist = 2.35;

  fig.position.y = WORLD_FLOOR_Y;

  if (kind === 'pickup') {
    fig.position.x = frame.cx + frame.rx * sidewalkDist * side;
    fig.position.z = frame.cz + frame.rz * sidewalkDist * side;
    fig.rotation.y = frame.yaw + Math.PI * 0.5 * side;
    scene.add(fig);

    const tx = bike.position.x + frame.rx * doorDist * side;
    const tz = bike.position.z + frame.rz * doorDist * side;

    gsap.to(fig.position, {
      x: tx,
      z: tz,
      duration: 0.95,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(fig.scale, {
          x: 0.01,
          y: 0.01,
          z: 0.01,
          duration: 0.12,
          ease: 'power1.in',
          onComplete: () => {
            scene.remove(fig);
            fig.traverse((o) => {
              if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                const m = o.material;
                if (Array.isArray(m)) m.forEach((x) => x.dispose());
                else m.dispose();
              }
            });
            onComplete?.();
          },
        });
      },
    });
  } else {
    fig.position.x = bike.position.x + frame.rx * doorDist * side;
    fig.position.z = bike.position.z + frame.rz * doorDist * side;
    fig.scale.set(0.02, 0.02, 0.02);
    fig.rotation.y = frame.yaw + Math.PI * 0.85 * side;
    scene.add(fig);

    gsap.to(fig.scale, {
      x: 1,
      y: 1,
      z: 1,
      duration: 0.15,
      ease: 'power2.out',
      onComplete: () => {
        const tx = frame.cx + frame.rx * sidewalkDist * side;
        const tz = frame.cz + frame.rz * sidewalkDist * side;
        gsap.to(fig.position, {
          x: tx,
          z: tz,
          duration: 1.05,
          ease: 'power2.inOut',
          onComplete: () => {
            scene.remove(fig);
            fig.traverse((o) => {
              if (o instanceof THREE.Mesh) {
                o.geometry.dispose();
                const m = o.material;
                if (Array.isArray(m)) m.forEach((x) => x.dispose());
                else m.dispose();
              }
            });
            onComplete?.();
          },
        });
      },
    });
  }
}

export function createCheckpointStopSprite(label: string): THREE.Sprite {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = 'rgba(15,23,42,0.72)';
  ctx.fillRect(6, 6, 500, 116);
  ctx.strokeStyle = 'rgba(251,191,36,0.35)';
  ctx.lineWidth = 3;
  ctx.strokeRect(6, 6, 500, 116);
  ctx.fillStyle = '#fefce8';
  ctx.font = 'bold 28px system-ui,Segoe UI,sans-serif';
  ctx.fillText(label, 22, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  const spr = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
    }),
  );
  spr.center.set(0.5, 0);
  spr.scale.set(14, 3.5, 1);
  return spr;
}

/**
 * Marcadores flotantes en el borde de la calzada por cada checkpoint.
 */
export function addCheckpointStopMarkers(scene: THREE.Scene): THREE.Group[] {
  const groups: THREE.Group[] = [];
  const curve = getRoadCenterline();
  const up = new THREE.Vector3(0, 1, 0);
  const labels = STOP_MARKER_LABELS;

  for (let i = 0; i < CHECKPOINTS.length; i++) {
    const cp = CHECKPOINTS[i]!;
    const t = findTForWorldZ(cp.center.z);
    curve.getPointAt(t, tmp);
    curve.getTangentAt(t, tang);
    tang.y = 0;
    tang.normalize();
    right.crossVectors(up, tang).normalize();

    const g = new THREE.Group();
    const lateral = (i % 2 === 0 ? 1 : -1) * (ROAD_HALF_WIDTH + 4.2);
    const ox = tmp.x + right.x * lateral;
    const oz = tmp.z + right.z * lateral;

    const sprite = createCheckpointStopSprite(labels[i]!);
    sprite.position.set(ox, 5.2, oz);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.8, 8),
      new THREE.MeshStandardMaterial({
        color: cp.ringColor,
        roughness: 0.55,
        metalness: 0.15,
      }),
    );
    pole.position.set(ox, 2.4, oz);
    g.add(pole);
    g.add(sprite);
    scene.add(g);
    groups.push(g);
  }
  return groups;
}
