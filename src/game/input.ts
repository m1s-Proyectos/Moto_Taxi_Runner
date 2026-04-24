export type InputState = {
  throttle: number;
  brake: number;
  steer: number;
};

const keys = new Set<string>();

let pointerDriving = false;
let pointerSteer = 0;

/** Mando en pantalla: izq. / dcha. (giro) y adelante (acelerar); independiente por botón, multitacto. */
let padLeft = false;
let padRight = false;
let padForward = false;

/** Giro con posición del ratón sobre el lienzo (PC con puntero fino; sin acelerar solo). */
let mouseAimSteer = 0;
let useMouseAim = false;

/** Inclinación del dispositivo: giro + adelantar/retroceder (móvil; requiere activar y permisos en iOS). */
let tiltInputOn = false;
let tiltRefBeta: number | null = null;
let tiltSteer = 0;
let tiltThrottle = 0;
let tiltBrake = 0;
let tiltHandler: ((e: DeviceOrientationEvent) => void) | null = null;
let motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
let tiltHandlerAttached = false;
let motionHandlerAttached = false;
let orientationSteer = 0;
let motionSteer = 0;
const MOTION_SMOOTH = 0.72;
const MOTION_RATE_SCALE = 0.00085;

function readSteerKeys(): number {
  let s = 0;
  if (keys.has('a') || keys.has('arrowleft')) s -= 1;
  if (keys.has('d') || keys.has('arrowright')) s += 1;
  return s;
}

function readThrottleKeys(): number {
  return keys.has('w') || keys.has('arrowup') ? 1 : 0;
}

function readBrakeKeys(): number {
  return keys.has('s') || keys.has('arrowdown') ? 1 : 0;
}

export function attachKeyboard(): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.repeat) return;
    keys.add(e.key.toLowerCase());
  };
  const up = (e: KeyboardEvent) => {
    keys.delete(e.key.toLowerCase());
  };
  window.addEventListener('keydown', down);
  window.addEventListener('keyup', up);
  return () => {
    window.removeEventListener('keydown', down);
    window.removeEventListener('keyup', up);
  };
}

/** Conducción con ratón o dedo: mantén pulsado sobre el juego = acelera; mueve izquierda/derecha = gira. */
export function attachPointerDriver(el: HTMLElement): () => void {
  const updateSteer = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    pointerSteer = Math.max(-1, Math.min(1, (nx - 0.5) * 2.4));
  };

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    pointerDriving = true;
    updateSteer(e);
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onMove = (e: PointerEvent) => {
    if (!pointerDriving) return;
    updateSteer(e);
  };

  const end = (e: PointerEvent) => {
    if (!pointerDriving) return;
    pointerDriving = false;
    pointerSteer = 0;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const onCtx = (e: Event) => e.preventDefault();

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);
  el.addEventListener('contextmenu', onCtx);

  return () => {
    pointerDriving = false;
    pointerSteer = 0;
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', end);
    el.removeEventListener('pointercancel', end);
    el.removeEventListener('lostpointercapture', end);
    el.removeEventListener('contextmenu', onCtx);
  };
}

/**
 * En portrait `gamma` suele ser el balanceo izq/der. En apaisado el mismo giro físico
 * a menudo mueve `beta` hacia/ desde 90 (y `gamma` a veces ~0) — se combina beta+gamma.
 */
function orientationSteerFromTilt(b: number | null, g: number | null): number {
  if (b == null && g == null) return 0;
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const isLandscape = w > 0 && h > 0 && w > h;
  if (isLandscape) {
    const gVal = g ?? 0;
    if (b != null && Math.abs(gVal) < 3.2) {
      return Math.max(-1, Math.min(1, -(b - 90) / 25));
    }
    const gPart = (gVal / 30) * 0.65;
    const bPart = b != null ? (-(b - 90) / 30) * 0.6 : 0;
    return Math.max(-1, Math.min(1, gPart + bPart));
  }
  if (g != null) {
    return Math.max(-1, Math.min(1, g / 32));
  }
  return b != null ? Math.max(-1, Math.min(1, -(b - 90) / 36)) : 0;
}

function updateTiltFromOrientation(e: DeviceOrientationEvent): void {
  if (!tiltInputOn) {
    tiltSteer = 0;
    tiltThrottle = 0;
    tiltBrake = 0;
    return;
  }
  const b = e.beta;
  const g = e.gamma;
  if (b == null && g == null) return;

  if (b != null) {
    if (tiltRefBeta === null) tiltRefBeta = b;
    const db = b - tiltRefBeta;
    const backDeg = 6;
    if (db > backDeg) {
      tiltBrake = Math.min(1, (db - backDeg) / 22);
      tiltThrottle = 0;
    } else {
      tiltBrake = 0;
      tiltThrottle = 1;
    }
  } else {
    tiltBrake = 0;
    /** Sin beta: solo eje de giro (poco habitual); mantiene avance. */
    tiltThrottle = g != null ? 1 : 0;
  }

  orientationSteer = orientationSteerFromTilt(b, g);
  mergeTiltSteerValue();
}

function mergeTiltSteerValue(): void {
  if (!tiltInputOn) {
    tiltSteer = 0;
    return;
  }
  tiltSteer = Math.max(
    -1,
    Math.min(1, orientationSteer * 0.8 + Math.max(-1, Math.min(1, motionSteer * 0.9)) * 0.5),
  );
}

function updateTiltFromMotion(e: DeviceMotionEvent): void {
  if (!tiltInputOn) {
    motionSteer = 0;
    return;
  }
  const rr = e.rotationRate;
  if (!rr) return;
  const w = typeof window !== 'undefined' && window.innerWidth > window.innerHeight;
  const raw =
    w && (rr.gamma == null || Math.abs(rr.gamma) < 1.2)
      ? (rr.beta ?? 0) * 0.55 + (rr.gamma ?? 0) * 0.35
      : (rr.gamma ?? 0);
  const t = raw * MOTION_RATE_SCALE;
  motionSteer = motionSteer * MOTION_SMOOTH + t * (1 - MOTION_SMOOTH);
  motionSteer = Math.max(-1, Math.min(1, motionSteer));
  mergeTiltSteerValue();
}

function ensureTiltListener(): void {
  if (tiltHandlerAttached) return;
  tiltHandler = (e) => updateTiltFromOrientation(e);
  window.addEventListener('deviceorientation', tiltHandler, { passive: true } as AddEventListenerOptions);
  tiltHandlerAttached = true;
}

function ensureMotionListener(): void {
  if (motionHandlerAttached) return;
  motionHandler = (e) => updateTiltFromMotion(e);
  window.addEventListener('devicemotion', motionHandler, { passive: true } as AddEventListenerOptions);
  motionHandlerAttached = true;
}

/** Inclina el dispositivo: activa el listener; en iOS 13+ hay que pedir permiso antes. */
export function setTiltInputOn(on: boolean): void {
  tiltInputOn = on;
  if (on) {
    ensureTiltListener();
    ensureMotionListener();
  } else {
    orientationSteer = 0;
    motionSteer = 0;
    tiltSteer = 0;
    tiltThrottle = 0;
    tiltBrake = 0;
  }
}

export function setTiltRecalibrationPending(): void {
  tiltRefBeta = null;
}

/**
 * iOS 13+ Safari: orientación y movimiento requieren permisos distintos; pide ambos.
 */
export async function requestTiltPermissionIfNeeded(): Promise<boolean> {
  const D = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<PermissionState> };
  const M = DeviceMotionEvent as unknown as { requestPermission?: () => Promise<PermissionState> };
  if (typeof D.requestPermission === 'function') {
    const o = await D.requestPermission();
    if (o !== 'granted') return false;
  }
  if (typeof M.requestPermission === 'function') {
    const m = await M.requestPermission();
    if (m !== 'granted') return false;
  }
  return true;
}

export function disposeTiltListener(): void {
  if (tiltHandler && tiltHandlerAttached) {
    window.removeEventListener('deviceorientation', tiltHandler);
  }
  if (motionHandler && motionHandlerAttached) {
    window.removeEventListener('devicemotion', motionHandler);
  }
  tiltHandler = null;
  motionHandler = null;
  tiltHandlerAttached = false;
  motionHandlerAttached = false;
  setTiltInputOn(false);
  tiltRefBeta = null;
}

/**
 * Raton sobre el lienzo: posición X → giro (puntero fino: PC). S/A/D se suman; acelerar sigue con W o clic.
 */
export function attachMouseAim(el: HTMLElement): () => void {
  const can = (): boolean =>
    typeof window !== 'undefined' &&
    window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  const onMove = (e: MouseEvent) => {
    if (!can()) return;
    const r = el.getBoundingClientRect();
    if (r.width < 8) return;
    const nx = (e.clientX - r.left) / r.width;
    mouseAimSteer = Math.max(-1, Math.min(1, (nx - 0.5) * 2.4));
    useMouseAim = true;
  };
  const onEnter = () => {
    if (can()) useMouseAim = true;
  };
  const onLeave = () => {
    useMouseAim = false;
    mouseAimSteer = 0;
  };

  el.addEventListener('mousemove', onMove);
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);

  return () => {
    useMouseAim = false;
    mouseAimSteer = 0;
    el.removeEventListener('mousemove', onMove);
    el.removeEventListener('mouseenter', onEnter);
    el.removeEventListener('mouseleave', onLeave);
  };
}

export function pollInput(): InputState {
  const kSteer = readSteerKeys();
  const kThrottle = readThrottleKeys();
  const kBrake = readBrakeKeys();

  const pSteer = padSteerValue();
  const pThrottle = padForward ? 1 : 0;
  const ptrSteer = pointerDriving ? pointerSteer : 0;
  const aim = useMouseAim ? mouseAimSteer : 0;
  const tS = tiltInputOn ? tiltSteer : 0;
  const steer = Math.max(-1, Math.min(1, kSteer + pSteer + ptrSteer + aim + tS));
  const throttle = Math.max(kThrottle, pThrottle, pointerDriving ? 1 : 0, tiltInputOn ? tiltThrottle : 0);
  const brake = Math.max(kBrake, tiltInputOn ? tiltBrake : 0);

  return {
    throttle,
    brake,
    steer,
  };
}

function padSteerValue(): number {
  let s = 0;
  if (padLeft) s -= 1;
  if (padRight) s += 1;
  return Math.max(-1, Math.min(1, s));
}

/**
 * Tres botones: adelante (acelerar), izquierda, derecha. El giro aplica al eje de la moto
 * (yaw; la física ya usa `steer` respecto a la orientación hacia adelante).
 */
export function attachTouchPad(els: {
  forward: HTMLElement;
  left: HTMLElement;
  right: HTMLElement;
}): () => void {
  const downF = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      els.forward.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    padForward = true;
  };
  const upF = (e: PointerEvent) => {
    padForward = false;
    try {
      els.forward.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const downL = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      els.left.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    padLeft = true;
  };
  const upL = (e: PointerEvent) => {
    padLeft = false;
    try {
      els.left.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const downR = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try {
      els.right.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    padRight = true;
  };
  const upR = (e: PointerEvent) => {
    padRight = false;
    try {
      els.right.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const loseF = () => {
    padForward = false;
  };
  const loseL = () => {
    padLeft = false;
  };
  const loseR = () => {
    padRight = false;
  };

  els.forward.addEventListener('pointerdown', downF);
  els.forward.addEventListener('pointerup', upF);
  els.forward.addEventListener('pointercancel', upF);
  els.forward.addEventListener('lostpointercapture', loseF);
  els.left.addEventListener('pointerdown', downL);
  els.left.addEventListener('pointerup', upL);
  els.left.addEventListener('pointercancel', upL);
  els.left.addEventListener('lostpointercapture', loseL);
  els.right.addEventListener('pointerdown', downR);
  els.right.addEventListener('pointerup', upR);
  els.right.addEventListener('pointercancel', upR);
  els.right.addEventListener('lostpointercapture', loseR);

  return () => {
    padLeft = false;
    padRight = false;
    padForward = false;
    els.forward.removeEventListener('pointerdown', downF);
    els.forward.removeEventListener('pointerup', upF);
    els.forward.removeEventListener('pointercancel', upF);
    els.forward.removeEventListener('lostpointercapture', loseF);
    els.left.removeEventListener('pointerdown', downL);
    els.left.removeEventListener('pointerup', upL);
    els.left.removeEventListener('pointercancel', upL);
    els.left.removeEventListener('lostpointercapture', loseL);
    els.right.removeEventListener('pointerdown', downR);
    els.right.removeEventListener('pointerup', upR);
    els.right.removeEventListener('pointercancel', upR);
    els.right.removeEventListener('lostpointercapture', loseR);
  };
}
