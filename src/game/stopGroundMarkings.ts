import * as THREE from 'three';
import { CHECKPOINTS } from '../track/config';
import { findTForWorldZ, getRoadCenterline } from '../track/roadPath';

const tmp = new THREE.Vector3();
const tang = new THREE.Vector3();
const right = new THREE.Vector3();

/**
 * Pose de la calzada en un Z del mundo: centro, yaw hacia la marcha y vector derecha en XZ.
 * Usado por marcas en suelo y por el spawner de monedas.
 */
export function getRoadFrameAtZ(zWorld: number): {
  cx: number;
  cz: number;
  yaw: number;
  rx: number;
  rz: number;
  /** Avance en XZ (tangente horizontal normalizada de la spline). */
  fx: number;
  fz: number;
} {
  const curve = getRoadCenterline();
  const t = findTForWorldZ(zWorld);
  curve.getPointAt(t, tmp);
  curve.getTangentAt(t, tang);
  tang.y = 0;
  if (tang.lengthSq() < 1e-8) {
    return { cx: tmp.x, cz: tmp.z, yaw: 0, rx: 1, rz: 0, fx: 0, fz: 1 };
  }
  tang.normalize();
  const fx = tang.x;
  const fz = tang.z;
  right.crossVectors(new THREE.Vector3(0, 1, 0), tang);
  if (right.lengthSq() < 1e-8) {
    right.set(1, 0, 0);
  } else {
    right.normalize();
  }
  const yaw = Math.atan2(-tang.x, -tang.z);
  return { cx: tmp.x, cz: tmp.z, yaw, rx: right.x, rz: right.z, fx, fz };
}

function createStopRoadTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 384;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);

  // Base “asfalto” oscuro bajo la pintura
  ctx.fillStyle = 'rgba(15,23,42,0.35)';
  ctx.fillRect(0, 0, c.width, c.height);

  // Panel rojo tipo señal circular proyectada en rectángulo (se lee lejos)
  const mx = 512;
  const my = 192;
  const rx = 420;
  const ry = 150;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(mx, my, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#b91c1c';
  ctx.fill();
  ctx.lineWidth = 18;
  ctx.strokeStyle = '#f5f5f4';
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = '#fef2f2';
  ctx.font = 'bold 200px system-ui,Segoe UI,sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText('STOP', mx, my + 6);
  ctx.fillText('STOP', mx, my + 6);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Marca cada parada con pintura en calzada + aro rojo tipo señal, alineado al rumbo de la pista.
 * Muy visible a velocidad; no sustituye al sistema de pasajeros (solo guía visual).
 */
export function addBusStopGroundMarkings(scene: THREE.Scene): THREE.Group[] {
  const groups: THREE.Group[] = [];
  const stopTex = createStopRoadTexture();
  const stopMat = new THREE.MeshBasicMaterial({
    map: stopTex,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: 2,
  });

  const ringOuter = 7.8;
  const ringInner = 5.1;
  const ringRed = new THREE.MeshBasicMaterial({
    color: 0xdc2626,
    transparent: true,
    opacity: 0.92,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: 1,
  });
  const ringWhite = new THREE.MeshBasicMaterial({
    color: 0xf5f5f4,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: 1,
  });

  for (let i = 0; i < CHECKPOINTS.length; i++) {
    const cp = CHECKPOINTS[i]!;
    // Ligeramente antes del centro del checkpoint para que el jugador vea la marca al llegar.
    const zMark = cp.center.z + 9;
    const frame = getRoadFrameAtZ(zMark);

    const g = new THREE.Group();
    g.position.set(frame.cx, 0.022, frame.cz);
    g.rotation.y = frame.yaw;

    const ring1 = new THREE.Mesh(new THREE.RingGeometry(ringInner, ringOuter, 72), ringRed);
    ring1.rotation.x = -Math.PI / 2;
    g.add(ring1);

    const ring2 = new THREE.Mesh(new THREE.RingGeometry(ringInner - 0.28, ringInner + 0.12, 72), ringWhite);
    ring2.rotation.x = -Math.PI / 2;
    g.add(ring2);

    const w = 9.2;
    const h = w * (384 / 1024);
    const stopPlane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), stopMat);
    // Ligera inclinación hacia “perspectiva” arcade (sigue leyendo como pintura en suelo).
    stopPlane.rotation.order = 'YXZ';
    stopPlane.rotation.y = 0;
    stopPlane.rotation.x = -Math.PI / 2 + 0.07;
    stopPlane.position.set(0, 0.035, -1.2);
    g.add(stopPlane);

    scene.add(g);
    groups.push(g);
  }

  return groups;
}
