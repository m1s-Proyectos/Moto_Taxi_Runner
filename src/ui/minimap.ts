import { CHECKPOINTS, MINIMAP } from '../track/config';
import { ROUTE_PREVIEW_XZ } from '../track/roadPath';

/** Tamaño de referencia (escritorio); en móvil `getMinimapCssSize` reduce proporcionalmente. */
const BASE_W = 168;
const BASE_H = 208;
const BASE_PAD = 10;

/**
 * Tamaño del minimapa en píxeles CSS según el viewport.
 * En móvil se reduce bastante para no tapar la vista ni los HUD centrados.
 */
function getMinimapCssSize(): { w: number; h: number } {
  if (typeof window === 'undefined') {
    return { w: BASE_W, h: BASE_H };
  }
  const iw = window.innerWidth;
  let w: number;
  if (iw < 340) w = 60;
  else if (iw < 380) w = 66;
  else if (iw < 420) w = 74;
  else if (iw < 480) w = 82;
  else if (iw < 640) w = 102;
  else if (iw < 900) w = 132;
  else w = BASE_W;
  const h = Math.round(w * (BASE_H / BASE_W));
  return { w, h };
}

function xzToUv(
  x: number,
  z: number,
  cw: number,
  ch: number,
  pad: number,
): { u: number; v: number } {
  const { xMin, xMax, zMin, zMax } = MINIMAP;
  const u = pad + ((x - xMin) / (xMax - xMin)) * (cw - 2 * pad);
  const v = pad + ((zMax - z) / (zMax - zMin)) * (ch - 2 * pad);
  return { u, v };
}

const CP_COLORS = ['#34d399', '#62b4ff', '#fbbf24'];

export function drawMinimap(
  canvas: HTMLCanvasElement,
  player: { x: number; z: number; rotY: number } | null,
  /** Centros y semiejes de vehículos en calzada (mismo orden que `OBSTACLES`). */
  obstacleFootprints: ReadonlyArray<{ cx: number; cz: number; hw: number; hd: number }>,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { w: CSS_W, h: CSS_H } = getMinimapCssSize();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(CSS_W * dpr) || canvas.height !== Math.round(CSS_H * dpr)) {
    canvas.width = Math.round(CSS_W * dpr);
    canvas.height = Math.round(CSS_H * dpr);
    canvas.style.width = `${CSS_W}px`;
    canvas.style.height = `${CSS_H}px`;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const cw = CSS_W;
  const ch = CSS_H;
  const scale = cw / BASE_W;
  const PAD = Math.max(5, Math.round(BASE_PAD * scale));

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = 'rgba(18,16,24,0.94)';
  ctx.fillRect(0, 0, cw, ch);

  for (const f of obstacleFootprints) {
    const p = xzToUv(f.cx, f.cz, cw, ch, PAD);
    const uw = (f.hw / (MINIMAP.xMax - MINIMAP.xMin)) * (cw - 2 * PAD);
    const uh = (f.hd / (MINIMAP.zMax - MINIMAP.zMin)) * (ch - 2 * PAD);
    ctx.fillStyle = 'rgba(251,146,60,0.75)';
    ctx.fillRect(p.u - uw * 0.5, p.v - uh * 0.5, uw, uh);
  }

  const roadW = Math.max(4, 10 * scale);
  ctx.strokeStyle = 'rgba(63,63,70,0.85)';
  ctx.lineWidth = roadW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ROUTE_PREVIEW_XZ.forEach((pt, i) => {
    const { u, v } = xzToUv(pt.x, pt.z, cw, ch, PAD);
    if (i === 0) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  });
  ctx.stroke();

  const dash = Math.max(2, 5 * scale);
  ctx.strokeStyle = 'rgba(251,191,36,0.65)';
  ctx.lineWidth = Math.max(1, 2 * scale);
  ctx.setLineDash([dash, dash]);
  ctx.beginPath();
  ROUTE_PREVIEW_XZ.forEach((pt, i) => {
    const { u, v } = xzToUv(pt.x, pt.z, cw, ch, PAD);
    if (i === 0) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  const cpR = 5 * scale;
  CHECKPOINTS.forEach((cp, i) => {
    const { u, v } = xzToUv(cp.center.x, cp.center.z, cw, ch, PAD);
    ctx.fillStyle = CP_COLORS[i] ?? '#a1a1aa';
    ctx.beginPath();
    ctx.arc(u, v, cpR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  if (player) {
    const { u, v } = xzToUv(player.x, player.z, cw, ch, PAD);
    ctx.save();
    ctx.translate(u, v);
    ctx.rotate(-player.rotY);
    ctx.fillStyle = '#fafafa';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const pr = 7 * scale;
    const pw = 4.5 * scale;
    const pb = 6 * scale;
    ctx.moveTo(0, -pr);
    ctx.lineTo(-pw, pb);
    ctx.lineTo(pw, pb);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
