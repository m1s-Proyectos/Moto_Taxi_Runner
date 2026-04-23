import { CHECKPOINTS, MINIMAP, OBSTACLES, ROUTE_PREVIEW_XZ } from '../track/config';

const CSS_W = 168;
const CSS_H = 208;
const PAD = 10;

function xzToUv(x: number, z: number, cw: number, ch: number): { u: number; v: number } {
  const { xMin, xMax, zMin, zMax } = MINIMAP;
  const u = PAD + ((x - xMin) / (xMax - xMin)) * (cw - 2 * PAD);
  const v = PAD + ((zMax - z) / (zMax - zMin)) * (ch - 2 * PAD);
  return { u, v };
}

const CP_COLORS = ['#34d399', '#62b4ff', '#fbbf24'];

export function drawMinimap(
  canvas: HTMLCanvasElement,
  player: { x: number; z: number; rotY: number } | null,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

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

  ctx.clearRect(0, 0, cw, ch);
  ctx.fillStyle = 'rgba(18,16,24,0.94)';
  ctx.fillRect(0, 0, cw, ch);

  for (const o of OBSTACLES) {
    const cx = (o.min.x + o.max.x) * 0.5;
    const cz = (o.min.z + o.max.z) * 0.5;
    const hw = (o.max.x - o.min.x) * 0.5;
    const hd = (o.max.z - o.min.z) * 0.5;
    const p = xzToUv(cx, cz, cw, ch);
    const uw = (hw / (MINIMAP.xMax - MINIMAP.xMin)) * (cw - 2 * PAD);
    const uh = (hd / (MINIMAP.zMax - MINIMAP.zMin)) * (ch - 2 * PAD);
    ctx.fillStyle = 'rgba(251,146,60,0.75)';
    ctx.fillRect(p.u - uw * 0.5, p.v - uh * 0.5, uw, uh);
  }

  ctx.strokeStyle = 'rgba(63,63,70,0.85)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ROUTE_PREVIEW_XZ.forEach((pt, i) => {
    const { u, v } = xzToUv(pt.x, pt.z, cw, ch);
    if (i === 0) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  });
  ctx.stroke();

  ctx.strokeStyle = 'rgba(251,191,36,0.65)';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ROUTE_PREVIEW_XZ.forEach((pt, i) => {
    const { u, v } = xzToUv(pt.x, pt.z, cw, ch);
    if (i === 0) ctx.moveTo(u, v);
    else ctx.lineTo(u, v);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  CHECKPOINTS.forEach((cp, i) => {
    const { u, v } = xzToUv(cp.center.x, cp.center.z, cw, ch);
    ctx.fillStyle = CP_COLORS[i] ?? '#a1a1aa';
    ctx.beginPath();
    ctx.arc(u, v, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  if (player) {
    const { u, v } = xzToUv(player.x, player.z, cw, ch);
    ctx.save();
    ctx.translate(u, v);
    ctx.rotate(-player.rotY);
    ctx.fillStyle = '#fafafa';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(-4.5, 6);
    ctx.lineTo(4.5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
